-- =====================================================================
-- جریان — مهاجرت ۰۳۳: گروه‌بندی «چهره‌ها و فعالان سیاسی» / «تحلیل سازمان‌ها»
-- این فایل را کامل در Supabase SQL Editor پیست و اجرا کنید.
-- ایمن برای اجرای چندباره (idempotent). بعد از migration_032 اجرا شود.
--
-- زمینه: دو تب بخش «یادداشت‌ها» گالری لوگوی کانال‌ها رو نشون می‌دن؛
-- طبق درخواست کاربر، مدیر برای هر تب گروه‌های جدای خودش (مثل حزب ۱ /
-- حزب ۲) تعریف می‌کنه — مستقل از categories سراسری سایت. هر کانال
-- می‌تونه عضو چند گروه باشه (جدول واسط channel_profile_groups).
-- grantها صریح نوشته شدن (سیاست جدید سوپابیس، نکته‌ی عملیاتی ۲۸).
-- =====================================================================

create table if not exists profile_groups (
  id         serial primary key,
  name       text not null,
  kind       text not null check (kind in ('figures','orgs')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists channel_profile_groups (
  id         serial primary key,
  channel_id int not null references channels(id) on delete cascade,
  group_id   int not null references profile_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (channel_id, group_id)
);

alter table profile_groups enable row level security;
alter table channel_profile_groups enable row level security;

drop policy if exists sel_profile_groups on profile_groups;
create policy sel_profile_groups on profile_groups for select to app_admin, app_viewer using (true);
drop policy if exists rw_profile_groups on profile_groups;
create policy rw_profile_groups  on profile_groups for all    to app_admin              using (true) with check (true);

drop policy if exists sel_channel_profile_groups on channel_profile_groups;
create policy sel_channel_profile_groups on channel_profile_groups for select to app_admin, app_viewer using (true);
drop policy if exists rw_channel_profile_groups on channel_profile_groups;
create policy rw_channel_profile_groups  on channel_profile_groups for all    to app_admin              using (true) with check (true);

grant select on profile_groups, channel_profile_groups to app_viewer;
grant select, insert, update, delete on profile_groups, channel_profile_groups to app_admin;
grant usage, select on sequence profile_groups_id_seq, channel_profile_groups_id_seq to app_admin;
