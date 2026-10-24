# سرور ایران — نصب پایه و به‌روزرسان

این پوشه برای **سرور داخلی اصلی** است (تصمیم کاربر، آبان ۱۴۰۵): کار روزانه کاملاً
مستقل از Supabase و گیت‌هاب؛ به‌روزرسانی کد فقط با «فایل به‌روزرسانی» که مدیر در
صفحه‌ی `/update` بارگذاری می‌کند.

| فایل | کار |
|---|---|
| `check.sh` | بررسی فقط‌خواندنی سرور (سیستم‌عامل، دیسک، شبکه، مخزن apt). خروجی IP و رمز ندارد. |
| `install.sh` | نصب پایه، یک‌بار: Postgres، nginx، دیوار آتش، گواهی https موقت، پشتیبان شبانه، به‌روزرسان. |
| `updater/jaryan_updater.py` | صفحه‌ی `/update` (فقط کتابخانه‌ی استاندارد پایتون). |
| `tools/build_installer.py` | ساخت فایل تکی `jaryan-install.sh` (به‌روزرسان درون آن) برای بردن با فلش. |
| `tools/make_package.py` | ساخت بسته‌ی به‌روزرسانی `.jaryan` از یک پوشه. |
| `core/` | محتوای «بسته‌ی سرور» (پایین). |
| `tools/build_core.py` | ساخت بسته‌ی سرور: `core/` + `db/*.sql` مخزن + PostgREST ← `jaryan-server-<نسخه>.jaryan`. |

## روی سرور (یک مراجعه)

```
sudo bash check.sh            # متن خروجی را برای Claude بفرستید
sudo bash jaryan-install.sh   # کلید اضطراری را آخر کار روی کاغذ بنویسید
```

اجرای دوباره‌ی نصب بی‌خطر است (داده و نسخه‌ها دست نمی‌خورند)؛ کلید فقط با `--reset-key` عوض می‌شود.
اگر نصب نیمه‌کاره بماند و کلید نشان داده نشده باشد، اجرای بعدی کلید تازه می‌سازد و نشان می‌دهد.

## لایه‌های محافظت

1. **برگشت خودکار**: پیش از هر نصب `pg_dump`؛ بعد از `hooks/activate` نشانی‌های `health`
   بسته ۹۰ ثانیه بررسی می‌شوند. خطای hook یا سالم نبودن ← نسخه‌ی قبلی + بازگردانی پایگاه داده
   (در پایگاه داده‌ی تازه، بعد جایگزینی — `pg_restore --clean` جدول‌های تازه را پاک نمی‌کند).
2. **`/update` مستقل**: هم از راه nginx (`https://IP/update/`) و هم **مستقیم** روی درگاه
   `8443` (اگر nginx خراب شد). ورود با کلید اضطراری (هش pbkdf2؛ ۵ اشتباه ← ۱۵ دقیقه قفل)،
   CSRF، کوکی HttpOnly/SameSite=Strict. روی درگاه مستقیم سرآیندهای `X-Real-IP` پذیرفته نمی‌شوند.
3. **روی خود سرور**: `sudo python3 /opt/jaryan/updater/jaryan_updater.py activate <نسخه>`.

## ساختار بسته‌ی به‌روزرسانی

`.jaryan` = tar ساده با `manifest.json` (`version`، `notes`، `health`، `sha256`)، `payload.tar.gz`
و `payload.sig` (امضای ed25519، اختیاری تا وقتی کلید عمومی در `/update ← امنیت` تنظیم نشده؛
بعد از آن اجباری). محتوای payload در `/opt/jaryan/releases/<نسخه>` باز و `current` به آن اشاره
می‌کند. `hooks/preinstall` و `hooks/activate` (bash، به‌عنوان root، باید **تکرارپذیر** باشند —
در برگشت دوباره اجرا می‌شوند، با `JARYAN_ROLLBACK=1`). nginx فایل‌های `nginx/*.conf` نسخه‌ی
فعال را include می‌کند؛ `/update` در پیکربندی پایه ثابت است و بسته نمی‌تواند جایش را بگیرد.

## بسته‌ی سرور (`core/`) — همه‌ی مرحله‌ها (۱ تا ۷ + سرور خارجی)

نسخه در `core/VERSION`، فهرست تغییرات (نشان داده در `/update`) در `core/NOTES`. هر بسته **همه‌چیز** را دارد
(نه فقط تغییرها). اجزای بزرگ (PostgREST، Deno، کتابخانه‌های پایتون برای 3.12/3.13/3.14) هر کدام tar.xz با sha
در `components.json`؛ `build_core.py --lite` بسته‌ی سبک بی‌اجزا می‌سازد که preinstall همان جزء را با همان sha از
نسخه‌ی فعال سرور برمی‌دارد (`services/components.py`؛ نسخه‌های کتابخانه‌ها در `core/pylib.lock`).

| بخش | سرویس / فایل | نشانی |
|---|---|---|
| پایگاه داده | `db/compat.sql` + همه‌ی `db/*.sql` مخزن با `services/migrate.py` (ثبت در `jaryan_meta.applied`) + `db/server.sql` | — |
| رابط برنامه | `jaryan-api` (PostgREST، کاربر jaryan) | `/rest/v1/` |
| فایل‌ها | `jaryan-storage` (`services/storage.py`): فایل روی `/var/lib/jaryan/files`، ردیف در `storage.objects`، مجوز = RLS با `set local role`؛ عمومی‌ها را nginx مستقیم می‌دهد (`41-storage-public.conf` ساختنی)، خصوصی‌ها با لینک امن (JWT) و `X-Accel-Redirect` | `/storage/v1/` |
| سایت | خروجی Vite همین مخزن با `SUPABASE_URL = location.origin`، کلید عمومی سرور (activate جایگزین می‌کند) و `SERVER_MODE = true` | `/design/ita-monitoring-prototype.html` |
| تابع‌ها | `jaryan-functions`: همان کد `supabase/functions` (translate، news-insights، extract-post-keywords) با `functions/main.ts` که `Deno.serve` را می‌گیرد؛ کلید لیارا در `/etc/jaryan/functions.env` | `/functions/v1/` |
| کارهای خودکار | `jaryan-jobs` (`services/jobs.py` + `jobs.json`): همان cronهای pg_cron، همان `scripts/*.py` با توکن کوتاه‌عمر `JARYAN_SERVICE_TOKEN` (رمز مدیر ذخیره نمی‌شود)؛ `run-job` (status/logs/health/اجرا) و `notify` با همان قالب تابع‌های Supabase؛ هشدار قرمز و گزارش روزانه با **پیامک** | `/functions/v1/run-job`، `/functions/v1/notify` |
| پیوند دو سرور | `services/link.py` در همان jaryan-jobs: خارجی هر ۵ دقیقه push به ایران (پاسخ = تأیید + فهرست منابع)، ایران در صورت لزوم pull + ack، صف یک‌هفته‌ای روی خارجی، «فایل داده» برای قطع کامل؛ HMAC با `/etc/jaryan/link.key`؛ ستون‌های هوش مصنوعی/پنهان ایران بازنویسی نمی‌شوند | `/link/v1/` |
| انتقال از Supabase | `services/transfer.py export/import`؛ برون‌بری از راه همان رابط‌ها با رمز مدیر (`.github/workflows/server-export.yml` یا مستقیم از /setup)؛ کدهای ملی با `migration_export_nids()` (migration_054)؛ فایل رمزنگاری‌شده با `EXPORT_PASSWORD`؛ ورود = پشتیبان، جایگزینی کامل در یک تراکنش، فایل‌ها، شمارنده‌ها، بازنویسی نشانی‌ها | `/setup` |
| دامنه | acme.sh (`vendor/`) با webroot، یا گواهی دستی؛ `jaryan-acme.timer` تمدید؛ بعد از دامنه http→https (map در `/etc/nginx/conf.d/jaryan-map.conf`) و بازنویسی نشانی‌ها | `/setup` |
| راه‌اندازی | `jaryan-setup` (`setup_page.py` + `setup_more.py`) | `/setup/` |

پیکربندی سرور: `/etc/jaryan/server.json` (نقش iran|foreign، نشانی عمومی، دامنه، پیوند)؛ رازها فقط در
`/etc/jaryan/secrets.json` (600)؛ `service.env` (640 root:jaryan) برای سرویس‌های غیر root. نقش سرور خارجی همان بسته
است با `role: foreign` (کارهای تلگرام/وب‌سایت/خزنده + ارسال؛ تلگرام از `/etc/jaryan/telegram.env`).

## مسیرها روی سرور

`/opt/jaryan/{releases,current,updater}`، `/var/lib/jaryan/{files,backups,updater}`،
`/etc/jaryan/tls`، گزارش نصب `/var/log/jaryan-install.log` (بدون کلید).
سرویس‌ها: `jaryan-updater.service`، `jaryan-backup.timer` (هر شب ۰۲:۳۰ تهران، ۱۴ تای آخر).

## آزمون

`python3 -m unittest discover -s tests/server` (بدون شبکه و پایگاه داده: نصب، دو نوع برگشت خودکار،
فایل دستکاری‌شده، امضا، برگشت دستی، ورود و قفل). نصب کامل و برگشت پایگاه داده روی Ubuntu 24.04
(با جایگزین systemctl) دستی آزموده شد.

**آزمون سرتاسری** (`.github/workflows/server-e2e.yml`، روی هر push به شاخه‌های claude/): روی Ubuntu 24.04
واقعی نصب پایه، ساخت بسته‌ی کامل، نصب از راه `/update`، `/setup` (رمز، پیامک، مدیر، ورود با رمز و کد پیامکی)،
جعل نشانی، فایل‌ها (عمومی/خصوصی/لینک امن/RLS)، سایت، تابع‌ها، اجرای دستی یک کار و گزارشش، هشدار، ورود دسته‌ی
امضاشده‌ی سرور خارجی، انتقال داده (برون‌بری و ورود رفت و برگشت روی همان سرور)، گواهی دستی و http→https،
راه‌اندازی دوباره‌ی سرویس‌ها، و بسته‌ی خراب با برگشت پایگاه داده — `tests/server/e2e_client.py`؛ بعد سایت با
Playwright برای مدیر و بیننده روی همان سرور (`tests/server/site_smoke.mjs`).
