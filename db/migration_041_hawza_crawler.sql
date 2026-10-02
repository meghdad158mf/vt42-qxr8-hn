-- =====================================================================
-- جریان — مهاجرت ۰۴۱: خزنده‌ی «آنچه درباره حوزه گفته می‌شود»
-- این فایل را کامل در Supabase SQL Editor پیست و اجرا کنید.
-- ایمن برای اجرای چندباره (idempotent). بعد از migration_040 اجرا شود.
--
-- زمینه: تب دوم بخش «درباره حوزه». scripts/crawl_hawza.py هر ۲ ساعت سایت‌های
-- خبری crawl_sites رو می‌گرده (sitemap خبری / RSS / صفحه‌ی اول)، متن کامل هر
-- خبر تازه رو می‌خونه و خبرهایی که درباره‌ی حوزه، روحانیت، مراجع و طلاب‌اند رو
-- در hawza_mentions ذخیره می‌کنه — به‌علاوه‌ی پست‌های مرتبط کانال‌های ایتا/تلگرام/
-- بله‌ای که سامانه جمع می‌کنه (kind=social) و صفحه‌هایی که از لینک‌های مطالب مرتبط
-- پیدا می‌شن (kind=link). فقط تیتر و گزیده ذخیره می‌شه (نه متن کامل). سایت‌ها و
-- کانال‌هایی که در مطالب مرتبط لینک شدن و در فهرست نیستن → crawl_suggestions
-- («پیشنهاد منبع» در تنظیمات). crawl_seen فقط هش آدرس خبرهای خوانده‌شده‌ست
-- (هر خبر یک‌بار خونده بشه؛ بعد از ۲ روز پاک می‌شه).
-- بیننده فقط hawza_mentions پنهان‌نشده رو می‌بینه؛ بقیه فقط مدیر.
-- grantها صریح نوشته شدن (سیاست جدید سوپابیس).
-- =====================================================================

create table if not exists crawl_sites (
  id           serial primary key,
  name         text not null check (char_length(name) between 1 and 80),
  url          text not null unique check (url ~ '^https?://'),
  sitemap_url  text check (sitemap_url is null or sitemap_url ~ '^https?://'),
  active       boolean not null default true,
  last_run_at  timestamptz,
  last_pages   int,
  last_found   int,
  last_error   text,
  last_via     text,
  created_at   timestamptz not null default now()
);

create table if not exists hawza_mentions (
  id             bigserial primary key,
  url            text not null unique,
  site           text not null,
  site_name      text,
  title          text not null,
  excerpt        text,
  kind           text not null default 'site' check (kind in ('site', 'social', 'link')),
  post_id        bigint,
  matched_terms  text[] not null default '{}',
  hits           int not null default 0,
  in_title       boolean not null default false,
  published_at   timestamptz,
  scraped_at     timestamptz not null default now(),
  hidden_at      timestamptz
);
create index if not exists hawza_mentions_scraped_idx on hawza_mentions (scraped_at desc);

create table if not exists crawl_suggestions (
  id            serial primary key,
  kind          text not null check (kind in ('site', 'eitaa', 'telegram')),
  key           text not null,          -- دامنه (سایت) یا نام کانال بدون @
  name          text,
  sample_url    text,                   -- یکی از مطالب مرتبطی که بهش لینک داده
  hits          int not null default 0, -- چند مطلب مرتبط بهش لینک دادن
  found         int not null default 0, -- چند صفحه‌ی لینک‌شده‌اش خودش درباره‌ی حوزه بود
  status        text not null default 'new' check (status in ('new', 'added', 'ignored')),
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (kind, key)
);

-- خزنده تعدادها رو جمع می‌زنه (upsert معمولی PostgREST فقط جایگزین می‌کنه)
create or replace function public.crawl_suggest(items jsonb)
returns void
language sql
as $$
  insert into crawl_suggestions (kind, key, name, sample_url, hits, found)
  select x.kind, x.key, x.name, x.sample_url, coalesce(x.hits, 0), coalesce(x.found, 0)
  from jsonb_to_recordset(items) as x(kind text, key text, name text, sample_url text, hits int, found int)
  where x.kind in ('site', 'eitaa', 'telegram') and coalesce(x.key, '') <> ''
  on conflict (kind, key) do update set
    hits = crawl_suggestions.hits + excluded.hits,
    found = crawl_suggestions.found + excluded.found,
    sample_url = coalesce(excluded.sample_url, crawl_suggestions.sample_url),
    last_seen_at = now();
$$;
revoke all on function public.crawl_suggest(jsonb) from public;
grant execute on function public.crawl_suggest(jsonb) to app_admin;

create table if not exists crawl_seen (
  url_hash  text primary key,
  seen_at   timestamptz not null default now()
);
create index if not exists crawl_seen_at_idx on crawl_seen (seen_at);

alter table crawl_sites    enable row level security;
alter table hawza_mentions enable row level security;
alter table crawl_seen     enable row level security;
alter table crawl_suggestions enable row level security;
drop policy if exists rw_crawl_suggestions_admin on crawl_suggestions;
create policy rw_crawl_suggestions_admin on crawl_suggestions for all to app_admin using (true) with check (true);

drop policy if exists rw_crawl_sites_admin on crawl_sites;
create policy rw_crawl_sites_admin on crawl_sites for all to app_admin using (true) with check (true);
drop policy if exists rw_crawl_seen_admin on crawl_seen;
create policy rw_crawl_seen_admin on crawl_seen for all to app_admin using (true) with check (true);
drop policy if exists sel_hawza_mentions_viewer on hawza_mentions;
create policy sel_hawza_mentions_viewer on hawza_mentions for select to app_viewer using (hidden_at is null);
drop policy if exists rw_hawza_mentions_admin on hawza_mentions;
create policy rw_hawza_mentions_admin on hawza_mentions for all to app_admin using (true) with check (true);

grant select, insert, update, delete on crawl_sites, crawl_seen, hawza_mentions, crawl_suggestions to app_admin;
grant select on hawza_mentions to app_viewer;
grant usage, select on sequence crawl_sites_id_seq, hawza_mentions_id_seq, crawl_suggestions_id_seq to app_admin;

-- فهرست اولیه‌ی سایت‌ها (از پنل «تنظیمات بخش‌ها ← منابع خزنده» قابل تغییر است).
-- همه با آزمایش ۱۰ مهر ۱۴۰۵ از سرور گیت‌هاب در دسترس بودند؛ تسنیم، رجانیوز و
-- خراسان‌نیوز در دسترس نبودند و اضافه نشدند. سایت‌های خودِ حوزه (حوزه‌نیوز، رسا)
-- عمداً نیستند — آن‌ها در تب «اخبار حوزه»اند.
insert into crawl_sites (name, url, sitemap_url) values
  ('ایرنا', 'https://www.irna.ir', 'https://www.irna.ir/sitemap/news/sitemap.xml'),
  ('ایسنا', 'https://www.isna.ir', null),
  ('مهر', 'https://www.mehrnews.com', 'https://www.mehrnews.com/sitemap/news/sitemap.xml'),
  ('فارس', 'https://www.farsnews.ir', null),
  ('خبرآنلاین', 'https://www.khabaronline.ir', 'https://www.khabaronline.ir/sitemap/news/sitemap.xml'),
  ('همشهری آنلاین', 'https://www.hamshahrionline.ir', 'https://www.hamshahrionline.ir/sitemap/news/sitemap.xml'),
  ('مشرق', 'https://www.mashreghnews.ir', 'https://www.mashreghnews.ir/sitemap/news/sitemap.xml'),
  ('قدس آنلاین', 'https://www.qudsonline.ir', 'https://www.qudsonline.ir/sitemap/news/sitemap.xml'),
  ('انتخاب', 'https://www.entekhab.ir', 'https://www.entekhab.ir/fa-sitemap-news'),
  ('عصر ایران', 'https://www.asriran.com', 'https://www.asriran.com/fa-sitemap-news'),
  ('تابناک', 'https://www.tabnak.ir', 'https://www.tabnak.ir/fa-sitemap-news'),
  ('آنا', 'https://www.ana.ir', 'https://www.ana.ir/fa-sitemap-news'),
  ('برنا', 'https://www.borna.news', 'https://www.borna.news/fa-sitemap-news'),
  ('کیهان', 'https://www.kayhan.ir', 'https://www.kayhan.ir/fa-sitemap-news'),
  ('جوان آنلاین', 'https://www.javanonline.ir', 'https://www.javanonline.ir/fa-sitemap-news'),
  ('شهرآرانیوز', 'https://www.shahraranews.ir', 'https://www.shahraranews.ir/fa-sitemap-news'),
  ('باشگاه خبرنگاران جوان', 'https://www.yjc.ir', null),
  ('خبرگزاری صداوسیما', 'https://www.iribnews.ir', null),
  ('ایلنا', 'https://www.ilna.ir', null),
  ('جماران', 'https://www.jamaran.news', null),
  ('اعتماد آنلاین', 'https://www.etemadonline.com', null),
  ('شرق', 'https://www.sharghdaily.com', null),
  ('هم‌میهن', 'https://www.hammihanonline.ir', null),
  ('دنیای اقتصاد', 'https://www.donya-e-eqtesad.com', null),
  ('نورنیوز', 'https://www.nournews.ir', null),
  ('فرارو', 'https://www.fararu.com', null),
  ('دیدبان ایران', 'https://www.didbaniran.ir', null),
  ('خبر فوری', 'https://www.khabarfoori.com', null),
  ('رکنا', 'https://www.rokna.net', null),
  ('پانا', 'https://www.pana.ir', null),
  ('الف', 'https://www.alef.ir', null),
  ('بی‌بی‌سی فارسی', 'https://www.bbc.com/persian', null),
  ('ایران اینترنشنال', 'https://www.iranintl.com', null),
  ('رادیو فردا', 'https://www.radiofarda.com', null),
  ('ایندیپندنت فارسی', 'https://www.independentpersian.com', null),
  ('یورونیوز فارسی', 'https://per.euronews.com', null),
  ('دویچه وله فارسی', 'https://www.dw.com/fa-ir', null),
  ('ایران‌وایر', 'https://iranwire.com/fa', null),
  ('زیتون', 'https://www.zeitoons.com', null)
on conflict (url) do nothing;

-- دفتر تغییرات (migration_039): ویرایش‌های مدیر روی این دو جدول هم ثبت شود
do $$
declare t text;
begin
  if to_regprocedure('public.audit_row()') is null then return; end if;
  foreach t in array array['crawl_sites', 'hawza_mentions'] loop
    execute format('drop trigger if exists audit_row on public.%I', t);
    execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- زمان‌بندی (migration_040): هر ۲ ساعت، دقیقه‌ی ۴۵ ساعت‌های زوج UTC
-- (۰۴:۱۵، ۰۶:۱۵، … به وقت تهران) — بعد از کالکتورهای ایتا/وب‌سایت/تلگرام.
do $$
begin
  if to_regnamespace('cron') is null or to_regprocedure('jarian_cron.dispatch(text)') is null then
    raise notice 'pg_cron/migration_040 not installed — schedule skipped';
    return;
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'jarian-hawza';
  perform cron.schedule('jarian-hawza', '45 */2 * * *', $cmd$select jarian_cron.dispatch('hawza')$cmd$);
end $$;
