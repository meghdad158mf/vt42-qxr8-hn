"""
کتابخانه‌ی مشترک کالکتورها و جاب‌های scripts/ (مرحله‌ی ۹ ماژولار کردن، CLAUDE.md).

تکه‌هایی که قبلاً عیناً در چند فایل کپی شده بودن — ورود با رمز مدیر، سربرگ‌های PostgREST، ذخیره‌ی
پست‌ها، بارگذاری فایل در Storage، پاک کردن فیلدهای رسانه‌ی پست و «اگه همه‌ی منابع خطا دادن اجرا ناموفق
بشه» — اینجا یک‌جان؛ هر فایل فقط منطق خودش رو داره. هر اسکریپت با `python scripts/<نام>.py` اجرا
می‌شه، پس پوشه‌ی scripts/ خودش در sys.path‌ه و `import jarian_common` بدون نصب کار می‌کنه.

⚠️ رفتار هر تابع عیناً همون نسخه‌های قبلیه (همون آدرس، سربرگ، پارامتر و پیام خطا)؛ زمان انتظار
(timeout) هر اسکریپت رو خودِ اسکریپت می‌ده چون با هم فرق داره. `remove_storage_objects` عمداً اینجا
نیست: سه نسخه‌اش (cleanup/purge) خروجی‌های متفاوتی برمی‌گردونن.

متغیرهای محیطی (GitHub Secrets): SUPABASE_URL، SUPABASE_ANON_KEY، ADMIN_PASSWORD — هر اسکریپت اول
`require_env()` رو صدا می‌زنه تا نبودنشون مثل قبل همون اول اجرا خطا بده.
"""

import os
import sys

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")


def require_env(*extra: str) -> None:
    """نبودن هر متغیر محیطی لازم = KeyError (مثل os.environ[...] قبلی هر اسکریپت)."""
    for name in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "ADMIN_PASSWORD", *extra):
        if not os.environ.get(name):
            raise KeyError(name)


def login(timeout: float) -> str:
    """ورود با رمز مدیر (RPC login) → توکن ۲۴ ساعته."""
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/login",
        headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
        json={"password": ADMIN_PASSWORD},
        timeout=timeout,
    )
    r.raise_for_status()
    return r.json()["token"]


def auth_headers(token: str) -> dict:
    return {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def upsert_posts(token: str, posts: list[dict], timeout: float) -> bool:
    """درج/به‌روزرسانی پست‌ها (یکتا روی channel_id + platform_post_id)؛ False = رد شد (پیامش چاپ می‌شه)."""
    if not posts:
        return True
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/posts",
        headers={**auth_headers(token), "Prefer": "resolution=merge-duplicates,return=minimal"},
        params={"on_conflict": "channel_id,platform_post_id"},
        json=posts,
        timeout=timeout,
    )
    if not r.ok:
        print(f"    [!] upsert failed: {r.status_code} {r.text[:300]}", file=sys.stderr)
        return False
    return True


def upload_object(token: str, bucket: str, storage_path: str, content: bytes, content_type: str,
                  timeout: float, default_type: str = "application/octet-stream") -> str:
    """بارگذاری یک فایل در Storage و برگردوندن آدرس عمومی‌اش.

    x-upsert: همون مسیر ممکنه قبلاً بارگذاری شده باشه (ایتا هر اجرا کل صفحه‌ی کانال رو دوباره
    می‌بینه، تلگرام اگه ذخیره‌ی دیتابیس بار قبل ناموفق بوده، روزنامه همون شماره رو دوباره) —
    بدون این هدر بارگذاری دوباره‌ی همون مسیر خطای 400 می‌ده.
    """
    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/{bucket}/{storage_path}",
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {token}",
            "Content-Type": content_type or default_type,
            "x-upsert": "true",
        },
        data=content,
        timeout=timeout,
    )
    r.raise_for_status()
    return f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{storage_path}"


def clear_post_media(token: str, post_ids: list[int], timeout: float) -> None:
    """خالی کردن فیلدهای رسانه‌ی پست‌ها بعد از حذف فایلشون از Storage."""
    if not post_ids:
        return
    ids_list = ",".join(str(i) for i in post_ids)
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/posts",
        headers={**auth_headers(token), "Prefer": "return=minimal"},
        params={"id": f"in.({ids_list})"},
        json={"media_path": None, "media_storage_path": None, "media_fetched_at": None},
        timeout=timeout,
    )
    if not r.ok:
        print(f"[!] clear post media fields failed: {r.status_code} {r.text[:300]}", file=sys.stderr)


def exit_if_all_failed(failed: int, total: int) -> None:
    """اگه همه‌ی منابع خطا دادن، اجرا «ناموفق» ثبت بشه تا کارت «وضعیت سامانه» قرمز بشه
    (قبلاً هر خطایی فقط چاپ می‌شد و اجرا همیشه سبز می‌موند)."""
    if total and failed == total:
        print(f"[!] all {total} source(s) failed", file=sys.stderr)
        sys.exit(1)
