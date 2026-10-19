// fixture مشترک آزمون‌ها: سوپابیس ساختگی، جمع‌کردن خطاهای صفحه، و ورود بدون فرم
import { test as base, expect } from '@playwright/test';
import { mockSupabase } from './mock-supabase.js';

export const APP_PATH = process.env.APP_PATH || '/ita-monitoring-prototype.html';

// پیام‌هایی که خطای واقعی برنامه نیستن (مثلاً پاسخ ۴۰۱ عمدیِ آزمون رمز اشتباه)
const IGNORED = [/Failed to load resource: the server responded with a status of 4\d\d/];

export const test = base.extend({
  // هر آزمون می‌تونه با test.use({ siteSettings: [...] }) تنظیمات سایت رو عوض کنه
  siteSettings: [[], { option: true }],

  page: async ({ page, context, siteSettings }, use) => {
    await mockSupabase(context, { settings: siteSettings });
    // پنجره‌ی معرفی و کارت نصب جلوی کلیک‌ها رو نگیرن
    await context.addInitScript(() => {
      try {
        localStorage.setItem('jarian_intro_seen', '1');
        localStorage.setItem('jarian_install_dismissed', '1');
      } catch (e) { /* storage در دسترس نیست */ }
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !IGNORED.some((rx) => rx.test(m.text()))) errors.push('console: ' + m.text());
    });
    page.appErrors = errors;
    await use(page);
  },
});

// ورود مستقیم با نشست ذخیره‌شده (مثل رفرش با نشست معتبر) و رفتن به یک بخش/تب
export async function openAs(page, role, hash = '') {
  await page.goto(APP_PATH);
  await page.evaluate((r) => {
    sessionStorage.setItem('jarian_token', 'x.eyJ9.x');
    sessionStorage.setItem('jarian_role', r === 'admin' ? 'app_admin' : 'app_viewer');
  }, role);
  await page.goto(APP_PATH + (hash ? '#' + hash : ''));
  await page.reload();
  await expect(page.locator('#view-dash')).toHaveClass(/active/);
  await expect(page.locator('body')).not.toHaveClass(/app-loading/);
}

export { expect };
