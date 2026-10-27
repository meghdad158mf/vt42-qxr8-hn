#!/usr/bin/env python3
"""صفحه‌ی راه‌اندازی سرور جریان — https://<سرور>/setup/

ورود با همان «کلید اضطراری» صفحه‌ی /update. کارها:
  وضعیت (پایگاه داده، رابط برنامه، سرویس پیامک)، رمز مدیر و بیننده، تنظیم پیامک،
  مدیران (نام، موبایل، کد ملی)، و آزمون واقعی ورود (کد ملی ← پیامک ← کد) از همان
  راهی که سایت می‌رود (رابط برنامه با کلید عمومی).
تا وقتی سایت روی سرور نیست (مرحله‌ی ۳)، تنها راه ساختن نخستین مدیر همین صفحه است.
"""
import base64
import html
import http.server
import json
import os
import re
import secrets
import shutil
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srvlib as S  # noqa: E402
import setup_more  # noqa: E402

LISTEN = os.environ.get("JARYAN_SETUP_LISTEN", "127.0.0.1:8091")
HEARTBEAT = os.environ.get("JARYAN_NET_HEARTBEAT", S.ROOT + "/run/jaryan-net/alive")
SESSION_TTL = 30 * 60
# نقش مدیر برای همین تراکنش (تابع‌های سایت نقش را از request.jwt.claims می‌خوانند)؛ خروجی ندارد
ADMIN_CLAIMS = "do $$ begin perform set_config('request.jwt.claims', '{\"role\":\"app_admin\"}', true); end $$;\n"

_sessions = {}
_fails = {}
_lock = threading.Lock()


# ---------------------------------------------------------------- ابزارها

def esc(s):
    return html.escape("" if s is None else str(s), quote=True)


def ltr(s):
    return f'<bdi dir="ltr">{esc(s)}</bdi>'


FA_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def digits(s):
    return re.sub(r"\D", "", (s or "").translate(FA_DIGITS))


def norm_mobile(v):
    d = re.sub(r"[^\d+]", "", (v or "").translate(FA_DIGITS)).lstrip("+")
    if d.startswith("0098"):
        d = d[4:]
    elif d.startswith("98") and len(d) == 12:
        d = d[2:]
    if re.fullmatch(r"9\d{9}", d):
        d = "0" + d
    return d


def fa_num(n):
    return str(n).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def login_blocked(ip):
    t = time.time()
    recent = [x for x in _fails.get(ip, []) if t - x < 15 * 60]
    _fails[ip] = recent
    # فقط همان نشانی قفل می‌شود (۱.۱.۲). قفل سراسری قبلی (۲۰ خطا در ساعت از هر جا) به هر کسی اجازه
    # می‌داد مدیر را بیرون نگه دارد؛ کلید اضطراری ۲۴ نویسه‌ای است و حدس زدنش با این سرعت شدنی نیست.
    for k in [k for k, v in _fails.items() if not v or t - v[-1] > 3600]:
        _fails.pop(k, None)
    return len(recent) >= 5


def sql_json(sql, admin=False):
    out = S.psql((ADMIN_CLAIMS if admin else "") + sql).strip()
    return json.loads(out) if out else None


def api_call(fn, args, ip):
    """صدا زدن یک تابع از راه رابط برنامه (PostgREST)، دقیقاً مثل سایت."""
    sec = S.load_secrets()
    req = urllib.request.Request(
        f"{S.API}/rpc/{fn}", data=json.dumps(args).encode(), method="POST",
        headers={"Content-Type": "application/json", "apikey": sec["anon_key"],
                 "Authorization": "Bearer " + sec["anon_key"], "X-Real-IP": ip,
                 "User-Agent": "jaryan-setup/1 (login test)"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except ValueError:
            return e.code, None
    except (urllib.error.URLError, OSError) as e:
        return 0, {"error": "api_down", "detail": str(e)}


def jwt_claims(token):
    try:
        part = token.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
    except Exception:  # noqa: BLE001
        return {}


ERRORS = {
    "invalid_nid": "کد ملی معتبر نیست (رقم کنترل).",
    "not_found": "کاربری با این کد ملی پیدا نشد یا غیرفعال است.",
    "no_phone": "برای این کاربر شماره‌ی موبایل ثبت نشده است.",
    "wait": "کد قبلی کمتر از یک دقیقه پیش فرستاده شد؛ {retry_after} ثانیه صبر کنید.",
    "user_limit": "بیش از ۵ کد در یک ساعت برای این کاربر؛ بعداً امتحان کنید.",
    "ip_limit": "سقف درخواست کد از این نشانی اینترنتی پر شده است.",
    "global_limit": "سقف درخواست کد کل سامانه پر شده است.",
    "sms_not_configured": "پیامک تنظیم نشده است (بخش «پیامک» در همین صفحه).",
    "expired": "کد منقضی شده یا قبلاً استفاده شده است؛ دوباره کد بگیرید.",
    "invalid_code": "کد اشتباه است ({left} بار دیگر فرصت).",
    "locked": "ورود از این نشانی اینترنتی موقتاً قفل است ({retry_after} ثانیه).",
    "inactive": "حساب این کاربر غیرفعال است.",
    "invalid": "کد ملی یا رمز عبور درست نیست.",
    "invalid password": "رمز عبور درست نیست.",
    "api_down": "رابط برنامه پاسخ نمی‌دهد (سرویس jaryan-api).",
}


def err_text(body):
    if not isinstance(body, dict):
        return "پاسخ نامعلوم از رابط برنامه."
    code = body.get("error") or body.get("message") or ""
    if code not in ERRORS:
        return esc("خطا: " + str(code or body))
    return ERRORS[code].format(retry_after=fa_num(body.get("retry_after", "")), left=fa_num(body.get("left", "")))


# ---------------------------------------------------------------- وضعیت

def status():
    st = {}
    try:
        st["migrations"] = int(S.q1("select count(*) from jaryan_meta.applied"))
        st["db"] = True
    except Exception as e:  # noqa: BLE001
        st["db"], st["db_err"] = False, str(e)[:300]
    try:
        with urllib.request.urlopen(S.API_ADMIN + "/ready", timeout=5) as r:
            st["api"] = r.status == 200
    except Exception:  # noqa: BLE001
        st["api"] = False
    try:
        with open(HEARTBEAT) as f:
            st["net_age"] = int(time.time()) - int(f.read().strip() or 0)
    except (OSError, ValueError):
        st["net_age"] = None
    if st["db"]:
        st.update(sql_json("""select json_build_object(
          'sms', (select count(*) from app_config where key in ('sms_api_key','sms_body_id') and coalesce(value,'') <> '') = 2,
          'body_id', (select value from app_config where key = 'sms_body_id'),
          'admins', coalesce((select json_agg(x order by x.id) from (
              select a.id, a.full_name, a.phone, a.national_id_last4, a.active
                from app_users a where a.is_admin) x), '[]'::json),
          'users', (select count(*) from app_users),
          'tables', (select count(*) from pg_tables where schemaname = 'public'),
          'pw', (select json_object_agg(key, true) from app_config
                  where key in ('server_admin_pw_set', 'server_viewer_pw_set'))
        )"""))
    return st


# ---------------------------------------------------------------- صفحه‌ها

CSS = """
*{box-sizing:border-box}body{margin:0;font-family:Tahoma,'Segoe UI',sans-serif;background:#eef1f5;color:#16202a;line-height:1.8}
header{background:#16202a;color:#fff;padding:14px 20px;display:flex;align-items:center;gap:12px}
header b{font-size:17px}header span{color:#EAB393;font-size:13px}header form{margin-inline-start:auto}
main{max-width:860px;margin:0 auto;padding:16px}
section{background:#fff;border-radius:14px;padding:16px 18px;margin-bottom:14px;box-shadow:0 1px 3px rgba(22,32,42,.08)}
h2{font-size:16px;margin:0 0 10px}table{width:100%;border-collapse:collapse;font-size:14px}
td,th{padding:7px 6px;border-bottom:1px solid #e3e8ee;text-align:start;vertical-align:top}
button{font:inherit;font-size:14px;border:0;border-radius:999px;padding:7px 16px;background:#16202a;color:#fff;cursor:pointer}
button.light{background:#eef1f5;color:#16202a}
input,select{font:inherit;padding:8px 12px;border:1px solid #cfd6df;border-radius:10px;min-width:0}
input.ltr{direction:ltr}label{display:flex;flex-direction:column;gap:2px;font-size:13px;flex:1 1 180px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
.ok{color:#127a3a}.bad{color:#b42318}.warn{color:#9a6200}.muted{color:#5b6472;font-size:13px}
.flash{border-radius:12px;padding:10px 14px;margin-bottom:14px}.flash.ok{background:#e7f6ec}.flash.bad{background:#fdecea}
.steps{margin:0;padding-inline-start:20px}
"""


def page(body, sess=None, head=""):
    out = ""
    if sess:
        out = (f'<form method="post" action="/setup/logout"><input type="hidden" name="csrf" value="{esc(sess["csrf"])}">'
               '<button class="light">خروج</button></form>')
    return f"""<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>راه‌اندازی سرور جریان</title><style>{CSS}</style>{head}</head><body>
<header><b>راه‌اندازی سرور جریان</b><span>نصب، اتصال و انتقال</span>{out}</header><main>{body}</main></body></html>"""


def login_page(msg=""):
    m = f'<div class="flash bad">{esc(msg)}</div>' if msg else ""
    return page(f"""{m}<section><h2>ورود</h2>
<p class="muted">همان کلید اضطراری صفحه‌ی <bdi dir="ltr">/update</bdi> را وارد کنید.</p>
<form method="post" action="/setup/login" class="row">
<label>کلید اضطراری<input class="ltr" type="password" name="key" autocomplete="off" autofocus></label>
<button>ورود</button></form></section>""")


def dot(ok, warn=False):
    return '<b class="ok">✔</b>' if ok else ('<b class="warn">●</b>' if warn else '<b class="bad">✘</b>')


def dashboard(sess, nonce=""):
    st = status()
    flash = ""
    if sess.get("flash"):
        ok, msg = sess.pop("flash")
        flash = f'<div class="flash {"ok" if ok else "bad"}">{msg}</div>'
    csrf = f'<input type="hidden" name="csrf" value="{esc(sess["csrf"])}">'
    net_ok = st.get("net_age") is not None and st["net_age"] < 30
    rows = [
        (dot(st["db"]), "پایگاه داده",
         f'{fa_num(st.get("migrations", 0))} فایل migration اجرا شده، {fa_num(st.get("tables", 0))} جدول'
         if st["db"] else esc(st.get("db_err", ""))),
        (dot(st["api"]), "رابط برنامه (سرویس jaryan-api)", "آماده" if st["api"] else "پاسخ نمی‌دهد"),
        (dot(net_ok), "سرویس ارسال (jaryan-net)",
         "روشن" if net_ok else "خاموش یا گیر کرده — پیامک فرستاده نمی‌شود"),
    ]
    if st["db"]:
        admins_ok = [a for a in st["admins"] if a["active"] and a["national_id_last4"]]
        pw = st.get("pw") or {}
        rows += [
            (dot(st["sms"], True), "پیامک", "تنظیم شده" if st["sms"] else "تنظیم نشده (بخش «پیامک»)"),
            (dot(bool(admins_ok), True), "مدیر با کد ملی",
             f"{fa_num(len(admins_ok))} نفر" if admins_ok else "هنوز نیست (بخش «مدیران»)"),
            (dot(bool(pw.get("server_admin_pw_set")), True), "رمز مدیر",
             "گذاشته شده" if pw.get("server_admin_pw_set") else "هنوز گذاشته نشده (بخش «رمزها»)"),
        ]
    stat = "".join(f"<tr><td>{a}</td><td>{b}</td><td>{c}</td></tr>" for a, b, c in rows)
    body = f"""{flash}<section><h2>وضعیت</h2><table>{stat}</table>
<p class="muted">ترتیب پیشنهادی: ۱) رمز مدیر ← ۲) پیامک ← ۳) افزودن مدیر ← ۴) آزمون ورود.</p></section>"""
    if not st["db"]:
        return page(body, sess)

    admins = "".join(
        f'<tr><td>{esc(a["full_name"])}</td><td>{ltr(a["phone"] or "—")}</td>'
        f'<td>{ltr("••••••" + a["national_id_last4"]) if a["national_id_last4"] else "<span class=bad>ندارد</span>"}</td>'
        f'<td>{"فعال" if a["active"] else "<span class=muted>غیرفعال</span>"}</td>'
        f'<td><form method="post" action="/setup/admin-toggle">{csrf}<input type="hidden" name="id" value="{a["id"]}">'
        f'<button class="light">{"غیرفعال کردن" if a["active"] else "فعال کردن"}</button></form></td></tr>'
        for a in st["admins"]) or '<tr><td colspan="5" class="muted">هنوز مدیری ثبت نشده است.</td></tr>'

    otp = ""
    if sess.get("otp"):
        o = sess["otp"]
        otp = f"""<form method="post" action="/setup/test-code" class="row" style="margin-top:10px">{csrf}
<label>کد پیامک‌شده به {ltr(o["hint"])}<input class="ltr" name="code" inputmode="numeric" autocomplete="one-time-code"></label>
<button>بررسی کد</button></form>"""
    smsres = ""
    if sess.get("sms_req"):
        smsres = f"""<form method="post" action="/setup/sms-result" class="row" style="margin-top:8px">{csrf}
<button class="light">دیدن نتیجه‌ی پیامک آزمایشی</button></form>"""

    body += f"""
<section><h2>۱. رمزها</h2>
<p class="muted">رمز مدیر برای «ورود با رمز عبور» مدیران (همراه کد ملی) و ورود اضطراری است. رمز بیننده فقط وقتی «ورود اضطراری» روشن باشد کار می‌کند. حداقل ۱۰ نویسه.</p>
<form method="post" action="/setup/password" class="row">{csrf}
<label>کدام<select name="role"><option value="admin">رمز مدیر</option><option value="viewer">رمز بیننده</option></select></label>
<label>رمز تازه<input class="ltr" type="password" name="pw" autocomplete="new-password"></label>
<label>تکرار رمز<input class="ltr" type="password" name="pw2" autocomplete="new-password"></label>
<button>ذخیره</button></form></section>

<section><h2>۲. پیامک (ملی‌پیامک)</h2>
<p class="muted">کلید وب‌سرویس کنسول ملی‌پیامک و شماره‌ی الگوی کد ورود. کلید فقط نوشتنی است و دوباره نشان داده نمی‌شود. شماره‌ی الگوی فعلی: {ltr(st.get("body_id") or "—")}</p>
<form method="post" action="/setup/sms" class="row">{csrf}
<label>کلید وب‌سرویس<input class="ltr" type="password" name="key" autocomplete="off" placeholder="خالی = بدون تغییر"></label>
<label>شماره‌ی الگو<input class="ltr" name="body" inputmode="numeric" value="{esc(st.get("body_id") or "")}"></label>
<button>ذخیره</button></form>
<form method="post" action="/setup/sms-test" class="row" style="margin-top:10px">{csrf}
<label>پیامک آزمایشی به (کد ۱۲۳۴۵)<input class="ltr" name="phone" inputmode="tel" placeholder="09…"></label>
<button class="light">فرستادن</button></form>{smsres}</section>

<section><h2>۳. مدیران</h2>
<table><tr><th>نام</th><th>موبایل</th><th>کد ملی</th><th>وضعیت</th><th></th></tr>{admins}</table>
<p class="muted" style="margin-top:12px">افزودن یا به‌روزرسانی مدیر (اگر موبایل از قبل ثبت باشد همان کاربر مدیر می‌شود). کد ملی فقط به‌صورت رمزنگاری‌شده نگه داشته می‌شود.</p>
<form method="post" action="/setup/admin" class="row">{csrf}
<label>نام و نام خانوادگی<input name="name"></label>
<label>موبایل<input class="ltr" name="phone" inputmode="tel" placeholder="09…"></label>
<label>کد ملی<input class="ltr" name="nid" inputmode="numeric" autocomplete="off"></label>
<button>ذخیره</button></form></section>

<section><h2>۴. آزمون ورود</h2>
<p class="muted">از همان راهی که سایت می‌رود. پیامک واقعی فرستاده می‌شود و در «ورودها» ثبت می‌شود.</p>
<form method="post" action="/setup/test-otp" class="row">{csrf}
<label>کد ملی<input class="ltr" name="nid" inputmode="numeric" autocomplete="off"></label>
<button>دریافت کد پیامکی</button></form>{otp}
<form method="post" action="/setup/test-pass" class="row" style="margin-top:14px">{csrf}
<label>کد ملی مدیر<input class="ltr" name="nid" inputmode="numeric" autocomplete="off"></label>
<label>رمز مدیر<input class="ltr" type="password" name="pw" autocomplete="off"></label>
<button class="light">ورود با رمز عبور</button></form></section>"""
    try:
        body += setup_more.sections(csrf, nonce)
    except Exception as e:  # noqa: BLE001 — بخش‌های تازه نباید کل صفحه را بیندازند
        body += f'<section class="bad">بخش‌های تکمیلی نمایش داده نشد: {esc(e)}</section>'
    return page(body, sess, setup_more.refresh_meta())


# ---------------------------------------------------------------- کارها

def act_password(f):
    role = f.get("role")
    pw = f.get("pw", "")
    if role not in ("admin", "viewer"):
        return False, "نقش نامعتبر."
    if len(pw) < 10:
        return False, "رمز باید دست‌کم ۱۰ نویسه باشد."
    if pw != f.get("pw2", ""):
        return False, "رمز و تکرارش یکی نیستند."
    S.psql(f"""update app_config set value = extensions.crypt({S.lit(pw)}, extensions.gen_salt('bf'))
                where key = '{role}_password_hash';
               insert into app_config (key, value) values ('server_{role}_pw_set', now()::text)
               on conflict (key) do update set value = excluded.value;""")
    return True, ("رمز مدیر" if role == "admin" else "رمز بیننده") + " ذخیره شد."


def act_sms(f):
    r = sql_json(f"select public.sms_config_set({S.lit(f.get('key', '').strip())}, {S.lit(f.get('body', ''))})",
                 admin=True)
    if r and r.get("error") == "invalid_key":
        return False, "کلید وب‌سرویس معتبر نیست (فقط حروف انگلیسی، عدد، - و _)."
    return True, "تنظیمات پیامک ذخیره شد."


def act_sms_test(f, sess):
    r = sql_json(f"select public.sms_test({S.lit(f.get('phone', ''))})", admin=True) or {}
    if r.get("error") == "invalid_phone":
        return False, "شماره‌ی موبایل معتبر نیست."
    if r.get("error"):
        return False, err_text(r)
    sess["sms_req"] = r["req_id"]
    return True, "پیامک در صف ارسال است؛ چند ثانیه بعد «دیدن نتیجه» را بزنید."


def act_sms_result(sess):
    rid = sess.get("sms_req")
    if not rid:
        return False, "پیامک آزمایشی‌ای فرستاده نشده است."
    r = sql_json(f"select public.sms_test_result({int(rid)})", admin=True) or {}
    if r.get("pending"):
        return False, "هنوز پاسخی نیامده است؛ چند ثانیه دیگر دوباره بزنید (سرویس jaryan-net روشن است؟)."
    ok = r.get("status_code") is not None and 200 <= r["status_code"] < 300
    return ok, f"پاسخ وب‌سرویس: {ltr(r.get('status_code') or '—')} — {esc(r.get('reply') or '')}"


def act_admin(f):
    name = (f.get("name") or "").strip()
    phone = norm_mobile(f.get("phone"))
    nid = digits(f.get("nid"))
    if not name:
        return False, "نام را بنویسید."
    if not re.fullmatch(r"09\d{9}", phone):
        return False, "موبایل باید به شکل ۰۹xxxxxxxxx باشد."
    r = sql_json(f"""
with u as (
  insert into app_users (full_name, phone, is_admin, active, access_level)
  values ({S.lit(name)}, {S.lit(phone)}, true, true, 'plus')
  on conflict (phone) where phone is not null
  do update set full_name = excluded.full_name, is_admin = true, active = true
  returning id)
select public.set_user_national_id((select id from u), {S.lit(nid)});""", admin=True) or {}
    if r.get("error") == "invalid":
        return False, "کد ملی معتبر نیست (رقم کنترل). مدیر ثبت شد ولی کد ملی نه؛ دوباره با کد ملی درست ذخیره کنید."
    if r.get("error") == "duplicate":
        return False, "این کد ملی برای کاربر دیگری ثبت شده است."
    if not nid:
        return True, "مدیر ثبت شد، بدون کد ملی (برای ورود کد ملی لازم است)."
    return True, f"مدیر «{esc(name)}» ثبت شد (کد ملی ••••••{ltr(r.get('last4', ''))})."


def act_admin_toggle(f):
    uid = int(digits(f.get("id")) or 0)
    S.psql(ADMIN_CLAIMS + f"update app_users set active = not active where id = {uid} and is_admin")
    return True, "وضعیت مدیر عوض شد."


def act_test_otp(f, sess, ip):
    nid = digits(f.get("nid"))
    code, body = api_call("otp_request", {"p_nid": nid}, ip)
    if isinstance(body, dict) and body.get("choose"):
        if not body.get("sms"):
            return False, "این کاربر مدیر است ولی موبایل ندارد؛ فقط «ورود با رمز عبور» ممکن است."
        code, body = api_call("otp_request", {"p_nid": nid, "p_method": "sms"}, ip)
    if code == 200 and isinstance(body, dict) and body.get("otp_id"):
        sess["otp"] = {"id": body["otp_id"], "hint": body.get("phone_hint", "")}
        return True, f"کد فرستاده شد به {ltr(body.get('phone_hint', ''))}. کد را پایین وارد کنید (۲ دقیقه)."
    return False, err_text(body)


def act_test_code(f, sess, ip):
    o = sess.get("otp")
    if not o:
        return False, "اول کد بگیرید."
    code, body = api_call("login_otp", {"p_otp_id": o["id"], "p_code": digits(f.get("code"))}, ip)
    if code == 200 and isinstance(body, dict) and body.get("token"):
        sess.pop("otp", None)
        role = "مدیر" if jwt_claims(body["token"]).get("role") == "app_admin" else "بیننده"
        return True, f"ورود با پیامک موفق بود: {esc(body.get('name', ''))}، نقش {role}."
    if isinstance(body, dict) and body.get("error") == "expired":
        sess.pop("otp", None)
    return False, err_text(body)


def act_test_pass(f, ip):
    code, body = api_call("login_admin", {"p_nid": digits(f.get("nid")), "p_password": f.get("pw", "")}, ip)
    if code == 200 and isinstance(body, dict) and body.get("token"):
        return True, f"ورود با رمز عبور موفق بود: {esc(body.get('name', ''))}، نقش مدیر."
    return False, err_text(body)


# ---------------------------------------------------------------- HTTP

class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "jaryan-setup"

    def log_message(self, fmt, *args):
        pass

    def client_ip(self):
        return (self.headers.get("X-Real-IP") or self.client_address[0])[:64]

    def session(self):
        for part in (self.headers.get("Cookie") or "").split(";"):
            k, _, v = part.strip().partition("=")
            if k == "jsetup" and v in _sessions:
                s = _sessions[v]
                if s["exp"] > time.time():
                    s["exp"] = time.time() + SESSION_TTL
                    return v, s
                _sessions.pop(v, None)
        return None, None

    def send(self, code, body, ctype="text/html; charset=utf-8", headers=None):
        data = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; "
                         f"connect-src 'self'; script-src 'nonce-{getattr(self, 'nonce', 'none')}'")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def redirect(self, headers=None):
        h = {"Location": "/setup/"}
        h.update(headers or {})
        self.send(303, "", headers=h)

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path).path
        if path == "/setup/health":
            st = status()
            ok = st["db"] and st["api"]
            return self.send(200 if ok else 503, json.dumps({"db": st["db"], "api": st["api"]}),
                             "application/json")
        if path not in ("/setup", "/setup/"):
            return self.send(404, page("<section>صفحه پیدا نشد.</section>"))
        _, sess = self.session()
        if path == "/setup/download/link-bundle":
            fp = os.path.join(setup_more.UPLOADS, "link-bundle.jaryanlink")
            if not sess or not os.path.isfile(fp):
                return self.send(404, page("<section>پیدا نشد.</section>"))
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Disposition", 'attachment; filename="jaryan-link-' + time.strftime("%Y%m%d-%H%M") + '.jaryanlink"')
            self.send_header("Content-Length", str(os.path.getsize(fp)))
            self.end_headers()
            with open(fp, "rb") as f:
                while True:
                    chunk = f.read(1 << 20)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
            return
        if not sess:
            return self.send(200, login_page())
        self.nonce = secrets.token_urlsafe(12)
        with _lock:
            body = dashboard(sess, self.nonce)
        self.send(200, body)

    def do_POST(self):
        path = urllib.parse.urlsplit(self.path).path
        n = int(self.headers.get("Content-Length") or 0)
        if path.startswith("/setup/upload/"):
            return self.upload(path.rsplit("/", 1)[-1], n)
        if n > 20000:
            return self.send(413, page("<section>درخواست بزرگ است.</section>"))
        form = {k: v[0] for k, v in urllib.parse.parse_qs(self.rfile.read(n).decode("utf-8", "replace")).items()}
        ip = self.client_ip()
        if path == "/setup/login":
            if login_blocked(ip):
                return self.send(429, login_page("تلاش‌های ناموفق زیاد بود؛ ۱۵ دقیقه بعد دوباره امتحان کنید."))
            if not S.check_updater_key(form.get("key", "")):
                _fails.setdefault(ip, []).append(time.time())
                time.sleep(1)
                return self.send(401, login_page("کلید درست نیست."))
            _fails.pop(ip, None)
            tok = secrets.token_urlsafe(32)
            _sessions[tok] = {"exp": time.time() + SESSION_TTL, "csrf": secrets.token_urlsafe(16)}
            secure = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""
            return self.redirect({"Set-Cookie": f"jsetup={tok}; Path=/setup/; HttpOnly; SameSite=Strict{secure}"})
        tok, sess = self.session()
        if not sess or not secrets.compare_digest(form.get("csrf", ""), sess["csrf"]):
            return self.send(403, login_page("نشست منقضی شده است؛ دوباره وارد شوید."))
        if path == "/setup/logout":
            _sessions.pop(tok, None)
            return self.redirect({"Set-Cookie": "jsetup=; Path=/setup/; Max-Age=0"})
        actions = {
            "/setup/password": lambda: act_password(form),
            "/setup/sms": lambda: act_sms(form),
            "/setup/sms-test": lambda: act_sms_test(form, sess),
            "/setup/sms-result": lambda: act_sms_result(sess),
            "/setup/admin": lambda: act_admin(form),
            "/setup/admin-toggle": lambda: act_admin_toggle(form),
            "/setup/test-otp": lambda: act_test_otp(form, sess, ip),
            "/setup/test-code": lambda: act_test_code(form, sess, ip),
            "/setup/test-pass": lambda: act_test_pass(form, ip),
        }
        for k, fn in setup_more.ACTIONS.items():
            actions[k] = (lambda fn=fn: fn(form, sess))
        if path not in actions:
            return self.send(404, page("<section>صفحه پیدا نشد.</section>"))
        with _lock:
            try:
                sess["flash"] = actions[path]()
            except S.DbError as e:
                sess["flash"] = (False, "خطای پایگاه داده: " + esc(str(e)[:400]))
            except Exception as e:  # noqa: BLE001 — صفحه نیفتد؛ خطا را نشان بده
                sess["flash"] = (False, "خطا: " + esc(f"{e.__class__.__name__}: {e}"[:400]))
        self.redirect()


def _upload(self, kind, n):
    _, sess = self.session()
    if not sess or not secrets.compare_digest(self.headers.get("X-CSRF", ""), sess["csrf"]):
        return self.send(403, "forbidden", "text/plain")
    if kind not in ("transfer", "link") or n <= 0 or n > 4 * 1024 ** 3:
        return self.send(400, "bad request", "text/plain")
    os.makedirs(setup_more.UPLOADS, exist_ok=True)
    os.chmod(setup_more.UPLOADS, 0o700)
    if shutil.disk_usage(setup_more.UPLOADS).free < n * 3 + (1 << 30):
        sess["flash"] = (False, "فضای خالی دیسک برای این فایل کافی نیست.")
        return self.send(507, "no space", "text/plain")
    fp = os.path.join(setup_more.UPLOADS, f"{kind}-{secrets.token_hex(4)}.upload")
    left = n
    with open(fp, "wb") as f:
        while left > 0:
            chunk = self.rfile.read(min(left, 1 << 20))
            if not chunk:
                break
            f.write(chunk)
            left -= len(chunk)
    if left:
        os.remove(fp)
        return self.send(400, "incomplete", "text/plain")
    pw = urllib.parse.unquote(self.headers.get("X-Password", ""))
    if kind == "transfer" and not pw:
        os.remove(fp)
        sess["flash"] = (False, "رمز فایل داده را بنویسید.")
        return self.send(400, "password", "text/plain")
    started = setup_more.upload_done(kind, fp, pw)
    sess["flash"] = ((True, "فایل رسید؛ کار در پس‌زمینه شروع شد.") if started
                     else (False, "کار دیگری در حال انجام است؛ بعداً دوباره بارگذاری کنید."))
    if not started:
        os.remove(fp)
    self.send(200, "ok", "text/plain")


Handler.upload = _upload


def main():
    host, port = LISTEN.rsplit(":", 1)
    srv = http.server.ThreadingHTTPServer((host, int(port)), Handler)
    srv.daemon_threads = True
    srv.serve_forever()


if __name__ == "__main__":
    main()
