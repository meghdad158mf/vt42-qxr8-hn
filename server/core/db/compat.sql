-- =====================================================================
-- جریان روی سرور خودمان — لایه‌ی سازگاری با Supabase (پیش از schema.sql و migrationها)
-- هر بار نصب دوباره اجرا می‌شود؛ باید بی‌خطر و تکرارپذیر بماند.
-- چیزهایی که Supabase خودش داشت و migrationها فرض می‌کنند:
--   نقش‌ها (anon، authenticated، service_role، authenticator)، schemaی extensions با
--   pgcrypto، تابع‌های pgjwt (sign/verify)، schemaی storage، و دو افزونه‌ی pg_net و
--   pg_cron. این دو آخری اینجا «جانشین» دارند: net.http_post درخواست را در صف می‌گذارد و
--   سرویس jaryan-net می‌فرستد (فقط به میزبان‌های مجاز)؛ cron.schedule فقط ثبت می‌کند
--   (اجرای زمان‌بندی در مرحله‌ی ۵ با زمان‌بند خود سرور).
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;     -- رمزش را migrate.py از secrets.json می‌گذارد
  end if;
end $$;
grant anon, authenticated, service_role to authenticator;

-- ---------- extensions: pgcrypto + جانشین pgjwt ----------
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to public;

create or replace function extensions.url_encode(data bytea) returns text
language sql immutable as $$
  select translate(encode(data, 'base64'), E'+/=\n', '-_');
$$;

create or replace function extensions.url_decode(data text) returns bytea
language sql immutable as $$
  select decode(t || repeat('=', (4 - length(t) % 4) % 4), 'base64')
    from (select translate(data, '-_', '+/') as t) x;
$$;

create or replace function extensions.algorithm_sign(signables text, secret text, algorithm text) returns text
language sql immutable as $$
  select extensions.url_encode(extensions.hmac(signables, secret,
           case algorithm when 'HS256' then 'sha256' when 'HS384' then 'sha384'
                          when 'HS512' then 'sha512' else '' end));
$$;

-- همان امضای pgjwt: sign(payload json, secret text, algorithm text default 'HS256')
create or replace function extensions.sign(payload json, secret text, algorithm text default 'HS256') returns text
language sql immutable as $$
  with p as (
    select extensions.url_encode(convert_to('{"alg":"' || algorithm || '","typ":"JWT"}', 'utf8'))
           || '.' || extensions.url_encode(convert_to(payload::text, 'utf8')) as s
  )
  select s || '.' || extensions.algorithm_sign(s, secret, algorithm) from p;
$$;

create or replace function extensions.verify(token text, secret text, algorithm text default 'HS256')
returns table(header json, payload json, valid boolean)
language sql immutable as $$
  select convert_from(extensions.url_decode(r[1]), 'utf8')::json,
         convert_from(extensions.url_decode(r[2]), 'utf8')::json,
         r[3] = extensions.algorithm_sign(r[1] || '.' || r[2], secret, algorithm)
    from regexp_split_to_array(token, '\.') r;
$$;

-- ---------- storage: همان جدول‌های Supabase (فایل‌ها از مرحله‌ی ۲ روی دیسک سرور) ----------
create schema if not exists storage;
create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null unique,
  owner              uuid,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
create table if not exists storage.objects (
  id               uuid primary key default gen_random_uuid(),
  bucket_id        text references storage.buckets(id),
  name             text,
  owner            uuid,
  metadata         jsonb,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  last_accessed_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1:greatest(cardinality(string_to_array(name, '/')) - 1, 0)];
$$;
create or replace function storage.filename(name text) returns text
language sql immutable as $$
  select (string_to_array(name, '/'))[cardinality(string_to_array(name, '/'))];
$$;
create or replace function storage.extension(name text) returns text
language sql immutable as $$
  select case when storage.filename(name) like '%.%'
              then regexp_replace(storage.filename(name), '^.*\.', '') else '' end;
$$;

-- ---------- net: جانشین pg_net (صف + پاسخ با همان نام‌ها) ----------
create schema if not exists net;
create table if not exists net.http_request_queue (
  id                   bigserial primary key,
  method               text not null,
  url                  text not null,
  headers              jsonb,
  body                 jsonb,
  params               jsonb,
  timeout_milliseconds int not null default 5000,
  created              timestamptz not null default now()
);
create table if not exists net._http_response (
  id           bigint primary key,
  status_code  int,
  content_type text,
  headers      jsonb,
  content      text,
  timed_out    boolean,
  error_msg    text,
  created      timestamptz not null default now()
);

create or replace function net.http_post(
  url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds int default 5000) returns bigint
language plpgsql security definer set search_path = net, pg_temp as $$
declare rid bigint;
begin
  insert into net.http_request_queue (method, url, headers, body, params, timeout_milliseconds)
  values ('POST', http_post.url, http_post.headers, http_post.body, http_post.params, http_post.timeout_milliseconds)
  returning id into rid;
  perform pg_notify('jaryan_net', rid::text);
  return rid;
end;
$$;

create or replace function net.http_get(
  url text, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb,
  timeout_milliseconds int default 5000) returns bigint
language plpgsql security definer set search_path = net, pg_temp as $$
declare rid bigint;
begin
  insert into net.http_request_queue (method, url, headers, params, timeout_milliseconds)
  values ('GET', http_get.url, http_get.headers, http_get.params, http_get.timeout_milliseconds)
  returning id into rid;
  perform pg_notify('jaryan_net', rid::text);
  return rid;
end;
$$;

-- ---------- cron: جانشین pg_cron (فقط ثبت؛ اجرا در مرحله‌ی ۵) ----------
create schema if not exists cron;
create table if not exists cron.job (
  jobid    bigserial primary key,
  schedule text not null,
  command  text not null,
  nodename text not null default 'localhost',
  nodeport int not null default 5432,
  database text not null default current_database(),
  username text not null default current_user,
  active   boolean not null default true,
  jobname  text unique
);
create table if not exists cron.job_run_details (
  jobid          bigint,
  runid          bigserial primary key,
  job_pid        int,
  database       text,
  username       text,
  command        text,
  status         text,
  return_message text,
  start_time     timestamptz,
  end_time       timestamptz
);

create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint
language plpgsql as $$
declare jid bigint;
begin
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command, active = true
  returning jobid into jid;
  return jid;
end;
$$;
create or replace function cron.schedule(schedule text, command text) returns bigint
language sql as $$
  insert into cron.job (schedule, command) values (schedule, command) returning jobid;
$$;
create or replace function cron.unschedule(job_id bigint) returns boolean
language plpgsql as $$
begin
  delete from cron.job where jobid = job_id;
  return found;
end;
$$;
create or replace function cron.unschedule(job_name text) returns boolean
language plpgsql as $$
begin
  delete from cron.job where jobname = job_name;
  return found;
end;
$$;

-- هیچ‌کدام از این سه برای نقش‌های سایت نیست (فقط تابع‌های security definer صدایشان می‌زنند)
revoke all on schema net, cron from public;
revoke all on all functions in schema net from public;
revoke all on all functions in schema cron from public;

-- ---------- ثبت migrationهای اجراشده ----------
create schema if not exists jaryan_meta;
revoke all on schema jaryan_meta from public;
create table if not exists jaryan_meta.applied (
  name       text primary key,
  sha256     text not null,
  applied_at timestamptz not null default now()
);
