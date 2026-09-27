-- migration_034: دو تابع فقط‌خواندنی برای صفحه‌ی «وضعیت سامانه» (فقط مدیر)
--   ۱) storage_usage(): حجم و تعداد فایل هر bucket — همون کوئری دستی
--      «نکته‌ی حجم Storage» CLAUDE.md، حالا از داخل سایت
--   ۲) channel_last_post(): زمان آخرین مطلب هر منبع — برای پیدا کردن منابعی
--      که مدتیه چیزی نفرستادن (RSS خراب، کانال بسته‌شده و ...)
-- هیچ‌کدوم داده‌ای رو تغییر نمی‌دن. security definer چون app_admin به
-- storage.objects مستقیم select نداره؛ دسترسی با چک نقش JWT فقط به مدیر
-- محدود شده (همون الگوی change_password در schema.sql).
-- باید دستی در Supabase SQL Editor (پروژه‌ی komqnapfqrtxxaytpcdt) اجرا بشه.

create or replace function public.storage_usage()
returns table(bucket_id text, file_count bigint, size_bytes bigint)
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::json->>'role', '') <> 'app_admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select o.bucket_id::text, count(*)::bigint,
           coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
    from storage.objects o
    group by o.bucket_id;
end;
$$;

revoke all on function public.storage_usage() from public;
grant execute on function public.storage_usage() to app_admin;

create or replace function public.channel_last_post()
returns table(channel_id bigint, last_scraped_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::json->>'role', '') <> 'app_admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select p.channel_id::bigint, max(p.scraped_at)
    from posts p
    group by p.channel_id;
end;
$$;

revoke all on function public.channel_last_post() from public;
grant execute on function public.channel_last_post() to app_admin;
