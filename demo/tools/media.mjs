// تصویرها و فایل‌های نمونه‌ی نسخه‌ی نمایشی (با مرورگر Playwright، همه ساختگی):
// جلد روزنامه‌ها، جلد و PDF «بسته تحلیلی جریان» و بسته‌های سایر نهادها، داشبوردهای «برنامه مدارس»،
// تصویر پست‌ها و نشان منابع.   npm run demo:data && npm run demo:media
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STORIES } from '../data/content-news.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const BUILD = resolve(HERE, '../build');
const M = JSON.parse(readFileSync(resolve(BUILD, 'media-manifest.json'), 'utf8'));
// فونت و نشان به‌صورت data: (صفحه‌ی setContent اجازه‌ی خواندن file:// را ندارد)
const FONT = 'data:font/woff2;base64,' + readFileSync(resolve(ROOT, 'design/fonts/IRANSansXV.woff2')).toString('base64');
const LOGO = 'data:image/svg+xml;base64,' + readFileSync(resolve(ROOT, 'design/icons/jarian-mark.svg')).toString('base64');
const dirs = { media: resolve(BUILD, 'media'), sign: resolve(BUILD, 'sb/storage/v1/object/sign') };
rmSync(dirs.media, { recursive: true, force: true });
rmSync(resolve(BUILD, 'sb'), { recursive: true, force: true });
for (const d of ['posts', 'newspapers', 'magazines', 'archive', 'avatars']) mkdirSync(resolve(dirs.media, d), { recursive: true });
for (const d of ['magazines', 'archive-reports', 'school-reports']) mkdirSync(resolve(dirs.sign, d), { recursive: true });

const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
// روز هفته و تاریخ جدا (ترکیبشان در Chromium «۱۴۰۵ آذر ۳, سه‌شنبه» می‌شود)
const jdate = (iso) => { const d = new Date(iso + 'T12:00:00Z'); return new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', weekday: 'long' }).format(d) + ' ' + new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', day: 'numeric', month: 'long', year: 'numeric' }).format(d); };
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

const BASE = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:F;src:url(${FONT}) format('woff2');font-weight:100 900}
*{box-sizing:border-box;margin:0;padding:0}body{font-family:F,Tahoma,sans-serif;color:#16202a}
.lines i{display:block;height:9px;background:#c9ccc6;border-radius:3px;margin:0 0 9px}
</style></head><body>`;

// یک «تصویر» انتزاعی (به‌جای عکس خبری) — شکل‌های هندسی با رنگ‌های آرام
function art(w, h, hue, extra = '') {
  let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},28%,32%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},30%,18%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>`;
  for (let i = 0; i < 7; i++) {
    const r = 40 + rnd() * (w / 3);
    s += `<circle cx="${rnd() * w}" cy="${rnd() * h}" r="${r}" fill="hsla(${(hue + i * 25) % 360},45%,${55 + rnd() * 25}%,${0.08 + rnd() * 0.16})"/>`;
  }
  s += `<path d="M0 ${h * 0.72} Q ${w * 0.3} ${h * 0.55} ${w * 0.55} ${h * 0.7} T ${w} ${h * 0.62} V ${h} H 0Z" fill="rgba(234,179,147,.18)"/>${extra}</svg>`;
  return s;
}
const lines = (n, w = [100, 96, 92, 98, 88]) => `<div class="lines">${Array.from({ length: n }, (_, i) => `<i style="width:${w[i % w.length] - (i % 3) * 2}%"></i>`).join('')}</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function shot(html, w, h, file, type = 'jpeg') {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(BASE + html + '</body></html>', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const buf = await page.screenshot({ type: 'png' });
  // PNG → WebP با canvas خودِ مرورگر (این رایانه ImageMagick ندارد)
  const webp = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/webp', 0.82).split(',')[1];
  }, buf.toString('base64'));
  writeFileSync(file, Buffer.from(webp, 'base64'));
}
async function pdf(html, file) {
  await page.setContent(BASE + html + '</body></html>', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: file, format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
}

// ── تصویر پست‌ها ──
for (const p of M.posts) {
  const hue = Math.floor(rnd() * 360);
  const html = p.quote
    ? `<div style="width:1080px;height:1080px;background:#16202a;color:#fff;display:flex;flex-direction:column;justify-content:center;padding:110px;position:relative">
        <div style="position:absolute;inset:0;opacity:.55">${art(1080, 1080, hue)}</div>
        <div style="position:relative;font-size:120px;color:#EAB393;line-height:.6">«</div>
        <div style="position:relative;font-size:64px;font-weight:800;line-height:1.55">${p.title}</div>
        <div style="position:relative;margin-top:50px;font-size:34px;color:#EAB393">${p.tags[0]}</div></div>`
    : `<div style="width:1200px;height:675px;position:relative;overflow:hidden">${art(1200, 675, hue)}
        <div style="position:absolute;inset:auto 0 0 0;padding:44px 56px;background:linear-gradient(transparent,rgba(10,14,20,.85));color:#fff">
        <span style="display:inline-block;background:#EAB393;color:#16202a;border-radius:999px;padding:4px 18px;font-size:24px;font-weight:700">${p.tags[0]}</span>
        <div style="font-size:44px;font-weight:800;line-height:1.5;margin-top:14px">${p.title}</div></div></div>`;
  await shot(html, p.quote ? 1080 : 1200, p.quote ? 1080 : 675, resolve(dirs.media, 'posts', p.k + '.webp'));
}

// ── جلد روزنامه‌ها ──
for (const n of M.newspapers) {
  const hue = Math.floor(rnd() * 360);
  const html = `<div style="width:900px;height:1260px;background:#f6f3ec;padding:36px 40px;display:flex;flex-direction:column;gap:18px">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:6px double ${n.color};padding-bottom:10px">
      <div style="font-size:108px;font-weight:900;color:${n.color};line-height:1">${n.title}</div>
      <div style="text-align:left;font-size:20px;color:#444;line-height:1.7">${jdate(n.day)}<br>سال ${fa(12 + Math.floor(rnd() * 20))}، شماره‌ی ${fa(3000 + Math.floor(rnd() * 900))}<br>۱۶ صفحه — ${fa(10000)} تومان</div></div>
    <div style="font-size:54px;font-weight:900;line-height:1.35">${n.headline}</div>
    <div style="font-size:24px;color:#3a3a3a;line-height:1.7">${n.sub}</div>
    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:22px;flex:1">
      <div style="display:flex;flex-direction:column;gap:14px">
        <div style="height:400px;overflow:hidden;border-radius:4px">${art(560, 400, hue)}</div>${lines(9)}</div>
      <div style="display:flex;flex-direction:column;gap:16px;border-right:2px solid #d6d1c4;padding-right:20px">
        <div style="font-size:30px;font-weight:800;line-height:1.5">${n.other}</div>${lines(7)}
        <div style="font-size:26px;font-weight:800;line-height:1.5;border-top:2px solid #d6d1c4;padding-top:14px">${n.third}</div>${lines(8)}</div></div>
    <div style="display:flex;gap:14px">${[0, 1, 2].map((i) => `<div style="flex:1;background:${i === 1 ? n.color : '#e6e1d6'};color:${i === 1 ? '#fff' : '#16202a'};padding:14px;border-radius:4px;font-size:20px;font-weight:700">${STORIES[(i * 4 + n.title.length) % STORIES.length].title.slice(0, 48)}…</div>`).join('')}</div></div>`;
  await shot(html, 900, 1260, resolve(dirs.media, 'newspapers', n.file + '.webp'));
}

// ── جلد و PDF بسته‌ها ──
function cover(title, kicker, no, theme, org) {
  return `<div style="width:800px;height:1130px;background:${theme};color:#fff;position:relative;overflow:hidden;padding:70px 64px;display:flex;flex-direction:column">
    <div style="position:absolute;inset:0;opacity:.6">${art(800, 1130, Math.floor(rnd() * 360))}</div>
    <div style="position:relative;display:flex;align-items:center;gap:16px"><img src="${LOGO}" style="height:64px"><div style="font-size:30px;font-weight:800">${kicker}</div></div>
    <div style="position:relative;margin-top:auto;font-size:28px;color:#EAB393;font-weight:700">${no}</div>
    <div style="position:relative;font-size:64px;font-weight:900;line-height:1.4;margin-top:14px">${title}</div>
    <div style="position:relative;margin-top:30px;height:6px;width:140px;background:#EAB393;border-radius:3px"></div>
    <div style="position:relative;margin-top:24px;font-size:24px;opacity:.85">${org}</div></div>`;
}
function bars(vals, color) {
  const max = Math.max(...vals);
  return `<div style="display:flex;align-items:flex-end;gap:14px;height:220px;border-bottom:2px solid #ccd">${vals.map((v, i) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px"><b style="font-size:15px">${fa(v)}</b><div style="width:100%;height:${(v / max) * 180}px;background:${i % 2 ? '#EAB393' : color};border-radius:6px 6px 0 0"></div></div>`).join('')}</div>`;
}
function report(title, org, theme) {
  const sections = STORIES.slice(0, 5).map((s, i) => `
    <section style="page-break-before:${i ? 'always' : 'auto'};padding:70px 70px;min-height:1120px">
      <div style="font-size:16px;color:#888">${org}</div>
      <h2 style="font-size:34px;margin:10px 0 24px;color:${theme}">${fa(i + 1)}. ${s.title}</h2>
      <p style="font-size:19px;line-height:2.1;text-align:justify">${s.body} ${s.body}</p>
      <h3 style="font-size:22px;margin:34px 0 14px">حجم بازتاب رسانه‌ای (تعداد مطلب در روز)</h3>
      ${bars([12, 18, 26, 41, 33, 22, 15].map((v) => v + i * 3), theme)}
      <h3 style="font-size:22px;margin:34px 0 14px">جمع‌بندی و پیشنهاد</h3>
      <p style="font-size:19px;line-height:2.1;text-align:justify">مرور روایت‌ها نشان می‌دهد این موضوع در شبکه‌های اجتماعی سریع‌تر از رسانه‌های رسمی بازتاب یافته است. پیشنهاد می‌شود اطلاع‌رسانی شفاف و به‌موقع، و پاسخ به پرسش‌های پرتکرار مخاطبان در اولویت قرار گیرد.</p>
    </section>`).join('');
  return `<section style="height:1123px;background:${theme};color:#fff;display:flex;flex-direction:column;justify-content:center;padding:90px">
    <img src="${LOGO}" style="height:80px;align-self:flex-start"><div style="font-size:52px;font-weight:900;line-height:1.4;margin-top:40px">${title}</div>
    <div style="margin-top:24px;font-size:22px;color:#EAB393">${org}</div></section>${sections}`;
}
for (const m of M.magazines) {
  await shot(cover(m.title, 'بسته تحلیلی جریان', 'شماره‌ی ' + m.no, m.theme, 'نسخه‌ی نمایشی — محتوای نمونه'), 800, 1130, resolve(dirs.media, 'magazines', m.file + '.webp'));
  await pdf(report(m.title, 'بسته تحلیلی جریان — شماره‌ی ' + m.no, m.theme), resolve(dirs.sign, 'magazines', m.file + '.pdf'));
}
for (const a of M.archive) {
  await shot(cover(a.title, a.org, 'گزارش پژوهشی', a.theme, 'نسخه‌ی نمایشی — محتوای نمونه'), 800, 1130, resolve(dirs.media, 'archive', a.file + '.webp'));
  await pdf(report(a.title, a.org, a.theme), resolve(dirs.sign, 'archive-reports', a.file + '.pdf'));
}

// ── برنامه مدارس (داشبوردهای شبیه Power BI) ──
const PROV = ['مشهد', 'نیشابور', 'سبزوار', 'تربت حیدریه', 'قوچان', 'کاشمر', 'گناباد', 'تربت جام'];
for (const s of M.school) {
  const vals = PROV.map(() => 20 + Math.floor(rnd() * 80));
  const kpi = (t, v, c) => `<div style="background:#fff;border-radius:12px;padding:18px 22px;border-top:5px solid ${c}"><div style="font-size:18px;color:#667">${t}</div><div style="font-size:44px;font-weight:900">${v}</div></div>`;
  const table = `<table style="width:100%;border-collapse:collapse;font-size:18px">${['مدرسه', 'برنامه‌ها', 'شرکت‌کننده', 'رضایت'].map((h) => `<th style="text-align:right;padding:10px;background:#16202a;color:#fff">${h}</th>`).join('')}${PROV.map((p, i) => `<tr style="background:${i % 2 ? '#f1f4ef' : '#fff'}"><td style="padding:9px 10px">مدرسه‌ی علمیه‌ی ${p}</td><td>${fa(vals[i] % 17 + 3)}</td><td>${fa(vals[i] * 7)}</td><td>${fa(70 + (vals[i] % 25))}٪</td></tr>`).join('')}</table>`;
  const html = `<div style="width:1600px;height:700px;background:#edf1ec;padding:34px;display:flex;flex-direction:column;gap:22px">
    <div style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:34px;font-weight:900">${s.title}</div><div style="font-size:18px;color:#667">برنامه‌ی فرهنگی مدارس علمیه — داده‌ی نمونه</div></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:18px">${kpi('مدارس فعال', fa(86 + s.variant), '#16202a')}${kpi('برنامه‌های برگزارشده', fa(412 + s.variant * 17), '#EAB393')}${kpi('شرکت‌کنندگان', fa(18240 + s.variant * 311), '#2d5d50')}${kpi('میانگین رضایت', fa(84) + '٪', '#1f3a7a')}</div>
    <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:18px;flex:1">
      <div style="background:#fff;border-radius:12px;padding:20px"><div style="font-size:20px;font-weight:800;margin-bottom:14px">برنامه‌ها به تفکیک شهرستان</div>${bars(vals, '#16202a')}
        <div style="display:flex;gap:14px;margin-top:8px">${PROV.map((p) => `<span style="flex:1;text-align:center;font-size:14px">${p}</span>`).join('')}</div></div>
      <div style="background:#fff;border-radius:12px;padding:20px;overflow:hidden">${table}</div></div></div>`;
  if (s.kind === 'pdf') await pdf(`<div style="padding:60px">${html.replace('width:1600px;height:700px;', 'width:100%;')}<div style="height:30px"></div><h2 style="font-size:28px;margin-bottom:16px">جزئیات</h2>${table}</div>`, resolve(dirs.sign, 'school-reports', s.file));
  else await shot(html, 1600, 700, resolve(dirs.sign, 'school-reports', s.file));
}

await browser.close();

// ── نشان منابع (SVG ساده، بدون مرورگر) ──
const PAL = ['#16202a', '#2d5d50', '#7a1f1f', '#1f3a7a', '#b5651d', '#4a2c6b', '#0b6e8a', '#5a1f4f', '#3b3b3b', '#8a5a00'];
for (const a of M.avatars) {
  const SKIP = /^(خبرگزاری|پایگاه|کانال|شبکه‌ی|روزنامه‌ی|دفتر|دکتر|مهندس|حجت‌الاسلام|آیت‌الله|العظمی|سید|اندیشکده‌ی|پژوهشکده‌ی|مرکز|رسانه‌ی|اطلاع‌رسانی|خبری|تحلیلی)$/;
  const words = a.title.replace(/\(.*?\)/g, '').split(/\s+/).filter((w) => w && !SKIP.test(w));
  const ini = (words[0] || '؟')[0] + (words[1] ? '‌' + words[1][0] : '');
  const c = PAL[a.id % PAL.length];
  writeFileSync(resolve(dirs.media, 'avatars', a.id + '.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="20" fill="${c}"/><circle cx="78" cy="18" r="30" fill="#EAB393" opacity=".18"/><text x="48" y="58" text-anchor="middle" font-family="Tahoma,Vazirmatn,sans-serif" font-size="34" font-weight="700" fill="#fff">${ini}</text></svg>`);
}
console.log('تصویرها ساخته شد:', Object.entries(M).map(([k, v]) => k + ' ' + v.length).join('، '));
