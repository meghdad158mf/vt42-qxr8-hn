-- =====================================================================
-- جریان — مهاجرت ۰۴۵: هشدار ایمیلی خرابی‌ها + گزارش روزانه (۵.۲۷.۰)
-- این فایل را کامل در Supabase SQL Editor پیست و اجرا کنید.
-- ایمن برای اجرای چندباره (idempotent). بعد از migration_044 اجرا شود.
--
-- Edge Function «notify» (supabase/functions/notify) هر ۳۰ دقیقه موارد قرمز رو بررسی
-- و ایمیل می‌کنه، و هر روز ۰۷:۲۲ تهران گزارش روزانه می‌فرسته. ارسال با Resend
-- (کلید RESEND_API_KEY در سوپابیس ← Edge Functions ← Secrets).
--   alert_settings: یک ردیف (id=1) — گیرنده، روشن/خاموش هشدار و گزارش، زمان آخرین
--                   بررسی/ارسال و آخرین خطا. فقط مدیر (نشانی ایمیل برای بیننده دیده نشه).
--   alert_state:    مواردی که ایمیل شدن (برای یادآوری هر ۱۲ ساعت و خبر «برطرف شد»).
-- صدا زدن از pg_cron با همون الگوی jarian_cron.dispatch (migration_040): توکن مدیرِ
-- ۵ دقیقه‌ای داخل دیتابیس.
-- =====================================================================

create table if not exists public.alert_settings (
  id            int primary key default 1 check (id = 1),
  name          text not null default 'هشدار ایمیلی',
  email         text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  alerts_on     boolean not null default true,
  daily_on      boolean not null default true,
  last_check_at timestamptz,
  last_alert_at timestamptz,
  last_daily_at timestamptz,
  last_error    text
);
insert into public.alert_settings (id) values (1) on conflict (id) do nothing;
alter table public.alert_settings enable row level security;
drop policy if exists alert_settings_admin on public.alert_settings;
create policy alert_settings_admin on public.alert_settings for all to app_admin using (true) with check (true);
grant select, insert, update on public.alert_settings to app_admin;

create table if not exists public.alert_state (
  key          text primary key,
  text         text not null,
  last_sent_at timestamptz not null default now()
);
alter table public.alert_state enable row level security;
drop policy if exists alert_state_admin on public.alert_state;
create policy alert_state_admin on public.alert_state for all to app_admin using (true) with check (true);
grant select, insert, update, delete on public.alert_state to app_admin;

-- دفتر تغییرات (migration_039): فقط تغییرهای مدیر از سایت ثبت می‌شن (به‌روزرسانی‌های خودِ
-- تابع notify با user-agent «Deno» رد می‌شن)
do $$
begin
  if to_regprocedure('public.audit_row()') is null then return; end if;
  drop trigger if exists audit_row on public.alert_settings;
  create trigger audit_row after insert or update or delete on public.alert_settings
    for each row execute function public.audit_row();
end $$;

create or replace function jarian_cron.notify(mode text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  secret text;
  tok    text;
begin
  select value into secret from public.app_config where key = 'jwt_secret';
  tok := sign(
    json_build_object('role', 'app_admin', 'exp', extract(epoch from (now() + interval '5 minutes'))::integer),
    secret
  );
  return net.http_post(
    url := 'https://komqnapfqrtxxaytpcdt.supabase.co/functions/v1/notify',
    body := jsonb_build_object('mode', mode),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || tok,
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvbXFuYXBmcXJ0eHhheXRwY2R0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1OTQwMDUsImV4cCI6MjEwNDE3MDAwNX0.eh9DpJ_uO5b21IH4e3rGYIPCJOEO5ZWMiomh7kUxArU'
    ),
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function jarian_cron.notify(text) from public;
do $$
begin
  execute 'revoke all on function jarian_cron.notify(text) from anon, authenticated, app_admin, app_viewer';
exception when undefined_object then null;
end $$;

-- بررسی هر ۳۰ دقیقه (دقیقه‌های ۷ و ۳۷، بین کارهای دیگر)؛ گزارش روزانه ۰۳:۵۲ UTC = ۰۷:۲۲ تهران
select cron.unschedule(jobid) from cron.job where jobname in ('jarian-notify-check', 'jarian-notify-daily');
select cron.schedule('jarian-notify-check', '7,37 * * * *', $$select jarian_cron.notify('check')$$);
select cron.schedule('jarian-notify-daily', '52 3 * * *', $$select jarian_cron.notify('daily')$$);

-- بررسی (اختیاری): select id, status_code, left(content, 300) from net._http_response order by id desc limit 5;
