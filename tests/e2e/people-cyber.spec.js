// «کنشگری مجازی»، «یادداشت‌ها» و «مواضع مراجع و علماء» که در مرحله‌ی ۶ ماژولار شدن
// (design/src/features/{cyberspace,people,positions}): دکمه‌هایی که از onclick به data-* رفتن،
// تب‌بارها و جابه‌جایی ظرف مشترک گالری بین «یادداشت‌ها» و «مواضع»
import { test, expect, openAs } from './support/fixtures.js';

// متن بلند تا «نمایش بیشتر» روی همه‌ی کارت‌ها دیده بشه
// ۵.۴۱.۰: رایانه با «نمای خواندن» باز می‌شود؛ آزمون‌های کارت اول نمای کارت را می‌زنند (گوشی دکمه ندارد)
async function cardsView(page){
  const b = page.locator('[data-rv="cards"]:visible').first();
  if(await b.count()) await b.click();
}
const LONG_TEXT = { apply(data) { data.posts.forEach((p) => { p.text = Array(8).fill(p.text).join(' '); }); } };

test.describe('متن بلند', () => {
  test.use({ mockPatch: LONG_TEXT });

  test('کنشگری مجازی: «نمایش بیشتر» متن پست را باز و بسته می‌کند', async ({ page }) => {
    await openAs(page, 'viewer', 'posts/feed');
    await cardsView(page);
    const more = page.locator('#posts-list [data-post-more]:visible').first();
    const text = page.locator('#post-text-' + (await more.getAttribute('data-post-more')));
    await more.click();
    await expect(text).toHaveClass(/expanded/);
    await expect(more).toHaveClass(/open/);
    await more.click();
    await expect(text).not.toHaveClass(/expanded/);
    expect(page.appErrors).toEqual([]);
  });

  test('یادداشت‌ها: باز کردن منبع از گالری، «نمایش بیشتر» و برگشت به گالری', async ({ page }) => {
    await openAs(page, 'viewer', 'people/figures');
    await page.locator('#pf-logo-grid > *').first().click();
    await expect(page.locator('#pf-feed-view')).toBeVisible();
    await cardsView(page);
    const more = page.locator('#political-figures-list [data-pf-more]:visible').first();
    const text = page.locator('#pf-post-text-' + (await more.getAttribute('data-pf-more')));
    await more.click();
    await expect(text).toHaveClass(/expanded/);
    await more.click();
    await expect(text).not.toHaveClass(/expanded/);
    await page.locator('#pf-back-btn').click();
    await expect(page.locator('#pf-gallery-view')).toBeVisible();
    expect(page.appErrors).toEqual([]);
  });
});

test('کنشگری مجازی: ردیف جدول فید همان کانال را باز می‌کند و «نمایش همه‌ی کانال‌ها» برمی‌گرداند', async ({ page }) => {
  await openAs(page, 'viewer', 'posts/people');
  await page.locator('#cyber-people-grid .cpt-row .cpt-name').first().click();
  await expect(page.locator('#posts-tab-feed')).toBeVisible();
  const bar = page.locator('#posts-focus-bar');
  await expect(bar).toBeVisible();
  await bar.locator('[data-posts-focus-clear]').click();
  await expect(bar).toBeHidden();
  // برگشت به جدول هم نوار رو پاک نگه می‌داره
  await page.locator('#posts-page-tabs [data-posts-tab="people"]').click();
  await expect(page.locator('#posts-tab-people')).toBeVisible();
  expect(page.appErrors).toEqual([]);
});

test('یادداشت‌ها: تب «بسته‌های تحلیلی» و برگشت به گالری چهره‌ها', async ({ page }) => {
  await openAs(page, 'viewer', 'people/figures');
  await page.locator('#people-page-tabs [data-people-tab="archive"]').click();
  await expect(page.locator('#people-tab-archive')).toBeVisible();
  await expect(page.locator('#people-tab-figures')).toBeHidden();
  await page.locator('#people-page-tabs [data-people-tab="orgs"]').click();
  await expect(page.locator('#people-tab-figures')).toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#people/orgs');
  expect(page.appErrors).toEqual([]);
});

test('مواضع: تب‌ها گالری مشترک را نشان می‌دهند و برگشت به «یادداشت‌ها» آن را سر جایش می‌برد', async ({ page }) => {
  await openAs(page, 'viewer', 'positions/leader');
  await page.locator('#positions-page-tabs [data-pos-tab="maraji"]').click();
  await expect(page.locator('#positions-page-tabs [data-pos-tab="maraji"]')).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#positions/maraji');
  // ظرف گالری الان داخل «مواضع»ه و منابع show_in_positions رو نشون می‌ده
  await expect(page.locator('#positions-pf-slot #people-tab-figures')).toBeVisible();
  await expect(page.locator('#pf-logo-grid > *').first()).toBeVisible();
  await page.goBack();
  await expect(page.locator('#positions-page-tabs [data-pos-tab="leader"]')).toHaveClass(/active/);
  if (await page.locator('#side-nav').isVisible()) { // رایانه‌ی پهن: ستون کناری (۵.۳۸.۰)
    await page.locator('#side-nav .sn-item[data-nav="people"]').click();
    await page.locator('#side-nav button[data-nav="people/figures"]').click();
  } else {
    await page.click('#nav-menu-btn');
    await page.locator('#nav-menu button[data-nav="people/figures"]').click();
  }
  await expect(page.locator('#sec-people #people-tab-figures')).toBeVisible();
  expect(page.appErrors).toEqual([]);
});

// ۵.۴۱.۰: نمای خواندن در کنشگری و فید منبع یادداشت‌ها (فقط رایانه)
test('نمای خواندن: پست‌های کنشگری و فید منبع یادداشت‌ها', async ({ page, isMobile }) => {
  test.skip(isMobile, 'نمای خواندن فقط رایانه');
  await openAs(page, 'viewer', 'posts/feed');
  await expect(page.locator('#posts-list')).toHaveClass(/reader-view/);
  const rows = page.locator('#posts-list .nr-row');
  await rows.nth(1).click();
  await expect(rows.nth(1)).toHaveClass(/on/);
  await expect(page.locator('#nrp-pane .news-card')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(2)).toHaveClass(/on/);
  await page.locator('[data-rv="cards"]:visible').click();
  await expect(page.locator('#posts-list')).toHaveClass(/grid-view/);
  await expect(page.locator('#posts-list .nr-row')).toHaveCount(0);
  await page.locator('[data-rv="reader"]:visible').click();
  await expect(page.locator('#posts-list')).toHaveClass(/reader-view/);
  await page.goto(page.url().replace(/#.*$/, '#people/figures'));
  await page.locator('#pf-logo-grid > *').first().click();
  await expect(page.locator('#political-figures-list')).toHaveClass(/reader-view/);
  await expect(page.locator('#nrf-pane .news-card')).toBeVisible();
  expect(page.appErrors).toEqual([]);
});
