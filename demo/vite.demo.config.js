// ساخت نسخه‌ی نمایشی (فقط نمای بیننده، داده‌ی ساختگی، ورود با رمز نمایشی):
//   npm run demo:build   →   dist-demo/  و  dist-demo.zip
// همان کد سایت اصلی ساخته می‌شود؛ تفاوت‌ها فقط در همین فایل‌اند:
//   • core/config.js → demo/src/config.demo.js (بدون نشانی و کلید سامانه‌ی واقعی)
//   • admin/admin.js → ماژول خالی (کد پنل مدیریت اصلاً در خروجی نیست)
//   • پیش از برنامه demo/src/shim.js اجرا می‌شود (پاسخ به درخواست‌ها از داده‌ی نمایشی)
//   • متن‌هایی که نام نهاد مسئول را دارند و همه‌ی توضیحات HTML برداشته می‌شوند
import { defineConfig } from 'vite';
import { cpSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(import.meta.dirname, '..');
const DEMO = resolve(ROOT, 'demo');
const OUT = resolve(ROOT, 'dist-demo');
const REAL_CONFIG = resolve(ROOT, 'design/src/core/config.js');
const REAL_ADMIN = resolve(ROOT, 'design/src/admin/admin.js');

// [پیدا کن، جایگزین کن] — اگر متنی پیدا نشد ساخت متوقف می‌شود تا تغییر سایت اصلی بی‌صدا از قلم نیفتد
const HTML_EDITS = [
  ['<title>سامانه هوشمند جریان | رصد و تحلیل فضای سیاسی‌اجتماعی</title>', '<title>سامانه هوشمند جریان | نسخه‌ی نمایشی</title>'],
  ['<p>اداره‌ی رصد و راهبری سیاسی‌اجتماعی حوزه‌ی علمیه‌ی خراسان</p>', '<p>رصد و تحلیل فضای سیاسی‌اجتماعی — نسخه‌ی نمایشی</p>'],
  ['<p class="login-lede">کد ملی خود را وارد کنید؛ کد ورود پیامک می‌شود.</p>', '<p class="login-lede">رمز ورود نسخه‌ی نمایشی را وارد کنید. در نسخه‌ی اصلی، ورود با کد ملی و رمز یک‌بارمصرف پیامکی انجام می‌شود.</p>'],
  ['<form id="otp-form" autocomplete="off">', '<form id="otp-form" autocomplete="off" hidden>'],
  ['<form id="login-form" autocomplete="on" hidden>', '<form id="login-form" autocomplete="on">'],
  ['placeholder="رمز عبور را وارد کنید" style="padding-left:40px;"', 'placeholder="رمز ورود نمایشی" style="padding-left:40px;"'],
  ['<h2>به روایت حوزه علمیه خراسان</h2>', '<h2>به روایت حوزه علمیه</h2>'],
  ['جریان سامانه‌ی رصد و تحلیل فضای سیاسی‌اجتماعی <b>اداره‌ی رصد و راهبری سیاسی‌اجتماعی حوزه‌ی علمیه‌ی خراسان</b> است.', 'جریان سامانه‌ی رصد و تحلیل فضای سیاسی‌اجتماعی است. <b>این نسخه نمایشی است: نمونه‌ای از داده‌ها، بدون اتصال به سامانه‌ی اصلی.</b>'],
  ['و تحلیل‌های دوره‌ای اداره در', 'و تحلیل‌های دوره‌ای در'],
  [/<div class="app-footer-org">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/footer>/, `<div class="app-footer-org">
          <div class="afo-item"><b>نسخه‌ی نمایشی</b><span>داده‌های این نسخه یک نمونه‌ی ثابت‌اند و به سامانه‌ی اصلی متصل نیستند.</span></div>
          <div class="afo-item"><b>نسخه‌ی اصلی</b><span>جمع‌آوری خودکار از ایتا، تلگرام، بله، سایت‌های خبری و روزنامه‌ها، همراه با تحلیل هوش مصنوعی و پنل مدیریت.</span></div>
        </div>
      </div>
    </footer>`],
  ['<script type="module" src="src/main.js"></script>', '<script type="module" src="/@demo-entry"></script>'],
  // برچسب «نسخه‌ی نمایشی» پایین ستون کناری (نه نوار بالای صفحه — خواست کاربر: جای مطالب جابه‌جا نشود)
  ['<div class="sn-bottom">', `<div class="demo-note" role="note"><b>نسخه‌ی نمایشی</b><span>نمونه‌ای از داده‌ها، بدون اتصال به سامانه‌ی اصلی</span></div>
    <div class="sn-bottom">`],
  ['</head>', `<style>
.demo-note{margin:auto 14px 10px;padding:8px 12px;border:1px solid rgba(234,179,147,.45);border-radius:10px;color:#EAB393;font:500 12px/1.7 IRANSansX,Tahoma,sans-serif}.demo-note b{display:block;font-weight:800}.demo-note span{color:rgba(255,255,255,.6)}
#demo-toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);opacity:0;pointer-events:none;z-index:300;background:#16202a;color:#fff;font:500 13px/1.6 IRANSansX,Tahoma,sans-serif;padding:10px 18px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.25);transition:.25s}
#demo-toast.show{opacity:1;transform:translate(-50%,0)}
</style>
</head>`],
];

function applyEdits(html) {
  for (const [find, rep] of HTML_EDITS) {
    const hit = typeof find === 'string' ? html.includes(find) : find.test(html);
    if (!hit) throw new Error('نسخه‌ی نمایشی: این متن در صفحه پیدا نشد — demo/vite.demo.config.js را به‌روز کنید:\n' + String(find).slice(0, 120));
    html = html.replace(find, rep);
  }
  // توضیحات داخلی HTML (تاریخچه‌ی تصمیم‌ها، نام پوشه‌ها…) در نسخه‌ی نمایشی نمی‌آیند
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

function demoPlugin() {
  return {
    name: 'jarian-demo',
    enforce: 'pre',
    async resolveId(id, importer, opts) {
      if (id === '/@demo-entry') return resolve(DEMO, 'src/entry.js');
      if (!importer) return null;
      const r = await this.resolve(id, importer, { ...opts, skipSelf: true });
      if (!r) return null;
      const file = r.id.replace(/\\/g, '/');
      if (file === REAL_CONFIG.replace(/\\/g, '/') && !importer.replace(/\\/g, '/').endsWith('demo/src/config.demo.js')) return resolve(DEMO, 'src/config.demo.js');
      if (file === REAL_ADMIN.replace(/\\/g, '/')) return resolve(DEMO, 'src/admin-stub.js');
      return null;
    },
    transformIndexHtml: { order: 'pre', handler: applyEdits },
    closeBundle() {
      // صفحه با نام index.html (آدرس ریشه‌ی دامنه)
      renameSync(resolve(OUT, 'ita-monitoring-prototype.html'), resolve(OUT, 'index.html'));
      for (const f of ['images', 'icons', 'fonts', 'vendor']) cpSync(resolve(ROOT, 'design', f), resolve(OUT, f), { recursive: true });
      const man = JSON.parse(readFileSync(resolve(ROOT, 'design/manifest.webmanifest'), 'utf8'));
      Object.assign(man, { description: 'رصد و تحلیل فضای سیاسی‌اجتماعی — نسخه‌ی نمایشی', id: './', start_url: './' });
      writeFileSync(resolve(OUT, 'manifest.webmanifest'), JSON.stringify(man, null, 2));
      // داده و تصویرهای ساخته‌شده (demo:data / demo:media) + فایل‌های سرور (PHP)
      const build = resolve(DEMO, 'build');
      if (!existsSync(resolve(build, 'data.json'))) throw new Error('اول npm run demo:data را اجرا کنید');
      if (existsSync(resolve(build, 'media'))) cpSync(resolve(build, 'media'), resolve(OUT, 'media'), { recursive: true });
      if (existsSync(resolve(build, 'sb'))) cpSync(resolve(build, 'sb'), resolve(OUT, 'sb'), { recursive: true });
      // عکس فوری داده‌ی واقعی (npm run demo:fetch) — فقط وقتی داده‌ی ساخته‌شده از آن است
      const real = resolve(build, 'real');
      if (existsSync(resolve(build, 'mode.txt')) && readFileSync(resolve(build, 'mode.txt'), 'utf8') === 'real') {
        for (const d of ['media', 'sb']) if (existsSync(resolve(real, d))) cpSync(resolve(real, d), resolve(OUT, d), { recursive: true });
      }
      cpSync(resolve(DEMO, 'server'), OUT, { recursive: true });
      // فایل‌های خصوصی با «<?php exit; ?>» شروع می‌شوند تا مستقیم خوانده نشوند (api.php سطر اول را رد می‌کند)
      const GUARD = '<?php http_response_code(404); exit; ?>\n';
      mkdirSync(resolve(OUT, 'private'), { recursive: true });
      // داده از پیش فشرده (gzip ۹) تا سرور هر بار فشرده‌سازی نکند (۶.۱.۵ — دمو روی هاست کُند بود)
      writeFileSync(resolve(OUT, 'private/data.php'), Buffer.concat([Buffer.from(GUARD), gzipSync(readFileSync(resolve(build, 'data.json')), { level: 9 })]));
      const codes = resolve(DEMO, '.local/codes.json');
      if (!existsSync(codes)) throw new Error('رمزها ساخته نشده‌اند: npm run demo:codes');
      writeFileSync(resolve(OUT, 'private/codes.php'), GUARD + readFileSync(codes, 'utf8'));
    },
  };
}

export default defineConfig({
  root: resolve(ROOT, 'design'),
  base: './',
  publicDir: false,
  logLevel: 'warn',
  build: {
    outDir: OUT,
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: { input: resolve(ROOT, 'design/ita-monitoring-prototype.html') },
  },
  plugins: [demoPlugin()],
});

export { applyEdits, rmSync };
