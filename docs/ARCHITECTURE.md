# معماری سامانه‌ی «جریان»

این سند ساختار فنی سامانه را برای برنامه‌نویسی که برای اولین بار روی پروژه کار می‌کند توضیح می‌دهد. جزئیات روزبه‌روز، تصمیم‌های کاربر و درس‌های گرفته‌شده در `CLAUDE.md` است؛ اینجا فقط «نقشه» است. نسخه‌ی مصور با نمودار (خصوصی، در حساب claude.ai صاحب پروژه) با هر تغییر ساختاری همراه این سند به‌روز می‌شود. (هیچ کلید، رمز یا نشانی محرمانه‌ای در این سند نیست و نباید باشد — ریپو عمومی است.)

## نمای کلی

```
 منابع (ایتا، تلگرام، بله، خوراک RSS، روزنامه‌ها، سایت‌های خبری)
        │  scripts/*.py  (GitHub Actions، فقط از شاخه‌ی main)
        ▼
 Supabase  ── Postgres + PostgREST (RLS) + Storage + Edge Functions (Deno)
        ▲          ▲ pg_cron → run-job → workflow_dispatch  (زمان‌بندی کارها)
        │ fetch    │
 فرانت‌اند (design/) ── ساخت با Vite → GitHub Pages
```

- **فرانت‌اند** مستقیم با PostgREST/Storage/Edge Functions حرف می‌زند؛ سرور میانی ندارد. امنیت داده با نقش‌های پایگاه داده (`app_admin`، `app_viewer`) و RLS تضمین می‌شود، نه با پنهان بودن کد.
- **جمع‌آورنده‌ها** (scripts/) برنامه‌های پایتون‌اند که GitHub Actions اجرا می‌کند؛ زمان اجرای هرکدام را pg_cron سوپابیس تعیین می‌کند (`db/migration_040…`) و از راه Edge Function `run-job` یک `workflow_dispatch` روی شاخه‌ی `main` می‌فرستد.
- **هوش مصنوعی** (ترجمه، «اخبار منتخب»، کلیدواژه‌ها، فیلتر بخش‌ها) در Edge Functionهاست و کلیدش فقط سمت سرور است.

## فرانت‌اند (`design/`)

صفحه‌ی اصلی `design/ita-monitoring-prototype.html` است (آدرس سایت عمداً همین می‌ماند). جاوااسکریپت ES module است و از `design/src/main.js` شروع می‌شود.

| پوشه | نقش | قاعده |
|---|---|---|
| `src/core/` | هسته‌ی خالص: تنظیمات و شماره‌ی نسخه، نشست، `api()`، گزارش خطا، متن امن (`escHtml`/`safeUrl`)، جست‌وجوی فارسی، تاریخ شمسی، اعتبارسنجی، ناوبری و «برگشت» | هیچ وابستگی به بقیه‌ی برنامه؛ وابستگی با hook (`setErrorContext`، `startRouter`، `setAdminHook`) |
| `src/data/` | داده‌ی مشترک: منابع، موضوع‌ها، مناطق، کش پست‌ها، تنظیمات سایت، عنوان بخش‌ها | binding زنده‌ی فقط‌خواندنی؛ تغییر فقط با setter (`setChannels`…) |
| `src/ui/` | اجزای رابط: پنجره، پیام/تأیید، منوها، تب‌بار، نمایشگر سند و عکس، صفحه‌بندی، انتخاب‌گر تاریخ شمسی، نمای روشن/تیره (`theme.js`)… | هر جزء با `setupX()` راه می‌افتد |
| `src/features/<عرصه>/` | هر عرصه‌ی سایت: `news`، `cyberspace`، `people`، `positions`، `hawza`، `schools`، `reports`، `announcements`، `home` | دو عرصه هم را دوطرفه import نمی‌کنند؛ برای برگشت از hook (`onX(fn)`) استفاده می‌شود |
| `src/admin/` | همه‌ی بخش‌های مدیریت (`status/`، `settings/`، کاربران، بارگذاری، خروجی، گزارش فعالیت…) | **بسته‌ی جدا**: فقط برای مدیر با `import('./admin/admin.js')` بار می‌شود؛ هیچ ماژول بیننده‌ای از `admin/` import نمی‌کند — کاری که از مدیریت لازم دارد با `adminHook(name)` (`core/admin-hooks.js`) |
| `src/styles/` | CSS به ترتیب آبشاری (`main.css` همه را به ترتیب import می‌کند) | ترتیب import عوض نشود؛ نمای روشن فقط در `27-theme-light.css` |
| `src/app.js` | ورود، ناوبری بین بخش‌ها، بارگذاری داده (`loadAll`)، اتصال اجزا | فقط تابع export‌شده‌ی این فایل را ماژول‌های features/admin می‌توانند import کنند (ارجاع موقت) |

قاعده‌های مهم:
- **هیچ دستگیره‌ی درون HTML** (`onclick=`، `onsubmit=`…) نیست؛ هر دکمه با `addEventListener` در setup ماژول خودش یا delegation با `data-*`.
- هر متن بیرونی قبل از `innerHTML` با `escHtml`/`escAttr`/`claimsTextDisplay` و هر لینک با `safeUrl`.
- هیچ اسکریپت یا فونت از CDN؛ کتابخانه‌ها در `design/vendor/` و فقط وقتی لازم‌اند بار می‌شوند.
- PWA: `design/sw.js` (فایل ثابت cache-first، صفحه network-first).

### افزودن …

- **تب یا بخش تازه**: HTML + ماژول در `features/<عرصه>/` با `setupX()` → `navCurrentState`/`navApply` در app.js (آدرس و «برگشت») → `SITE_VIS_ITEMS` (`data/site-sections.js`) → منوی بخش‌ها → فهرست `tests/e2e/sections.spec.js`.
- **کار مدیریتی تازه**: ماژول در `admin/` + فراخوانی setup در `admin/admin.js`؛ اگر app.js باید صدایش بزند، تابع در رابط `admin/admin.js` و صدا زدن با `admin()?.x()`.
- **جدول تازه**: فایل `db/migration_0NN_*.sql` بعدی با GRANT صریح و RLS؛ تابع `security definer` تازه با چک نقش در بدنه و `revoke … from anon, authenticated`.

## ساخت، آزمون و انتشار

| فرمان | کار |
|---|---|
| `npm run build` | Vite → `dist/` با همان ساختار آدرس‌ها؛ بسته‌ی بیننده و بسته‌ی جدای `assets/admin-<hash>.js` |
| `npm run lint` | ESLint |
| `npm run test:unit` | Vitest (`tests/unit/`): تاریخ شمسی، کد ملی، متن امن، جست‌وجو، ساختار importها، نبودن دستگیره‌ی درون HTML |
| `npm test` / `npm run test:dist` | Playwright (`tests/e2e/`) با سوپابیس ساختگی (`tests/e2e/support/mock-supabase.js`) روی رایانه و گوشی — خام یا ساخته‌شده |
| `python -m unittest discover -s tests/python` | آزمون‌های پایتون کالکتورها، بدون شبکه |

- `.github/workflows/tests.yml` همه‌ی این‌ها را روی هر PR به شاخه‌ی زنده اجرا می‌کند.
- `.github/workflows/pages.yml` با هر push به شاخه‌ی زنده می‌سازد، آزمون‌های dist را اجرا می‌کند و اگر سبز بود روی GitHub Pages منتشر می‌کند.
- `.github/workflows/deploy-edge-functions.yml` با تغییر `supabase/functions/**` تابع‌ها را دیپلوی می‌کند.

## سمت سرور (Supabase)

- **پایگاه داده**: `db/schema.sql` + migrationهای شماره‌دار (همه دستی در SQL Editor اجرا می‌شوند؛ schema.sql روی پروژه‌ی زنده دوباره اجرا نشود).
- **ورود**: کد ملی + رمز یک‌بارمصرف پیامکی (`otp_request`/`login_otp`) یا رمز مدیر همراه کد ملی (`login_admin`)؛ `login(password)` برای جمع‌آورنده‌ها و ورود اضطراری. خروجی همه JWT است که نقش (`app_admin`/`app_viewer`) را دارد.
- **Edge Functions** (`supabase/functions/`): `translate`، `news-insights`، `extract-post-keywords`، `run-job` (اجرای دستی/وضعیت/گزارش کارها)، `notify` (هشدار ایمیلی)؛ کد مشترک در `_shared/` (احراز هویت، هوش مصنوعی، خوشه‌بندی خبرها، فهرست کارها).
- **Storage**: bucketهای عمومی (رسانه‌ی پست‌ها، جلدها) و خصوصی با لینک امضاشده (مجلات، بسته‌ها، گزارش‌های مدارس).

## جمع‌آورنده‌ها و کارهای خودکار (`scripts/`)

| فایل | کار |
|---|---|
| `jarian_common.py` | کتابخانه‌ی مشترک: ورود، سربرگ‌ها، ذخیره‌ی پست‌ها، بارگذاری در Storage، پاک کردن فیلدهای رسانه، «اگر همه‌ی منابع خطا دادند اجرا ناموفق» |
| `collect_eitaa.py`، `collect_telegram.py`، `collect_bale.py`، `collect_rss.py`، `collect_newspapers.py` | جمع‌آوری از هر منبع → جدول `posts`/`newspapers` |
| `crawl_hawza.py` | خزنده‌ی «آنچه درباره حوزه گفته می‌شود» (`--dry-run` بدون پایگاه داده) |
| `analyze_news_insights.py`، `extract_keywords.py` | صدا زدن Edge Functionهای هوش مصنوعی |
| `cleanup_media.py` | پاک‌سازی رسانه‌ی قدیمی‌تر از مدت نگهداری |
| `purge_*.py` | پاک‌سازی دستی یک‌بارمصرف |

- هر کدام یک ورک‌فلو در `.github/workflows/` دارد که فقط `workflow_dispatch` است (زمان‌بندی با pg_cron).
- ورک‌فلوها از شاخه‌ی `main` اجرا می‌شوند؛ پس هر تغییر در `scripts/` یا ورک‌فلوی کالکتورها باید جدا به `main` هم برسد.
- اسکریپت تازه: تابع‌های مشترک را از `jarian_common` بگیرد، اول `require_env()` را صدا بزند، و اگر همه‌ی منابع خطا دادند با `exit_if_all_failed` اجرا را ناموفق کند تا کارت «وضعیت سامانه» قرمز شود؛ بعد یک خط `cron.schedule` در migration بعدی و ردیف در `supabase/functions/_shared/jobs.ts` و `SYS_STATUS_JOBS` (`design/src/admin/status/jobs.js`).

## برنامه‌ی آینده

مهاجرت به دو سرور (ایران: سایت، پایگاه داده، جمع‌آوری منابع داخلی؛ خارج: جمع‌آوری منابع خارجی، با صف ارسال و بسته‌ی رمزنگاری‌شده برای قطعی) — جزئیات در `CLAUDE.md`. API سازگار با PostgREST نگه داشته شود تا فرانت‌اند فقط آدرس را عوض کند.
