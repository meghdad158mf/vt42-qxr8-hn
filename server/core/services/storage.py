#!/usr/bin/env python3
"""جانشین Supabase Storage روی سرور خودمان — همان نشانی‌های /storage/v1/object/... .

فایل‌ها روی دیسک (/var/lib/jaryan/files/<bucket>/<مسیر>) و ردیفشان در storage.objects
(تا storage_usage و سابقه‌ی ظرفیت مثل قبل کار کنند). مجوز همان RLS پایگاه داده است:
هر نوشتن/حذف با «set local role <نقش توکن>» انجام می‌شود، پس policyهای migrationها
(مثلاً فقط مدیر در magazines بنویسد) بدون تکرار در این کد اعمال می‌شوند.

  POST|PUT /storage/v1/object/<bucket>/<path>        بارگذاری (x-upsert)
  POST     /storage/v1/object/sign/<bucket>[/<path>]  لینک امن (تکی یا paths دسته‌ای)
  GET      /storage/v1/object/sign/<bucket>/<path>?token=…  فایل خصوصی (X-Accel-Redirect)
  POST     /storage/v1/object/remove/<bucket>  و  DELETE /storage/v1/object/<bucket>   {prefixes}
  POST     /storage/v1/object/list/<bucket>    {prefix, search, limit, offset}
فایل‌های bucketهای عمومی را nginx مستقیم از دیسک می‌دهد (/storage/v1/object/public/...).
"""
import hashlib
import hmac
import http.server
import json
import mimetypes
import os
import re
import secrets
import sys
import time
import urllib.parse
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srvlib as S  # noqa: E402

LISTEN = os.environ.get("JARYAN_STORAGE_LISTEN", "127.0.0.1:8092")
FILES = os.environ.get("JARYAN_FILES", S.ROOT + "/var/lib/jaryan/files")
MAX_UPLOAD = 60 * 1024 * 1024
ROLES = {"anon", "app_admin", "app_viewer"}
SEG_RE = re.compile(r"^[^/\x00]{1,255}$")

_secret = {"v": None, "at": 0}


def jwt_secret():
    if time.time() - _secret["at"] > 60:
        _secret["v"] = S.service_env().get("JWT_SECRET") or S.load_secrets()["jwt_secret"]
        _secret["at"] = time.time()
    return _secret["v"]


def jwt_decode(token):
    """فقط HS256 و فقط با رمز همین سرور؛ None اگر نامعتبر یا منقضی."""
    try:
        head, body, sig = token.split(".")
        want = hmac.new(jwt_secret().encode(), f"{head}.{body}".encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(S.b64url(want), sig):
            return None
        h = json.loads(S.b64url_decode(head))
        p = json.loads(S.b64url_decode(body))
        if h.get("alg") != "HS256":
            return None
        if p.get("exp") is not None and p["exp"] < time.time():
            return None
        return p
    except (ValueError, TypeError, AttributeError):
        return None


def safe_parts(bucket, path):
    """bucket و مسیر بدون ..، بدون مسیر مطلق؛ وگرنه None."""
    if not bucket or not SEG_RE.match(bucket) or bucket in (".", ".."):
        return None
    parts = [p for p in (path or "").split("/")]
    if not parts or any(not SEG_RE.match(p) or p in (".", "..") for p in parts):
        return None
    return bucket, "/".join(parts)


def disk_path(bucket, name):
    return os.path.join(FILES, bucket, *name.split("/"))


def as_role(claims, sql):
    """SQL با نقش و claims همان توکن (RLS اعمال می‌شود)."""
    role = claims.get("role", "anon")
    if role not in ROLES:
        role = "anon"
    head = (f"do $$ begin perform set_config('request.jwt.claims', {S.lit(json.dumps(claims))}, true); end $$;\n"
            f"set local role {role};\n")
    return S.psql(head + sql).strip().splitlines()


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "jaryan-storage"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def reply(self, code, obj=None, headers=None, raw=None):
        data = raw if raw is not None else json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        if raw is None:
            self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def error(self, code, msg, status=None):
        self.reply(code, {"statusCode": str(status or code), "error": msg, "message": msg})

    def claims(self):
        auth = self.headers.get("Authorization", "")
        tok = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
        p = jwt_decode(tok) if tok else None
        return p if p and p.get("role") in ROLES else None

    def body_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 1024 * 1024:
            return None
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return None

    def route(self):
        u = urllib.parse.urlsplit(self.path)
        p = urllib.parse.unquote(u.path)
        if not p.startswith("/storage/v1/object/"):
            return None, None, None
        rest = p[len("/storage/v1/object/"):]
        return rest, urllib.parse.parse_qs(u.query), u

    # ------------------------------------------------------------ GET (لینک امن)
    def do_GET(self):
        rest, qs, _ = self.route()
        if rest is None or not rest.startswith("sign/"):
            return self.error(404, "not_found")
        bucket, _, name = rest[5:].partition("/")
        sp = safe_parts(bucket, name)
        tok = (qs.get("token") or [""])[0]
        p = jwt_decode(tok) if sp else None
        if not p or p.get("url") != f"{bucket}/{name}":
            return self.error(400, "InvalidJWT", 400)
        fp = disk_path(*sp)
        if not os.path.isfile(fp):
            return self.error(404, "not_found")
        ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
        rel = "/".join(urllib.parse.quote(x) for x in [bucket] + name.split("/"))
        self.reply(200, raw=b"", headers={"X-Accel-Redirect": "/_jaryan_files/" + rel, "Content-Type": ctype,
                                          "Cache-Control": "private, max-age=600"})

    # ------------------------------------------------------------ POST/PUT/DELETE
    def do_PUT(self):
        self.do_POST(method="PUT")

    def do_DELETE(self):
        rest, _, _ = self.route()
        cl = self.claims()
        if rest is None or "/" in rest or not cl:
            return self.error(400 if cl else 401, "invalid")
        return self.remove(rest, cl)

    def do_POST(self, method="POST"):
        rest, _, _ = self.route()
        if rest is None:
            return self.error(404, "not_found")
        cl = self.claims()
        if not cl:
            return self.error(401, "Unauthorized", 401)
        head, _, tail = rest.partition("/")
        if head == "sign" and method == "POST":
            return self.sign(tail, cl)
        if head == "remove" and method == "POST":
            return self.remove(tail, cl)
        if head == "list" and method == "POST":
            return self.list(tail, cl)
        return self.upload(head, tail, cl, method)

    def upload(self, bucket, name, cl, method):
        sp = safe_parts(bucket, name)
        if not sp:
            return self.error(400, "InvalidKey", 400)
        n = int(self.headers.get("Content-Length") or -1)
        if n < 0:
            return self.error(411, "length_required")
        if n > MAX_UPLOAD:
            return self.error(413, "Payload too large", 413)
        upsert = (self.headers.get("x-upsert") or "").lower() == "true" or method == "PUT"
        ctype = (self.headers.get("Content-Type") or "application/octet-stream")[:200]
        fp = disk_path(*sp)
        os.makedirs(os.path.dirname(fp), exist_ok=True)
        tmp = f"{fp}.part-{secrets.token_hex(4)}"
        md5 = hashlib.md5()
        left = n
        with open(tmp, "wb") as f:
            while left > 0:
                chunk = self.rfile.read(min(left, 1 << 20))
                if not chunk:
                    break
                md5.update(chunk)
                f.write(chunk)
                left -= len(chunk)
        if left:
            os.remove(tmp)
            return self.error(400, "incomplete_body")
        meta = {"size": n, "mimetype": ctype, "eTag": f'"{md5.hexdigest()}"', "contentLength": n,
                "cacheControl": "max-age=3600", "lastModified": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        oid = str(uuid.uuid4())
        conflict = ("on conflict (bucket_id, name) do update set metadata = excluded.metadata, updated_at = now()"
                    if upsert else "on conflict (bucket_id, name) do nothing")
        try:
            rows = as_role(cl, f"""insert into storage.objects (id, bucket_id, name, metadata)
                values ({S.lit(oid)}, {S.lit(bucket)}, {S.lit(name)}, {S.jlit(meta)}) {conflict}
                returning id;""")
        except S.DbError as e:
            os.remove(tmp)
            if "row-level security" in str(e) or "permission denied" in str(e):
                return self.error(403, "Unauthorized", 403)
            if "foreign key" in str(e):
                return self.error(404, "Bucket not found", 404)
            return self.error(500, "db_error")
        if not rows:
            os.remove(tmp)
            return self.error(400, "The resource already exists", 409)
        os.replace(tmp, fp)
        os.chmod(fp, 0o640)
        self.reply(200, {"Key": f"{bucket}/{name}", "Id": rows[0]})

    def sign(self, tail, cl):
        body = self.body_json()
        if body is None:
            return self.error(400, "invalid_json")
        exp = int(time.time()) + max(1, min(int(body.get("expiresIn") or 60), 7 * 24 * 3600))
        bucket, _, one = tail.partition("/")
        paths = [one] if one else [p for p in (body.get("paths") or []) if isinstance(p, str)][:1000]
        ok = []
        good = [p for p in paths if safe_parts(bucket, p)]
        if good:
            try:
                rows = as_role(cl, f"""select coalesce(json_agg(name), '[]') from storage.objects
                    where bucket_id = {S.lit(bucket)} and name in (select jsonb_array_elements_text({S.jlit(good)}));""")
                ok = set(json.loads("".join(rows) or "[]"))
            except S.DbError:
                return self.error(403, "Unauthorized", 403)
        out = []
        for p in paths:
            if p in ok:
                tok = S.make_jwt({"url": f"{bucket}/{p}", "iat": int(time.time()), "exp": exp}, jwt_secret())
                url = f"/object/sign/{bucket}/" + "/".join(urllib.parse.quote(x) for x in p.split("/")) + "?token=" + tok
                out.append({"error": None, "path": p, "signedURL": url})
            else:
                out.append({"error": "Either the object does not exist or you do not have access to it",
                            "path": p, "signedURL": None})
        if one:
            if out[0]["signedURL"]:
                return self.reply(200, {"signedURL": out[0]["signedURL"]})
            return self.error(404, "Object not found", 404)
        self.reply(200, out)

    def remove(self, bucket, cl):
        body = self.body_json()
        names = [p for p in ((body or {}).get("prefixes") or []) if isinstance(p, str) and safe_parts(bucket, p)][:1000]
        if not names:
            return self.reply(200, [])
        try:
            rows = as_role(cl, f"""with d as (delete from storage.objects where bucket_id = {S.lit(bucket)}
                and name in (select jsonb_array_elements_text({S.jlit(names)})) returning id, bucket_id, name, metadata, created_at, updated_at)
                select coalesce(json_agg(d), '[]') from d;""")
        except S.DbError:
            return self.error(403, "Unauthorized", 403)
        deleted = json.loads("".join(rows) or "[]")
        for d in deleted:
            try:
                os.remove(disk_path(bucket, d["name"]))
            except OSError:
                pass
        self.reply(200, deleted)

    def list(self, bucket, cl):
        body = self.body_json() or {}
        prefix = str(body.get("prefix") or "")
        if prefix and not prefix.endswith("/"):
            prefix += "/"
        search = str(body.get("search") or "")
        limit = max(1, min(int(body.get("limit") or 100), 1000))
        offset = max(0, int(body.get("offset") or 0))
        like = (prefix + search).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        try:
            rows = as_role(cl, f"""select coalesce(json_agg(x order by x.name), '[]') from (
              select distinct on (part) part as name,
                     case when position('/' in rest) = 0 then id end as id,
                     case when position('/' in rest) = 0 then updated_at end as updated_at,
                     case when position('/' in rest) = 0 then created_at end as created_at,
                     case when position('/' in rest) = 0 then last_accessed_at end as last_accessed_at,
                     case when position('/' in rest) = 0 then metadata end as metadata
                from (select o.*, substr(o.name, {len(prefix) + 1}) as rest,
                             split_part(substr(o.name, {len(prefix) + 1}), '/', 1) as part
                        from storage.objects o
                       where o.bucket_id = {S.lit(bucket)} and o.name like {S.lit(like)}) y
               order by part, (position('/' in rest) = 0) desc
               limit {limit} offset {offset}) x;""")
        except S.DbError:
            return self.error(403, "Unauthorized", 403)
        self.reply(200, json.loads("".join(rows) or "[]"))


def main():
    os.umask(0o027)
    host, port = LISTEN.rsplit(":", 1)
    srv = http.server.ThreadingHTTPServer((host, int(port)), Handler)
    srv.daemon_threads = True
    srv.serve_forever()


if __name__ == "__main__":
    main()
