-- migration_040: زمان‌بندی کارهای خودکار با زمان‌بند خودِ سوپابیس (pg_cron) به‌جای schedule گیت‌هاب
--
-- ⚠️ موقت — تا مهاجرت به VPS. بعد از مهاجرت، همین زمان‌بندی‌ها با crontab خودِ سرور
-- (اجرای مستقیم scripts/*.py) جایگزین می‌شن و این‌ها باید حذف بشن:
--   select cron.unschedule(jobid) from cron.job where jobname like 'jarian-%';
--
-- چرا: schedule گیت‌هاب «در حد امکان»ه — در عمل از ۱۲ اجرای روزانه‌ی ایتا فقط ۳–۴ تا
-- (با ۱ تا ۲ ساعت تأخیر) انجام می‌شد (بررسی سوابق اجرا، ۱۰ مهر ۱۴۰۵). اما اجرای دستی
-- (workflow_dispatch) تقریباً فوری شروع می‌شه. پس اینجا pg_cron سر وقت دقیق همون دستور
-- «اجرای دستی» صفحه‌ی وضعیت رو می‌فرسته: pg_net → Edge Function «run-job» → گیت‌هاب.
--
-- رمز/توکن جدیدی لازم نیست: توکن مدیرِ ۵ دقیقه‌ای همین‌جا با همون jwt_secret تابع
-- login() ساخته می‌شه (فقط داخل دیتابیس؛ تابع برای هیچ نقش سایت قابل اجرا نیست).
-- زمان‌ها UTC و دقیقاً همون cronهای قبلی ورک‌فلوها.
--
-- باید دستی در Supabase SQL Editor (پروژه‌ی komqnapfqrtxxaytpcdt) اجرا بشه. اجرای دوباره بی‌خطره.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create schema if not exists jarian_cron;
revoke all on schema jarian_cron from public;

create or replace function jarian_cron.dispatch(job text)
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
    url := 'https://komqnapfqrtxxaytpcdt.supabase.co/functions/v1/run-job',
    body := jsonb_build_object('job', job),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || tok,
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvbXFuYXBmcXJ0eHhheXRwY2R0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1OTQwMDUsImV4cCI6MjEwNDE3MDAwNX0.eh9DpJ_uO5b21IH4e3rGYIPCJOEO5ZWMiomh7kUxArU'
    ),
    timeout_milliseconds := 20000
  );
end;
$$;

revoke all on function jarian_cron.dispatch(text) from public;
do $$
begin
  execute 'revoke all on function jarian_cron.dispatch(text) from anon, authenticated, app_admin, app_viewer';
exception when undefined_object then null;
end $$;

-- زمان‌بندی‌ها (اجرای دوباره: قبلی‌ها پاک و از نو ساخته می‌شن)
select cron.unschedule(jobid) from cron.job where jobname like 'jarian-%';

select cron.schedule('jarian-eitaa',      '0 */2 * * *',                    $$select jarian_cron.dispatch('eitaa')$$);
select cron.schedule('jarian-telegram',   '15 */2 * * *',                   $$select jarian_cron.dispatch('telegram')$$);
select cron.schedule('jarian-website',    '5 */2 * * *',                    $$select jarian_cron.dispatch('website')$$);
select cron.schedule('jarian-bale',       '30 1,5,7,9,11,13,15,17 * * *',   $$select jarian_cron.dispatch('bale')$$);
select cron.schedule('jarian-newspapers', '30 0,2,4,6,10 * * *',            $$select jarian_cron.dispatch('newspapers')$$);
select cron.schedule('jarian-insights',   '30 4,10,16,22 * * *',            $$select jarian_cron.dispatch('insights')$$);
select cron.schedule('jarian-keywords',   '30 1-23/2 * * *',                $$select jarian_cron.dispatch('keywords')$$);
select cron.schedule('jarian-cleanup-am', '15 6 * * *',                     $$select jarian_cron.dispatch('cleanup')$$);
select cron.schedule('jarian-cleanup-pm', '15 18 * * *',                    $$select jarian_cron.dispatch('cleanup')$$);

-- تاریخچه‌ی اجرای pg_cron بی‌نهایت جمع نشه: هر شب رکوردهای بیش از ۷ روز پاک می‌شن
select cron.schedule('jarian-cron-history', '40 23 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);

-- بررسی (اختیاری، بعد از اجرا):
--   select jobname, schedule, active from cron.job where jobname like 'jarian-%' order by jobname;
--   select jarian_cron.dispatch('website');   -- آزمایش فوری: یه اجرای «وب‌سایت‌ها» در گیت‌هاب
--   select id, status_code, left(content, 200) from net._http_response order by id desc limit 5;  -- باید 200 و {"ok":true}
