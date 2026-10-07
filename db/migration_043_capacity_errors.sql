-- =====================================================================
-- جریان — مهاجرت ۰۴۳: سابقه‌ی ظرفیت + خطاهای مرورگر کاربران + مدت نگهداری رسانه
-- این فایل را کامل در Supabase SQL Editor پیست و اجرا کنید.
-- ایمن برای اجرای چندباره (idempotent). بعد از migration_042 اجرا شود.
--
-- ۱) capacity_snapshots: هر شب (pg_cron، ۰۰:۲۰ تهران) حجم هر bucket فضای فایل و
--    حجم دسته‌های پایگاه داده (پست‌ها، «درباره حوزه»، لاگ‌ها، بقیه) یک ردیف می‌گیره
--    — برای کارت «سابقه‌ی ظرفیت» صفحه‌ی وضعیت (این ماه / ماه گذشته / روند / پیش‌بینی).
--    باز کردن صفحه‌ی وضعیت هم با capacity_snapshot() عکس امروز رو به‌روز می‌کنه.
--    ~۲۰ ردیف در روز (کمتر از ۱ مگ در سال).
-- ۲) client_errors: خطاهای جاوااسکریپت/درخواست‌های ناموفق مرورگر کاربران (فقط متن
--    خطا، بخش، نسخه، نوع دستگاه — نه متن پست/رمز). هر خطا در هر نشست یک‌بار (سمت
--    کاربر)، یک ردیف برای هر خطا در هر روز با شمارش نشست‌ها؛ سقف ۵۰۰ ردیف در روز؛
--    بیشتر از ۳۰ روز خودکار پاک. فقط از RPC log_client_error.
-- ۳) site_settings.media_retention_hours: مدت نگهداری عکس/فیلم پست‌ها (۱۲/۲۴/۴۸/۷۲
--    ساعت) که مدیر از «وضعیت سامانه» عوض می‌کنه؛ scripts/cleanup_media.py می‌خونه.
-- grantها صریح نوشته شدن (سیاست جدید سوپابیس).
-- =====================================================================

-- ---------- ۱) سابقه‌ی ظرفیت ----------
create table if not exists public.capacity_snapshots (
  day      date   not null,
  kind     text   not null check (kind in ('storage', 'db')),
  category text   not null,
  bytes    bigint not null,
  files    bigint,
  primary key (day, kind, category)
);
alter table public.capacity_snapshots enable row level security;
drop policy if exists capacity_snapshots_admin_select on public.capacity_snapshots;
create policy capacity_snapshots_admin_select on public.capacity_snapshots for select to app_admin using (true);
grant select on public.capacity_snapshots to app_admin;

create or replace function public.jarian_rel_size(p_names text[])
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(pg_total_relation_size(to_regclass('public.' || n))), 0)::bigint
  from unnest(p_names) n
  where to_regclass('public.' || n) is not null;
$$;
revoke all on function public.jarian_rel_size(text[]) from public;

-- عکس امروز (به تاریخ تهران) — upsert، پس چندبار اجرا در یک روز فقط آخرین رو نگه می‌داره
create or replace function public.capacity_snapshot_job()
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  d       date := (now() at time zone 'Asia/Tehran')::date;
  v_posts bigint := jarian_rel_size(array['posts']);
  v_hawza bigint := jarian_rel_size(array['hawza_mentions', 'crawl_seen', 'crawl_suggestions', 'crawl_sites']);
  v_logs  bigint := jarian_rel_size(array['login_events', 'page_views', 'admin_audit', 'client_errors', 'capacity_snapshots', 'login_unlocks']);
  v_total bigint := pg_database_size(current_database());
begin
  delete from capacity_snapshots where day = d;
  insert into capacity_snapshots (day, kind, category, bytes, files)
  select d, 'storage', o.bucket_id::text, coalesce(sum((o.metadata->>'size')::bigint), 0), count(*)
  from storage.objects o group by o.bucket_id;
  insert into capacity_snapshots (day, kind, category, bytes) values
    (d, 'db', 'posts', v_posts),
    (d, 'db', 'hawza', v_hawza),
    (d, 'db', 'logs',  v_logs),
    (d, 'db', 'other', greatest(v_total - v_posts - v_hawza - v_logs, 0));
  delete from capacity_snapshots where day < d - 400;
end;
$$;
revoke all on function public.capacity_snapshot_job() from public;

-- همون، برای مدیر از صفحه‌ی وضعیت
create or replace function public.capacity_snapshot()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', '') <> 'app_admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform capacity_snapshot_job();
end;
$$;
revoke all on function public.capacity_snapshot() from public;
grant execute on function public.capacity_snapshot() to app_admin;

-- هر شب ۲۰:۵۰ UTC = ۰۰:۲۰ تهران (pg_cron از migration_040)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'jarian-capacity';
    perform cron.schedule('jarian-capacity', '50 20 * * *', 'select public.capacity_snapshot_job()');
  end if;
end $$;
select public.capacity_snapshot_job();

-- ---------- ۲) خطاهای مرورگر کاربران ----------
create table if not exists public.client_errors (
  id        bigserial primary key,
  day       date not null default ((now() at time zone 'Asia/Tehran')::date),
  sig       text not null,
  message   text not null,
  place     text,
  version   text,
  device    text,
  role      text,
  sessions  int  not null default 1,
  first_at  timestamptz not null default now(),
  last_at   timestamptz not null default now(),
  unique (day, sig)
);
create index if not exists client_errors_last_at_idx on public.client_errors (last_at desc);
alter table public.client_errors enable row level security;
drop policy if exists client_errors_admin_select on public.client_errors;
create policy client_errors_admin_select on public.client_errors for select to app_admin using (true);
drop policy if exists client_errors_admin_delete on public.client_errors;
create policy client_errors_admin_delete on public.client_errors for delete to app_admin using (true);
grant select, delete on public.client_errors to app_admin;

create or replace function public.log_client_error(p_msg text, p_place text default null, p_version text default null, p_device text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', '');
  d      date := (now() at time zone 'Asia/Tehran')::date;
  v_msg  text := left(coalesce(p_msg, ''), 300);
begin
  if v_role not in ('app_admin', 'app_viewer') or v_msg = '' then return; end if;
  if random() < 0.05 then delete from client_errors where day < d - 30; end if;
  if (select count(*) from client_errors where day = d) >= 500 then return; end if;
  insert into client_errors (day, sig, message, place, version, device, role)
  values (d, md5(v_msg || '|' || coalesce(p_version, '')), v_msg, left(p_place, 80), left(p_version, 20), left(p_device, 60), v_role)
  on conflict (day, sig) do update
    set sessions = client_errors.sessions + 1, last_at = now(),
        place = excluded.place, device = excluded.device, role = excluded.role;
end;
$$;
revoke all on function public.log_client_error(text, text, text, text) from public;
grant execute on function public.log_client_error(text, text, text, text) to app_admin, app_viewer;

-- ---------- ۳) مدت نگهداری رسانه ----------
do $$
begin
  if to_regclass('public.site_settings') is null then
    raise notice 'site_settings وجود ندارد — اول migration_042 را اجرا کنید';
    return;
  end if;
  insert into public.site_settings (key, name, value)
  values ('media_retention_hours', 'مدت نگهداری عکس و فیلم پست‌ها', '12'::jsonb)
  on conflict (key) do nothing;
end $$;
