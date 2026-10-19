-- =====================================================================
-- جریان — مهاجرت ۰۵۰: ورود با کد ملی و رمز یک‌بارمصرف پیامکی (مهر ۱۴۰۵، نسخه‌ی ۵.۳۱.۰)
-- این فایل را کامل در Supabase SQL Editor پیست و اجرا کنید.
-- ایمن برای اجرای چندباره (idempotent). بعد از migration_049 اجرا شود.
--
-- خواست کاربر:
--   • بیننده‌ها از همان روز اول فقط با «کد ملی ← پیامک کد یک‌بارمصرف به موبایل ثبت‌شده» وارد شوند
--     (رمز مشترک بیننده دیگر کار نمی‌کند؛ مدیر می‌تواند در شرایط اضطراری از «تنظیمات بخش‌ها ←
--     امنیت» موقتاً روشنش کند).
--   • مدیر دو راه دارد: رمز مدیر (مثل قبل) یا کد ملی + پیامک (اگر در «کاربران» تیک «مدیر» دارد).
--   • «در حفاظت از کد ملی تلاش کن»: کد ملی هیچ‌جا به‌صورت خام ذخیره نمی‌شود — فقط HMAC-SHA256 با
--     کلید مخفی تصادفیِ همین پایگاه داده، در جدولی که هیچ نقش سایتی (حتی مدیر) به آن دسترسی ندارد؛
--     در جدول کاربران فقط ۴ رقم آخر برای شناسایی در پنل مدیر. ثبت/تغییر فقط از تابع
--     set_user_national_id (مدیر). کد ملی در دفتر تغییرات، پشتیبان و خروجی CSV هم نمی‌آید.
--   • پیامک از خودِ پایگاه داده (pg_net، همان که زمان‌بندی کارها استفاده می‌کند) به وب‌سرویس
--     «ارسال با الگو»ی ملی‌پیامک فرستاده می‌شود؛ کلید وب‌سرویس فقط در app_config (فقط توابع
--     security definer) و از پنل مدیر «فقط نوشتنی» است — هیچ‌وقت به مرورگر برنمی‌گردد.
--   • محدودیت‌ها: کد ۵ رقمی، ۲ دقیقه اعتبار، ۳ بار حق اشتباه؛ هر کاربر حداکثر ۱ پیامک در دقیقه و ۵ در
--     ساعت؛ هر IP حداکثر ۱۰ درخواست در ساعت؛ کل سامانه حداکثر ۶۰ پیامک در ساعت (حفظ اعتبار پنل).
--     کد اشتباه در قفل ورود موجود (۵ خطا در ۱۵ دقیقه از یک IP، migration_042) هم شمرده می‌شود.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net;

-- ---------- ۱) ستون‌های تازه‌ی کاربران ----------
alter table public.app_users add column if not exists national_id_last4 text
  check (national_id_last4 is null or national_id_last4 ~ '^[0-9]{4}$');
alter table public.app_users add column if not exists is_admin boolean not null default false;

-- هش کد ملی جدا از app_users و بدون هیچ grant: نه بیننده، نه مدیر، نه anon؛ فقط توابع زیر
create table if not exists public.app_user_nids (
  user_id  bigint primary key references public.app_users(id) on delete cascade,
  nid_hash text not null unique
);
alter table public.app_user_nids enable row level security;
revoke all on public.app_user_nids from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'app_admin')  then execute 'revoke all on public.app_user_nids from app_admin';  end if;
  if exists (select 1 from pg_roles where rolname = 'app_viewer') then execute 'revoke all on public.app_user_nids from app_viewer'; end if;
end $$;

-- کلید مخفی HMAC کد ملی (یک‌بار، تصادفی)
insert into public.app_config (key, value)
values ('nid_pepper', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

-- ---------- ۲) جدول کدهای یک‌بارمصرف و گزارش درخواست‌ها (بدون grant) ----------
create table if not exists public.login_otps (
  id          uuid primary key default gen_random_uuid(),
  user_id     bigint not null references public.app_users(id) on delete cascade,
  code_hash   text not null,
  ip          text,
  attempts    int not null default 0,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  net_req_id  bigint
);
create index if not exists login_otps_user_idx on public.login_otps (user_id, created_at desc);
create index if not exists login_otps_created_idx on public.login_otps (created_at desc);
alter table public.login_otps enable row level security;

create table if not exists public.otp_request_log (
  id         bigserial primary key,
  ip         text,
  sent       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists otp_request_log_ip_idx on public.otp_request_log (ip, created_at desc);
alter table public.otp_request_log enable row level security;

do $$ begin
  execute 'revoke all on public.login_otps, public.otp_request_log from public, anon, authenticated';
  if exists (select 1 from pg_roles where rolname = 'app_admin')  then execute 'revoke all on public.login_otps, public.otp_request_log from app_admin';  end if;
  if exists (select 1 from pg_roles where rolname = 'app_viewer') then execute 'revoke all on public.login_otps, public.otp_request_log from app_viewer'; end if;
end $$;

-- ورودها: نام هر نفر (فقط ورود پیامکی؛ رمز مشترک نامی ندارد)
alter table public.login_events add column if not exists user_id bigint;
alter table public.login_events add column if not exists user_name text;

-- رمز مشترک بیننده از همان روز اول خاموش (کلید اضطراری در پنل مدیر)
insert into public.site_settings (key, value) values ('viewer_password_login', 'false'::jsonb)
on conflict (key) do nothing;

-- ---------- ۳) کمک‌تابع‌ها ----------
-- ارقام فارسی/عربی → لاتین و حذف هر چیز غیررقمی
create or replace function public.jarian_digits(s text)
returns text language sql immutable as $$
  select regexp_replace(translate(coalesce(s, ''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '[^0-9]', '', 'g');
$$;

-- اعتبار کد ملی ایران (رقم کنترل)
create or replace function public.nid_valid(nid text)
returns boolean language plpgsql immutable as $$
declare s int := 0; r int; c int; i int;
begin
  if nid is null or nid !~ '^[0-9]{10}$' or nid ~ '^(\d)\1{9}$' then return false; end if;
  for i in 1..9 loop s := s + substr(nid, i, 1)::int * (11 - i); end loop;
  r := s % 11; c := substr(nid, 10, 1)::int;
  return (r < 2 and c = r) or (r >= 2 and c = 11 - r);
end;
$$;

create or replace function public.jarian_nid_hash(nid text)
returns text language plpgsql stable security definer set search_path = public, extensions as $$
declare pep text;
begin
  select value into pep from app_config where key = 'nid_pepper';
  return encode(hmac(nid, pep, 'sha256'), 'hex');
end;
$$;

create or replace function public.jarian_claim_role()
returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', '');
$$;

create or replace function public.jarian_client_ip()
returns text language sql stable as $$
  select left(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', split_part(h->>'x-forwarded-for', ',', 1)), 64)
  from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json as h) x;
$$;

-- فرستادن پیامک با الگوی ملی‌پیامک (وب‌سرویس کنسول، «ارسال با الگو» = send/shared)؛ شناسه‌ی درخواست pg_net
create or replace function public.jarian_sms_send(p_phone text, p_code text)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare k text; b text;
begin
  select value into k from app_config where key = 'sms_api_key';
  select value into b from app_config where key = 'sms_body_id';
  if coalesce(k, '') = '' or coalesce(b, '') !~ '^[0-9]+$' then return null; end if;
  return net.http_post(
    url := 'https://console.melipayamak.com/api/send/shared/' || k,
    body := jsonb_build_object('bodyId', b::bigint, 'to', p_phone, 'args', jsonb_build_array(p_code)),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 15000
  );
end;
$$;

-- ---------- ۴) ثبت کد ملی کاربر (فقط مدیر) ----------
create or replace function public.set_user_national_id(p_user_id bigint, p_nid text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare n text := jarian_digits(p_nid);
begin
  if jarian_claim_role() <> 'app_admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from app_users where id = p_user_id) then
    return json_build_object('error', 'no_user');
  end if;
  if n = '' then
    delete from app_user_nids where user_id = p_user_id;
    update app_users set national_id_last4 = null where id = p_user_id;
    return json_build_object('ok', true, 'last4', null);
  end if;
  if not nid_valid(n) then return json_build_object('error', 'invalid'); end if;
  if exists (select 1 from app_user_nids where nid_hash = jarian_nid_hash(n) and user_id <> p_user_id) then
    return json_build_object('error', 'duplicate');
  end if;
  insert into app_user_nids (user_id, nid_hash) values (p_user_id, jarian_nid_hash(n))
  on conflict (user_id) do update set nid_hash = excluded.nid_hash;
  update app_users set national_id_last4 = right(n, 4) where id = p_user_id;
  return json_build_object('ok', true, 'last4', right(n, 4));
end;
$$;

-- ---------- ۵) درخواست کد (صفحه‌ی ورود؛ anon) ----------
create or replace function public.otp_request(p_nid text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  n text := jarian_digits(p_nid);
  v_ip text := jarian_client_ip();
  u record;
  last_at timestamptz;
  code text;
  rb bytea;
  oid uuid;
  rid bigint;
  log_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('jarian-otp:' || coalesce(v_ip, '')));
  delete from otp_request_log where created_at < now() - interval '2 days';
  delete from login_otps where created_at < now() - interval '2 days';

  if (select count(*) from otp_request_log l where l.ip is not distinct from v_ip and l.created_at > now() - interval '1 hour') >= 10 then
    perform set_config('response.status', '429', true);
    return json_build_object('error', 'ip_limit', 'retry_after', 3600);
  end if;
  insert into otp_request_log (ip) values (v_ip) returning id into log_id;

  if not nid_valid(n) then
    perform set_config('response.status', '400', true);
    return json_build_object('error', 'invalid_nid');
  end if;

  select a.id, a.full_name, a.phone, a.active into u
    from app_user_nids x join app_users a on a.id = x.user_id
   where x.nid_hash = jarian_nid_hash(n);
  if not found or not u.active or u.phone is null then
    perform set_config('response.status', '404', true);
    return json_build_object('error', 'not_found');
  end if;

  select max(created_at) into last_at from login_otps where user_id = u.id;
  if last_at > now() - interval '60 seconds' then
    perform set_config('response.status', '429', true);
    return json_build_object('error', 'wait', 'retry_after', greatest(1, ceil(extract(epoch from (last_at + interval '60 seconds' - now()))))::int);
  end if;
  if (select count(*) from login_otps where user_id = u.id and created_at > now() - interval '1 hour') >= 5 then
    perform set_config('response.status', '429', true);
    return json_build_object('error', 'user_limit', 'retry_after', 3600);
  end if;
  if (select count(*) from login_otps where created_at > now() - interval '1 hour') >= 60 then
    perform set_config('response.status', '429', true);
    return json_build_object('error', 'global_limit', 'retry_after', 900);
  end if;

  rb := gen_random_bytes(3);
  code := lpad((((get_byte(rb, 0) << 16) | (get_byte(rb, 1) << 8) | get_byte(rb, 2)) % 100000)::text, 5, '0');
  rid := jarian_sms_send(u.phone, code);
  if rid is null then
    perform set_config('response.status', '503', true);
    return json_build_object('error', 'sms_not_configured');
  end if;

  insert into login_otps (user_id, code_hash, ip, expires_at, net_req_id)
  values (u.id, crypt(code, gen_salt('bf', 6)), v_ip, now() + interval '2 minutes', rid)
  returning id into oid;
  update otp_request_log set sent = true where id = log_id;

  -- همه‌ی ارقام جز ۴ رقم آخر پوشیده (خواست کاربر)
  return json_build_object('otp_id', oid, 'phone_hint', repeat('•', 7) || right(u.phone, 4),
                           'expires_in', 120, 'resend_in', 60);
end;
$$;

-- ---------- ۶) بررسی کد و صدور توکن (anon) ----------
create or replace function public.login_otp(p_otp_id uuid, p_code text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  hdrs json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  ua text := left(hdrs->>'user-agent', 300);
  v_ip text := jarian_client_ip();
  c text := jarian_digits(p_code);
  o record; u record;
  locked timestamptz;
  role_name text;
  secret text;
begin
  perform pg_advisory_xact_lock(hashtext('jarian-login:' || coalesce(v_ip, '')));
  locked := login_lock_until(v_ip);
  if locked is not null then
    insert into login_events (success, role, user_agent, ip, blocked) values (false, null, ua, v_ip, true);
    perform set_config('response.status', '429', true);
    return json_build_object('error', 'locked', 'retry_after', greatest(1, ceil(extract(epoch from (locked - now()))))::int);
  end if;

  select * into o from login_otps where id = p_otp_id for update;
  if not found or o.used_at is not null or o.expires_at < now() or o.attempts >= 3 then
    perform set_config('response.status', '410', true);
    return json_build_object('error', 'expired');
  end if;

  if crypt(c, o.code_hash) <> o.code_hash then
    update login_otps set attempts = attempts + 1 where id = o.id;
    insert into login_events (success, role, user_agent, ip, user_id) values (false, null, ua, v_ip, o.user_id);
    perform set_config('response.status', '401', true);
    return json_build_object('error', 'invalid_code', 'left', greatest(0, 2 - o.attempts));
  end if;

  select id, full_name, active, is_admin into u from app_users where id = o.user_id;
  if not found or not u.active then
    perform set_config('response.status', '403', true);
    return json_build_object('error', 'inactive');
  end if;

  update login_otps set used_at = now() where id = o.id;
  role_name := case when u.is_admin then 'app_admin' else 'app_viewer' end;
  insert into login_events (success, role, user_agent, ip, user_id, user_name)
  values (true, role_name, ua, v_ip, u.id, u.full_name);

  select value into secret from app_config where key = 'jwt_secret';
  return json_build_object(
    'token', sign(json_build_object('role', role_name, 'uid', u.id,
                                    'exp', extract(epoch from (now() + interval '24 hours'))::integer), secret),
    'role', role_name, 'name', u.full_name);
end;
$$;

-- ---------- ۷) login(): رمز مشترک بیننده فقط با کلید اضطراری ----------
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

  perform pg_advisory_xact_lock(hashtext('jarian-login:' || coalesce(client_ip, '')));

  delete from login_events where created_at < now() - interval '30 days';
  delete from login_unlocks where reset_at < now() - interval '1 day';

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
    -- ۵.۳۱.۰: بیننده فقط با کد ملی + پیامک، مگر مدیر کلید اضطراری را روشن کرده باشد.
    -- blocked=true تا در قفل ورود (۵ خطا) شمرده نشود — رمزش درست بوده
    if coalesce((select value from site_settings where key = 'viewer_password_login'), 'false'::jsonb) <> 'true'::jsonb then
      insert into login_events (success, role, user_agent, ip, blocked) values (false, 'app_viewer', ua, client_ip, true);
      perform set_config('response.status', '403', true);
      return json_build_object('error', 'viewer_password_disabled');
    end if;
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

-- ---------- ۸) تنظیم و وضعیت پیامک (فقط مدیر) ----------
-- کلید «فقط نوشتنی»: مقدار هیچ‌وقت برگردانده نمی‌شود؛ رشته‌ی خالی = بدون تغییر
create or replace function public.sms_config_set(p_api_key text, p_body_id text)
returns json language plpgsql security definer set search_path = public as $$
declare b text := jarian_digits(p_body_id);
begin
  if jarian_claim_role() <> 'app_admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(trim(p_api_key), '') <> '' then
    if trim(p_api_key) !~ '^[A-Za-z0-9_-]{8,200}$' then return json_build_object('error', 'invalid_key'); end if;
    insert into app_config (key, value) values ('sms_api_key', trim(p_api_key))
    on conflict (key) do update set value = excluded.value;
  end if;
  if b <> '' then
    insert into app_config (key, value) values ('sms_body_id', b)
    on conflict (key) do update set value = excluded.value;
  end if;
  return json_build_object('ok', true);
end;
$$;

-- وضعیت: تنظیم شده یا نه + نتیجه‌ی ۱۰ ارسال آخر (کد پاسخ وب‌سرویس؛ بدون شماره و کد)
create or replace function public.sms_status()
returns json language plpgsql security definer set search_path = public as $$
declare k text; b text; recent json;
begin
  if jarian_claim_role() <> 'app_admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  select value into k from app_config where key = 'sms_api_key';
  select value into b from app_config where key = 'sms_body_id';
  select coalesce(json_agg(r order by r.at desc), '[]'::json) into recent from (
    select o.created_at as at, a.full_name as name, r.status_code, left(coalesce(r.error_msg, r.content::text), 160) as reply
      from login_otps o
      left join app_users a on a.id = o.user_id
      left join net._http_response r on r.id = o.net_req_id
     order by o.created_at desc limit 10) r;
  return json_build_object('key_set', coalesce(k, '') <> '', 'body_id', b, 'recent', recent);
end;
$$;

-- پیامک آزمایشی به شماره‌ی دلخواه مدیر (کد ۱۲۳۴۵)؛ شناسه‌ی درخواست برای دیدن نتیجه
create or replace function public.sms_test(p_phone text)
returns json language plpgsql security definer set search_path = public as $$
declare ph text := jarian_digits(p_phone); rid bigint;
begin
  if jarian_claim_role() <> 'app_admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  if ph ~ '^989[0-9]{9}$' then ph := '0' || substr(ph, 3); end if;
  if ph !~ '^09[0-9]{9}$' then return json_build_object('error', 'invalid_phone'); end if;
  rid := jarian_sms_send(ph, '12345');
  if rid is null then return json_build_object('error', 'sms_not_configured'); end if;
  return json_build_object('ok', true, 'req_id', rid);
end;
$$;

create or replace function public.sms_test_result(p_req_id bigint)
returns json language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if jarian_claim_role() <> 'app_admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  select status_code, left(coalesce(error_msg, content::text), 300) as reply into r from net._http_response where id = p_req_id;
  if not found then return json_build_object('pending', true); end if;
  return json_build_object('status_code', r.status_code, 'reply', r.reply);
end;
$$;

-- ---------- ۹) دسترسی‌ها (درس migration_046: anon/authenticated مستقیم grant می‌گیرند) ----------
do $$
declare f text;
begin
  foreach f in array array[
    'public.jarian_nid_hash(text)', 'public.jarian_sms_send(text,text)',
    'public.set_user_national_id(bigint,text)', 'public.otp_request(text)', 'public.login_otp(uuid,text)',
    'public.sms_config_set(text,text)', 'public.sms_status()', 'public.sms_test(text)', 'public.sms_test_result(bigint)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'app_admin')  then execute format('revoke all on function %s from app_admin', f);  end if;
    if exists (select 1 from pg_roles where rolname = 'app_viewer') then execute format('revoke all on function %s from app_viewer', f); end if;
  end loop;
end $$;
-- صفحه‌ی ورود (پیش از ورود، با کلید anon)
grant execute on function public.otp_request(text)     to anon;
grant execute on function public.login_otp(uuid,text)  to anon;
grant execute on function public.login(text)           to anon;
-- فقط مدیر
grant execute on function public.set_user_national_id(bigint,text) to app_admin;
grant execute on function public.sms_config_set(text,text)         to app_admin;
grant execute on function public.sms_status()                      to app_admin;
grant execute on function public.sms_test(text)                    to app_admin;
grant execute on function public.sms_test_result(bigint)           to app_admin;

notify pgrst, 'reload schema';

-- بررسی (اختیاری، بعد از اجرا) — همه باید false باشند:
--   select has_function_privilege('anon', 'public.set_user_national_id(bigint,text)', 'execute'),
--          has_function_privilege('anon', 'public.sms_status()', 'execute'),
--          has_table_privilege('app_admin', 'public.app_user_nids', 'select'),
--          has_table_privilege('anon', 'public.login_otps', 'select');
