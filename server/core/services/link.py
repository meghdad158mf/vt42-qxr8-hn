"""پیوند سرور ایران و سرور خارجی (تصمیم کاربر، مهر/آبان ۱۴۰۵).

سرور خارجی تلگرام و منابع فیلترشده را جمع می‌کند و به سرور ایران می‌رساند؛ سه لایه:
  ۱) ارسال مستقیم: خارجی هر ۵ دقیقه POST /link/v1/push به ایران (پاسخ = تأیید + فهرست منابع)؛
     اگر این جهت بسته بود، ایران خودش GET /link/v1/pull از خارجی می‌گیرد و POST /link/v1/ack می‌زند.
  ۳) صف: خارجی هر چه تأیید نشده نگه می‌دارد و دوباره می‌فرستد — فقط یک هفته‌ی اخیر.
  ۴) دستی (قطع کامل): «فایل داده» امضاشده در /setup خارجی ساخته و در /setup ایران بارگذاری می‌شود.
هر درخواست/فایل با HMAC-SHA256 کلید مشترک (/etc/jaryan/link.key) امضا می‌شود؛ ورود بدون تکرار
(upsert روی منبع + شناسه‌ی پست)، پس دوبار رسیدن یک دسته اشکالی ندارد. ستون‌های هوش مصنوعی و
«پنهان» سرور ایران هرگز با داده‌ی خارجی بازنویسی نمی‌شوند.
"""
import base64
import datetime as dt
import gzip
import hashlib
import hmac
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srvlib as S  # noqa: E402

KEY_FILE = S.ETC + "/link.key"
STATE_FILE = os.environ.get("JARYAN_LINK_STATE", S.ROOT + "/var/lib/jaryan/jobs/link.json")
FILES = os.environ.get("JARYAN_FILES", S.ROOT + "/var/lib/jaryan/files")
API = os.environ.get("JARYAN_API_BASE", "http://127.0.0.1")
BATCH = 400
MAX_MEDIA = 24 * 1024 * 1024            # حجم رسانه در هر دسته
MAX_ONE_MEDIA = 50 * 1024 * 1024        # یک فایل بزرگ‌تر از سقف دسته تنها در یک دسته می‌رود؛ بزرگ‌تر از این نه
EPOCH = "1970-01-01T00:00:00Z"
REACH_EVERY = 6 * 3600                  # هر چند وقت سرور ایران دسترسی به سایت‌ها را می‌سنجد
KEEP_DAYS = 7
SKEW = 600
# ستون‌هایی که سرور ایران خودش پر می‌کند و نباید با داده‌ی خارجی عوض شوند
IRAN_ONLY = {"id", "channel_id", "scraped_at", "ai_keywords", "ai_keywords_extracted_at", "hawza_relevant",
             "section_relevant", "hidden_at"}
CHANNEL_SKIP = {"id", "category_id", "region_id", "hawza_region_id"}
_ctx = ssl.create_default_context()
_ctx.check_hostname = False
_ctx.verify_mode = ssl.CERT_NONE        # گواهی موقت خودامضا؛ درستی با امضای HMAC بررسی می‌شود


def key():
    try:
        with open(KEY_FILE, encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


def conf():
    try:
        with open(S.ETC + "/server.json", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def state():
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_state(**kw):
    st = state()
    st.update(kw)
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(st, f)
    os.replace(tmp, STATE_FILE)


def sign(body, t=None):
    t = str(int(t or time.time()))
    mac = hmac.new(key().encode(), t.encode() + b"\n" + hashlib.sha256(body).digest(), hashlib.sha256).hexdigest()
    return t, mac


def verify(body, t, mac):
    k = key()
    if not k or not t or not mac:
        return False
    try:
        if abs(time.time() - int(t)) > SKEW:
            return False
    except ValueError:
        return False
    want = hmac.new(k.encode(), t.encode() + b"\n" + hashlib.sha256(body).digest(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, mac)


# ---------------------------------------------------------------- رابط برنامه‌ی همین سرور

def token():
    sec = S.service_env().get("JWT_SECRET") or S.load_secrets()["jwt_secret"]
    return S.make_jwt({"role": "app_admin", "iss": "jaryan-link", "exp": int(time.time()) + 900}, sec)


def anon():
    return S.service_env().get("ANON_KEY") or S.load_secrets()["anon_key"]


def rest(method, path, body=None, prefer=None):
    h = {"apikey": anon(), "Authorization": "Bearer " + token(), "Content-Type": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    r = urllib.request.Request(API + "/rest/v1" + path, data=data, headers=h, method=method)
    with urllib.request.urlopen(r, timeout=120) as resp:
        raw = resp.read()
    return json.loads(raw) if raw else None


def upload(bucket, path, content, ctype):
    r = urllib.request.Request(
        f"{API}/storage/v1/object/{bucket}/" + "/".join(urllib.parse.quote(p) for p in path.split("/")),
        data=content, method="POST",
        headers={"Authorization": "Bearer " + token(), "Content-Type": ctype or "application/octet-stream",
                 "x-upsert": "true"})
    with urllib.request.urlopen(r, timeout=120):
        pass


# ---------------------------------------------------------------- سمت خارجی: ساختن دسته
# نشانگر ادامه = (scraped_at، id) هم برای پست‌ها و هم برای یافته‌های خزنده، به شکل «t|id|t|id».
# همه‌ی پست‌های یک درخواست جمع‌آوری scraped_at یکسان دارند؛ با scraped_at تنها، مرز دسته وسط
# چنین گروهی بقیه‌ی گروه را برای همیشه جا می‌انداخت. نشانگر قدیمی (فقط زمان) هم پذیرفته می‌شود.

def parse_cursor(s):
    parts = (s or "").split("|")
    if len(parts) == 4:
        try:
            return parts[0] or EPOCH, int(parts[1]), parts[2] or EPOCH, int(parts[3])
        except ValueError:
            pass
    t = s if s and "|" not in s else EPOCH
    return t, 0, t, 0


def fmt_cursor(pt, pid, mt, mid):
    return f"{pt}|{pid}|{mt}|{mid}"


def after(t, i):
    """شرط PostgREST: (scraped_at، id) بعد از (t، i)."""
    return "or=" + urllib.parse.quote(f'(scraped_at.gt."{t}",and(scraped_at.eq."{t}",id.gt.{int(i)}))')


def media_file(path):
    return os.path.join(FILES, "post-media", *path.split("/"))


def build_batch(since, limit=BATCH):
    """پست‌های بعد از نشانگر با شناسه‌ی منبع و رسانه؛ + یافته‌های خزنده.

    رسانه هرگز کنار گذاشته نمی‌شود: اگر جا نشد، دسته پیش از همان پست بسته می‌شود و پست
    با رسانه‌اش در دسته‌ی بعد می‌رود (فقط فایل بزرگ‌تر از MAX_ONE_MEDIA بی‌رسانه می‌رود)."""
    pt, pid, mt, mid = parse_cursor(since)
    rows = rest("GET", f"/posts?{after(pt, pid)}&order=scraped_at.asc,id.asc&limit={limit}"
                       "&select=*,channels(platform,username)") or []
    posts, media, size, cut = [], {}, 0, False
    for p in rows:
        path = p.get("media_storage_path")
        data = None
        if path:
            try:
                n = os.path.getsize(media_file(path))
            except OSError:
                n = None
            if n is not None and n <= MAX_ONE_MEDIA:
                if posts and size + n > MAX_MEDIA:
                    cut = True
                    break
                with open(media_file(path), "rb") as f:
                    data = f.read()
        ch = p.pop("channels", None) or {}
        p["_channel"] = {"platform": ch.get("platform"), "username": ch.get("username")}
        if data is not None:
            media[path] = base64.b64encode(data).decode()
            size += len(data)
        posts.append(p)
    if posts:
        pt, pid = posts[-1]["scraped_at"], posts[-1]["id"]
    mentions = rest("GET", f"/hawza_mentions?post_id=is.null&{after(mt, mid)}&order=scraped_at.asc,id.asc&limit=500") or []
    if mentions:
        mt, mid = mentions[-1]["scraped_at"], mentions[-1]["id"]
    return {"v": 2, "from": conf().get("public_url", ""), "since": since, "upto": fmt_cursor(pt, pid, mt, mid),
            "more": cut or len(rows) >= limit or len(mentions) >= 500, "posts": posts, "media": media,
            "mentions": mentions}


def channels_snapshot():
    """فهرست منابعی که سرور خارجی باید جمع کند (سرور ایران منبع حقیقت است).

    تلگرام همیشه؛ وب‌سایت‌ها و سایت‌های خزنده فقط آن‌هایی که از خودِ سرور ایران در دسترس
    نیستند (سنجش هر ۶ ساعت در refresh_reach). تا نخستین سنجش، همه فرستاده می‌شوند."""
    chans = rest("GET", "/channels?select=*&platform=in.(telegram,website)") or []
    sites = rest("GET", "/crawl_sites?select=name,url,sitemap_url,active,source") or []
    reach = state().get("reach")
    if reach:
        bad_ch, bad_site = set(reach.get("channels") or []), set(reach.get("sites") or [])
        chans = [c for c in chans if c["platform"] == "telegram" or c["username"] in bad_ch]
        sites = [x for x in sites if x["url"] in bad_site]
    return {"channels": chans, "crawl_sites": sites, "reach_known": bool(reach)}


def probe(url, timeout=15):
    """از همین سرور در دسترس است؟ (خطای شبکه، پایان مهلت یا ۵xx = نه)."""
    try:
        r = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (jaryan-reach)"})
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            resp.read(512)
            return resp.status < 500
    except urllib.error.HTTPError as e:
        return e.code < 500
    except Exception:  # noqa: BLE001
        return False


def refresh_reach(force=False):
    """سرور ایران: کدام وب‌سایت‌ها و سایت‌های خزنده از اینجا باز نمی‌شوند (سرور خارجی همان‌ها را جمع کند)."""
    st = state()
    if not force and (st.get("reach") or {}).get("at", 0) > time.time() - REACH_EVERY:
        return st["reach"]
    from concurrent.futures import ThreadPoolExecutor
    chans = rest("GET", "/channels?select=username&platform=eq.website&active=is.true") or []
    sites = rest("GET", "/crawl_sites?select=url&active=is.true") or []
    urls = sorted({c["username"] for c in chans if c.get("username")} | {x["url"] for x in sites if x.get("url")})
    with ThreadPoolExecutor(12) as ex:
        ok = dict(zip(urls, ex.map(probe, urls)))
    # یک بار دیگر برای ناموفق‌ها (قطعی لحظه‌ای سایت دلیل فرستادن به خارج نیست)
    with ThreadPoolExecutor(12) as ex:
        again = [u for u in urls if not ok[u]]
        ok.update(zip(again, ex.map(probe, again)))
    reach = {"at": time.time(),
             "channels": [c["username"] for c in chans if c.get("username") and not ok.get(c["username"], True)],
             "sites": [x["url"] for x in sites if x.get("url") and not ok.get(x["url"], True)]}
    save_state(reach=reach)
    return reach


def apply_snapshot(snap):
    """روی سرور خارجی: منابع را با فهرست ایران یکی کن (تازه‌ها اضافه، نبودها متوقف)."""
    chans = snap.get("channels") or []
    if chans:
        rows = [{k: v for k, v in c.items() if k not in CHANNEL_SKIP} for c in chans]
        rest("POST", "/channels?on_conflict=platform,username", rows, "resolution=merge-duplicates,return=minimal")
        keep = {(c["platform"], c["username"]) for c in chans}
        mine = rest("GET", "/channels?select=id,platform,username,active&platform=in.(telegram,website)") or []
        stale = [str(c["id"]) for c in mine if (c["platform"], c["username"]) not in keep and c["active"]]
        if stale:
            rest("PATCH", f"/channels?id=in.({','.join(stale)})", {"active": False}, "return=minimal")
    sites = snap.get("crawl_sites") or []
    if sites:
        rest("POST", "/crawl_sites?on_conflict=url", sites, "resolution=merge-duplicates,return=minimal")
    if snap.get("reach_known"):
        keep_sites = {x["url"] for x in sites}
        mine = rest("GET", "/crawl_sites?select=id,url,active&active=is.true") or []
        stale = [str(x["id"]) for x in mine if x["url"] not in keep_sites]
        if stale:
            rest("PATCH", f"/crawl_sites?id=in.({','.join(stale)})", {"active": False}, "return=minimal")


# ---------------------------------------------------------------- سمت ایران: ورود دسته

def ingest(batch):
    posts = batch.get("posts") or []
    media = batch.get("media") or {}
    ids = {}
    for c in rest("GET", "/channels?select=id,platform,username") or []:
        ids[(c["platform"], (c["username"] or "").lower())] = c["id"]
    public = conf().get("public_url", "").rstrip("/")
    rows, skipped = [], 0
    for p in posts:
        ch = p.get("_channel") or {}
        cid = ids.get((ch.get("platform"), (ch.get("username") or "").lower()))
        if not cid:
            skipped += 1
            continue
        row = {k: v for k, v in p.items() if k not in IRAN_ONLY and not k.startswith("_")}
        row["channel_id"] = cid
        path = p.get("media_storage_path")
        if path and path in media:
            upload("post-media", path, base64.b64decode(media[path]), None)
            if public:
                row["media_path"] = f"{public}/storage/v1/object/public/post-media/{path}"
        elif path:
            # فایل رسانه روی سرور خارجی نبود یا بزرگ‌تر از MAX_ONE_MEDIA بود؛ بدون رسانه ثبت می‌شود
            for k in ("media_path", "media_storage_path", "media_fetched_at"):
                row.pop(k, None)
        rows.append(row)
    for i in range(0, len(rows), 200):
        rest("POST", "/posts?on_conflict=channel_id,platform_post_id", rows[i:i + 200],
             "resolution=merge-duplicates,return=minimal")
    ments = [{k: v for k, v in m.items() if k not in ("id", "post_id", "hidden_at")} for m in batch.get("mentions") or []]
    if ments:
        rest("POST", "/hawza_mentions?on_conflict=url", ments, "resolution=merge-duplicates,return=minimal")
    save_state(last_ingest=time.time(), last_ingest_count=len(rows))
    return {"ok": True, "ack": batch.get("upto"), "count": len(rows), "skipped": skipped}


# ---------------------------------------------------------------- HTTP (در سرویس jaryan-jobs)

def handle(method, path, headers, body, query):
    """(کد، شیء پاسخ) — امضا بررسی شده باشد یا نه، همین‌جا."""
    if not verify(body, headers.get("X-Jaryan-Time"), headers.get("X-Jaryan-Sig")):
        return 401, {"error": "bad signature"}
    role = conf().get("role", "iran")
    if path.endswith("/push") and method == "POST" and role == "iran":
        res = ingest(json.loads(gzip.decompress(body)))
        res.update(channels_snapshot())
        return 200, res
    if path.endswith("/pull") and method == "GET" and role == "foreign":
        since = (query.get("since") or [""])[0] or state().get("ack")
        return 200, build_batch(since)
    if path.endswith("/ack") and method == "POST" and role == "foreign":
        data = json.loads(body or b"{}")
        if data.get("ack"):
            save_state(ack=data["ack"], last_ok=time.time())
        apply_snapshot(data)
        return 200, {"ok": True}
    return 404, {"error": "not found"}


def _call(url, method="GET", body=b""):
    t, mac = sign(body)
    r = urllib.request.Request(url, data=body if method != "GET" else None, method=method,
                               headers={"X-Jaryan-Time": t, "X-Jaryan-Sig": mac, "Content-Type": "application/octet-stream"})
    with urllib.request.urlopen(r, timeout=180, context=_ctx) as resp:
        return json.loads(resp.read() or b"null")


def tick():
    """هر ۵ دقیقه از زمان‌بند."""
    sc = conf()
    if not key():
        return
    if sc.get("role") == "foreign" and sc.get("link_url"):
        housekeep_foreign()
        for _ in range(10):                       # تا ۱۰ دسته در هر نوبت
            st = state()
            batch = build_batch(st.get("ack"))
            if not batch["posts"] and not batch["mentions"] and st.get("snap_at", 0) > time.time() - 3600:
                return
            body = gzip.compress(json.dumps(batch, ensure_ascii=False).encode())
            try:
                res = _call(sc["link_url"].rstrip("/") + "/link/v1/push", "POST", body)
            except (urllib.error.URLError, OSError, ValueError) as e:
                save_state(last_error=str(e)[:300], last_error_at=time.time())
                return
            if res and res.get("ok"):
                save_state(ack=res.get("ack") or st.get("ack"), last_ok=time.time(), snap_at=time.time())
                apply_snapshot(res)
            if not batch["more"]:
                return
    elif sc.get("role", "iran") == "iran":
        try:
            refresh_reach()
        except (urllib.error.URLError, OSError, ValueError) as e:
            print("link reach:", str(e)[:300], file=sys.stderr)
        if not sc.get("link_peer"):
            return
        st = state()
        if time.time() - st.get("last_ingest", 0) < 15 * 60:
            return                                # خارجی خودش می‌فرستد
        for _ in range(10):
            q = urllib.parse.urlencode({"since": state().get("pull_since", "")})
            try:
                batch = _call(sc["link_peer"].rstrip("/") + "/link/v1/pull?" + q)
            except (urllib.error.URLError, OSError, ValueError) as e:
                save_state(last_error=str(e)[:300], last_error_at=time.time())
                return
            res = ingest(batch)
            save_state(pull_since=res["ack"])
            ack = dict(channels_snapshot(), ack=res["ack"])
            try:
                _call(sc["link_peer"].rstrip("/") + "/link/v1/ack", "POST", json.dumps(ack, ensure_ascii=False).encode())
            except (urllib.error.URLError, OSError, ValueError):
                pass
            if not batch.get("more"):
                return


def housekeep_foreign():
    """سرور خارجی فقط یک هفته‌ی اخیر را نگه می‌دارد (صف ارسال)."""
    st = state()
    if st.get("hk_at", 0) > time.time() - 6 * 3600:
        return
    cut = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=KEEP_DAYS)).isoformat()
    try:
        old = rest("GET", f"/posts?scraped_at=lt.{urllib.parse.quote(cut)}&select=id,media_storage_path&limit=2000") or []
        paths = [p["media_storage_path"] for p in old if p.get("media_storage_path")]
        if paths:
            r = urllib.request.Request(f"{API}/storage/v1/object/post-media", method="DELETE",
                                       data=json.dumps({"prefixes": paths}).encode(),
                                       headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"})
            urllib.request.urlopen(r, timeout=120).read()
        if old:
            rest("DELETE", "/posts?id=in.(" + ",".join(str(p["id"]) for p in old) + ")", None, "return=minimal")
        save_state(hk_at=time.time())
    except (urllib.error.URLError, OSError, ValueError) as e:
        print("link housekeeping:", str(e)[:300], file=sys.stderr)


# ---------------------------------------------------------------- فایل داده (لایه‌ی ۴)

def export_bundle(out_path, since=None):
    """همه‌ی یک هفته‌ی اخیر (یا از since) در یک فایل امضاشده."""
    since = since or (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=KEEP_DAYS)).isoformat()
    batches, cur = [], since
    for _ in range(100000):
        b = build_batch(cur, limit=BATCH)
        batches.append(b)
        if not b["more"] or b["upto"] == cur:
            break
        cur = b["upto"]
    body = gzip.compress(json.dumps({"v": 1, "kind": "jaryan-link-bundle", "batches": batches}, ensure_ascii=False).encode())
    t, mac = sign(body)
    with open(out_path, "wb") as f:
        f.write(f"JARYAN-LINK-1 {t} {mac}\n".encode())
        f.write(body)
    return sum(len(b["posts"]) for b in batches)


def import_bundle(path):
    with open(path, "rb") as f:
        head = f.readline().decode("ascii", "replace").split()
        body = f.read()
    if len(head) != 3 or head[0] != "JARYAN-LINK-1":
        raise ValueError("این فایل، فایل داده‌ی سرور خارجی نیست.")
    k = key()
    want = hmac.new(k.encode(), head[1].encode() + b"\n" + hashlib.sha256(body).digest(), hashlib.sha256).hexdigest()
    if not k or not hmac.compare_digest(want, head[2]):
        raise ValueError("امضای فایل درست نیست (کلید پیوند دو سرور یکی نیست یا فایل دستکاری شده).")
    data = json.loads(gzip.decompress(body))
    total = 0
    for b in data.get("batches") or []:
        total += ingest(b)["count"]
    return total
