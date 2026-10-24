#!/usr/bin/env python3
"""مرحله‌ی ۶: انتقال داده‌های فعلی از Supabase به سرور خودمان.

  transfer.py export --out data.jaryandata     (نیاز: SUPABASE_URL، SUPABASE_ANON_KEY، ADMIN_PASSWORD،
                                                 EXPORT_PASSWORD در محیط) — روی رانر گیت‌هاب یا خود سرور
  transfer.py import data.jaryandata            (روی سرور، root؛ EXPORT_PASSWORD در محیط)

برون‌بری فقط از راه همان رابط‌های عمومی Supabase با توکن مدیر (بدون رمز پایگاه داده): همه‌ی جدول‌های
public، نمک و هش کدهای ملی (migration_054 ← migration_export_nids)، و همه‌ی فایل‌های ۹ bucket.
فایل خروجی با رمز EXPORT_PASSWORD رمزنگاری می‌شود (openssl، AES-256 + pbkdf2) چون کدهای ملی (هش)
و شماره‌ها در آن است. ورود: پشتیبان از پایگاه داده‌ی فعلی، بعد جایگزینی کامل جدول‌ها در یک تراکنش،
فایل‌ها، شمارنده‌ها و بازنویسی نشانی‌های Supabase به نشانی همین سرور. رمز JWT و رمزهای ورود
سرور دست نمی‌خورند (همان‌هایی که در /setup گذاشته شده).
"""
import gzip
import io
import json
import mimetypes
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srvlib as S  # noqa: E402

BUCKETS = ["magazines", "magazine-covers", "post-media", "newspaper-covers", "channel-avatars",
           "archive-reports", "archive-report-covers", "basirat-course-posters", "school-reports"]
SUPABASE_ORIGIN = "https://komqnapfqrtxxaytpcdt.supabase.co"
# جدول‌هایی که منتقل نمی‌شوند: app_config (رازهای همین سرور؛ فقط nid_pepper جدا می‌آید)،
# app_user_nids (جدا از migration_export_nids)، و صف‌های موقت
SKIP_TABLES = {"app_config", "app_user_nids", "login_otps", "otp_request_log"}
FILES = os.environ.get("JARYAN_FILES", S.ROOT + "/var/lib/jaryan/files")


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------- برون‌بری

class Supa:
    def __init__(self):
        self.url = os.environ["SUPABASE_URL"].rstrip("/")
        self.anon = os.environ["SUPABASE_ANON_KEY"]
        try:
            self.token = self.call("POST", "/rest/v1/rpc/login", {"password": os.environ["ADMIN_PASSWORD"]},
                                   auth=False)["token"]
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise RuntimeError("رمز مدیر سایت فعلی درست نیست (همان رمزی که مدیر بعد از کد ملی با «ورود با رمز عبور» می‌زند)") from None
            if e.code == 429:
                raise RuntimeError("به‌خاطر چند رمز اشتباه، ورود از این سرور ۱۵ دقیقه قفل است؛ بعد دوباره امتحان کنید") from None
            raise

    def req(self, method, path, body=None, auth=True, headers=None, raw=False):
        h = {"apikey": self.anon, "Content-Type": "application/json"}
        if auth:
            h["Authorization"] = "Bearer " + self.token
        h.update(headers or {})
        data = json.dumps(body).encode() if body is not None else None
        for attempt in range(4):
            try:
                r = urllib.request.Request(self.url + path, data=data, headers=h, method=method)
                with urllib.request.urlopen(r, timeout=180) as resp:
                    out = resp.read()
                    return (out, resp.headers) if raw else (json.loads(out) if out else None)
            except urllib.error.HTTPError as e:
                if e.code in (401, 403, 404, 400):
                    raise
                time.sleep(2 ** attempt)
            except (urllib.error.URLError, OSError):
                time.sleep(2 ** attempt)
        raise RuntimeError("ارتباط با Supabase ممکن نشد: " + path)

    def call(self, method, path, body=None, auth=True):
        return self.req(method, path, body, auth)


def table_defs(sb):
    spec = sb.call("GET", "/rest/v1/")
    out = {}
    for name, d in (spec.get("definitions") or {}).items():
        pk = [c for c, p in (d.get("properties") or {}).items() if "<pk/>" in (p.get("description") or "")]
        out[name] = pk
    return out


def export(out_path):
    password = os.environ["EXPORT_PASSWORD"]
    sb = Supa()
    defs = table_defs(sb)
    work = tempfile.mkdtemp()
    tar_path = os.path.join(work, "data.tar")
    counts = {}
    with tarfile.open(tar_path, "w") as tf:
        def add(name, data):
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mtime = int(time.time())
            tf.addfile(info, io.BytesIO(data))

        for t, pk in sorted(defs.items()):
            if t in SKIP_TABLES:
                continue
            order = ",".join(pk) or None
            rows, off = [], 0
            while True:
                q = f"/rest/v1/{t}?select=*&limit=1000&offset={off}" + (f"&order={order}" if order else "")
                try:
                    part = sb.call("GET", q)
                except urllib.error.HTTPError as e:
                    log(f"  {t}: خوانده نشد ({e.code})")
                    part = None
                if not part:
                    break
                rows += part
                off += len(part)
                if len(part) < 1000:
                    break
            counts[t] = len(rows)
            add(f"tables/{t}.json.gz", gzip.compress(json.dumps(rows, ensure_ascii=False).encode()))
            log(f"  {t}: {len(rows)}")
        try:
            nids = sb.call("POST", "/rest/v1/rpc/migration_export_nids", {})
            add("nids.json", json.dumps(nids).encode())
            log(f"  کدهای ملی: {len(nids.get('nids') or [])}")
        except urllib.error.HTTPError as e:
            log(f"  ⚠ کدهای ملی برون‌بری نشد ({e.code}) — migration_054 روی Supabase اجرا شده؟")
        files = 0
        for b in BUCKETS:
            for name in list_bucket(sb, b, ""):
                try:
                    data, hdr = sb.req("GET", f"/storage/v1/object/authenticated/{b}/" + urllib.parse.quote(name),
                                       raw=True)
                except (urllib.error.HTTPError, RuntimeError) as e:
                    log(f"  ⚠ {b}/{name}: {e}")
                    continue
                add(f"files/{b}/{name}", data)
                files += 1
            log(f"  فایل‌ها تا {b}: {files}")
        add("manifest.json", json.dumps({"kind": "jaryan-transfer", "v": 1, "from": sb.url,
                                         "created": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()),
                                         "counts": counts, "files": files}, ensure_ascii=False).encode())
    subprocess.run(["openssl", "enc", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-salt",
                    "-in", tar_path, "-out", out_path, "-pass", "env:EXPORT_PASSWORD"],
                   check=True, env=dict(os.environ, EXPORT_PASSWORD=password))
    shutil.rmtree(work, ignore_errors=True)
    log("خروجی:", out_path, os.path.getsize(out_path), "بایت")


def list_bucket(sb, bucket, prefix):
    out, off = [], 0
    while True:
        try:
            items = sb.call("POST", f"/storage/v1/object/list/{bucket}",
                            {"prefix": prefix, "limit": 1000, "offset": off, "sortBy": {"column": "name", "order": "asc"}})
        except urllib.error.HTTPError:
            return out
        for it in items or []:
            full = (prefix + "/" if prefix else "") + it["name"]
            if it.get("id") is None:
                out += list_bucket(sb, bucket, full)
            else:
                out.append(full)
        if not items or len(items) < 1000:
            return out
        off += len(items)


# ---------------------------------------------------------------- ورود (روی سرور)

def local_tables():
    out = S.psql("""select coalesce(json_object_agg(table_name, cols), '{}') from (
        select c.table_name, json_agg(c.column_name order by c.ordinal_position) cols
          from information_schema.columns c join information_schema.tables t
            on t.table_schema = c.table_schema and t.table_name = c.table_name
         where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
           and c.is_generated = 'NEVER' group by c.table_name) x""").strip()
    return json.loads(out)


def import_(path, public_url=None, progress=log):
    work = tempfile.mkdtemp(dir=S.ROOT + "/var/lib/jaryan" if os.path.isdir(S.ROOT + "/var/lib/jaryan") else None)
    try:
        tar_path = os.path.join(work, "data.tar")
        r = subprocess.run(["openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "200000",
                            "-in", path, "-out", tar_path, "-pass", "env:EXPORT_PASSWORD"],
                           capture_output=True, env=os.environ)
        if r.returncode != 0:
            raise ValueError("رمز فایل داده درست نیست یا فایل خراب است.")
        cols = local_tables()
        sqlf = os.path.join(work, "import.sql")
        counts, files = {}, []
        with tarfile.open(tar_path, "r:") as tf, open(sqlf, "w", encoding="utf-8") as out:
            names = tf.getnames()
            if "manifest.json" not in names:
                raise ValueError("این فایل، فایل انتقال داده‌ی جریان نیست.")
            man = json.loads(tf.extractfile("manifest.json").read())
            progress(f"فایل داده از {man.get('created')}")
            out.write("set session_replication_role = replica;\nset statement_timeout = 0;\n")
            tables = [n[len("tables/"):-len(".json.gz")] for n in names if n.startswith("tables/")]
            present = [t for t in tables if t in cols]
            out.write("truncate " + ", ".join(f"public.{t}" for t in present) + " restart identity cascade;\n")
            for t in present:
                rows = json.loads(gzip.decompress(tf.extractfile(f"tables/{t}.json.gz").read()))
                counts[t] = len(rows)
                if not rows:
                    continue
                keys = [c for c in cols[t] if c in rows[0]]
                clist = ", ".join(f'"{c}"' for c in keys)
                for i in range(0, len(rows), 1000):
                    chunk = [{k: r.get(k) for k in keys} for r in rows[i:i + 1000]]
                    out.write(f"insert into public.{t} ({clist}) select {clist} from "
                              f"jsonb_populate_recordset(null::public.{t}, {S.jlit(chunk)});\n")
            if "nids.json" in names:
                nids = json.loads(tf.extractfile("nids.json").read())
                if nids.get("pepper"):
                    out.write(f"insert into app_config (key, value) values ('nid_pepper', {S.lit(nids['pepper'])}) "
                              "on conflict (key) do update set value = excluded.value;\n")
                    out.write("truncate public.app_user_nids;\n")
                    if nids.get("nids"):
                        out.write("insert into public.app_user_nids (user_id, nid_hash) select user_id, nid_hash from "
                                  f"jsonb_populate_recordset(null::public.app_user_nids, {S.jlit(nids['nids'])});\n")
            # شمارنده‌ها (serial/identity) بعد از ورود
            out.write("""do $$ declare r record; m bigint; begin
  for r in select c.table_name, c.column_name, pg_get_serial_sequence('public.' || c.table_name, c.column_name) s
             from information_schema.columns c where c.table_schema = 'public'
              and pg_get_serial_sequence('public.' || c.table_name, c.column_name) is not null loop
    execute format('select max(%I) from public.%I', r.column_name, r.table_name) into m;
    perform setval(r.s, greatest(coalesce(m, 0), 1), m is not null);
  end loop; end $$;\n""")
            # فایل‌ها
            out.write("delete from storage.objects;\n")
            objs = []
            for m in tf.getmembers():
                if not m.isfile() or not m.name.startswith("files/"):
                    continue
                _, bucket, name = m.name.split("/", 2)
                if bucket not in BUCKETS or ".." in name.split("/"):
                    continue
                files.append((m, bucket, name))
                objs.append({"bucket_id": bucket, "name": name, "metadata": {
                    "size": m.size, "mimetype": mimetypes.guess_type(name)[0] or "application/octet-stream"}})
            for i in range(0, len(objs), 2000):
                out.write("insert into storage.objects (bucket_id, name, metadata) select bucket_id, name, metadata "
                          f"from jsonb_populate_recordset(null::storage.objects, {S.jlit(objs[i:i + 2000])});\n")
            progress(f"جدول‌ها: {len(present)}، فایل‌ها: {len(files)}")
            # فایل‌ها پیش از اجرای SQL روی دیسک (در پوشه‌ی موقت کنار files)
            stage = os.path.join(work, "files")
            for m, bucket, name in files:
                dest = os.path.join(stage, bucket, *name.split("/"))
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with tf.extractfile(m) as src, open(dest, "wb") as d:
                    shutil.copyfileobj(src, d)
        progress("ورود به پایگاه داده (یک تراکنش)…")
        with open(sqlf, encoding="utf-8") as f:
            S.psql(f.read(), timeout=3600)
        # جایگزینی فایل‌ها
        old = FILES + ".old"
        shutil.rmtree(old, ignore_errors=True)
        if os.path.isdir(FILES):
            os.rename(FILES, old)
        shutil.move(os.path.join(work, "files"), FILES) if os.path.isdir(os.path.join(work, "files")) else os.makedirs(FILES)
        subprocess.run(["chown", "-R", "jaryan:jaryan", FILES], check=False)
        subprocess.run(["chmod", "-R", "u=rwX,g=rX,o=", FILES], check=False)
        shutil.rmtree(old, ignore_errors=True)
        if public_url:
            n = S.q1(f"select jaryan_meta.rewrite_urls({S.lit(SUPABASE_ORIGIN)}, {S.lit(public_url.rstrip('/'))})")
            progress(f"نشانی‌های بازنویسی‌شده: {n}")
        return {"tables": counts, "files": len(files)}
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main(argv):
    if len(argv) >= 4 and argv[1] == "export" and argv[2] == "--out":
        export(argv[3])
        return 0
    if len(argv) >= 3 and argv[1] == "import":
        res = import_(argv[2], argv[3] if len(argv) > 3 else None)
        log(json.dumps(res, ensure_ascii=False))
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
