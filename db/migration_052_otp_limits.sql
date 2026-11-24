-- =====================================================================
-- جریان — مهاجرت ۰۵۲: بالا بردن سقف درخواست کد پیامکی (مهر ۱۴۰۵، نسخه‌ی ۵.۳۲.۱۲)
-- این فایل را کامل در Supabase SQL Editor پیست و اجرا کنید.
-- ایمن برای اجرای چندباره (idempotent). بعد از migration_051 اجرا شود.
--
-- ارزیابی «کاربران هم‌زمان»: همکاران یک ساختمان معمولاً پشت یک IP مشترک‌اند و سقف قبلی
-- (۱۰ درخواست کد در ساعت برای هر IP) با ورود صبحگاهی چند ده نفر پر می‌شد؛ سقف کل سامانه (۶۰ پیامک
-- در ساعت) هم برای تیم بزرگ‌تر کم بود. فقط این دو عدد عوض شده‌اند:
--   • هر IP:        ۱۰ ← ۶۰ درخواست کد در ساعت
--   • کل سامانه:    ۶۰ ← ۳۰۰ پیامک در ساعت
-- بقیه‌ی محافظت‌ها دست نخورده‌اند: هر کاربر ۱ کد در دقیقه و ۵ کد در ساعت، کد ۲ دقیقه‌ای با ۳ بار
-- حق اشتباه، و قفل ورود (۵ خطا از یک IP در ۱۵ دقیقه).
-- بدنه‌ی تابع عین migration_051 است جز همین دو عدد.
-- =====================================================================

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

  if (select count(*) from otp_request_log l where l.ip is not distinct from v_ip and l.created_at > now() - interval '1 hour') >= 60 then
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
  if (select count(*) from login_otps where created_at > now() - interval '1 hour') >= 300 then
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

-- دسترسی‌ها همان migration_051 (create or replace آن‌ها را نگه می‌دارد؛ اینجا دوباره برای اطمینان)
revoke all on function public.otp_request(text,text) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_admin')  then revoke all on function public.otp_request(text,text) from app_admin;  end if;
  if exists (select 1 from pg_roles where rolname = 'app_viewer') then revoke all on function public.otp_request(text,text) from app_viewer; end if;
end $$;
grant execute on function public.otp_request(text,text) to anon;

notify pgrst, 'reload schema';

-- بررسی (اختیاری، بعد از اجرا):
--   select position('>= 300' in prosrc) > 0 from pg_proc where proname = 'otp_request';   -- true
--   select has_function_privilege('anon', 'public.otp_request(text,text)', 'execute');      -- true
