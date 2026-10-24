-- =====================================================================
-- جریان روی سرور خودمان — بعد از همه‌ی migrationها، هر بار نصب (تکرارپذیر)
-- =====================================================================

-- schemaهای داخلی برای هیچ نقش سایتی نیستند (migration_040 همین را برای jarian_cron خواسته بود)
do $$
begin
  if to_regnamespace('jarian_cron') is not null then
    execute 'revoke all on schema jarian_cron from public, anon, authenticated, app_admin, app_viewer';
    execute 'revoke all on all functions in schema jarian_cron from public, anon, authenticated, app_admin, app_viewer';
  end if;
end $$;
revoke all on schema net, cron, jaryan_meta from anon, authenticated, app_admin, app_viewer;

-- پاسخ‌های قدیمی جانشین pg_net (خود pg_net بعد از ۶ ساعت پاک می‌کرد؛ اینجا ۷ روز برای «۱۰ ارسال آخر»)
delete from net._http_response where created < now() - interval '7 days';
