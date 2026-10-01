"""
جمع‌آوری دوره‌ای اخبار از فیدهای RSS خبرگزاری‌ها و ذخیره در Supabase.
با GitHub Actions طبق زمان‌بندی اجرا می‌شود (نه روی سیستم شخصی).

منابع از جدول channels با platform='website' خونده می‌شن — ستون
username برای این پلتفرم آدرس فید RSS رو نگه می‌داره (نه یوزرنیم).

نیاز به این متغیرهای محیطی دارد (به‌صورت GitHub Secrets تنظیم می‌شوند):
  SUPABASE_URL        مثل https://xxxxx.supabase.co
  SUPABASE_ANON_KEY    کلید anon پروژه (Project Settings → API)
  ADMIN_PASSWORD       همان رمز عبور «مدیر» که در schema.sql تنظیم شد
"""

import calendar
import os
import re
import sys
import time
from datetime import datetime, timezone
from html import unescape

import feedparser
import requests

BLOCK_END_RE = re.compile(r"</(p|div|li|h[1-6])\s*>|<br\s*/?>", re.I)
TAG_RE = re.compile(r"<[^>]*>")


def strip_tags(html: str) -> str:
    # فیدهای RSS معمولاً توضیح رو با تگ‌های <p>/<br> پاراگراف‌بندی می‌کنن — قبل
    # از حذف کامل تگ‌ها، این مرزها رو به خط جدید تبدیل می‌کنیم تا پاراگراف‌بندی
    # اصلی حفظ بشه (همون فیکسی که برای متن ایتا انجام شد).
    text = BLOCK_END_RE.sub("\n", html)
    text = TAG_RE.sub(" ", text)
    text = unescape(text)
    text = re.sub(r"[^\S\n]+", " ", text)  # فاصله/تب تکراری جمع بشه، نه خط جدید
    text = "\n".join(line.strip() for line in text.split("\n"))
    text = re.sub(r"\n{3,}", "\n\n", text)  # حداکثر یک خط خالی بین پاراگراف‌ها
    return text.strip()

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]

REQUEST_TIMEOUT = 20
POLITE_DELAY_SECONDS = 2


def login() -> str:
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/login",
        headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
        json={"password": ADMIN_PASSWORD},
        timeout=REQUEST_TIMEOUT,
    )
    r.raise_for_status()
    return r.json()["token"]


def auth_headers(token: str) -> dict:
    return {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def fetch_rss_channels(token: str) -> list[dict]:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/channels",
        headers=auth_headers(token),
        params={"platform": "eq.website", "active": "eq.true", "select": "id,username"},
        timeout=REQUEST_TIMEOUT,
    )
    r.raise_for_status()
    return r.json()


def entry_id(entry) -> str:
    return entry.get("id") or entry.get("guid") or entry.get("link") or entry.get("title", "")


def entry_body(entry) -> str:
    content = entry.get("content")
    raw = content[0].get("value", "") if content else (entry.get("summary", "") or entry.get("description", ""))
    return strip_tags(raw)


def entry_thumbnail(entry) -> str | None:
    media = entry.get("media_thumbnail") or entry.get("media_content")
    if media:
        return media[0].get("url")
    for enc in entry.get("enclosures", []):
        if str(enc.get("type", "")).startswith("image/"):
            return enc.get("href") or enc.get("url")
    return None


def entry_posted_at(entry) -> str | None:
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if not parsed:
        return None
    dt = datetime.fromtimestamp(calendar.timegm(parsed), tz=timezone.utc)
    return dt.isoformat()


def extract_posts(feed, channel_id: int) -> list[dict]:
    posts = []
    seen_ids = set()
    for entry in feed.entries:
        pid = entry_id(entry)
        if not pid:
            continue
        if pid in seen_ids:
            # بعضی فیدها یه آیتم رو دوبار لیست می‌کنن (مثلاً نسخه‌ی به‌روزشده کنار
            # نسخه‌ی قدیمی) — بدون این فیلتر، وقتی دو ردیف با همین
            # (channel_id, platform_post_id) توی یک upsert باشن، Postgres روی
            # ON CONFLICT خطا می‌ده (نمی‌تونه یه ردیف رو دوبار توی یک دستور بزنه).
            continue
        seen_ids.add(pid)
        thumb = entry_thumbnail(entry)
        posts.append(
            {
                "channel_id": channel_id,
                "platform": "website",
                "platform_post_id": pid,
                "title": entry.get("title", "").strip(),
                "text": entry_body(entry).strip(),
                "link": entry.get("link"),
                "posted_at": entry_posted_at(entry),
                "media_type": "photo" if thumb else None,
                "media_path": thumb,
            }
        )
    return posts


def upsert_posts(token: str, posts: list[dict]) -> bool:
    if not posts:
        return True
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/posts",
        headers={**auth_headers(token), "Prefer": "resolution=merge-duplicates,return=minimal"},
        params={"on_conflict": "channel_id,platform_post_id"},
        json=posts,
        timeout=REQUEST_TIMEOUT,
    )
    if not r.ok:
        print(f"    [!] upsert failed: {r.status_code} {r.text[:300]}", file=sys.stderr)
        return False
    return True


def exit_if_all_failed(failed: int, total: int) -> None:
    # اگه همه‌ی منابع خطا دادن، اجرا «ناموفق» ثبت بشه تا کارت «وضعیت سامانه» قرمز
    # بشه (قبلاً هر خطایی فقط چاپ می‌شد و اجرا همیشه سبز می‌موند)
    if total and failed == total:
        print(f"[!] all {total} source(s) failed", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    token = login()
    channels = fetch_rss_channels(token)
    print(f"[*] {len(channels)} active RSS source(s) to scan")

    total_saved = 0
    failed = 0
    for i, ch in enumerate(channels):
        feed_url = ch["username"]
        channel_id = ch["id"]
        try:
            resp = requests.get(feed_url, timeout=REQUEST_TIMEOUT, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
            feed = feedparser.parse(resp.content)
            posts = extract_posts(feed, channel_id)
            if not upsert_posts(token, posts):
                failed += 1
            total_saved += len(posts)
            print(f"[+] {feed_url}: {len(posts)} item(s)")
        except Exception as e:
            failed += 1
            print(f"[!] {feed_url}: {e}", file=sys.stderr)

        if i < len(channels) - 1:
            time.sleep(POLITE_DELAY_SECONDS)

    print(f"[done] total items processed: {total_saved}")
    exit_if_all_failed(failed, len(channels))


if __name__ == "__main__":
    main()
