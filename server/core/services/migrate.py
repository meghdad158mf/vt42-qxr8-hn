#!/usr/bin/env python3
"""ساختن و به‌روز نگه داشتن پایگاه داده‌ی جریان روی سرور خودمان.

  migrate.py apply <پوشه‌ی نسخه>   لایه‌ی سازگاری + migrationهای تازه + هماهنگ‌سازی رمزها
  migrate.py status

همان فایل‌های db/ مخزن به همان ترتیب اجرا می‌شوند (schema.sql، بعد migration_002 …)؛
هر فایل یک‌بار و در یک تراکنش، و نامش در jaryan_meta.applied ثبت می‌شود. سه
«create extension» که روی سرور خودمان نیستند (pgjwt، pg_cron، pg_net) برداشته
می‌شوند — جانشینشان در compat.sql است.
"""
import glob
import grp
import hashlib
import os
import re
import secrets
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srvlib as S  # noqa: E402

EXT_RE = re.compile(r"create\s+extension\s+if\s+not\s+exists\s+(pgjwt|pg_cron|pg_net)\b[^;]*;", re.I)


def migration_files(rel):
    d = os.path.join(rel, "db", "migrations")
    names = sorted(os.path.basename(p) for p in glob.glob(os.path.join(d, "migration_*.sql")))
    if os.path.exists(os.path.join(d, "schema.sql")):
        names.insert(0, "schema.sql")
    return [(n, os.path.join(d, n)) for n in names]


def prepare(name, text, sec):
    text = EXT_RE.sub(lambda m: f"-- [jaryan] {m.group(1)}: جانشین در compat.sql", text)
    if name == "schema.sql":
        # رمزهای اولیه تصادفی‌اند و کسی آن‌ها را نمی‌داند: رمز مدیر را از صفحه‌ی /setup بگذارید
        text = (text.replace("'<ADMIN_PASSWORD>'", S.lit(secrets.token_urlsafe(24)))
                    .replace("'<VIEWER_PASSWORD>'", S.lit(secrets.token_urlsafe(24)))
                    .replace("'<YOUR_JWT_SECRET>'", S.lit(sec["jwt_secret"])))
    return 'set search_path = "$user", public, extensions;\n' + text


def applied():
    out = S.psql("select name || ' ' || sha256 from jaryan_meta.applied")
    return dict(line.split(" ", 1) for line in out.splitlines() if " " in line)


def write_postgrest_conf(sec):
    conf = f'''# ساخته‌ی migrate.py — دستی ویرایش نکنید (هر نصب دوباره نوشته می‌شود)
db-uri = "postgres://authenticator:{sec["authenticator_password"]}@127.0.0.1:5432/{S.DB}"
db-schemas = "public"
db-anon-role = "anon"
db-extra-search-path = "public, extensions"
db-max-rows = 1000
db-pool = 20
jwt-secret = "{sec["jwt_secret"]}"
openapi-mode = "disabled"
server-host = "127.0.0.1"
server-port = 3000
admin-server-port = 3001
log-level = "error"
'''
    tmp = S.POSTGREST_CONF + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o640)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(conf)
    if os.geteuid() == 0:
        try:
            os.chown(tmp, 0, grp.getgrnam("jaryan").gr_gid)
        except KeyError:
            pass
    os.replace(tmp, S.POSTGREST_CONF)


def write_service_env(sec):
    """رازهای لازم سرویس‌های غیر root (فایل‌ها، تابع‌ها): 640 root:jaryan."""
    body = f"JWT_SECRET={sec['jwt_secret']}\nANON_KEY={sec['anon_key']}\n"
    tmp = S.SERVICE_ENV + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o640)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(body)
    if os.geteuid() == 0:
        try:
            os.chown(tmp, 0, grp.getgrnam("jaryan").gr_gid)
        except KeyError:
            pass
    os.replace(tmp, S.SERVICE_ENV)


def apply(rel):
    sec = S.load_secrets(create=True)
    with open(os.path.join(rel, "db", "compat.sql"), encoding="utf-8") as f:
        S.psql(f.read())
    print("لایه‌ی سازگاری: انجام شد")
    done = applied()
    count = 0
    for name, path in migration_files(rel):
        with open(path, encoding="utf-8") as f:
            raw = f.read()
        digest = hashlib.sha256(raw.encode()).hexdigest()
        if name in done:
            if done[name] != digest:
                print(f"هشدار: {name} بعد از اجرا عوض شده است (دوباره اجرا نمی‌شود)")
            continue
        sql = prepare(name, raw, sec) + (
            f"\n;insert into jaryan_meta.applied (name, sha256) values ({S.lit(name)}, {S.lit(digest)});\n")
        try:
            S.psql(sql)
        except S.DbError as e:
            raise SystemExit(f"اجرای {name} ناموفق بود:\n{e}")
        count += 1
        print("اجرا شد:", name)
    with open(os.path.join(rel, "db", "server.sql"), encoding="utf-8") as f:
        S.psql(f.read())
    # رمز JWT و رمز اتصال PostgREST همیشه از secrets.json (تنها منبع)
    S.psql(f"""
insert into public.app_config (key, value) values ('jwt_secret', {S.lit(sec["jwt_secret"])})
  on conflict (key) do update set value = excluded.value;
alter role authenticator password {S.lit(sec["authenticator_password"])};
""")
    write_postgrest_conf(sec)
    write_service_env(sec)
    print(f"migrationهای تازه: {count}، همه: {len(done) + count}")


def status():
    try:
        done = applied()
    except S.DbError as e:
        print("پایگاه داده آماده نیست:", e)
        return 1
    print("migrationهای اجراشده:", len(done))
    return 0


def main(argv):
    if len(argv) >= 3 and argv[1] == "apply":
        apply(argv[2])
        return 0
    if len(argv) >= 2 and argv[1] == "status":
        return status()
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
