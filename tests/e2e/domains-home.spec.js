// عرصه‌ها و صفحه‌ی نخست که در مرحله‌ی ۷ ماژولار شدن (design/src/features/{hawza,home,schools,reports,announcements}):
// دکمه‌هایی که از onclick به listener رفتن، تب‌های «درباره حوزه»، معرفی سامانه و گزارش‌های مدارس
import { test, expect, openAs } from './support/fixtures.js';

const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const MENTIONS = [
  { id: 1, url: 'https://news.example/1', site: 'news.example', site_name: 'Example News', title: 'Qom seminary clerics react to the new law', excerpt: 'Grand Ayatollah statements were discussed in the Qom seminary.', kind: 'site', matched_terms: ['حوزه علمیه'], hits: 2, in_title: true, published_at: ago(2), scraped_at: ago(2), hidden_at: null },
  { id: 2, url: 'https://eitaa.com/x/5', site: 'eitaa.com', site_name: 'کانال آزمایشی', title: 'نشست طلاب حوزه علمیه مشهد', excerpt: 'طلاب و اساتید حوزه علمیه مشهد درباره‌ی تحولات اجتماعی گفت‌وگو کردند.', kind: 'social', matched_terms: ['طلاب'], hits: 3, in_title: true, published_at: ago(5), scraped_at: ago(5), hidden_at: null },
];

test('درباره حوزه: دو تب با دکمه‌های خودشان و آدرس هر تب', async ({ page }) => {
  await openAs(page, 'viewer', 'hawza/news');
  await page.locator('#hawza-tab-about').click();
  await expect(page.locator('#hawza-about-panel')).toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#hawza/about');
  await page.locator('#hawza-tab-news').click();
  await expect(page.locator('#hawza-about-panel')).toBeHidden();
  await expect(page.locator('#sec-hawza #news-study-panel')).toBeVisible();
  expect(page.appErrors).toEqual([]);
});

test.describe('آنچه درباره حوزه گفته می‌شود', () => {
  test.use({ mockData: { hawza_mentions: MENTIONS } });

  test('ترجمه‌ی خبر خارجی و بازگشت به متن اصلی', async ({ page }) => {
    await page.route('**/functions/v1/translate', (r) => r.fulfill({ json: { title: 'واکنش روحانیون حوزه علمیه قم به قانون تازه', text: 'بیانات مراجع در حوزه علمیه قم بررسی شد.' } }));
    await openAs(page, 'viewer', 'hawza/about');
    const btn = page.locator('#hab-feed [data-hab-translate="1"]');
    await btn.click();
    await expect(page.locator('#hab-title-1')).toHaveClass(/is-translated/);
    await expect(btn).toHaveText('بازگشت به متن اصلی');
    await btn.click();
    await expect(page.locator('#hab-title-1')).not.toHaveClass(/is-translated/);
    expect(page.appErrors).toEqual([]);
  });

  test('مدیر: پنهان کردن خبر بعد از تأیید', async ({ page }) => {
    await openAs(page, 'admin', 'hawza/about');
    await expect(page.locator('#hab-feed article')).toHaveCount(2);
    await page.locator('#hab-feed [data-hab-hide="2"]').click();
    await expect(page.locator('#ui-confirm-modal')).toHaveClass(/active/);
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/rest/v1/hawza_mentions?id=eq.2') && r.method() === 'PATCH'),
      page.locator('#ui-confirm-ok').click(),
    ]);
    expect(JSON.parse(req.postData()).hidden_at).toBeTruthy();
    await expect(page.locator('#hab-feed article')).toHaveCount(1);
    expect(page.appErrors).toEqual([]);
  });
});

// ۵.۳۳.۰: «درباره مردم»، «قوانین و مصوبات» و «از جریان بپرس» حذف شدند (خواست کاربر)
test('صفحه‌ی نخست: شش عرصه در یک مدار و بدون عرصه‌های حذف‌شده در منو', async ({ page }) => {
  await openAs(page, 'admin');
  await expect(page.locator('.domain-orbits .domain-card')).toHaveCount(6);
  await expect(page.locator('.domain-grid')).toHaveCount(1);
  await expect(page.locator('#nav-menu [data-nav^="laws"], #nav-menu [data-nav^="public"], #nav-menu [data-nav^="ask"]')).toHaveCount(0);
  expect(page.appErrors).toEqual([]);
});

// ۵.۳۶.۰: ستون «امروز در جریان» کنار کاشی‌های عرصه‌ها (features/home/today-col.js)
test('صفحه‌ی نخست: ستون «امروز در جریان» — زبانه‌ها، توقف چرخش با کلیک و رفتن به بخش', async ({ page }) => {
  await openAs(page, 'viewer');
  const col = page.locator('#today-col');
  await expect(col).toBeVisible();
  await expect(col.locator('.tc-tab').first()).toContainText('اخبار');
  const claimTab = col.locator('.tc-tab', { hasText: 'شایعه' });
  await claimTab.click();
  await expect(claimTab).toHaveAttribute('aria-selected', 'true');
  await expect(col.locator('.tc-feat-lbl')).toHaveText('تازه‌ترین شایعه');
  await expect(col).not.toHaveClass(/is-rotating/); // کلیک کاربر چرخش خودکار را متوقف می‌کند
  await col.locator('.tc-more').click();
  await expect(page.locator('#sec-overview')).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('overview/claims');
  expect(page.appErrors).toEqual([]);
});

// ۵.۳۷.۰: هرو سه‌اسلایدی (features/home/hero-slider.js)
test('صفحه‌ی نخست: هرو سه‌اسلایدی — زبانه‌ها، اسلاید فعال و رفتن به عرصه', async ({ page }) => {
  await openAs(page, 'viewer');
  const hs = page.locator('#hero-slider');
  const tabs = hs.locator('.hs-tab');
  await expect(tabs).toHaveCount(3);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await expect(hs.locator('.hs-slide.on')).toHaveAttribute('data-i', '0');
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(hs.locator('.hs-slide.on')).toHaveAttribute('data-i', '1');
  await expect(hs).not.toHaveClass(/is-rotating/); // کلیک کاربر چرخش خودکار را متوقف می‌کند
  await expect(hs.locator('.hs-here')).toContainText('عرصه‌های رصد و پایش');
  await hs.locator('.hs-slide.on .hs-dc[data-go="positions"]').click();
  await expect(page.locator('#sec-positions')).toHaveClass(/active/);
  expect(page.appErrors).toEqual([]);
});

test('منوی بخش‌ها: شماره‌های بسته تحلیلی زیر «بسته تحلیلی جریان» و باز شدن در نمایشگر سند', async ({ page }) => {
  await openAs(page, 'viewer');
  // رایانه‌ی پهن: همان شماره‌ها در ستون کناری (۵.۳۸.۰)؛ بعد منوی نوار بالا در پهنای کمتر
  if (await page.locator('#side-nav').isVisible()) {
    const side = page.locator('#sn-issues .sn-issue');
    await expect(side).toHaveCount(4);
    await side.first().click();
    await expect(page.locator('#doc-viewer')).toHaveClass(/active/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#doc-viewer')).not.toHaveClass(/active/);
    await page.setViewportSize({ width: 1100, height: page.viewportSize().height });
  }
  await page.click('#nav-menu-btn');
  const items = page.locator('#nav-menu-issues .nav-menu-issue');
  await expect(items).toHaveCount(4); // فقط شماره‌های دارای فایل
  await expect(items.first()).toHaveText('شماره ۱');
  await items.first().click();
  await expect(page.locator('#doc-viewer')).toHaveClass(/active/);
  await expect(page.locator('#nav-menu')).not.toHaveClass(/open/);
  expect(page.appErrors).toEqual([]);
});

test('پیوند قدیمی عرصه‌های حذف‌شده به صفحه‌ی نخست می‌رود', async ({ page }) => {
  test.slow(); // سه بار باز کردن کامل صفحه
  for (const old of ['laws', 'public/trends', 'ask']) {
    await openAs(page, 'viewer', old);
    await expect(page.locator('#sec-dashboard')).toHaveClass(/active/);
  }
  expect(page.appErrors).toEqual([]);
});

test('صفحه‌ی نخست: دکمه‌های دسترسی سریع به عرصه‌ها و بسته‌ها اسکرول می‌کنند', async ({ page }) => {
  await openAs(page, 'viewer');
  const inView = (sel) => page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  }, sel);
  // ۵.۳۷.۰: دکمه‌ها داخل اسلایدهای هرو‌اند — اول زبانه‌ی همان اسلاید
  const tabs = page.locator('#hero-slider .hs-tab');
  await tabs.nth(2).click();
  await page.locator('.hs-slide.on [data-home-scroll="package"]').click();
  await expect.poll(() => inView('#pkg-flow')).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await tabs.nth(1).click();
  await page.locator('.hs-slide.on [data-home-scroll="domains"]').click();
  await expect.poll(() => inView('.section-label')).toBe(true);
  expect(page.appErrors).toEqual([]);
});

test('صفحه‌ی نخست: «اطلاع از انتشار» با دکمه و با Enter ثبت می‌شود', async ({ page }) => {
  await openAs(page, 'viewer');
  const phone = page.locator('#notify-phone');
  await phone.fill('۰۹۱۲ ۱۲۳ ۴۵۶۷');
  const isPost = (r) => r.url().includes('/rest/v1/notify_subscribers') && r.method() === 'POST';
  const [req] = await Promise.all([page.waitForRequest(isPost), page.locator('#notify-subscribe-btn').click()]);
  expect(JSON.parse(req.postData()).phone).toBe('09121234567');
  await phone.fill('09351112233');
  await Promise.all([page.waitForRequest(isPost), phone.press('Enter')]);
  expect(page.appErrors).toEqual([]);
});

test('معرفی سامانه: باز شدن از فوتر، قبلی/بعدی و رفتن به «در یک نگاه»', async ({ page }) => {
  await openAs(page, 'viewer');
  await page.locator('.app-footer-intro').click();
  const modal = page.locator('#intro-modal');
  await expect(modal).toHaveClass(/active/);
  await expect(page.locator('#intro-prev')).toBeHidden();
  await page.locator('#intro-next').click();
  await expect(page.locator('#intro-prev')).toBeVisible();
  await page.locator('#intro-prev').click();
  await expect(page.locator('#intro-prev')).toBeHidden();
  await page.locator('#intro-next').click();
  await page.locator('#intro-next').click();
  await page.locator('#intro-next').click();
  await expect(modal).not.toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#overview/analytics');
  expect(page.appErrors).toEqual([]);
});

test.describe('برنامه مدارس', () => {
  test.use({
    mockData: {
      school_reports: [
        { id: 1, title: 'گزارش مهر', file_type: 'image', media_storage_path: 'r1.png', image_url: null, uploaded_at: '2026-10-10T08:00:00Z', sort_order: 0 },
        { id: 2, title: 'گزارش شهریور', file_type: 'pdf', media_storage_path: 'r2.pdf', image_url: null, uploaded_at: '2026-09-10T08:00:00Z', sort_order: 1 },
      ],
    },
  });
  test('چیپ ماه و بزرگ‌نمایی گزارش در نمایشگر سند', async ({ page }) => {
    await openAs(page, 'viewer', 'schools');
    const chips = page.locator('#sch-month-row [data-m]');
    await expect(chips).toHaveCount(3);
    await chips.nth(1).click();
    await expect(chips.nth(1)).toHaveClass(/active/);
    await expect(page.locator('#school-report-list .school-report-block')).toHaveCount(1);
    await page.locator('#school-report-list .school-report-img-btn').click();
    await expect(page.locator('#doc-viewer')).toHaveClass(/active/);
    expect(page.appErrors).toEqual([]);
  });
});
