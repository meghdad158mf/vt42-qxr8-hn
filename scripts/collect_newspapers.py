"""
جمع‌آوری خودکار صفحه‌ی اول روزنامه‌های امروز از کیوسک دیجیتال جار
(jaaar.com/kiosk) و ذخیره در Supabase.
با GitHub Actions طبق زمان‌بندی اجرا می‌شود (نه روی سیستم شخصی).

نیاز به این متغیرهای محیطی دارد (به‌صورت GitHub Secrets تنظیم می‌شوند):
  SUPABASE_URL        مثل https://xxxxx.supabase.co
  SUPABASE_ANON_KEY    کلید anon پروژه (Project Settings → API)
  ADMIN_PASSWORD       همان رمز عبور «مدیر» که در schema.sql تنظیم شد

منطق پارس HTML: صفحه‌ی https://www.jaaar.com/kiosk سمت سرور رندر می‌شه —
یعنی همون HTML اولیه (بدون اجرای جاوااسکریپت) لیست کامل روزنامه‌های امروز
رو داره، هر کدوم توی یک div.element-item.issue با data-slug روی خودش و
data-full-image روی <img> داخلش. کارت‌های دسته‌ی «مجله» (category-6) رو
عمداً رد می‌کنیم — این تب فقط برای روزنامه‌هاست.

برخلاف جلد مجلات (که مستقیم لینک داده می‌شه)، عکس این‌جا واقعاً دانلود
و توی bucket خودمون (newspaper-covers) آپلود می‌شه، نه hotlink مستقیم
به سرور جار — چون نمی‌شه از این محیط تست کرد که آیا اونا Referer/hotlink
رو می‌بندن یا نه؛ دانلود کامل این ریسک رو کاملاً حذف می‌کنه (همون الگوی
دانلود عکس/فیلم پست‌های تلگرام و ایتا در collect_telegram.py/collect_eitaa.py).
"""

import sys

import requests
from bs4 import BeautifulSoup
from jarian_common import (
    SUPABASE_URL, SUPABASE_ANON_KEY, auth_headers, login, require_env, upload_object,
)

require_env()

REQUEST_TIMEOUT = 20
KIOSK_URL = "https://www.jaaar.com/kiosk"
MAGAZINE_CATEGORY_CLASS = "category-6"
MEDIA_BUCKET = "newspaper-covers"
MAX_MEDIA_BYTES = 15 * 1024 * 1024  # ۱۵ مگابایت — برای اینکه فضای Storage/زمان اجرا با فایل‌های خیلی بزرگ پر نشه


def fetch_kiosk_html() -> bytes:
    # عمداً bytes خام برمی‌گردونیم، نه r.text: هدر Content-Type این سایت
    # charset رو مشخص نمی‌کنه، پس requests رمزگذاری رو غلط حدس می‌زنه و
    # عنوان‌های فارسی رو خراب می‌کنه (mojibake). با دادن bytes خام به
    # BeautifulSoup، خودش meta charset=utf-8 توی <head> رو تشخیص می‌ده.
    r = requests.get(KIOSK_URL, timeout=REQUEST_TIMEOUT, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    return r.content


def extract_newspapers(html: bytes) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    papers = []
    seen = set()
    for card in soup.select("div.element-item.issue"):
        classes = card.get("class", [])
        if MAGAZINE_CATEGORY_CLASS in classes:
            continue  # فقط روزنامه، نه مجله

        slug = card.get("data-slug")
        img = card.select_one("img[data-full-image]")
        actions = card.select_one(".actions[data-date]")
        title_el = card.select_one(".header .rtl")
        if not (slug and img and actions and title_el):
            continue

        edition_date = actions.get("data-date")  # از قبل به فرمت YYYY-MM-DD
        if not edition_date:
            continue

        key = (slug, edition_date)
        if key in seen:
            continue
        seen.add(key)

        papers.append(
            {
                "slug": slug,
                "title": title_el.get_text(strip=True),
                "edition_date": edition_date,
                "source_image_url": img.get("data-full-image"),
                "reader_url": f"https://www.jaaar.com/kiosk/archives/{slug}",
            }
        )
    return papers


def download_and_store_cover(token: str, paper: dict) -> dict | None:
    try:
        resp = requests.get(paper["source_image_url"], timeout=REQUEST_TIMEOUT, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        content = resp.content
        if len(content) > MAX_MEDIA_BYTES:
            print(f"    [!] cover too big ({len(content)} bytes), skipping: {paper['slug']}", file=sys.stderr)
            return None
        content_type = resp.headers.get("Content-Type", "image/jpeg")
        storage_path = f"{paper['slug']}/{paper['edition_date']}.jpg"
        public_url = upload_object(token, MEDIA_BUCKET, storage_path, content, content_type, REQUEST_TIMEOUT, "image/jpeg")
        return {"image_url": public_url, "media_storage_path": storage_path}
    except Exception as e:
        print(f"    [!] cover download failed for {paper['slug']}: {e}", file=sys.stderr)
        return None


def upsert_newspapers(token: str, rows: list[dict]) -> None:
    if not rows:
        return
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/newspapers",
        headers={**auth_headers(token), "Prefer": "resolution=merge-duplicates,return=minimal"},
        params={"on_conflict": "slug,edition_date"},
        json=rows,
        timeout=REQUEST_TIMEOUT,
    )
    if not r.ok:
        print(f"    [!] upsert failed: {r.status_code} {r.text[:300]}", file=sys.stderr)
        sys.exit(1)  # اجرا «ناموفق» ثبت بشه تا کارت «وضعیت سامانه» قرمز بشه


def main() -> None:
    token = login(REQUEST_TIMEOUT)
    html = fetch_kiosk_html()
    papers = extract_newspapers(html)
    print(f"[*] {len(papers)} newspaper front page(s) found")

    rows = []
    for paper in papers:
        stored = download_and_store_cover(token, paper)
        if not stored:
            continue
        rows.append(
            {
                "slug": paper["slug"],
                "title": paper["title"],
                "edition_date": paper["edition_date"],
                "reader_url": paper["reader_url"],
                "image_url": stored["image_url"],
                "media_storage_path": stored["media_storage_path"],
            }
        )

    upsert_newspapers(token, rows)
    print(f"[done] total stored: {len(rows)}")


if __name__ == "__main__":
    main()
