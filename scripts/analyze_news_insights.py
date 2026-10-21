"""
روزی چهار بار (هر ۶ ساعت) Edge Function «news-insights» رو صدا می‌زنه تا
تحلیل هوش مصنوعی «اخبار منتخب» + «موضوعات پرتکرار» تب «آنالیز» به‌روز بشه.

چرا این تحلیل توی یه اسکریپت جدا و روی کرون انجام می‌شه، نه با هر بار
بازکردن تب توسط کاربر: هر درخواست هزینه‌ی حساب هوش مصنوعی (لیارا) داره؛
با این روش دقیقاً ۴ بار در روز (نه هر بار که یه مدیر/بیننده تب رو باز
می‌کنه) اجرا می‌شه. نتیجه توی جدول news_ai_insights (migration_022) کش
می‌شه و فرانت‌اند فقط آخرین ردیف رو می‌خونه.

پنجره‌ی زمانی تحلیل (WINDOW_HOURS) با فاصله‌ی اجرای این اسکریپت هماهنگه
(۶ ساعت) — یعنی هر اجرا دقیقاً بازه‌ای رو پوشش می‌ده که از اجرای قبلی
تا الان طول کشیده.

نیاز به این متغیرهای محیطی دارد (GitHub Secrets، از قبل برای کالکتورهای
دیگه هم استفاده می‌شن):
  SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_PASSWORD
"""

import sys

import requests
from jarian_common import SUPABASE_URL, SUPABASE_ANON_KEY, login, require_env

require_env()

REQUEST_TIMEOUT = 120  # پاسخ هوش مصنوعی روی دسته‌ای از پست‌ها ممکنه چند ثانیه طول بکشه
WINDOW_HOURS = 6


def main() -> None:
    token = login(30)
    r = requests.post(
        f"{SUPABASE_URL}/functions/v1/news-insights",
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={"windowHours": WINDOW_HOURS},
        timeout=REQUEST_TIMEOUT,
    )
    if not r.ok:
        print(f"[!] news-insights failed: {r.status_code} {r.text[:500]}", file=sys.stderr)
        sys.exit(1)
    data = r.json()
    print(f"[done] {len(data.get('selected_posts', []))} selected post(s), {len(data.get('topics', []))} topic(s)")


if __name__ == "__main__":
    main()
