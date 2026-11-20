// اجزای رابط (design/src/ui، مرحله‌ی ۴): منوها، پنجره‌ها، نمایشگر سند، فیلترهای گوشی، «بالای صفحه»
import { test, expect, openAs } from './support/fixtures.js';

const sectionOf = (page) => page.evaluate(() => (document.querySelector('.section.active') || {}).id);

test('منوی بخش‌ها: هر گزینه به بخش و تب خودش می‌برد و منو بسته می‌شود', async ({ page }) => {
  test.setTimeout(120_000); // ~۳۰ گزینه، هر کدوم یه جابه‌جایی کامل
  await page.setViewportSize({ width: Math.min(page.viewportSize().width, 1100), height: page.viewportSize().height }); // منوی نوار بالا زیر ۱۲۸۰px
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

// ۵.۳۸.۰: رایانه‌ی پهن (≥۱۲۸۰px) به‌جای منوی «بخش‌ها» ستون ثابت کناری دارد
test('ستون کناری (رایانه‌ی پهن): هر گزینه به بخش و تب خودش می‌برد و جای فعلی پررنگ است', async ({ page }) => {
  test.setTimeout(120_000);
  await openAs(page, 'viewer');
  test.skip(!(await page.locator('#side-nav').isVisible()), 'ستون کناری فقط روی رایانه‌ی پهن');
  await expect(page.locator('#nav-menu-btn')).toBeHidden();
  await expect(page.locator('#sn-kpis .sn-kpi:visible')).toHaveCount(0); // ۵.۳۹.۰: آمار در صفحه‌ی خوش‌آمد و «نمایش کامل»، نه در ستون
  const keys = [...new Set(await page.$$eval('#side-nav button[data-nav]:not(.soon-item)', (bs) => bs.map((b) => b.dataset.nav)))];
  expect(keys.length).toBeGreaterThan(20);
  for (const key of keys) {
    const [s, t] = key.split('/');
    // زیرتب‌ها فقط زیر عرصه‌ی فعلی باز است
    if (t) await page.locator(`#side-nav .sn-item[data-nav="${s}"]`).click();
    const btn = page.locator(`#side-nav button[data-nav="${key}"]`).last();
    await btn.click();
    expect(await sectionOf(page), key).toBe('sec-' + s);
    if (t && s !== 'posts') await expect.poll(() => page.evaluate(() => location.hash), key).toContain(`#${s}/${t}`);
    // عرصه: ردیفش باز (هلویی)؛ زیرتب و صفحه نخست/بسته: خودِ دکمه پررنگ
    const group = page.locator(`#side-nav .sn-group[data-sn="${s}"]`);
    if (!t && await group.count()) await expect(group, key).toHaveClass(/is-open/);
    else await expect(btn, key).toHaveClass(/is-current/);
  }
  expect(page.appErrors).toEqual([]);
});

test('ستون کناری: هدر و فوتر داخل ستون و «نمایش کامل» با جزئیات هر بخش', async ({ page }) => {
  await openAs(page, 'admin');
  test.skip(!(await page.locator('#side-nav').isVisible()), 'ستون کناری فقط روی رایانه‌ی پهن');
  // ابزارهای نوار بالا و فوتر خودشان (نه کپی) به ستون منتقل شده‌اند
  await expect(page.locator('#sn-tools #theme-btn')).toBeVisible();
  await expect(page.locator('#sn-tools #admin-menu-btn')).toBeVisible();
  await expect(page.locator('#sn-foot .app-footer')).toHaveCount(1);
  await expect(page.locator('.topbar')).toBeHidden();
  await page.click('#admin-menu-btn');
  await page.locator('#admin-menu [data-admin-go="status"]').click();
  await expect(page.locator('#sec-status')).toHaveClass(/active/);
  // «نمایش کامل»: ستون با گزینه‌هایش می‌ماند و پنل روشن جزئیات کنارش تقریباً تمام صفحه باز می‌شود؛
  // بستن با ×، Esc، پس‌زمینه یا رفتن به بخش
  const side = page.locator('#side-nav'), detail = page.locator('#sn-detail');
  await expect(detail).toBeHidden();
  await page.click('#sn-toggle');
  await expect(detail).toBeVisible();
  await expect(page.locator('#sn-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(side.locator('.sn-item[data-nav="overview"]')).toBeVisible(); // گزینه‌های ستون سر جایشان
  const vw = page.viewportSize().width;
  expect((await detail.boundingBox()).width + (await side.boundingBox()).width).toBeGreaterThan(vw * 0.85);
  await expect(detail.locator('.snd-card[data-sn="positions"] > p')).toBeVisible();
  await expect(detail.locator('#snd-kpis .sn-kpi')).toHaveCount(5);
  await page.keyboard.press('Escape');
  await expect(detail).toBeHidden();
  await page.click('#sn-toggle');
  await page.locator('#sn-backdrop').click({ position: { x: 10, y: 300 } });
  await expect(detail).toBeHidden();
  await page.click('#sn-toggle');
  await page.click('#snd-close');
  await expect(detail).toBeHidden();
  await page.click('#sn-toggle');
  await detail.locator('button[data-nav="positions/imams"]').click();
  await expect(detail).toBeHidden();
  await expect(page.locator('#sec-positions')).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('#positions/imams');
  // پهنای کمتر: ابزارها و فوتر به جای اصلی برمی‌گردند
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(page.locator('.topbar #theme-btn')).toBeVisible();
  await expect(page.locator('main > .app-footer')).toHaveCount(1);
  expect(page.appErrors).toEqual([]);
});

test('منو با کلیک بیرون و Esc بسته می‌شود', async ({ page }) => {
  await page.setViewportSize({ width: Math.min(page.viewportSize().width, 1100), height: page.viewportSize().height }); // منوی نوار بالا زیر ۱۲۸۰px
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
  test.setTimeout(60_000); // ۷ بخش مدیریت، «وضعیت سامانه» سنگین‌ترینشان — زیر بار موازی از ۳۰ ثانیه می‌گذشت
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
  // صفحه‌ی نخست روی رایانه‌ی پهن از ۵.۳۹.۰ اسکرول ندارد — صفحه‌ی بلند اخبار
  await openAs(page, 'viewer', 'overview/study');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator('#to-top')).toHaveClass(/show/);
  await page.click('#to-top');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  expect(page.appErrors).toEqual([]);
});

test('نمای روشن/تیره: پیش‌فرض روشن، دکمه عوض می‌کند و بعد از رفرش می‌ماند', async ({ page }) => {
  await openAs(page, 'viewer');
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme || 'dark');
  const canvas = () => page.evaluate(() => getComputedStyle(document.getElementById('view-dash')).backgroundColor + getComputedStyle(document.getElementById('view-dash')).backgroundImage);
  // ۵.۳۹.۰: پیش‌فرض روشن (مریم‌گلی)
  expect(await theme()).toBe('light');
  const lightBg = await canvas();
  const pick = async (t) => { await page.click('#theme-btn'); await page.click(`#theme-menu [data-theme-set="${t}"]`); };
  await pick('dark');
  expect(await theme()).toBe('dark');
  await expect(page.locator('#theme-btn')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#theme-menu')).toBeHidden();
  expect(await canvas()).not.toBe(lightBg);
  await page.reload();
  await expect(page.locator('#sec-dashboard')).toHaveClass(/active/);
  expect(await theme()).toBe('dark');
  await pick('light');
  expect(await theme()).toBe('light');
  expect(await canvas()).toBe(lightBg);
  // «خودکار» از تنظیم دستگاه پیروی می‌کند و با عوض شدنش هم‌زمان عوض می‌شود
  await page.emulateMedia({ colorScheme: 'light' });
  await pick('auto');
  expect(await theme()).toBe('light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(theme).toBe('dark');
  await page.reload();
  await expect(page.locator('#sec-dashboard')).toHaveClass(/active/);
  expect(await theme()).toBe('dark');
  expect(page.appErrors).toEqual([]);
});
