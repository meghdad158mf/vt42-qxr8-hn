"""
عکس فوری از داده‌ی واقعی برای «نسخه‌ی نمایشی» (demo/) — فقط دستی (ورک‌فلوی demo-snapshot.yml).

فقط خواندن: هیچ چیزی در پایگاه داده یا Storage عوض نمی‌شه. خروجی در پوشه‌ی snapshot/:
  data.json   جدول‌های لازم نمای بیننده (بدون کاربران، ورودها، نظرات، مشترکین، اطلاعیه‌ها، دفتر تغییرات…)
  media/r/…   عکس پست‌ها (فقط آن‌هایی که هنوز در Storage هستند)، جلد روزنامه‌ها/بسته‌ها، نشان منابع
  sb/storage/v1/object/sign/<bucket>/…   فایل‌های خصوصی (بسته‌ی تحلیلی، بسته‌های سایر نهادها، گزارش مدارس)
ورک‌فلو بعدش کل پوشه رو با کلید عمومی demo/snapshot-key.pub.pem رمزنگاری می‌کنه؛ باز کردنش فقط با
کلید خصوصی روی رایانه‌ی سازنده‌ی دمو (demo/.local) ممکنه — ریپو عمومیه و خروجی کارها برای همه دانلودشدنی.
"""

import hashlib
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import requests

import jarian_common as jc

OUT = os.path.abspath("snapshot")
TIMEOUT = 60
DAYS = float(os.environ.get("SNAPSHOT_DAYS", "3"))
MAX_TOTAL = 350 * 1024 * 1024     # سقف کل فایل‌ها
MAX_FILE = 40 * 1024 * 1024       # سقف هر فایل
EXCLUDED_POST_COLS = {"raw"}

session = requests.Session()
total_bytes = 0


def get(token, path, params=None):
    r = session.get(f"{jc.SUPABASE_URL}/rest/v1/{path}", headers=jc.auth_headers(token), params=params, timeout=TIMEOUT)
    if r.status_code in (400, 404):
        print(f"  [!] {path}: {r.status_code} {r.text[:200]}", file=sys.stderr)
        return []
    r.raise_for_status()
    return r.json()


def get_paged(token, path, params, limit=1000, cap=8000):
    out = []
    for off in range(0, cap, limit):
        rows = get(token, path, {**params, "limit": limit, "offset": off})
        out += rows
        if len(rows) < limit:
            break
    return out


def save_file(rel, content):
    global total_bytes
    if len(content) > MAX_FILE or total_bytes + len(content) > MAX_TOTAL:
        return False
    full = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "wb") as f:
        f.write(content)
    total_bytes += len(content)
    return True


def download(url):
    try:
        r = session.get(url, timeout=TIMEOUT)
        if r.ok and r.content:
            return r.content
    except requests.RequestException:
        pass
    return None


def local_public(url, folder):
    """فایل عمومی Storage → media/r/<folder>/<hash>.<ext> ؛ نبود/خطا → None"""
    if not url or not url.startswith(jc.SUPABASE_URL + "/storage/v1/object/public/"):
        return None
    ext = os.path.splitext(url.split("?")[0])[1][:6] or ".bin"
    rel = f"media/r/{folder}/{hashlib.md5(url.encode()).hexdigest()[:16]}{ext}"
    if os.path.exists(os.path.join(OUT, rel)):
        return rel
    data = download(url)
    return rel if data and save_file(rel, data) else None


def fetch_private(token, bucket, paths):
    """فایل‌های bucket خصوصی با لینک امضاشده → sb/storage/v1/object/sign/<bucket>/<path>؛ مسیرهای ذخیره‌شده"""
    paths = [p for p in paths if p]
    if not paths:
        return set()
    r = session.post(f"{jc.SUPABASE_URL}/storage/v1/object/sign/{bucket}", headers=jc.auth_headers(token),
                     json={"expiresIn": 3600, "paths": paths}, timeout=TIMEOUT)
    if not r.ok:
        print(f"  [!] sign {bucket}: {r.status_code}", file=sys.stderr)
        return set()
    ok = set()
    for item in r.json():
        if not item.get("signedURL") or item.get("error"):
            continue
        data = download(jc.SUPABASE_URL + "/storage/v1" + item["signedURL"])
        if data and save_file(f"sb/storage/v1/object/sign/{bucket}/{item['path']}", data):
            ok.add(item["path"])
    return ok


def main():
    jc.require_env()
    token = jc.login(TIMEOUT)
    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=DAYS)).isoformat()
    os.makedirs(OUT, exist_ok=True)
    t = {}

    # ── جدول‌های پیکربندی و محتوای دستی ──
    t["channels"] = [c for c in get(token, "channels", {"select": "*", "order": "added_at.desc"}) if c.get("active") is not False]
    for name, order in [("categories", "name.asc"), ("regions", "id.asc"), ("profile_groups", "sort_order.asc"),
                        ("news_topics", "sort_order.asc"), ("dossier_topics", "sort_order.asc"),
                        ("news_pick_edits", "sort_order.asc")]:
        t[name] = get(token, name, {"select": "*", "order": order})
    t["channel_profile_groups"] = get(token, "channel_profile_groups", {"select": "id,channel_id,group_id"})
    t["dossier_topics"] = [d for d in t["dossier_topics"] if d.get("active")]
    t["news_ai_insights"] = get(token, "news_ai_insights", {"select": "*", "order": "computed_at.desc", "limit": 1})
    t["magazines"] = get(token, "magazines", {"select": "*", "order": "sort_order.asc,uploaded_at.desc", "limit": 8})
    t["archive_reports"] = get(token, "archive_reports", {"select": "*", "order": "sort_order.asc,uploaded_at.desc", "limit": 8})
    t["school_reports"] = get(token, "school_reports", {"select": "*", "order": "sort_order.asc,uploaded_at.desc", "limit": 14})
    papers = get(token, "newspapers", {"select": "*", "order": "edition_date.desc,title.asc", "limit": 200})
    dates = sorted({p["edition_date"] for p in papers}, reverse=True)[:2]
    t["newspapers"] = [p for p in papers if p["edition_date"] in dates]
    t["hawza_mentions"] = [m for m in get(token, "hawza_mentions", {"select": "*", "order": "scraped_at.desc", "limit": 400}) if not m.get("hidden_at")]
    t["newsletter_posts"] = get(token, "newsletter_posts", {"select": "*", "order": "section.asc,sort_order.asc"})
    topic_ids = {d["id"] for d in t["dossier_topics"]}
    t["dossier_topic_posts"] = [x for x in get(token, "dossier_topic_posts", {"select": "*", "order": "created_at.desc", "limit": 2000})
                                if x["topic_id"] in topic_ids and not x.get("excluded")]

    # ── پست‌ها: سه روز اخیر + منابع کم‌تکرار + پست‌هایی که جای دیگر ارجاع شده‌اند ──
    posts = {}
    def add(rows):
        for p in rows:
            if p.get("hidden_at"):
                continue
            for c in EXCLUDED_POST_COLS:
                p.pop(c, None)
            posts[p["id"]] = p
    add(get_paged(token, "posts", {"select": "*", "scraped_at": f"gte.{since}", "order": "scraped_at.desc"}))
    add(get(token, "posts", {"select": "*", "hawza_relevant": "eq.true", "order": "scraped_at.desc", "limit": 300}))
    add(get(token, "posts", {"select": "*", "platform": "eq.bale", "order": "scraped_at.desc", "limit": 200}))
    rare = [c["id"] for c in t["channels"] if any(c.get(k) for k in ("show_in_people", "show_in_orgs", "show_in_thinktanks", "show_in_positions", "show_in_cyberspace", "show_in_hawza"))]
    for i in range(0, len(rare), 40):
        ids = ",".join(map(str, rare[i:i + 40]))
        add(get(token, "posts", {"select": "*", "channel_id": f"in.({ids})", "order": "scraped_at.desc", "limit": 1000}))
    ref = {x["post_id"] for x in t["newsletter_posts"]} | {x["post_id"] for x in t["dossier_topic_posts"]} | {x["post_id"] for x in t["news_pick_edits"]}
    for ins in t["news_ai_insights"]:
        ref |= {int(s["id"]) for s in (ins.get("selected_posts") or []) if str(s.get("id", "")).isdigit()}
    missing = [i for i in ref if i not in posts]
    for i in range(0, len(missing), 100):
        add(get(token, "posts", {"select": "*", "id": "in.(" + ",".join(map(str, missing[i:i + 100])) + ")"}))
    t["posts"] = sorted(posts.values(), key=lambda p: p.get("scraped_at") or "", reverse=True)
    pid = set(posts)
    t["newsletter_posts"] = [x for x in t["newsletter_posts"] if x["post_id"] in pid]
    t["dossier_topic_posts"] = [x for x in t["dossier_topic_posts"] if x["post_id"] in pid]
    print(f"posts: {len(t['posts'])}")

    # ── فایل‌ها ──
    for c in t["channels"]:
        c["avatar_url"] = local_public(c.get("avatar_url"), "avatars")
    for n in t["newspapers"]:
        n["image_url"] = local_public(n.get("image_url"), "newspapers")
        n["media_storage_path"] = None
    t["newspapers"] = [n for n in t["newspapers"] if n["image_url"]]
    photos = 0
    for p in t["posts"]:
        mp = p.get("media_path")
        if mp and p.get("media_type") == "photo":
            p["media_path"] = local_public(mp, "posts")
            photos += bool(p["media_path"])
        elif mp:
            p["media_path"] = None   # فیلم‌ها (حجیم) نه؛ کارت «پیش‌نمایش موجود نیست» نشان می‌دهد
    print(f"post photos: {photos}")
    for tbl, bucket in (("magazines", "magazines"), ("archive_reports", "archive-reports")):
        rows = []
        for m in t[tbl]:
            m["cover_url"] = local_public(m.get("cover_url"), tbl)
            got = fetch_private(token, bucket, list(m.get("files") or []))
            m["files"] = [f for f in (m.get("files") or []) if f in got]
            if m["files"]:
                rows.append(m)
        t[tbl] = rows
    paths = []
    for r in t["school_reports"]:
        if not r.get("media_storage_path") and "/school-reports/" in (r.get("image_url") or ""):
            r["media_storage_path"] = r["image_url"].split("/school-reports/")[1].split("?")[0]
        paths.append(r.get("media_storage_path"))
    got = fetch_private(token, "school-reports", paths)
    t["school_reports"] = [r for r in t["school_reports"] if r.get("media_storage_path") in got]
    for r in t["school_reports"]:
        r["image_url"] = ""

    hidden = []
    for s in get(token, "site_settings", {"select": "key,value"}):
        if s["key"] == "hidden_sections" and isinstance(s["value"], list):
            hidden = s["value"]
    out = {
        "meta": {
            "capturedAt": now.isoformat(),
            "source": "snapshot",
            "hidden_sections": hidden,
            "counts": {
                "posts": jc_count(token, "posts"),
                "newspapers": jc_count(token, "newspapers"),
                "hawza_mentions": jc_count(token, "hawza_mentions", {"post_id": "is.null", "hidden_at": "is.null"}),
            },
            "sources": rpc(token, "monitored_source_counts") or {},
        },
        "tables": t,
    }
    with open(os.path.join(OUT, "data.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print(f"files: {total_bytes / 1048576:.1f} MB")


def jc_count(token, table, params=None):
    r = session.get(f"{jc.SUPABASE_URL}/rest/v1/{table}", params={"select": "id", "limit": 1, **(params or {})},
                    headers={**jc.auth_headers(token), "Prefer": "count=exact", "Range": "0-0"}, timeout=TIMEOUT)
    try:
        return int(r.headers.get("content-range", "*/0").split("/")[1])
    except ValueError:
        return 0


def rpc(token, name):
    r = session.post(f"{jc.SUPABASE_URL}/rest/v1/rpc/{name}", headers=jc.auth_headers(token), json={}, timeout=TIMEOUT)
    return r.json() if r.ok else None


if __name__ == "__main__":
    t0 = time.time()
    main()
    print(f"done in {time.time() - t0:.0f}s")
