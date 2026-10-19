// ساخت سایت برای انتشار. خروجی dist/ همان ساختار آدرس‌های فعلی GitHub Pages را دارد:
//   dist/design/ita-monitoring-prototype.html  (آدرس سایت عوض نمی‌شود)
//   dist/brand-kit/، dist/feature-kit/          (لینک‌های دانلود بسته‌ها)
import { defineConfig } from 'vite';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname);
// فایل‌هایی که جاوااسکریپت با رشته‌ی ثابت صدا می‌زند (vendor/chart.min.js، images/domain-icon-*.webp…)
// یا سرویس‌ورکر با نام ثابت پیش‌بارگذاری می‌کند → عیناً و با همان نام کپی می‌شوند
const VERBATIM = ['images', 'icons', 'fonts', 'vendor', 'manifest.webmanifest', 'sw.js'];
const KITS = ['brand-kit', 'feature-kit'];

function copyStatic() {
  return {
    name: 'jarian-copy-static',
    closeBundle() {
      const out = resolve(ROOT, 'dist');
      for (const f of VERBATIM) cpSync(resolve(ROOT, 'design', f), resolve(out, 'design', f), { recursive: true });
      for (const k of KITS) {
        cpSync(resolve(ROOT, k), resolve(out, k), { recursive: true, filter: (src) => !src.includes('/tools') });
      }
      // GitHub Pages: بدون پردازش Jekyll
      cpSync(resolve(ROOT, '.nojekyll'), resolve(out, '.nojekyll'));
    },
  };
}

export default defineConfig({
  root: resolve(ROOT, 'design'),
  base: './',
  publicDir: false,
  build: {
    outDir: resolve(ROOT, 'dist/design'),
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: { input: resolve(ROOT, 'design/ita-monitoring-prototype.html') },
  },
  plugins: [copyStatic()],
});
