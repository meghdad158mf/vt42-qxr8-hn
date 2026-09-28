# جریان — راهنمای پروژه برای Claude

این فایل به‌صورت خودکار توسط Claude Code خونده می‌شه تا هر جلسه‌ی جدید بدون توضیح دوباره بفهمه پروژه چیه، الان در چه وضعیتیه و چی مونده. **فقط وضعیت فعلی + درس‌های مهم** اینجا نگه داشته می‌شه؛ تاریخچه‌ی کامل تغییرات توی تاریخچه‌ی گیت/PRها هست (بازنویسی و پاک‌سازی کامل این فایل: ۵ مهر ۱۴۰۵).

## ⚠️ اول این رو بخون — شاخه، روش کار، شماره‌ی ویرایش

- **شاخه‌ی زنده `claude/new-project-8ekywm`ه، نه `main`.** GitHub Pages از همین شاخه سرو می‌شه: `https://meghdad158mf.github.io/vt42-qxr8-hn/design/ita-monitoring-prototype.html`
- ریپو (۲ مهر ۱۴۰۵، بعد از دسترسی غیرمجاز به لینک قدیمی) از `meghdad158mf/meghdad` به **`meghdad158mf/vt42-qxr8-hn`** تغییر نام داد. ابزارهای MCP گیت‌هاب این سشن با `owner=meghdad158mf, repo=meghdad` کار می‌کنن (ریدایرکت می‌شه)؛ `vt42-qxr8-hn` مستقیم رد می‌شه.
- هارنس معمولاً یه شاخه‌ی قدیمی رو لوکال چک‌اوت می‌کنه — همیشه اول `git fetch origin claude/new-project-8ekywm` و کار رو از `origin/claude/new-project-8ekywm` شروع کن.
- **روش کار همیشگی**: شاخه‌ی کاری از `origin/claude/new-project-8ekywm` → تغییر → پیش‌نمایش Playwright با داده‌ی موک (پایین‌تر) → اسکرین‌شات با `SendUserFile` و **پرسیدن صریح تأیید** → فقط بعد از تأیید: commit + push + PR به `claude/new-project-8ekywm` (نه `main`) → `pull_request_read`/`get_commits` → merge → `git fetch` + `git diff` صفر → به کاربر بگو Ctrl+F5. **push مستقیم به `claude/new-project-8ekywm` مسدوده**.
- **شماره‌ی ویرایش (درخواست صریح کاربر)**: هر PR به شاخه‌ی زنده ثابت `APP_VERSION` (درست قبل از `// ---- boot ----` در فرانت‌اند؛ بج صفحه‌ی ورود و فوتر از کلاس `.app-version` پر می‌شن) رو بالا می‌بره. تشخیص اندازه با Claude: تغییر کوچیک (باگ، متن/ظاهر، تنظیم جزئی، فقط مستندات/اسکریپت) → عدد آخر +۱؛ تغییر بزرگ (قابلیت/تب/بخش جدید، بازطراحی صفحه، جدول/migration جدید) → عدد وسط +۱ و آخر صفر؛ عدد اول فقط با درخواست کاربر. ⚠️ نسخه‌ی فارسیِ داخل دو `<span class="app-version">` هم باید هم‌زمان عوض بشه (fallback قبل از اجرای JS). بعد از مرج شماره‌ی جدید رو به کاربر بگو. آخرین: **۵.۱۱.۰**.
- کاربر با گیت/GitHub راحت نیست — هر کار دستی (SQL Editor، ساخت توکن، secret) رو قدم‌به‌قدم و با مسیر دقیق منو توضیح بده.
- دیباگ خطاهای سمت کاربر: F12 → Network → درخواست قرمز → تب Response (اگه DevTools زود پاک کرد، Clear و یه‌بار دیگه امتحان). اگه کاربر عکسی رو مستقیم در چت paste کرد و به دستت نرسید، اول ترنسکریپت سشن (`.jsonl`، بلوک‌های base64) رو بگرد، بعد درخواست پیوست کن.

## پروژه چیه؟

«جریان» سامانه‌ی رصد رسانه‌ای **اداره‌ی رصد و راهبری سیاسی‌اجتماعی حوزه‌ی علمیه‌ی خراسان**ه: جمع‌آوری خودکار پست‌های ایتا/تلگرام/بله، فید RSS سایت‌های خبری و صفحه‌ی اول روزنامه‌ها، تحلیل با هوش مصنوعی، و نمایش در یه فرانت‌اند تک‌فایلی فارسی/RTL. زیرساخت کاملاً ابری و رایگانه (GitHub Actions + Supabase + GitHub Pages).

## معماری

```
GitHub Actions (فقط از شاخه‌ی main اجرا می‌شن — schedule فقط default branch)
  collect_eitaa.py      هر ۲ ساعت (دقیقه ۰۰)       اسکرپ HTML عمومی eitaa.com
  collect_telegram.py   هر ۲ ساعت (دقیقه ۱۵)       Telethon + دانلود عکس/فیلم؛ timeout 40 دقیقه
  collect_rss.py        هر ۲ ساعت                  فید RSS (platform=website)
  collect_newspapers.py چند بار صبح‌ها               صفحه‌ی اول روزنامه‌ها از jaaar.com/kiosk (دانلود واقعی، نه hotlink)
  collect_bale.py       چند بار در روز             کانال «رصد شایعات» @rasadfakenews (پارس React Flight payload صفحه‌ی ble.ir)
  cleanup_media.py      روزی ۲ بار ۰۶:۱۵/۱۸:۱۵ UTC  پاک‌سازی رسانه‌ی قدیمی‌تر از RETENTION_DAYS=0.5
  analyze_news_insights.py روزی ۴ بار             → Edge Function news-insights
  extract_keywords.py   هر ۲ ساعت، ساعت‌های فرد    → Edge Function extract-post-keywords
  purge_orphaned_media.py / purge_channel_backfill_media.py   فقط دستی (workflow_dispatch)، بازیابی/پاک‌سازی یک‌بارمصرف
  deploy-edge-functions.yml   push-based روی شاخه‌ی زنده (نه schedule) — با تغییر supabase/functions/** خودکار دیپلوی می‌کنه
        ▼
Supabase (پروژه‌ی زنده: komqnapfqrtxxaytpcdt — Postgres + PostgREST + Storage، پلن رایگان)
  نقش‌ها app_admin / app_viewer؛ ورود با رمز مشترک از public.login() (pgcrypto + pgjwt، توکن ۲۴ ساعته)
  RLS: بیننده فقط خواندن (به‌جز insert روی feedback و notify_subscribers)، مدیر خواندن/نوشتن
  Edge Functions (Deno): translate، news-insights، extract-post-keywords، run-job
        ▼
design/ita-monitoring-prototype.html — فرانت‌اند تک‌فایلی (HTML/CSS/JS)، مستقیم با fetch به PostgREST/Storage/Functions
```

- ⚠️ **هر تغییر در `scripts/*.py` یا ورک‌فلوهای schedule باید جدا به `main` هم sync بشه**: شاخه از `origin/main`، `git merge origin/claude/new-project-8ekywm`، PR به `main` (PRهای «sync: به‌روزرسانی main با ...»). وگرنه هیچ‌وقت اجرا نمی‌شه. Edge Functionها و `deploy-edge-functions.yml` نیازی به sync ندارن.
- `SUPABASE_URL`/`SUPABASE_ANON_KEY` محرمانه نیستن (توی فرانت هاردکدن، RLS امنیت رو تضمین می‌کنه). این محیط **دسترسی شبکه به Supabase نداره** — هر بررسی داده‌ی زنده رو کاربر خودش در SQL Editor اجرا می‌کنه.
- ⚠️ **همیشه از کاربر بخواه URL بالای مرورگرش رو چک کنه که `komqnapfqrtxxaytpcdt` باشه.** پروژه‌ی قدیمی `tfppjveupcxisepteibn` (قفل‌شده به‌خاطر پرشدن Storage، شهریور ۱۴۰۵) هنوز SQL Editorش باز می‌شه و یه‌بار باعث شد چند دور کوئری روی دیتابیس اشتباه بررسی بشه. چند `avatar_url` قدیمی هنوز به دامنه‌ی اون پروژه اشاره می‌کنن و شکسته‌ان.
- همه‌ی migrationها **دستی** در SQL Editor اجرا می‌شن. جدول جدید → فایل `db/migration_0NN_*.sql` بعدی، با **GRANT صریح** به app_admin/app_viewer (سوپابیس از ۳۰ اکتبر ۲۰۲۶ دیگه خودکار grant نمی‌ده). bucket جدید فقط RLS policy خودش رو می‌خواد (grantهای schema `storage` یک‌بار در migration_003 انجام شده).

## secretها و توکن‌ها (مقدارشون رو هرگز در چت نخواه/نگو)

| نام | کجا | کاربرد | انقضا |
|---|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMIN_PASSWORD`, `TG_*` | GitHub Secrets | کالکتورها و جاب‌ها | — |
| `SUPABASE_ACCESS_TOKEN` | GitHub Secret | دیپلوی Edge Functionها (scope: Edge Functions + Edge Function Secrets: Read-write) | ۹۰ روزه — حدود **۱۳ آذر ۱۴۰۵ (۴ دسامبر ۲۰۲۶)** |
| `LIARA_API_KEY` | سوپابیس ← Edge Functions ← Secrets | هوش مصنوعی لیارا (`ai.liara.ir`، مدل `openai/gpt-4o-mini`) | — |
| `GITHUB_DISPATCH_TOKEN` | سوپابیس ← Edge Functions ← Secrets | `run-job` (اجرای دستی/وضعیت ورک‌فلوها) — fine-grained، فقط ریپوی `vt42-qxr8-hn`، فقط Actions: Read and write | **۵ دی ۱۴۰۵ (۲۶ دسامبر ۲۰۲۶)** |

- تاریخ‌های انقضا توی آرایه‌ی `SYS_TOKENS` فرانت‌اند هم هاردکدن (صفحه‌ی «وضعیت سامانه» شمارش معکوس نشون می‌ده) — با ساخت توکن جدید هر دو جا رو به‌روز کن.
- ⚠️ **چک‌لیست هر مهاجرت/بازسازی پروژه‌ی سوپابیس** (از تجربه‌ی مهاجرت شهریور): SQL migrationها فقط دیتابیس رو می‌سازن؛ جدا از اون باید (۱) `--project-ref` توی `deploy-edge-functions.yml` و `SUPABASE_URL`/anon key فرانت عوض بشه، (۲) `SUPABASE_ACCESS_TOKEN` جدید روی پروژه‌ی جدید ساخته بشه، (۳) `LIARA_API_KEY` و `GITHUB_DISPATCH_TOKEN` دوباره روی پروژه‌ی جدید تنظیم بشن، (۴) GitHub Secrets کالکتورها به‌روز بشن. `migration_021` لیست کانال‌های پیش‌فرض رو داره. ⚠️ اگه `schema.sql` از نو اجرا شد، `migration_035` هم باید دوباره اجرا بشه (نسخه‌ی جدید `login()` رو داره). `schema.sql` رو روی پروژه‌ی زنده دوباره اجرا نکن — رمزها رو ریست می‌کنه.

## روش پیش‌نمایش قبل از مرج (Playwright + داده‌ی موک)

- فایل HTML + `design/images`، `design/fonts`، `design/vendor` رو در یه پوشه‌ی scratchpad بذار (`git --git-dir=/home/user/meghdad/.git archive origin/claude/new-project-8ekywm design/images design/fonts design/vendor | tar -x --strip-components=1`) و با `python3 -m http.server` سرو کن.
- اجرا: `NODE_PATH=/opt/node22/lib/node_modules node script.js`، مرورگر `executablePath:'/opt/pw-browsers/chromium'`، context با `serviceWorkers:'block'`.
- **موک پیشنهادی (بدون دست‌زدن به کد)**: `context.route('**/komqnapfqrtxxaytpcdt.supabase.co/**', ...)` و جواب بر اساس اسم جدول در مسیر `/rest/v1/<table>`؛ برای `count=exact` هدرهای `content-range: 0-0/N` **و** `access-control-expose-headers: content-range` (بدون دومی عدد صفر خونده می‌شه). ورود: `sessionStorage` کلیدهای `jarian_token`/`jarian_role` (`app_admin`/`app_viewer`) و reload. Edge Functionها با `route('**/functions/v1/<name>')`.
- اگه صفحه روی «ورود» موند: یه درخواست موک‌نشده fail شده — `page.on('pageerror'/'console')` رو چک کن. الان `loadAllAndEnter()` خطا رو روی صفحه‌ی ورود نشون می‌ده (نه سکوت).
- موبایل: viewport ‏۳۹۰ و ۳۶۰؛ `documentElement.scrollWidth - clientWidth` باید صفر باشه.
- فراخوانی واقعی لیارا/گیت‌هاب/Supabase از اینجا قابل تست نیست — بعد از انتشار از کاربر بخواه روی سایت واقعی تست کنه.
- `html2canvas` (PDF خبرنامه): باگ‌های RTL فقط توی خروجی رستر دیده می‌شن، نه اسکرین‌شات صفحه — PDF واقعی بساز و چک کن.

## فرانت‌اند — ساختار کلی

- **ورود** (`#view-login`): رمز مشترک مدیر/بیننده. `handleLogin()` خطای شبکه (`TypeError`) رو از رمز اشتباه جدا می‌کنه؛ `loadAllAndEnter()` (هم در بوت هم بعد از ورود): اگه `loadAll()` شکست بخوره، نشست منقضی (`SESSION_EXPIRED` از هر ۴۰۱ در `api()`) → پاک‌کردن توکن + پیام؛ بقیه → پیام قطع اتصال + دکمه‌ی «تلاش دوباره». **رفرش با نشست معتبر** (توکن در `sessionStorage` — فقط همون زبانه؛ زبانه‌ی جدید/بستن مرورگر = ورود دوباره): صفحه‌ی ورود اصلاً دیده نمی‌شه — اسکریپت کوچیک `<head>` کلاس `has-session` روی `<html>` می‌ذاره (ورود مخفی تا اجرای اسکریپت اصلی)، بوت فوراً `view-dash` + آخرین بخش همون زبانه رو نشون می‌ده (`jarian_last_section`، `lastSectionKey()`؛ بخش مدیریتی برای بیننده → صفحه‌ی نخست) و تا پایان `loadAll()` کلاس `app-loading` روی body: نوار هلویی متحرک بالای صفحه + محتوای بخش `visibility:hidden` (فقط تب‌ها/زیرنویس دیده می‌شن، تا پیام «هنوز خبری نیست» گمراه‌کننده دیده نشه). بعدش اسکرول به `jarian_last_scroll` (ذخیره در `pagehide`) با `restoreScrollY()` برمی‌گرده — ۳ ثانیه با ResizeObserver دوباره اعمال می‌شه چون عکس‌ها ارتفاع رو عوض می‌کنن (مگر کاربر خودش اسکرول کنه)؛ `history.scrollRestoration='manual'`. `goLogin()` کلاس `has-session` رو برمی‌داره (نشست منقضی/خطا → صفحه‌ی ورود با پیام). انیمیشن دکمه‌ی ورود (پرشدن هلویی ۲ ثانیه‌ای با `scaleX` + هاله، کلاس `is-loading`) فقط پوششیه، سرعت رو عوض نمی‌کنه.
- **`loadAll()`**: همه‌ی `loadX`ها موازی در یه `Promise.all`؛ `loadPosts()` کوئری اصلی (`order=scraped_at.desc&limit=1000`) + `loadHawzaPosts()` + `loadClaimsPosts()` رو **بدون await قبلی** هم‌زمان شلیک و بعد ادغام می‌کنه (درس: `Promise.all` کافی نیست اگه خودِ فراخوانی بعد از یه await باشه). ایندکس `posts(scraped_at desc)` از migration_031 لازمه.
- ⚠️ **الگوی «منبع کم‌تکرار + کش سراسری ۱۰۰۰تایی»**: هر تبی که از منبعی کم‌حجم‌تر از بقیه‌ی سایت تغذیه می‌شه، باید کوئری اختصاصی خودش رو داشته باشه (مثل `loadHawzaPosts`/`loadClaimsPosts`، و `newspaper_unique_slugs` view برای شمارش روزنامه‌ها) — وگرنه از `POSTS_CACHE` بیرون می‌افته و تب خالی دیده می‌شه (سه‌بار تکرار شد).
- **منو و توپ‌بار**: منوی «بخش‌ها» (`#nav-menu`، باز شدن به چپ، دوستونه): عرصه‌های رصد (اخبار و رویدادها با ۷ زیرتب؛ کنشگری مجازی ← پست‌های منتشر شده؛ برنامه مدارس؛ یادداشت‌ها با ۳ زیرتب؛ درباره حوزه ← اخبار حوزه) + «بسته تحلیلی جریان». منوی «مدیریت» (فقط مدیر) به ترتیب: **وضعیت سامانه / بارگذاری محتوا / اطلاعیه برای کاربران / تنظیمات / خروجی‌گیری / نظرات کاربران**. ⚠️ منوی بخش‌ها و ردیف میان‌برهای صفحه‌ی نخست با اضافه‌شدن هر تب **دستی** به‌روز می‌شن.
- **تب‌بارها** (`.news-page-tabs`، همه‌ی بخش‌ها، مهر ۱۴۰۵ — طرح «خط زیرین + آیکون» به انتخاب کاربر؛ **بدون خط پایه‌ی سراسری** — زیر هدر خط هست و خط دوم رو کاربر نپسندید؛ تب فعال پس‌زمینه‌ی ملایم هلویی (گرادیان رو به پایین) + خط هلویی به پهنای تب): `setupTabBars()` یک‌بار در بوت آیکون (`data-ic` → `TAB_ICONS`) و خط هلویی لغزان (`.tab-ink`، جای‌گیری با `updateTabInk()` نسبت به `.tab-ink-origin` تا در RTL/اسکرول درست باشه؛ MutationObserver روی کلاس `active` هر دکمه) رو اضافه می‌کنه — تب جدید فقط `data-ic` لازم داره. چسبان (`position:sticky`) با پس‌زمینه فقط وقتی چسبیده (`.is-stuck`، `updateStuckTabBars`). گوشی: سایه‌ی لبه با mask و متغیرهای `--fs`/`--fe` (`updateTabFade`) + اسکرول خودکار تب فعال به دید. یادآوری آخرین تب: `jarian_last_news_tab` (`NEWS_CURRENT_TAB`)، `jarian_last_posts_tab`/`jarian_last_people_tab` (`restoreLastTab` در `switchSection`). بعد از `switchSection` خط هلویی بدون انیمیشن جای‌گیری می‌شه (بخش مخفی اندازه نداره). (نقطه‌ی «مطلب جدید» روی تب ساخته و به خواست کاربر حذف شد — برنگردون.)
- **زیرنویس تب‌ها** (`.news-tab-subtitle`): متن‌ها در `NEWS_TAB_INFO`/`POSTS_TAB_INFO`/`PEOPLE_TAB_INFO` — تب جدید باید متنش رو هم اضافه کنه.
- `switchSection(key)` بخش‌ها رو با کلاس `active` عوض می‌کنه و همیشه `window.scrollTo(0,0)` می‌زنه. شناسه‌های داخلی قدیمی عمداً موندن: `dashboard` (صفحه نخست)، `overview` (اخبار و رویدادها)، `people` (یادداشت‌ها)، `posts` (کنشگری مجازی)، `reports` (بسته تحلیلی)، `dossier` (پرونده‌های موضوعی).
- بخش‌های فقط‌مدیر: `ADMIN_ONLY_SECTIONS = ['export','settings','feedback','status','uploads','announce']`.
- **نشانگرهای هشدار منوی «مدیریت»** (`refreshAdminAlerts()`، فقط مدیر، ۲ ثانیه بعد از ورود و هر ۱۵ دقیقه): کنار «وضعیت سامانه» تعداد موارد نیازمند توجه با رنگ بدترین سطح (زرد/قرمز؛ ریز موارد در `title`)، کنار «نظرات کاربران» تعداد نظرهای جدید (نسبت به `localStorage` کلید `jarian_feedback_seen`؛ بار اول از همون لحظه؛ با باز کردن بخش نظرات صفر می‌شه — `markFeedbackSeen()`)، و یه نقطه روی خودِ دکمه‌ی «مدیریت» (قرمز چشمک‌زن/زرد/هلویی). **«دیده شد»** (خواست کاربر — زردِ طولانی مثل فضای ۶۸٪ نباید همیشه روشن بمونه): با باز کردن صفحه‌ی وضعیت، موارد فعلی با سطحشون در `jarian_status_ack` ذخیره می‌شن (`ackAdminAlerts()`، کلید پایدار هر مورد: `job:<job>`/`storage`/`logins`/`token:<key>`) و دیگه شمرده نمی‌شن مگر جدید باشن یا سطحشون بالاتر بره؛ **قرمز همیشه شمرده می‌شه**؛ مورد برطرف‌شده از ack پاک می‌شه تا برگشتش دوباره «جدید» باشه. title موارد دیده‌شده رو هم جدا نشون می‌ده. عمداً سبک: همون بررسی‌های تک‌ردیفی صفحه‌ی وضعیت (`SYS_STATUS_JOBS` + `storage_usage` + تلاش ناموفق ورود + `SYS_TOKENS`)، **بدون** سرویس‌های مرتبط و نتیجه‌ی گیت‌هاب (لیارا/سهمیه‌ی API). بررسی جدید در صفحه‌ی وضعیت → اگه ارزش هشدار داره، به `refreshAdminAlerts` هم اضافه‌ش کن.

### صفحه‌ی نخست (`sec-dashboard`)

به ترتیب: توپ‌بار؛ **هرو** با پنل آماری ۵تایی (`renderDashHeroStats()`: محتوای رصدشده = شمارش exact `posts`+`newspapers`؛ خبرگزاری = کانال‌های `show_in_news` + عنوان‌های یکتای روزنامه؛ مدارس = ثابت دستی `schoolsCount=126`؛ کنشگر مجازی = `show_in_cyberspace`؛ بسته تحلیل = `magazines`) با شمارش GSAP؛ کارت‌ها افقی: آیکون در مربع هلویی توپُر + عدد سفید با جداکننده‌ی هزارگان (`fmtHeroStat`) + برچسب — عمداً کلیک‌پذیر نیستن (خواست کاربر، پس hover ندارن)؛ ۵ ستون / ≤۹۰۰px سه / ≤۶۴۰px دو (پنجمی تمام‌عرض)؛ دسترسی سریع «کپسول» (`.qn-capsule`: «عرصه‌های رصد» با آیکون رادار / «بسته‌های تحلیلی» — فقط اسکرول؛ شیشه‌ای با حاشیه و هاله‌ی هلویی، شکل گرد عمداً متفاوت از کارت‌های مربعی آمار، نیمه‌ی زیر ماوس هلویی پر؛ برق عبوری هر ۶ ثانیه `qnShine` تا دیده بشه — انتخاب کاربر از ۸ مدل، مهر ۱۴۰۵)؛ کادر «چرا جریان» (سه ستون با border ظریف)؛ «عرصه‌های رصد و پایش» (۵ کارت بدون قاب — ترتیب به خواست کاربر: اخبار و رویدادها، یادداشت‌ها، درباره حوزه، کنشگری مجازی، برنامه مدارس با آیکون سه‌بعدی `images/domain-icon-*.webp`)؛ متن توضیحی؛ **ردیف میان‌برها** (`.domain-shortcuts`: ۱۴ لینک فعال + ۴ مورد «به‌زودی»؛ روی گوشی مخفی)؛ **کارت «بسته تحلیلی جریان»** (هلویی، گرید ۱۰تایی ثابت + کاروسل جلد مجلات، فلش راست=بعدی — تست‌شده، بی‌دلیل عوضش نکن)؛ **«اطلاع از انتشار» + «ثبت نظر»** کنار هم بدون قاب با خط عمودی هلویی (قاب‌دار دوبار رد شده)؛ فوتر.
- ⚠️ `design/images/dashboard-hero.webp` عمداً پس‌زمینه‌ی شفاف داره.
- طرح «شبکه» (گره + یال) در فاصله‌های خالی صفحه‌ی نخست ساخته و بعد از اضافه‌شدن «مدار» به خواست کاربر کامل حذف شد (با مدار ناهماهنگ بود) — برنگردون. بافت دانه‌ای/نقطه‌ای/هاله/خطوط منحنی تمام‌صفحه هم پیش‌نمایش داده شدن و انتخاب نشدن.
- **«مدار» عرصه‌ها** (`svg.dom-orbit` داخل `.domain-grid`، انتخاب کاربر از بین ۶ مدل اتصال: نقطه‌چین موجی/مترو/هاب/مدار/کمان‌ها/ترکیبی): قوس هلویی از میان پنج عرصه، پشت خودِ آیکون‌ها با mask محو (شبکه‌ی تصادفی پشت/کنار آیکون‌ها دوبار «شلوغ» تشخیص داده شد — برنگردون) + «شهاب جریان» (انتخاب کاربر از ۵ مدل حرکت: ذره‌های روان/شهاب/نبض پیاپی/ایستگاه‌به‌ایستگاه/موج نور): هر ۹ ثانیه یه نوار نور با دنباله از راست به چپ روی قوس — سه `<use>` خط‌چین روی هم با `stroke-dashoffset` متحرک (بدون JS)؛ ⚠️ مقدار پایانی offset هر سه باید یکی باشه وگرنه سرعتشون فرق می‌کنه و سرِ شهاب از هم می‌پاشه؛ طول مسیر ≈۱۱۳۹. مختصات ثابت نسبت به مرکز ردیف (فاصله‌ی مراکز ۱۸۶px = کارت ۱۷۰ + gap ۱۶؛ مرکز آیکون ۷۴px) — با تغییر اندازه‌ی کارت/آیکون عرصه‌ها این اعداد رو هم عوض کن. زیر ۹۰۰px مخفی؛ `prefers-reduced-motion` حرکت رو برمی‌داره. ⚠️ قانون سراسری `img,svg{max-width:100%}` عرض SVGهای عریض‌تر از ظرفشون رو کم می‌کنه و با margin-left ثابت از وسط در می‌رن — `max-width:none` لازمه (نسخه‌ی اول مدار به همین دلیل روی لپ‌تاپ کاربر کج بود). دو سرِ مدار روی صفحه‌ی باریک‌تر از ~۱۲۵۰px با mask وابسته به `50vw` نزدیک لبه محو می‌شن.
- `notify_subscribers`: شماره‌ی `09xxxxxxxxx`؛ پیامک خودکار نیست — مدیر از «خروجی‌گیری» CSV می‌گیره و دستی می‌فرسته.

### «اخبار و رویدادها» (`sec-overview`) — ۷ تب

`setNewsPageTab(tab)`؛ عضویت کانال: `show_in_news`. فیلترها (`newsState`): زمان (همه/امروز/دیروز/هفته/بازه — هندلر `#news-time-seg` باید `!b.dataset.t` رو گارد کنه)، منطقه (`regions`)، منابع (چندانتخابی)، جست‌وجو.

1. **در یک نگاه** (`analytics`، پیش‌فرض): دو ستون نامتقارن — راست: «اخبار منتخب» (هوش مصنوعی، `NEWS_AI_INSIGHTS.selected_posts`، تیتر فارسی کامل) + نمودار خطی پراکندگی ساعتی؛ چپ: عدد کل خبر امروز + تاریخ، ۳ ادعای اخیر بله، دونات «موضوعات پرتکرار» (هوش مصنوعی)، میله‌ای «حجم به تفکیک منبع». دو ویجت آماری rolling ۲۴ ساعته‌ان. Chart.js تنبل‌لود می‌شه (پایین‌تر).
2. **ادعاها و شایعات** (`claims`): فقط `platform='bale'`؛ `.claims-text` کلمپ ۴ خطی.
3. **شبکه‌های اجتماعی** (`study`) و 4. **وب‌سایت‌ها** (`website`): وب‌سایت‌ها چیپ‌های «میان‌بر جست‌وجو» (`news_topics`، OR بین کلیدواژه‌ها) و دکمه‌ی **ترجمه به فارسی** (فقط `platform=website`، Edge Function `translate`، جایگزینی درجا با رنگ هلویی، کش `NEWS_TRANSLATION_CACHE`) دارن. مدیر زیر هر پست چیپ‌های کلیدواژه + «ویرایش کلیدواژه» می‌بینه.
5. **روزنامه‌ها** (`newspapers`): کاورهای آخرین تاریخ موجود؛ برچسب تاریخ ثابت `slots=[0,1]` (امروز/دیروز) — اگه `RETENTION_DAYS` به ۳ برگشت، `[0,1,2]` کن.
6. ~~اخبار حوزه~~ → منتقل شد به بخش **«درباره حوزه»** (پایین‌تر). شماره‌گذاری بقیه‌ی تب‌ها عوض نشده. خلاصه‌ی منطقش: همون پنل مشترک با `newsState.platform='hawza'`؛ فقط کانال‌های `platform=website` با `show_in_hawza=true` (این‌ها از «وب‌سایت‌ها» مستثنا می‌شن) و فقط پست‌های `hawza_relevant=true` (تشخیص سیاسی/اجتماعی توسط `extract-post-keywords`). سه کانال RSS فعلی: حوزه خراسان، حوزه‌نیوز، رسا (migration_028). سایت بدون RSS اسکرپر جدا لازم داره (هنوز نیاز نشده).
7. **پرونده‌های موضوعی** (`dossier`): موضوعات موقت `dossier_topics` (نام + کلیدواژه + active)؛ پست‌ها در `dossier_topic_posts` (`auto` از تطبیق کلیدواژه‌ی هوش مصنوعی، `manual` از جست‌وجوی مدیر، `excluded` برای پنهان‌کردن). کارت‌ها عمداً بدون عنصر تعاملی با id مشترک (تداخل id با فید اصلی).
8. **خبرنامه مدارس** (`newsletter`): مدیر سه بخش (ادعاها/اخبار/پرونده) رو پیشنهاد/تأیید می‌کنه (draft در حافظه تا «انتشار»)؛ `newsletter_posts` بدون آرشیو (انتشار = حذف کامل + insert). خروجی: PDF واقعی با jsPDF + html2canvas (نه `window.print()` — Chromium هدر تکرارشونده‌ی چاپ رو پشتیبانی نمی‌کنه). صفحه‌ی اول فقط ادعاها؛ «اخبار» و «پرونده» زیر تیتر مشترک «برخی از مهمترین خبرها» با شماره‌گذاری پیوسته؛ تم نیم‌تاج روزنامه‌ای. ⚠️ **دو باگ html2canvas با فارسی**: (۱) `\n` زیر `pre-wrap` حروف با نیم‌فاصله رو می‌ریزه → خطوط با `<br>`؛ (۲) هر `letter-spacing` ترتیب حروف رو به‌هم می‌زنه → هرگز روی متن رسترشونده.

**«امروز/دیروز»**: همه‌ی فیلترها به نیمه‌شب تقویمی تهران وصلن — `iranTodayStartMs()` و `tehranDayDiff(dateStr)`. هیچ‌وقت `setHours(0,0,0,0)` خام یا `Math.floor` روی تفاضل مستقیم (رویدادهای امروز به -۱ گرد می‌شن).

### «درباره حوزه» (`sec-hawza`) — عرصه‌ی پنجم، ۲ تب (مهر ۱۴۰۵)

- **اخبار حوزه** (تنها تب فعال؛ قبلاً زیرتب «اخبار و رویدادها»): `setHawzaTab('news')`/`goToHawzaTab()`. ⚠️ از همون `#news-study-panel` «اخبار و رویدادها» استفاده می‌کنه — `placeNewsStudyPanel('hawza'|'overview')` **خودِ عنصر** رو بین `#hawza-news-slot` و جای اصلیش (یه comment نشانگر) جابه‌جا می‌کنه (کپی نه، تا idها تکراری نشن)؛ `setNewsPageTab()` همیشه پنل رو برمی‌گردونه و تب فعلی رو در `NEWS_CURRENT_TAB` نگه می‌داره؛ `switchSection('overview')` همون تب رو دوباره اعمال می‌کنه تا `newsState.platform` از `hawza` برگرده. منطق مشترک پنل در `activateNewsStudy(platform)`. `goToNewsTab('hawza')` (لینک‌های قدیمی) به همین بخش ریدایرکت می‌شه.
- **درباره حوزه** («به‌زودی»، دکمه‌ی disabled): اخباری که درباره‌ی حوزه گفته می‌شه — هنوز پیاده نشده.
- آیکون `images/domain-icon-hawza.webp` (۴۶۰×۴۶۰، از تصویر کاربر برش‌خورده؛ ارتفاع محتوا ~۴۰۵px مثل بقیه — نسخه‌ی اول ۳۶۳px بود و کوچیک‌تر دیده می‌شد). `.domain-grid` حالا flex با کارت ۱۷۰px (گوشی: دو ستونه، کارت پنجم وسط).

### «کنشگری مجازی» (`sec-posts`) — ۳ تب

- **پست‌های منتشر شده** (`feed`): کانال‌های `show_in_cyberspace`؛ فیلتر «طلاب خراسان / سایر کنشگران» (`is_khorasan_talabeh`، `matchesActivistGroup()`)، کانال‌ها، دسته، زمان، جست‌وجو. صفحه‌بندی ۱۲تایی مثل فید اخبار (`postsPage`، `goPostsPage()`، دکمه‌ها از `renderPagination()` مشترک)؛ با عوض شدن هر فیلتر (`postsFilterKey()`) به صفحه‌ی ۱ برمی‌گرده، با رفرش داده نه. فیلتر جدید باید به `postsFilterKey()` هم اضافه بشه. (قبلاً فقط ۱۵۰ پست اول بی‌صفحه نشون داده می‌شد؛ فید کانال «یادداشت‌ها» هنوز همون ۱۵۰تاییه.)
- **افراد و مجموعه‌ها** (`people`): جدول (نه کارت — ۵ مدل کارتی قبلاً رد شده) با ستون‌های نام، بستر (لینک کانال)، صاحب کانال (`owner_name`)، مخاطب (`subscriber_count`)، فعالیت (`activityOf()`: پست‌های هفته‌ی اخیر؛ >۲۰ زیاد، ۷–۲۰ متوسط، <۷ کم، ۰ «غیرفعال» قرمز)، موضوع؛ مرتب‌سازی سمت کلاینت؛ کلیک ردیف → فید همون کانال. ستون‌ها عرض ثابت دارن و چینش سربرگ/بدنه باید یکی باشه.
- **آنالیز**: هنوز غیرفعال («به‌زودی»).
- ⚠️ `querySelectorAll('> button')` روی عنصر نامعتبره — `:scope > button` بنویس.

### «یادداشت‌ها» (`sec-people`) — ۳ تب

`goToPeopleTab(tab)`؛ تب‌ها: **تحلیل سازمان‌ها** (`orgs`، `show_in_orgs`)، **چهره‌ها و فعالان سیاسی** (`figures`، پیش‌فرض، `show_in_people`)، **بسته‌های تحلیلی** (`archive`، جدول `archive_reports` — تولیدات نهادهای دیگه؛ کارت بدون قاب با جلد بلند، کلیک روی جلد فایل رو باز می‌کنه).
- دو تب اول یه ظرف مشترک دارن (`pfMode`، `pfDomainField()`): **گالری لوگو** (`renderPfGallery()`، ۸ در ردیف، مرتب با جدیدترین مطلب، جست‌وجو) → کلیک → **فید کانال** (`openPfChannel`/`closePfChannel`).
- **گروه‌بندی چندگانه** (مثل حزب ۱/۲، جدا از `categories`): `profile_groups` (`kind` = figures|orgs) + `channel_profile_groups`؛ چیپ‌های `#pf-group-row`؛ در حالت «همه» بخش‌بندی زیر تیتر هر گروه + «سایر».
- ⚠️ جدول‌های `people`/`professors`/... (migration_015) و `basirat_courses` (migration_017) دیگه هیچ‌جا در فرانت استفاده نمی‌شن (orphan، حذف نشدن).

### سایر بخش‌ها

- **بسته تحلیلی جریان** (`sec-reports`): فقط «مجلات جریان» (`magazines`)؛ فایل در bucket خصوصی `magazines` (signed URL ۶۰ ثانیه‌ای)، جلد در `magazine-covers`؛ نمایش در مودال (PDF با iframe، عکس با `<img>`).
- **برنامه مدارس** (`sec-schools`): گالری خروجی Power BI (`school_reports`: عکس تمام‌عرض، PDF/اکسل کارت فایل). تحلیل واقعی در Power BI خودِ کاربره.
- **نظرات کاربران** (`sec-feedback`): جدول `feedback` (بیننده هم insert داره)، نمایش با `textContent`.
- **بارگذاری محتوا** (`sec-uploads`، فقط مدیر، مهر ۱۴۰۵): به‌جای تب، سه کارت انتخاب «چه چیزی می‌خواهید بارگذاری کنید؟» (`.upl-choice`، `setUploadsTab`/`goToUploadsTab`) با نام متمایز + توضیح + «نمایش در: …» + تعداد (نام‌های «بسته تحلیلی جریان» و «بسته‌های تحلیلی» شبیه هم بودن و قاطی می‌شدن): بسته تحلیلی جریان (`magazines`)، بسته‌های تحلیلی سایر نهادها (`archive_reports`)، گزارش‌های برنامه مدارس (`school_reports`). فرم‌ها (`setupUploadForms()`): دکمه‌ی انتخاب فایل فارسی (input پنهان ولی فعال داخل `label.upl-file`)، تشخیص خودکار «نوع فایل» از فایل‌ها، تاریخ پیش‌فرض امروزِ تهران + معادل شمسی زیر انتخاب‌گر میلادی مرورگر (`.upl-jdate`) — هر تب فرم بارگذاری + فهرست موارد بارگذاری‌شده با «حذف» (`renderUploadLists()`، از ابتدای هر `renderMagazines/renderArchiveReports/renderSchoolReports` صدا زده می‌شه؛ حذف = همون `deleteX` موجود). ⚠️ پنل‌های بارگذاری (`#magazine-upload-panel` و...) **با همون idها** از ته بخش‌های خودشون به اینجا منتقل شدن (هندلرها دست‌نخورده)؛ در بخش‌های اصلی فقط دکمه‌ی `.upl-goto` («＋ بارگذاری …»، فقط با `body.is-admin`) مونده. نوع محتوای جدیدی که بارگذاری داره → تب اینجا + ردیف در `renderUploadLists`.
- **اطلاعیه برای کاربران** (`sec-announce`، فقط مدیر، migration_036 جدول `announcements`): پیام ≤۳۰۰ نویسه، اهمیت «عادی» (بستن = دائمی، `localStorage` کلید `jarian_ann_dismissed`) یا «مهم» (بستن فقط تا ورود بعدی، `sessionStorage`)، مدت نمایش (۱/۳/۷/۳۰ روز یا بدون انقضا) + پیش‌نمایش زنده؛ فهرست با وضعیت (فعال/منقضی/متوقف) و «توقف»/«حذف». نمایش: کارت‌های شناور گوشه‌ی پایین‌چپ صفحه (`#ann-bar` با `position:fixed`، گوشی تمام‌عرض پایین؛ حداکثر ۳ تا، `renderAnnBar()` بعد از `loadAll`؛ «مهم» حاشیه‌ی قرمز) — انتخاب کاربر از ۵ مدل (نوار زیر هدر / زنگوله / کارت شناور / پنجره‌ی وسط / نوار متحرک). `.toast` به z-index ۹۵ رفت که زیر کارت‌ها نره. RLS: بیننده فقط فعالِ منقضی‌نشده؛ مدیر همه (فیلتر سمت کلاینت با `annIsLive`). جدول نبود (۴۰۴/۴۰۰) → نوار خالی و صفحه‌ی مدیر راهنمای اجرای migration. متن با `escHtml`.
- **خروجی‌گیری** (`sec-export`): CSV/JSON (اکسل هنوز «به‌زودی»)، مشترکین اطلاع‌رسانی + CSV شماره‌ها.

### «تنظیمات» (`sec-settings`)

چهار گروه: «منابع» / «برچسب‌های منابع» / «اخبار» / «امنیت». **مدیریت منابع**: فهرست ساده (`.chan-item` + برچسب بخش‌ها از `chanSectionsOf()`) + چیپ فیلتر بخش با تعداد (`chanDomainFilter`، شامل «بدون بخش») + پنجره‌ی ویرایش `#chan-editor-modal` (`openChanEditor(ch|null)`): مشخصات → موضوع → بخش‌ها از `CHAN_SECTIONS` به ترتیب کارت‌های صفحه‌ی نخست: اخبار و رویدادها، چهره‌ها، سازمان‌ها، **درباره حوزه**، کنشگری (جزئیات هر بخش فقط با تیکش: اخبار → منطقه؛ درباره حوزه → منطقه (`hawza_region_id`)، فقط وب‌سایت (`webOnly`، برای بقیه disabled)؛ کنشگری → صاحب کانال/مخاطب/طلبه؛ چهره‌ها/سازمان‌ها → گروه‌ها). ⚠️ «درباره حوزه» = `show_in_hawza`، و ذخیره‌اش `show_in_news` رو هم true می‌کنه (کلیدواژه/تشخیص سیاسی‌اجتماعی فقط روی `show_in_news` اجرا می‌شن)؛ نمایش/شمارش/فیلتر با `chanSecOn()` (منبع حوزوی برچسب «اخبار» نمی‌گیره)؛ ذخیره‌ی صریح + toast. تغییر نام درجا (`makeRenamable()`) برای موضوع/منطقه/گروه. تغییر رمز در `#pw-modal` (حداقل ۶ نویسه). سایر: موضوع منابع (`categories`)، مناطق، گروه‌های چهره/سازمان، میان‌برهای جست‌وجوی وب‌سایت‌ها (`news_topics`)، پرونده‌های موضوعی.

### «وضعیت سامانه» (`sec-status`، فقط مدیر)

همه‌ی بررسی‌ها فقط با باز کردن همین صفحه اجرا می‌شن (بدون اثر روی سرعت سایت). `renderSystemStatus()`:
- **فضای ذخیره‌سازی**: RPC `storage_usage()` (migration_034)، نوار از `STORAGE_LIMIT_MB=1024` (زرد ≥۶۵٪، قرمز ≥۸۵٪) + حجم هر bucket (`SYS_BUCKET_NAMES`).
- **کارهای خودکار** (`SYS_STATUS_JOBS`): زمان آخرین خروجی از خودِ داده‌ها با آستانه‌ی زرد/قرمز + نتیجه‌ی واقعی آخرین اجرای گیت‌هاب (`run-job` با `{action:'status'}`؛ ناموفق = کارت قرمز؛ `in_progress` قدیمی‌تر از ۱ ساعت «در حال اجرا» نشون داده نمی‌شه). کارت کلیدواژه صف پست‌های بررسی‌نشده رو با روند (نسبت به `localStorage` کلید `jarian_kw_queue`) نشون می‌ده؛ کارت پاک‌سازی تعداد رسانه‌ی قدیمی‌تر از ۳۰ ساعتِ پاک‌نشده (باید ۰ باشه). دکمه‌ی **«اجرای دستی»** زیر هر کارت → `run-job` (`workflow_dispatch` روی `main`)؛ تا خروجی تازه برسه یا گیت‌هاب اجرای بعد از درخواست رو تموم‌شده (حتی ناموفق) گزارش بده «در حال اجرا…» می‌مونه و صفحه هر دقیقه رفرش می‌شه. کالکتور/جاب جدید → یه ردیف به `SYS_STATUS_JOBS` و کلید به `JOBS` در `run-job` اضافه کن.
- **سرویس‌های مرتبط** (`renderSysServices()`، `SYS_SERVICES`): پایگاه داده/فضای فایل/تابع‌های سوپابیس از مرورگر؛ لیارا (درخواست ۱ توکنی)، گیت‌هاب (+ سهمیه‌ی API)، ایتا، تلگرام، بله، جار از سمت سرور با `run-job` و `{action:'health'}` (فقط با باز کردن صفحه یا «به‌روزرسانی همه»، نه رفرش دقیقه‌ای — `renderSystemStatus(true)`؛ سقف ۱۲ ثانیه؛ سایت‌های منبع از سرور سوپابیس چک می‌شن، نه رانر گیت‌هاب). سبز/زرد (کُند، آستانه‌ی `slow` هر سرویس)/قرمز. نمای فهرستی گروه‌بندی‌شده (`sysServicesHtml()`، `SYS_SERVICE_GROUPS`: زیرساخت/پردازش/منابع) با خلاصه‌ی «N از ۹» و نوار زمان پاسخ — عمداً متفاوت از کارت‌های «کارهای خودکار» (درخواست کاربر برای تنوع بصری). ⚠️ در این صفحه جداکننده «،»ه نه «·» — «·» با فونت فارسی شبیه صفر دیده می‌شه (۳۸ · → «۳۸۰»).
- **ورودها** (`renderSysLogins()`، جدول `login_events` از migration_035): آمار ۲۴ ساعت (ورود مدیر/بیننده، تلاش ناموفق — زرد ≥۵، قرمز ≥۲۰ — با IPهای پرتکرار) + جدول آخرین ورودها (زمان، نتیجه، نقش، دستگاه با `sysDeviceLabel()`، IP). چون رمز مشترکه، نام افراد معلوم نیست.
- **منابع بی‌خبر** (RPC `channel_last_post()`): منابع `active` بدون مطلب در ۳ روز اخیر.
- **انقضای توکن‌ها** (`SYS_TOKENS`): زرد ≤۲۱ روز، قرمز ≤۷.

### امنیت، خطایابی و سرعت در فرانت

- ⚠️⚠️ **هر متن بیرونی (پست، عنوان، نام کانال، کلیدواژه، خروجی هوش مصنوعی، ورودی مدیر) قبل از `innerHTML` باید escape بشه**: `escHtml()`/`escAttr()` (هر پنج کاراکتر `& < > " '`)؛ متن پست‌ها فقط از `claimsTextDisplay()` (escape کامل و فقط `<strong>` ساخته‌ی `collect_bale.py` برمی‌گرده)؛ لینک‌ها فقط از `safeUrl()` (فقط `http(s)`). دلیل: یه پست آزمایشی با `<img onerror>` روی نسخه‌ی قبلی ۳۰ بار اجرا شد و توکن مدیر توی `sessionStorage`ه. `collect_rss.py` بعد از strip تگ‌ها `unescape` می‌زنه، پس متن RSS می‌تونه تگ واقعی داشته باشه.
- **تنبل‌لود کتابخونه‌ها**: `chart.min.js`، `html2canvas.min.js`، `jspdf.umd.min.js` تگ ثابت ندارن — `loadScriptOnce(src)` (کش `SCRIPT_LOADS`) از `renderNewsAnalytics()` و `downloadNewsletter()`. همه در `design/vendor/` محلی‌ان، نه CDN (ادبلاکرها اسکریپت‌های دارای «chart» در مسیر رو بی‌صدا بلاک می‌کنن). GSAP از cdnjs و ثابته (صفحه‌ی نخست لازمش داره).
- **PWA**: `manifest.webmanifest`، `sw.js` (فایل‌های ثابت cache-first، HTML network-first، دامنه‌های دیگه رهگیری نمی‌شن). ⚠️ اگه فایل ثابتی با همون اسم عوض شد، `CACHE` در `sw.js` رو یه شماره بالا ببر (الان `jarian-static-v2` — v2 برای بزرگ‌کردن آیکون `domain-icon-hawza.webp`). حذف PWA = جایگزینی `sw.js` با نسخه‌ی unregister‌کننده، نه فقط حذف فایل. تست نصب‌پذیری: `launchPersistentContext` (context معمولی incognitoه).
- **موبایل** (زیر ۶۴۰px، بلوک CSS «بازبینی ریسپانسیو موبایل» + «کاهش شلوغی نمای گوشی» انتهای `<style>`): فیلترهای اخبار و پست‌ها پشت دکمه‌ی «فیلترها» (`.m-filter-btn`، `toggleMobileFilters()`، کنترل‌ها با کلاس `.m-collapse`، شمارنده با `updateMobileFilterBadges()` — فیلتر جدید باید هر دو رو بگیره)؛ «جستجوی هوشمند» و گرید/لیست مخفی؛ زیرنویس تب یک‌خطی؛ ردیف میان‌برها مخفی؛ فوتر فشرده؛ فاصله‌های بزرگ صفحه‌ی نخست کم؛ `.news-text` با `overflow-wrap:anywhere`. ⚠️ `.news-feed.grid-view.social-tab` specificity بالاتری داره و media queryهای خودش رو لازم داره؛ گریدها با `minmax(0,1fr)` نه `1fr`.
- **سیستم بصری**: کارت روشن (`var(--surface)`) شناور روی بوم تیره؛ کارت‌های عرصه‌ی صفحه‌ی نخست بدون قاب؛ برند سرمه‌ای `#16202a` + هلویی `#EAB393`. پیشنهادهای رنگ/فونت اسکیل `ui-ux-pro-max` رو اعمال نکن، فقط چک‌لیست‌هاش. مقصد `scrollIntoView` → `scroll-margin-top` روی خودِ عنصر. دراپ‌داون‌های `details.news-source-details` نزدیک لبه‌ی راست: به فهرست `inset-inline-start:0` در CSS اضافه‌شون کن + به هندلر مرکزی بستن با کلیک بیرون.

## هوش مصنوعی (Edge Functions + لیارا)

الگوی امنیتی مشترک: کلید فقط سمت سرور؛ فرانت/کالر **هرگز متن آزاد نمی‌فرسته** (فقط id/پارامتر)؛ تابع با توکن کالر یه کوئری واقعی PostgREST می‌زنه (`_shared/auth.ts`) که هم احراز هویته هم داده‌ی دست‌نخورده رو می‌ده؛ idهای برگشتی از مدل با مجموعه‌ی idهای ارسالی فیلتر می‌شن. rate limit نداره (برای تیم کوچیک داخلی پذیرفته شده).
- ⚠️ **خطای ۵۰۰ لیارا روی درخواست‌های چندپستی** (مهر ۱۴۰۵؛ بعد از ~۱۸ ثانیه، حتی دسته‌ی ۲۰تایی؛ ترجمه‌ی تک‌پستی سالم): جاب‌های دسته‌ای از `_shared/liara.ts` استفاده می‌کنن — `liaraChat()` جواب رو **stream** می‌گیره (fallback به JSON معمولی؛ جواب خالی/JSON نامعتبر = خطا) و `mapLimit()` حداکثر ۴ درخواست هم‌زمان. `extract-post-keywords`: تکه‌های ۵تایی، تکه‌ی ناموفق تک‌پستی دوباره امتحان می‌شه (ناموفق → `{}` + `skipped_post_ids`). `news-insights`: پله‌ای کل دسته → ۲۰تایی → ۵تایی. موج اول کاملاً ناموفق → ۵۰۲ و هیچ پستی علامت نمی‌خوره. **بودجه‌ی زمانی** (چون اسکریپت‌های کالر ۱۲۰ ثانیه صبر می‌کنن و یه‌بار تابع ازش رد شد و هیچی ذخیره نشد): هر درخواست با `AbortController` سقف ۴۰–۴۵ ثانیه (`AiTimeoutError`)، کل کار کلیدواژه ۷۵ و news-insights ‏۹۰ ثانیه؛ بعدش درخواست جدید شروع نمی‌شه. در کلیدواژه فقط پست‌های واقعاً پردازش‌شده (`doneIds`) علامت می‌خورن، بقیه NULL می‌مونن (`left_for_next_run`). تیکه‌ی timeout‌شده هم تک‌پستی دوباره امتحان می‌شه؛ پستی که تنها با فرصت ≥۲۰ ثانیه جواب نگیره «خطای اول» می‌خوره (فقط `ai_keywords_extracted_at` پر، `ai_keywords` همون NULL — `timeout_strikes`)، و بار دوم با `{}` کنار گذاشته می‌شه (درخواست کاربر: پست ناموفق نباید مدام به صف برگرده). `translate` هنوز مستقیم و بدون stream‌ه.

- **translate**: `{postId}` → `{title, text}` فارسی. با کلیک کاربر.
- **news-insights**: روزی ۴ بار (۰۲/۰۸/۱۴/۲۰ تهران) از `analyze_news_insights.py` با توکن مدیر؛ پست‌های ۶ ساعت اخیر شبکه‌های اجتماعی + وب‌سایت‌ها → «اخبار منتخب» (تا ۱۰، `headline` فارسی کامل) + «موضوعات پرتکرار» (تا ۶) → جدول `news_ai_insights`. فرانت فقط آخرین ردیف رو می‌خونه. (نسخه‌های قبلی موضوعات — کلیدواژه‌ای روی `news_topics` و bigram سمت کلاینت — بی‌کیفیت بودن؛ برنگرد.)
- **extract-post-keywords**: هر ۲ ساعت (ساعت‌های فرد، وسط کالکتورها) از `extract_keywords.py` — **۲ دور پشت‌سرهم در هر اجرا** (`ROUNDS=2`، درخواست کاربر، مهر ۱۴۰۵؛ با لیارای کُند هر دور ~۳۰ پست؛ اجرا فقط وقتی ناموفقه که هیچ دوری موفق نشه)؛ `BATCH_LIMIT=80` (با سهمیه‌ی تضمینی ۱۰ پست برای کانال‌های `show_in_hawza`، چون وگرنه starve می‌شدن)؛ متن هر پست تا ۴۰۰ کاراکتر. کلیدواژه‌ها **همیشه فارسی، تعداد متغیر، بدون ابهام** («وزارت خارجه ایران» نه «وزارت خارجه»). `ai_keywords`: `NULL` = بررسی‌نشده، `{}` = بررسی‌شده بی‌کلیدواژه (پست جاافتاده صریح `{}` می‌گیره تا دوباره هزینه نشه). برای کانال‌های حوزه `hawza_relevant` هم تعیین می‌شه (جاافتاده = `false`). بعدش تطبیق متنی موضوعات فعال `dossier_topics` → `dossier_topic_posts (auto)`.
- **run-job**: فقط مدیر (تابع با توکن کالر `select` روی `feedback` می‌زنه که بیننده نداره)؛ `{job}` از فهرست ثابت `JOBS` → `workflow_dispatch`؛ `{action:'status'}` → آخرین run هر ورک‌فلو. ⚠️ اگه ریپو تغییر نام داد، `GITHUB_REPO` در همین تابع رو عوض کن.

## دیتابیس

- **channels**: platform (`eitaa`|`telegram`|`website`|`bale`)، username (برای وب‌سایت = آدرس RSS)، title، category_id، region_id، avatar_url، owner_name، subscriber_count، is_khorasan_talabeh، عضویت بخش‌ها `show_in_news`/`show_in_cyberspace`/`show_in_people`/`show_in_orgs`/`show_in_hawza`، active. (`type` پیش‌فرض `news_agency`ه و از پنل قابل تغییر نیست — برای شمارش خبرگزاری از `show_in_news` استفاده کن.)
- **posts**: channel_id، platform، platform_post_id (یکتا با channel_id)، title (RSS و بله)، text، link، media_storage_path/media_source_url/media_fetched_at، posted_at، scraped_at، views، forwards، ai_keywords، ai_keywords_extracted_at، hawza_relevant.
- **categories**، **regions**، **profile_groups** + **channel_profile_groups**، **news_topics**، **dossier_topics** + **dossier_topic_posts**، **news_ai_insights**، **newsletter_posts**، **newspapers** (یکتا روی slug+edition_date)، **magazines**، **archive_reports**، **school_reports**، **feedback**، **notify_subscribers**، **login_events** (فقط مدیر select؛ insert فقط از `login()`)، **app_config** (هش رمزها + JWT secret، فقط از توابع security definer).
- **توابع**: `login(password)` (ثبت ورود در `login_events`؛ ناموفق → `response.status=401` به‌جای exception تا لاگ rollback نشه؛ ورود موفق user-agent `python*` ثبت نمی‌شه؛ پاک‌سازی >۳۰ روز)، `change_password(role, new)` (فقط مدیر)، `storage_usage()` و `channel_last_post()` (فقط مدیر، فقط‌خواندنی).
- **Storage** (۹ bucket): خصوصی `magazines`، `archive-reports` (signed URL)؛ عمومی `post-media`، `newspaper-covers`، `magazine-covers`، `archive-report-covers`، `channel-avatars`، `school-reports`، `basirat-course-posters` (بلااستفاده).
- جدول‌های orphan (دست‌نخورده، بلااستفاده): `domains`، `people`/`professors`/... (migration_015)، `basirat_courses`.

## Storage و پاک‌سازی رسانه

- سقف پلن رایگان ۱ گیگه؛ `post-media` بیشترین حجم رو داره. آخرین عدد واقعی: ~۳۰۰–۴۶۰ مگ. حالا از صفحه‌ی «وضعیت سامانه» دیده می‌شه.
- `RETENTION_DAYS=0.5` (موقتی — بعد از تصمیم Pro/VPS به ۳ برگرده، همراه `slots` روزنامه‌ها). ⚠️ فرکانس کرون `cleanup-media.yml` باید با `RETENTION_DAYS` هماهنگ بمونه (الان روزی ۲ بار، **دو ورودی جدای `- cron`** — رشته‌ی ترکیبی `3,15` در عمل فقط یه اسلات اجرا می‌کرد).
- ⚠️ **API حذف گروهی Storage حتی وقتی چیزی حذف نشه ۲۰۰ برمی‌گردونه** — `remove_storage_objects()` در هر دو `cleanup_media.py` و `purge_orphaned_media.py` تعداد واقعی رو از بدنه‌ی پاسخ چک می‌کنه (یه‌بار ۲۴۶ فایل orphan به‌خاطر همین جمع شد). کد کپی‌شده در دو فایل رو همیشه هر دو جا رفع کن.
- ⚠️ کالکتور ایتا هر اجرا کل صفحه‌ی کانال رو دوباره اسکن می‌کنه؛ برای همین فقط برای پست‌های **جدید** رسانه دانلود می‌کنه (`fetch_existing_post_ids()`)، و پست‌های قبلاً ثبت‌شده بدون فیلدهای رسانه upsert می‌شن — قبلاً عکس پست‌های قدیمی هر ۲ ساعت دوباره دانلود و `media_fetched_at` تازه می‌شد و پاک‌سازی ۱۲ ساعته برای ایتا کار نمی‌کرد (۵ مهر ۱۴۰۵). کارت «پاک‌سازی» صفحه‌ی وضعیت هم با همون معیار `media_fetched_at` (+ رسانه‌ی بدون `media_fetched_at`) می‌شمره.
- `MESSAGES_PER_CHANNEL_LIMIT=100` در کالکتور تلگرام (بک‌فیل کانال تازه). اگه یه کانال جدید حجم زیادی رسانه آورد: `purge-channel-backfill.yml` (دستی، ورودی یوزرنیم + تعداد).

## نکات عملیاتی GitHub Actions

- کرون `schedule` گیت‌هاب گاهی ~۱.۵ ساعت دیر اجرا می‌شه یا اسلات‌هایی رو skip می‌کنه (مخصوصاً با کرون‌های زیاد این ریپو) — قبل از نتیجه‌گیری «خرابه» یکی‌دو ساعت صبر کن.
- وضعیت `in_progress` در `list_workflow_runs`/`list_workflow_jobs` ممکنه ساعت‌ها بعد از پایان واقعی بمونه — به تایم‌استمپ‌های `get_job_logs` اعتماد کن (خطای ۴۰۹ لغو هم یعنی تموم شده). فهرست runها هم ممکنه اجرای تازه رو با تأخیر نشون بده.

## ساختار ریپو

```
design/ita-monitoring-prototype.html   فرانت‌اند کامل
design/manifest.webmanifest, sw.js, icons/   PWA
design/vendor/                          chart.min.js (v4.4.4)، jspdf.umd.min.js (v2.5.2)، html2canvas.min.js (v1.4.1)
design/fonts/                           IRANSansX
design/images/                          dashboard-hero.webp، domain-icon-{news,cyberspace,schools,people,hawza}.webp، analysis-illustration.webp، basirat-logo.webp
scripts/                                کالکتورها و جاب‌ها (بخش «معماری») + requirements.txt + telegram_session_to_string.py (ابزار محلی)
.github/workflows/                      یک ورک‌فلو برای هر اسکریپت + deploy-edge-functions.yml
supabase/functions/                     translate، news-insights، extract-post-keywords، run-job، _shared/auth.ts
db/schema.sql                           اسکیمای پایه — روی پروژه‌ی زنده دوباره اجرا نکن (رمزها ریست می‌شن)
db/migration_002 … 036                  به ترتیب شماره؛ مهم‌های اخیر:
  021 کانال‌های پیش‌فرض فعلی (برای بازسازی پروژه)   022 news_ai_insights   023 dossier + ai_keywords
  024 newsletter   025/026 پروفایل کانال و طلاب   027/028/029 اخبار حوزه   030 view شمارش روزنامه‌ها
  031 ایندکس posts.scraped_at   032 show_in_orgs   033 profile_groups   034 storage_usage/channel_last_post
  035 login_events + login() جدید   036 announcements (اطلاعیه برای کاربران)
.claude/skills/                         اسکیل‌های نصب‌شده (پایین)
```

**اسکیل‌ها**: انیمیشن (`animate`، `review-animations`، `improve-animations`، `find-animation-opportunities`، `animation-vocabulary`، `prototype`)، GSAP (`gsap-core/-timeline/-scrolltrigger/-plugins/-utils/-performance` — GSAP بدون build، از CDN با `<script>`)، طراحی (`ui-ux-pro-max`، `design`، `design-system`، `brand`، `banner-design`، `slides`، `ui-styling`). اسکیل‌های مخصوص React/Next.js/Swift عمداً نصب نشدن.

## قدم بعدی (موارد باز — هیچ‌کدوم بدون درخواست صریح کاربر پیش نره)

- ⚠️ **عمومی‌بودن ریپو**: کد کامل و همین فایل برای هر کسی که آدرس ریپو رو داشته باشه قابل‌دیدنه (رمز فقط جلوی داده رو می‌گیره). محدودکردن دید GitHub Pages فقط با Enterprise ممکنه؛ راه واقعی = ریپوی خصوصی + انتقال میزبانی (Netlify/Vercel). کاربر گفته بعداً تصمیم می‌گیره.
- **سطوح دسترسی / حساب جدا برای هر نفر** (کاربر پرسید «۴ سطح دسترسی»؛ گفت بعداً صحبت کنیم): پیشنهاد = حساب کاربری جدا + RLS بر اساس سطح؛ تعریف دقیق ۴ سطح رو باید کاربر بده. پنل «ورودها» فعلاً فقط نقش رو نشون می‌ده.
- **صف کلیدواژه‌ی هوش مصنوعی** (~۷۴۴۴ در ۶ مهر ۱۴۰۵): با کُندی لیارا هر دور ~۳۰ پست؛ حالا ۲ دور در هر اجرا. اگه روند صف در «وضعیت سامانه» باز رو به رشد بود: دورهای بیشتر (`ROUNDS`) یا کرون ساعتی.
- **تصمیم زیرساخت Storage** (Pro در برابر VPS): فعلاً فوریتی نیست؛ اگه نوار «وضعیت سامانه» به زرد رسید، این بحث رو باز کن.
- **کانال‌های ایتا/تلگرام در «درباره حوزه»** (کاربر پرسید چرا فقط سایت‌ها؛ گفت «بعداً»): الان `webOnly`ه؛ برای باز کردنش باید قید `platform=website` از `loadHawzaPosts`/فیلتر پنل و `webOnly` از `CHAN_SECTIONS` برداشته بشه.
- تب «آنالیز» کنشگری مجازی و سه میان‌بر «به‌زودی» صفحه‌ی نخست («شرکت‌کننده در برنامه‌ها»، «جامعه مخاطب»، «آنالیز کنشگری») هنوز placeholderن.
- خروجی Excel هنوز «به‌زودی»ه (CSV/JSON کار می‌کنه).
- تحلیل احساسات / طبقه‌بندی موضوعی کامل پست‌ها هنوز نیست (سه فیچر هوش مصنوعی فعلی فقط ترجمه، تحلیل دوره‌ای و کلیدواژه‌ان).
- سه سبک آیکون متفاوت روی صفحه‌ی نخست (سه‌بعدی / گرادیانی تخت / خطی) — فلگ‌شده، تصمیمی گرفته نشده.
- داده‌ی احتمالاً تستی قدیمی در مجلات/بسته‌ها — اگه کاربر گزارش داد، از پنل پاک بشه.
- عکس چند کانال (ایران‌اینترنشنال/صدای آمریکا) به پروژه‌ی قدیمی سوپابیس اشاره می‌کنه و شکسته — باید از پنل دوباره آپلود بشه.
