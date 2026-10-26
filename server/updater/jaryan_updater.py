#!/usr/bin/env python3
"""به‌روزرسان مستقل سرور «جریان» — صفحه‌ی /update.

عمداً فقط با کتابخانه‌ی استاندارد پایتون (بدون pip) و مستقل از سایت و پایگاه داده
نوشته شده تا وقتی خود سایت یا پایگاه داده خراب است هم کار کند. پشت nginx روی
127.0.0.1:8090 گوش می‌دهد؛ nginx فقط از راه https به آن راه می‌دهد.

کارها: ورود با «کلید اضطراری»، بارگذاری بسته‌ی به‌روزرسانی (.jaryan)، بررسی
sha256 و امضا، نصب با برگشت خودکار اگر سایت بعد از نصب سالم بالا نیاید، برگشت
دستی به نسخه‌های قبلی، و پشتیبان‌گیری/بازگردانی پایگاه داده.

فرمان‌های خط فرمان (برای install.sh و systemd):
  jaryan_updater.py serve
  jaryan_updater.py set-key          (کلید تازه از stdin؛ فقط هش ذخیره می‌شود)
  jaryan_updater.py backup           (پشتیبان شبانه)
  jaryan_updater.py activate <نسخه>  (برگشت دستی روی خود سرور، لایه‌ی سوم)
  jaryan_updater.py status
"""
import hashlib
import hmac
import html
import http.server
import json
import os
import re
import secrets
import shutil
import ssl
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
import urllib.parse
import urllib.request

# همه‌ی مسیرها زیر JARYAN_ROOT تا آزمون‌ها روی پوشه‌ی موقت اجرا شوند (روی سرور خالی است).
ROOT = os.environ.get("JARYAN_ROOT", "")
BASE = ROOT + "/opt/jaryan"
RELEASES = BASE + "/releases"
CURRENT = BASE + "/current"
STATE = ROOT + "/var/lib/jaryan/updater"
BACKUPS = ROOT + "/var/lib/jaryan/backups"
TMP = STATE + "/tmp"
LOGS = STATE + "/logs"
KEY_FILE = STATE + "/key.json"
PUBKEY_FILE = STATE + "/pubkey.pem"
HISTORY_FILE = STATE + "/history.json"

LISTEN = os.environ.get("JARYAN_UPDATER_LISTEN", "127.0.0.1:8090")
# درگاه مستقیم https (بدون nginx) تا اگر nginx خراب شد هم /update باز شود
TLS_LISTEN = os.environ.get("JARYAN_UPDATER_TLS_LISTEN", "")
TLS_CERT = os.environ.get("JARYAN_TLS_CERT", "")
TLS_KEY = os.environ.get("JARYAN_TLS_KEY", "")
HEALTH_BASE = os.environ.get("JARYAN_HEALTH_BASE", "http://127.0.0.1")
DB_NAME = os.environ.get("JARYAN_DB", "jaryan")
MAX_UPLOAD = 1024 * 1024 * 1024        # ۱ گیگ
KEEP_RELEASES = 5
KEEP_BACKUPS = 14
SESSION_TTL = 30 * 60
HOOK_TIMEOUT = 20 * 60
HEALTH_WAIT = int(os.environ.get("JARYAN_HEALTH_WAIT", "90"))

_lock = threading.Lock()               # فقط یک کار (نصب/برگشت/پشتیبان) در هر لحظه
_job = {"running": False, "kind": "", "title": "", "log": "", "started": 0, "result": None}
_sessions = {}                         # token -> {"exp": t, "csrf": str}
_fails = {}                            # ip -> [زمان تلاش‌های ناموفق]
_uploads = {}                          # id -> {"path", "manifest", "signed", "exp"}


# ---------------------------------------------------------------- ابزارها

def now():
    return time.time()


def ts_name():
    return time.strftime("%Y%m%d-%H%M%S", time.gmtime())


def ensure_dirs():
    for d in (RELEASES, STATE, BACKUPS, TMP, LOGS):
        os.makedirs(d, exist_ok=True)
    os.chmod(STATE, 0o700)


def read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def fmt_size(n):
    for unit in ("بایت", "کیلوبایت", "مگابایت", "گیگابایت"):
        if n < 1024 or unit == "گیگابایت":
            return f"{n:.0f} {unit}" if unit == "بایت" else f"{n:.1f} {unit}"
        n /= 1024


def fmt_time(t):
    # ساعت تهران بدون وابستگی به tzdata (ایران از ۱۴۰۱ ساعت تابستانی ندارد)
    return time.strftime("%Y-%m-%d %H:%M", time.gmtime(t + 3.5 * 3600))


def esc(s):
    return html.escape(str(s), quote=True)


def esc_mixed(s):
    """متن فارسی با نسخه/نام فایل لاتین: هر تکه‌ی لاتین جدا (bdi) تا ترتیبش به‌هم نریزد."""
    return re.sub(r"([A-Za-z0-9][A-Za-z0-9._:-]*[A-Za-z0-9])", r'<bdi dir="ltr">\1</bdi>', esc(s))


def ltr(s):
    # نسخه/نام فایل در متن فارسی برعکس دیده می‌شود (test-5.99.0)؛ جدا و چپ‌به‌راست
    return f'<bdi dir="ltr">{esc(s)}</bdi>'


def valid_version(v):
    return bool(v) and len(v) <= 40 and all(c.isalnum() or c in ".-_" for c in v) and v[0] != "."


# ---------------------------------------------------------------- کلید اضطراری

def norm_key(key):
    # خط تیره، فاصله و حروف کوچک/بزرگ مهم نیست تا تایپ از روی کاغذ ساده باشد
    return "".join(c for c in key.upper() if c.isalnum())


def hash_key(key, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", norm_key(key).encode(), salt.encode(), 300_000).hex()
    return {"salt": salt, "hash": digest, "iter": 300_000}


def check_key(key):
    stored = read_json(KEY_FILE, None)
    if not stored or not key:
        return False
    cand = hashlib.pbkdf2_hmac("sha256", norm_key(key).encode(),
                               stored["salt"].encode(), stored.get("iter", 300_000)).hex()
    return hmac.compare_digest(cand, stored["hash"])


def new_key():
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # بدون O/0 و I/1 تا روی کاغذ اشتباه نشود
    raw = "".join(secrets.choice(alphabet) for _ in range(24))
    return "-".join(raw[i:i + 4] for i in range(0, 24, 4))


def store_key(key):
    ensure_dirs()
    data = hash_key(key)
    write_json(KEY_FILE, data)
    os.chmod(KEY_FILE, 0o600)


def login_blocked(ip):
    t = now()
    recent = [x for x in _fails.get(ip, []) if t - x < 15 * 60]
    _fails[ip] = recent
    total = sum(1 for v in _fails.values() for x in v if t - x < 3600)
    return len(recent) >= 5 or total >= 20


# ---------------------------------------------------------------- بسته‌ها

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_signature(payload, sig):
    if not os.path.exists(PUBKEY_FILE):
        return None                    # کلید عمومی هنوز تنظیم نشده
    if not sig:
        return False
    r = subprocess.run(["openssl", "pkeyutl", "-verify", "-pubin", "-inkey", PUBKEY_FILE,
                        "-rawin", "-in", payload, "-sigfile", sig],
                       capture_output=True, timeout=60)
    return r.returncode == 0


def inspect_package(path):
    """بسته = tar با manifest.json + payload.tar.gz (+ payload.sig). خطا = ValueError با پیام فارسی."""
    work = tempfile.mkdtemp(dir=TMP)
    try:
        try:
            with tarfile.open(path, "r:") as tf:
                names = set(tf.getnames())
                if "manifest.json" not in names or "payload.tar.gz" not in names:
                    raise ValueError("این فایل بسته‌ی به‌روزرسانی جریان نیست (manifest یا payload ندارد).")
                for n in ("manifest.json", "payload.tar.gz", "payload.sig"):
                    if n in names:
                        m = tf.getmember(n)
                        if not m.isfile():
                            raise ValueError("ساختار بسته نامعتبر است.")
                        with tf.extractfile(m) as src, open(os.path.join(work, n), "wb") as dst:
                            shutil.copyfileobj(src, dst)
        except tarfile.TarError:
            raise ValueError("فایل خراب است یا کامل بارگذاری نشده است.")
        manifest = read_json(os.path.join(work, "manifest.json"), None)
        if not isinstance(manifest, dict) or not valid_version(manifest.get("version", "")):
            raise ValueError("manifest بسته نامعتبر است.")
        payload = os.path.join(work, "payload.tar.gz")
        if sha256_file(payload) != manifest.get("sha256"):
            raise ValueError("فایل دستکاری یا ناقص شده است (sha256 یکی نیست).")
        sig = os.path.join(work, "payload.sig")
        signed = verify_signature(payload, sig if os.path.exists(sig) else None)
        if signed is False:
            raise ValueError("امضای بسته معتبر نیست؛ این بسته نصب نمی‌شود.")
        return work, manifest, signed
    except Exception:
        shutil.rmtree(work, ignore_errors=True)
        raise


def extract_payload(payload, dest):
    with tarfile.open(payload, "r:gz") as tf:
        if hasattr(tarfile, "data_filter"):
            tf.extractall(dest, filter="data")
        else:                          # پایتون قدیمی: مسیرهای خطرناک را خودمان رد می‌کنیم
            for m in tf.getmembers():
                p = os.path.normpath(m.name)
                if p.startswith("..") or os.path.isabs(p) or m.issym() or m.islnk() or m.isdev():
                    raise ValueError("مسیر نامعتبر در بسته: " + m.name)
            tf.extractall(dest)


# ---------------------------------------------------------------- نسخه‌ها

def current_version():
    try:
        return os.path.basename(os.readlink(CURRENT))
    except OSError:
        return None


def list_releases():
    try:
        names = [n for n in os.listdir(RELEASES) if os.path.isdir(os.path.join(RELEASES, n)) and not n.endswith(".tmp")]
    except OSError:
        return []
    return sorted(names, key=lambda n: os.path.getmtime(os.path.join(RELEASES, n)), reverse=True)


def release_info(name):
    m = read_json(os.path.join(RELEASES, name, "manifest.json"), {})
    return {"name": name, "version": m.get("version", name), "notes": m.get("notes", []),
            "created": m.get("created", ""), "signed": m.get("_signed")}


def switch_to(name):
    tmp = CURRENT + ".new"
    if os.path.lexists(tmp):
        os.remove(tmp)
    os.symlink(os.path.join(RELEASES, name), tmp)
    os.replace(tmp, CURRENT)           # جابه‌جایی اتمی


def prune_releases(keep_also):
    names = list_releases()
    for n in names[KEEP_RELEASES:]:
        if n not in keep_also:
            shutil.rmtree(os.path.join(RELEASES, n), ignore_errors=True)


def add_history(entry):
    hist = read_json(HISTORY_FILE, [])
    hist.insert(0, entry)
    write_json(HISTORY_FILE, hist[:50])


# ---------------------------------------------------------------- کارهای پس‌زمینه

class Job:
    def __init__(self, kind, title):
        self.path = os.path.join(LOGS, f"{ts_name()}-{kind}.log")
        self.f = open(self.path, "w", encoding="utf-8")
        _job.update(running=True, kind=kind, title=title, log=self.path, started=now(), result=None)

    def log(self, msg):
        line = time.strftime("%H:%M:%S ", time.gmtime(now() + 3.5 * 3600)) + msg
        self.f.write(line + "\n")
        self.f.flush()

    def run(self, cmd, env=None, timeout=HOOK_TIMEOUT, cwd=None):
        self.log("$ " + " ".join(cmd))
        e = dict(os.environ)
        e.update(env or {})
        r = subprocess.run(cmd, stdout=self.f, stderr=subprocess.STDOUT, env=e, timeout=timeout, cwd=cwd)
        self.f.flush()
        if r.returncode != 0:
            raise RuntimeError(f"فرمان با کد {r.returncode} تمام شد: {cmd[0]}")

    def finish(self, ok, msg):
        self.log(("✔ " if ok else "✘ ") + msg)
        self.f.close()
        _job.update(running=False, result={"ok": ok, "msg": msg, "at": now()})


def have_db():
    if not shutil.which("pg_dump") or ROOT:
        return False
    r = subprocess.run(["runuser", "-u", "postgres", "--", "psql", "-tAc",
                        f"select 1 from pg_database where datname='{DB_NAME}'"],
                       capture_output=True, text=True, timeout=30)
    return r.stdout.strip() == "1"


def db_backup(job, label):
    if not have_db():
        job.log("پایگاه داده هنوز ساخته نشده؛ پشتیبان لازم نیست.")
        return None
    path = os.path.join(BACKUPS, f"{label}-{ts_name()}.dump")
    with open(path, "wb") as out:
        job.log("پشتیبان‌گیری از پایگاه داده ← " + os.path.basename(path))
        r = subprocess.run(["runuser", "-u", "postgres", "--", "pg_dump", "-Fc", DB_NAME],
                           stdout=out, stderr=job.f, timeout=3600)
    if r.returncode != 0:
        os.remove(path)
        raise RuntimeError("پشتیبان‌گیری از پایگاه داده ناموفق بود.")
    os.chmod(path, 0o600)
    prune_backups()
    return path


def psql(sql, db="postgres"):
    return subprocess.run(["runuser", "-u", "postgres", "--", "psql", "-v", "ON_ERROR_STOP=1", "-d", db, "-tAc", sql],
                          capture_output=True, text=True, timeout=300)


def db_restore(job, path):
    """بازگردانی کامل: در پایگاه داده‌ی تازه بازگردانی می‌شود و فقط اگر موفق بود جایگزین می‌شود.
    (pg_restore --clean جدول‌هایی را که بعد از پشتیبان ساخته شده‌اند پاک نمی‌کند.)"""
    job.log("بازگردانی پایگاه داده از " + os.path.basename(path))
    tmp_db, old_db = DB_NAME + "_restore", f"{DB_NAME}_old_{ts_name().replace('-', '_')}"
    psql(f'drop database if exists "{tmp_db}"')
    r = psql(f'create database "{tmp_db}"')
    if r.returncode != 0:
        raise RuntimeError("ساختن پایگاه داده‌ی موقت ناموفق بود: " + r.stderr.strip())
    # فایل پشتیبان فقط برای root خواندنی است؛ root بازش می‌کند و به stdin کاربر postgres می‌دهد
    with open(path, "rb") as src:
        r = subprocess.run(["runuser", "-u", "postgres", "--", "pg_restore", "--exit-on-error",
                            "--single-transaction", "-d", tmp_db], stdin=src, stdout=job.f,
                           stderr=subprocess.STDOUT, timeout=3600)
    job.f.flush()
    if r.returncode != 0:
        psql(f'drop database if exists "{tmp_db}"')
        raise RuntimeError("بازگردانی پایگاه داده ناموفق بود؛ پایگاه داده‌ی فعلی دست نخورد.")
    psql(f"select pg_terminate_backend(pid) from pg_stat_activity where datname='{DB_NAME}' and pid<>pg_backend_pid()")
    r = psql(f'alter database "{DB_NAME}" rename to "{old_db}"')
    if r.returncode != 0:
        psql(f'drop database if exists "{tmp_db}"')
        raise RuntimeError("جایگزینی پایگاه داده ناموفق بود (اتصال باز؟): " + r.stderr.strip())
    psql(f'alter database "{tmp_db}" rename to "{DB_NAME}"')
    psql(f'drop database if exists "{old_db}"')
    job.log("پایگاه داده جایگزین شد.")


def prune_backups():
    files = sorted((f for f in os.listdir(BACKUPS) if f.endswith(".dump")),
                   key=lambda f: os.path.getmtime(os.path.join(BACKUPS, f)), reverse=True)
    nightly = [f for f in files if f.startswith("nightly-")]
    other = [f for f in files if not f.startswith("nightly-")]
    for f in nightly[KEEP_BACKUPS:] + other[KEEP_BACKUPS:]:
        os.remove(os.path.join(BACKUPS, f))


def run_hook(job, name, hook, rollback=False):
    path = os.path.join(RELEASES, name, "hooks", hook)
    if not os.path.exists(path):
        job.log(f"({hook} ندارد)")
        return
    job.run(["bash", path], env={"JARYAN_RELEASE": os.path.join(RELEASES, name),
                                 "JARYAN_ROLLBACK": "1" if rollback else "0"},
            cwd=os.path.join(RELEASES, name))


def health_ok(job, name):
    paths = read_json(os.path.join(RELEASES, name, "manifest.json"), {}).get("health") or ["/"]
    deadline = now() + HEALTH_WAIT
    last = ""
    while now() < deadline:
        bad = []
        for p in paths:
            try:
                with urllib.request.urlopen(HEALTH_BASE + p, timeout=10) as r:
                    if r.status >= 500:
                        bad.append(f"{p} → {r.status}")
            except urllib.error.HTTPError as e:
                if e.code >= 500:
                    bad.append(f"{p} → {e.code}")
            except Exception as e:  # noqa: BLE001 — هر خطای اتصال یعنی هنوز سالم نیست
                bad.append(f"{p} → {e.__class__.__name__}")
        if not bad:
            job.log("بررسی سلامت: همه‌ی نشانی‌ها پاسخ دادند " + "، ".join(paths))
            return True
        if ", ".join(bad) != last:
            last = ", ".join(bad)
            job.log("هنوز سالم نیست: " + last)
        time.sleep(5)
    return False


def deploy(job, name, prev, migrate_backup=True):
    """فعال‌سازی یک نسخه‌ی استخراج‌شده با برگشت خودکار.
    خروجی: "ok" | "rolled_back" (به نسخه‌ی قبل برگشت و سالم است) | "rollback_failed" | "no_prev"."""
    backup = db_backup(job, "pre-" + name) if migrate_backup else None
    try:
        run_hook(job, name, "preinstall")
        job.log(f"جابه‌جایی نسخه‌ی فعال: {prev or '—'} ← {name}")
        switch_to(name)
        run_hook(job, name, "activate")
        if not health_ok(job, name):
            raise RuntimeError("سایت بعد از نصب در زمان مقرر سالم بالا نیامد.")
        return "ok"
    except Exception as e:  # noqa: BLE001
        job.log("خطا: " + str(e))
        if not prev:
            job.log("نسخه‌ی قبلی وجود ندارد؛ برگشت ممکن نیست.")
            return "no_prev"
        job.log("برگشت خودکار به " + prev)
        try:
            switch_to(prev)
            if backup:
                db_restore(job, backup)
            run_hook(job, prev, "activate", rollback=True)
            healthy = health_ok(job, prev)
            job.log("برگشت انجام شد؛ سالم: " + ("بله" if healthy else "نه"))
            return "rolled_back" if healthy else "rollback_failed"
        except Exception as e2:  # noqa: BLE001
            job.log("برگشت هم ناموفق بود: " + str(e2))
            return "rollback_failed"


FAIL_MSG = {
    "rolled_back": " و خودکار به {prev} برگشت داده شد؛ سایت سالم است.",
    "rollback_failed": " و برگشت به {prev} هم کامل نشد — گزارش نصب را برای پشتیبانی فنی بفرستید.",
    "no_prev": ".",
}


def start_job(kind, title, fn):
    if not _lock.acquire(blocking=False):
        return False

    def runner():
        job = Job(kind, title)
        try:
            ok, msg = fn(job)
        except Exception as e:  # noqa: BLE001
            ok, msg = False, "خطا: " + str(e)
        job.finish(ok, msg)
        add_history({"at": now(), "kind": kind, "title": title, "ok": ok, "msg": msg,
                     "log": os.path.basename(job.path), "current": current_version()})
        _lock.release()

    threading.Thread(target=runner, daemon=True).start()
    return True


def job_install(upload):
    def fn(job):
        manifest = upload["manifest"]
        name = manifest["version"]
        while os.path.exists(os.path.join(RELEASES, name)):
            name = manifest["version"] + "-" + secrets.token_hex(2)
        tmpdir = os.path.join(RELEASES, name + ".tmp")
        job.log(f"نسخه‌ی {manifest['version']}، امضا: " +
                {True: "معتبر", None: "بدون کلید عمومی (بررسی نشد)"}[upload["signed"]])
        extract_payload(os.path.join(upload["work"], "payload.tar.gz"), tmpdir)
        manifest["_signed"] = upload["signed"]
        manifest["_installed"] = now()
        write_json(os.path.join(tmpdir, "manifest.json"), manifest)
        os.rename(tmpdir, os.path.join(RELEASES, name))
        shutil.rmtree(upload["work"], ignore_errors=True)
        prev = current_version()
        res = deploy(job, name, prev)
        if res == "ok":
            prune_releases({name, prev})
            return True, f"نسخه‌ی {manifest['version']} نصب و فعال شد."
        if current_version() != name:            # نسخه‌ی ناموفق در فهرست «فعال کردن» نماند
            shutil.rmtree(os.path.join(RELEASES, name), ignore_errors=True)
        return False, f"نصب نسخه‌ی {manifest['version']} ناموفق بود" + FAIL_MSG[res].format(prev=prev)
    return fn


def job_activate(name):
    def fn(job):
        prev = current_version()
        if name == prev:
            return False, "این نسخه همین الان فعال است."
        res = deploy(job, name, prev)
        if res == "ok":
            return True, f"نسخه‌ی {name} فعال شد."
        return False, f"فعال‌سازی {name} ناموفق بود" + FAIL_MSG[res].format(prev=prev)
    return fn


def job_backup(label="manual"):
    def fn(job):
        p = db_backup(job, label)
        return (True, "پشتیبان ساخته شد: " + os.path.basename(p)) if p else (True, "پایگاه داده‌ای برای پشتیبان‌گیری نیست.")
    return fn


def job_restore(fname):
    def fn(job):
        path = os.path.join(BACKUPS, fname)
        db_backup(job, "before-restore")
        db_restore(job, path)
        if current_version():
            run_hook(job, current_version(), "activate", rollback=True)
        return True, "پایگاه داده از " + fname + " بازگردانی شد."
    return fn


# ---------------------------------------------------------------- صفحه‌ها

CSS = """
*{box-sizing:border-box}body{margin:0;font-family:Tahoma,'Segoe UI',sans-serif;background:#eef1f5;color:#16202a;line-height:1.8}
header{background:#16202a;color:#fff;padding:14px 20px;display:flex;align-items:center;gap:12px}
header b{font-size:17px}header span{color:#EAB393;font-size:13px}header form{margin-inline-start:auto}
main{max-width:860px;margin:0 auto;padding:16px}
section{background:#fff;border-radius:14px;padding:16px 18px;margin-bottom:14px;box-shadow:0 1px 3px rgba(22,32,42,.08)}
h2{font-size:16px;margin:0 0 10px}table{width:100%;border-collapse:collapse;font-size:14px}
td,th{padding:7px 6px;border-bottom:1px solid #e3e8ee;text-align:start;vertical-align:top}
button,.btn{font:inherit;font-size:14px;border:0;border-radius:999px;padding:7px 16px;background:#16202a;color:#fff;cursor:pointer;text-decoration:none;display:inline-block}
button.light{background:#eef1f5;color:#16202a}button.red{background:#b42318}button:disabled{opacity:.5}
input[type=text],input[type=password],textarea{font:inherit;width:100%;padding:9px 12px;border:1px solid #cfd6df;border-radius:10px;direction:ltr}
.ok{color:#127a3a}.bad{color:#b42318}.warn{color:#9a6200}.muted{color:#5b6472;font-size:13px}
.pill{display:inline-block;font-size:12px;padding:1px 9px;border-radius:999px;background:#eef1f5}
pre{direction:ltr;text-align:left;background:#16202a;color:#dfe5ec;padding:12px;border-radius:10px;font-size:12px;max-height:340px;overflow:auto;white-space:pre-wrap}
.keybox{direction:ltr;font-family:monospace;font-size:22px;letter-spacing:2px;background:#fff7f0;border:2px dashed #b5651d;padding:14px;border-radius:12px;text-align:center}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
"""


def page(title, body, sess=None):
    logout = ""
    if sess:
        logout = (f'<form method="post" action="/update/logout"><input type="hidden" name="csrf" value="{esc(sess["csrf"])}">'
                  '<button class="light">خروج</button></form>')
    return f"""<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>{esc(title)} — به‌روزرسان جریان</title><style>{CSS}</style></head><body>
<header><b>به‌روزرسان جریان</b><span>مستقل از سایت و پایگاه داده</span>{logout}</header><main>{body}</main></body></html>"""


def login_page(msg=""):
    m = f'<p class="bad">{esc(msg)}</p>' if msg else ""
    return page("ورود", f"""<section><h2>ورود با کلید اضطراری</h2>
<p class="muted">کلیدی که هنگام نصب پایه روی صفحه‌ی سرور نشان داده شد (۲۴ نویسه، شش گروه چهارتایی).</p>{m}
<form method="post" action="/update/login"><input type="password" name="key" autocomplete="off" autofocus
placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"><p><button>ورود</button></p></form></section>""")


def dashboard(sess, flash=""):
    csrf = esc(sess["csrf"])
    cur = current_version()
    parts = []
    if flash:
        parts.append(f"<section>{flash}</section>")

    if _job["running"]:
        parts.append(f"""<section><h2>در حال انجام: {esc_mixed(_job['title'])}</h2>
<p class="muted">این صفحه هر چند ثانیه تازه می‌شود. تا پایان کار صفحه را نبندید (بستن هم کار را متوقف نمی‌کند).</p>
<pre id="log">{esc(tail(_job['log']))}</pre></section>
<script>setTimeout(()=>location.reload(),4000)</script>""")
    elif _job["result"]:
        r = _job["result"]
        parts.append(f"""<section><h2 class="{'ok' if r['ok'] else 'bad'}">{'✔' if r['ok'] else '✘'} {esc_mixed(r['msg'])}</h2>
<details><summary class="muted">گزارش کامل</summary><pre>{esc(tail(_job['log'], 200))}</pre></details></section>""")

    pub = os.path.exists(PUBKEY_FILE)
    sig_note = ("<span class='ok'>امضای بسته‌ها بررسی می‌شود.</span>" if pub else
                "<span class='warn'>کلید عمومی امضا هنوز تنظیم نشده؛ بسته‌ها فقط با sha256 بررسی می‌شوند.</span>")
    parts.append(f"""<section><h2>بارگذاری به‌روزرسانی</h2>
<p class="muted">فایل <b>.jaryan</b> را انتخاب کنید. پیش از نصب، فهرست تغییرات نشان داده می‌شود. {sig_note}</p>
<div class="row"><input type="file" id="pkg" accept=".jaryan"><button id="upbtn" {'disabled' if _job['running'] else ''}>بارگذاری و بررسی</button></div>
<p id="upmsg" class="muted"></p><div id="preview"></div></section>
<script>
const CSRF={json.dumps(sess['csrf'])};
document.getElementById('upbtn').onclick=()=>{{
 const f=document.getElementById('pkg').files[0]; const m=document.getElementById('upmsg');
 if(!f){{m.textContent='نخست فایل را انتخاب کنید.';return;}}
 const x=new XMLHttpRequest(); x.open('POST','/update/upload');
 x.setRequestHeader('X-CSRF',CSRF); x.setRequestHeader('X-Filename',encodeURIComponent(f.name));
 x.upload.onprogress=e=>{{if(e.lengthComputable)m.textContent='در حال بارگذاری… '+Math.round(e.loaded*100/e.total)+'٪';}};
 x.onload=()=>{{let r={{}};try{{r=JSON.parse(x.responseText)}}catch(e){{}}
  if(x.status!==200){{m.className='bad';m.textContent=r.error||('خطا '+x.status);return;}}
  m.className='ok';m.textContent='فایل سالم است.';document.getElementById('preview').innerHTML=r.html;}};
 x.onerror=()=>{{m.className='bad';m.textContent='ارتباط با سرور قطع شد.';}};
 m.className='muted';x.send(f);
}};
</script>""")

    rows = []
    for name in list_releases():
        info = release_info(name)
        is_cur = name == cur
        act = ("<span class='pill ok'>فعال</span>" if is_cur else
               f"""<form method="post" action="/update/activate" onsubmit="return confirm('فعال کردن نسخه‌ی {esc(name)}؟ از پایگاه داده پیش از آن پشتیبان گرفته می‌شود.')">
<input type="hidden" name="csrf" value="{csrf}"><input type="hidden" name="name" value="{esc(name)}"><button class="light" {'disabled' if _job['running'] else ''}>فعال کردن</button></form>""")
        notes = "<br>".join(esc(n) for n in info["notes"][:6])
        rows.append(f"<tr><td><b>{ltr(info['version'])}</b><div class='muted'>{esc(info['created'])}</div></td><td>{notes}</td><td>{act}</td></tr>")
    parts.append(f"""<section><h2>نسخه‌ها</h2><p class="muted">نسخه‌ی فعال: <b>{ltr(cur or '—')}</b>. تا {KEEP_RELEASES} نسخه‌ی آخر نگه داشته می‌شوند.</p>
<table><tr><th>نسخه</th><th>تغییرات</th><th></th></tr>{''.join(rows) or '<tr><td colspan=3>هنوز نسخه‌ای نیست.</td></tr>'}</table></section>""")

    brow = []
    for f in sorted(os.listdir(BACKUPS), reverse=True)[:30]:
        if not f.endswith(".dump"):
            continue
        p = os.path.join(BACKUPS, f)
        brow.append(f"""<tr><td style="direction:ltr;text-align:right">{esc(f)}</td><td>{fmt_size(os.path.getsize(p))}</td>
<td class="row"><a class="btn light" style="background:#eef1f5;color:#16202a" href="/update/backups/{urllib.parse.quote(f)}">دانلود</a>
<form method="post" action="/update/restore" onsubmit="return confirm('بازگردانی پایگاه داده از این پشتیبان؟ داده‌های بعد از آن از بین می‌رود. پیش از بازگردانی از وضع فعلی هم پشتیبان گرفته می‌شود.')">
<input type="hidden" name="csrf" value="{csrf}"><input type="hidden" name="name" value="{esc(f)}"><button class="red" {'disabled' if _job['running'] else ''}>بازگردانی</button></form></td></tr>""")
    du = shutil.disk_usage(BACKUPS)
    parts.append(f"""<section><h2>پشتیبان پایگاه داده</h2>
<p class="muted">هر شب خودکار؛ {KEEP_BACKUPS} پشتیبان شبانه‌ی آخر نگه داشته می‌شوند. فضای آزاد دیسک: {fmt_size(du.free)} از {fmt_size(du.total)}.</p>
<form method="post" action="/update/backup"><input type="hidden" name="csrf" value="{csrf}"><button {'disabled' if _job['running'] else ''}>پشتیبان‌گیری همین الان</button></form>
<table>{''.join(brow) or '<tr><td>هنوز پشتیبانی نیست.</td></tr>'}</table></section>""")

    hist = read_json(HISTORY_FILE, [])[:10]
    hrows = "".join(f"<tr><td>{fmt_time(h['at'])}</td><td class='{'ok' if h['ok'] else 'bad'}'>{esc_mixed(h['msg'])}</td>"
                    f"<td><a href='/update/logs/{urllib.parse.quote(h['log'])}'>گزارش</a></td></tr>" for h in hist)
    parts.append(f"<section><h2>سابقه</h2><table>{hrows or '<tr><td>هنوز کاری انجام نشده.</td></tr>'}</table></section>")

    parts.append(f"""<section><h2>امنیت</h2>
<details><summary>تعویض کلید اضطراری</summary><form method="post" action="/update/key">
<input type="hidden" name="csrf" value="{csrf}"><p class="muted">کلید فعلی را وارد کنید؛ کلید تازه فقط یک‌بار نشان داده می‌شود.</p>
<input type="password" name="key" autocomplete="off"><p><button>ساختن کلید تازه</button></p></form></details>
<details><summary>کلید عمومی امضای بسته‌ها {'(تنظیم شده)' if pub else '(تنظیم نشده)'}</summary><form method="post" action="/update/pubkey">
<input type="hidden" name="csrf" value="{csrf}"><p class="muted">بعد از تنظیم، فقط بسته‌های امضاشده با کلید خصوصی متناظر نصب می‌شوند.</p>
<textarea name="pem" rows="4" placeholder="-----BEGIN PUBLIC KEY-----"></textarea>
<p>کلید اضطراری برای تأیید:</p><input type="password" name="key" autocomplete="off"><p><button>ذخیره</button></p></form></details></section>""")
    return page("پیشخوان", "".join(parts), sess)


def tail(path, n=80):
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return "".join(f.readlines()[-n:])
    except OSError:
        return ""


def preview_html(uid, manifest, signed, csrf):
    notes = "".join(f"<li>{esc(n)}</li>" for n in manifest.get("notes", [])) or "<li>بدون توضیح</li>"
    sig = ("<span class='ok'>امضا معتبر است.</span>" if signed else
           "<span class='warn'>امضا بررسی نشد (کلید عمومی تنظیم نشده).</span>")
    cur = current_version()
    return f"""<h2>نسخه‌ی {ltr(manifest['version'])}</h2><p class="muted">{esc(manifest.get('created', ''))}، {sig}
نسخه‌ی فعلی: {ltr(cur or '—')}</p><ul>{notes}</ul>
<form method="post" action="/update/install"><input type="hidden" name="csrf" value="{esc(csrf)}">
<input type="hidden" name="id" value="{esc(uid)}"><button>نصب</button>
<span class="muted">پیش از نصب از پایگاه داده پشتیبان گرفته می‌شود؛ اگر سایت سالم بالا نیاید، خودکار برگشت داده می‌شود.</span></form>"""


# ---------------------------------------------------------------- سرور HTTP

class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "jaryan-updater"
    sys_version = ""
    behind_proxy = True                # فقط درگاه 127.0.0.1 پشت nginx است؛ سرآیندهای X-* در درگاه مستقیم جعل‌پذیرند

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.client_ip(), fmt % args))

    def client_ip(self):
        if self.behind_proxy:
            return self.headers.get("X-Real-IP") or self.client_address[0]
        return self.client_address[0]

    def is_https(self):
        return not self.behind_proxy or self.headers.get("X-Forwarded-Proto") == "https"

    def send(self, code, body, ctype="text/html; charset=utf-8", headers=None):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy",
                         "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def redirect(self, to="/update/"):
        self.send_response(303)
        self.send_header("Location", to)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def session(self):
        cookie = self.headers.get("Cookie", "")
        for part in cookie.split(";"):
            k, _, v = part.strip().partition("=")
            if k == "jup":
                s = _sessions.get(v)
                if s and s["exp"] > now():
                    s["exp"] = now() + SESSION_TTL
                    return s
        return None

    def form(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 64 * 1024:
            return {}
        return {k: v[0] for k, v in urllib.parse.parse_qs(self.rfile.read(n).decode("utf-8", "replace")).items()}

    def path_only(self):
        return urllib.parse.urlsplit(self.path).path.rstrip("/") or "/"

    def do_GET(self):
        p = self.path_only()
        if p == "/update/ping":
            return self.send(200, "ok", "text/plain")
        sess = self.session()
        if p == "/update":
            return self.send(200, dashboard(sess) if sess else login_page())
        if not sess:
            return self.redirect()
        if p == "/update/status.json":
            return self.send(200, json.dumps({"job": {k: _job[k] for k in ("running", "title", "result")},
                                              "current": current_version()}), "application/json")
        for prefix, folder, ctype in (("/update/backups/", BACKUPS, "application/octet-stream"),
                                      ("/update/logs/", LOGS, "text/plain; charset=utf-8")):
            if p.startswith(prefix):
                name = urllib.parse.unquote(p[len(prefix):])
                fp = os.path.join(folder, name)
                if "/" in name or name.startswith(".") or not os.path.isfile(fp):
                    return self.send(404, "پیدا نشد", "text/plain; charset=utf-8")
                return self.send_file(fp, ctype, name)
        self.send(404, page("پیدا نشد", "<section>این صفحه وجود ندارد.</section>", sess))

    def send_file(self, fp, ctype, name):
        size = os.path.getsize(fp)
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(size))
        if ctype == "application/octet-stream":
            self.send_header("Content-Disposition", f'attachment; filename="{name}"')
        self.end_headers()
        with open(fp, "rb") as f:
            shutil.copyfileobj(f, self.wfile)

    def do_POST(self):
        p = self.path_only()
        ip = self.client_ip()
        if p == "/update/login":
            if login_blocked(ip):
                return self.send(429, login_page("تلاش ناموفق زیاد بود. ۱۵ دقیقه‌ی دیگر دوباره امتحان کنید."))
            key = self.form().get("key", "")
            if not check_key(key):
                _fails.setdefault(ip, []).append(now())
                time.sleep(1)
                return self.send(401, login_page("کلید درست نیست."))
            _fails.pop(ip, None)
            token = secrets.token_urlsafe(32)
            _sessions[token] = {"exp": now() + SESSION_TTL, "csrf": secrets.token_urlsafe(24)}
            secure = "; Secure" if self.is_https() else ""
            self.send_response(303)
            self.send_header("Set-Cookie", f"jup={token}; Path=/update; HttpOnly; SameSite=Strict{secure}")
            self.send_header("Location", "/update/")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        sess = self.session()
        if not sess:
            return self.send(401, json.dumps({"error": "نشست تمام شده؛ دوباره وارد شوید."}), "application/json") \
                if p == "/update/upload" else self.redirect()

        if p == "/update/upload":
            if not hmac.compare_digest(self.headers.get("X-CSRF", ""), sess["csrf"]):
                return self.send(403, json.dumps({"error": "درخواست نامعتبر."}), "application/json")
            return self.handle_upload(sess)

        f = self.form()
        if not hmac.compare_digest(f.get("csrf", ""), sess["csrf"]):
            return self.send(403, page("خطا", "<section>درخواست نامعتبر است؛ صفحه را دوباره باز کنید.</section>", sess))

        if p == "/update/logout":
            for t, s in list(_sessions.items()):
                if s is sess:
                    _sessions.pop(t)
            return self.redirect()
        if p == "/update/install":
            up = _uploads.pop(f.get("id", ""), None)
            if not up:
                return self.send(400, dashboard(sess, "<p class='bad'>فایل بارگذاری‌شده پیدا نشد؛ دوباره بارگذاری کنید.</p>"))
            if not start_job("install", "نصب نسخه‌ی " + up["manifest"]["version"], job_install(up)):
                return self.send(409, dashboard(sess, "<p class='bad'>کار دیگری در حال انجام است.</p>"))
            return self.redirect()
        if p == "/update/activate":
            name = f.get("name", "")
            if name not in list_releases():
                return self.send(400, dashboard(sess, "<p class='bad'>این نسخه پیدا نشد.</p>"))
            start_job("activate", "فعال کردن نسخه‌ی " + name, job_activate(name))
            return self.redirect()
        if p == "/update/backup":
            start_job("backup", "پشتیبان‌گیری", job_backup())
            return self.redirect()
        if p == "/update/restore":
            name = f.get("name", "")
            if "/" in name or not name.endswith(".dump") or not os.path.isfile(os.path.join(BACKUPS, name)):
                return self.send(400, dashboard(sess, "<p class='bad'>پشتیبان پیدا نشد.</p>"))
            start_job("restore", "بازگردانی " + name, job_restore(name))
            return self.redirect()
        if p == "/update/key":
            if not check_key(f.get("key", "")):
                return self.send(401, dashboard(sess, "<p class='bad'>کلید فعلی درست نیست.</p>"))
            k = new_key()
            store_key(k)
            return self.send(200, dashboard(sess, f"""<h2>کلید اضطراری تازه</h2><p>این کلید فقط همین یک‌بار نشان داده می‌شود.
روی کاغذ بنویسید یا در مدیر رمز نگه دارید؛ در پیام‌رسان یا چت نفرستید. کلید قبلی دیگر کار نمی‌کند.</p><div class="keybox">{esc(k)}</div>"""))
        if p == "/update/pubkey":
            if not check_key(f.get("key", "")):
                return self.send(401, dashboard(sess, "<p class='bad'>کلید اضطراری درست نیست.</p>"))
            pem = f.get("pem", "").strip()
            if not pem.startswith("-----BEGIN PUBLIC KEY-----"):
                return self.send(400, dashboard(sess, "<p class='bad'>کلید عمومی باید با -----BEGIN PUBLIC KEY----- شروع شود.</p>"))
            tmp = PUBKEY_FILE + ".new"
            with open(tmp, "w") as fh:
                fh.write(pem + "\n")
            r = subprocess.run(["openssl", "pkey", "-pubin", "-in", tmp, "-noout"], capture_output=True)
            if r.returncode != 0:
                os.remove(tmp)
                return self.send(400, dashboard(sess, "<p class='bad'>کلید عمومی معتبر نیست.</p>"))
            os.replace(tmp, PUBKEY_FILE)
            return self.send(200, dashboard(sess, "<p class='ok'>کلید عمومی ذخیره شد؛ از این پس فقط بسته‌های امضاشده نصب می‌شوند.</p>"))
        self.send(404, page("پیدا نشد", "<section>این صفحه وجود ندارد.</section>", sess))

    def handle_upload(self, sess):
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_UPLOAD:
            return self.send(413, json.dumps({"error": "حجم فایل مجاز نیست (حداکثر ۱ گیگابایت)."}), "application/json")
        if shutil.disk_usage(TMP).free < n * 3 + 512 * 1024 * 1024:
            return self.send(507, json.dumps({"error": "فضای خالی دیسک برای این بسته کافی نیست."}), "application/json")
        fd, path = tempfile.mkstemp(dir=TMP, suffix=".jaryan")
        try:
            with os.fdopen(fd, "wb") as out:
                left = n
                while left:
                    chunk = self.rfile.read(min(left, 1 << 20))
                    if not chunk:
                        raise ValueError("بارگذاری نیمه‌کاره ماند؛ دوباره امتحان کنید.")
                    out.write(chunk)
                    left -= len(chunk)
            work, manifest, signed = inspect_package(path)
        except ValueError as e:
            return self.send(400, json.dumps({"error": str(e)}), "application/json")
        finally:
            if os.path.exists(path):
                os.remove(path)
        for k, u in list(_uploads.items()):          # بارگذاری‌های رهاشده
            if u["exp"] < now():
                shutil.rmtree(u["work"], ignore_errors=True)
                _uploads.pop(k)
        uid = secrets.token_urlsafe(12)
        _uploads[uid] = {"work": work, "manifest": manifest, "signed": signed, "exp": now() + 3600}
        self.send(200, json.dumps({"html": preview_html(uid, manifest, signed, sess["csrf"])}), "application/json")


class DirectHandler(Handler):
    behind_proxy = False


def serve():
    ensure_dirs()
    host, port = LISTEN.rsplit(":", 1)
    srv = http.server.ThreadingHTTPServer((host, int(port)), Handler)
    srv.daemon_threads = True
    print(f"jaryan-updater on {LISTEN}", flush=True)
    if TLS_LISTEN and os.path.exists(TLS_CERT):
        th, tp = TLS_LISTEN.rsplit(":", 1)
        direct = http.server.ThreadingHTTPServer((th, int(tp)), DirectHandler)
        direct.daemon_threads = True
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        ctx.load_cert_chain(TLS_CERT, TLS_KEY)
        direct.socket = ctx.wrap_socket(direct.socket, server_side=True)
        threading.Thread(target=direct.serve_forever, daemon=True).start()
        print(f"jaryan-updater (https) on {TLS_LISTEN}", flush=True)
    srv.serve_forever()


def cli_wait(kind, title, fn):
    if not start_job(kind, title, fn):
        print("کار دیگری در حال انجام است.", file=sys.stderr)
        return 2
    time.sleep(0.2)
    while _job["running"]:
        time.sleep(0.5)
    r = _job["result"]
    print(r["msg"])
    print("گزارش:", _job["log"])
    return 0 if r["ok"] else 1


def main(argv):
    cmd = argv[1] if len(argv) > 1 else "serve"
    if cmd == "serve":
        serve()
    elif cmd == "set-key":
        key = sys.stdin.readline().strip()
        if len(norm_key(key)) < 16:
            print("کلید کوتاه است.", file=sys.stderr)
            return 1
        store_key(key)
    elif cmd == "new-key":
        print(new_key())
    elif cmd == "has-key":
        return 0 if os.path.exists(KEY_FILE) else 1
    elif cmd == "backup":
        ensure_dirs()
        return cli_wait("backup", "پشتیبان شبانه", job_backup("nightly"))
    elif cmd == "activate" and len(argv) > 2:
        ensure_dirs()
        if argv[2] not in list_releases():
            print("این نسخه نیست. نسخه‌ها:", ", ".join(list_releases()), file=sys.stderr)
            return 1
        return cli_wait("activate", "فعال کردن " + argv[2] + " از خط فرمان", job_activate(argv[2]))
    elif cmd == "status":
        print("نسخه‌ی فعال:", current_version() or "—")
        print("نسخه‌ها:", ", ".join(list_releases()) or "—")
    else:
        print(__doc__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv) or 0)
