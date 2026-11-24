// پس از ساخت: بررسی نشت (نشانی سامانه‌ی واقعی، گیت‌هاب، کد مدیریت، نام نهاد) و ساخت dist-demo.zip
import { readdirSync, readFileSync, statSync, rmSync } from 'node:fs';
import { resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'dist-demo');
const BANNED = [
  [/komqnapfqrtxxaytpcdt|supabase\.co/i, 'نشانی سوپابیس واقعی'],
  [/github|meghdad|vt42-qxr8/i, 'گیت‌هاب یا نام حساب/ریپو'],
  [/eyJhbGciOiJIUzI1Ni/, 'کلید anon واقعی'],
  [/اداره[‌ ]?ی? رصد و راهبری|حوزه[‌ ]?ی? علمیه[‌ ]?ی? خراسان|حرم مطهر رضوی، مرکز مدیریت|32008228/, 'نام، نشانی یا تلفن نهاد مسئول'],
  [/sourceMappingURL/, 'source map'],
  [/renderSystemStatus|renderSysTimeline|openChanEditor|downloadBackup|sms_config_set/, 'کد پنل مدیریت'],
];
const TEXT = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.php', '.txt', '.svg']);

function* walk(d) { for (const n of readdirSync(d)) { const f = resolve(d, n); if (statSync(f).isDirectory()) yield* walk(f); else yield f; } }
const problems = [];
let files = 0, bytes = 0;
for (const f of walk(OUT)) {
  files++; bytes += statSync(f).size;
  if (!TEXT.has(extname(f))) continue;
  const s = readFileSync(f, 'utf8');
  // کتابخانه‌های بیرونی (vendor) در سرآغاز مجوزشان نشانی گیت‌هاب خودشان را دارند — ربطی به این پروژه ندارد
  const vendor = relative(OUT, f).split(/[\\/]/)[0] === 'vendor';
  // داده‌ی واقعی (private/data.php) خبرهای عمومی درباره‌ی حوزه‌ی خراسان را دارد — قاعده‌ی نام نهاد فقط برای متن خودِ سایت
  const data = relative(OUT, f).split(/[\\/]/).join('/') === 'private/data.php';
  for (const [rx, what] of BANNED) if (!(vendor && /گیت‌هاب|source map/.test(what)) && !(data && /نهاد مسئول|کد پنل/.test(what)) && rx.test(s)) problems.push(`${relative(OUT, f)}: ${what}`);
}
if (problems.length) { console.error('نسخه‌ی نمایشی نشت دارد:\n' + problems.join('\n')); process.exit(1); }

const zip = resolve(ROOT, 'dist-demo.zip');
rmSync(zip, { force: true });
// zipfile پایتون: پوشه‌ها و نام‌ها همان‌طور (فایل‌های نقطه‌دار مثل .htaccess هم)
execFileSync('python', ['-I', '-c', `
import os, sys, zipfile
src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as z:
    for base, dirs, names in os.walk(src):
        for n in names:
            p = os.path.join(base, n)
            z.write(p, os.path.relpath(p, src).replace(os.sep, '/'))
`, OUT, zip]);
console.log(`بررسی نشت: سالم. ${files} فایل، ${(bytes / 1048576).toFixed(1)} مگ → ${relative(ROOT, zip)} (${(statSync(zip).size / 1048576).toFixed(1)} مگ)`);
