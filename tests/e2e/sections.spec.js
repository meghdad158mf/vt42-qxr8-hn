// هر بخش و تب سایت بدون خطا باز می‌شود — برای بیننده و مدیر، روی رایانه و گوشی.
// پایه‌ی اطمینان برای ماژولار کردن: بعد از هر جابه‌جایی کد، همین آزمون‌ها باید سبز بمانند.
import { test, expect, openAs } from './support/fixtures.js';

// همان فهرست تب‌های SITE_VIS_ITEMS سایت (+ صفحه‌ی نخست)
const VIEWER_ROUTES = [
  'dashboard',
  'overview/analytics', 'overview/claims', 'overview/study', 'overview/website',
  'overview/newspapers', 'overview/dossier', 'overview/newsletter',
  'people/orgs', 'people/figures', 'people/thinktanks', 'people/archive',
  'hawza/news', 'hawza/about',
  'posts/feed', 'posts/people',
  'schools',
  'positions/leader', 'positions/maraji', 'positions/hawza', 'positions/imams', 'positions/orgs',
  'reports',
];
const ADMIN_ROUTES = [
  'status', 'settings', 'users',
  'activity/views', 'activity/hidden', 'activity/audit',
  'uploads/magazines', 'uploads/archive', 'uploads/schools',
  'announce', 'export',
];

async function expectRoute(page, route) {
  const [s] = route.split('/');
  await expect(page.locator('#sec-' + s)).toHaveClass(/active/);
  // آدرس صفحه همون بخش/تب رو نشون بده (ناوبری و دکمه‌ی برگشت به این وابسته‌اند)
  if (route.includes('/')) await expect.poll(() => page.evaluate(() => location.hash)).toContain('#' + route);
  // بدون سرریز افقی (مهم برای گوشی)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'سرریز افقی در ' + route).toBeLessThanOrEqual(1);
  expect(page.appErrors, 'خطای صفحه در ' + route).toEqual([]);
}

for (const route of VIEWER_ROUTES) {
  test(`بیننده: ${route}`, async ({ page }) => {
    await openAs(page, 'viewer', route === 'dashboard' ? '' : route);
    await expectRoute(page, route);
  });
}

for (const route of [...VIEWER_ROUTES, ...ADMIN_ROUTES]) {
  test(`مدیر: ${route}`, async ({ page }) => {
    await openAs(page, 'admin', route === 'dashboard' ? '' : route);
    await expectRoute(page, route);
  });
}

test('بیننده به بخش مدیریت راه ندارد', async ({ page }) => {
  await openAs(page, 'viewer', 'settings');
  await expect(page.locator('#sec-settings')).not.toHaveClass(/active/);
  await expect(page.locator('#sec-dashboard')).toHaveClass(/active/);
});
