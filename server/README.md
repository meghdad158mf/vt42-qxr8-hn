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

## بسته‌ی سرور (`core/`) — مرحله‌ی ۱: پایگاه داده و ورود

نسخه در `core/VERSION`، فهرست تغییرات (نشان داده در `/update`) در `core/NOTES`. هر بسته **همه‌چیز**
را دارد (نه فقط تغییرها)، پس هر بسته‌ی تازه جای قبلی‌ها را می‌گیرد.

- `db/compat.sql`: آنچه Supabase خودش داشت و migrationها فرض می‌کنند — نقش‌های `anon`،
  `authenticated`، `service_role`، `authenticator`؛ schemaی `extensions` با pgcrypto و
  تابع‌های pgjwt (`sign`/`verify`)؛ schemaی `storage` (`buckets`/`objects`)؛ جانشین **pg_net**
  (`net.http_post` در صف + `net._http_response`) و **pg_cron** (`cron.schedule` فقط ثبت می‌کند؛
  زمان‌بند واقعی در مرحله‌ی ۵). هر بار نصب اجرا می‌شود و باید تکرارپذیر بماند.
- `services/migrate.py`: `schema.sql` و `migration_*.sql` مخزن را به ترتیب، هر کدام یک‌بار در یک
  تراکنش، اجرا و در `jaryan_meta.applied` ثبت می‌کند (سه `create extension` نبودنی برداشته
  می‌شوند؛ رمزهای اولیه‌ی schema.sql تصادفی‌اند). بعد `db/server.sql` و هماهنگ‌سازی: رمز JWT
  و رمز `authenticator` همیشه از `/etc/jaryan/secrets.json` (600، تنها منبع؛ کلید عمومی سایت
  `anon_key` هم همان‌جا) و `/etc/jaryan/postgrest.conf`. **migration تازه‌ی مخزن = خودکار در
  بسته‌ی بعدی.**
- `bin/postgrest` (v12.2.12، sha256 ثابت در `build_core.py`) = سرویس `jaryan-api` روی
  127.0.0.1:3000 (+ 3001 برای `/ready`)، از راه nginx با همان نشانی Supabase: `/rest/v1/`.
  nginx سرآیندهای `X-Real-IP`/`X-Forwarded-For`/`CF-Connecting-IP` را بازنویسی می‌کند تا
  قفل ورود و سقف پیامک با نشانی جعلی دور زده نشود.
- `services/net_worker.py` = `jaryan-net` (کاربر postgres): صف `net.http_request_queue` را
  می‌فرستد، **فقط** به میزبان‌های `services/net_allow.txt` (الان ملی‌پیامک) یا
  `/etc/jaryan/net-allow.txt`؛ بقیه «blocked» ثبت می‌شوند.
- `services/setup_page.py` = `jaryan-setup` ← `https://IP/setup/` (فقط https، ورود با همان کلید
  اضطراری): وضعیت، رمز مدیر/بیننده، پیامک، مدیران (نام + موبایل + کد ملی)، آزمون ورود با رمز و
  با پیامک از همان راه سایت. تا سایت روی سرور نیامده تنها راه ساختن نخستین مدیر است.
- `hooks/preinstall` (پیش‌نیازها + `migrate.py apply`) و `hooks/activate` (systemd، nginx، انتظار
  برای `/ready`). سلامت: `/rest/v1/` و `/setup/health` (۵۰۳ اگر پایگاه داده یا رابط برنامه نباشد).

## مسیرها روی سرور

`/opt/jaryan/{releases,current,updater}`، `/var/lib/jaryan/{files,backups,updater}`،
`/etc/jaryan/tls`، گزارش نصب `/var/log/jaryan-install.log` (بدون کلید).
سرویس‌ها: `jaryan-updater.service`، `jaryan-backup.timer` (هر شب ۰۲:۳۰ تهران، ۱۴ تای آخر).

## آزمون

`python3 -m unittest discover -s tests/server` (بدون شبکه و پایگاه داده: نصب، دو نوع برگشت خودکار،
فایل دستکاری‌شده، امضا، برگشت دستی، ورود و قفل). نصب کامل و برگشت پایگاه داده روی Ubuntu 24.04
(با جایگزین systemctl) دستی آزموده شد.

**آزمون سرتاسری** (`.github/workflows/server-e2e.yml`، روی هر push به شاخه‌های claude/ که `server/`،
`db/` یا `tests/server/` را عوض کند): روی Ubuntu 24.04 واقعی نصب پایه، ساخت بسته، بارگذاری و
نصب از راه `/update`، `/setup` (رمز، پیامک، مدیر، ورود با رمز و با کد پیامکی)، جعل نشانی، راه‌اندازی
دوباره‌ی سرویس‌ها، و نصب بسته‌ی خراب (`tests/server/make_broken.sh`) که باید با بازگردانی پایگاه
داده برگردد — `tests/server/e2e_client.py`.
