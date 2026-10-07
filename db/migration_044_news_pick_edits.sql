-- =====================================================================
-- جریان — مهاجرت ۰۴۴: ویرایش دستی «اخبار منتخب» (تب «در یک نگاه»)
-- این فایل را کامل در Supabase SQL Editor پیست و اجرا کنید.
-- ایمن برای اجرای چندباره (idempotent). بعد از migration_043 اجرا شود.
--
-- «اخبار منتخب» رو هوش مصنوعی روزی ۴ بار در news_ai_insights می‌سازه. مدیر حالا
-- می‌تونه روی اون فهرست:
--   pin  = سنجاق: خبر (با همه‌ی مشخصاتش در pick) بالای فهرست می‌مونه، حتی بعد از
--          اجراهای بعدی هوش مصنوعی، به ترتیب sort_order؛ «افزودن به منتخب» از روی
--          کارت هر خبر هم همین‌ه.
--   hide = حذف از منتخب: اون پست دیگه در فهرست منتخب نمیاد (خودِ پست در سایت می‌مونه).
-- یک ردیف برای هر پست (post_id یکتا). title فقط برای دفتر تغییرات و خوانایی.
-- بیننده فقط می‌خونه؛ مدیر همه‌کار. grantها صریح (سیاست جدید سوپابیس).
-- =====================================================================

create table if not exists public.news_pick_edits (
  id         serial primary key,
  post_id    bigint not null unique,
  action     text   not null check (action in ('pin', 'hide')),
  title      text,
  pick       jsonb,
  sort_order int    not null default 0,
  created_at timestamptz not null default now()
);

alter table public.news_pick_edits enable row level security;
drop policy if exists news_pick_edits_read on public.news_pick_edits;
create policy news_pick_edits_read on public.news_pick_edits for select to app_viewer, app_admin using (true);
drop policy if exists news_pick_edits_admin on public.news_pick_edits;
create policy news_pick_edits_admin on public.news_pick_edits for all to app_admin using (true) with check (true);
grant select on public.news_pick_edits to app_viewer;
grant select, insert, update, delete on public.news_pick_edits to app_admin;
grant usage, select on sequence public.news_pick_edits_id_seq to app_admin;

-- دفتر تغییرات (migration_039)
do $$
begin
  if to_regprocedure('public.audit_row()') is null then return; end if;
  drop trigger if exists audit_row on public.news_pick_edits;
  create trigger audit_row after insert or update or delete on public.news_pick_edits
    for each row execute function public.audit_row();
end $$;
