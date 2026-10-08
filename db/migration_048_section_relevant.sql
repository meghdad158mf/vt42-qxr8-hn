-- =====================================================================
-- جریان — مهاجرت ۰۴۸: فیلتر هوش مصنوعی عرصه‌های تازه (مهر ۱۴۰۵، نسخه‌ی ۵.۲۹.۰)
-- این فایل را کامل در Supabase SQL Editor پیست و اجرا کنید.
-- ایمن برای اجرای چندباره (idempotent). بعد از migration_047 اجرا شود.
--
-- خواست کاربر: از منابع «مواضع مراجع و علماء» و «قوانین و مصوبات» فقط مطالب مرتبط
-- (موضع سیاسی‌اجتماعی / مصوبه و موضع رسمی) نمایش داده شود، و تا وقتی هوش مصنوعی مطلبی را
-- بررسی نکرده، نمایش داده نشود. (اندیشکده‌ها به خواست کاربر بدون فیلتر.)
--   posts.section_relevant: NULL = هنوز بررسی نشده، true = مرتبط (نمایش)، false = نامرتبط
-- این ستون را Edge Function «extract-post-keywords» پر می‌کند (هر ۲ ساعت، همان جاب کلیدواژه).
-- دسترسی جدول posts سطح جدول است، پس grant تازه لازم نیست.
-- =====================================================================

alter table public.posts add column if not exists section_relevant boolean;

-- صف بررسی: فقط پست‌های بررسی‌نشده (کوچک و سریع)
create index if not exists posts_section_pending_idx
  on public.posts (channel_id, scraped_at desc)
  where section_relevant is null;

notify pgrst, 'reload schema';

-- بررسی (باید یک ردیف برگرداند):
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'posts' and column_name = 'section_relevant';
