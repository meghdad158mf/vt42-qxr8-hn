"""ابزارهای مشترک سرویس‌های سرور جریان (فقط کتابخانه‌ی استاندارد پایتون).

پایگاه داده با psql خود سیستم صدا زده می‌شود (کاربر postgres، بدون رمز)، چون
روی سرور هیچ بسته‌ی pip نصب نمی‌شود. همه‌ی مسیرها زیر JARYAN_ROOT تا آزمون‌ها
روی پوشه‌ی موقت اجرا شوند؛ JARYAN_PSQL فرمان psql را برای آزمون عوض می‌کند.
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import shlex
import subprocess
import time

ROOT = os.environ.get("JARYAN_ROOT", "")
ETC = ROOT + "/etc/jaryan"
SECRETS_FILE = ETC + "/secrets.json"
POSTGREST_CONF = ETC + "/postgrest.conf"
UPDATER_KEY = ROOT + "/var/lib/jaryan/updater/key.json"
DB = os.environ.get("JARYAN_DB", "jaryan")
PSQL = shlex.split(os.environ.get("JARYAN_PSQL", "runuser -u postgres -- psql"))
API = os.environ.get("JARYAN_API", "http://127.0.0.1:3000")
API_ADMIN = os.environ.get("JARYAN_API_ADMIN", "http://127.0.0.1:3001")


class DbError(RuntimeError):
    pass


def psql(sql, db=None, single=True, timeout=600):
    """متن SQL را از stdin به psql می‌دهد (فایل لازم نیست و رمزها در خط فرمان دیده نمی‌شوند)."""
    cmd = PSQL + ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", db or DB, "-tA", "-f", "-"]
    if single:
        cmd.insert(len(PSQL), "--single-transaction")
    r = subprocess.run(cmd, input=sql, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise DbError((r.stderr or r.stdout).strip()[-3000:])
    return r.stdout


def q1(sql, db=None):
    out = psql(sql, db=db).strip().splitlines()
    return out[-1] if out else ""


def lit(value):
    """رشته‌ی امن برای SQL با dollar-quote و برچسب تصادفی که در متن نیست."""
    s = "" if value is None else str(value)
    while True:
        tag = "$j" + secrets.token_hex(4) + "$"
        if tag not in s:
            return f"{tag}{s}{tag}"


def jlit(obj):
    return lit(json.dumps(obj, ensure_ascii=False)) + "::jsonb"


def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def b64url_decode(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


SERVICE_ENV = ETC + "/service.env"


def service_env():
    """/etc/jaryan/service.env (640 root:jaryan): رازهایی که سرویس‌های غیر root لازم دارند."""
    out = {}
    try:
        with open(SERVICE_ENV, encoding="utf-8") as f:
            for line in f:
                k, sep, v = line.strip().partition("=")
                if sep and not k.startswith("#"):
                    out[k] = v
    except OSError:
        pass
    return out


def make_jwt(payload, secret):
    head = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = b64url(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(secret.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest()
    return f"{head}.{body}.{b64url(sig)}"


def load_secrets(create=False):
    try:
        with open(SECRETS_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        if not create:
            raise
    data = {
        "jwt_secret": secrets.token_hex(32),
        "authenticator_password": secrets.token_hex(24),
        "created": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()),
    }
    # کلید عمومی سایت (همان «anon key» سوپابیس): فقط نقش anon، امضا با همین رمز
    data["anon_key"] = make_jwt({"role": "anon", "iss": "jaryan", "iat": int(time.time()),
                                 "exp": 4102444800}, data["jwt_secret"])
    os.makedirs(ETC, exist_ok=True)
    tmp = SECRETS_FILE + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1)
    os.replace(tmp, SECRETS_FILE)
    return data


def check_updater_key(key):
    """همان کلید اضطراری صفحه‌ی /update (هش pbkdf2 که به‌روزرسان نگه می‌دارد)."""
    try:
        with open(UPDATER_KEY, encoding="utf-8") as f:
            stored = json.load(f)
    except (OSError, ValueError):
        return False
    norm = "".join(c for c in (key or "").upper() if c.isalnum())
    if not norm:
        return False
    cand = hashlib.pbkdf2_hmac("sha256", norm.encode(), stored["salt"].encode(),
                               stored.get("iter", 300_000)).hex()
    return hmac.compare_digest(cand, stored["hash"])
