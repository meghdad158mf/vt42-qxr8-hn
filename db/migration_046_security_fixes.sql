-- =====================================================================
-- جریان — مهاجرت ۰۴۶: رفع ایرادهای امنیتی بررسی کد (مهر ۱۴۰۵)
-- این فایل را کامل در Supabase SQL Editor پیست و اجرا کنید.
-- ایمن برای اجرای چندباره (idempotent). بعد از migration_045 اجرا شود.
--
-- ۱) سوپابیس به‌طور پیش‌فرض اجرای هر تابع تازه‌ی schema public رو مستقیم به anon و
--    authenticated می‌ده؛ «revoke ... from public» اون grant مستقیم رو برنمی‌داره. چند تابع
--    migration ۰۳۹/۰۴۲/۰۴۳ چک نقش داخل بدنه نداشتن — مهم‌ترینش login_unlock: هر کسی با
--    کلید عمومی anon می‌تونست قفل ورود رو باز کنه (حدس رمز بی‌نهایت). حالا:
--      - login_unlock و login_lock_status خودشون نقش مدیر رو چک می‌کنن؛
--      - اجرای این توابع از anon و authenticated (و توابع داخلی از app_viewer) گرفته می‌شه.
-- ۲) login(): قفل advisory روی IP قبل از بررسی قفل ورود — درخواست‌های هم‌زمان از یک IP
--    پشت‌سرهم اجرا می‌شن و نمی‌تونن هم‌زمان از سد «۵ تلاش» رد بشن.
-- ۳) capacity_snapshot_job: upsert به‌جای delete+insert — اجرای هم‌زمان شبانه و باز کردن
--    صفحه‌ی وضعیت دیگه خطای کلید تکراری نمی‌ده.
-- =====================================================================

-- ---------- ۱) توابع فقط مدیر ----------
create or replace function public.login_lock_status()
returns table (ip text, locked_until timestamptz, attempts int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', '') <> 'app_admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select x.ip, x.until, x.n from (
    select coalesce(e.ip, '') as ip, login_lock_until(e.ip) as until, count(*)::int as n
    from login_events e
    where not e.success and e.created_at > now() - interval '30 minutes'
    group by e.ip
  ) x
  where x.until is not null
  order by x.until desc;
end;
$$;
revoke all on function public.login_lock_status() from public;
grant execute on function public.login_lock_status() to app_admin;

create or replace function public.login_unlock(p_ip text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', '') <> 'app_admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
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

-- ---------- ۲) login() با قفل advisory روی IP ----------
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

  -- درخواست‌های هم‌زمان از یک IP پشت‌سرهم (تا پایان تراکنش)
  perform pg_advisory_xact_lock(hashtext('jarian-login:' || coalesce(client_ip, '')));

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

-- ---------- ۳) عکس روزانه‌ی حجم با upsert ----------
create or replace function public.capacity_snapshot_job()
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  d       date := (now() at time zone 'Asia/Tehran')::date;
  v_posts bigint := jarian_rel_size(array['posts']);
  v_hawza bigint := jarian_rel_size(array['hawza_mentions', 'crawl_seen', 'crawl_suggestions', 'crawl_sites']);
  v_logs  bigint := jarian_rel_size(array['login_events', 'page_views', 'admin_audit', 'client_errors', 'capacity_snapshots', 'login_unlocks']);
  v_total bigint := pg_database_size(current_database());
begin
  -- bucketی که امروز دیگه فایلی نداره حذف بشه (بقیه با upsert)
  delete from capacity_snapshots c
  where c.day = d and c.kind = 'storage'
    and not exists (select 1 from storage.objects o where o.bucket_id::text = c.category);
  insert into capacity_snapshots (day, kind, category, bytes, files)
  select d, 'storage', o.bucket_id::text, coalesce(sum((o.metadata->>'size')::bigint), 0), count(*)
  from storage.objects o group by o.bucket_id
  on conflict (day, kind, category) do update set bytes = excluded.bytes, files = excluded.files;
  insert into capacity_snapshots (day, kind, category, bytes) values
    (d, 'db', 'posts', v_posts),
    (d, 'db', 'hawza', v_hawza),
    (d, 'db', 'logs',  v_logs),
    (d, 'db', 'other', greatest(v_total - v_posts - v_hawza - v_logs, 0))
  on conflict (day, kind, category) do update set bytes = excluded.bytes;
  delete from capacity_snapshots where day < d - 400;
end;
$$;
revoke all on function public.capacity_snapshot_job() from public;

-- ---------- ۴) گرفتن grantهای پیش‌فرض سوپابیس ----------
do $$
declare
  f        text;
  r_all    text;  -- همه‌ی نقش‌های سایت که وجود دارن
  r_public text;  -- فقط anon و authenticated
begin
  select string_agg(quote_ident(rolname), ', ') into r_all from pg_roles
    where rolname in ('anon', 'authenticated', 'app_admin', 'app_viewer');
  select string_agg(quote_ident(rolname), ', ') into r_public from pg_roles
    where rolname in ('anon', 'authenticated');
  -- فقط داخلی (از توابع security definer دیگه یا pg_cron) — هیچ نقش سایت
  foreach f in array array[
    'public.login_lock_until(text)',
    'public.capacity_snapshot_job()',
    'public.jarian_rel_size(text[])',
    'public.audit_write(text,text,text,text,jsonb)',
    'public.audit_short(jsonb)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public', f);
      if r_all is not null then execute format('revoke all on function %s from %s', f, r_all); end if;
    end if;
  end loop;
  -- فقط مدیر/بیننده‌ی واردشده — نه کاربر ناشناس
  foreach f in array array[
    'public.login_lock_status()',
    'public.login_unlock(text)',
    'public.capacity_snapshot()',
    'public.storage_usage()',
    'public.channel_last_post()',
    'public.hidden_post_ids()',
    'public.log_page_view(text,text)',
    'public.log_client_error(text,text,text,text)',
    'public.crawl_suggest(jsonb)',
    'public.change_password(text,text)'
  ] loop
    if to_regprocedure(f) is not null then
      if r_public is not null then execute format('revoke all on function %s from %s', f, r_public); end if;
    end if;
  end loop;
end $$;

-- بررسی (اختیاری، بعد از اجرا) — هر دو باید false باشن:
--   select has_function_privilege('anon', 'public.login_unlock(text)', 'execute'),
--          has_function_privilege('anon', 'public.login_lock_status()', 'execute');
