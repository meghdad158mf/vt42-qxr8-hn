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

// markdown → HTML: «# بخش …» = نوار بخش (از صفحه‌ی تازه)، پاراگراف بعدش = توضیح بخش؛
// «## ۱. عنوان» = کارت با شماره‌ی هلویی؛ بقیه فهرست و پاراگراف
function mdToHtml(md){
  const out = [];
  const stack = []; // تورفتگی‌های <ul> باز
  const closeTo = depth => { while(stack.length > depth){ out.push('</li></ul>'); stack.pop(); } };
  let first = true, inCard = false, partOpen = false;
  const closeCard = () => { closeTo(0); if(inCard){ out.push('</div></section>'); inCard = false; } };
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
    if(!line.trim() || line === '---') continue;
    const h = line.match(/^(#{1,3}) (.*)$/);
    if(h && h[1].length === 1){
      if(first){ first = false; continue; } // تیتر اصلی روی جلد می‌آد
      closeCard();
      const [label, ...rest] = h[2].split(':');
      const n = partOpen ? '۲' : '۱'; partOpen = true;
      out.push(`<header class="part"><span class="part-n">${n}</span><div><span class="part-label">${inline(label.trim())}</span><h1>${inline(rest.join(':').trim() || label)}</h1>`);
      out.push('<!--part-desc--></div></header>');
      continue;
    }
    if(h){
      closeCard();
      const m = h[2].match(/^([۰-۹0-9]+)\.\s*(.*)$/);
      out.push(`<section class="card"><header class="card-h"><span class="num">${m ? m[1] : '•'}</span><h2>${inline(m ? m[2] : h[2])}</h2></header><div class="card-b">`);
      inCard = true;
      continue;
    }
    // پاراگراف درست بعد از نوار بخش = توضیح همان بخش
    const last = out.length - 1;
    if(last >= 0 && out[last] === '<!--part-desc--></div></header>'){ out[last] = `<p class="part-desc">${inline(line)}</p></div></header>`; continue; }
    out.push('<p>' + inline(line) + '</p>');
  }
  closeCard();
  return out.join('\n').replace(/<!--part-desc-->/g, '');
}

// فهرست مطالب: هر «#» یک کارت، «##»های زیرش ردیف‌ها
function tocHtml(md){
  const parts = [];
  let first = true;
  for(const line of md.split('\n')){
    const h1 = line.match(/^# (.*)$/), h2 = line.match(/^## (.*)$/);
    if(h1){ if(first){ first = false; continue; } parts.push({ t: h1[1], items: [] }); }
    else if(h2 && parts.length) parts[parts.length - 1].items.push(h2[1]);
  }
  return '<nav class="toc">' + parts.map(p => {
    const [label, ...rest] = p.t.split(':');
    return `<div class="toc-card"><div class="toc-h"><span>${inline(label.trim())}</span>${inline(rest.join(':').trim())}</div><ol>${p.items.map(i => `<li>${inline(i.replace(/^[۰-۹0-9]+\.\s*/, ''))}</li>`).join('')}</ol></div>`;
  }).join('') + '</nav>';
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
  const logo = `<img class="logo" src="data:image/png;base64,${logoPng}" alt="">`;
  // قوس هلویی جلد — هم‌خانواده‌ی «مدار» صفحه‌ی نخست سایت
  const orbit = `<svg class="orbit" viewBox="0 0 800 400" preserveAspectRatio="none" aria-hidden="true"><path d="M -40 330 Q 400 40 840 330" fill="none" stroke="#EAB393" stroke-opacity=".35" stroke-width="1.6"/><path d="M -40 372 Q 400 120 840 372" fill="none" stroke="#EAB393" stroke-opacity=".16" stroke-width="1.2"/><circle cx="400" cy="185" r="4" fill="#EAB393" fill-opacity=".7"/></svg>`;
  const doc = `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
@font-face{ font-family:'IRANSansX'; src:url(data:font/woff2;base64,${font}) format('woff2'); font-weight:100 900; }
:root{ --navy:#16202a; --navy2:#223040; --peach:#EAB393; --peach-soft:#fbefe7; --brown:#B5651D; --text:#16202a; --dim:#4b5563; --faint:#7b8494; --line:#e6e9ee; --card:#f8f9fb; }
*{ box-sizing:border-box; }
html{ background:#e9edf2; }
body{ margin:0; font-family:'IRANSansX',Tahoma,sans-serif; color:var(--text); line-height:2; font-size:13.5px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.doc{ max-width:860px; margin:0 auto; background:#fff; }
/* جلد */
.cover{ position:relative; overflow:hidden; background:radial-gradient(120% 80% at 50% 0%, #2a3a4c 0%, var(--navy) 60%); color:#fff; text-align:center; min-height:640px; padding:120px 48px 64px; display:flex; flex-direction:column; align-items:center; }
.cover .orbit{ position:absolute; inset:auto 0 0 0; width:100%; height:62%; }
.cover .logo{ width:120px; height:auto; position:relative; margin-bottom:26px; }
.cover h1{ position:relative; font-size:34px; font-weight:800; margin:0 0 8px; }
.cover .tag{ position:relative; color:var(--peach); font-size:16px; margin:0 0 26px; }
.cover .ver{ position:relative; font-size:13px; color:var(--peach); border:1px solid rgba(234,179,147,.45); border-radius:999px; padding:4px 18px; }
.cover .org{ position:relative; margin-top:auto; font-size:13px; color:rgba(255,255,255,.6); }
.cover .org b{ color:#fff; font-weight:700; }
/* محتوا */
.inner{ padding:40px 48px 48px; }
.toc-title{ font-size:20px; font-weight:800; margin:0 0 16px; color:var(--navy); display:flex; align-items:center; gap:10px; }
.toc-title::before{ content:''; width:6px; height:22px; border-radius:3px; background:var(--peach); }
.toc{ display:grid; grid-template-columns:1fr 1fr; gap:18px; }
.toc-card{ border:1px solid var(--line); border-radius:16px; overflow:hidden; background:var(--card); break-inside:avoid; }
.toc-h{ background:var(--navy); color:#fff; font-weight:800; font-size:15px; padding:12px 18px; }
.toc-h span{ display:block; font-size:12px; font-weight:600; color:var(--peach); }
.toc ol{ list-style-type:persian; margin:0; padding:12px 40px 14px 18px; color:var(--text); font-size:13.5px; line-height:2.2; }
.toc ol li::marker{ color:var(--brown); font-weight:800; }
.part{ display:flex; align-items:center; gap:20px; background:var(--navy); color:#fff; border-radius:18px; padding:22px 26px; margin:36px 0 18px; position:relative; overflow:hidden; }
.part::after{ content:''; position:absolute; left:-60px; top:-60px; width:200px; height:200px; border-radius:50%; border:1.5px solid rgba(234,179,147,.25); }
.part-n{ flex:none; width:64px; height:64px; border-radius:16px; background:var(--peach); color:var(--navy); font-size:34px; font-weight:900; display:flex; align-items:center; justify-content:center; }
.part-label{ display:block; font-size:12px; color:var(--peach); font-weight:700; }
.part h1{ margin:0; font-size:24px; font-weight:800; line-height:1.6; }
.part-desc{ margin:2px 0 0; color:rgba(255,255,255,.72); font-size:13px; }
.card{ border:1px solid var(--line); border-radius:16px; background:var(--card); margin:0 0 14px; }
.card-h{ display:flex; align-items:center; gap:12px; padding:12px 18px; background:#fff; border-bottom:1px solid var(--line); border-radius:16px 16px 0 0; }
.card-h .num{ flex:none; width:30px; height:30px; border-radius:9px; background:var(--peach-soft); color:var(--brown); font-weight:900; font-size:15px; display:flex; align-items:center; justify-content:center; border:1px solid #f1d5c2; }
.card-h h2{ margin:0; font-size:16px; font-weight:800; color:var(--navy); }
.card-b{ padding:8px 18px 12px; }
.card-b > ul{ list-style:none; margin:0; padding:0; }
.card-b > ul > li{ position:relative; padding:5px 18px 5px 0; border-bottom:1px dashed #e3e6eb; }
.card-b > ul > li:last-child{ border-bottom:none; }
.card-b > ul > li::before{ content:''; position:absolute; right:2px; top:15px; width:7px; height:7px; border-radius:2px; background:var(--peach); transform:rotate(45deg); }
.card-b ul ul{ margin:2px 0 0; padding-right:18px; color:var(--dim); }
.card-b ul ul li{ margin:0; }
.card-b ul ul li::marker{ color:#cfa98d; }
b{ color:var(--navy); font-weight:800; }
code{ font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12px; background:#eef0f3; padding:0 4px; border-radius:4px; }
p{ margin:6px 0; color:var(--dim); }
.foot{ padding:18px 48px 28px; border-top:1px solid var(--line); font-size:12px; color:var(--faint); text-align:center; }
@page{ size:A4; margin:14mm 13mm 15mm; }
@page :first{ margin:0; }
@media print{
  html{ background:#fff; } .doc{ max-width:none; }
  .cover{ height:297mm; min-height:0; padding:70mm 20mm 18mm; break-after:page; }
  .inner{ padding:0; }
  .part{ break-before:page; margin-top:0; }
  .toc + .part{ break-before:auto; margin-top:28px; } /* بخش اول درست زیر فهرست مطالب، نه صفحه‌ی تازه */
  .card-h{ break-after:avoid; } .card-b > ul > li:not(:has(ul)), .card-b ul ul li{ break-inside:avoid; }
  .card{ break-inside:auto; margin-bottom:12px; }
  .card-b > ul > li{ padding-top:4px; padding-bottom:4px; } .card-b > ul > li::before{ top:14px; }
  .foot{ display:none; }
}
@media (max-width:640px){
  .cover{ min-height:520px; padding:80px 16px 40px; } .cover h1{ font-size:26px; }
  .inner{ padding:24px 16px 32px; } .toc{ grid-template-columns:1fr; }
  .part{ padding:16px; gap:14px; } .part-n{ width:48px; height:48px; font-size:26px; } .part h1{ font-size:19px; }
  .card-b{ padding:6px 12px 10px; } .card-h{ padding:10px 12px; }
}
</style></head>
<body><div class="doc">
<header class="cover">${orbit}${logo}<h1>${esc(title)}</h1><p class="tag">رصد و تحلیل فضای سیاسی‌اجتماعی</p><span class="ver">${esc(subtitle)}</span><p class="org"><b>سامانه‌ی هوشمند جریان</b> — به روایت حوزه علمیه خراسان</p></header>
<main class="inner">
<h2 class="toc-title">فهرست مطالب</h2>
${tocHtml(md)}
${body}
</main>
<div class="foot">سامانه‌ی هوشمند جریان — ${esc(subtitle)}</div>
</div></body></html>`;
  return { doc, md, version };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const lp = await browser.newPage({ deviceScaleFactor: 4 });
  await lp.setContent('<body style="margin:0;background:transparent">' + fs.readFileSync(path.join(ROOT, 'design', 'icons', 'jarian-mark.svg'), 'utf8').replace('<svg ', '<svg width="120" ') + '</body>');
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
    // اندازه و حاشیه از @page خودِ سند (جلد بدون حاشیه: @page :first)
    path: path.join(dir, NAME + '.pdf'), printBackground: true, preferCSSPageSize: true,
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
