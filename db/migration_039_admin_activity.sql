-- =====================================================================
-- جریان — مهاجرت ۰۳۹: «گزارش فعالیت» مدیر (منوی مدیریت ← گزارش فعالیت)
-- این فایل را کامل در Supabase SQL Editor پیست و اجرا کنید
-- (پروژه‌ی komqnapfqrtxxaytpcdt). ایمن برای اجرای چندباره (idempotent).
-- ⚠️ باید **قبل از** انتشار نسخه‌ی ۵.۱۷.۰ سایت اجرا شود.
--
-- سه قسمت:
--   ۱) پنهان‌کردن پست: ستون posts.hidden_at — پست پنهان‌شده برای بیننده‌ها
--      از خودِ دیتابیس (RLS) برگردانده نمی‌شود؛ مدیر از «گزارش فعالیت ←
--      پست‌های پنهان‌شده» می‌تواند برش گرداند. hidden_post_ids() فقط شناسه‌ها
--      را می‌دهد تا «اخبار منتخب» هوش مصنوعی (که عنوانش جدا ذخیره شده) هم
--      پست پنهان را نشان ندهد.
--   ۲) آمار بازدید: جدول page_views (شمارنده‌ی روزانه‌ی هر بخش/تب به تفکیک
--      نقش) + تابع log_page_view() که فرانت‌اند با هر جابه‌جایی صدا می‌زند.
--      هیچ اطلاعات شخصی (IP، دستگاه) ثبت نمی‌شود — فقط عدد.
--   ۳) دفتر تغییرات: جدول admin_audit که با trigger روی جدول‌های تنظیمات
--      پر می‌شود (از فرانت‌اند قابل دور زدن نیست). کارهای خودکار (اسکریپت‌های
--      پایتون گیت‌هاب و Edge Functionها) و تغییرات خودِ SQL Editor ثبت
--      نمی‌شوند. مقدار رمزها هرگز ذخیره نمی‌شود. ردیف‌های قدیمی‌تر از
--      یک سال خودکار پاک می‌شوند.
-- grantها صریح نوشته شدن (سیاست جدید سوپابیس).
-- =====================================================================

-- ---------- ۱) پنهان‌کردن پست ----------
alter table posts add column if not exists hidden_at timestamptz;
create index if not exists posts_hidden_at_idx on posts (hidden_at desc) where hidden_at is not null;

-- مدیر همه را می‌بیند؛ بیننده فقط پست‌های پنهان‌نشده
drop policy if exists sel_posts on posts;
create policy sel_posts on posts for select to app_admin using (true);
drop policy if exists sel_posts_viewer on posts;
create policy sel_posts_viewer on posts for select to app_viewer using (hidden_at is null);

create or replace function public.hidden_post_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select id::bigint from posts where hidden_at is not null;
$$;
revoke all on function public.hidden_post_ids() from public;
grant execute on function public.hidden_post_ids() to app_admin, app_viewer;

-- ---------- ۲) آمار بازدید ----------
create table if not exists page_views (
  day     date not null,
  section text not null,
  tab     text not null default '',
  role    text not null,
  views   int  not null default 0,
  primary key (day, section, tab, role)
);

alter table page_views enable row level security;
drop policy if exists page_views_admin_select on page_views;
create policy page_views_admin_select on page_views for select to app_admin using (true);
grant select on page_views to app_admin;

create or replace function public.log_page_view(p_section text, p_tab text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', '');
  t text := coalesce(p_tab, '');
begin
  if r not in ('app_admin', 'app_viewer') then return; end if;
  if coalesce(p_section, '') !~ '^[a-z_]{1,32}$' or t !~ '^[a-z0-9_-]{0,32}$' then return; end if;
  insert into page_views (day, section, tab, role, views)
  values ((now() at time zone 'Asia/Tehran')::date, p_section, t, r, 1)
  on conflict (day, section, tab, role) do update set views = page_views.views + 1;
end;
$$;
revoke all on function public.log_page_view(text, text) from public;
grant execute on function public.log_page_view(text, text) to app_admin, app_viewer;

-- ---------- ۳) دفتر تغییرات مدیر ----------
create table if not exists admin_audit (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  tbl        text not null,          -- نام جدول (فرانت‌اند به فارسی ترجمه می‌کند)
  op         text not null,          -- insert | update | delete | hide | unhide | password | publish
  row_id     text,
  label      text,                   -- نام/عنوان مورد، برای خواندن آسان
  changes    jsonb,                  -- فقط برای ویرایش: {ستون: [قبل، بعد]}
  user_agent text,
  ip         text
);
create index if not exists admin_audit_created_at_idx on admin_audit (created_at desc);

alter table admin_audit enable row level security;
drop policy if exists admin_audit_admin_select on admin_audit;
create policy admin_audit_admin_select on admin_audit for select to app_admin using (true);
grant select on admin_audit to app_admin;

-- مقدارهای بلند (متن، فهرست فایل‌ها) کوتاه ذخیره می‌شن
create or replace function public.audit_short(v jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when v is null then null
    when jsonb_typeof(v) = 'string' and length(v #>> '{}') > 160 then to_jsonb(left(v #>> '{}', 160) || '…')
    when jsonb_typeof(v) in ('object', 'array') and length(v::text) > 160 then to_jsonb(left(v::text, 160) || '…')
    else v
  end;
$$;

-- فقط کار دستی مدیر ثبت می‌شه: نقش app_admin از طریق سایت (نه SQL Editor)،
-- نه اسکریپت‌های پایتون گیت‌هاب و نه Edge Functionها
create or replace function public.audit_write(p_tbl text, p_op text, p_row_id text, p_label text, p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hdrs json;
  ua   text;
  ip   text;
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', '') <> 'app_admin' then return; end if;
  hdrs := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  ua := left(hdrs->>'user-agent', 300);
  if coalesce(ua, '') ~* '^(python|deno|supabase)' then return; end if;
  ip := left(coalesce(hdrs->>'cf-connecting-ip', hdrs->>'x-real-ip', split_part(hdrs->>'x-forwarded-for', ',', 1)), 64);
  if random() < 0.02 then
    delete from admin_audit where created_at < now() - interval '365 days';
  end if;
  insert into admin_audit (tbl, op, row_id, label, changes, user_agent, ip)
  values (p_tbl, p_op, p_row_id, left(p_label, 160), p_changes, ua, ip);
end;
$$;
revoke all on function public.audit_write(text, text, text, text, jsonb) from public;

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o   jsonb;
  n   jsonb;
  rec jsonb;
  ch  jsonb := '{}'::jsonb;
  k   text;
  lbl text;
  op  text := lower(TG_OP);
begin
  if TG_OP <> 'INSERT' then o := to_jsonb(OLD); end if;
  if TG_OP <> 'DELETE' then n := to_jsonb(NEW); end if;
  rec := coalesce(n, o);

  -- ردیف‌هایی که با حذف یه مورد دیگه خودکار پاک می‌شن (on delete cascade) جدا ثبت
  -- نمی‌شن — trigger بعد از پایان دستور اجرا می‌شه، پس اگه والد دیگه نیست یعنی آبشاری بوده
  if TG_OP = 'DELETE' then
    if TG_TABLE_NAME = 'channel_profile_groups' and (
         not exists (select 1 from channels where id = (rec->>'channel_id')::int)
      or not exists (select 1 from profile_groups where id = (rec->>'group_id')::int)) then return null; end if;
    if TG_TABLE_NAME = 'dossier_topic_posts' and (
         not exists (select 1 from dossier_topics where id = (rec->>'topic_id')::int)
      or not exists (select 1 from posts where id = (rec->>'post_id')::bigint)) then return null; end if;
  end if;

  if TG_OP = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k in ('sort_order', 'updated_at') then continue; end if;
      if (o->k) is distinct from (n->k) then
        ch := ch || jsonb_build_object(k, jsonb_build_array(audit_short(o->k), audit_short(n->k)));
      end if;
    end loop;
    if ch = '{}'::jsonb then return null; end if;   -- فقط جابه‌جایی ترتیب یا ذخیره‌ی بدون تغییر
  end if;

  if TG_TABLE_NAME = 'dossier_topic_posts' then
    if TG_OP = 'INSERT' and rec->>'source' = 'auto' then return null; end if;  -- تطبیق خودکار
    lbl := concat_ws(' ← ',
      (select name from dossier_topics where id = (rec->>'topic_id')::int),
      (select left(coalesce(nullif(title, ''), text), 80) from posts where id = (rec->>'post_id')::bigint));
  elsif TG_TABLE_NAME = 'channel_profile_groups' then
    lbl := concat_ws(' ← ',
      (select coalesce(title, username) from channels where id = (rec->>'channel_id')::int),
      (select name from profile_groups where id = (rec->>'group_id')::int));
  else
    lbl := coalesce(rec->>'title', rec->>'name', rec->>'full_name', rec->>'message', rec->>'phone', rec->>'username');
  end if;

  perform audit_write(TG_TABLE_NAME, op, rec->>'id', lbl, case when TG_OP = 'UPDATE' then ch end);
  return null;
end;
$$;

-- پنهان/بازگرداندن پست (فقط تغییر ستون hidden_at؛ بقیه‌ی به‌روزرسانی‌های
-- پست‌ها مثل کلیدواژه یا پاک‌سازی رسانه کاری به این trigger ندارن)
create or replace function public.audit_post_hidden()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (OLD.hidden_at is null) = (NEW.hidden_at is null) then return null; end if;
  perform audit_write('posts', case when NEW.hidden_at is not null then 'hide' else 'unhide' end, NEW.id::text,
    concat_ws(': ', (select coalesce(title, username) from channels where id = NEW.channel_id),
                    left(coalesce(nullif(NEW.title, ''), NEW.text), 100)),
    null);
  return null;
end;
$$;

-- تغییر رمز (از change_password) — مقدار هش هرگز ذخیره نمی‌شه
create or replace function public.audit_password()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.value is not distinct from NEW.value then return null; end if;
  perform audit_write('app_config', 'password', NEW.key,
    case NEW.key when 'admin_password_hash' then 'رمز مدیر'
                 when 'viewer_password_hash' then 'رمز بیننده'
                 else NEW.key end,
    null);
  return null;
end;
$$;

-- انتشار خبرنامه (حذف کامل + درج یک‌جا) — یک ردیف برای کل انتشار
create or replace function public.audit_newsletter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cnt int;
begin
  select count(*) into cnt from nt;
  if cnt = 0 then return null; end if;
  perform audit_write('newsletter_posts', 'publish', null, cnt || ' مطلب', null);
  return null;
end;
$$;

-- نصب triggerها (جدول‌هایی که هنوز ساخته نشدن رد می‌شن)
do $$
declare
  t text;
begin
  foreach t in array array[
    'channels', 'categories', 'regions', 'profile_groups', 'channel_profile_groups',
    'news_topics', 'dossier_topics', 'dossier_topic_posts',
    'magazines', 'archive_reports', 'school_reports',
    'announcements', 'app_users', 'feedback', 'notify_subscribers'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists audit_row on public.%I', t);
      execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
    end if;
  end loop;
end $$;

drop trigger if exists audit_post_hidden on posts;
create trigger audit_post_hidden after update of hidden_at on posts
  for each row execute function public.audit_post_hidden();

drop trigger if exists audit_password on app_config;
create trigger audit_password after update on app_config
  for each row execute function public.audit_password();

drop trigger if exists audit_newsletter on newsletter_posts;
create trigger audit_newsletter after insert on newsletter_posts
  referencing new table as nt
  for each statement execute function public.audit_newsletter();
