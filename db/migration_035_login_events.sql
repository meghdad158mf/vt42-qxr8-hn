-- migration_035: ثبت ورودها برای صفحه‌ی «وضعیت سامانه» (فقط مدیر می‌بینه)
--
-- چون ورود با رمز مشترکه (نه حساب جدا برای هر نفر)، فقط این‌ها قابل ثبته:
-- زمان، نقش (مدیر/بیننده)، موفق/ناموفق، مرورگر/دستگاه (user-agent) و IP.
--
-- ثبت داخل خودِ public.login() انجام می‌شه (security definer) — از فرانت‌اند
-- قابل دور زدن نیست. ⚠️ تلاش ناموفق دیگه exception نمی‌ده (چون exception کل
-- تراکنش — و در نتیجه همین ردیف لاگ — رو rollback می‌کرد)؛ به‌جاش با GUC
-- response.status کد ۴۰۱ برمی‌گردونه، پس فرانت‌اند و اسکریپت‌های پایتون
-- (که فقط r.ok / raise_for_status رو چک می‌کنن) مثل قبل خطا می‌گیرن.
--
-- ورودهای موفقِ کارهای خودکار GitHub Actions (اسکریپت‌های پایتون، روزی
-- ده‌ها بار) ثبت نمی‌شن تا فهرست شلوغ نشه؛ ولی تلاش ناموفق همیشه ثبت می‌شه
-- (حتی با user-agent پایتون) تا کسی نتونه با جعل user-agent مخفی بمونه.
-- ردیف‌های قدیمی‌تر از ۳۰ روز با هر ورود خودکار پاک می‌شن.
-- باید دستی در Supabase SQL Editor (پروژه‌ی komqnapfqrtxxaytpcdt) اجرا بشه.

create table if not exists public.login_events (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  success    boolean not null,
  role       text,
  user_agent text,
  ip         text
);
create index if not exists login_events_created_at_idx on public.login_events (created_at desc);

alter table public.login_events enable row level security;
drop policy if exists login_events_admin_select on public.login_events;
create policy login_events_admin_select on public.login_events for select to app_admin using (true);
grant select on public.login_events to app_admin;

create or replace function public.login(password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  admin_hash  text;
  viewer_hash text;
  role_name   text;
  secret      text;
  hdrs        json;
  ua          text;
  client_ip   text;
begin
  hdrs := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  ua := left(hdrs->>'user-agent', 300);
  client_ip := left(coalesce(hdrs->>'cf-connecting-ip', hdrs->>'x-real-ip',
                             split_part(hdrs->>'x-forwarded-for', ',', 1)), 64);

  delete from login_events where created_at < now() - interval '30 days';

  select value into admin_hash  from app_config where key = 'admin_password_hash';
  select value into viewer_hash from app_config where key = 'viewer_password_hash';

  if admin_hash is not null and crypt(password, admin_hash) = admin_hash then
    role_name := 'app_admin';
  elsif viewer_hash is not null and crypt(password, viewer_hash) = viewer_hash then
    role_name := 'app_viewer';
  else
    insert into login_events (success, role, user_agent, ip) values (false, null, ua, client_ip);
    perform set_config('response.status', '401', true);
    return json_build_object('error', 'invalid password');
  end if;

  if coalesce(ua, '') !~* '^python' then
    insert into login_events (success, role, user_agent, ip) values (true, role_name, ua, client_ip);
  end if;

  select value into secret from app_config where key = 'jwt_secret';

  return json_build_object(
    'token', sign(
      json_build_object(
        'role', role_name,
        'exp',  extract(epoch from (now() + interval '24 hours'))::integer
      ),
      secret
    ),
    'role', role_name
  );
end;
$$;

revoke all on function public.login(text) from public;
grant execute on function public.login(text) to anon;
