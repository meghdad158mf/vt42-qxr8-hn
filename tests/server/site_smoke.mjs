// آزمون دود سایت روی سرور واقعی (بعد از e2e_client.py): سایت با داده‌ی واقعی رابط برنامه، برای مدیر و بیننده.
// خطای صفحه (pageerror) یا پاسخ ۵xx از رابط برنامه/فایل‌ها = شکست؛ بقیه فقط گزارش می‌شوند.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const tokens = JSON.parse(readFileSync('/tmp/e2e-tokens.json', 'utf8'));
const BASE = 'http://127.0.0.1/design/ita-monitoring-prototype.html';
const SECTIONS = ['dashboard', 'overview', 'overview/claims', 'overview/website', 'overview/newspapers', 'posts', 'people',
  'positions', 'hawza', 'hawza/about', 'schools', 'reports'];
const ADMIN = ['status', 'settings', 'users', 'uploads', 'activity', 'announce', 'export'];
let fails = 0;
const browser = await chromium.launch();
for (const [role, tok] of [['app_admin', tokens.admin], ['app_viewer', tokens.viewer]]) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => { errs.push('pageerror: ' + e.message); });
  page.on('console', m => { if (m.type() === 'error') console.log(`  [${role}] console: ${m.text().slice(0, 200)}`); });
  page.on('response', r => {
    const u = r.url();
    if (r.status() >= 500 && /\/(rest|storage)\/v1\//.test(u)) errs.push(`${r.status()} ${u.slice(0, 160)}`);
    else if (r.status() >= 400) console.log(`  [${role}] ${r.status()} ${u.slice(0, 160)}`);
  });
  await page.goto(BASE);
  await page.evaluate(([t, r]) => {
    sessionStorage.setItem('jarian_token', t); sessionStorage.setItem('jarian_role', r);
    localStorage.setItem('jarian_intro_seen', '1');
  }, [tok, role]);
  for (const s of SECTIONS.concat(role === 'app_admin' ? ADMIN : [])) {
    await page.goto(BASE + '#' + s);
    await page.reload();
    try {
      await page.waitForSelector('#view-dash', { state: 'visible', timeout: 20000 });
      await page.waitForFunction(() => !document.body.classList.contains('app-loading'), null, { timeout: 25000 });
      await page.waitForTimeout(1500);
      console.log(`  ✔ [${role}] #${s}`);
    } catch (e) {
      errs.push(`#${s}: ${e.message.split('\n')[0]}`);
    }
  }
  if (errs.length) { fails += errs.length; console.log(`  ✘ [${role}]\n    ` + errs.join('\n    ')); }
  await ctx.close();
}
await browser.close();
console.log(fails ? `ناموفق: ${fails}` : 'سایت روی سرور: سبز');
process.exit(fails ? 1 : 0);
