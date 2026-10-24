#!/usr/bin/env python3
"""آزمون سرتاسری سرور جریان روی یک Ubuntu واقعی با systemd (ورک‌فلوی server-e2e).

پیش‌نیاز: نصب پایه (server/install.sh) انجام شده و کلید اضطراری در فایل است.
  sudo python3 tests/server/e2e_client.py <کلید-فایل> <بسته‌ی سالم> <بسته‌ی خراب>

همان کارهایی را می‌کند که کاربر در مرورگر می‌کند: ورود به /update، بارگذاری و نصب
بسته، بعد /setup (رمز، پیامک، مدیر، آزمون ورود با رمز و پیامک)، و نصب یک بسته‌ی
خراب که باید خودکار برگردد بی‌آنکه داده‌ای از دست برود.
"""
import glob
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


def main(keyfile, good, broken):
    global ANON
    key = open(keyfile).read().strip()
    print("== نصب بسته‌ی سالم")
    op, csrf = update_login(key)
    st = install(op, csrf, good)
    check(st["job"]["result"]["ok"], "نصب بسته: " + st["job"]["result"]["msg"])
    check(st["current"].startswith("1."), "نسخه‌ی فعال " + st["current"])
    for svc in ("jaryan-api", "jaryan-net", "jaryan-setup"):
        check(sh(f"systemctl is-active {svc}") == "active", f"سرویس {svc} روشن است")
    check(sql("select count(*) from jaryan_meta.applied") == "53", "همه‌ی ۵۳ فایل پایگاه داده اجرا شدند")
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
    print("== راه‌اندازی دوباره‌ی سرویس‌ها")
    sh("systemctl restart postgresql jaryan-api jaryan-net jaryan-setup")
    time.sleep(6)
    code, body = rpc("login_admin", {"p_nid": "0013542419", "p_password": "Test-Admin-Pass-1"})
    check(code == 200 and "token" in body, "بعد از راه‌اندازی دوباره، ورود کار می‌کند")

    print("== بسته‌ی خراب (باید خودکار برگردد)")
    op, csrf = update_login(key)
    before = sql("select count(*) from app_users")
    st = install(op, csrf, broken)
    check(not st["job"]["result"]["ok"] and "برگشت داده شد" in st["job"]["result"]["msg"],
          "نصب خراب برگشت خورد: " + st["job"]["result"]["msg"])
    check(st["current"].startswith("1.0.0"), "نسخه‌ی فعال دوباره " + st["current"])
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
