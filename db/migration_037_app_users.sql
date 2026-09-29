-- =====================================================================
-- جریان — مهاجرت ۰۳۷: «دفترچه‌ی کاربران» (بخش مدیریت ← کاربران)
-- این فایل را کامل در Supabase SQL Editor پیست و اجرا کنید.
-- ایمن برای اجرای چندباره (idempotent). بعد از migration_036 اجرا شود.
--
-- زمینه: فهرست افراد با سطح دسترسی (پلاس / پرو / عادی / محدود) برای مدیریت و
-- اطلاع‌رسانی گروهی. فعلاً فقط ثبت و نمایش — ورود هنوز با رمز مشترک مدیر/بیننده
-- است و سطح دسترسی هنوز جایی اعمال نمی‌شه (مرحله‌ی بعد: ورود جدا برای هر نفر).
-- فقط مدیر می‌بینه و ویرایش می‌کنه (شماره‌ی موبایل افراد).
-- grantها صریح نوشته شدن (سیاست جدید سوپابیس).
-- =====================================================================

create table if not exists app_users (
  id           bigserial primary key,
  full_name    text not null check (char_length(full_name) between 1 and 120),
  phone        text check (phone is null or phone ~ '^09[0-9]{9}$'),
  eitaa_id     text check (eitaa_id is null or char_length(eitaa_id) <= 64),
  title        text check (title is null or char_length(title) <= 120),
  access_level text not null default 'normal' check (access_level in ('plus','pro','normal','limited')),
  active       boolean not null default true,
  notes        text check (notes is null or char_length(notes) <= 500),
  created_at   timestamptz not null default now()
);

create unique index if not exists app_users_phone_uq on app_users (phone) where phone is not null;

alter table app_users enable row level security;

drop policy if exists rw_app_users_admin on app_users;
create policy rw_app_users_admin on app_users for all to app_admin using (true) with check (true);

grant select, insert, update, delete on app_users to app_admin;
grant usage, select on sequence app_users_id_seq to app_admin;
