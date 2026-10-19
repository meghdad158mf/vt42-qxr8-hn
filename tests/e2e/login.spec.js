// صفحه‌ی ورود: کد ملی + پیامک برای بیننده، انتخاب روش برای مدیر، پیوند اضطراری
import { test, expect, APP_PATH } from './support/fixtures.js';
import { TEST_NID, TEST_ADMIN_PASSWORD } from './support/mock-supabase.js';

test('بیننده با کد ملی و کد پیامکی وارد می‌شود', async ({ page }) => {
  await page.goto(APP_PATH);
  await expect(page.locator('#otp-form')).toBeVisible();
  await expect(page.locator('#login-mode-switch')).toBeHidden();

  await page.fill('#otp-nid', TEST_NID.viewer);
  await page.click('#otp-btn');
  await expect(page.locator('#otp-sent')).toContainText('۴۵۶۷');

  await page.fill('#otp-code', '11111');
  await page.click('#otp-btn');
  await expect(page.locator('#login-error')).toBeVisible();

  await page.fill('#otp-code', '12345');
  await page.click('#otp-btn');
  await expect(page.locator('#view-dash')).toHaveClass(/active/);
  expect(await page.evaluate(() => sessionStorage.getItem('jarian_role'))).toBe('app_viewer');
  expect(page.appErrors).toEqual([]);
});

test('کد ملی نامعتبر پیش از ارسال رد می‌شود', async ({ page }) => {
  await page.goto(APP_PATH);
  await page.fill('#otp-nid', '0013542418');
  await page.click('#otp-btn');
  await expect(page.locator('#login-error')).toContainText('معتبر نیست');
  await expect(page.locator('#otp-step-code')).toBeHidden();
});

test('مدیر بعد از کد ملی روش ورود را انتخاب می‌کند و با رمز وارد می‌شود', async ({ page }) => {
  await page.goto(APP_PATH);
  await page.fill('#otp-nid', TEST_NID.admin);
  await page.click('#otp-btn');
  await expect(page.locator('#otp-step-choose')).toBeVisible();
  await expect(page.locator('#otp-btn')).toBeHidden();

  await page.getByRole('button', { name: 'ورود با رمز عبور' }).click();
  await page.fill('#otp-pass', 'wrong');
  await page.click('#otp-btn');
  await expect(page.locator('#login-error')).toContainText('اشتباه');

  await page.fill('#otp-pass', TEST_ADMIN_PASSWORD);
  await page.click('#otp-btn');
  await expect(page.locator('#view-dash')).toHaveClass(/active/);
  expect(await page.evaluate(() => sessionStorage.getItem('jarian_role'))).toBe('app_admin');
  await expect(page.locator('body')).toHaveClass(/is-admin/);
});

test('مدیر می‌تواند کد پیامکی هم بگیرد', async ({ page }) => {
  await page.goto(APP_PATH);
  await page.fill('#otp-nid', TEST_NID.admin);
  await page.click('#otp-btn');
  await page.click('#otp-choose-sms');
  await expect(page.locator('#otp-step-code')).toBeVisible();
});

test.describe('ورود اضطراری روشن', () => {
  test.use({ siteSettings: [{ key: 'viewer_password_login', value: true }] });
  test('پیوند «ورود با رمز مشترک» دیده می‌شود', async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#login-mode-switch')).toBeVisible();
    await page.click('#login-mode-switch');
    await expect(page.locator('#login-form')).toBeVisible();
  });
});
