// Service worker «جریان» (PWA) — فقط برای قابل‌نصب‌شدن و سریع‌تر بازشدن اپ.
// ⚠️ درخواست‌های سوپابیس و هر دامنه‌ی بیرونی (CDN) اصلاً رهگیری نمی‌شن تا
// داده‌ها همیشه زنده بمونن. فایل‌های ثابت هم‌دامنه (فونت/تصویر/کتابخونه/آیکون)
// cache-first؛ خودِ صفحه network-first تا هر انتشار جدید فوراً دیده بشه.
// با تغییر فهرست فایل‌های ثابت یا منطق این فایل، CACHE رو یک شماره بالا ببر.
const CACHE = 'jarian-static-v3';
const PRECACHE = [
  'ita-monitoring-prototype.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'fonts/IRANSansXV.woff2',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('jarian-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // سوپابیس/CDN: دست‌نخورده

  if (req.mode === 'navigate' || url.pathname.endsWith('.html')) {
    // cache:'no-cache' — بدون این، کش HTTP مرورگر (گیت‌هاب پیجز: max-age=600)
    // تا ۱۰ دقیقه بعد از هر انتشار نسخه‌ی قبلی رو به اپ نصب‌شده می‌داد؛ حالا همیشه
    // از سرور تازه‌سنجی می‌شه (اگه عوض نشده باشه، فقط یه پاسخ ۳۰۴ کوچیک)
    event.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('ita-monitoring-prototype.html')))
    );
    return;
  }

  if (/\/(fonts|images|vendor|icons)\//.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }))
    );
  }
});
