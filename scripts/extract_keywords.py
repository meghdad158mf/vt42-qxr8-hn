"""
هر ۲ ساعت (مستقل از news-insights) Edge Function «extract-post-keywords» رو
صدا می‌زنه تا برای پست‌های تازه (که هنوز posts.ai_keywords ندارن) کلیدواژه‌ی
هوش مصنوعی استخراج و ذخیره بشه — پایه‌ی تطبیق خودکار موضوعات «پرونده‌های
موضوعی» + تشخیص سیاسی/اجتماعی‌بودن پست‌های تب «اخبار حوزه».

چرا مستقل از news-insights: اون هر ۶ ساعت اجرا می‌شه ولی کالکتورهای اصلی
(collect-eitaa/collect-telegram/collect-rss) هر ۲ ساعت پست تازه میارن؛ اگه
استخراج کلیدواژه به کرون ۶ساعته گره بخوره، پست‌های تازه تا ۶ ساعت بدون
کلیدواژه می‌مونن و هر اجرا هم باید دسته‌ی بزرگ‌تری رو پردازش کنه. این
اسکریپت زمان‌بندی جدای خودش رو داره (.github/workflows/extract-keywords.yml)
که عمداً دقیقاً وسط فاصله‌ی دو اجرای متوالی کالکتورها قرار گرفته تا تداخل
نداشته باشن.

resumable به‌طور طبیعی: Edge Function جدیدترین پست‌های ai_keywords IS
NULL رو می‌گیره (posted_at DESC، + سهمیه‌ی جدا و تضمین‌شده برای کانال‌های
«اخبار حوزه» تا starve نشن) — اگه یه اجرا fail بشه، اجرای بعدی خودکار
از همونجا ادامه می‌ده، هیچ پستی جا نمی‌مونه.

نیاز به این متغیرهای محیطی دارد (GitHub Secrets، از قبل برای بقیه هم
استفاده می‌شن):
  SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_PASSWORD
"""

import os
import sys

import requests

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]

REQUEST_TIMEOUT = 120  # پاسخ هوش مصنوعی روی دسته‌ای از پست‌ها ممکنه چند ثانیه طول بکشه
# ⚠️ از ۳۰ به ۸۰ افزایش یافت (۱ مهر ۱۴۰۵) — با چک واقعی دیتابیس مشخص شد
# صف پردازش‌نشده‌ی کل سایت به ۵۳۹۲ رسیده بود و ۹۸٪ش (نه یه backlog قدیمی
# متروکه) مال هفته/ماه اخیر بود؛ یعنی هر روز بیشتر از ظرفیت پردازش (۳۰
# پست هر اجرا) پست تازه اضافه می‌شد و صف مدام رشد می‌کرد. چون هر پست فقط
# ۴۰۰ کاراکتر اول متنش (TEXT_TRUNCATE توی خودِ Edge Function) به هوش
# مصنوعی داده می‌شه، ۸۰ پست هم حجم پرامپت کوچیکی می‌مونه — با ۳۰ پست هر
# اجرا ~۲۲ ثانیه طول می‌کشید، پس ۸۰ تا هم باید به‌راحتی زیر REQUEST_TIMEOUT
# بمونه.
BATCH_LIMIT = 80
# ⚠️ مهر ۱۴۰۵: لیارا کُند شد و Edge Function حالا بودجه‌ی زمانی ~۷۵ ثانیه‌ای
# داره (هر فراخوانی فقط ~۳۰ پست رو تموم می‌کنه، بقیه برای بعد می‌مونن) —
# برای همین هر اجرا چند دور پشت‌سرهم تابع رو صدا می‌زنه (به درخواست کاربر: ۲ دور).
ROUNDS = 2


def login() -> str:
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/login",
        headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
        json={"password": ADMIN_PASSWORD},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["token"]


def run_round(token: str) -> dict | None:
    r = requests.post(
        f"{SUPABASE_URL}/functions/v1/extract-post-keywords",
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={"limit": BATCH_LIMIT},
        timeout=REQUEST_TIMEOUT,
    )
    if not r.ok:
        print(f"[!] extract-post-keywords failed: {r.status_code} {r.text[:500]}", file=sys.stderr)
        return None
    return r.json()


def main() -> None:
    token = login()
    ok_rounds = 0
    total = 0
    for i in range(1, ROUNDS + 1):
        try:
            data = run_round(token)
        except requests.RequestException as e:
            print(f"[!] round {i}: {e}", file=sys.stderr)
            data = None
        if data is None:
            continue
        ok_rounds += 1
        total += data.get("processed", 0)
        print(f"[round {i}] {data.get('processed', 0)} post(s) keyworded, {data.get('matched', 0)} dossier match(es)")
        # صف خالیه — دور بعدی لازم نیست
        if not data.get("processed") and not data.get("left_for_next_run"):
            break
    # فقط اگه هیچ دوری موفق نشد ناموفق حساب می‌شه (کارت «وضعیت سامانه» قرمز)
    if ok_rounds == 0:
        sys.exit(1)
    print(f"[done] {total} post(s) keyworded in {ok_rounds} round(s)")


if __name__ == "__main__":
    main()
