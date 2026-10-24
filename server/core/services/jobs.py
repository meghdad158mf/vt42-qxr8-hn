#!/usr/bin/env python3
"""زمان‌بند و «اجرای دستی» کارهای خودکار روی سرور خودمان (جانشین pg_cron + run-job + گیت‌هاب).

- برنامه‌ی هر کار از jobs.json (همان cronهای migration_040، ساعت UTC) و فقط کارهای نقش این سرور.
- هر اجرا = همان اسکریپت scripts/*.py با توکن مدیرِ کوتاه‌عمر (JARYAN_SERVICE_TOKEN) — رمز مدیر
  هیچ‌جا ذخیره نمی‌شود؛ گزارش هر اجرا در /var/lib/jaryan/jobs/logs و سابقه در jobs.db (sqlite).
- /functions/v1/run-job با همان ورودی/خروجی تابع Supabase تا صفحه‌ی «وضعیت سامانه» بدون تغییر
  کار کند: {job} اجرای دستی، {action:'status'|'logs'|'health'}.
- /functions/v1/notify و بررسی هر ۳۰ دقیقه: هشدار قرمز با پیامک به مدیر (تصمیم کاربر، جای ایمیل).
"""
import datetime as dt
import hashlib
import hmac
import http.server
import json
import os
import shutil
import signal
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import srvlib as S  # noqa: E402

REL = os.path.dirname(HERE)
LISTEN = os.environ.get("JARYAN_JOBS_LISTEN", "127.0.0.1:8094")
STATE = os.environ.get("JARYAN_JOBS_STATE", S.ROOT + "/var/lib/jaryan/jobs")
API = os.environ.get("JARYAN_API_BASE", "http://127.0.0.1")
CONF = json.load(open(os.path.join(REL, "jobs.json"), encoding="utf-8"))
JOBS = CONF["jobs"]
LIARA_BASE_URL = "https://ai.liara.ir/api/6a9271a1d6564b043acdefe1/v1"
_lock = threading.Lock()
_running = {}                       # job -> Popen


# ---------------------------------------------------------------- پیکربندی

def server_conf():
    try:
        with open(S.ETC + "/server.json", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def role():
    return server_conf().get("role", "iran")


def jwt_secret():
    return S.service_env().get("JWT_SECRET") or S.load_secrets()["jwt_secret"]


def anon_key():
    return S.service_env().get("ANON_KEY") or S.load_secrets()["anon_key"]


def admin_token(minutes=60):
    return S.make_jwt({"role": "app_admin", "iss": "jaryan-jobs", "exp": int(time.time()) + minutes * 60}, jwt_secret())


def now_iso(t=None):
    return dt.datetime.fromtimestamp(t or time.time(), dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------- سابقه (sqlite)

def db():
    os.makedirs(STATE + "/logs", exist_ok=True)
    c = sqlite3.connect(STATE + "/jobs.db", timeout=30)
    c.row_factory = sqlite3.Row
    c.execute("""create table if not exists runs (id integer primary key, job text, event text, status text,
                 conclusion text, created_at real, updated_at real, log text)""")
    c.execute("create index if not exists runs_job on runs(job, created_at)")
    c.execute("""create table if not exists alerts (key text primary key, level text, text text,
                 first_at real, last_sent real, active integer)""")
    return c


# ---------------------------------------------------------------- cron

def _field(spec, lo, hi):
    out = set()
    for part in spec.split(","):
        step = 1
        if "/" in part:
            part, s = part.split("/", 1)
            step = int(s)
        if part in ("*", ""):
            a, b = lo, hi
        elif "-" in part:
            a, b = (int(x) for x in part.split("-", 1))
        else:
            a = b = int(part)
        out.update(range(a, b + 1, step))
    return out


def cron_match(expr, t):
    mi, ho, dom, mon, dow = expr.split()
    wd = (t.weekday() + 1) % 7                       # یکشنبه = ۰ مثل cron
    days = _field(dow, 0, 7)
    return (t.minute in _field(mi, 0, 59) and t.hour in _field(ho, 0, 23) and t.month in _field(mon, 1, 12)
            and t.day in _field(dom, 1, 31) and (wd in days or (wd == 0 and 7 in days)))


# ---------------------------------------------------------------- اجرای کار

def pylib_path():
    v = f"cp{sys.version_info.major}{sys.version_info.minor}"
    return ":".join(p for p in (os.path.join(REL, "pylib", v), os.path.join(REL, "pylib", "common")) if os.path.isdir(p))


def job_env(job):
    sc = server_conf()
    env = {
        "PATH": "/usr/local/bin:/usr/bin:/bin",
        "HOME": STATE,
        "LANG": "C.UTF-8",
        "PYTHONUNBUFFERED": "1",
        "PYTHONPATH": pylib_path(),
        "SUPABASE_URL": API,
        "SUPABASE_ANON_KEY": anon_key(),
        "SUPABASE_PUBLIC_URL": sc.get("public_url", ""),
        "JARYAN_SERVICE_TOKEN": admin_token(JOBS[job]["timeout"] // 60 + 30),
        "JARYAN_SERVER_ROLE": sc.get("role", "iran"),
    }
    for k in ("TG_API_ID", "TG_API_HASH", "TG_SESSION", "HTTPS_PROXY", "HTTP_PROXY"):
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env


def start_run(job, event):
    """اجرای یک کار در پس‌زمینه؛ None اگر همین الان در حال اجراست."""
    with _lock:
        if job in _running:
            return None
        c = db()
        cur = c.execute("insert into runs (job, event, status, created_at, updated_at) values (?,?,?,?,?)",
                        (job, event, "in_progress", time.time(), time.time()))
        rid = cur.lastrowid
        log = f"{STATE}/logs/{rid}-{job}.log"
        c.execute("update runs set log=? where id=?", (log, rid))
        c.commit()
        _running[job] = True
    threading.Thread(target=_run, args=(job, rid, log), daemon=True).start()
    return rid


def _run(job, rid, log):
    spec = JOBS[job]
    conclusion = "failure"
    try:
        with open(log, "w", encoding="utf-8") as f:
            f.write(f"{now_iso()} ▶ Run python {spec['script']}\n")
            f.flush()
            p = subprocess.Popen([sys.executable, "-u", os.path.join(REL, spec["script"])], cwd=REL,
                                 env=job_env(job), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                 text=True, errors="replace", start_new_session=True)
            with _lock:
                _running[job] = p
            deadline = time.time() + spec["timeout"]
            killer = threading.Timer(spec["timeout"], lambda: _kill(p))
            killer.start()
            for line in p.stdout:
                f.write(f"{now_iso()} {line.rstrip()[:2000]}\n")
                f.flush()
            rc = p.wait()
            killer.cancel()
            if time.time() >= deadline:
                f.write(f"{now_iso()} ✘ زمان مجاز ({spec['timeout'] // 60} دقیقه) تمام شد؛ کار متوقف شد.\n")
                conclusion = "cancelled"
            else:
                conclusion = "success" if rc == 0 else "failure"
                f.write(f"{now_iso()} {'✔' if rc == 0 else '✘'} پایان با کد {rc}\n")
    except Exception as e:  # noqa: BLE001
        with open(log, "a", encoding="utf-8") as f:
            f.write(f"{now_iso()} ✘ اجرا ممکن نشد: {e}\n")
    finally:
        c = db()
        c.execute("update runs set status='completed', conclusion=?, updated_at=? where id=?", (conclusion, time.time(), rid))
        c.commit()
        with _lock:
            _running.pop(job, None)


def _kill(p):
    try:
        os.killpg(p.pid, signal.SIGTERM)
        time.sleep(10)
        os.killpg(p.pid, signal.SIGKILL)
    except OSError:
        pass


# ---------------------------------------------------------------- run-job (همان قالب تابع Supabase)

def brief(r):
    return {"status": r["status"], "conclusion": r["conclusion"], "event": r["event"],
            "created_at": now_iso(r["created_at"]), "updated_at": now_iso(r["updated_at"])}


def status():
    c = db()
    since = time.time() - 30 * 3600
    runs, hist = {}, {}
    for job in JOBS:
        rows = c.execute("select * from runs where job=? order by created_at desc limit 40", (job,)).fetchall()
        runs[job] = brief(rows[0]) if rows else None
        hist[job] = [brief(r) for r in rows if r["created_at"] >= since]
    return {"runs": runs, "history": hist}


def job_logs(job, max_lines=60):
    c = db()
    rows = c.execute("select * from runs where job=? order by created_at desc limit 10", (job,)).fetchall()
    running = bool(rows) and rows[0]["status"] != "completed"
    run = next((r for r in rows if r["status"] == "completed"), None)
    if not run:
        return {"running": running, "run": None, "lines": []}
    try:
        with open(run["log"], encoding="utf-8", errors="replace") as f:
            lines = [ln.rstrip("\n") for ln in f if ln.strip()]
    except OSError:
        lines = []
    info = dict(brief(run), html_url=None)
    out = []
    for ln in lines[-max_lines:]:
        t, _, text = ln.partition(" ")
        out.append({"t": t if t.endswith("Z") else None, "text": text[:500] if t.endswith("Z") else ln[:500]})
    return {"running": running, "run": info, "job": JOBS[job]["name"], "truncated": len(lines) > max_lines,
            "lines": out}


def timed(url, ok, method="GET", headers=None, body=None, timeout=12):
    t0 = time.time()
    try:
        r = urllib.request.Request(url, data=body, method=method,
                                   headers=dict({"User-Agent": "Mozilla/5.0 (jaryan-health)"}, **(headers or {})))
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            st = resp.status
            resp.read(1024)
    except urllib.error.HTTPError as e:
        st = e.code
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "status": 0, "ms": int((time.time() - t0) * 1000),
                "detail": "timeout" if "timed out" in str(e) else str(e)[:160]}
    return {"ok": ok(st), "status": st, "ms": int((time.time() - t0) * 1000), "detail": ""}


def health():
    key = os.environ.get("LIARA_API_KEY", "")
    checks = {
        "liara": lambda: timed(f"{LIARA_BASE_URL}/chat/completions", lambda s: 200 <= s < 300, "POST",
                               {"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
                               json.dumps({"model": "openai/gpt-4o-mini", "max_tokens": 1,
                                           "messages": [{"role": "user", "content": "ok"}]}).encode()),
        "github": lambda: dict(timed("https://api.github.com/", lambda s: s < 500), remaining=None),
        "eitaa": lambda: timed("https://eitaa.com/", lambda s: s < 500),
        "bale": lambda: timed("https://ble.ir/", lambda s: s < 500),
        "jaaar": lambda: timed("https://www.jaaar.com/kiosk", lambda s: s < 500),
        "telegram": lambda: timed("https://t.me/", lambda s: s < 500),
    }
    out = {}
    threads = [threading.Thread(target=lambda k=k, f=f: out.__setitem__(k, f())) for k, f in checks.items()]
    for t in threads:
        t.start()
    for t in threads:
        t.join(20)
    return {"services": out}


# ---------------------------------------------------------------- پیامک و هشدار

def rest(path):
    r = urllib.request.Request(API + "/rest/v1" + path, headers={
        "apikey": anon_key(), "Authorization": "Bearer " + admin_token(10), "Prefer": "count=exact"})
    with urllib.request.urlopen(r, timeout=30) as resp:
        rng = resp.headers.get("Content-Range", "")
        return json.loads(resp.read() or b"null"), (int(rng.rsplit("/", 1)[1]) if "/" in rng and not rng.endswith("*") else None)


def alert_conf():
    try:
        out = S.psql("select jaryan_meta.alert_config()").strip()
        return json.loads(out) if out else {}
    except S.DbError:
        return {}


def sms_send(text, to=None):
    """پیامک هشدار با ملی‌پیامک: اگر شماره‌ی الگو برای هشدار تنظیم شده با «ارسال با الگو»، وگرنه «ارسال ساده» با خط فرستنده."""
    cf = alert_conf()
    key = cf.get("key") or ""
    phones = to or [p for p in (cf.get("to") or "").replace("،", ",").split(",") if p.strip()]
    if not key or not phones:
        return {"ok": False, "error": "پیامک هشدار تنظیم نشده است (کلید وب‌سرویس یا گیرنده)."}
    results = []
    for ph in phones:
        ph = ph.strip()
        if cf.get("body_id"):
            url = f"https://console.melipayamak.com/api/send/shared/{key}"
            body = {"bodyId": int(cf["body_id"]), "to": ph, "args": [text[:300]]}
        else:
            url = f"https://console.melipayamak.com/api/send/simple/{key}"
            body = {"from": cf.get("from") or "", "to": ph, "text": text}
        try:
            r = urllib.request.Request(url, data=json.dumps(body, ensure_ascii=False).encode(), method="POST",
                                       headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(r, timeout=20) as resp:
                results.append({"to": ph[-4:], "status": resp.status, "reply": resp.read(300).decode("utf-8", "replace")})
        except urllib.error.HTTPError as e:
            results.append({"to": ph[-4:], "status": e.code, "reply": e.read(300).decode("utf-8", "replace")})
        except Exception as e:  # noqa: BLE001
            results.append({"to": ph[-4:], "status": 0, "reply": str(e)[:200]})
    ok = all(200 <= x["status"] < 300 and "خطا" not in x["reply"] for x in results)
    return {"ok": ok, "results": results}


def collect_problems():
    """فقط موارد قرمز (همان سیاست notify سوپابیس)."""
    probs = {}
    sc = server_conf()
    import link
    linked = role() == "iran" and bool(link.key() and sc.get("link_enabled"))
    for f in CONF["freshness"]:
        job = f["job"]
        here = role() in JOBS[job]["roles"]
        if not here and not (job == "telegram" and linked):
            continue
        try:
            rows, _ = rest(f["path"])
            v = rows[0][f["col"]] if rows else None
        except Exception:  # noqa: BLE001
            continue
        if v:
            age = (time.time() - dt.datetime.fromisoformat(v.replace("Z", "+00:00")).timestamp()) / 3600
            if age >= f["bad"]:
                probs["job:" + job] = f"{JOBS[job]['name']}: {int(age)} ساعت بی‌خروجی"
    c = db()
    for job, spec in JOBS.items():
        if role() not in spec["roles"]:
            continue
        r = c.execute("select * from runs where job=? and status='completed' order by created_at desc limit 1", (job,)).fetchone()
        if r and r["conclusion"] != "success":
            probs["run:" + job] = f"{spec['name']}: آخرین اجرا ناموفق"
    du = shutil.disk_usage(S.ROOT + "/var/lib" if os.path.isdir(S.ROOT + "/var/lib") else "/")
    pct = du.used * 100 // du.total
    if pct >= 85:
        probs["disk"] = f"دیسک سرور {pct}٪ پر است"
    try:
        since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=24)).isoformat()
        _, n = rest("/login_events?select=id&success=is.false&blocked=is.false&limit=1&created_at=gte." + urllib.parse.quote(since))
        if n and n >= 20:
            probs["logins"] = f"{n} ورود ناموفق در ۲۴ ساعت"
    except Exception:  # noqa: BLE001
        pass
    lk = link.state().get("last_ingest")
    if linked and (not lk or time.time() - lk > 3 * 3600):
        probs["link"] = "پیوند با سرور خارجی بیش از ۳ ساعت قطع است"
    return probs


def notify_check(send=True):
    probs = collect_problems()
    c = db()
    t = time.time()
    new, remind, resolved = [], [], []
    for key, text in probs.items():
        row = c.execute("select * from alerts where key=?", (key,)).fetchone()
        if not row or not row["active"]:
            new.append(text)
            c.execute("insert or replace into alerts values (?,?,?,?,?,1)", (key, "red", text, t, t))
        elif t - (row["last_sent"] or 0) >= 12 * 3600:
            remind.append(text)
            c.execute("update alerts set last_sent=?, text=? where key=?", (t, text, key))
    for row in c.execute("select * from alerts where active=1").fetchall():
        if row["key"] not in probs:
            resolved.append(row["text"])
            c.execute("update alerts set active=0 where key=?", (row["key"],))
    c.commit()
    res = None
    if send and (new or remind):
        parts = ["جریان — هشدار:"] + [f"• {x}" for x in new + remind]
        if resolved:
            parts.append("برطرف شد: " + "، ".join(resolved))
        res = sms_send("\n".join(parts))
    return {"problems": list(probs.values()), "new": new, "reminders": remind, "resolved": resolved, "sms": res}


def notify_daily():
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=24)).isoformat()
    try:
        _, n_posts = rest("/posts?select=id&limit=1&scraped_at=gte." + urllib.parse.quote(since))
    except Exception:  # noqa: BLE001
        n_posts = None
    c = db()
    rows = c.execute("select conclusion from runs where created_at>=?", (time.time() - 86400,)).fetchall()
    bad = sum(1 for r in rows if r["conclusion"] not in ("success", None))
    probs = collect_problems()
    text = (f"جریان — گزارش روزانه\nمطلب تازه: {n_posts if n_posts is not None else '؟'}\n"
            f"اجرای کارها: {len(rows)}، ناموفق: {bad}\n"
            + ("همه‌چیز سالم است." if not probs else "نیازمند توجه: " + "، ".join(probs.values())))
    return {"text": text, "sms": sms_send(text)}


def capacity():
    try:
        S.psql("select public.capacity_snapshot_job()")
    except S.DbError as e:
        print("capacity:", str(e)[:300], file=sys.stderr)


def housekeeping():
    c = db()
    old = time.time() - 30 * 86400
    for r in c.execute("select log from runs where created_at < ?", (old,)).fetchall():
        try:
            os.remove(r["log"])
        except (OSError, TypeError):
            pass
    c.execute("delete from runs where created_at < ?", (old,))
    c.commit()


def internal(name):
    try:
        if name == "capacity":
            capacity()
        elif name == "notify-check":
            if alert_conf().get("on"):
                notify_check()
        elif name == "notify-daily":
            if alert_conf().get("on"):
                notify_daily()
        elif name == "link-sync":
            import link
            link.tick()
        elif name == "housekeeping":
            housekeeping()
    except Exception as e:  # noqa: BLE001
        print(f"internal {name}:", str(e)[:500], file=sys.stderr, flush=True)


# ---------------------------------------------------------------- زمان‌بند

def scheduler():
    last = None
    while True:
        t = dt.datetime.now(dt.timezone.utc).replace(second=0, microsecond=0)
        if t != last:
            last = t
            r = role()
            for job, spec in JOBS.items():
                if r in spec["roles"] and any(cron_match(e, t) for e in spec["cron"]):
                    start_run(job, "schedule")
            for name, spec in CONF["internal"].items():
                if r in spec["roles"] and any(cron_match(e, t) for e in spec["cron"]):
                    threading.Thread(target=internal, args=(name,), daemon=True).start()
        time.sleep(5)


# ---------------------------------------------------------------- HTTP

class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "jaryan-jobs"

    def log_message(self, fmt, *args):
        pass

    def reply(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "authorization, apikey, content-type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def is_admin(self):
        auth = self.headers.get("Authorization", "")
        tok = auth[7:] if auth.lower().startswith("bearer ") else ""
        try:
            head, body, sig = tok.split(".")
            want = S.b64url(hmac.new(jwt_secret().encode(), f"{head}.{body}".encode(), hashlib.sha256).digest())
            p = json.loads(S.b64url_decode(body))
            return hmac.compare_digest(want, sig) and p.get("role") == "app_admin" and p.get("exp", 0) > time.time()
        except (ValueError, TypeError):
            return False

    def link(self, method):
        import link
        u = urllib.parse.urlsplit(self.path)
        n = int(self.headers.get("Content-Length") or 0)
        if n > 80 * 1024 * 1024:
            return self.reply(413, {"error": "too large"})
        body = self.rfile.read(n) if n else b""
        try:
            code, obj = link.handle(method, u.path, self.headers, body, urllib.parse.parse_qs(u.query))
        except Exception as e:  # noqa: BLE001
            code, obj = 500, {"error": str(e)[:300]}
        self.reply(code, obj)

    def do_GET(self):
        if self.path == "/health":
            return self.reply(200, {"ok": True, "role": role()})
        if self.path.startswith("/link/v1/"):
            return self.link("GET")
        self.reply(404, {"error": "not found"})

    def do_POST(self):
        if self.path.startswith("/link/v1/"):
            return self.link("POST")
        path = urllib.parse.urlsplit(self.path).path.rstrip("/")
        n = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(min(n, 65536)) or b"{}")
        except ValueError:
            return self.reply(400, {"error": "invalid json"})
        if path.endswith("/run-job"):
            job, action = body.get("job"), body.get("action")
            if action is not None and action not in ("status", "health", "logs"):
                return self.reply(400, {"error": "unknown action"})
            if action not in ("status", "health") and not (isinstance(job, str) and job in JOBS):
                return self.reply(400, {"error": "unknown job"})
            if not self.is_admin():
                return self.reply(403, {"error": "admin only"})
            if action == "status":
                return self.reply(200, status())
            if action == "health":
                return self.reply(200, health())
            if action == "logs":
                return self.reply(200, job_logs(job))
            if role() not in JOBS[job]["roles"]:
                return self.reply(409, {"error": "این کار روی این سرور اجرا نمی‌شود"})
            start_run(job, "workflow_dispatch")
            return self.reply(200, {"ok": True})
        if path.endswith("/notify"):
            if not self.is_admin():
                return self.reply(403, {"error": "admin only"})
            mode = body.get("mode")
            if mode == "test":
                r = sms_send("جریان — پیامک آزمایشی هشدار. اگر این پیام رسید، هشدارها کار می‌کنند.")
                return self.reply(200 if r.get("ok") else 502, r)
            if mode == "check":
                return self.reply(200, notify_check(send=bool(alert_conf().get("on"))))
            if mode == "daily":
                return self.reply(200, notify_daily())
            return self.reply(400, {"error": "unknown mode"})
        self.reply(404, {"error": "not found"})


def main():
    db().close()
    # اجرای نیمه‌کاره‌ی پیش از راه‌اندازی دوباره «ناموفق» ثبت شود، نه «در حال اجرا» برای همیشه
    c = db()
    c.execute("update runs set status='completed', conclusion='cancelled', updated_at=? where status!='completed'", (time.time(),))
    c.commit()
    if "--once" in sys.argv:
        return 0
    threading.Thread(target=scheduler, daemon=True).start()
    host, port = LISTEN.rsplit(":", 1)
    srv = http.server.ThreadingHTTPServer((host, int(port)), Handler)
    srv.daemon_threads = True
    srv.serve_forever()


if __name__ == "__main__":
    sys.exit(main())
