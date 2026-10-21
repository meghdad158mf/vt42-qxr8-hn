// تب «آنچه درباره حوزه گفته می‌شود»: یافته‌های خزنده (hawza_mentions، migration_041) با فیلتر، پررنگ‌کردن عبارت‌ها، ترجمه و پنهان‌کردن مدیر
import { api } from '../../core/api.js';
import { authToken, currentRole } from '../../core/session.js';
import { escAttr, escHtml, needsTranslation, safeUrl, toFaDigits } from '../../core/text.js';
import { NEWS_PLATFORM_ICON, NEWS_PLATFORM_LABEL } from '../../ui/platforms.js';
import { newsRelTime, tehranDayDiff } from '../../core/date.js';
import { renderPagination } from '../../ui/pagination.js';
import { scrollToListTop } from '../../ui/scroll.js';
import { searchNorm } from '../../core/search.js';
import { setMobileFilterCount } from '../../ui/mobile-filters.js';
import { showToast } from '../../ui/toast.js';
import { SUPABASE_URL } from '../../core/config.js';
import { uiConfirm } from '../../ui/confirm.js';

// ---- «آنچه درباره حوزه گفته می‌شود» (خزنده، ۵.۲۳.۰) ----
// داده: hawza_mentions (scripts/crawl_hawza.py، migration_041). فقط با باز شدن
// همین تب گرفته می‌شه (نه در loadAll) و تا ۱۰ دقیقه کش می‌مونه.
export let HAB_ROWS = null, HAB_LOADED_AT = 0, HAB_LOADING = null, HAB_ERROR = '';
export const HAB_STATE = { q:'', time:'', kind:'', scope:'', site:'', page:1 };
// کلید منبع در فیلتر: سایت = دامنه، پست شبکه‌ی اجتماعی = نام کانال
export const habSourceKey = x => x.kind === 'social' ? 'ch:' + (x.site_name || x.site) : x.site;
export const HAB_PAGE_SIZE = 12;
// همون عبارت‌های TERMS در scripts/crawl_hawza.py — فقط برای پررنگ کردن در گزیده‌ی
// متن؛ با تغییر فهرست خزنده، این هم هم‌سو بشه. [\s‌]+ = فاصله یا نیم‌فاصله
export const HAB_HL_RX = (()=>{
  const pats = ['حوزه(?:[\\s\\u200c]+(?:ی|های|ها)|\\u200c(?:ی|های|ها))?[\\s\\u200c]+علمیه', 'حوزوی(?:ان|ها)?', 'طلاب', 'طلبه(?:[\\s\\u200c]*(?:ها|ای))?',
    'روحانیت', 'روحانیون', 'مراجع(?:[\\s\\u200c]+عظام)?(?:[\\s\\u200c]+تقلید)?', 'مرجع[\\s\\u200c]+تقلید', 'جامعه[\\s\\u200c]+مدرسین',
    'شورای[\\s\\u200c]+عالی[\\s\\u200c]+حوزه(?:[\\s\\u200c]*(?:های|ها))?', 'مدارس[\\s\\u200c]+علمیه', 'مدرسه(?:[\\s\\u200c]*ی)?[\\s\\u200c]+علمیه', 'معممین', 'عمامه'];
  return new RegExp('(?<![\\p{L}\\p{N}])(?:' + pats.join('|').replace(/ی/g, '[یي]').replace(/ک/g, '[کك]') + ')(?![\\p{L}\\p{N}])', 'gu');
})();
export function habHighlight(text){
  return escHtml(text).replace(HAB_HL_RX, m=>`<mark class="hab-hl">${m}</mark>`);
}
export async function loadHawzaMentions(force){
  if(!force && HAB_ROWS && Date.now() - HAB_LOADED_AT < 600000) return;
  if(HAB_LOADING) return HAB_LOADING;
  HAB_LOADING = (async()=>{
    try{
      const r = await api('/hawza_mentions?select=id,url,site,site_name,title,excerpt,kind,matched_terms,hits,in_title,published_at,scraped_at,hidden_at&order=scraped_at.desc&limit=600');
      if(!r.ok){
        HAB_ERROR = (r.status === 404 || r.status === 400) ? 'missing' : 'error';
        HAB_ROWS = HAB_ROWS || [];
        return;
      }
      HAB_ERROR = '';
      HAB_ROWS = (await r.json()).filter(x=>!x.hidden_at);
      HAB_LOADED_AT = Date.now();
    }catch(e){
      HAB_ERROR = 'error'; HAB_ROWS = HAB_ROWS || [];
    }finally{ HAB_LOADING = null; }
  })();
  return HAB_LOADING;
}
export function habTime(x){ return x.published_at || x.scraped_at; }
export async function openHawzaAbout(){
  if(!HAB_ROWS) document.getElementById('hab-feed').innerHTML = '<p class="hab-loading">در حال دریافت خبرها…</p>';
  await loadHawzaMentions();
  populateHabSites();
  renderHawzaAbout();
}
export function populateHabSites(){
  const sel = document.getElementById('hab-site');
  const counts = {};
  (HAB_ROWS || []).filter(x=>!HAB_STATE.kind || (HAB_STATE.kind === 'social') === (x.kind === 'social')).forEach(x=>{
    const k = habSourceKey(x);
    counts[k] = counts[k] || { name: (x.site_name || x.site) + (x.kind === 'social' ? ' (' + (NEWS_PLATFORM_LABEL[x.site] || x.site) + ')' : ''), n:0 };
    counts[k].n++;
  });
  const opts = Object.entries(counts).sort((a,b)=>b[1].n - a[1].n);
  sel.innerHTML = '<option value="">همه‌ی منابع</option>' + opts.map(([k,v])=>`<option value="${escAttr(k)}">${escHtml(v.name)} (${toFaDigits(v.n)})</option>`).join('');
  sel.value = counts[HAB_STATE.site] ? HAB_STATE.site : '';
  HAB_STATE.site = sel.value;
}
export function filteredHawzaMentions(){
  const terms = HAB_STATE.q.split(/[,،]/).map(searchNorm).filter(Boolean);
  return (HAB_ROWS || []).filter(x=>{
    if(HAB_STATE.kind && (HAB_STATE.kind === 'social') !== (x.kind === 'social')) return false;
    if(HAB_STATE.site && habSourceKey(x) !== HAB_STATE.site) return false;
    if(HAB_STATE.scope === 'title' && !x.in_title) return false;
    if(HAB_STATE.time){
      const d = tehranDayDiff(habTime(x));
      if(HAB_STATE.time === 'today' && d !== 0) return false;
      if(HAB_STATE.time === 'yesterday' && d !== 1) return false;
      if(HAB_STATE.time === 'week' && d > 6) return false;
    }
    if(terms.length){
      const hay = searchNorm((x.title || '') + ' ' + (x.excerpt || '') + ' ' + (x.site_name || ''));
      if(!terms.some(t=>hay.includes(t))) return false;
    }
    return true;
  }).sort((a,b)=>String(habTime(b) || '').localeCompare(String(habTime(a) || '')));
}
export function renderHawzaAbout(){
  const feed = document.getElementById('hab-feed');
  const empty = document.getElementById('hab-empty');
  const sum = document.getElementById('hab-summary');
  setMobileFilterCount('#hawza-about-panel', (HAB_STATE.time ? 1 : 0) + (HAB_STATE.kind ? 1 : 0) + (HAB_STATE.scope ? 1 : 0) + (HAB_STATE.site ? 1 : 0));
  if(HAB_ERROR === 'missing'){
    feed.innerHTML = ''; sum.textContent = ''; document.getElementById('hab-pagination').innerHTML = '';
    empty.style.display = 'block';
    empty.textContent = currentRole === 'app_admin'
      ? 'جدول این بخش هنوز ساخته نشده است؛ فایل db/migration_041_hawza_crawler.sql را در SQL Editor سوپابیس اجرا کنید.'
      : 'این بخش به‌زودی راه‌اندازی می‌شود.';
    return;
  }
  const list = filteredHawzaMentions();
  const total = (HAB_ROWS || []).length;
  const totalPages = Math.max(1, Math.ceil(list.length / HAB_PAGE_SIZE));
  HAB_STATE.page = Math.min(Math.max(1, HAB_STATE.page), totalPages);
  const page = list.slice((HAB_STATE.page - 1) * HAB_PAGE_SIZE, HAB_STATE.page * HAB_PAGE_SIZE);
  const siteCount = new Set(list.map(habSourceKey)).size;
  sum.textContent = list.length
    ? toFaDigits(list.length) + ' مطلب از ' + toFaDigits(siteCount) + ' منبع' + (list.length !== total ? ' (از ' + toFaDigits(total) + ' مطلب)' : '')
    : '';
  empty.style.display = list.length ? 'none' : 'block';
  empty.textContent = HAB_ERROR === 'error' ? 'دریافت خبرها انجام نشد؛ اتصال اینترنت را بررسی و صفحه را دوباره باز کنید.'
    : total ? 'خبری با این فیلترها پیدا نشد.'
    : 'هنوز خبری پیدا نشده است؛ خزنده هر ۳ ساعت سایت‌های خبری و کانال‌ها را جست‌وجو می‌کند.';
  const isAdmin = currentRole === 'app_admin';
  feed.innerHTML = page.map(x=>{
    const terms = (x.matched_terms || []).slice(0, 4);
    return `
    <article class="news-card hab-card">
      <div class="news-body">
        <div class="news-head">
          <span class="news-source">${escHtml(x.site_name || x.site)}</span>
          ${x.kind === 'social' ? `<span class="news-platform">${NEWS_PLATFORM_ICON[x.site] || ''}${escHtml(NEWS_PLATFORM_LABEL[x.site] || x.site)}</span>` : ''}
          ${x.kind === 'link' ? '<span class="hab-flag is-link" title="این سایت در فهرست منابع خزنده نیست؛ از لینک یک مطلب مرتبط پیدا شد">یافته از لینک</span>' : ''}
          <span class="news-time" title="${escAttr(habTime(x) ? new Date(habTime(x)).toLocaleString('fa-IR', { timeZone:'Asia/Tehran' }) : '')}">${newsRelTime(habTime(x))}</span>
          ${x.in_title ? '<span class="hab-flag">اشاره در تیتر</span>' : ''}
        </div>
        <h3 class="news-title"><a id="hab-title-${Number(x.id)}" dir="auto" href="${safeUrl(x.url)}" target="_blank" rel="noopener">${habHighlight(x.title || '')}</a></h3>
        ${x.excerpt ? `<p class="hab-excerpt" id="hab-ex-${Number(x.id)}" dir="auto">${habHighlight(x.excerpt)}</p>` : ''}
        <div class="news-foot">
          <div class="hab-terms">${terms.map(t=>`<span class="hab-term">${escHtml(t)}</span>`).join('')}</div>
          <div class="hab-foot-acts">
            ${needsTranslation({ title: x.title, text: x.excerpt }) ? `<button type="button" class="news-translate-btn" id="hab-tr-btn-${Number(x.id)}" data-hab-translate="${Number(x.id)}">ترجمه به فارسی</button>` : ''}
            <a class="news-link" href="${safeUrl(x.url)}" target="_blank" rel="noopener">${x.kind === 'social' ? 'مشاهده‌ی پست ↗' : 'متن کامل در منبع ↗'}</a>
          </div>
        </div>
        ${isAdmin ? `<div class="hab-admin"><button type="button" class="post-hide-btn" data-hab-hide="${Number(x.id)}" title="این خبر برای همه‌ی بیننده‌ها پنهان می‌شود (مثلاً اگر واقعاً درباره‌ی حوزه نیست)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c5 0 9 4.5 10 7a13.6 13.6 0 0 1-2.9 3.9M6.6 6.6C4.3 8 2.7 10.1 2 12c1 2.5 5 7 10 7 1.9 0 3.6-.6 5.1-1.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>پنهان کردن</button></div>` : ''}
      </div>
    </article>`;
  }).join('');
  renderPagination('hab-pagination', HAB_STATE.page, totalPages, goHabPage);
}
// ترجمه‌ی خبرهای خارجی (انگلیسی/عربی): فقط تیتر و گزیده — متن کامل ذخیره نمی‌شه.
// ورودی تابع translate فقط شناسه است (mentionId)، مثل aiTranslate پست‌ها
export const HAB_TRANSLATION = {};
export async function translateMention(id){
  const x = (HAB_ROWS || []).find(r=>r.id === id);
  const btn = document.getElementById('hab-tr-btn-' + id);
  const tEl = document.getElementById('hab-title-' + id);
  const eEl = document.getElementById('hab-ex-' + id);
  if(!x || !btn || !tEl) return;
  const show = tr=>{
    tEl.innerHTML = habHighlight(tr ? (tr.title || x.title) : x.title);
    tEl.classList.toggle('is-translated', !!tr);
    if(eEl){ eEl.innerHTML = habHighlight(tr ? (tr.text || x.excerpt) : x.excerpt); eEl.classList.toggle('is-translated', !!tr); }
    btn.textContent = tr ? 'بازگشت به متن اصلی' : 'ترجمه به فارسی';
  };
  if(tEl.classList.contains('is-translated')){ show(null); return; }
  if(HAB_TRANSLATION[id]){ show(HAB_TRANSLATION[id]); return; }
  btn.textContent = 'در حال ترجمه…';
  btn.disabled = true;
  try{
    const r = await fetch(SUPABASE_URL + '/functions/v1/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ mentionId: id }),
    });
    if(!r.ok) throw new Error('translate failed');
    HAB_TRANSLATION[id] = await r.json();
    show(HAB_TRANSLATION[id]);
  }catch(e){
    btn.textContent = 'ترجمه به فارسی';
    showToast('ترجمه انجام نشد؛ چند لحظه بعد دوباره امتحان کنید.');
  }finally{
    btn.disabled = false;
  }
}
export function goHabPage(p){
  HAB_STATE.page = p;
  renderHawzaAbout();
  scrollToListTop(document.querySelector('#hawza-about-panel .news-filters'));
}
export async function hideHawzaMention(id){
  if(!await uiConfirm('این خبر برای همه‌ی بیننده‌ها پنهان شود؟\nبرای خبرهایی که خزنده اشتباهی «درباره حوزه» تشخیص داده است.')) return;
  const r = await api('/hawza_mentions?id=eq.' + id, { method:'PATCH', headers:{ Prefer:'return=minimal' }, body: JSON.stringify({ hidden_at: new Date().toISOString() }) });
  if(!r.ok){ showToast('پنهان کردن خبر انجام نشد؛ دوباره امتحان کنید.'); return; }
  HAB_ROWS = (HAB_ROWS || []).filter(x=>x.id !== id);
  populateHabSites();
  renderHawzaAbout();
  showToast('خبر پنهان شد');
}
export function setupHawzaAbout(){
  const search = document.getElementById('hab-search');
  let t = null;
  search.addEventListener('input', ()=>{ clearTimeout(t); t = setTimeout(()=>{ HAB_STATE.q = search.value.trim(); HAB_STATE.page = 1; renderHawzaAbout(); }, 200); });
  [['hab-time-seg', 't', 'time'], ['hab-kind-seg', 'k', 'kind'], ['hab-scope-seg', 's', 'scope']].forEach(([id, ds, key])=>{
    document.getElementById(id).addEventListener('click', e=>{
      const b = e.target.closest('button');
      if(!b || b.dataset[ds] === undefined) return;
      document.querySelectorAll('#'+id+' > button').forEach(x=>x.classList.toggle('active', x === b));
      HAB_STATE[key] = b.dataset[ds]; HAB_STATE.page = 1;
      if(key === 'kind') populateHabSites();
      renderHawzaAbout();
    });
  });
  document.getElementById('hab-site').addEventListener('change', e=>{ HAB_STATE.site = e.target.value; HAB_STATE.page = 1; renderHawzaAbout(); });
  document.getElementById('hab-feed').addEventListener('click', e=>{
    const tr = e.target.closest('button[data-hab-translate]');
    if(tr){ translateMention(Number(tr.dataset.habTranslate)); return; }
    const hide = e.target.closest('button[data-hab-hide]');
    if(hide) hideHawzaMention(Number(hide.dataset.habHide));
  });
}

