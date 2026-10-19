-- =====================================================================
-- جریان — مهاجرت ۰۴۹: شمارش «منبع رصد» صفحه‌ی نخست (مهر ۱۴۰۵، نسخه‌ی ۵.۳۰.۰)
-- این فایل را کامل در Supabase SQL Editor پیست و اجرا کنید.
-- ایمن برای اجرای چندباره (idempotent).
--
-- خواست کاربر: کارت «منبع رصد» = منابعی که الان رصد می‌شوند، هر منبع یک‌بار:
--   (۱) منابع فعال «مدیریت منابع» (هر بستر، هر بخش)
--   (۲) روزنامه‌هایی که در ۳۰ روز اخیر جمع‌آوری شده‌اند (عنوان یکتا)
--   (۳) سایت‌های فعال خزنده‌ی «درباره حوزه» که در «مدیریت منابع» نیستند — جدول crawl_sites فقط
--       برای مدیر خواندنی است، پس بیننده فقط از طریق همین تابع (فقط عدد) به آن می‌رسد.
--       ردیف‌های source='channel' همیشه کپی یک منبع «مدیریت منابع»اند و شمرده نمی‌شوند؛ ردیف دستی
--       هم اگر دامنه‌اش با یکی از سایت‌های «مدیریت منابع» یکی باشد، تکراری حساب می‌شود.
-- خروجی: {"channels": n, "newspapers": n, "crawl": n}
-- =====================================================================

create or replace function public.monitored_source_counts()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', '');
  v_channels int; v_papers int; v_crawl int := 0;
begin
  if r not in ('app_admin', 'app_viewer') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*) into v_channels from channels where active is not false;

  select count(distinct slug) into v_papers from newspapers
   where edition_date >= ((now() at time zone 'Asia/Tehran')::date - 30);

  if to_regclass('public.crawl_sites') is not null then
    -- دامنه بدون www./feed./rss./moxie. (همون منطق rssSiteRoot فرانت، ساده‌شده)
    select count(*) into v_crawl from crawl_sites cs
     where cs.active and cs.source <> 'channel'
       and lower(regexp_replace(substring(cs.url from '^https?://([^/:]+)'), '^(www|feeds?|rss|moxie)\.', ''))
           not in (
             select lower(regexp_replace(substring(c.username from '^https?://([^/:]+)'), '^(www|feeds?|rss|moxie)\.', ''))
               from channels c
              where c.platform = 'website' and c.active is not false and c.username ~ '^https?://'
           );
  end if;

  return json_build_object('channels', v_channels, 'newspapers', v_papers, 'crawl', v_crawl);
end;
$$;

-- درس migration_046: سوپابیس اجرای تابع تازه را مستقیم به anon/authenticated هم می‌دهد
revoke all on function public.monitored_source_counts() from public, anon, authenticated;
grant execute on function public.monitored_source_counts() to app_admin, app_viewer;

notify pgrst, 'reload schema';

-- بررسی (اختیاری، بعد از اجرا) — اولی باید false باشد:
--   select has_function_privilege('anon', 'public.monitored_source_counts()', 'execute');
