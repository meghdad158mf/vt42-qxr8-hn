-- =====================================================================
-- جریان — مهاجرت ۰۵۳: حذف عرصه‌ی «قوانین و مصوبات» (آبان ۱۴۰۵، نسخه‌ی ۵.۳۳.۰)
-- این فایل را کامل در Supabase SQL Editor پیست و اجرا کنید.
-- ایمن برای اجرای چندباره (idempotent). بعد از migration_052 اجرا شود.
--
-- خواست کاربر: عرصه‌های «درباره مردم»، «قوانین و مصوبات» و «از جریان بپرس» از سامانه حذف
-- شوند، همراه با زیرمجموعه‌ی «قوانین». دو عرصه‌ی دیگر داده‌ای در پایگاه داده نداشتند.
--   ۱) منابعی که فقط در «قوانین و مصوبات» بودند (در هیچ بخش دیگری نه) حذف می‌شوند؛
--      پست‌هایشان هم با on delete cascade پاک می‌شود.
--   ۲) منابعی که در بخش دیگری هم هستند می‌مانند و فقط از «قوانین» جدا می‌شوند.
--   ۳) ستون‌های show_in_laws و laws_source از جدول منابع برداشته می‌شوند.
--   ۴) این سه عرصه از فهرست «بخش‌های پنهان» (تنظیمات بخش‌ها ← نمایش سایت) پاک می‌شوند.
--
-- ⚠️ پیش از اجرا، فهرست منابعی را که حذف می‌شوند ببینید (این کوئری چیزی را تغییر نمی‌دهد):
--   select id, platform, title, username from public.channels
--    where show_in_laws and not (show_in_news or show_in_cyberspace or show_in_people or show_in_orgs
--          or show_in_hawza or show_in_positions or show_in_thinktanks);
-- =====================================================================

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'channels' and column_name = 'show_in_laws') then
    delete from public.channels
     where show_in_laws
       and not (show_in_news or show_in_cyberspace or show_in_people or show_in_orgs
                or show_in_hawza or show_in_positions or show_in_thinktanks);
    alter table public.channels drop constraint if exists channels_laws_source_check;
    alter table public.channels drop column if exists laws_source;
    alter table public.channels drop column show_in_laws;
  end if;
end $$;

-- بخش‌های حذف‌شده از فهرست پنهان‌ها (هم خود بخش، هم «بخش/تب»)
update public.site_settings
   set value = coalesce((select jsonb_agg(x) from jsonb_array_elements_text(value) x
                          where split_part(x, '/', 1) not in ('public', 'laws', 'ask')), '[]'::jsonb)
 where key = 'hidden_sections' and jsonb_typeof(value) = 'array';

notify pgrst, 'reload schema';

-- بررسی (اختیاری، بعد از اجرا) — باید ۰ ردیف برگرداند:
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'channels' and column_name in ('show_in_laws', 'laws_source');
