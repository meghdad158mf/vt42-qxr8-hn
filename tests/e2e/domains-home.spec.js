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

  test('نمای خواندن: فهرست، انتخاب و مطالب دیگر همین منبع', async ({ page, isMobile }) => {
    test.skip(isMobile, 'نمای خواندن فقط رایانه');
    await openAs(page, 'viewer', 'hawza/about');
    await expect(page.locator('#hab-feed')).toHaveClass(/reader-view/);
    const rows = page.locator('#hab-feed .nr-row');
    await expect(rows).toHaveCount(2);
    await rows.nth(1).click();
    await expect(page.locator('#nrh-pane #hab-title-2')).toBeVisible();
    expect(page.appErrors).toEqual([]);
  });

  test('مدیر: پنهان کردن خبر بعد از تأیید', async ({ page }) => {
    await openAs(page, 'admin', 'hawza/about');
    const cards = page.locator('[data-rv="cards"]:visible');   // ۵.۴۱.۰: رایانه با نمای خواندن باز می‌شود
    if(await cards.count()) await cards.click();
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
test('صفحه‌ی نخست: شش کارت عرصه و بدون عرصه‌های حذف‌شده در منو', async ({ page }) => {
  await openAs(page, 'admin');
  await expect(page.locator('.domain-orbits .domain-card')).toHaveCount(6);
  await expect(page.locator('.domain-grid')).toHaveCount(1);
  await expect(page.locator('#nav-menu [data-nav^="laws"], #nav-menu [data-nav^="public"], #nav-menu [data-nav^="ask"]')).toHaveCount(0);
  expect(page.appErrors).toEqual([]);
});

// ۵.۳۹.۰: صفحه‌ی نخست تازه (features/home/home-v3.js) و صفحه‌ی خوش‌آمد (welcome.js)
test('صفحه‌ی نخست: «امروز در جریان»، کارت بسته و رفتن به عرصه', async ({ page }) => {
  await openAs(page, 'viewer');
  // ۵.۴۰.۰: «خلاصه‌ی روز» — کارت شمار امروز + یک ردیف برای هر نوع مطلب؛ همه به صفحه‌ی «منتخب مطالب امروز»
  await expect(page.locator('#hm-lead')).toHaveCount(0);
  await expect(page.locator('#hm-tabs .dg-card b')).not.toBeEmpty();
  expect(await page.locator('#hm-items .dg-row').count()).toBeGreaterThan(2);
  await expect(page.locator('#hm-today-foot .hm-today-go')).toBeVisible();
  await expect(page.locator('#pkg-flow .hm-pkg-tx')).toContainText('بسته تحلیلی جریان');
  await expect(page.locator('#hm-sub')).toContainText('امروز');
  await page.locator('.hm-domains .domain-card[data-go="positions"]').click();
  await expect(page.locator('#sec-positions')).toHaveClass(/active/);
  expect(page.appErrors).toEqual([]);
});

test('منتخب مطالب امروز: رفتن از ستون «امروز در جریان»، پرش به هر قسمت و برگشت', async ({ page }) => {
  await openAs(page, 'viewer');
  await page.locator('#hm-today-foot .hm-today-go').click();
  await expect(page.locator('#sec-today')).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#today');
  await expect(page.locator('#today-page .td-hero h1')).not.toBeEmpty();
  expect(await page.locator('#today-page .td-news article').count()).toBeGreaterThan(1);
  await expect(page.locator('#td-claim')).toBeVisible();
  await page.locator('[data-td-jump="td-note"]').click();
  await expect(page.locator('#td-note')).toBeInViewport();
  // ردیف «شایعه» ستون، مستقیم به همان قسمت صفحه
  await page.goBack();
  await expect(page.locator('#sec-dashboard')).toHaveClass(/active/);
  await page.locator('#hm-items .dg-row[data-td-scroll="td-claim"]').click();
  await expect(page.locator('#sec-today')).toHaveClass(/active/);
  await expect(page.locator('#td-claim')).toBeInViewport();
  expect(page.appErrors).toEqual([]);
});

test('صفحه‌ی نخست: جست‌وجوی سرصفحه به اخبار و رویدادها می‌برد', async ({ page }) => {
  await openAs(page, 'viewer');
  await page.fill('#hm-search-input', 'مجلس');
  await page.press('#hm-search-input', 'Enter');
  await expect(page.locator('#sec-overview')).toHaveClass(/active/);
  await expect(page.locator('#news-search-input')).toHaveValue('مجلس');
  expect(page.appErrors).toEqual([]);
});

test('صفحه‌ی خوش‌آمد: بعد از ورود، آمار و «شروع»؛ با رفرش دوباره نمی‌آید', async ({ page }) => {
  await openAs(page, 'viewer');
  // ستاپ آزمون‌ها صفحه‌ی خوش‌آمد را «دیده‌شده» می‌گذارد؛ این آزمون آن را می‌خواهد
  await page.evaluate(() => { sessionStorage.setItem('jarian_test_show_welcome', '1'); sessionStorage.removeItem('jarian_welcome_seen'); });
  await page.reload();
  const wl = page.locator('#welcome');
  await expect(wl).toBeVisible();
  await expect(page.locator('#wl-stats > div')).toHaveCount(4);
  await page.click('#wl-go');
  await expect(wl).toBeHidden();
  await expect(page.locator('#sec-dashboard')).toHaveClass(/active/);
  await page.reload();
  await expect(page.locator('#sec-dashboard')).toHaveClass(/active/);
  await expect(wl).toBeHidden();
  expect(page.appErrors).toEqual([]);
});

test('منوی بخش‌ها: شماره‌های بسته تحلیلی زیر «بسته تحلیلی جریان» و باز شدن در نمایشگر سند', async ({ page }) => {
  await openAs(page, 'viewer');
  // رایانه‌ی پهن: همان شماره‌ها در ستون کناری (۵.۳۸.۰)؛ بعد منوی نوار بالا در پهنای کمتر
  if (await page.locator('#side-nav').isVisible()) {
    const side = page.locator('#sn-issues .sn-issue');
    await expect(side).toHaveCount(4);
    // ۵.۴۰.۰: تیترهای ستون بازشو هستند — شماره‌ها با فلش «بسته تحلیلی جریان» دیده می‌شوند
    await expect(side.first()).toBeHidden();
    const exp = page.locator('#side-nav .sn-group[data-sn="reports"] .sn-exp');
    await exp.click();
    await expect(exp).toHaveAttribute('aria-expanded', 'true');
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

test('صفحه‌ی نخست: «اطلاع از انتشار» با دکمه و با Enter ثبت می‌شود', async ({ page }) => {
  await openAs(page, 'viewer');
  // رایانه‌ی پهن (۵.۴۰.۰): «ارتباط با ما» در پنجره‌ی کوچک کنار ستون
  if (await page.locator('#side-nav').isVisible()) await page.click('#sn-contact-btn');
  const phone = page.locator('#notify-phone');
  await phone.fill('۰۹۱۲ ۱۲۳ ۴۵۶۷');
  const isPost = (r) => r.url().includes('/rest/v1/notify_subscribers') && r.method() === 'POST';
  const [req] = await Promise.all([page.waitForRequest(isPost), page.locator('#notify-subscribe-btn').click()]);
  expect(JSON.parse(req.postData()).phone).toBe('09121234567');
  await phone.fill('09351112233');
  await Promise.all([page.waitForRequest(isPost), phone.press('Enter')]);
  expect(page.appErrors).toEqual([]);
});

test('معرفی سامانه: باز شدن از فوتر، قبلی/بعدی و رفتن به صفحه‌ی نخست', async ({ page }) => {
  // از بخشی غیر از صفحه‌ی نخست، تا رفتن به صفحه‌ی نخست واقعاً سنجیده شود
  await openAs(page, 'viewer', 'overview/claims');
  // رایانه‌ی پهن (۵.۴۰.۰): فوتر در پنجره‌ی «درباره‌ی سامانه» کنار ستون
  if (await page.locator('#side-nav').isVisible()) await page.click('#sn-info-btn');
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
  await expect(page.locator('#sec-dashboard')).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#dashboard');
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
