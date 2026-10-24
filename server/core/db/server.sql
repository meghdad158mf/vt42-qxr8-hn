-- =====================================================================
-- جریان روی سرور خودمان — بعد از همه‌ی migrationها، هر بار نصب (تکرارپذیر)
-- =====================================================================

-- schemaهای داخلی برای هیچ نقش سایتی نیستند (migration_040 همین را برای jarian_cron خواسته بود)
do $$
begin
  if to_regnamespace('jarian_cron') is not null then
    execute 'revoke all on schema jarian_cron from public, anon, authenticated, app_admin, app_viewer';
    execute 'revoke all on all functions in schema jarian_cron from public, anon, authenticated, app_admin, app_viewer';
  end if;
end $$;
revoke all on schema net, cron, jaryan_meta from anon, authenticated, app_admin, app_viewer;

-- پاسخ‌های قدیمی جانشین pg_net (خود pg_net بعد از ۶ ساعت پاک می‌کرد؛ اینجا ۷ روز برای «۱۰ ارسال آخر»)
delete from net._http_response where created < now() - interval '7 days';

-- ---------- نقش سرویس‌های سرور (کاربر سیستمی jaryan با peer) ----------
-- سرویس فایل‌ها هر درخواست را با «set local role <نقش توکن>» اجرا می‌کند (RLS خود migrationها)
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'jaryan') then
    create role jaryan login noinherit;
  end if;
end $$;
grant anon, app_admin, app_viewer to jaryan;
grant usage on schema jaryan_meta to jaryan;
do $$
begin
  if to_regprocedure('public.capacity_snapshot_job()') is not null then
    execute 'grant execute on function public.capacity_snapshot_job() to jaryan';
  end if;
end $$;

-- تنظیم هشدار پیامکی (کلید وب‌سرویس همان ورود پیامکی)؛ فقط سرویس jaryan-jobs
create or replace function jaryan_meta.alert_config()
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'on',      coalesce((select value from app_config where key = 'alert_sms_on'), '') = 'true',
    'to',      (select value from app_config where key = 'alert_sms_to'),
    'from',    (select value from app_config where key = 'alert_sms_from'),
    'body_id', (select value from app_config where key = 'alert_sms_body_id'),
    'key',     (select value from app_config where key = 'sms_api_key'));
$$;
revoke all on function jaryan_meta.alert_config() from public;
grant execute on function jaryan_meta.alert_config() to jaryan;

-- بازنویسی نشانی فایل‌ها در همه‌ی ستون‌های متنی/jsonb (انتقال از Supabase و تغییر نشانی سرور)
create or replace function jaryan_meta.rewrite_urls(p_from text, p_to text)
returns bigint language plpgsql security definer set search_path = public as $$
declare r record; n bigint := 0; c bigint;
begin
  if coalesce(p_from, '') = '' or p_from = p_to then return 0; end if;
  for r in
    select c.table_name, c.column_name, c.data_type
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
       and c.data_type in ('text', 'jsonb', 'json', 'ARRAY', 'character varying')
  loop
    if r.data_type = 'ARRAY' then continue; end if;
    execute format('update public.%I set %I = replace(%I::text, %L, %L)::%s where %I::text like %L',
                   r.table_name, r.column_name, r.column_name, p_from, p_to,
                   case r.data_type when 'character varying' then 'varchar' else r.data_type end,
                   r.column_name, '%' || replace(replace(p_from, '%', '\%'), '_', '\_') || '%');
    get diagnostics c = row_count;
    n := n + c;
  end loop;
  return n;
end;
$$;
revoke all on function jaryan_meta.rewrite_urls(text, text) from public;
