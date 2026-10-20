// «اخبار و رویدادها» (design/src/features/news): تب‌ها، نمای فهرستی/چندستونه، «نمایش بیشتر»،
// ترجمه و ویرایش کلیدواژه — همه بعد از مرحله‌ی ۵ ماژولار کردن بدون onclick درون HTML
import { test, expect, openAs } from './support/fixtures.js';

const TABS = ['analytics', 'claims', 'study', 'website', 'newspapers', 'dossier', 'newsletter'];

test('هر تب با دکمه‌ی خودش باز می‌شود', async ({ page }) => {
  await openAs(page, 'admin', 'overview/analytics');
  for (const t of TABS) {
    await page.click('#news-tab-' + t);
    await expect(page.locator('#news-tab-' + t)).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#overview/' + t);
  }
  expect(page.appErrors).toEqual([]);
});

test('«همه ←» ادعاها از «در یک نگاه» به تب ادعاها می‌برد', async ({ page }) => {
  await openAs(page, 'viewer', 'overview/analytics');
  await page.locator('#sec-overview [data-news-go="claims"]').first().click();
  await expect(page.locator('#news-tab-claims')).toHaveClass(/active/);
  expect(page.appErrors).toEqual([]);
});

test('نمای فهرستی و چندستونه، و «نمایش بیشتر»', async ({ page, isMobile }) => {
  await openAs(page, 'viewer', 'overview/study');
  const feed = page.locator('#news-feed');
  // دکمه‌های نما روی گوشی پنهان‌اند
  if (!isMobile) {
    await page.click('#news-view-list-btn');
    await expect(feed).not.toHaveClass(/grid-view/);
    await page.click('#news-view-grid-btn');
    await expect(feed).toHaveClass(/grid-view/);
  }
  const more = feed.locator('[data-news-more]').first();
  const id = await more.getAttribute('data-news-more');
  await more.dispatchEvent('click');   // دکمه وقتی متن کوتاهه پنهانه؛ رفتارش همون باشه
  await expect(page.locator('#news-text-' + id)).toHaveClass(/expanded/);
  await more.dispatchEvent('click');
  await expect(page.locator('#news-text-' + id)).not.toHaveClass(/expanded/);
  expect(page.appErrors).toEqual([]);
});

test('مدیر: ویرایش، ذخیره و انصراف کلیدواژه', async ({ page }) => {
  await openAs(page, 'admin', 'overview/study');
  const edit = page.locator('#news-feed [data-kw-edit]').first();
  const id = await edit.getAttribute('data-kw-edit');
  await edit.click();
  await page.fill('#news-kw-input-' + id, 'کلیدواژه‌ی یک، کلیدواژه‌ی دو');
  await page.locator(`#news-feed [data-kw-save="${id}"]`).click();
  await expect(page.locator('#news-kw-chips-' + id)).toContainText('کلیدواژه‌ی دو');
  await page.locator(`#news-feed [data-kw-edit="${id}"]`).click();
  await expect(page.locator('#news-kw-input-' + id)).toBeVisible();
  await page.locator('#news-feed [data-kw-cancel]').click();
  await expect(page.locator('#news-kw-input-' + id)).toHaveCount(0);
  expect(page.appErrors).toEqual([]);
});

test.describe('ترجمه', () => {
  test.use({
    mockPatch: { apply(data) {
      const site = data.channels.find((c) => c.platform === 'website' && c.show_in_news && !c.show_in_hawza);
      const p = data.posts.find((x) => x.channel_id === site.id);
      p.title = 'Talks resume in Vienna';
      p.text = 'Iranian and European diplomats met again on Monday to discuss the nuclear file.';
    } },
  });
  test('«ترجمه به فارسی» و برگشت به متن اصلی', async ({ page }) => {
    await page.route('**/functions/v1/translate', (r) => r.fulfill({ json: { title: 'گفت‌وگوها در وین از سر گرفته شد', text: 'دیپلمات‌های ایرانی و اروپایی دوباره دیدار کردند.' } }));
    await openAs(page, 'viewer', 'overview/website');
    const btn = page.locator('#news-feed [data-translate]').first();
    const id = await btn.getAttribute('data-translate');
    await btn.click();
    await expect(page.locator('#news-text-' + id)).toContainText('دیپلمات‌های ایرانی');
    await expect(btn).toHaveText('بازگشت به متن اصلی');
    await btn.click();
    await expect(page.locator('#news-text-' + id)).toContainText('Iranian and European');
    expect(page.appErrors).toEqual([]);
  });
});
