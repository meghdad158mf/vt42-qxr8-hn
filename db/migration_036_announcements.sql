-- =====================================================================
-- جریان — مهاجرت ۰۳۶: «اطلاعیه برای کاربران»
-- این فایل را کامل در Supabase SQL Editor پیست و اجرا کنید.
-- ایمن برای اجرای چندباره (idempotent). بعد از migration_035 اجرا شود.
--
-- زمینه: مدیر از منوی «مدیریت ← اطلاعیه‌ها» یه پیام کوتاه می‌نویسه که بالای
-- همه‌ی صفحه‌های سایت برای همه (مدیر و بیننده) نمایش داده می‌شه — با سطح
-- «عادی»/«مهم» و تاریخ انقضای اختیاری. بیننده فقط اطلاعیه‌های فعالِ منقضی‌نشده
-- رو می‌بینه (RLS)؛ مدیر همه رو (برای فهرست و مدیریت).
-- grantها صریح نوشته شدن (سیاست جدید سوپابیس).
-- =====================================================================

create table if not exists announcements (
  id         bigserial primary key,
  message    text not null check (char_length(message) between 1 and 300),
  level      text not null default 'info' check (level in ('info','important')),
  active     boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists announcements_created_at_idx on announcements (created_at desc);

alter table announcements enable row level security;

drop policy if exists sel_announcements_viewer on announcements;
create policy sel_announcements_viewer on announcements for select to app_viewer
  using (active and (expires_at is null or expires_at > now()));
drop policy if exists rw_announcements_admin on announcements;
create policy rw_announcements_admin on announcements for all to app_admin using (true) with check (true);

grant select on announcements to app_viewer;
grant select, insert, update, delete on announcements to app_admin;
grant usage, select on sequence announcements_id_seq to app_admin;
