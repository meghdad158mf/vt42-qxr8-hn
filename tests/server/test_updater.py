"""آزمون به‌روزرسان سرور: نصب، برگشت خودکار، برگشت دستی، امضا، ورود و قفل.

بدون systemd و پایگاه داده (JARIAN_ROOT = پوشه‌ی موقت)؛ «سایت» یک سرور ساده‌ی
پایتون روی همان پوشه‌ی current/site است تا بررسی سلامت واقعی انجام شود.
اجرا: python3 -m unittest discover -s tests/server
"""
import http.cookiejar
import http.server
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
UPDATER = os.path.join(REPO, "server", "updater", "jarian_updater.py")
MAKE = os.path.join(REPO, "server", "tools", "make_package.py")


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class SiteHandler(http.server.BaseHTTPRequestHandler):
    root = ""

    def log_message(self, *a):
        pass

    def do_GET(self):
        # «سایت» سالم است اگر current/site/index.html وجود داشته باشد و BROKEN نداشته باشد
        p = os.path.join(self.root, "opt/jarian/current/site/index.html")
        try:
            body = open(p, "rb").read()
        except OSError:
            self.send_response(502); self.end_headers(); return
        if b"BROKEN" in body:
            self.send_response(500); self.end_headers(); return
        self.send_response(200); self.end_headers(); self.wfile.write(body)


class UpdaterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = tempfile.mkdtemp()
        cls.site_port = free_port()
        SiteHandler.root = cls.root
        cls.site = http.server.ThreadingHTTPServer(("127.0.0.1", cls.site_port), SiteHandler)
        threading.Thread(target=cls.site.serve_forever, daemon=True).start()
        cls.port = free_port()
        cls.env = dict(os.environ, JARIAN_ROOT=cls.root, JARIAN_UPDATER_LISTEN=f"127.0.0.1:{cls.port}",
                       JARIAN_HEALTH_BASE=f"http://127.0.0.1:{cls.site_port}", JARIAN_HEALTH_WAIT="8", PYTHONUNBUFFERED="1")
        # نسخه‌ی پایه مثل install.sh
        base = os.path.join(cls.root, "opt/jarian/releases/0.0.0-base/site")
        os.makedirs(base)
        open(os.path.join(base, "index.html"), "w").write("base")
        os.symlink(os.path.join(cls.root, "opt/jarian/releases/0.0.0-base"), os.path.join(cls.root, "opt/jarian/current"))
        cls.key = subprocess.run([sys.executable, UPDATER, "new-key"], capture_output=True, text=True, env=cls.env).stdout.strip()
        subprocess.run([sys.executable, UPDATER, "set-key"], input=cls.key + "\n", text=True, env=cls.env, check=True)
        cls.proc = subprocess.Popen([sys.executable, UPDATER, "serve"], env=cls.env,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            try:
                urllib.request.urlopen(cls.url("/update/ping"), timeout=1); break
            except Exception:
                time.sleep(0.1)

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate(); cls.proc.wait()
        cls.site.shutdown()
        shutil.rmtree(cls.root, ignore_errors=True)

    @classmethod
    def url(cls, p):
        return f"http://127.0.0.1:{cls.port}{p}"

    def opener(self):
        jar = http.cookiejar.CookieJar()
        return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def login(self, key=None, ip="10.0.0.1"):
        op = self.opener()
        req = urllib.request.Request(self.url("/update/login"),
                                     data=urllib.parse.urlencode({"key": key or self.key}).encode(),
                                     headers={"X-Real-IP": ip})
        try:
            r = op.open(req)
            page = r.read().decode()
        except urllib.error.HTTPError as e:
            return None, e.code, e.read().decode()
        import re
        m = re.search(r'const CSRF="([^"]+)"', page)
        return op, 200, m.group(1) if m else page

    def pkg(self, version, index_body, sign=None, tamper=False, hook=None):
        src = tempfile.mkdtemp()
        os.makedirs(os.path.join(src, "site"))
        open(os.path.join(src, "site/index.html"), "w").write(index_body)
        if hook:
            os.makedirs(os.path.join(src, "hooks"))
            open(os.path.join(src, "hooks/activate"), "w").write(hook)
        out = os.path.join(tempfile.mkdtemp(), f"{version}.jarian")
        cmd = [sys.executable, MAKE, "--src", src, "--version", version, "--note", "آزمون " + version, "--out", out]
        if sign:
            cmd += ["--sign", sign]
        subprocess.run(cmd, check=True, capture_output=True)
        if tamper:   # یک بایت از payload را عوض کن
            data = bytearray(open(out, "rb").read())
            i = data.find(b"payload.tar.gz") + 600
            data[i] ^= 0xFF
            open(out, "wb").write(bytes(data))
        return out

    def upload(self, op, csrf, path):
        req = urllib.request.Request(self.url("/update/upload"), data=open(path, "rb").read(),
                                     headers={"X-CSRF": csrf, "Content-Type": "application/octet-stream"})
        try:
            return 200, json.loads(op.open(req).read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def install(self, op, csrf, resp):
        import re
        uid = re.search(r'name="id" value="([^"]+)"', resp["html"]).group(1)
        op.open(urllib.request.Request(self.url("/update/install"),
                                       data=urllib.parse.urlencode({"csrf": csrf, "id": uid}).encode()))
        return self.wait(op)

    def wait(self, op):
        for _ in range(400):
            st = json.loads(op.open(self.url("/update/status.json")).read())
            if not st["job"]["running"] and st["job"]["result"]:
                return st
            time.sleep(0.25)
        self.fail("کار تمام نشد")

    def current_body(self):
        return open(os.path.join(self.root, "opt/jarian/current/site/index.html")).read()

    # ---- آزمون‌ها (به ترتیب نام اجرا می‌شوند)

    def test_1_login_and_lockout(self):
        op, code, _ = self.login(key="AAAA-BBBB-CCCC-DDDD-EEEE-FFFF", ip="10.9.9.9")
        self.assertEqual(code, 401)
        for _ in range(4):
            self.login(key="WRONG-WRONG-WRONG-WRONG", ip="10.9.9.9")
        _, code, _ = self.login(ip="10.9.9.9")          # حتی کلید درست در حال قفل
        self.assertEqual(code, 429)
        op, code, csrf = self.login(key=self.key.lower().replace("-", " "))   # شکل دیگر تایپ کلید
        self.assertEqual(code, 200)
        # بدون csrf بارگذاری رد می‌شود
        req = urllib.request.Request(self.url("/update/upload"), data=b"x", headers={"X-CSRF": "bad"})
        with self.assertRaises(urllib.error.HTTPError) as cm:
            op.open(req)
        self.assertEqual(cm.exception.code, 403)

    def test_2_install_ok(self):
        op, _, csrf = self.login()
        code, resp = self.upload(op, csrf, self.pkg("1.0.0", "v1"))
        self.assertEqual(code, 200, resp)
        st = self.install(op, csrf, resp)
        self.assertTrue(st["job"]["result"]["ok"], st)
        self.assertEqual(st["current"], "1.0.0")
        self.assertEqual(self.current_body(), "v1")

    def test_3_broken_health_rolls_back(self):
        op, _, csrf = self.login()
        code, resp = self.upload(op, csrf, self.pkg("2.0.0", "BROKEN"))
        self.assertEqual(code, 200)
        st = self.install(op, csrf, resp)
        self.assertFalse(st["job"]["result"]["ok"])
        self.assertEqual(st["current"], "1.0.0")
        self.assertEqual(self.current_body(), "v1")

    def test_4_failing_hook_rolls_back(self):
        op, _, csrf = self.login()
        code, resp = self.upload(op, csrf, self.pkg("3.0.0", "v3", hook="echo migrating; exit 3\n"))
        st = self.install(op, csrf, resp)
        self.assertFalse(st["job"]["result"]["ok"])
        self.assertEqual(st["current"], "1.0.0")

    def test_5_tampered_rejected(self):
        op, _, csrf = self.login()
        code, resp = self.upload(op, csrf, self.pkg("4.0.0", "v4", tamper=True))
        self.assertEqual(code, 400)
        code, resp = self.upload(op, csrf, __file__)   # فایل بی‌ربط
        self.assertEqual(code, 400)

    def test_6_signature(self):
        tmp = tempfile.mkdtemp()
        priv, pub = os.path.join(tmp, "k.pem"), os.path.join(tmp, "k.pub")
        subprocess.run(["openssl", "genpkey", "-algorithm", "ed25519", "-out", priv], check=True)
        subprocess.run(["openssl", "pkey", "-in", priv, "-pubout", "-out", pub], check=True)
        other = os.path.join(tmp, "o.pem")
        subprocess.run(["openssl", "genpkey", "-algorithm", "ed25519", "-out", other], check=True)
        op, _, csrf = self.login()
        op.open(urllib.request.Request(self.url("/update/pubkey"), data=urllib.parse.urlencode(
            {"csrf": csrf, "key": self.key, "pem": open(pub).read()}).encode()))
        self.assertTrue(os.path.exists(os.path.join(self.root, "var/lib/jarian/updater/pubkey.pem")))
        code, _ = self.upload(op, csrf, self.pkg("5.0.0", "v5"))                  # بی‌امضا
        self.assertEqual(code, 400)
        code, _ = self.upload(op, csrf, self.pkg("5.0.0", "v5", sign=other))      # کلید دیگر
        self.assertEqual(code, 400)
        code, resp = self.upload(op, csrf, self.pkg("5.0.0", "v5", sign=priv))
        self.assertEqual(code, 200)
        st = self.install(op, csrf, resp)
        self.assertTrue(st["job"]["result"]["ok"])
        self.assertEqual(self.current_body(), "v5")

    def test_7_manual_activate_previous(self):
        op, _, csrf = self.login()
        op.open(urllib.request.Request(self.url("/update/activate"),
                                       data=urllib.parse.urlencode({"csrf": csrf, "name": "1.0.0"}).encode()))
        st = self.wait(op)
        self.assertTrue(st["job"]["result"]["ok"])
        self.assertEqual(self.current_body(), "v1")
        page = op.open(self.url("/update/")).read().decode()
        self.assertIn("5.0.0", page)
        self.assertIn("سابقه", page)

    def test_8_cli_status(self):
        r = subprocess.run([sys.executable, UPDATER, "status"], capture_output=True, text=True, env=self.env)
        self.assertIn("1.0.0", r.stdout)


if __name__ == "__main__":
    unittest.main()
