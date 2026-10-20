// زیرتب‌های «اخبار و رویدادها» که در مرحله‌ی ۵ب ماژولار شدن (design/src/features/news):
// «در یک نگاه» (شاخص موج‌ها)، اخبار منتخب، روزنامه‌ها، پرونده‌های موضوعی، خبرنامه مدارس
import { test, expect, openAs } from './support/fixtures.js';

test('«در یک نگاه»: شاخص موج‌های خبری به کادر موج‌ها می‌برد', async ({ page }) => {
  await openAs(page, 'viewer', 'overview/analytics');
  await page.locator('#nga-kpis [data-scroll-to="news-waves-panel"]').click();
  await expect.poll(() => page.evaluate(() => {
    const r = document.getElementById('news-waves-panel').getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  })).toBe(true);
  expect(page.appErrors).toEqual([]);
});

test('مدیر: «افزودن به منتخب» از کارت خبر درخواست ثبت می‌فرستد', async ({ page }) => {
  await openAs(page, 'admin', 'overview/study');
  const btn = page.locator('#news-feed [data-pick-add]:not([disabled])').first();
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/rest/v1/news_pick_edits') && r.method() === 'POST'),
    btn.click(),
  ]);
  expect(JSON.parse(req.postData()).action).toBe('pin');
  expect(page.appErrors).toEqual([]);
});

test.describe('روزنامه‌ها', () => {
  test.use({ mockPatch: { apply(data) { data.newspapers.forEach((n) => { n.image_url = 'images/analysis-illustration.webp'; }); } } });
  test('جلدها، برچسب تاریخ و نمایش بزرگ جلد', async ({ page }) => {
    await openAs(page, 'viewer', 'overview/newspapers');
    const cover = page.locator('#newspaper-grid .newspaper-cover img').first();
    await expect(cover).toBeVisible();
    const tab = page.locator('#newspaper-date-tabs button').first();
    if (await tab.count()) await tab.click();
    await cover.click();
    const viewer = page.locator('#media-viewer');
    await expect(viewer).toHaveClass(/active/);
    await viewer.locator('.modal-close').click();
    await expect(viewer).not.toHaveClass(/active/);
    expect(page.appErrors).toEqual([]);
  });
});

test.describe('پرونده‌های موضوعی', () => {
  test.use({
    mockData: {
      dossier_topics: [
        { id: 1, name: 'تورم و گرانی', keywords: ['تورم'], active: true, sort_order: 0 },
        { id: 2, name: 'غزه', keywords: ['غزه'], active: true, sort_order: 1 },
      ],
      dossier_topic_posts: [1, 2, 3, 6].map((pid, i) => ({ id: i + 1, topic_id: i < 2 ? 1 : 2, post_id: pid, source: 'auto', excluded: false })),
    },
  });
  test('انتخاب موضوع، فیلتر زمان و «نمایش بیشتر»', async ({ page }) => {
    await openAs(page, 'viewer', 'overview/dossier');
    const items = page.locator('#dossier-sidebar [data-topic]');
    await expect(items).toHaveCount(2);
    await items.first().click();
    await expect(items.first()).toHaveClass(/active/);
    const more = page.locator('#dossier-groups [data-dossier-more]').first();
    const uid = await more.getAttribute('data-dossier-more');
    await more.dispatchEvent('click');
    await expect(page.locator('#dossier-text-' + uid)).toHaveClass(/expanded/);
    await page.locator('#dossier-time-seg button').last().click();
    expect(page.appErrors).toEqual([]);
  });
});

test('مدیر: خبرنامه — پیشنهاد، حذف، جست‌وجوی دستی، افزودن و انتشار', async ({ page }) => {
  await openAs(page, 'admin', 'overview/newsletter');
  const draft = page.locator('#newsletter-draft-news .newsletter-draft-item');
  await page.locator('[data-nl-suggest="news"]').click();
  await expect(draft.first()).toBeVisible();
  const before = await draft.count();
  await draft.first().locator('[data-nl-remove]').click();
  await expect(draft).toHaveCount(before - 1);
  await page.locator('[data-nl-search="news"]').fill('تورم');
  const add = page.locator('#newsletter-manual-results-news [data-nl-add]').first();
  await expect(add).toBeVisible();
  await add.click();
  await expect(draft).toHaveCount(before);
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/rest/v1/newsletter_posts') && r.method() === 'POST'),
    page.locator('[data-nl-publish]').click(),
  ]);
  expect(Array.isArray(JSON.parse(req.postData()))).toBe(true);
  expect(page.appErrors).toEqual([]);
});

test.describe('خبرنامه‌ی منتشرشده', () => {
  test.use({
    mockPatch: { apply(data) {
      const pick = (sec, ids) => ids.map((id, k) => ({ id: id, section: sec, post_id: id, sort_order: k, posts: data.posts.find((p) => p.id === id) }));
      data.newsletter_posts = [...pick('claims', [24, 48]), ...pick('news', [1, 2, 3]), ...pick('dossier', [4, 5])];
    } },
  });
  test('دانلود PDF خبرنامه', async ({ page, isMobile }) => {
    test.skip(isMobile, 'ساخت PDF سنگینه؛ یک‌بار روی رایانه کافیه');
    test.setTimeout(90_000);
    await openAs(page, 'viewer', 'overview/newsletter');
    const btn = page.locator('#newsletter-download-btn');
    await expect(btn).toBeEnabled();
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), btn.click()]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    expect(page.appErrors).toEqual([]);
  });
});
