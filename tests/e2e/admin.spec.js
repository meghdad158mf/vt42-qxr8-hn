// کارهای اصلی بخش مدیریت (design/src/admin — مرحله‌ی ۸): هر کار با داده‌ی ساختگی و درخواستی که به سرور
// می‌فرسته. پشتوانه‌ی جدا شدن بسته‌ی مدیریت (۸ب): این‌ها باید بعد از بار شدنِ جدای کد مدیر هم کار کنن.
import { test, expect, openAs } from './support/fixtures.js';

const isReq = (path, method) => (r) => r.url().includes('/rest/v1/' + path) && r.method() === method;
// کادرهای تاشوی تنظیمات یکی‌یکی باز می‌شن (باز شدن یکی بقیه رو می‌بنده)
const openPanelOf = (page, sel) => page.locator(sel).evaluate((el) => { el.closest('details').open = true; });
const confirmIfAsked = async (page) => {
  const ok = page.locator('#ui-confirm-modal.active #ui-confirm-ok');
  await ok.waitFor({ timeout: 3000 }).then(() => ok.click(), () => {});
};

test('مدیریت منابع: ویرایش منبع و ذخیره', async ({ page }) => {
  await openAs(page, 'admin', 'settings');
  await openPanelOf(page, '#chan-list');
  await page.locator('#chan-list .chan-item .chan-item-name').first().click();
  await expect(page.locator('#chan-editor-modal')).toHaveClass(/active/);
  await page.locator('#ce-name').fill('منبع ویرایش‌شده');
  const req = page.waitForRequest(isReq('channels?id=eq.', 'PATCH'));
  await page.locator('#ce-save-btn').click();
  await confirmIfAsked(page);
  expect(JSON.parse((await req).postData()).title).toBe('منبع ویرایش‌شده');
  expect(page.appErrors).toEqual([]);
});

test('کاربران: افزودن کاربر', async ({ page }) => {
  await openAs(page, 'admin', 'users');
  await page.getByRole('button', { name: /افزودن کاربر/ }).click();
  await expect(page.locator('#usr-editor')).toBeVisible();
  await page.locator('#usr-name').fill('کاربر تازه');
  await page.locator('#usr-phone').fill('09131234567');
  const [req] = await Promise.all([page.waitForRequest(isReq('app_users', 'POST')), page.locator('#usr-save').click()]);
  const body = JSON.parse(req.postData());
  expect(body.full_name).toBe('کاربر تازه');
  expect(body.phone).toBe('09131234567');
  expect(page.appErrors).toEqual([]);
});

test('درج اطلاعیه: پیش‌نمایش و انتشار', async ({ page }) => {
  await openAs(page, 'admin', 'announce');
  await page.locator('#ann-msg').fill('جلسه‌ی هماهنگی فردا ساعت ۹');
  await expect(page.locator('#ann-preview')).toContainText('جلسه‌ی هماهنگی');
  const [req] = await Promise.all([page.waitForRequest(isReq('announcements', 'POST')), page.locator('#ann-publish').click()]);
  expect(JSON.parse(req.postData()).message).toBe('جلسه‌ی هماهنگی فردا ساعت ۹');
  expect(page.appErrors).toEqual([]);
});

test('نمایش سایت: روشن کردن حالت تعمیر بعد از تأیید', async ({ page }) => {
  await openAs(page, 'admin', 'settings');
  await openPanelOf(page, '#ss-maint-on');
  await page.locator('#ss-maint-on').check();
  const req = page.waitForRequest(isReq('site_settings', 'PATCH'));
  await page.locator('#ss-maint-save').click();
  await confirmIfAsked(page);
  expect(JSON.parse((await req).postData()).value.on).toBe(true);
  expect(page.appErrors).toEqual([]);
});

test('وضعیت سامانه: «اجرای دستی» یک کار', async ({ page }) => {
  await openAs(page, 'admin', 'status');
  const btn = page.locator('.sys-run-btn[data-job]').first();
  const job = await btn.getAttribute('data-job');
  const req = page.waitForRequest((r) => r.url().includes('/functions/v1/run-job') && (r.postData() || '').includes('"job":"' + job + '"'));
  await btn.click();
  await confirmIfAsked(page);
  await req;
  expect(page.appErrors).toEqual([]);
});

test('مدیر: پنهان کردن پست از فید اخبار', async ({ page }) => {
  await openAs(page, 'admin', 'overview/study');
  const btn = page.locator('#news-feed').getByRole('button', { name: 'پنهان کردن' }).first();
  const req = page.waitForRequest(isReq('posts?id=eq.', 'PATCH'));
  await btn.click();
  await confirmIfAsked(page);
  expect(JSON.parse((await req).postData()).hidden_at).toBeTruthy();
  expect(page.appErrors).toEqual([]);
});

test.describe('گزارش فعالیت', () => {
  test.use({ mockPatch: { apply(data) { data.posts[0].hidden_at = new Date().toISOString(); } } });
  test('بازگرداندن پست پنهان‌شده', async ({ page }) => {
    await openAs(page, 'admin', 'activity/hidden');
    const [req] = await Promise.all([
      page.waitForRequest(isReq('posts?id=eq.', 'PATCH')),
      page.getByRole('button', { name: 'بازگرداندن' }).first().click(),
    ]);
    expect(JSON.parse(req.postData()).hidden_at).toBeNull();
    expect(page.appErrors).toEqual([]);
  });
});

test('خروجی محتوا: دانلود فایل پست‌ها', async ({ page }) => {
  await openAs(page, 'admin', 'export');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#export-posts-btn').click()]);
  expect(dl.suggestedFilename()).toMatch(/^jarian-posts-/);
  expect(page.appErrors).toEqual([]);
});

test('بارگذاری محتوا: کارت‌های انتخاب نوع محتوا', async ({ page }) => {
  await openAs(page, 'admin', 'uploads/magazines');
  await page.locator('.upl-choice').nth(2).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#uploads/schools');
  await expect(page.locator('#upl-pane-schools')).toBeVisible();
  await expect(page.locator('#upl-pane-magazines')).toBeHidden();
  expect(page.appErrors).toEqual([]);
});
