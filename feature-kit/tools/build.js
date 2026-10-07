// ساخت «فهرست امکانات سامانه جریان» (feature-kit) از متن اصلی
//   feature-kit/امکانات سامانه جریان.md  →  HTML مستقل (فونت داخل خودش) + PDF + زیپ
//
// اجرا از ریشه‌ی ریپو:
//   NODE_PATH=/opt/node22/lib/node_modules node feature-kit/tools/build.js
// خروجی: feature-kit/فهرست امکانات سامانه جریان.zip (+ پیش‌نمایش صفحه‌ها در OUT اگه env OUT داده بشه)
//
// {{VERSION}} از APP_VERSION فرانت‌اند و {{DATE}} تاریخ شمسی امروز (تهران) پر می‌شن.
// مبدل markdown عمداً کوچیکه و فقط همین‌ها رو می‌فهمه: # ## (تیتر)، - (فهرست، تورفتگی ۲ فاصله)،
// **پررنگ**، `کد`، --- (خط جداکننده) و پاراگراف ساده.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const KIT = path.join(ROOT, 'feature-kit');
const NAME = 'فهرست امکانات سامانه جریان';
const SRC = path.join(KIT, 'امکانات سامانه جریان.md');

const fa = s => String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code dir="ltr">$1</code>');

function mdToHtml(md){
  const out = [];
  const stack = []; // تورفتگی‌های <ul> باز
  const closeTo = depth => { while(stack.length > depth){ out.push('</li></ul>'); stack.pop(); } };
  let first = true;
  for(const raw of md.split('\n')){
    const line = raw.replace(/\s+$/, '');
    const li = line.match(/^(\s*)- (.*)$/);
    if(li){
      const depth = Math.floor(li[1].length / 2) + 1;
      if(depth > stack.length){ while(stack.length < depth){ out.push('<ul>'); stack.push(1); } }
      else{ closeTo(depth); out.push('</li>'); }
      out.push('<li>' + inline(li[2]));
      continue;
    }
    closeTo(0);
    if(!line.trim()) continue;
    if(line === '---'){ out.push('<hr>'); continue; }
    const h = line.match(/^(#{1,3}) (.*)$/);
    if(h){
      const n = h[1].length;
      if(n === 1 && first){ first = false; continue; } // تیتر اصلی روی جلد می‌آد
      out.push(`<h${n}${n === 1 ? ' class="part"' : ''}>${inline(h[2])}</h${n}>`);
      continue;
    }
    out.push('<p>' + inline(line) + '</p>');
  }
  closeTo(0);
  return out.join('\n');
}

// فهرست مطالب جلد: هر «#» یک ستون، «##»های زیرش ردیف‌ها
function tocHtml(md){
  const parts = [];
  let first = true;
  for(const line of md.split('\n')){
    const h1 = line.match(/^# (.*)$/), h2 = line.match(/^## (.*)$/);
    if(h1){ if(first){ first = false; continue; } parts.push({ t: h1[1], items: [] }); }
    else if(h2 && parts.length) parts[parts.length - 1].items.push(h2[1]);
  }
  return '<nav class="toc">' + parts.map(p => `<div><div class="toc-h">${inline(p.t)}</div><ol>${p.items.map(i => `<li>${inline(i.replace(/^[۰-۹0-9]+\.\s*/, ''))}</li>`).join('')}</ol></div>`).join('') + '</nav>';
}

function build(logoPng){
  const html = fs.readFileSync(path.join(ROOT, 'design', 'ita-monitoring-prototype.html'), 'utf8');
  const version = (html.match(/const APP_VERSION = '([\d.]+)'/) || [])[1] || '';
  const date = new Date().toLocaleDateString('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', day: 'numeric', month: 'long', year: 'numeric' });
  const md = fs.readFileSync(SRC, 'utf8').replace(/\{\{VERSION\}\}/g, fa(version)).replace(/\{\{DATE\}\}/g, date);
  const title = md.match(/^# (.*)$/m)[1];
  const subtitle = (md.split('\n').find(l => l.startsWith('نسخه')) || '');
  const body = mdToHtml(md.split('\n').filter(l => l !== subtitle).join('\n'));
  const font = fs.readFileSync(path.join(ROOT, 'design', 'fonts', 'IRANSansXV.woff2')).toString('base64');
  // لوگو به‌صورت PNG (ماسک SVG در PDF کروم یه قاب نازک دورش می‌کشید)
  const logo = `<img src="data:image/png;base64,${logoPng}" alt="">`;
  const doc = `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
@font-face{ font-family:'IRANSansX'; src:url(data:font/woff2;base64,${font}) format('woff2'); font-weight:100 900; }
:root{ --navy:#16202a; --peach:#EAB393; --brown:#B5651D; --text:#16202a; --dim:#4b5563; --line:#e6e9ee; }
*{ box-sizing:border-box; }
html{ background:#eef1f5; }
body{ margin:0; font-family:'IRANSansX',Tahoma,sans-serif; color:var(--text); line-height:2; font-size:14px; }
.page{ max-width:820px; margin:0 auto; background:#fff; padding:0 56px 48px; }
.cover{ background:var(--navy); color:#fff; margin:0 -56px 28px; padding:72px 56px 56px; text-align:center; }
.cover img{ width:96px; height:auto; display:block; margin:0 auto 18px; }
.toc{ display:grid; grid-template-columns:1fr 1fr; gap:24px; margin:8px 0 12px; }
.toc-h{ font-weight:800; color:var(--navy); border-bottom:2px solid var(--peach); padding-bottom:4px; margin-bottom:6px; }
.toc ol{ list-style-type:persian; margin:0; padding-right:22px; color:var(--dim); font-size:13px; line-height:2.1; }
.toc ol li::marker{ color:var(--brown); font-weight:700; }
.cover h1{ font-size:30px; font-weight:800; margin:0 0 6px; color:#fff; }
.cover .tag{ color:var(--peach); font-size:15px; margin:0 0 18px; }
.cover .ver{ display:inline-block; font-size:13px; color:var(--peach); border:1px solid rgba(234,179,147,.4); border-radius:999px; padding:3px 16px; }
h1.part{ font-size:22px; font-weight:800; margin:34px 0 8px; padding:10px 16px; background:var(--navy); color:var(--peach); border-radius:10px; }
h2{ font-size:17px; font-weight:800; margin:24px 0 6px; padding-bottom:4px; border-bottom:2px solid var(--peach); color:var(--navy); }
ul{ margin:4px 0; padding-right:22px; }
li{ margin:2px 0; }
li::marker{ color:var(--brown); }
ul ul{ padding-right:20px; } ul ul li::marker{ color:#c9a184; }
b{ color:var(--navy); }
code{ font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12px; background:#f3f4f6; padding:0 4px; border-radius:4px; }
hr{ border:none; height:0; margin:0; }
p{ margin:6px 0; color:var(--dim); }
.foot{ margin-top:36px; padding-top:12px; border-top:1px solid var(--line); font-size:12px; color:#6b7280; text-align:center; }
@media print{
  html{ background:#fff; } .page{ max-width:none; padding:0 4mm; }
  .cover{ margin:0 -4mm 10mm; padding:30mm 10mm 26mm; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  h1.part{ break-before:page; margin-top:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  h2{ break-after:avoid; } li{ break-inside:avoid; }
  .foot{ display:none; } /* شماره‌ی صفحه و نسخه روی جلد هست؛ پانویس صفحه‌ی خالی می‌ساخت */
}
@media (max-width:640px){ .toc{ grid-template-columns:1fr; } .page{ padding:0 16px 32px; } .cover{ margin:0 -16px 20px; padding:48px 16px 36px; } }
</style></head>
<body><div class="page">
<header class="cover">${logo}<h1>${esc(title)}</h1><p class="tag">رصد و تحلیل فضای سیاسی‌اجتماعی</p><span class="ver">${esc(subtitle)}</span></header>
<h2 class="toc-title">فهرست</h2>
${tocHtml(md)}
${body}
<div class="foot">سامانه‌ی هوشمند جریان — ${esc(subtitle)}</div>
</div></body></html>`;
  return { doc, md, version };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const lp = await browser.newPage({ deviceScaleFactor: 4 });
  await lp.setContent('<body style="margin:0;background:transparent">' + fs.readFileSync(path.join(ROOT, 'design', 'icons', 'jarian-mark.svg'), 'utf8').replace('<svg ', '<svg width="96" ') + '</body>');
  const logoPng = (await (await lp.$('svg')).screenshot({ omitBackground: true })).toString('base64');
  await lp.close();
  const { doc, md, version } = build(logoPng);
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'fkit-'));
  const dir = path.join(tmp, NAME);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, NAME + '.html'), doc);
  fs.writeFileSync(path.join(dir, NAME + '.md'), md);
  fs.writeFileSync(path.join(dir, 'README-FA.txt'), [
    NAME,
    '',
    'نسخه‌ی سامانه: ' + fa(version),
    '',
    'فایل‌ها:',
    '  ' + NAME + '.pdf   — نسخه‌ی چاپی و قابل ارسال',
    '  ' + NAME + '.html  — همان متن برای باز کردن در مرورگر (روی گوشی هم خواناست؛ بدون اینترنت کار می‌کند)',
    '  ' + NAME + '.md    — متن ساده‌ی قابل ویرایش (با هر ویرایشگر متن)',
    '',
    'این بسته با هر تغییر در امکانات سامانه به‌روز می‌شود.',
    '',
  ].join('\r\n'));
  const page = await browser.newPage();
  await page.setContent(doc, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: path.join(dir, NAME + '.pdf'), format: 'A4', printBackground: true,
    margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' },
    displayHeaderFooter: true, headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;text-align:center;font-size:9px;color:#9ca3af;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  });
  await browser.close();
  if(process.env.OUT){
    fs.mkdirSync(process.env.OUT, { recursive: true });
    execFileSync('pdftoppm', ['-png', '-r', '60', path.join(dir, NAME + '.pdf'), path.join(process.env.OUT, 'fk-page')]);
    fs.copyFileSync(path.join(dir, NAME + '.html'), path.join(process.env.OUT, 'feature-kit.html'));
  }
  const zipPath = path.join(KIT, NAME + '.zip');
  execFileSync('python3', ['-c', `
import zipfile, os, sys
src, dst = sys.argv[1], sys.argv[2]
base = os.path.dirname(src)
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(src):
        for f in sorted(files):
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, base))
`, dir, zipPath]);
  console.log('built', zipPath, 'version', version);
})();
