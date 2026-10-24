"""بخش‌های تازه‌ی صفحه‌ی /setup (مرحله‌های ۲ تا ۷ و سرور خارجی).

هر بخش = تابع html(st, csrf) و کارهای POST در ACTIONS. کارهای طولانی (انتقال داده، گواهی، فایل داده)
در پس‌زمینه با گزارش در TASK اجرا می‌شوند و صفحه تا پایان هر ۵ ثانیه تازه می‌شود.
"""
import datetime as dt
import html
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.request

import srvlib as S
import serverconf

FUNCTIONS_ENV = S.ETC + "/functions.env"
TELEGRAM_ENV = S.ETC + "/telegram.env"
LINK_KEY = S.ETC + "/link.key"
TLS = S.ETC + "/tls"
ACME_HOME = S.ROOT + "/var/lib/jaryan/acme"
UPLOADS = S.ROOT + "/var/lib/jaryan/setup-uploads"
REL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TASK = {"running": False, "title": "", "log": [], "ok": None, "at": 0}
_tlock = threading.Lock()


def esc(s):
    return html.escape("" if s is None else str(s), quote=True)


def ltr(s):
    return f'<bdi dir="ltr">{esc(s)}</bdi>'


def systemctl(*a):
    if os.environ.get("JARYAN_TEST_NO_SYSTEMD"):
        return
    subprocess.run(["systemctl", *a], capture_output=True, timeout=60)


def write_env(path, values, mode=0o600, group=None):
    lines = "".join(f"{k}={v}\n" for k, v in values.items() if v)
    tmp = path + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(lines)
    if group and os.geteuid() == 0:
        import grp
        try:
            os.chown(tmp, 0, grp.getgrnam(group).gr_gid)
        except KeyError:
            pass
    os.replace(tmp, path)


def read_env(path):
    out = {}
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                k, sep, v = line.strip().partition("=")
                if sep:
                    out[k] = v
    except OSError:
        pass
    return out


def admin_token():
    return S.make_jwt({"role": "app_admin", "iss": "jaryan-setup", "exp": int(time.time()) + 600},
                      S.load_secrets()["jwt_secret"])


def jobs_api(fn, body):
    r = urllib.request.Request(f"http://127.0.0.1:8094/functions/v1/{fn}", data=json.dumps(body).encode(),
                               method="POST", headers={"Content-Type": "application/json",
                                                       "Authorization": "Bearer " + admin_token()})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except ValueError:
            return e.code, None
    except (urllib.error.URLError, OSError) as e:
        return 0, {"error": str(e)}


def app_config(keys):
    out = S.psql("select coalesce(json_object_agg(key, value), '{}') from app_config where key = any("
                 + S.lit("{" + ",".join(keys) + "}") + "::text[])").strip()
    return json.loads(out or "{}")


def set_app_config(values):
    sql = "".join(f"insert into app_config (key, value) values ({S.lit(k)}, {S.lit(v)}) "
                  "on conflict (key) do update set value = excluded.value;\n" for k, v in values.items())
    S.psql(sql)


# ---------------------------------------------------------------- کار پس‌زمینه

def start_task(title, fn):
    with _tlock:
        if TASK["running"]:
            return False
        TASK.update(running=True, title=title, log=[], ok=None, at=time.time())

    def run():
        def progress(msg):
            TASK["log"].append(time.strftime("%H:%M:%S ", time.gmtime(time.time() + 3.5 * 3600)) + str(msg))
        try:
            msg = fn(progress)
            progress("✔ " + (msg or "تمام شد"))
            TASK["ok"] = True
        except Exception as e:  # noqa: BLE001
            progress("✘ " + str(e)[:800])
            TASK["ok"] = False
        TASK["running"] = False
    threading.Thread(target=run, daemon=True).start()
    return True


def task_html():
    if not TASK["title"]:
        return ""
    state = "در حال انجام…" if TASK["running"] else ("انجام شد" if TASK["ok"] else "ناموفق")
    cls = "warn" if TASK["running"] else ("ok" if TASK["ok"] else "bad")
    log = esc("\n".join(TASK["log"][-40:]))
    return (f'<section><h2>کار در پس‌زمینه: {esc(TASK["title"])} — <span class="{cls}">{state}</span></h2>'
            f'<pre style="direction:ltr;text-align:left;white-space:pre-wrap;background:#16202a;color:#dfe5ec;'
            f'padding:10px;border-radius:10px;font-size:12px;max-height:300px;overflow:auto">{log}</pre></section>')


def refresh_meta():
    return '<meta http-equiv="refresh" content="5">' if TASK["running"] else ""


# ---------------------------------------------------------------- بخش‌ها

def sections(csrf, nonce):
    sc = serverconf.load()
    role = sc.get("role", "iran")
    out = [task_html()]
    fe = read_env(FUNCTIONS_ENV)
    out.append(f"""<section id="ai"><h2>۵. هوش مصنوعی (لیارا)</h2>
<p class="muted">کلید API لیارا برای ترجمه، «در یک نگاه» و کلیدواژه‌ها. فقط نوشتنی است. وضعیت: {"<span class=ok>تنظیم شده</span>" if fe.get("LIARA_API_KEY") else "<span class=warn>تنظیم نشده</span>"}</p>
<form method="post" action="/setup/liara" class="row">{csrf}
<label>کلید لیارا<input class="ltr" type="password" name="key" autocomplete="off"></label><button>ذخیره</button></form></section>""")

    out.append(f"""<section id="server"><h2>۶. نشانی و نقش این سرور</h2>
<p class="muted">نشانی عمومی همان است که کاربران در مرورگر می‌زنند (فعلاً با IP؛ بعد از دامنه، خودکار عوض می‌شود). نشانی فایل‌ها با آن ساخته می‌شود؛ با تغییرش نشانی‌های قبلی در پایگاه داده هم بازنویسی می‌شوند.</p>
<form method="post" action="/setup/server" class="row">{csrf}
<label>نشانی عمومی<input class="ltr" name="public_url" value="{esc(sc.get("public_url", ""))}"></label>
<label>نقش<select name="role"><option value="iran"{" selected" if role == "iran" else ""}>سرور ایران (اصلی)</option>
<option value="foreign"{" selected" if role == "foreign" else ""}>سرور خارجی (فقط جمع‌آوری)</option></select></label>
<button>ذخیره</button></form></section>""")

    if role == "iran":
        ac = app_config(["alert_sms_on", "alert_sms_to", "alert_sms_from", "alert_sms_body_id"])
        out.append(f"""<section id="alerts"><h2>۷. هشدار پیامکی به مدیر</h2>
<p class="muted">هر ۳۰ دقیقه موارد قرمز (کاری که خروجی نداده، اجرای ناموفق، دیسک پر، ورودهای ناموفق، قطع پیوند سرور خارجی) با پیامک؛ هر صبح ۷:۲۲ گزارش کوتاه روزانه. ارسال با همان کلید وب‌سرویس ورود پیامکی: اگر «شماره‌ی الگوی هشدار» (الگویی با یک متغیر) بدهید با الگو، وگرنه «ارسال ساده» با خط فرستنده.</p>
<form method="post" action="/setup/alerts" class="row">{csrf}
<label>روشن<select name="on"><option value="true"{" selected" if ac.get("alert_sms_on") == "true" else ""}>بله</option><option value="false"{"" if ac.get("alert_sms_on") == "true" else " selected"}>خیر</option></select></label>
<label>گیرنده‌ها (با «،»)<input class="ltr" name="to" value="{esc(ac.get("alert_sms_to") or "")}" placeholder="0912…"></label>
<label>خط فرستنده<input class="ltr" name="from" value="{esc(ac.get("alert_sms_from") or "")}" placeholder="5000…"></label>
<label>شماره‌ی الگوی هشدار (اختیاری)<input class="ltr" name="body_id" value="{esc(ac.get("alert_sms_body_id") or "")}"></label>
<button>ذخیره</button></form>
<form method="post" action="/setup/alerts-test" class="row" style="margin-top:8px">{csrf}<button class="light">پیامک آزمایشی هشدار</button></form></section>""")

    code, js = jobs_api("run-job", {"action": "status"})
    rows = ""
    if code == 200 and js:
        names = json.load(open(os.path.join(REL, "jobs.json"), encoding="utf-8"))["jobs"]
        for job, spec in names.items():
            if role not in spec["roles"]:
                continue
            r = (js.get("runs") or {}).get(job)
            st = "—" if not r else ("در حال اجرا" if r["status"] != "completed" else
                                    {"success": "<span class=ok>موفق</span>", "failure": "<span class=bad>ناموفق</span>",
                                     "cancelled": "<span class=bad>متوقف (زمان)</span>"}.get(r["conclusion"], esc(r["conclusion"])))
            when = ltr(r["created_at"].replace("T", " ")[:16] + " UTC") if r else ""
            rows += (f'<tr><td>{esc(spec["name"])}</td><td>{st}</td><td>{when}</td><td><form method="post" action="/setup/run-job">'
                     f'{csrf}<input type="hidden" name="job" value="{esc(job)}"><button class="light">اجرا</button></form></td></tr>')
    else:
        rows = '<tr><td colspan="4" class="bad">زمان‌بند (jaryan-jobs) پاسخ نمی‌دهد.</td></tr>'
    out.append(f"""<section id="jobs"><h2>۸. کارهای خودکار این سرور</h2>
<p class="muted">برنامه‌ی همان زمان‌بندی‌های قبلی (ساعت UTC). گزارش کامل هر اجرا از «وضعیت سامانه»ی سایت دیده می‌شود.</p>
<table><tr><th>کار</th><th>آخرین اجرا</th><th>زمان</th><th></th></tr>{rows}</table></section>""")

    import link
    lst = link.state()
    has_key = bool(link.key())
    if role == "iran":
        last = lst.get("last_ingest")
        out.append(f"""<section id="link"><h2>۹. پیوند با سرور خارجی</h2>
<p class="muted">سرور خارجی تلگرام و منابع فیلترشده را جمع می‌کند و هر ۵ دقیقه به اینجا می‌فرستد. اگر آن جهت بسته بود و نشانی سرور خارجی را بدهید، این سرور خودش هر ۱۵ دقیقه می‌گیرد.
کلید: {"<span class=ok>دارد</span>" if has_key else "<span class=warn>ندارد</span>"}؛ آخرین دریافت: {ltr(dt.datetime.utcfromtimestamp(last).strftime("%Y-%m-%d %H:%M UTC")) if last else "—"}{"، " + str(lst.get("last_ingest_count")) + " مطلب" if last else ""}{"؛ آخرین خطا: " + esc(lst.get("last_error")) if lst.get("last_error") else ""}</p>
<form method="post" action="/setup/link-iran" class="row">{csrf}
<label>نشانی سرور خارجی (اختیاری)<input class="ltr" name="peer" value="{esc(sc.get("link_peer", ""))}" placeholder="https://…"></label>
<label>پیوند<select name="enabled"><option value="true"{" selected" if sc.get("link_enabled") else ""}>روشن</option><option value="false"{"" if sc.get("link_enabled") else " selected"}>خاموش</option></select></label>
<button>ذخیره</button></form>
<form method="post" action="/setup/link-newkey" class="row" style="margin-top:8px">{csrf}<button class="light">ساختن کلید پیوند تازه</button></form>
<p class="muted" style="margin-top:10px">قطع کامل اینترنت بین‌الملل: «فایل داده» را از /setup سرور خارجی بگیرید و اینجا بارگذاری کنید.</p>
{upload_widget("link", nonce, "بارگذاری فایل داده‌ی سرور خارجی", password=False)}</section>""")
    else:
        tg = read_env(TELEGRAM_ENV)
        out.append(f"""<section id="link"><h2>۹. پیوند با سرور ایران</h2>
<p class="muted">آخرین ارسال موفق: {ltr(dt.datetime.utcfromtimestamp(lst["last_ok"]).strftime("%Y-%m-%d %H:%M UTC")) if lst.get("last_ok") else "—"}؛ تأییدشده تا: {ltr(lst.get("ack") or "—")}{"؛ آخرین خطا: " + esc(lst.get("last_error")) if lst.get("last_error") else ""}</p>
<form method="post" action="/setup/link-foreign" class="row">{csrf}
<label>نشانی سرور ایران<input class="ltr" name="url" value="{esc(sc.get("link_url", ""))}" placeholder="https://…"></label>
<label>کلید پیوند (از /setup سرور ایران){" — تنظیم شده" if has_key else ""}<input class="ltr" type="password" name="key" autocomplete="off" placeholder="خالی = بدون تغییر"></label>
<button>ذخیره</button></form>
<form method="post" action="/setup/telegram" class="row" style="margin-top:12px">{csrf}
<label>TG_API_ID<input class="ltr" name="api_id" value="{esc(tg.get("TG_API_ID", ""))}"></label>
<label>TG_API_HASH<input class="ltr" type="password" name="api_hash" placeholder="{"تنظیم شده" if tg.get("TG_API_HASH") else ""}"></label>
<label>TG_SESSION (رشته‌ی نشست){" — تنظیم شده" if tg.get("TG_SESSION") else ""}<input class="ltr" type="password" name="session" autocomplete="off"></label>
<button>ذخیره‌ی تلگرام</button></form>
<p class="muted">⚠️ یک نشست تلگرام را هم‌زمان در دو جا (گیت‌هاب و این سرور) به کار نبرید؛ پیش از روشن کردن اینجا، کار تلگرام گیت‌هاب را خاموش کنید.</p>
<form method="post" action="/setup/link-bundle" class="row" style="margin-top:8px">{csrf}<button class="light">ساختن «فایل داده»ی یک هفته‌ی اخیر</button></form>
{bundle_link()}</section>""")

    if role == "iran":
        out.append(f"""<section id="transfer"><h2>۱۰. انتقال داده از Supabase</h2>
<p class="muted">همه‌ی داده‌ها و فایل‌های سایت فعلی به این سرور می‌آیند و <b>جای داده‌های فعلی این سرور را می‌گیرند</b> (پیش از آن پشتیبان گرفته می‌شود). رمزها و تنظیمات همین صفحه دست نمی‌خورند. دو راه:</p>
<p class="muted">الف) فایل رمزنگاری‌شده‌ی <bdi dir="ltr">.jaryandata</bdi> که با ورک‌فلوی «Server export» گیت‌هاب ساخته شده:</p>
{upload_widget("transfer", nonce, "بارگذاری و انتقال", password=True)}
<p class="muted" style="margin-top:12px">ب) مستقیم از Supabase (اگر این سرور به آن دسترسی دارد) با رمز مدیر سایت فعلی:</p>
<form method="post" action="/setup/transfer-direct" class="row">{csrf}
<label>رمز مدیر سایت فعلی<input class="ltr" type="password" name="pw" autocomplete="off"></label>
<button class="light">دریافت و انتقال</button></form></section>""")

    cert = cert_info()
    out.append(f"""<section id="domain"><h2>۱۱. دامنه و گواهی https</h2>
<p class="muted">گواهی فعلی: {esc(cert)}. دامنه‌ی فعلی: {ltr(sc.get("domain") or "—")}.
اول در پنل دامنه، رکورد A را به آی‌پی همین سرور بدهید؛ بعد اینجا دامنه را بنویسید تا گواهی رایگان Let's Encrypt گرفته شود (هر ۶۰ روز خودکار تمدید).</p>
<form method="post" action="/setup/domain" class="row">{csrf}
<label>دامنه<input class="ltr" name="domain" value="{esc(sc.get("domain", ""))}" placeholder="jaryan.example.ir"></label>
<label>ایمیل (برای Let's Encrypt)<input class="ltr" name="email" value="{esc(sc.get("acme_email", ""))}"></label>
<button>گرفتن گواهی</button></form>
<details style="margin-top:10px"><summary class="muted">گواهی از جای دیگر دارید؟ (مثلاً اگر Let's Encrypt از ایران در دسترس نبود)</summary>
<form method="post" action="/setup/cert" class="row" style="margin-top:8px">{csrf}
<label>دامنه<input class="ltr" name="domain" value="{esc(sc.get("domain", ""))}"></label>
<label style="flex-basis:100%">گواهی (fullchain، PEM)<textarea name="cert" rows="4" class="ltr" style="direction:ltr;font:12px monospace"></textarea></label>
<label style="flex-basis:100%">کلید خصوصی (PEM)<textarea name="key" rows="4" class="ltr" style="direction:ltr;font:12px monospace"></textarea></label>
<button>نصب گواهی</button></form></details></section>""")
    return "\n".join(out)


def upload_widget(kind, nonce, label, password):
    pw = (f'<label>رمز فایل<input class="ltr" type="password" id="up-pw-{kind}" autocomplete="off"></label>'
          if password else "")
    return f"""<div class="row"><label>فایل<input type="file" id="up-file-{kind}"></label>{pw}
<button type="button" id="up-btn-{kind}">{esc(label)}</button></div><p class="muted" id="up-msg-{kind}"></p>
<script nonce="{nonce}">
document.getElementById('up-btn-{kind}').addEventListener('click',()=>{{
 const f=document.getElementById('up-file-{kind}').files[0],m=document.getElementById('up-msg-{kind}');
 if(!f){{m.textContent='نخست فایل را انتخاب کنید.';return;}}
 const pwEl=document.getElementById('up-pw-{kind}');
 const x=new XMLHttpRequest();x.open('POST','/setup/upload/{kind}');
 x.setRequestHeader('X-CSRF',document.querySelector('input[name=csrf]').value);
 if(pwEl)x.setRequestHeader('X-Password',encodeURIComponent(pwEl.value));
 x.upload.onprogress=e=>{{if(e.lengthComputable)m.textContent='بارگذاری… '+Math.round(e.loaded*100/e.total)+'٪';}};
 x.onload=()=>{{location.href='/setup/';}};x.onerror=()=>{{m.textContent='ارتباط قطع شد.';}};x.send(f);
}});</script>"""


def bundle_link():
    p = os.path.join(UPLOADS, "link-bundle.jaryanlink")
    if not os.path.exists(p):
        return ""
    t = dt.datetime.utcfromtimestamp(os.path.getmtime(p)).strftime("%Y-%m-%d %H:%M UTC")
    return f'<p><a href="/setup/download/link-bundle" class="btn">دریافت فایل داده ({ltr(t)}، {os.path.getsize(p) // 1024} کیلوبایت)</a></p>'


def cert_info():
    try:
        r = subprocess.run(["openssl", "x509", "-in", TLS + "/cert.pem", "-noout", "-subject", "-enddate", "-issuer"],
                           capture_output=True, text=True, timeout=10)
        lines = dict(ln.split("=", 1) for ln in r.stdout.strip().splitlines() if "=" in ln)
        issuer = lines.get("issuer", "")
        kind = "خودامضای موقت" if "jaryan" in lines.get("subject", "") and "jaryan" in issuer else issuer.strip()
        return f"{kind}، تا {lines.get('notAfter', '?')}"
    except (OSError, subprocess.SubprocessError):
        return "نامعلوم"


# ---------------------------------------------------------------- کارها

def act_liara(f, sess):
    key = (f.get("key") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9._-]{10,400}", key):
        return False, "کلید لیارا معتبر نیست."
    env = read_env(FUNCTIONS_ENV)
    env["LIARA_API_KEY"] = key
    write_env(FUNCTIONS_ENV, env)
    systemctl("restart", "jaryan-functions", "jaryan-jobs")
    return True, "کلید لیارا ذخیره شد و سرویس‌ها راه‌اندازی دوباره شدند."


def act_server(f, sess):
    sc = serverconf.load()
    url = (f.get("public_url") or "").strip().rstrip("/")
    if not re.fullmatch(r"https?://[A-Za-z0-9.:\[\]-]+", url):
        return False, "نشانی عمومی باید مثل https://1.2.3.4 یا https://example.ir باشد (بدون مسیر)."
    role = f.get("role") if f.get("role") in ("iran", "foreign") else "iran"
    old = sc.get("public_url")
    n = 0
    if old and old != url:
        n = int(S.q1(f"select jaryan_meta.rewrite_urls({S.lit(old)}, {S.lit(url)})") or 0)
    sc.update(public_url=url, role=role)
    serverconf.save(sc)
    systemctl("restart", "jaryan-jobs")
    return True, f"ذخیره شد (نقش: {'ایران' if role == 'iran' else 'خارجی'}؛ نشانی‌های بازنویسی‌شده: {n})."


def act_alerts(f, sess):
    to = ",".join(p for p in (re.sub(r"\D", "", x) for x in re.split(r"[,،\s]+", f.get("to") or "")) if p)
    if to and not all(re.fullmatch(r"09\d{9}", p) for p in to.split(",")):
        return False, "گیرنده‌ها باید شماره‌ی موبایل ۰۹… باشند."
    set_app_config({"alert_sms_on": "true" if f.get("on") == "true" else "false", "alert_sms_to": to,
                    "alert_sms_from": re.sub(r"\D", "", f.get("from") or ""),
                    "alert_sms_body_id": re.sub(r"\D", "", f.get("body_id") or "")})
    return True, "تنظیم هشدار پیامکی ذخیره شد."


def act_alerts_test(f, sess):
    code, js = jobs_api("notify", {"mode": "test"})
    if code == 200 and js and js.get("ok"):
        return True, "پیامک آزمایشی فرستاده شد."
    return False, "پیامک آزمایشی ناموفق: " + esc(json.dumps(js, ensure_ascii=False)[:300])


def act_run_job(f, sess):
    code, js = jobs_api("run-job", {"job": f.get("job")})
    return (code == 200), ("اجرا شروع شد." if code == 200 else "اجرا نشد: " + esc(str(js)[:200]))


def act_link_newkey(f, sess):
    key = secrets.token_urlsafe(32)
    write_env(LINK_KEY, {}, 0o640, "jaryan")
    with open(LINK_KEY, "w", encoding="utf-8") as fh:
        fh.write(key + "\n")
    sc = serverconf.load()
    sc["link_enabled"] = True
    serverconf.save(sc)
    return True, f"کلید پیوند تازه: <bdi dir=ltr style='font-family:monospace'>{esc(key)}</bdi> — همین الان در /setup سرور خارجی وارد کنید؛ دوباره نشان داده نمی‌شود."


def act_link_iran(f, sess):
    peer = (f.get("peer") or "").strip().rstrip("/")
    if peer and not re.fullmatch(r"https?://[A-Za-z0-9.:\[\]-]+", peer):
        return False, "نشانی سرور خارجی نامعتبر است."
    sc = serverconf.load()
    sc.update(link_peer=peer, link_enabled=f.get("enabled") == "true")
    serverconf.save(sc)
    return True, "تنظیم پیوند ذخیره شد."


def act_link_foreign(f, sess):
    url = (f.get("url") or "").strip().rstrip("/")
    if not re.fullmatch(r"https?://[A-Za-z0-9.:\[\]-]+", url):
        return False, "نشانی سرور ایران نامعتبر است."
    key = (f.get("key") or "").strip()
    if key:
        if not re.fullmatch(r"[A-Za-z0-9_-]{20,100}", key):
            return False, "کلید پیوند نامعتبر است."
        write_env(LINK_KEY, {}, 0o640, "jaryan")
        with open(LINK_KEY, "w", encoding="utf-8") as fh:
            fh.write(key + "\n")
    sc = serverconf.load()
    sc["link_url"] = url
    serverconf.save(sc)
    return True, "پیوند با سرور ایران ذخیره شد (نخستین ارسال تا ۵ دقیقه‌ی دیگر)."


def act_telegram(f, sess):
    env = read_env(TELEGRAM_ENV)
    if (f.get("api_id") or "").strip():
        if not re.fullmatch(r"\d{3,12}", f["api_id"].strip()):
            return False, "TG_API_ID باید عدد باشد."
        env["TG_API_ID"] = f["api_id"].strip()
    for name, k in (("api_hash", "TG_API_HASH"), ("session", "TG_SESSION")):
        v = (f.get(name) or "").strip()
        if v:
            if not re.fullmatch(r"[A-Za-z0-9+/=_-]{16,2000}", v):
                return False, f"{k} نامعتبر است."
            env[k] = v
    write_env(TELEGRAM_ENV, env)
    systemctl("restart", "jaryan-jobs")
    return True, "تنظیمات تلگرام ذخیره شد."


def act_link_bundle(f, sess):
    import link
    os.makedirs(UPLOADS, exist_ok=True)
    out = os.path.join(UPLOADS, "link-bundle.jaryanlink")

    def run(progress):
        n = link.export_bundle(out + ".tmp")
        os.replace(out + ".tmp", out)
        return f"فایل داده با {n} مطلب ساخته شد؛ پیوند «دریافت» را بزنید."
    return (start_task("ساختن فایل داده", run), "ساختن فایل داده شروع شد.")


def act_transfer_direct(f, sess):
    pw = f.get("pw") or ""
    if not pw:
        return False, "رمز مدیر سایت فعلی را بنویسید."

    def run(progress):
        import transfer
        os.makedirs(UPLOADS, exist_ok=True)
        tmp_pw = secrets.token_urlsafe(24)
        out = os.path.join(UPLOADS, "direct.jaryandata")
        env = dict(SUPABASE_URL=transfer.SUPABASE_ORIGIN, ADMIN_PASSWORD=pw, EXPORT_PASSWORD=tmp_pw,
                   SUPABASE_ANON_KEY=os.environ.get("JARYAN_SUPABASE_ANON_KEY", SUPABASE_ANON))
        os.environ.update(env)
        try:
            progress("دریافت از Supabase…")
            transfer.export(out)
            return do_import(out, progress)
        finally:
            for k in env:
                os.environ.pop(k, None)
            if os.path.exists(out):
                os.remove(out)
    return (start_task("انتقال مستقیم از Supabase", run), "انتقال شروع شد؛ این صفحه تا پایان خودش تازه می‌شود.")


# کلید عمومی (anon) سایت فعلی روی Supabase — محرمانه نیست (در کد سایت هم هست)
SUPABASE_ANON = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvbXFuYXBmcXJ0eHhheXRwY2R0Iiwi"
                 "cm9sZSI6ImFub24iLCJpYXQiOjE3ODg1OTQwMDUsImV4cCI6MjEwNDE3MDAwNX0.eh9DpJ_uO5b21IH4e3rGYIPCJOEO5ZWMiomh7kUxArU")


def do_import(path, progress):
    import transfer
    progress("پشتیبان از پایگاه داده‌ی فعلی…")
    os.makedirs(S.ROOT + "/var/lib/jaryan/backups", exist_ok=True)
    bk = S.ROOT + f"/var/lib/jaryan/backups/before-transfer-{time.strftime('%Y%m%d-%H%M%S')}.dump"
    if not os.environ.get("JARYAN_TEST_NO_SYSTEMD"):
        with open(bk, "wb") as out:
            subprocess.run(["runuser", "-u", "postgres", "--", "pg_dump", "-Fc", S.DB], stdout=out, check=True)
        os.chmod(bk, 0o600)
    res = transfer.import_(path, serverconf.load().get("public_url"), progress)
    systemctl("restart", "jaryan-api")
    return f"انتقال انجام شد: {sum(res['tables'].values())} ردیف در {len(res['tables'])} جدول، {res['files']} فایل."


def upload_done(kind, path, password):
    if kind == "transfer":
        def run(progress):
            os.environ["EXPORT_PASSWORD"] = password
            try:
                return do_import(path, progress)
            finally:
                os.environ.pop("EXPORT_PASSWORD", None)
                os.remove(path)
        return start_task("انتقال داده از فایل", run)
    if kind == "link":
        def run(progress):
            import link
            try:
                n = link.import_bundle(path)
            finally:
                os.remove(path)
            return f"{n} مطلب از فایل داده‌ی سرور خارجی وارد شد."
        return start_task("ورود فایل داده‌ی سرور خارجی", run)
    return False


def act_domain(f, sess):
    domain = (f.get("domain") or "").strip().lower().rstrip(".")
    email = (f.get("email") or "").strip()
    if not re.fullmatch(r"(?=.{4,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}", domain):
        return False, "دامنه نامعتبر است."
    if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return False, "ایمیل نامعتبر است."

    def run(progress):
        try:
            ips = sorted({a[4][0] for a in socket.getaddrinfo(domain, 443, socket.AF_INET)})
        except OSError:
            ips = []
        mine = set(subprocess.run(["hostname", "-I"], capture_output=True, text=True).stdout.split())
        progress(f"آی‌پی دامنه: {', '.join(ips) or 'پیدا نشد'}")
        if ips and not mine & set(ips):
            progress("⚠ آی‌پی دامنه با آی‌پی‌های این سرور یکی نیست (اگر پشت NAT است مشکلی نیست).")
        acme = os.path.join(REL, "vendor", "acme.sh")
        base = [acme, "--home", ACME_HOME, "--server", "letsencrypt"]
        os.makedirs(ACME_HOME, exist_ok=True)
        if email:
            subprocess.run(base + ["--register-account", "-m", email], capture_output=True, text=True, timeout=300)
        r = subprocess.run(base + ["--issue", "-d", domain, "-w", S.ROOT + "/var/lib/jaryan/acme-www", "--keylength", "ec-256"],
                           capture_output=True, text=True, timeout=600)
        progress((r.stdout + r.stderr)[-1500:])
        if r.returncode not in (0, 2):              # ۲ = گواهی معتبر از قبل
            raise RuntimeError("گرفتن گواهی ناموفق بود (دسترسی سرور به Let's Encrypt یا رکورد دامنه را بررسی کنید).")
        backup_selfsigned()
        r = subprocess.run(base + ["--install-cert", "-d", domain, "--ecc", "--key-file", TLS + "/key.pem",
                                   "--fullchain-file", TLS + "/cert.pem",
                                   "--reloadcmd", "systemctl reload nginx; systemctl restart jaryan-updater"],
                           capture_output=True, text=True, timeout=120)
        progress((r.stdout + r.stderr)[-600:])
        if r.returncode != 0:
            raise RuntimeError("نصب گواهی ناموفق بود.")
        return set_domain(domain, email, progress)
    return (start_task("گرفتن گواهی برای " + domain, run), "گرفتن گواهی شروع شد.")


def backup_selfsigned():
    for n in ("cert.pem", "key.pem"):
        src, dst = os.path.join(TLS, n), os.path.join(TLS, "selfsigned-" + n)
        if os.path.exists(src) and not os.path.exists(dst):
            shutil.copy2(src, dst)


def set_domain(domain, email, progress):
    sc = serverconf.load()
    old = sc.get("public_url")
    new = "https://" + domain
    n = int(S.q1(f"select jaryan_meta.rewrite_urls({S.lit(old)}, {S.lit(new)})") or 0) if old and old != new else 0
    sc.update(domain=domain, public_url=new, acme_email=email or sc.get("acme_email", ""))
    serverconf.save(sc)
    serverconf.nginx(os.path.realpath(S.ROOT + "/opt/jaryan/current"))
    systemctl("reload", "nginx")
    systemctl("restart", "jaryan-updater", "jaryan-jobs")
    progress(f"نشانی‌های بازنویسی‌شده: {n}")
    return f"دامنه‌ی {domain} فعال شد؛ سایت: {new}/ — از این پس http به https می‌رود."


def act_cert(f, sess):
    domain = (f.get("domain") or "").strip().lower()
    cert, key = (f.get("cert") or "").strip(), (f.get("key") or "").strip()
    if not re.fullmatch(r"(?=.{4,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}", domain):
        return False, "دامنه نامعتبر است."
    if "BEGIN CERTIFICATE" not in cert or "PRIVATE KEY" not in key:
        return False, "گواهی و کلید باید با قالب PEM باشند."
    tmpd = os.path.join(TLS, "new")
    os.makedirs(tmpd, exist_ok=True)
    open(os.path.join(tmpd, "cert.pem"), "w").write(cert + "\n")
    fd = os.open(os.path.join(tmpd, "key.pem"), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as fh:
        fh.write(key + "\n")
    a = subprocess.run(["openssl", "x509", "-in", tmpd + "/cert.pem", "-noout", "-pubkey"], capture_output=True, text=True)
    b = subprocess.run(["openssl", "pkey", "-in", tmpd + "/key.pem", "-pubout"], capture_output=True, text=True)
    if a.returncode or b.returncode or a.stdout.strip() != b.stdout.strip():
        shutil.rmtree(tmpd, ignore_errors=True)
        return False, "کلید خصوصی با گواهی جور نیست."
    backup_selfsigned()
    os.replace(tmpd + "/cert.pem", TLS + "/cert.pem")
    os.replace(tmpd + "/key.pem", TLS + "/key.pem")
    shutil.rmtree(tmpd, ignore_errors=True)
    msg = set_domain(domain, "", lambda m: None)
    return True, "گواهی نصب شد. " + msg


ACTIONS = {
    "/setup/liara": act_liara, "/setup/server": act_server, "/setup/alerts": act_alerts,
    "/setup/alerts-test": act_alerts_test, "/setup/run-job": act_run_job, "/setup/link-newkey": act_link_newkey,
    "/setup/link-iran": act_link_iran, "/setup/link-foreign": act_link_foreign, "/setup/telegram": act_telegram,
    "/setup/link-bundle": act_link_bundle, "/setup/transfer-direct": act_transfer_direct,
    "/setup/domain": act_domain, "/setup/cert": act_cert,
}
