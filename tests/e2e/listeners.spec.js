// دکمه‌هایی که در مرحله‌ی ۳ ماژولار کردن از onclick درون HTML به addEventListener رفتن
// (صفحه‌بندی، مرتب‌سازی گوشی، «نمایش همه/بیشتر»، ویرایش سایت خزنده) واقعاً کار می‌کنن
import { test, expect, openAs } from './support/fixtures.js';

const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();

test('صفحه‌بندی فید اخبار', async ({ page }) => {
  await openAs(page, 'viewer', 'overview/study');
  const pager = page.locator('#news-pagination');
  await pager.locator('button[data-page="2"]').first().click();
  await expect(pager.locator('button.active')).toHaveText('۲');
  await pager.getByRole('button', { name: 'قبلی' }).click();
  await expect(pager.locator('button.active')).toHaveText('۱');
  expect(page.appErrors).toEqual([]);
});

test('مرتب‌سازی «افراد و مجموعه‌ها» روی گوشی', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'فهرست کشویی فقط روی گوشی دیده می‌شود');
  await openAs(page, 'viewer', 'posts/people');
  const firstName = () => page.locator('#cyber-people-grid > *').first().innerText();
  await page.selectOption('#cyber-people-sort-m', 'name:asc');
  const asc = await firstName();
  await page.selectOption('#cyber-people-sort-m', 'subscribers:desc');
  await expect.poll(firstName).not.toBe(asc);
  expect(page.appErrors).toEqual([]);
});

test.describe('مدیر', () => {
  test.use({
    mockData: {
      login_events: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, created_at: ago(i + 0.1), success: true, role: 'app_viewer', user_agent: 'Mozilla/5.0 (Windows NT 10.0)', ip: '5.120.1.' + i, user_id: 1, user_name: 'کاربر آزمایشی' })),
      admin_audit: Array.from({ length: 60 }, (_, i) => ({ id: i + 1, created_at: ago(i + 0.1), op: 'update', tbl: 'channels', label: 'منبع ' + (i + 1), changes: { title: ['الف', 'ب'] }, user_agent: 'Mozilla/5.0 (Windows NT 10.0)', ip: '5.120.1.1' })),
      crawl_sites: [
        { id: 7, name: 'سایت نمونه', url: 'https://example.com/', sitemap_url: null, active: true, source: 'manual', last_run_at: ago(2), last_pages: 12, last_found: 1, last_error: null },
        { id: 8, name: 'سایت دوم', url: 'https://example.org/', sitemap_url: null, active: true, source: 'manual', last_run_at: null },
      ],
    },
  });

  test('ورودها: «نمایش همه» و «نمایش کمتر»', async ({ page }) => {
    await openAs(page, 'admin', 'status');
    const rows = page.locator('#sys-logins tbody tr');
    await expect(rows).toHaveCount(15);
    await page.locator('#sys-logins [data-act="logins-toggle"]').click();
    await expect(rows).toHaveCount(20);
    await page.locator('#sys-logins [data-act="logins-toggle"]').click();
    await expect(rows).toHaveCount(15);
    expect(page.appErrors).toEqual([]);
  });

  test('دفتر تغییرات: «نمایش بیشتر»', async ({ page }) => {
    await openAs(page, 'admin', 'activity/audit');
    const rows = page.locator('#act-audit tbody tr');
    await expect(rows).toHaveCount(50);
    await page.locator('#act-audit [data-act="audit-more"]').click();
    await expect(rows).toHaveCount(60);
    expect(page.appErrors).toEqual([]);
  });

  test('منابع خزنده: «ویرایش» و «انصراف»', async ({ page }) => {
    await openAs(page, 'admin', 'settings');
    await page.locator('#crawl-sites-panel > summary').click();
    const list = page.locator('#crawl-site-list');
    await list.locator('.crawl-site', { hasText: 'سایت نمونه' }).getByRole('button', { name: 'ویرایش' }).click();
    await expect(page.locator('#crawl-edit-name')).toHaveValue('سایت نمونه');
    await list.getByRole('button', { name: 'انصراف' }).click();
    await expect(page.locator('#crawl-edit-name')).toHaveCount(0);
    expect(page.appErrors).toEqual([]);
  });
});
