-- =====================================================================
-- جریان — مهاجرت ۰۴۷: عرصه‌های تازه‌ی مدار دوم (مهر ۱۴۰۵، نسخه‌ی ۵.۲۸.۰)
-- این فایل را کامل در Supabase SQL Editor پیست و اجرا کنید.
-- ایمن برای اجرای چندباره (idempotent). بعد از migration_046 اجرا شود.
--
-- فقط چند ستون تازه به جدول منابع (channels) اضافه می‌شود تا در «تنظیمات بخش‌ها ←
-- مدیریت منابع» بشود هر منبع را در بخش‌های تازه گذاشت:
--   show_in_positions + positions_tab  → عرصه‌ی «مواضع مراجع و علماء» و تب آن
--       (leader = رهبر انقلاب، maraji = مراجع و علماء، hawza = حوزه‌های علمیه،
--        imams = ائمه جمعه، orgs = تشکل‌ها و نخبگان حوزوی)
--   show_in_thinktanks                  → تب «اندیشکده‌ها و پژوهشگاه‌ها» در «یادداشت‌ها»
--   show_in_laws + laws_source          → عرصه‌ی «قوانین و مصوبات» و برچسب فیلتر آن
--       (مثلاً «حوزه علمیه خراسان»، «دولت»، «مجلس»)
-- دسترسی جدول channels سطح جدول است، پس grant تازه لازم نیست؛ دفتر تغییرات (admin_audit)
-- هم ستون‌های تازه را خودکار ثبت می‌کند.
-- =====================================================================

alter table public.channels add column if not exists show_in_positions boolean not null default false;
alter table public.channels add column if not exists positions_tab text;
alter table public.channels add column if not exists show_in_thinktanks boolean not null default false;
alter table public.channels add column if not exists show_in_laws boolean not null default false;
alter table public.channels add column if not exists laws_source text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'channels_positions_tab_check') then
    alter table public.channels add constraint channels_positions_tab_check
      check (positions_tab is null or positions_tab in ('leader','maraji','hawza','imams','orgs'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'channels_laws_source_check') then
    alter table public.channels add constraint channels_laws_source_check
      check (laws_source is null or char_length(laws_source) <= 60);
  end if;
end $$;

-- PostgREST ستون‌های تازه را فوراً بشناسد
notify pgrst, 'reload schema';

-- بررسی (باید ۵ ردیف برگرداند):
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'channels'
--    and column_name in ('show_in_positions','positions_tab','show_in_thinktanks','show_in_laws','laws_source');
