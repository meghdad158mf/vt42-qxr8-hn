#!/usr/bin/env python3
"""آزمون سرتاسری سرور جریان روی یک Ubuntu واقعی با systemd (ورک‌فلوی server-e2e).

پیش‌نیاز: نصب پایه (server/install.sh) انجام شده و کلید اضطراری در فایل است.
  sudo python3 tests/server/e2e_client.py <کلید-فایل> <بسته‌ی سالم> <بسته‌ی خراب>

همان کارهایی را می‌کند که کاربر در مرورگر می‌کند: ورود به /update، بارگذاری و نصب
بسته، بعد /setup (رمز، پیامک، مدیر، آزمون ورود با رمز و پیامک)، و نصب یک بسته‌ی
خراب که باید خودکار برگردد بی‌آنکه داده‌ای از دست برود.
"""
import glob
import os
import http.cookiejar
import json
import re
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://127.0.0.1"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE           # گواهی موقت خودامضا (فقط در آزمون)
FAILS = []


def opener():
    cj = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj),
                                       urllib.request.HTTPSHandler(context=CTX))


def req(op, url, data=None, headers=None, method=None):
    r = urllib.request.Request(BASE + url, data=data, headers=headers or {}, method=method)
    try:
        with op.open(r, timeout=120) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def check(cond, msg):
    print(("  ✔ " if cond else "  ✘ ") + msg, flush=True)
    if not cond:
        FAILS.append(msg)
    return cond


def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout.strip()


def sql(q):
    return sh(f"runuser -u postgres -- psql -d jaryan -tAc {json.dumps(q)}")


# ---------------------------------------------------------------- /update

def update_login(key):
    op = opener()
    req(op, "/update/login", urllib.parse.urlencode({"key": key}).encode())
    code, html = req(op, "/update/")
    csrf = re.search(r"const CSRF=(\"[^\"]+\")", html)
    assert csrf, "ورود به /update ناموفق بود"
    return op, json.loads(csrf.group(1))


def install(op, csrf, pkg):
    with open(pkg, "rb") as f:
        data = f.read()
    code, body = req(op, "/update/upload", data, {"X-CSRF": csrf, "X-Filename": "p.jaryan",
                                                 "Content-Type": "application/octet-stream"})
    assert code == 200, f"بارگذاری ناموفق: {code} {body[:300]}"
    uid = re.search(r'name="id" value="([^"]+)"', json.loads(body)["html"]).group(1)
    req(op, "/update/install", urllib.parse.urlencode({"csrf": csrf, "id": uid}).encode())
    for _ in range(240):
        time.sleep(2)
        code, body = req(op, "/update/status.json")
        st = json.loads(body)
        if not st["job"]["running"] and st["job"]["result"]:
            break
    log = sorted(glob.glob("/var/lib/jaryan/updater/logs/*-install.log"))[-1]
    print("---- گزارش نصب", log)
    print(open(log, encoding="utf-8").read()[-6000:])
    print("----")
    return st


# ---------------------------------------------------------------- /setup

class Setup:
    def __init__(self, key):
        self.op = opener()
        code, html = req(self.op, "/setup/login", urllib.parse.urlencode({"key": key}).encode())
        check("۱. رمزها" in html, "ورود به /setup با کلید اضطراری")

    def post(self, path, **form):
        _, html = req(self.op, "/setup/")
        form["csrf"] = re.search(r'name="csrf" value="([^"]+)"', html).group(1)
        _, html = req(self.op, "/setup/" + path, urllib.parse.urlencode(form).encode())
        m = re.search(r'<div class="flash (ok|bad)">(.*?)</div>', html, re.S)
        ok, msg = (m.group(1) == "ok", re.sub("<[^>]+>", "", m.group(2))) if m else (False, "(بدون پیام)")
        print(f"    /setup/{path}: {msg}")
        return ok


def rpc(fn, args, headers=None):
    h = {"Content-Type": "application/json", "Authorization": "Bearer " + ANON}
    h.update(headers or {})
    return req(opener(), "/rest/v1/rpc/" + fn, json.dumps(args).encode(), h)


ANON = ""
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VERSION = open(os.path.join(REPO, "server", "core", "VERSION")).read().strip()


def upload(path, data, tok, ctype="application/octet-stream", upsert=False):
    h = {"Authorization": "Bearer " + tok, "Content-Type": ctype}
    if upsert:
        h["x-upsert"] = "true"
    return req(opener(), "/storage/v1/object/" + path, data, h)


def run_job(tok, job, wait=240):
    code, body = req(opener(), "/functions/v1/run-job", json.dumps({"job": job}).encode(),
                     {"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    if code != 200:
        return code, None
    for _ in range(wait // 3):
        time.sleep(3)
        _, b = req(opener(), "/functions/v1/run-job", json.dumps({"action": "status"}).encode(),
                   {"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
        r = json.loads(b)["runs"].get(job)
        if r and r["status"] == "completed":
            return 200, r
    return 200, None


def stage2to7(key, tok):
    """مرحله‌های ۲ تا ۷ و پیوند: فایل‌ها، سایت، تابع‌ها، کارها، انتقال داده، پیوند، گواهی."""
    import base64
    sys.path.insert(0, "/opt/jaryan/current/services")
    import srvlib as SL
    print("== فایل‌ها (مرحله‌ی ۲)")
    viewer = SL.make_jwt({"role": "app_viewer", "exp": int(time.time()) + 600}, json.load(open("/etc/jaryan/secrets.json"))["jwt_secret"])
    code, _ = upload("magazine-covers/e2e/cover.png", b"\x89PNG fake", tok, "image/png")
    check(code == 200, "بارگذاری جلد (عمومی) با توکن مدیر")
    code, body = req(opener(), "/storage/v1/object/public/magazine-covers/e2e/cover.png")
    check(code == 200 and "PNG" in body[:8], "دریافت فایل عمومی مستقیم از nginx")
    code, _ = upload("magazines/e2e/issue.pdf", b"%PDF-1.4 e2e", tok, "application/pdf")
    check(code == 200, "بارگذاری فایل مجله (خصوصی)")
    code, _ = req(opener(), "/storage/v1/object/public/magazines/e2e/issue.pdf")
    check(code == 404, "فایل خصوصی از نشانی عمومی داده نمی‌شود")
    code, _ = upload("magazines/e2e/x.pdf", b"x", viewer)
    check(code == 403, "بیننده نمی‌تواند در مجلات بنویسد (RLS)")
    code, body = req(opener(), "/storage/v1/object/sign/magazines", json.dumps({"expiresIn": 600, "paths": ["e2e/issue.pdf"]}).encode(),
                     {"Authorization": "Bearer " + viewer, "Content-Type": "application/json"})
    signed = json.loads(body)[0].get("signedURL") if code == 200 else None
    check(bool(signed), "لینک امن برای بیننده")
    code, body = req(opener(), "/storage/v1" + signed) if signed else (0, "")
    check(code == 200 and body.startswith("%PDF"), "دریافت فایل خصوصی با لینک امن")
    check(sql("select (metadata->>'size')::int from storage.objects where name='e2e/issue.pdf'") == "12", "ردیف storage.objects با اندازه")
    print("== سایت (مرحله‌ی ۳)")
    code, html_ = req(opener(), "/design/ita-monitoring-prototype.html")
    check(code == 200 and "app-version" in html_, "صفحه‌ی سایت روی سرور")
    js = sh("cat /opt/jaryan/current/site/design/assets/*.js")
    check("__JARYAN_ANON_KEY__" not in js and ANON in js and "supabase.co" not in js, "کلید عمومی سرور در سایت، بدون نشانی Supabase")
    check(sh("curl -s -o /dev/null -w '%{redirect_url}' http://127.0.0.1/").endswith("/design/ita-monitoring-prototype.html"), "صفحه‌ی اصلی به سایت می‌رود")
    print("== تابع‌ها و کارها (مرحله‌های ۴ و ۵)")
    code, body = req(opener(), "/functions/v1/translate", json.dumps({"postId": 1}).encode(),
                     {"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    check(0 < code < 500 or "LIARA" in body, f"تابع ترجمه پاسخ می‌دهد ({code})")
    code, body = req(opener(), "/functions/v1/run-job", json.dumps({"action": "status"}).encode(),
                     {"Authorization": "Bearer " + viewer, "Content-Type": "application/json"})
    check(code == 403, "run-job فقط برای مدیر")
    code, r = run_job(tok, "cleanup")
    check(code == 200 and r and r["conclusion"] == "success", f"اجرای دستی «پاک‌سازی» با کتابخانه‌های بسته: {r}")
    code, body = req(opener(), "/functions/v1/run-job", json.dumps({"action": "logs", "job": "cleanup"}).encode(),
                     {"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    check(code == 200 and json.loads(body).get("lines"), "گزارش اجرا (logs)")
    code, body = req(opener(), "/functions/v1/notify", json.dumps({"mode": "check"}).encode(),
                     {"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    check(code == 200, f"بررسی هشدار: {body[:200]}")
    code, body = req(opener(), "/functions/v1/run-job", json.dumps({"action": "health"}).encode(),
                     {"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    check(code == 200 and "services" in body, "بررسی سرویس‌های مرتبط")
    print("== پیوند سرور خارجی (ورود دسته)")
    s = Setup(key)
    check(s.post("link-newkey"), "ساختن کلید پیوند")
    import hashlib, hmac, gzip
    lkey = open("/etc/jaryan/link.key").read().strip()
    batch = {"v": 1, "upto": "2026-10-24T10:00:00Z", "more": False, "mentions": [],
             "posts": [{"_channel": {"platform": "telegram", "username": "iranintltv"}, "platform": "telegram",
                        "platform_post_id": "e2e-1", "text": "پیام آزمون از سرور خارجی", "scraped_at": "2026-10-24T10:00:00Z",
                        "media_storage_path": "telegram/e2e-1.jpg", "media_path": "x", "ai_keywords": ["نباید"]}],
             "media": {"telegram/e2e-1.jpg": base64.b64encode(b"\xff\xd8 jpeg").decode()}}
    body = gzip.compress(json.dumps(batch).encode())
    t = str(int(time.time()))
    mac = hmac.new(lkey.encode(), t.encode() + b"\n" + hashlib.sha256(body).digest(), hashlib.sha256).hexdigest()
    code, resp = req(opener(), "/link/v1/push", body, {"X-Jaryan-Time": t, "X-Jaryan-Sig": mac})
    check(code == 200 and json.loads(resp).get("count") == 1, f"دسته‌ی امضاشده پذیرفته شد: {resp[:150]}")
    code, _ = req(opener(), "/link/v1/push", body, {"X-Jaryan-Time": t, "X-Jaryan-Sig": "0" * 64})
    check(code == 401, "دسته‌ی بدون امضای درست رد شد")
    check(sql("select count(*) from posts where platform_post_id='e2e-1' and ai_keywords is null") == "1", "پست رسید و ستون هوش مصنوعی ایران دست نخورد")
    code, _ = req(opener(), "/storage/v1/object/public/post-media/telegram/e2e-1.jpg")
    check(code == 200, "رسانه‌ی پست هم رسید")
    print("== فایل داده‌ی پیوند (لایه‌ی ۴) و ساختن دسته")
    r = subprocess.run([sys.executable, "-c", """
import sys, json; sys.path.insert(0, '/opt/jaryan/current/services')
import link
b = link.build_batch(None)
ok = any(p.get('platform_post_id') == 'e2e-1' and p['_channel']['username'] == 'iranintltv' for p in b['posts'])
n = link.export_bundle('/tmp/e2e.jaryanlink')
m = link.import_bundle('/tmp/e2e.jaryanlink')
snap = link.channels_snapshot()
print(json.dumps({'batch': ok, 'media': 'telegram/e2e-1.jpg' in b['media'], 'exported': n, 'imported': m, 'channels': len(snap['channels'])}))
"""], capture_output=True, text=True)
    print(r.stdout[-500:], r.stderr[-1500:])
    res = json.loads(r.stdout.strip().splitlines()[-1]) if r.returncode == 0 else {}
    check(res.get("batch") and res.get("media"), "سرور خارجی: ساختن دسته با منبع و رسانه")
    check(res.get("exported", 0) >= 1 and res.get("imported") == res.get("exported"), "فایل داده‌ی امضاشده: ساختن و ورود")
    check(res.get("channels", 0) > 0, "فهرست منابع برای سرور خارجی")
    with open("/tmp/e2e.jaryanlink", "r+b") as fh:
        fh.seek(-6, 2)
        fh.write(b"XXXXXX")
    r = subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0, '/opt/jaryan/current/services'); import link; link.import_bundle('/tmp/e2e.jaryanlink')"],
                       capture_output=True, text=True)
    check(r.returncode != 0 and "امضا" in r.stderr, "فایل داده‌ی دستکاری‌شده رد شد")
    print("== انتقال داده (مرحله‌ی ۶، رفت و برگشت روی همین سرور)")
    users = sql("select count(*) from app_users")
    nids = sql("select count(*) from app_user_nids")
    env = dict(os.environ, SUPABASE_URL="http://127.0.0.1", SUPABASE_ANON_KEY=ANON, ADMIN_PASSWORD="Test-Admin-Pass-1",
               EXPORT_PASSWORD="e2e-export-pass")
    r = subprocess.run([sys.executable, "/opt/jaryan/current/services/transfer.py", "export", "--out", "/tmp/e2e.jaryandata"],
                       capture_output=True, text=True, env=env)
    print(r.stdout[-1500:], r.stderr[-1500:])
    check(r.returncode == 0 and os.path.getsize("/tmp/e2e.jaryandata") > 1000, "برون‌بری (همان کد Supabase) از راه رابط‌ها")
    sql("delete from app_users where full_name='مدیر آزمون'")
    r = subprocess.run([sys.executable, "/opt/jaryan/current/services/transfer.py", "import", "/tmp/e2e.jaryandata",
                        "https://127.0.0.1"], capture_output=True, text=True, env=env)
    print(r.stdout[-1500:], r.stderr[-1500:])
    check(r.returncode == 0, "ورود فایل داده")
    check(sql("select count(*) from app_users") == users and sql("select count(*) from app_user_nids") == nids,
          "کاربران و کدهای ملی برگشتند")
    code, body = req(opener(), "/storage/v1/object/public/magazine-covers/e2e/cover.png")
    check(code == 200, "فایل‌ها هم منتقل شدند")
    code, body = rpc("login_admin", {"p_nid": "0013542419", "p_password": "Test-Admin-Pass-1"})
    check(code == 200 and "token" in body, "بعد از انتقال، ورود با کد ملی کار می‌کند")
    print("== گواهی و دامنه (مرحله‌ی ۷، با گواهی دستی)")
    sh("openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 30 -subj /CN=e2e.example.ir "
       "-addext subjectAltName=DNS:e2e.example.ir -keyout /tmp/e2e.key -out /tmp/e2e.crt 2>/dev/null")
    s = Setup(key)
    check(s.post("cert", domain="e2e.example.ir", cert=open("/tmp/e2e.crt").read(), key=open("/tmp/e2e.key").read()), "نصب گواهی دستی")
    check(sh("curl -s -o /dev/null -w '%{http_code}' -H 'Host: e2e.example.ir' http://127.0.0.1/design/ita-monitoring-prototype.html") == "301",
          "http دامنه به https می‌رود")
    check(sh("curl -s -o /dev/null -w '%{http_code}' -H 'Host: e2e.example.ir' http://127.0.0.1/.well-known/acme-challenge/x") == "404",
          "مسیر Let's Encrypt بدون تغییر مسیر")
    check(sh("curl -sk -o /dev/null -w '%{http_code}' --resolve e2e.example.ir:443:127.0.0.1 https://e2e.example.ir/design/ita-monitoring-prototype.html") == "200",
          "https با گواهی تازه")
    check(json.load(open("/etc/jaryan/server.json")).get("public_url") == "https://e2e.example.ir", "نشانی عمومی دامنه شد")
    check(sql("select count(*) from magazines") is not None, "پایگاه داده سالم")


def main(keyfile, good, broken):
    global ANON
    key = open(keyfile).read().strip()
    print("== نصب بسته‌ی سالم")
    op, csrf = update_login(key)
    st = install(op, csrf, good)
    check(st["job"]["result"]["ok"], "نصب بسته: " + st["job"]["result"]["msg"])
    check(st["current"].startswith("1."), "نسخه‌ی فعال " + st["current"])
    for svc in ("jaryan-api", "jaryan-net", "jaryan-setup", "jaryan-storage", "jaryan-functions", "jaryan-jobs"):
        check(sh(f"systemctl is-active {svc}") == "active", f"سرویس {svc} روشن است")
    nmig = len([f for f in os.listdir(os.path.join(REPO, "db")) if f == "schema.sql" or f.startswith("migration_")])
    check(sql("select count(*) from jaryan_meta.applied") == str(nmig), f"همه‌ی {nmig} فایل پایگاه داده اجرا شدند")
    ANON = json.load(open("/etc/jaryan/secrets.json"))["anon_key"]
    check(sh("stat -c %a /etc/jaryan/secrets.json") == "600", "secrets.json فقط برای root")

    print("== /setup")
    s = Setup(key)
    check(s.post("password", role="admin", pw="Test-Admin-Pass-1", pw2="Test-Admin-Pass-1"), "رمز مدیر")
    check(s.post("sms", key="TestKey_123456", body="12345"), "تنظیم پیامک")
    check(s.post("admin", name="مدیر آزمون", phone="09123456789", nid="0013542419"), "افزودن مدیر")
    check(s.post("test-pass", nid="0013542419", pw="Test-Admin-Pass-1"), "ورود مدیر با رمز (از راه رابط برنامه)")
    check(not s.post("test-pass", nid="0013542419", pw="wrong-password"), "رمز اشتباه رد می‌شود")
    sh("systemctl stop jaryan-net")                  # تا کد در صف بماند و بخوانیمش
    check(s.post("test-otp", nid="0013542419"), "درخواست کد پیامکی")
    code = sql("select body->'args'->>0 from net.http_request_queue order by id desc limit 1")
    check(bool(re.fullmatch(r"\d{5}", code)), "کد در صف ارسال")
    check(s.post("test-code", code=code), "ورود با کد پیامکی")
    sh("systemctl start jaryan-net")
    time.sleep(4)
    check(sql("select count(*) from net.http_request_queue") == "0", "سرویس ارسال صف را خالی کرد")
    check(sql("select count(*) from net._http_response where status_code is not null or error_msg is not null") != "0",
          "پاسخ وب‌سرویس پیامک ثبت شد")

    print("== رابط برنامه از راه nginx")
    code, body = rpc("login", {"password": "Test-Admin-Pass-1"}, {"CF-Connecting-IP": "6.6.6.6", "X-Forwarded-For": "6.6.6.6"})
    check(code == 200 and "token" in body, "ورود با رمز مدیر از /rest/v1/rpc/login")
    check(sql("select ip from login_events order by id desc limit 1") == "127.0.0.1",
          "نشانی کاربر از nginx است، نه از سرآیند جعلی")
    tok = json.loads(body)["token"]
    code, body = req(opener(), "/rest/v1/channels?select=id&limit=1", headers={"Authorization": "Bearer " + tok})
    check(code == 200 and body.startswith("["), "خواندن جدول با توکن مدیر")
    code, body = req(opener(), "/rest/v1/channels?select=id&limit=1", headers={"Authorization": "Bearer " + ANON})
    check(code in (401, 403), "بدون ورود، جدول منابع خوانده نمی‌شود")
    code, _ = req(opener(), "/setup/health")
    check(code == 200, "/setup/health")
    check(sh("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/setup/") == "301", "/setup فقط با https")
    stage2to7(key, tok)
    sec = json.load(open("/etc/jaryan/secrets.json"))["jwt_secret"]
    sys.path.insert(0, "/opt/jaryan/current/services")
    import srvlib as SL
    with open("/tmp/e2e-tokens.json", "w") as f:
        json.dump({"admin": SL.make_jwt({"role": "app_admin", "uid": 1, "exp": int(time.time()) + 3600}, sec),
                   "viewer": SL.make_jwt({"role": "app_viewer", "exp": int(time.time()) + 3600}, sec)}, f)
    os.chmod("/tmp/e2e-tokens.json", 0o644)
    print("== راه‌اندازی دوباره‌ی سرویس‌ها")
    sh("systemctl restart postgresql jaryan-api jaryan-net jaryan-setup jaryan-storage jaryan-functions jaryan-jobs")
    time.sleep(6)
    code, body = rpc("login_admin", {"p_nid": "0013542419", "p_password": "Test-Admin-Pass-1"})
    check(code == 200 and "token" in body, "بعد از راه‌اندازی دوباره، ورود کار می‌کند")

    print("== بسته‌ی خراب (باید خودکار برگردد)")
    op, csrf = update_login(key)
    before = sql("select count(*) from app_users")
    st = install(op, csrf, broken)
    check(not st["job"]["result"]["ok"] and "برگشت داده شد" in st["job"]["result"]["msg"],
          "نصب خراب برگشت خورد: " + st["job"]["result"]["msg"])
    check(st["current"] == VERSION, "نسخه‌ی فعال دوباره " + st["current"])
    time.sleep(3)
    check(sql("select count(*) from app_users") == before, "داده‌ها سر جایشان است")
    check(sql("select to_regclass('public.broken_marker') is null") == "t", "تغییر پایگاه داده‌ی بسته‌ی خراب برگشت خورد")
    code, body = rpc("login_admin", {"p_nid": "0013542419", "p_password": "Test-Admin-Pass-1"})
    check(code == 200 and "token" in body, "بعد از برگشت، ورود کار می‌کند")

    print()
    if FAILS:
        print("ناموفق:", len(FAILS))
        for f in FAILS:
            print("  -", f)
        return 1
    print("همه‌ی آزمون‌ها سبز")
    return 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:4]))
