# ابزارهای ماژولار کردن فرانت‌اند

اسکریپت‌های کمکی مرحله‌های ۳ به بعدِ تقسیم `design/src/app.js` به ماژول‌ها (CLAUDE.md، «آزمون‌های خودکار و ماژولار کردن»).
همه با `node tools/modularize/<نام>.cjs` از ریشه‌ی ریپو، بعد از `npm install`.

| فایل | کار |
|---|---|
| `deps.cjs نام۱ نام۲…` | هر نام سطح بالای app.js به کدام نام‌های دیگر وابسته است؛ با `USERS=1` چه کسانی از آن استفاده می‌کنند |
| `stmts.cjs نام۱…` | دستورهای سطح بالا (listenerها و…) که به این نام‌ها اشاره می‌کنند، با شماره‌ی خط |
| `move.cjs spec.cjs` | جابه‌جایی عینِ متن تعریف‌ها (با کامنت‌های چسبیده‌ی بالا) به فایل‌های تازه با `export`؛ دستورها در `setupX()` جمع می‌شوند و به جای اولی‌شان در app.js یک فراخوانی می‌نشیند (نمونه‌ی spec در تاریخچه‌ی گیت مرحله‌ی ۵) |
| `fiximports.cjs` | نام‌های تعریف‌نشده‌ی هر فایل (ESLint `no-undef`) را از ماژولی که export می‌کند import می‌کند؛ تابع‌های app.js را export و «ارجاع موقت» می‌کند |
| `retarget.cjs` | نام‌هایی که از app.js import شده‌اند ولی دیگر آنجا نیستند (جابه‌جا شده‌اند) را از ماژول تازه‌شان import می‌کند |
| `merge-imports.cjs` | چند خط import از یک ماژول را یکی می‌کند |
| `prune.cjs` | نام‌های import‌شده‌ی بی‌استفاده را حذف می‌کند |
| `handlers.cjs` | فهرست تابع‌هایی که `onclick`های HTML و رشته‌های app.js صدا می‌زنند (برای پل موقت `Object.assign(window, …)`) |

ترتیب معمول: `deps`/`stmts` برای تعیین گروه ← spec ← `move` ← ویرایش دستی (setter، hook، listener به‌جای onclick) ← `fiximports` ← `retarget` ← `merge-imports` ← `prune` ← به‌روزکردن پل `Object.assign(window, …)` با خروجی `handlers`.

بعد از هر جابه‌جایی: `npm run lint`، `npm run test:unit`، `npm test` و `npm run build && npm run test:dist`، و مقایسه‌ی پیکسلی با نسخه‌ی زنده.
