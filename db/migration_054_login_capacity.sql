-- =====================================================================
-- جریان — مهاجرت ۰۵۴: ورود پیامکی برای حدود ۵۰۰ کاربر + برون‌بری کدهای ملی برای انتقال (آبان ۱۴۰۵)
-- این فایل را کامل در Supabase SQL Editor پیست و اجرا کنید (روی سرور خودمان خودکار اجرا می‌شود).
-- ایمن برای اجرای چندباره (idempotent). بعد از migration_053 اجرا شود.
--
-- تصمیم کاربر (۲ آبان ۱۴۰۵): همکاران یک ساختمان IP مشترک دارند و صبح‌ها هم‌زمان وارد می‌شوند.
--   • سقف درخواست کد پیامکی:  هر IP ۶۰ ← ۲۰۰ و کل سامانه ۳۰۰ ← ۵۰۰ در ساعت
--   • کد پیامکی اشتباه دیگر در «قفل ورود» آن IP شمرده نمی‌شود و ورود با کد هم در زمان قفل رد نمی‌شود
--     (قفل IP فقط برای رمز عبور است؛ کد پیامکی خودش ۳ بار حق اشتباه و هر نفر ۵ کد در ساعت دارد).
--     ستون تازه‌ی login_events.method = 'otp' برای ورودهای پیامکی.
--   • migration_export_nids(): فقط مدیر — نمک و هش کدهای ملی برای انتقال به سرور خودمان (مرحله‌ی ۶)؛
--     بدون آن ۵۰۰ کاربر باید کد ملی را دوباره وارد کنند. کد ملی خام هیچ‌جا نیست.
-- بدنه‌ی تابع‌ها عین نسخه‌های قبلی است جز همین تغییرها.
-- =====================================================================

alter table public.login_events add column if not exists method text;

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
    where not success and not blocked and coalesce(method, '') <> 'otp'
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

create or replace function public.otp_request(p_nid text, p_method text default null)
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

  if (select count(*) from otp_request_log l where l.ip is not distinct from v_ip and l.created_at > now() - interval '1 hour') >= 200 then
    perform set_config('response.status', '429', true);
    return json_build_object('error', 'ip_limit', 'retry_after', 3600);
  end if;
  insert into otp_request_log (ip) values (v_ip) returning id into log_id;

  if not nid_valid(n) then
    perform set_config('response.status', '400', true);
    return json_build_object('error', 'invalid_nid');
  end if;

  select a.id, a.full_name, a.phone, a.active, a.is_admin into u
    from app_user_nids x join app_users a on a.id = x.user_id
   where x.nid_hash = jarian_nid_hash(n);
  if not found or not u.active or (u.phone is null and not u.is_admin) then
    perform set_config('response.status', '404', true);
    return json_build_object('error', 'not_found');
  end if;

  -- ۵.۳۱.۱: مدیر اول روش ورود را انتخاب می‌کند (پیامک یا رمز) — پیامکی فرستاده نمی‌شود
  if u.is_admin and p_method is null then
    return json_build_object('choose', true, 'sms', u.phone is not null);
  end if;
  if u.phone is null then
    perform set_config('response.status', '404', true);
    return json_build_object('error', 'no_phone');
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
  if (select count(*) from login_otps where created_at > now() - interval '1 hour') >= 500 then
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

create or replace function public.login_otp(p_otp_id uuid, p_code text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  hdrs json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  ua text := left(hdrs->>'user-agent', 300);
  v_ip text := jarian_client_ip();
  c text := jarian_digits(p_code);
  o record; u record;
  role_name text;
  secret text;
begin
  -- ۰۵۴: قفل IP فقط برای رمز عبور است؛ کد پیامکی محافظت خودش را دارد (۳ بار حق اشتباه، ۵ کد در ساعت)
  perform pg_advisory_xact_lock(hashtext('jarian-login:' || coalesce(v_ip, '')));

  select * into o from login_otps where id = p_otp_id for update;
  if not found or o.used_at is not null or o.expires_at < now() or o.attempts >= 3 then
    perform set_config('response.status', '410', true);
    return json_build_object('error', 'expired');
  end if;

  if crypt(c, o.code_hash) <> o.code_hash then
    update login_otps set attempts = attempts + 1 where id = o.id;
    insert into login_events (success, role, user_agent, ip, user_id, method) values (false, null, ua, v_ip, o.user_id, 'otp');
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
  insert into login_events (success, role, user_agent, ip, user_id, user_name, method)
  values (true, role_name, ua, v_ip, u.id, u.full_name, 'otp');

  select value into secret from app_config where key = 'jwt_secret';
  return json_build_object(
    'token', sign(json_build_object('role', role_name, 'uid', u.id,
                                    'exp', extract(epoch from (now() + interval '24 hours'))::integer), secret),
    'role', role_name, 'name', u.full_name);
end;
$$;

create or replace function public.migration_export_nids()
returns json language plpgsql security definer set search_path = public as $$
begin
  if jarian_claim_role() <> 'app_admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  return json_build_object(
    'pepper', (select value from app_config where key = 'nid_pepper'),
    'nids', coalesce((select json_agg(json_build_object('user_id', user_id, 'nid_hash', nid_hash)) from app_user_nids), '[]'::json));
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.otp_request(text,text)', 'public.login_otp(uuid,text)', 'public.migration_export_nids()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'app_admin')  then execute format('revoke all on function %s from app_admin', f);  end if;
    if exists (select 1 from pg_roles where rolname = 'app_viewer') then execute format('revoke all on function %s from app_viewer', f); end if;
  end loop;
end $$;
revoke all on function public.login_lock_until(text) from anon, authenticated;
grant execute on function public.otp_request(text,text) to anon;
grant execute on function public.login_otp(uuid,text)  to anon;
grant execute on function public.migration_export_nids() to app_admin;

notify pgrst, 'reload schema';

-- بررسی (اختیاری، بعد از اجرا):
--   select position('>= 500' in prosrc) > 0 from pg_proc where proname = 'otp_request';          -- true
--   select has_function_privilege('anon', 'public.migration_export_nids()', 'execute');          -- false
--   select has_function_privilege('app_viewer', 'public.migration_export_nids()', 'execute');    -- false
