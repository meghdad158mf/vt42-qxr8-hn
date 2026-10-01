"""
جمع‌آوری دوره‌ای پیام‌های کانال‌های تلگرام و ذخیره در Supabase.
با GitHub Actions طبق زمان‌بندی اجرا می‌شود — نه یک listener همیشه‌روشن،
بلکه هر بار فقط پیام‌های جدیدتر از آخرین پیامِ ذخیره‌شده‌ی هر کانال را می‌گیرد.

نیاز به این متغیرهای محیطی دارد (GitHub Secrets):
  SUPABASE_URL        مثل https://xxxxx.supabase.co
  SUPABASE_ANON_KEY    کلید anon پروژه
  ADMIN_PASSWORD       رمز عبور «مدیر»
  TG_API_ID            از my.telegram.org
  TG_API_HASH
  TG_SESSION            رشته‌ی خروجی scripts/telegram_session_to_string.py
"""

import asyncio
import datetime
import os
import sys

import requests
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]
TG_API_ID = int(os.environ["TG_API_ID"])
TG_API_HASH = os.environ["TG_API_HASH"]
TG_SESSION = os.environ["TG_SESSION"]

REQUEST_TIMEOUT = 20
MESSAGES_PER_CHANNEL_LIMIT = 100  # سقف ایمنی برای هر اجرا (بک‌فیل کانال تازه هم همینه)، در حالت عادی خیلی کمتره
MEDIA_BUCKET = "post-media"
MAX_MEDIA_BYTES = 15 * 1024 * 1024  # ۱۵ مگابایت — فایل بزرگ‌تر دانلود نمی‌شه (فضای Storage + زمان اجرا)


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


def fetch_telegram_channels(token: str) -> list[dict]:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/channels",
        headers=auth_headers(token),
        params={"platform": "eq.telegram", "active": "eq.true", "select": "id,username"},
        timeout=REQUEST_TIMEOUT,
    )
    r.raise_for_status()
    return r.json()


def fetch_last_post_id(token: str, channel_id: int) -> int:
    # platform_post_id is TEXT (shared with eitaa's non-numeric ids), so it can't
    # be sorted numerically in SQL — order by posted_at instead, which is a real
    # timestamptz and reflects the same chronological order for telegram messages.
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/posts",
        headers=auth_headers(token),
        params={
            "channel_id": f"eq.{channel_id}",
            "platform": "eq.telegram",
            "select": "platform_post_id",
            "order": "posted_at.desc",
            "limit": "1",
        },
        timeout=REQUEST_TIMEOUT,
    )
    r.raise_for_status()
    rows = r.json()
    return int(rows[0]["platform_post_id"]) if rows else 0


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


def media_type_of(msg) -> str | None:
    if not msg.media:
        return None
    if msg.photo:
        return "photo"
    if msg.video:
        return "video"
    if isinstance(msg.media, (MessageMediaPhoto, MessageMediaDocument)):
        return "document"
    return "other"


def upload_media(token: str, storage_path: str, content: bytes, content_type: str) -> str:
    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/{MEDIA_BUCKET}/{storage_path}",
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {token}",
            "Content-Type": content_type or "application/octet-stream",
            # اگه به هر دلیلی همون پیام قبلاً یه‌بار دانلود شده باشه ولی ذخیره‌ی
            # دیتابیسش ناموفق بوده، بدون این هدر آپلود دوباره‌ی همون مسیر خطای
            # 400 می‌ده.
            "x-upsert": "true",
        },
        data=content,
        timeout=REQUEST_TIMEOUT,
    )
    r.raise_for_status()
    return f"{SUPABASE_URL}/storage/v1/object/public/{MEDIA_BUCKET}/{storage_path}"


async def download_and_store_media(client: TelegramClient, token: str, msg, channel_id: int) -> dict | None:
    # فقط عکس و ویدیو دانلود می‌شه (نه سایر انواع سند) — طبق درخواست کاربر.
    if not (msg.photo or msg.video):
        return None
    try:
        size = getattr(msg.file, "size", None) if msg.file else None
        if size and size > MAX_MEDIA_BYTES:
            print(f"    [!] media too big ({size} bytes), skipping download: msg {msg.id}", file=sys.stderr)
            return None
        content = await client.download_media(msg, file=bytes)
        if not content:
            return None
        if len(content) > MAX_MEDIA_BYTES:
            print(f"    [!] media too big ({len(content)} bytes after download), skipping: msg {msg.id}", file=sys.stderr)
            return None
        content_type = (msg.file.mime_type if msg.file else None) or ("image/jpeg" if msg.photo else "video/mp4")
        ext = ".jpg" if msg.photo else ".mp4"
        storage_path = f"telegram/{channel_id}/{msg.id}{ext}"
        public_url = upload_media(token, storage_path, content, content_type)
        return {"media_path": public_url, "media_storage_path": storage_path}
    except Exception as e:
        print(f"    [!] media download failed for msg {msg.id}: {e}", file=sys.stderr)
        return None


async def collect_channel(client: TelegramClient, token: str, channel: dict) -> tuple[int, int]:
    username = channel["username"]
    channel_id = channel["id"]
    last_id = fetch_last_post_id(token, channel_id)

    posts = []
    media_count = 0
    # ۵.۲۲.۱ (بررسی پشت صحنه): قبلاً همیشه «۱۰۰ پیام آخر» گرفته می‌شد؛ اگه کانالی
    # بین دو اجرا بیشتر از ۱۰۰ پیام می‌ذاشت، پیام‌های وسط برای همیشه جا می‌موندن
    # (اجرای بعد از آخرین پیام ادامه می‌داد). حالا اگه قبلاً پیامی ثبت شده، از همون
    # نقطه به ترتیب قدیمی→جدید ادامه می‌ده (حداکثر ۱۰۰ تا، بقیه اجرای بعد) — چیزی جا
    # نمی‌مونه. کانال تازه (last_id=0) مثل قبل فقط ۱۰۰ پیام آخر رو می‌گیره، نه کل تاریخچه.
    async for msg in client.iter_messages(username, min_id=last_id, limit=MESSAGES_PER_CHANNEL_LIMIT, reverse=last_id > 0):
        post = {
            "channel_id": channel_id,
            "platform": "telegram",
            "platform_post_id": str(msg.id),
            "text": msg.message or "",
            "link": f"https://t.me/{username}/{msg.id}",
            "media_type": media_type_of(msg),
            "views": getattr(msg, "views", 0) or 0,
            "forwards": getattr(msg, "forwards", 0) or 0,
            "posted_at": msg.date.isoformat() if msg.date else None,
            # این سه فیلد باید روی همه‌ی پست‌ها باشن (حتی None) وگرنه PostgREST
            # با خطای "All object keys must match" کل batch رو رد می‌کنه.
            "media_path": None,
            "media_storage_path": None,
            "media_fetched_at": None,
        }
        stored = await download_and_store_media(client, token, msg, channel_id)
        if stored:
            post["media_path"] = stored["media_path"]
            post["media_storage_path"] = stored["media_storage_path"]
            post["media_fetched_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            media_count += 1
        posts.append(post)

    if not upsert_posts(token, posts):
        raise RuntimeError("upsert failed")
    return len(posts), media_count


def exit_if_all_failed(failed: int, total: int) -> None:
    # اگه همه‌ی منابع خطا دادن، اجرا «ناموفق» ثبت بشه تا کارت «وضعیت سامانه» قرمز
    # بشه (قبلاً هر خطایی فقط چاپ می‌شد و اجرا همیشه سبز می‌موند)
    if total and failed == total:
        print(f"[!] all {total} source(s) failed", file=sys.stderr)
        sys.exit(1)


async def main() -> None:
    token = login()
    channels = fetch_telegram_channels(token)
    print(f"[*] {len(channels)} active telegram channel(s) to scan")

    async with TelegramClient(StringSession(TG_SESSION), TG_API_ID, TG_API_HASH) as client:
        total = 0
        total_media = 0
        failed = 0
        for channel in channels:
            try:
                n, m = await collect_channel(client, token, channel)
                total += n
                total_media += m
                print(f"[+] @{channel['username']}: {n} new message(s), {m} media downloaded")
            except Exception as e:
                failed += 1
                print(f"[!] @{channel['username']}: {e}", file=sys.stderr)

    print(f"[done] total new messages: {total}, media downloaded: {total_media}")
    exit_if_all_failed(failed, len(channels))


if __name__ == "__main__":
    asyncio.run(main())
