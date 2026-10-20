// تب «خبرنامه مدارس»: پیشنهاد/تأیید سه بخش توسط مدیر، انتشار، و خروجی PDF (jsPDF + html2canvas تنبل‌لود)
import { api } from '../../core/api.js';
import { calParts } from '../../core/date.js';
import { CHANNELS, POSTS_CACHE, chById } from '../../data/store.js';
import { claimsTextDisplay, escAttr, toFaDigits } from '../../core/text.js';
import { currentRole } from '../../core/session.js';
import { DOSSIER_TOPICS, DOSSIER_TOPIC_POSTS } from './dossier.js';
import { loadScriptOnce } from '../../core/load-script.js';
import { showToast } from '../../ui/toast.js';

export let NEWSLETTER_POSTS = []; // {id, section, post_id, sort_order, posts:{...}} — مجموعه‌ی فعلیِ منتشرشده‌ی «خبرنامه مدارس» (بدون آرشیو)؛ posts رکورد کامل پست embedشده‌ست (نه فقط id) چون POSTS_CACHE سقف ۱۰۰۰تایی داره و پست‌های ادعا/شایعه (کمیاب‌تر) زود ازش بیرون می‌افتن — نگاه کن به buildNewsletterPrintHtml
export let NEWSLETTER_DRAFT = { claims: [], news: [], dossier: [] }; // پیش‌نویس در‌حال‌ویرایش مدیر (فقط حافظه، تا «انتشار» زده نشه ذخیره نمی‌شه)
export async function loadNewsletterPosts(){
  // select=*,posts(*) پست واقعی رو مستقیم embed می‌کنه به‌جای اینکه بعداً
  // از POSTS_CACHE (که سقف ۱۰۰۰تایی داره و پست‌های ادعا/شایعه زود ازش
  // بیرون می‌افتن) پیدا بشه — نگاه کن به buildNewsletterPrintHtml
  const r = await api('/newsletter_posts?select=*,posts(*)&order=section.asc,sort_order.asc');
  // پست پنهان‌شده: برای بیننده posts=null (RLS)، برای مدیر hidden_at پر
  NEWSLETTER_POSTS = (r.ok ? await r.json() : []).filter(np=>np.posts && !np.posts.hidden_at);
}
// ---- تب «خبرنامه مدارس» — خبرنامه‌ی قابل‌دانلود (چاپی، A4)، بدون
// آرشیو: newsletter_posts همیشه فقط مجموعه‌ی «فعلیِ منتشرشده»‌ست. هر
// بار مدیر پنل رو باز می‌کنه، برای هر بخش یه پیش‌نویس محلی
// (NEWSLETTER_DRAFT) از روی مجموعه‌ی منتشرشده (یا اگه چیزی منتشر
// نشده، از یه پیشنهاد خودکار جدیدترین‌ها) ساخته می‌شه؛ تا وقتی
// «انتشار» نزنه، هیچ‌چیز توی دیتابیس تغییر نمی‌کنه.
export const NEWSLETTER_SUGGEST_LIMIT = { claims: 5, news: 8, dossier: 6 };
export function newsletterCandidatePosts(section){
  if(section === 'claims'){
    const ids = new Set(CHANNELS.filter(c=>c.platform==='bale').map(c=>c.id));
    return POSTS_CACHE.filter(p=>ids.has(p.channel_id));
  }
  if(section === 'news'){
    const ids = new Set(CHANNELS.filter(c=>c.show_in_news && c.platform!=='bale').map(c=>c.id));
    return POSTS_CACHE.filter(p=>ids.has(p.channel_id));
  }
  // dossier: از پست‌های واقعاً منتسب به موضوعات فعال «پرونده‌های موضوعی» (excluded=false)
  const activeTopicIds = new Set(DOSSIER_TOPICS.filter(t=>t.active).map(t=>t.id));
  const postIds = new Set(DOSSIER_TOPIC_POSTS.filter(dp=>!dp.excluded && activeTopicIds.has(dp.topic_id)).map(dp=>dp.post_id));
  return POSTS_CACHE.filter(p=>postIds.has(p.id));
}
export function suggestNewsletterPostIds(section){
  return newsletterCandidatePosts(section)
    .sort((a,b)=> new Date(b.posted_at||b.scraped_at) - new Date(a.posted_at||a.scraped_at))
    .slice(0, NEWSLETTER_SUGGEST_LIMIT[section])
    .map(p=>p.id);
}
export function initNewsletterDraft(){
  ['claims','news','dossier'].forEach(section=>{
    const published = NEWSLETTER_POSTS.filter(np=>np.section===section).sort((a,b)=>a.sort_order-b.sort_order).map(np=>np.post_id);
    NEWSLETTER_DRAFT[section] = published.length ? published.slice() : suggestNewsletterPostIds(section);
  });
}
export function renderNewsletterTab(){
  const statusEl = document.getElementById('newsletter-download-status');
  const downloadBtn = document.getElementById('newsletter-download-btn');
  if(NEWSLETTER_POSTS.length){
    statusEl.textContent = 'خبرنامه‌ی امروز آماده‌ی دانلوده.';
    downloadBtn.disabled = false;
  }else{
    statusEl.textContent = 'هنوز خبرنامه‌ای منتشر نشده.';
    downloadBtn.disabled = true;
  }
  const isAdmin = currentRole === 'app_admin';
  document.getElementById('newsletter-admin-panel').style.display = isAdmin ? '' : 'none';
  if(isAdmin){
    initNewsletterDraft();
    renderNewsletterAdminPanel();
  }
}
export function newsletterDraftLabel(postId){
  const p = POSTS_CACHE.find(x=>x.id===postId);
  if(!p) return 'پست #'+postId+' (حذف‌شده)';
  return p.title || (p.text||'').slice(0,60) || ('پست #'+p.id);
}
export function renderNewsletterAdminPanel(){
  ['claims','news','dossier'].forEach(section=>{
    const wrap = document.getElementById('newsletter-draft-'+section);
    if(!wrap) return;
    const ids = NEWSLETTER_DRAFT[section];
    wrap.innerHTML = ids.length ? ids.map(id=>`
      <div class="newsletter-draft-item">
        <span class="txt">${escAttr(newsletterDraftLabel(id))}</span>
        <button class="del-btn" style="min-width:24px;min-height:24px;font-size:11px;" title="حذف از خبرنامه" data-nl-remove="${id}" data-nl-section="${section}">✕</button>
      </div>`).join('') : '<p class="dossier-topic-empty">خبری انتخاب نشده.</p>';
  });
}
export function removeNewsletterDraftItem(section, postId){
  NEWSLETTER_DRAFT[section] = NEWSLETTER_DRAFT[section].filter(id=>id!==postId);
  renderNewsletterAdminPanel();
}
export function suggestNewsletterSection(section){
  NEWSLETTER_DRAFT[section] = suggestNewsletterPostIds(section);
  renderNewsletterAdminPanel();
}
export function searchNewsletterManualAdd(section, query){
  const resultsEl = document.getElementById('newsletter-manual-results-'+section);
  if(!resultsEl) return;
  query = (query||'').trim();
  if(query.length < 2){ resultsEl.innerHTML=''; return; }
  const already = new Set(NEWSLETTER_DRAFT[section]);
  const matches = POSTS_CACHE.filter(p=> !already.has(p.id) && ((p.title||'').includes(query) || (p.text||'').includes(query))).slice(0,8);
  resultsEl.innerHTML = matches.length ? matches.map(p=>{
    const label = p.title || (p.text||'').slice(0,60) || ('پست #'+p.id);
    return `<div class="dossier-manual-result-row"><span class="txt">${escAttr(label)}</span><button class="btn btn-sm" data-nl-add="${p.id}" data-nl-section="${section}">افزودن</button></div>`;
  }).join('') : '<p class="dossier-topic-empty">موردی پیدا نشد.</p>';
}
export function addNewsletterManualPost(section, postId){
  if(!NEWSLETTER_DRAFT[section].includes(postId)) NEWSLETTER_DRAFT[section].push(postId);
  document.getElementById('newsletter-manual-results-'+section).innerHTML = '';
  renderNewsletterAdminPanel();
}
// «انتشار» = جایگزینی کامل (نه insert اضافه‌شونده) — طبق تصمیم کاربر
// این جدول آرشیو نداره، همیشه فقط مجموعه‌ی «فعلی» رو نشون می‌ده
export async function publishNewsletter(){
  await api('/newsletter_posts?id=gt.0', {method:'DELETE'});
  const rows = [];
  ['claims','news','dossier'].forEach(section=>{
    NEWSLETTER_DRAFT[section].forEach((postId, idx)=> rows.push({section, post_id: postId, sort_order: idx}));
  });
  if(rows.length){
    const r = await api('/newsletter_posts', {method:'POST', headers:{Prefer:'return=minimal'}, body: JSON.stringify(rows)});
    if(!r.ok){ showToast('انجام نشد؛ اتصال را بررسی کنید و دوباره امتحان کنید.'); return; }
  }
  await loadNewsletterPosts();
  renderNewsletterTab();
  showToast('خبرنامه‌ی امروز منتشر شد.');
}
// idx: شماره‌ی خبر داخل همون بخش (۱-پایه، هر بخش از ۱ دوباره شروع می‌شه) —
// به‌جای نشان مربعی جدا (که با تیتر هم‌ردیف نمی‌شد و بی‌ربط دیده می‌شد)،
// مستقیم قبل از خودِ تیتر، هم‌رنگ و هم‌خط با اون نوشته می‌شه
// ۵.۲۲.۱: زمان مطلق در PDF (قبلاً «۳ ساعت پیش» — فایل بعداً و در روز دیگری خونده می‌شه)
export function nlWhen(t){
  if(!t) return '';
  const d = new Date(t);
  return d.toLocaleDateString('fa-IR', { timeZone:'Asia/Tehran', month:'long', day:'numeric' }) + '، ساعت ' +
    d.toLocaleTimeString('fa-IR', { timeZone:'Asia/Tehran', hour:'2-digit', minute:'2-digit' });
}
export function newsletterItemHtml(p, idx){
  const ch = chById(p.channel_id) || {};
  const num = `<span class="newsletter-item-num">${toFaDigits(idx)}.</span>`;
  return `
    <div class="newsletter-item">
      ${p.title ? `<div class="newsletter-item-title">${num} ${escAttr(p.title)}</div>` : ''}
      <div class="newsletter-item-text">${p.title ? '' : num + ' '}${claimsTextDisplay(p.text||'')}</div>
      <div class="newsletter-item-meta">${escAttr(ch.title||ch.username||'')} — ${nlWhen(p.posted_at||p.scraped_at)}</div>
    </div>`;
}
// ⚠️ طبق درخواست کاربر: «شبکه‌های اجتماعی...» و «پرونده‌های موضوعی» دیگه دو
// بخش جدا با دو عنوان جدا نیستن — فقط توی پنل مدیریت (بالاتر، سه پنل
// curation جدا) دسته‌بندی‌شون حفظ شده تا مدیر بهتر پیدا/مدیریت‌شون کنه؛
// موقع نمایش نهایی به کاربر، آیتم‌های news+dossier با هم یکی (concat)
// و زیر یه عنوان مشترک «برخی از مهمترین خبرها» با شماره‌گذاری پیوسته
// (نه از سر گرفتن شماره برای هرکدوم) نشون داده می‌شن. صفحه‌ی اول هم
// طبق خواسته‌ی کاربر فقط مخصوص «ادعاها و شایعات»ه — برش اجباری صفحه
// بین این دو بخش توی buildNewsletterPdf (پایین‌تر) با اندازه‌گیری
// مرز #nl-claims-block انجام می‌شه، نه صرفاً جریان پیوسته‌ی قبلی.
export function buildNewsletterPrintHtml(){
  const wrap = document.getElementById('newsletter-print-view');
  if(!wrap) return;
  const grouped = { claims: [], news: [], dossier: [] };
  NEWSLETTER_POSTS.forEach(np=>{
    // از np.posts (embedشده توسط loadNewsletterPosts) استفاده می‌کنیم، نه
    // POSTS_CACHE — چون POSTS_CACHE سقف ۱۰۰۰تایی داره و تا وقتی مدیر واقعاً
    // به این تب برمی‌گرده، پست‌های ادعا/شایعه‌ی منتشرشده (کمیاب‌تر از بقیه)
    // ممکنه ازش بیرون افتاده باشن و PDF رو با «خبری ثبت نشده» خالی بسازه
    if(np.posts) grouped[np.section].push(np.posts);
  });
  const highlights = [...grouped.news, ...grouped.dossier];
  const today = new Date().toLocaleDateString('fa-IR', { timeZone:'Asia/Tehran', year:'numeric', month:'long', day:'numeric' });
  const headerHtml = `
    <div class="newsletter-masthead">
      <div class="newsletter-masthead-meta">
        <span>نشریه‌ی داخلی · روزانه</span>
        <span>${today}</span>
      </div>
      <div class="newsletter-masthead-title">خبرنامه مدارس</div>
      <div class="newsletter-masthead-sub">سامانه هوشمند جریان — رصد و تحلیل فضای سیاسی‌اجتماعی</div>
      <div class="newsletter-masthead-rule"></div>
    </div>`;
  wrap.innerHTML = `
    <div class="newsletter-page">
      ${headerHtml}
      <div id="nl-claims-block">
        <h3 class="newsletter-page-title"><span>ادعاها و شایعات</span></h3>
        <div class="newsletter-flow-columns">
          ${grouped.claims.map((p,i)=>newsletterItemHtml(p,i+1)).join('') || '<p>خبری ثبت نشده.</p>'}
        </div>
      </div>
      <h3 class="newsletter-page-title"><span>برخی از مهمترین خبرها</span></h3>
      <div class="newsletter-flow-columns">
        ${highlights.map((p,i)=>newsletterItemHtml(p,i+1)).join('') || '<p>خبری ثبت نشده.</p>'}
      </div>
    </div>`;
}
export async function downloadNewsletter(){
  const btn = document.getElementById('newsletter-download-btn');
  if(btn){ btn.disabled = true; btn.dataset.origText = btn.textContent; btn.textContent = 'در حال آماده‌سازی PDF...'; }
  try{
    const libs = await Promise.all([loadScriptOnce('vendor/html2canvas.min.js'), loadScriptOnce('vendor/jspdf.umd.min.js')]);
    if(!libs.every(Boolean)) throw new Error('pdf libraries failed to load');
    await buildNewsletterPdf();
  }catch(err){
    console.error(err);
    showToast('تولید فایل PDF ناموفق بود، دوباره امتحان کنید');
  }
  if(btn){ btn.disabled = false; btn.textContent = btn.dataset.origText || 'دانلود خبرنامه‌ی امروز'; }
}
// ساخت واقعی فایل PDF با jsPDF+html2canvas (نه چاپ مرورگر) — دلیل کامل
// این تغییر معماری بالای همین بخش، کنار #newsletter-print-view، مستند
// شده. مراحل: ۱) هدر برند جدا رندر می‌شه تا روی هر صفحه دوباره چسبونده بشه.
// ۲) هر خبر جدا در عرض یه ستون اندازه‌گیری می‌شه و خبرها به ترتیب در ستون راست،
// بعد چپ، بعد صفحه‌ی بعد چیده می‌شن (۵.۲۲.۱ — قبلاً یه بوم بلند دوستونه افقی
// برش می‌خورد و ترتیب خبرها بین صفحه‌ها به‌هم می‌ریخت). ۳) هر صفحه جدا با
// html2canvas رندر و به‌شکل JPEG (کیفیت ۰.۸۸) زیر هدر روی یه صفحه‌ی A4 گذاشته می‌شه.
export async function buildNewsletterPdf(){
  buildNewsletterPrintHtml();
  const printView = document.getElementById('newsletter-print-view');
  const pageEl = printView.querySelector('.newsletter-page');
  const headerEl = pageEl.querySelector('.newsletter-masthead');

  const PDF_PX_WIDTH = 750;
  const marginLR = 14, headerTopMM = 10, marginBottom = 14;
  const contentWidthMM = 210 - marginLR * 2;
  const cssPxPerMM = PDF_PX_WIDTH / contentWidthMM;
  const scale = 2;

  const headerHolder = document.createElement('div');
  headerHolder.style.cssText = `position:fixed; top:0; left:0; width:${PDF_PX_WIDTH}px; background:#fff; z-index:-1;`;
  headerHolder.appendChild(headerEl.cloneNode(true));
  document.body.appendChild(headerHolder);
  const headerCanvas = await html2canvas(headerHolder, { scale, backgroundColor:'#ffffff' });
  const headerDataUrl = headerCanvas.toDataURL('image/png');
  const headerHeightMM = contentWidthMM * (headerCanvas.height / headerCanvas.width);
  document.body.removeChild(headerHolder);
  // ۵.۲۲.۱: شروع متن درست زیر سربرگ (قبلاً عدد ثابت ۳۴mm بود ولی سربرگ ~۴۲mm پایین می‌اومد و
  // تصویر سفید متن روی خط دوتایی زیر عنوان «خبرنامه مدارس» می‌افتاد و پنهانش می‌کرد)
  const marginTop = headerTopMM + headerHeightMM;
  const pageContentHeightCss = (297 - marginTop - marginBottom) * cssPxPerMM;

  // ۵.۲۲.۱ (بررسی خروجی PDF): قبلاً کل بدنه با CSS دوستونه یه بوم بلند می‌شد و افقی برش می‌خورد —
  // وقتی «مهمترین خبرها» بیشتر از یه صفحه بود، ستون راست (خبر ۱ تا ۱۰) و چپ (۱۱ تا ۱۹) هر کدوم
  // روی دو صفحه پخش می‌شدن (ترتیب خوندن ۱–۷، ۱۱–۱۶، بعد ۸–۱۰…) و خبرِ ستون دوم سر مرز صفحه
  // بریده می‌شد. حالا هر صفحه جدا چیده می‌شه: خبرها به ترتیب اول ستون راست، بعد چپ، بعد صفحه‌ی بعد.
  const colGap = 28, colW = (PDF_PX_WIDTH - colGap) / 2;
  const stage = document.createElement('div');
  stage.style.cssText = `position:fixed; top:0; left:0; width:${PDF_PX_WIDTH}px; background:#fff; direction:rtl; font-family:inherit; color:#222; z-index:-1;`;
  stage.className = 'newsletter-page';
  document.body.appendChild(stage);
  // ⚠️ html2canvas با white-space:pre-wrap + «\n» واقعی، حروف متصل با نیم‌فاصله رو به‌هم می‌ریزه —
  // خطوط با span بلوکی جدا می‌شن (نه \n داخل pre-wrap)
  const prepItem = el=>{
    el.querySelectorAll('.newsletter-item-text').forEach(t=>{
      t.innerHTML = t.innerHTML.split('\n').map(l => `<span class="nl-line" style="display:block;">${l}</span>`).join('');
      t.style.whiteSpace = 'normal';
    });
    return el;
  };
  // اندازه‌گیری: هر خبر در عرض یه ستون، عنوان بخش در عرض کامل
  const measure = (html, width)=>{
    const box = document.createElement('div'); box.style.width = width + 'px'; box.innerHTML = html;
    stage.appendChild(box);
    const el = prepItem(box);
    const h = box.getBoundingClientRect().height;
    stage.removeChild(box);
    return { html: el.innerHTML, h };
  };
  const sections = Array.from(pageEl.querySelectorAll('h3.newsletter-page-title')).map(t=>{
    const cols = t.nextElementSibling && t.nextElementSibling.classList.contains('newsletter-flow-columns')
      ? t.nextElementSibling : t.parentElement.querySelector('.newsletter-flow-columns');
    const items = Array.from(cols.children).map(c => measure(c.outerHTML, colW));
    // فاصله‌ی پایین هر خبر (margin) در اندازه نیست
    items.forEach(it => it.h += 16);
    const title = measure(t.outerHTML, PDF_PX_WIDTH); title.h += 16; // margin پایین عنوان
    return { title, items };
  });
  // چیدن خبرها در صفحه‌ها؛ هر بخش از صفحه‌ی تازه شروع می‌شه (صفحه‌ی اول فقط ادعاها — خواست کاربر)
  const pages = [];
  sections.forEach(sec=>{
    let page = { title: sec.title.html, cols: [[], []] }, used = [sec.title.h, sec.title.h], c = 0;
    pages.push(page);
    sec.items.forEach(it=>{
      while(true){
        if(used[c] + it.h <= pageContentHeightCss || !page.cols[c].length){ page.cols[c].push(it); used[c] += it.h; break; }
        if(c === 0){ c = 1; continue; }
        page = { title: '', cols: [[], []] }; used = [0, 0]; c = 0; pages.push(page);
      }
    });
    // صفحه‌ی آخر هر بخش مثل ستون‌بندی قبلی متوازن می‌شه (نه همه در ستون راست و ستون چپ خالی)
    const all = page.cols[0].concat(page.cols[1]);
    const total = all.reduce((t, it) => t + it.h, 0);
    let k = 0, acc = 0;
    while(k < all.length && acc + all[k].h / 2 <= total / 2){ acc += all[k].h; k++; }
    if(k === 0 && all.length) k = 1;
    page.cols = [all.slice(0, k), all.slice(k)];
  });

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'mm', format:'a4' });
  for(let i = 0; i < pages.length; i++){
    const pg = pages[i];
    stage.innerHTML = `${pg.title}<div style="display:flex; gap:${colGap}px; align-items:flex-start; position:relative;">
        <div style="width:${colW}px;">${pg.cols[0].map(it => it.html).join('')}</div>
        ${pg.cols[1].length ? `<div style="position:absolute; top:0; bottom:16px; left:${colW + colGap / 2}px; width:1px; background:#ccc;"></div>` : ''}
        <div style="width:${colW}px;">${pg.cols[1].map(it => it.html).join('')}</div>
      </div>`;
    // آخرین خبر هر ستون خط جداکننده‌ی پایین نمی‌گیره
    stage.querySelectorAll('.newsletter-item:last-child').forEach(el => { el.style.borderBottom = 'none'; });
    const canvas = await html2canvas(stage, { scale, backgroundColor:'#ffffff', windowWidth: PDF_PX_WIDTH });
    let wMM = contentWidthMM, hMM = canvas.height / scale / cssPxPerMM;
    const maxH = 297 - marginTop - marginBottom;
    // خبرِ تکیِ بلندتر از یه صفحه (خیلی نادر): کل صفحه کوچیک‌تر جا داده می‌شه، نه بریده
    if(hMM > maxH){ wMM = wMM * maxH / hMM; hMM = maxH; }
    if(i > 0) doc.addPage();
    doc.addImage(headerDataUrl, 'PNG', marginLR, headerTopMM, contentWidthMM, headerHeightMM);
    doc.addImage(canvas.toDataURL('image/jpeg', 0.88), 'JPEG', marginLR + (contentWidthMM - wMM) / 2, marginTop, wMM, hMM);
  }
  document.body.removeChild(stage);

  // نام فایل با ارقام لاتین (مثل پشتیبان و خروجی CSV) — بعضی مرورگرها/برنامه‌های ایمیل نام غیرلاتین رو به «download» برمی‌گردونن
  const jp = calParts(new Date(), 'persian');
  const fileDate = jp.year + '-' + String(jp.month).padStart(2, '0') + '-' + String(jp.day).padStart(2, '0');
  doc.save(`khabarnameh-madares-${fileDate}.pdf`);
}

export function setNewsletterPosts(v){ NEWSLETTER_POSTS = v; }

// دکمه‌های پنل مدیر خبرنامه (پیشنهاد تازه، انتشار، حذف/افزودن خبر، جست‌وجوی دستی) و دانلود PDF
export function setupNewsletter(){
  document.getElementById('newsletter-download-btn').addEventListener('click', downloadNewsletter);
  const panel = document.getElementById('newsletter-admin-panel');
  panel.addEventListener('click', e=>{
    const b = e.target.closest('[data-nl-suggest], [data-nl-publish], [data-nl-remove], [data-nl-add]');
    if(!b) return;
    if(b.dataset.nlSuggest) suggestNewsletterSection(b.dataset.nlSuggest);
    else if(b.hasAttribute('data-nl-publish')) publishNewsletter();
    else if(b.dataset.nlRemove) removeNewsletterDraftItem(b.dataset.nlSection, Number(b.dataset.nlRemove));
    else addNewsletterManualPost(b.dataset.nlSection, Number(b.dataset.nlAdd));
  });
  panel.addEventListener('input', e=>{
    const inp = e.target.closest('[data-nl-search]');
    if(inp) searchNewsletterManualAdd(inp.dataset.nlSearch, inp.value);
  });
}
