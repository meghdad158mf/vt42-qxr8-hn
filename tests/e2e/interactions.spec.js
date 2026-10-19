// چند کار رایج کاربر: منوی بخش‌ها، جابه‌جایی تب، جست‌وجو، صفحه‌بندی، دکمه‌ی برگشت
import { test, expect, openAs } from './support/fixtures.js';

test('منوی «بخش‌ها» به اخبار و رویدادها می‌برد', async ({ page }) => {
  await openAs(page, 'viewer');
  await page.locator('#nav-menu-btn, [aria-controls="nav-menu"]').first().click();
  await page.locator('#nav-menu [data-nav="overview/analytics"]').first().click();
  await expect(page.locator('#sec-overview')).toHaveClass(/active/);
  expect(page.appErrors).toEqual([]);
});

test('تب‌ها و دکمه‌ی برگشت مرورگر', async ({ page }) => {
  await openAs(page, 'viewer', 'overview/analytics');
  await page.click('#news-tab-website');
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('#overview/website');
  await page.goBack();
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('#overview/analytics');
  expect(page.appErrors).toEqual([]);
});

test('جست‌وجوی اخبار نتیجه‌ها را کم می‌کند', async ({ page }) => {
  await openAs(page, 'viewer', 'overview/study');
  const cards = page.locator('#sec-overview .news-card:visible');
  await expect(cards.first()).toBeVisible();
  const search = page.locator('#news-search-input');
  // روی گوشی فیلترها پشت دکمه‌ی «فیلترها» جمع شده‌اند
  if (!(await search.isVisible())) await page.locator('#sec-overview .m-filter-btn:visible').first().click();
  await search.fill('غزه');
  await expect.poll(async () => {
    const texts = await cards.allInnerTexts();
    return texts.length > 0 && texts.every((t) => t.includes('غزه'));
  }).toBe(true);
  expect(page.appErrors).toEqual([]);
});

test('صفحه‌بندی فید کنشگری مجازی', async ({ page }) => {
  await openAs(page, 'viewer', 'posts/feed');
  const next = page.locator('#sec-posts .pagination button, #sec-posts [class*="pagination"] button').filter({ hasText: '۲' }).first();
  if (await next.count()) {
    await next.click();
    await expect(page.locator('#sec-posts')).toHaveClass(/active/);
  }
  expect(page.appErrors).toEqual([]);
});

test('گالری یادداشت‌ها: باز کردن فید یک چهره', async ({ page }) => {
  await openAs(page, 'viewer', 'people/figures');
  const logo = page.locator('#sec-people .pf-logo-grid > *').first();
  await expect(logo).toBeVisible();
  await logo.click();
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/#people\/figures\/\d+/);
  expect(page.appErrors).toEqual([]);
});

test('خروج از حساب به صفحه‌ی ورود برمی‌گرداند', async ({ page }) => {
  await openAs(page, 'viewer');
  await page.evaluate(() => window.logout());
  await expect(page.locator('#view-login')).toHaveClass(/active/);
  expect(await page.evaluate(() => sessionStorage.getItem('jarian_token'))).toBeNull();
});
