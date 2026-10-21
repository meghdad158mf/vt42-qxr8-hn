"""
پاک‌سازی یک‌بارمصرف: حذف رسانه‌ی قدیمی‌ترین N پست یک کانال تلگرامی خاص.

چرا: وقتی یه کانال تازه به سایت اضافه می‌شه، بک‌فیل اولیه (تا ۲۰۰ پیام
قدیمی، MESSAGES_PER_CHANNEL_LIMIT توی collect_telegram.py) می‌تونه یهو
حجم زیادی رسانه دانلود کنه و Storage رو به سقف پلن رایگان نزدیک کنه.
این اسکریپت برای همچین مواردی، بدون تغییر RETENTION_DAYS دائمی
(cleanup_media.py)، فقط رسانه‌ی قدیمی‌ترین N پست یه کانال مشخص رو حذف
می‌کنه — متن پست دست‌نخورده می‌مونه (مثل رفتار cleanup_media.py، فقط
media_path/media_storage_path/media_fetched_at پاک می‌شن).

⚠️ چون کالکتور تلگرام فقط پیام‌های واقعاً تازه رو می‌گیره (نه بک‌فیل
دوباره)، این رسانه دیگه خودکار جایگزین نمی‌شه — واقعاً و برای همیشه
پاک می‌شه.

نیاز به این متغیرهای محیطی دارد (GitHub Secrets، مثل cleanup_media.py):
  SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_PASSWORD

ورودی‌های workflow_dispatch (env):
  CHANNEL_USERNAME (اجباری) — یوزرنیم کانال بدون @، مثلاً farsna
  DELETE_COUNT (پیش‌فرض 100) — چند تا از قدیمی‌ترین پست‌های دارای رسانه حذف بشن
"""

import os
import sys

import requests
from jarian_common import (
    SUPABASE_URL, SUPABASE_ANON_KEY, auth_headers, clear_post_media, login, require_env,
)

require_env()

CHANNEL_USERNAME = os.environ["CHANNEL_USERNAME"].lstrip("@")
DELETE_COUNT = int(os.environ.get("DELETE_COUNT") or 100)

REQUEST_TIMEOUT = 30
MEDIA_BUCKET = "post-media"


def remove_storage_objects(token: str, bucket: str, paths: list[str]) -> bool:
    """همون منطق remove_storage_objects توی cleanup_media.py — بدنه‌ی پاسخ
    DELETE رو هم چک می‌کنه (نه فقط status code)، چون این endpoint حتی وقتی
    صفر فایل واقعاً match/حذف می‌شه هم HTTP 200 برمی‌گردونه."""
    if not paths:
        return True
    r = requests.delete(
        f"{SUPABASE_URL}/storage/v1/object/{bucket}",
        headers=auth_headers(token),
        json={"prefixes": paths},
        timeout=REQUEST_TIMEOUT,
    )
    if not r.ok:
        print(f"[!] storage remove failed: {r.status_code} {r.text[:300]}", file=sys.stderr)
        return False
    try:
        deleted = r.json()
    except ValueError:
        print(f"[!] storage remove: پاسخ غیرقابل‌پارس {r.text[:300]}", file=sys.stderr)
        return False
    deleted_names = {item.get("name") for item in deleted} if isinstance(deleted, list) else set()
    if len(deleted_names) < len(paths):
        missing = [p for p in paths if p not in deleted_names]
        print(
            f"[!] storage remove: {len(deleted_names)}/{len(paths)} فایل واقعاً حذف شد — "
            f"نمونه‌ی مسیر: {missing[:3]}",
            file=sys.stderr,
        )
        return False
    return True


def find_channel_id(token: str) -> int:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/channels",
        headers=auth_headers(token),
        params={
            "username": f"eq.{CHANNEL_USERNAME}",
            "platform": "eq.telegram",
            "select": "id,title",
        },
        timeout=REQUEST_TIMEOUT,
    )
    r.raise_for_status()
    rows = r.json()
    if not rows:
        print(f"[!] channel not found: @{CHANNEL_USERNAME} (platform=telegram)", file=sys.stderr)
        sys.exit(1)
    print(f"[*] channel: @{CHANNEL_USERNAME} ({rows[0].get('title')}), id={rows[0]['id']}")
    return rows[0]["id"]


def fetch_oldest_media_posts(token: str, channel_id: int, limit: int) -> list[dict]:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/posts",
        headers=auth_headers(token),
        params={
            "channel_id": f"eq.{channel_id}",
            "media_storage_path": "not.is.null",
            "select": "id,media_storage_path",
            "order": "posted_at.asc",
            "limit": str(limit),
        },
        timeout=REQUEST_TIMEOUT,
    )
    r.raise_for_status()
    return r.json()


def main() -> None:
    token = login(REQUEST_TIMEOUT)
    channel_id = find_channel_id(token)
    posts = fetch_oldest_media_posts(token, channel_id, DELETE_COUNT)
    print(f"[*] {len(posts)} post(s) with media found (oldest {DELETE_COUNT} requested)")
    if not posts:
        return
    paths = [p["media_storage_path"] for p in posts if p.get("media_storage_path")]
    ids = [p["id"] for p in posts]
    if not remove_storage_objects(token, MEDIA_BUCKET, paths):
        print("[!] aborting — storage delete failed, DB left untouched, retry later", file=sys.stderr)
        sys.exit(1)
    clear_post_media(token, ids, REQUEST_TIMEOUT)
    print(f"[done] cleared media for {len(ids)} post(s) of @{CHANNEL_USERNAME}")


if __name__ == "__main__":
    main()
