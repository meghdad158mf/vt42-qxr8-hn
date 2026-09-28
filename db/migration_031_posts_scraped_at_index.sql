-- ایندکس روی posts.scraped_at برای کوئری اصلی loadPosts() در فرانت‌اند
-- (`/posts?select=*&order=scraped_at.desc&limit=1000`) که همیشه، از اول
-- پروژه، اجرا می‌شه — هم موقع ورود هر کاربر (مدیر یا بیننده)، هم هر بار
-- بازرسانی. جدول posts تا الان هیچ ایندکسی روی scraped_at نداشت (فقط
-- (channel_id, posted_at desc) و platform)، پس این ORDER BY DESC LIMIT
-- بدون ایندکس مجبور بود کل جدول posts رو sort کنه (نه فقط limit رو
-- سریع بخونه) — با بزرگ‌شدن جدول (چندین کالکتور هر ۲ ساعت، روی ده‌ها
-- کانال، از هفته‌ها پیش) این sort کامل کندتر و کندتر شده و علت اصلی
-- کندی صفحه‌ی ورود بوده، مستقل از موازی‌سازی کوئری‌ها (که قبلاً جدا
-- رفع شد، نگاه کن به نکته‌ی عملیاتی ۳۰ در CLAUDE.md).
create index if not exists idx_posts_scraped_at on posts (scraped_at desc);

-- ایندکس جزئی برای loadHawzaPosts() (`hawza_relevant=eq.true&order=posted_at.desc`)
-- — کاردینالیتی این فیلتر خیلی پایینه (اکثر پست‌ها NULL/false هستن، فقط
-- تعداد کمی true)، پس ایندکس جزئی (فقط روی ردیف‌های true) خیلی کوچیک‌تر
-- و سریع‌تر از ایندکس کامل روی کل جدوله.
create index if not exists idx_posts_hawza_relevant_true on posts (posted_at desc) where hawza_relevant = true;
