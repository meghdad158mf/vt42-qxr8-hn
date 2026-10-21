// نمایشگر سند (#doc-viewer، ۵.۱۹.۰): عکس/PDF/فایل با ورق زدن، بزرگ‌نمایی، کلیدهای جهت و سوایپ
import { bindModal } from './modal.js';
import { escAttr, escHtml, faTitle, toFaDigits } from '../core/text.js';

// items: [{ kind:'image'|'pdf'|'file', url, name, label }] — پنجره همون لحظه‌ی کلیک باز می‌شه
// (قبل از گرفتن لینک امن)، پس مرورگر بلاکش نمی‌کنه؛ «باز کردن/دانلود» یه لینک واقعیه
let DV = { items: [], i: 0, zoom: false };
export function openDocViewer(title, loader, startIndex){
  DV = { items: [], i: startIndex || 0, zoom: false };
  document.getElementById('dv-title').textContent = faTitle(title);
  document.getElementById('dv-stage').innerHTML = '<div class="dv-msg">در حال آماده‌سازی…</div>';
  document.getElementById('dv-count').textContent = '';
  document.getElementById('dv-nav').hidden = true;
  document.getElementById('dv-zoom').hidden = true;
  document.getElementById('dv-open').hidden = true;
  document.getElementById('doc-viewer').classList.add('active');
  Promise.resolve().then(loader).then(items=>{
    DV.items = (items || []).filter(x => x && x.url);
    if(!DV.items.length) throw new Error('empty');
    DV.i = Math.min(Math.max(0, DV.i), DV.items.length - 1);
    dvRender();
  }).catch(()=>{
    document.getElementById('dv-stage').innerHTML = '<div class="dv-msg"><b>باز کردن فایل ممکن نشد</b>اتصال اینترنت را بررسی کنید و دوباره امتحان کنید.</div>';
  });
}
export function closeDocViewer(){
  document.getElementById('doc-viewer').classList.remove('active');
  document.getElementById('dv-stage').innerHTML = '';
}
const DV_FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';
function dvRender(){
  const it = DV.items[DV.i];
  const stage = document.getElementById('dv-stage');
  const n = DV.items.length;
  stage.classList.toggle('zoomed', DV.zoom && it.kind === 'image');
  stage.scrollTop = 0; stage.scrollLeft = 0;
  const openEl = document.getElementById('dv-open');
  openEl.href = it.url; openEl.hidden = false;
  if(it.kind === 'image'){
    openEl.removeAttribute('download');
    stage.innerHTML = `<img src="${escAttr(it.url)}" alt="${escAttr(it.label || '')}">`;
  }else if(it.kind === 'pdf'){
    // نمایش PDF داخل صفحه فقط روی رایانه قابل‌اعتماده؛ گوشی‌ها (مخصوصاً اندروید) iframe‌ی PDF رو نشون نمی‌دن
    const inline = window.matchMedia('(min-width: 761px)').matches;
    stage.innerHTML = inline
      ? `<iframe src="${escAttr(it.url)}" title="${escAttr(it.label || 'PDF')}"></iframe>`
      : `<div class="dv-msg">${DV_FILE_ICON}<b>${escHtml(faTitle(it.label) || 'فایل PDF')}</b>برای خواندن، فایل را در نمایشگر PDF گوشی باز کنید.<br><a class="dv-action" href="${escAttr(it.url)}" target="_blank" rel="noopener">باز کردن PDF</a></div>`;
  }else{
    openEl.setAttribute('download', '');
    stage.innerHTML = `<div class="dv-msg">${DV_FILE_ICON}<b>${escHtml(faTitle(it.label) || 'فایل')}</b>پیش‌نمایش این نوع فایل در سایت ممکن نیست.<br><a class="dv-action" href="${escAttr(it.url)}" target="_blank" rel="noopener" download>دانلود فایل</a></div>`;
  }
  document.getElementById('dv-zoom').hidden = it.kind !== 'image';
  document.getElementById('dv-zoom').classList.toggle('on', DV.zoom && it.kind === 'image');
  const countTxt = n > 1 ? ('صفحه‌ی ' + toFaDigits(DV.i + 1) + ' از ' + toFaDigits(n)) : '';
  document.getElementById('dv-count').textContent = countTxt;
  const nav = document.getElementById('dv-nav');
  nav.hidden = n < 2;
  nav.dataset.count = countTxt;
  document.getElementById('dv-prev').disabled = DV.i === 0;
  document.getElementById('dv-next').disabled = DV.i === n - 1;
  const pages = document.getElementById('dv-pages');
  pages.innerHTML = n > 1 ? DV.items.map((_, k)=>`<button type="button" class="${k === DV.i ? 'on' : ''}" data-dv-go="${k - DV.i}" aria-label="صفحه‌ی ${toFaDigits(k + 1)}">${toFaDigits(k + 1)}</button>`).join('') : '';
  const cur = pages.querySelector('.on'); if(cur) cur.scrollIntoView({ block:'nearest', inline:'center' });
  // صفحه‌ی بعد پیش‌بارگذاری شه تا ورق زدن بی‌مکث باشه
  const nx = DV.items[DV.i + 1]; if(nx && nx.kind === 'image'){ const im = new Image(); im.src = nx.url; }
}
export function dvGo(delta){
  const j = DV.i + delta;
  if(j < 0 || j >= DV.items.length) return;
  DV.i = j; DV.zoom = false; dvRender();
}
export function dvToggleZoom(){
  const it = DV.items[DV.i]; if(!it || it.kind !== 'image') return;
  DV.zoom = !DV.zoom; dvRender();
}
export function setupDocViewer(){
  bindModal('doc-viewer', closeDocViewer);
  document.getElementById('dv-zoom').addEventListener('click', dvToggleZoom);
  document.getElementById('dv-prev').addEventListener('click', ()=>dvGo(-1));
  document.getElementById('dv-next').addEventListener('click', ()=>dvGo(1));
  document.getElementById('dv-pages').addEventListener('click', e=>{
    const b = e.target.closest('[data-dv-go]');
    if(b) dvGo(Number(b.dataset.dvGo));
  });
  // کلیک روی خودِ عکس = بزرگ‌نمایی
  document.getElementById('dv-stage').addEventListener('click', e=>{ if(e.target.tagName === 'IMG') dvToggleZoom(); });
  document.addEventListener('keydown', e=>{
    if(!document.getElementById('doc-viewer').classList.contains('active')) return;
    // راست‌به‌چپ: صفحه‌ی بعد سمت چپه
    if(e.key === 'ArrowLeft'){ dvGo(1); e.preventDefault(); }
    else if(e.key === 'ArrowRight'){ dvGo(-1); e.preventDefault(); }
    else if(e.key === 'Escape'){ closeDocViewer(); }
  });
  (function(){
    const stage = document.getElementById('dv-stage');
    let x0 = null, y0 = null;
    stage.addEventListener('touchstart', e=>{ if(e.touches.length === 1 && !DV.zoom){ x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } else x0 = null; }, { passive:true });
    stage.addEventListener('touchend', e=>{
      if(x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if(Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) dvGo(dx > 0 ? 1 : -1); // کشیدن به راست = صفحه‌ی بعد (راست‌به‌چپ)
    }, { passive:true });
  })();
}

