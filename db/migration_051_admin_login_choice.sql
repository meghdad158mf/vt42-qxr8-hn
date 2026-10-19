-- =====================================================================
-- جریان — مهاجرت ۰۵۱: انتخاب روش ورود برای مدیر (مهر ۱۴۰۵، نسخه‌ی ۵.۳۱.۱)
-- این فایل را کامل در Supabase SQL Editor پیست و اجرا کنید.
-- ایمن برای اجرای چندباره (idempotent). بعد از migration_050 اجرا شود.
--
-- خواست کاربر: پیوند جدای «ورود مدیر با رمز عبور» از صفحه‌ی ورود برداشته شود؛ مدیر هم مثل بقیه
-- کد ملی‌اش را می‌زند و اگر در «کاربران» نقش «مدیر» دارد، دو گزینه می‌بیند: «دریافت کد پیامکی»
-- یا «ورود با رمز عبور».
--   • otp_request(p_nid, p_method): برای مدیر بدون p_method فقط {"choose": true} برمی‌گرداند
--     (پیامکی فرستاده نمی‌شود)؛ با p_method='sms' همان روند قبلی.
--   • login_admin(p_nid, p_password): رمز مدیر فقط همراه کد ملیِ یک مدیر فعال قبول می‌شود؛ نام او در
--     «ورودها» ثبت می‌شود و شناسه‌اش (uid) در توکن. رمز اشتباه در قفل ورود (۵ خطا در ۱۵ دقیقه) شمرده می‌شود.
--   • login(password) دست نخورده: کالکتورها (ADMIN_PASSWORD) و ورود اضطراری بیننده با همین تابع‌اند.
--   • ورود اضطراری: اگر مدیر «ورود اضطراری با رمز مشترک» را روشن کند، صفحه‌ی ورود پیوند «ورود با
--     رمز مشترک» را نشان می‌دهد — پس anon این یک تنظیم (true/false) را هم می‌خواند.
--     ⚠️ راه نجات اگر هیچ مدیری کد ملی ثبت‌شده ندارد (یا کدش را فراموش کرده‌اید):
--        update public.site_settings set value = 'true'::jsonb where key = 'viewer_password_login';
--     سپس در صفحه‌ی ورود پیوند «ورود با رمز مشترک» را بزنید و با رمز مدیر وارد شوید.
-- =====================================================================

-- امضای قبلی (یک ورودی) باید برود تا PostgREST بین دو نسخه سردرگم نشود
drop function if exists public.otp_request(text);

-- ---------- درخواست کد (صفحه‌ی ورود؛ anon) ----------
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

  if (select count(*) from otp_request_log l where l.ip is not distinct from v_ip and l.created_at > now() - interval '1 hour') >= 10 then
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

-- ---------- ورود مدیر با کد ملی + رمز مدیر (anon) ----------
create or replace function public.login_admin(p_nid text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  hdrs json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  ua text := left(hdrs->>'user-agent', 300);
  v_ip text := jarian_client_ip();
  n text := jarian_digits(p_nid);
  u record;
  admin_hash text;
  locked timestamptz;
  secret text;
begin
  perform pg_advisory_xact_lock(hashtext('jarian-login:' || coalesce(v_ip, '')));
  locked := login_lock_until(v_ip);
  if locked is not null then
    insert into login_events (success, role, user_agent, ip, blocked) values (false, null, ua, v_ip, true);
    perform set_config('response.status', '429', true);
    return json_build_object('error', 'locked', 'retry_after', greatest(1, ceil(extract(epoch from (locked - now()))))::int);
  end if;

  select a.id, a.full_name into u
    from app_user_nids x join app_users a on a.id = x.user_id
   where nid_valid(n) and x.nid_hash = jarian_nid_hash(n) and a.active and a.is_admin;
  select value into admin_hash from app_config where key = 'admin_password_hash';

  if u.id is null or admin_hash is null or crypt(coalesce(p_password, ''), admin_hash) <> admin_hash then
    insert into login_events (success, role, user_agent, ip, user_id) values (false, null, ua, v_ip, u.id);
    perform set_config('response.status', '401', true);
    return json_build_object('error', 'invalid');
  end if;

  insert into login_events (success, role, user_agent, ip, user_id, user_name)
  values (true, 'app_admin', ua, v_ip, u.id, u.full_name);
  select value into secret from app_config where key = 'jwt_secret';
  return json_build_object(
    'token', sign(json_build_object('role', 'app_admin', 'uid', u.id,
                                    'exp', extract(epoch from (now() + interval '24 hours'))::integer), secret),
    'role', 'app_admin', 'name', u.full_name);
end;
$$;

-- ---------- صفحه‌ی ورود: anon کلید «ورود اضطراری» را هم می‌خواند (فقط true/false) ----------
drop policy if exists site_settings_anon_read on public.site_settings;
create policy site_settings_anon_read on public.site_settings for select to anon
  using (key in ('maintenance', 'viewer_password_login'));

-- ---------- دسترسی‌ها (درس migration_046) ----------
do $$
declare f text;
begin
  foreach f in array array['public.otp_request(text,text)', 'public.login_admin(text,text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'app_admin')  then execute format('revoke all on function %s from app_admin', f);  end if;
    if exists (select 1 from pg_roles where rolname = 'app_viewer') then execute format('revoke all on function %s from app_viewer', f); end if;
  end loop;
end $$;
grant execute on function public.otp_request(text,text) to anon;
grant execute on function public.login_admin(text,text) to anon;

notify pgrst, 'reload schema';

-- بررسی (اختیاری، بعد از اجرا):
--   select has_function_privilege('anon', 'public.login_admin(text,text)', 'execute');   -- true
--   select has_function_privilege('app_viewer', 'public.login_admin(text,text)', 'execute'); -- false
--   select count(*) from app_users where is_admin and active and national_id_last4 is not null; -- باید ≥ ۱
