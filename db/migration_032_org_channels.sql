-- migration_032: ستون show_in_orgs روی channels — پایه‌ی تب «تحلیل سازمان‌ها»
-- (بخش «یادداشت‌ها»). مثل show_in_people، دستی از پنل «مدیریت کانال‌ها»
-- (دراپ‌داون «بخش‌ها») تنظیم می‌شه. فقط ستون جدید روی جدول موجوده، پس
-- grant/RLS فعلی جدول channels بدون تغییر پوشش می‌ده.
alter table public.channels
  add column if not exists show_in_orgs boolean not null default false;
