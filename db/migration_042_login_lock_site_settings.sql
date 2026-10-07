-- =====================================================================
-- جریان — مهاجرت ۰۴۲: قفل ورود + حالت تعمیر + روشن/خاموش کردن بخش‌ها
-- این فایل را کامل در Supabase SQL Editor پیست و اجرا کنید.
-- ایمن برای اجرای چندباره (idempotent). بعد از migration_041 اجرا شود.
--
-- ۱) قفل موقت ورود (خواست کاربر، مهر ۱۴۰۵): اگه از یک IP ‏۵ بار رمز اشتباه در
--    ۱۵ دقیقه وارد بشه، ورود از اون IP تا ۱۵ دقیقه بعد از پنجمین تلاش بسته‌ست —
--    حتی با رمز درست (وگرنه حدس‌زدن ادامه پیدا می‌کرد). تلاش‌های حین قفل با
--    blocked=true ثبت می‌شن و شمرده نمی‌شن (قفل تمدید نمی‌شه). کد ۴۲۹ + retry_after.
--    مدیر از «وضعیت سامانه ← ورودها» قفل یک IP یا همه رو باز می‌کنه (login_unlock).
--    ⚠️ کارمندان پشت یک اینترنت مشترک IP یکسان دارن — قفل برای همه‌شونه.
-- ۲) site_settings: تنظیمات نمایش سایت که مدیر از «تنظیمات بخش‌ها ← نمایش سایت»
--    عوض می‌کنه — key='maintenance' (حالت تعمیر: {on, message, until}) و
--    key='hidden_sections' (آرایه‌ی «بخش» یا «بخش/تب» پنهان از بیننده‌ها).
--    حالت تعمیر برای anon هم خواندنیه تا پیامش روی صفحه‌ی ورود دیده بشه.
-- grantها صریح نوشته شدن (سیاست جدید سوپابیس).
-- =====================================================================

-- ---------- ۱) قفل ورود ----------
alter table public.login_events add column if not exists blocked boolean not null default false;
create index if not exists login_events_ip_created_idx on public.login_events (ip, created_at desc) where not success;

-- آخرین «باز کردن قفل» مدیر برای هر IP؛ ip='*' یعنی همه
create table if not exists public.login_unlocks (
  ip       text primary key,
  reset_at timestamptz not null default now()
);
alter table public.login_unlocks enable row level security;   -- فقط از توابع security definer

-- تا کی ورود از این IP بسته‌ست (null = باز). ۵ تلاش ناموفق آخر (بعد از آخرین
-- باز کردن قفل) اگه همه در ۱۵ دقیقه بودن → تا ۱۵ دقیقه بعد از آخرینشون.
create or replace function public.login_lock_until(p_ip text)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_reset timestamptz;
  v_t     timestamptz[];
begin
  select max(reset_at) into v_reset from login_unlocks where ip in (coalesce(p_ip, ''), '*');
  select array_agg(created_at order by created_at desc) into v_t from (
    select created_at from login_events
    where not success and not blocked
      and coalesce(ip, '') = coalesce(p_ip, '')
      and created_at > greatest(now() - interval '30 minutes', coalesce(v_reset, '-infinity'::timestamptz))
    order by created_at desc
    limit 5
  ) s;
  if coalesce(array_length(v_t, 1), 0) = 5
     and v_t[1] - v_t[5] <= interval '15 minutes'
     and now() < v_t[1] + interval '15 minutes' then
    return v_t[1] + interval '15 minutes';
  end if;
  return null;
end;
$$;
revoke all on function public.login_lock_until(text) from public;

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
  locked      timestamptz;
begin
  hdrs := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  ua := left(hdrs->>'user-agent', 300);
  client_ip := left(coalesce(hdrs->>'cf-connecting-ip', hdrs->>'x-real-ip',
                             split_part(hdrs->>'x-forwarded-for', ',', 1)), 64);

  delete from login_events where created_at < now() - interval '30 days';
  delete from login_unlocks where reset_at < now() - interval '1 day';

  -- قفل قبل از بررسی رمز (حتی رمز درست هم رد می‌شه)
  locked := login_lock_until(client_ip);
  if locked is not null then
    insert into login_events (success, role, user_agent, ip, blocked) values (false, null, ua, client_ip, true);
    perform set_config('response.status', '429', true);
    return json_build_object('error', 'locked',
      'retry_after', greatest(1, ceil(extract(epoch from (locked - now()))))::int);
  end if;

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

-- IPهای قفل‌شده‌ی فعلی (فقط مدیر)
create or replace function public.login_lock_status()
returns table (ip text, locked_until timestamptz, attempts int)
language sql
stable
security definer
set search_path = public
as $$
  select x.ip, x.until, x.n from (
    select coalesce(e.ip, '') as ip, login_lock_until(e.ip) as until, count(*)::int as n
    from login_events e
    where not e.success and e.created_at > now() - interval '30 minutes'
    group by e.ip
  ) x
  where x.until is not null
  order by x.until desc;
$$;
revoke all on function public.login_lock_status() from public;
grant execute on function public.login_lock_status() to app_admin;

-- باز کردن قفل یک IP (یا همه با null) — فقط مدیر؛ در دفتر تغییرات ثبت می‌شه
create or replace function public.login_unlock(p_ip text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into login_unlocks (ip, reset_at) values (coalesce(p_ip, '*'), now())
  on conflict (ip) do update set reset_at = excluded.reset_at;
  if to_regprocedure('public.audit_write(text,text,text,text,jsonb)') is not null then
    perform audit_write('login_events', 'unlock', coalesce(p_ip, '*'),
      case when p_ip is null then 'همه‌ی IPها' else 'IP ' || p_ip end, null);
  end if;
end;
$$;
revoke all on function public.login_unlock(text) from public;
grant execute on function public.login_unlock(text) to app_admin;

-- ---------- ۲) تنظیمات نمایش سایت ----------
create table if not exists public.site_settings (
  id         serial primary key,
  key        text not null unique,
  name       text,                    -- برای دفتر تغییرات
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.site_settings (key, name, value) values
  ('maintenance', 'حالت تعمیر و نگهداری', '{"on": false, "message": "", "until": ""}'::jsonb),
  ('hidden_sections', 'بخش‌های پنهان از بیننده‌ها', '[]'::jsonb)
on conflict (key) do nothing;

alter table public.site_settings enable row level security;
drop policy if exists site_settings_read on public.site_settings;
create policy site_settings_read on public.site_settings for select to app_viewer, app_admin using (true);
drop policy if exists site_settings_anon_read on public.site_settings;
create policy site_settings_anon_read on public.site_settings for select to anon using (key = 'maintenance');
drop policy if exists site_settings_admin_write on public.site_settings;
create policy site_settings_admin_write on public.site_settings for all to app_admin using (true) with check (true);
grant select on public.site_settings to anon, app_viewer;
grant select, insert, update on public.site_settings to app_admin;
grant usage, select on sequence public.site_settings_id_seq to app_admin;

-- دفتر تغییرات (migration_039)
do $$
begin
  if to_regprocedure('public.audit_row()') is null then return; end if;
  drop trigger if exists audit_row on public.site_settings;
  create trigger audit_row after insert or update or delete on public.site_settings
    for each row execute function public.audit_row();
end $$;
