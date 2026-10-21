"""
اسکریپت یک‌بارمصرف: پاک‌سازی فایل‌های orphan (بدون رد فعال توی دیتابیس)
از باکت‌های post-media و newspaper-covers.

چرا لازم شد: باگی توی cleanup_media.py (endpoint اشتباه حذف Storage،
رفع‌شده توی همین PR) باعث می‌شد حذف واقعی فایل همیشه fail بشه ولی
رکورد دیتابیس (media_storage_path و بقیه) هرروز پاک بشه — یعنی فایل
واقعی توی Storage می‌موند ولی دیگه هیچ ردی توی دیتابیس نداشت که
اجرای بعدی cleanup_media.py بتونه پیداش کنه. این اسکریپت برعکس عمل
می‌کنه: از روی خودِ Storage لیست می‌گیره، هرچی که الان یه رد فعال
(media_storage_path غیرخالی) توی دیتابیس نداره رو orphan در نظر
می‌گیره و حذف می‌کنه.

پیش‌فرض DRY_RUN=true (فقط شمارش، بدون حذف واقعی) — برای حذف واقعی باید
صریح DRY_RUN=false ست بشه (ورودی دستی وقت اجرای دستی از تب Actions).

نیاز به این متغیرهای محیطی دارد (GitHub Secrets):
  SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_PASSWORD
"""

import os
import sys

import requests
from jarian_common import SUPABASE_URL, SUPABASE_ANON_KEY, auth_headers, login, require_env

require_env()
DRY_RUN = os.environ.get("DRY_RUN", "true").strip().lower() != "false"

REQUEST_TIMEOUT = 30
LIST_PAGE = 1000
DELETE_BATCH = 200

BUCKETS = [
    ("post-media", "posts"),
    ("newspaper-covers", "newspapers"),
]


def fetch_referenced_paths(token: str, table: str) -> set[str]:
    paths: set[str] = set()
    offset = 0
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=auth_headers(token),
            params={
                "select": "media_storage_path",
                "media_storage_path": "not.is.null",
                "limit": str(LIST_PAGE),
                "offset": str(offset),
            },
            timeout=REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        rows = r.json()
        for row in rows:
            path = row.get("media_storage_path")
            if path:
                paths.add(path)
        if len(rows) < LIST_PAGE:
            break
        offset += LIST_PAGE
    return paths


def list_all_objects(token: str, bucket: str) -> list[str]:
    """لیست کامل مسیر همه‌ی فایل‌های واقعی توی یه باکت (بازگشتی روی زیرپوشه‌ها)."""
    objects: list[str] = []

    def walk(prefix: str) -> None:
        offset = 0
        while True:
            r = requests.post(
                f"{SUPABASE_URL}/storage/v1/object/list/{bucket}",
                headers=auth_headers(token),
                json={
                    "prefix": prefix,
                    "limit": LIST_PAGE,
                    "offset": offset,
                    "sortBy": {"column": "name", "order": "asc"},
                },
                timeout=REQUEST_TIMEOUT,
            )
            r.raise_for_status()
            items = r.json()
            if not items:
                break
            for item in items:
                full_path = f"{prefix}{item['name']}" if prefix else item["name"]
                if item.get("id") is None:
                    walk(full_path + "/")
                else:
                    objects.append(full_path)
            if len(items) < LIST_PAGE:
                break
            offset += LIST_PAGE

    walk("")
    return objects


def remove_storage_objects(token: str, bucket: str, paths: list[str]) -> set[str]:
    """حذف واقعی. ⚠️ فقط status code کافی نیست — این endpoint حتی وقتی
    هیچ‌کدوم از paths واقعاً match نمی‌کنن، HTTP 200 با آرایه‌ی خالی
    برمی‌گردونه (همون باگی که توی scripts/cleanup_media.py پیدا و رفع
    شد؛ این تابع یه کپی جدای دیگه از همون منطقه بود که جا مونده بود).
    خروجی: مجموعه‌ی نام‌هایی که واقعاً توی بدنه‌ی پاسخ به‌عنوان
    حذف‌شده اعلام شدن (نه فقط اینکه status موفق بوده).
    """
    if not paths:
        return set()
    r = requests.delete(
        f"{SUPABASE_URL}/storage/v1/object/{bucket}",
        headers=auth_headers(token),
        json={"prefixes": paths},
        timeout=REQUEST_TIMEOUT,
    )
    if not r.ok:
        print(f"[!] remove failed ({bucket}): {r.status_code} {r.text[:300]}", file=sys.stderr)
        return set()
    try:
        deleted = r.json()
    except ValueError:
        print(f"[!] remove ({bucket}): پاسخ غیرقابل‌پارس {r.text[:300]}", file=sys.stderr)
        return set()
    return {item.get("name") for item in deleted} if isinstance(deleted, list) else set()


def purge_bucket(token: str, bucket: str, table: str) -> None:
    referenced = fetch_referenced_paths(token, table)
    all_objects = list_all_objects(token, bucket)
    orphans = [p for p in all_objects if p not in referenced]
    print(f"[*] {bucket}: {len(all_objects)} فایل کل، {len(referenced)} رد فعال توی {table}، {len(orphans)} orphan")

    if DRY_RUN:
        print(f"[dry-run] {bucket}: چیزی حذف نشد. برای حذف واقعی، ورودی dry_run رو false بذار.")
        return

    removed = 0
    not_removed: list[str] = []
    for i in range(0, len(orphans), DELETE_BATCH):
        chunk = orphans[i : i + DELETE_BATCH]
        deleted_names = remove_storage_objects(token, bucket, chunk)
        removed += len(deleted_names)
        not_removed.extend(p for p in chunk if p not in deleted_names)
    print(f"[done] {bucket}: {removed}/{len(orphans)} فایل orphan واقعاً حذف شد")
    if not_removed:
        print(
            f"[!] {bucket}: {len(not_removed)} فایل با وجود درخواست حذف، توی پاسخ match نشدن. "
            f"نمونه‌ی مسیر: {not_removed[:5]}",
            file=sys.stderr,
        )


def main() -> None:
    token = login(REQUEST_TIMEOUT)
    print(f"[*] DRY_RUN={DRY_RUN}")
    for bucket, table in BUCKETS:
        purge_bucket(token, bucket, table)


if __name__ == "__main__":
    main()
