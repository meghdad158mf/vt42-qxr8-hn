// اجزای رابط (design/src/ui، مرحله‌ی ۴): منوها، پنجره‌ها، نمایشگر سند، فیلترهای گوشی، «بالای صفحه»
import { test, expect, openAs } from './support/fixtures.js';

const sectionOf = (page) => page.evaluate(() => (document.querySelector('.section.active') || {}).id);

test('منوی بخش‌ها: هر گزینه به بخش و تب خودش می‌برد و منو بسته می‌شود', async ({ page }) => {
  test.setTimeout(120_000); // ~۳۰ گزینه، هر کدوم یه جابه‌جایی کامل
  await openAs(page, 'viewer');
  // گزینه‌های «به‌زودی» برای بیننده پنهان‌ان
  const keys = await page.$$eval('#nav-menu button[data-nav]:not(.soon-item)', (bs) => bs.map((b) => b.dataset.nav));
  expect(keys.length).toBeGreaterThan(20);
  for (const key of keys) {
    await page.click('#nav-menu-btn');
    await expect(page.locator('#nav-menu')).toHaveClass(/open/);
    await page.locator(`#nav-menu button[data-nav="${key}"]`).click();
    await expect(page.locator('#nav-menu')).not.toHaveClass(/open/);
    const [s, t] = key.split('/');
    expect(await sectionOf(page), key).toBe('sec-' + s);
    // posts/feed فقط خودِ بخش رو باز می‌کنه (تب آخر/پیش‌فرض)
    if (t && s !== 'posts') await expect.poll(() => page.evaluate(() => location.hash), key).toContain(`#${s}/${t}`);
  }
  expect(page.appErrors).toEqual([]);
});

test('منو با کلیک بیرون و Esc بسته می‌شود', async ({ page }) => {
  await openAs(page, 'viewer');
  await page.click('#nav-menu-btn');
  await expect(page.locator('#nav-menu')).toHaveClass(/open/);
  await page.mouse.click(5, 400);
  await expect(page.locator('#nav-menu')).not.toHaveClass(/open/);
  await page.click('#nav-menu-btn');
  await page.keyboard.press('Escape');
  await expect(page.locator('#nav-menu')).not.toHaveClass(/open/);
});

test('منوی مدیریت: هر گزینه بخش خودش را باز می‌کند', async ({ page }) => {
  await openAs(page, 'admin');
  const keys = await page.$$eval('#admin-menu button[data-admin-go]', (bs) => bs.map((b) => b.dataset.adminGo));
  expect(keys).toEqual(['status', 'activity', 'settings', 'announce', 'users', 'uploads', 'export']);
  for (const key of keys) {
    await page.click('#admin-menu-btn');
    await expect(page.locator('#admin-menu')).toHaveClass(/open/);
    await page.locator(`#admin-menu button[data-admin-go="${key}"]`).click();
    await expect(page.locator('#admin-menu')).not.toHaveClass(/open/);
    expect(await sectionOf(page), key).toBe('sec-' + key);
  }
  expect(page.appErrors).toEqual([]);
});

test('پنجره‌ی ویرایش منبع: بستن با ×، «انصراف»، کلیک بیرون و Esc', async ({ page }) => {
  await openAs(page, 'admin', 'settings');
  const modal = page.locator('#chan-editor-modal');
  const open = async () => { await page.locator('#add-chan-btn').click(); await expect(modal).toHaveClass(/active/); };
  await page.locator('#add-chan-btn').scrollIntoViewIfNeeded();
  await open();
  await modal.locator('.modal-close').click();
  await expect(modal).not.toHaveClass(/active/);
  await open();
  await modal.locator('[data-modal-close]').click();
  await expect(modal).not.toHaveClass(/active/);
  await open();
  await modal.click({ position: { x: 4, y: 4 } });
  await expect(modal).not.toHaveClass(/active/);
  await open();
  await page.keyboard.press('Escape');
  await expect(modal).not.toHaveClass(/active/);
  expect(page.appErrors).toEqual([]);
});

test.describe('نمایشگر سند', () => {
  test.use({
    mockData: {
      magazines: [{ id: 1, title: 'بسته تحلیلی جریان', issue_no: '1', sort_order: 0, cover_path: null, cover_url: null, files: ['p1.png', 'p2.png', 'p3.png'], file_type: 'images', published_at: new Date().toISOString(), created_at: new Date().toISOString() }],
    },
  });
  test('ورق زدن، شماره‌ی صفحه، بزرگ‌نمایی و بستن', async ({ page, isMobile }) => {
    await openAs(page, 'viewer', 'reports');
    const dv = page.locator('#doc-viewer');
    await page.locator('#sec-reports .mag-read-btn').first().click();
    await expect(dv).toHaveClass(/active/);
    await expect(page.locator('#dv-count')).toHaveText('صفحه‌ی ۱ از ۳');
    await page.click('#dv-next');
    await expect(page.locator('#dv-count')).toHaveText('صفحه‌ی ۲ از ۳');
    // ردیف شماره‌ی صفحه‌ها روی گوشی عمداً پنهانه (15-doc-viewer.css)
    if (isMobile) await page.click('#dv-next');
    else await page.locator('#dv-pages button[data-dv-go]', { hasText: '۳' }).click();
    await expect(page.locator('#dv-count')).toHaveText('صفحه‌ی ۳ از ۳');
    await page.click('#dv-prev');
    await expect(page.locator('#dv-count')).toHaveText('صفحه‌ی ۲ از ۳');
    await page.click('#dv-zoom');
    await expect(page.locator('#dv-stage')).toHaveClass(/zoomed/);
    await page.locator('#dv-stage img').click();
    await expect(page.locator('#dv-stage')).not.toHaveClass(/zoomed/);
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#dv-count')).toHaveText('صفحه‌ی ۳ از ۳');
    await dv.locator('.modal-close').click();
    await expect(dv).not.toHaveClass(/active/);
    await page.locator('#sec-reports .mag-read-btn').first().click();
    await expect(dv).toHaveClass(/active/);
    await page.keyboard.press('Escape');
    await expect(dv).not.toHaveClass(/active/);
    expect(page.appErrors).toEqual([]);
  });
});

test('دکمه‌ی «فیلترها» روی گوشی باز و بسته می‌کند', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'فقط نمای گوشی');
  await openAs(page, 'viewer', 'overview/study');
  const btn = page.locator('#sec-overview .m-filter-btn:visible').first();
  const box = page.locator('#news-study-panel[data-mfilters], #news-study-panel [data-mfilters]').first();
  await btn.click();
  await expect(btn).toHaveClass(/active/);
  await btn.click();
  await expect(btn).not.toHaveClass(/active/);
  expect(await box.count()).toBeGreaterThan(0);
  expect(page.appErrors).toEqual([]);
});

test('دکمه‌ی «بالای صفحه»', async ({ page }) => {
  await openAs(page, 'viewer');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator('#to-top')).toHaveClass(/show/);
  await page.click('#to-top');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  expect(page.appErrors).toEqual([]);
});
