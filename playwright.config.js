// آزمون‌های مرورگر سایت با داده‌ی ساختگی (tests/e2e). اجرا: npm test
import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const PORT = Number(process.env.PORT || 4173);
// محیط Claude Code مرورگر آماده دارد؛ روی CI مرورگر خود Playwright نصب می‌شود
const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = existsSync(LOCAL_CHROMIUM) && !process.env.CI ? { executablePath: LOCAL_CHROMIUM } : {};

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    // تا قبل از ابزار ساخت، فایل‌های design/ همان‌طور که هستند سرو می‌شوند
    command: `python3 -m http.server ${PORT} --directory ${process.env.SITE_DIR || 'design'}`,
    url: `http://localhost:${PORT}/ita-monitoring-prototype.html`,
    // SITE_DIR=dist/design (npm run test:dist) همیشه سرور تازه، تا سرور قدیمی design/ اشتباهی آزموده نشه
    reuseExistingServer: !process.env.CI && !process.env.SITE_DIR,
    stdout: 'ignore',
  },
});
