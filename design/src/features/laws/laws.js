// «قوانین و مصوبات» (۵.۲۸.۰، مدار دوم): فید منابع show_in_laws با فیلتر «مرجع صادرکننده»، کوئری اختصاصی با باز شدن بخش
import { api } from '../../core/api.js';
import { CHANNELS, HIDDEN_POST_IDS } from '../../data/store.js';
import { claimsTextDisplay, escAttr, escHtml, safeUrl } from '../../core/text.js';
import { currentRole } from '../../core/session.js';
import { matchesTime, newsRelTime } from '../../core/date.js';
import { NEWS_PAGE_SIZE, renderPagination } from '../../ui/pagination.js';
import { NEWS_PLATFORM_ICON, NEWS_PLATFORM_LABEL } from '../../ui/platforms.js';
import { scrollToListTop } from '../../ui/scroll.js';
import { searchHay, searchNorm } from '../../core/search.js';
import { secPendingNote, secRelevant } from '../people/profile-gallery.js';
import { wireMediaViewerClicks } from '../../ui/media-viewer.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { postHideBtnHtml } from '../../app.js';

// ---- «قوانین و مصوبات» (۵.۲۸.۰، مدار دوم) ----
// بدون تب: یک فید از منابع show_in_laws با فیلتر «مرجع صادرکننده» (channels.laws_source).
// داده فقط با باز شدن بخش (کوئری اختصاصی، نه POSTS_CACHE — منابع کم‌تکرارن) و ۱۰ دقیقه کش.
export var LAWS_SOURCES = ['حوزه علمیه خراسان', 'دولت', 'مجلس', 'قوه قضاییه', 'شوراهای عالی', 'استان خراسان رضوی', 'سایر'];
export var LAWS_POSTS = null, LAWS_AT = 0, LAWS_KEY = '', LAWS_LOADING = null;
// عضویت بخش‌های منابع عوض شد (ذخیره‌ی منبع/افزودن گروهی) — با باز شدن بعدی دوباره گرفته بشه
export function resetLawsCache(){ LAWS_AT = 0; }
export var LAWS_STATE = { q:'', time:'', src:'', page:1, key:'' };
export function lawsChannels(){ return CHANNELS.filter(c=>c.show_in_laws); }
export function lawsSourceOf(ch){ return (ch && String(ch.laws_source || '').trim()) || 'سایر'; }
export async function loadLawsPosts(force){
  const ids = lawsChannels().map(c=>c.id).sort((a,b)=>a-b);
  const key = ids.join(',');
  if(!force && LAWS_POSTS && key === LAWS_KEY && Date.now() - LAWS_AT < 600000) return;
  if(!ids.length){ LAWS_POSTS = []; LAWS_KEY = key; LAWS_AT = Date.now(); return; }
  if(LAWS_LOADING) return LAWS_LOADING;
  LAWS_LOADING = (async()=>{
    try{
      const r = await api('/posts?select=*&channel_id=in.(' + key + ')&order=scraped_at.desc&limit=600');
      if(r.ok){ LAWS_POSTS = (await r.json()).filter(p=>!p.hidden_at); LAWS_KEY = key; LAWS_AT = Date.now(); }
      else if(!LAWS_POSTS) LAWS_POSTS = [];
    }catch(e){ if(!LAWS_POSTS) LAWS_POSTS = []; }
    finally{ LAWS_LOADING = null; }
  })();
  return LAWS_LOADING;
}
export async function openLaws(){
  renderLaws();
  await loadLawsPosts();
  renderLaws();
}
export function goLawsPage(p){
  LAWS_STATE.page = p;
  renderLaws();
  scrollToListTop(document.querySelector('#sec-laws .laws-filters'));
}
export function renderLaws(){
  const feed = document.getElementById('laws-feed'), empty = document.getElementById('laws-empty');
  if(!feed) return;
  const chans = lawsChannels();
  const byId = new Map(chans.map(c=>[c.id, c]));
  const counts = {};
  chans.forEach(c=>{ const s = lawsSourceOf(c); counts[s] = (counts[s] || 0) + 1; });
  const srcs = LAWS_SOURCES.filter(s=>counts[s]).concat(Object.keys(counts).filter(s=>!LAWS_SOURCES.includes(s)));
  if(LAWS_STATE.src && !counts[LAWS_STATE.src]) LAWS_STATE.src = '';
  const chips = document.getElementById('laws-source-chips');
  chips.style.display = srcs.length > 1 ? '' : 'none';
  chips.innerHTML = [`<button type="button" class="news-topic-chip${LAWS_STATE.src ? '' : ' active'}" data-src="">همه</button>`]
    .concat(srcs.map(s=>`<button type="button" class="news-topic-chip${LAWS_STATE.src === s ? ' active' : ''}" data-src="${escAttr(s)}">${escHtml(s)}</button>`)).join('');
  if(LAWS_POSTS === null){
    feed.innerHTML = '';
    empty.textContent = 'در حال بارگذاری…'; empty.style.display = 'block';
    renderPagination('laws-pagination', 1, 1, goLawsPage);
    return;
  }
  const q = searchNorm(LAWS_STATE.q);
  const filtered = LAWS_POSTS.filter(p=>{
    const ch = byId.get(p.channel_id); if(!ch) return false;
    if(HIDDEN_POST_IDS.has(p.id)) return false;
    if(!secRelevant(p)) return false; // فقط مصوبه/موضع رسمی به تشخیص هوش مصنوعی (۵.۲۹.۰)
    if(LAWS_STATE.src && lawsSourceOf(ch) !== LAWS_STATE.src) return false;
    if(!matchesTime(p.scraped_at, LAWS_STATE.time)) return false;
    if(q && !searchHay(p).includes(q)) return false;
    return true;
  });
  const key = [LAWS_STATE.q, LAWS_STATE.time, LAWS_STATE.src].join('|');
  if(key !== LAWS_STATE.key){ LAWS_STATE.key = key; LAWS_STATE.page = 1; }
  const pages = Math.max(1, Math.ceil(filtered.length / NEWS_PAGE_SIZE));
  if(LAWS_STATE.page > pages) LAWS_STATE.page = pages;
  const list = filtered.slice((LAWS_STATE.page - 1) * NEWS_PAGE_SIZE, LAWS_STATE.page * NEWS_PAGE_SIZE);
  renderPagination('laws-pagination', LAWS_STATE.page, pages, goLawsPage);
  if(!filtered.length){
    empty.textContent = !chans.length
      ? (currentRole === 'app_admin' ? 'هنوز منبعی برای این بخش انتخاب نشده است. در «تنظیمات بخش‌ها ← مدیریت منابع»، بخش «قوانین و مصوبات» را برای منابع موردنظر تیک بزنید.' : 'هنوز مطلبی در این بخش منتشر نشده است.')
      : !LAWS_POSTS.length ? 'هنوز مطلبی از منابع این بخش جمع‌آوری نشده است؛ مطالب با اجرای بعدی جمع‌آوری می‌رسند.'
      : !LAWS_POSTS.some(secRelevant) ? 'هنوز مصوبه یا موضع رسمی تازه‌ای ثبت نشده است.'
      : 'مطلبی با این فیلتر پیدا نشد.';
    const note = secPendingNote(LAWS_POSTS);
    if(note) empty.textContent += ' ' + note;
    empty.style.display = 'block';
  }else{
    const note = secPendingNote(LAWS_POSTS);
    empty.textContent = note; empty.style.display = note ? 'block' : 'none';
  }
  const admin = currentRole === 'app_admin';
  feed.innerHTML = list.map(p=>{
    const ch = byId.get(p.channel_id) || {};
    const hasThumb = !!p.media_path && p.media_type === 'photo';
    return `
    <div class="news-card laws-card">
      ${hasThumb ? `<div class="news-thumb"><img src="${escAttr(p.media_path)}" alt="" loading="lazy" data-viewer-kind="image" data-viewer-src="${escAttr(p.media_path)}" /></div>` : ''}
      <div class="news-body">
        <div class="news-head">
          <span class="news-source">${escHtml(ch.title || ch.username || '؟')}</span>
          <span class="news-platform">${NEWS_PLATFORM_ICON[ch.platform] || ''}${NEWS_PLATFORM_LABEL[ch.platform] || ch.platform || ''}</span>
          <span class="news-time">${newsRelTime(p.posted_at || p.scraped_at)}</span>
        </div>
        ${p.title ? `<h4 class="news-title" dir="auto">${escHtml(p.title)}</h4>` : ''}
        <p class="news-text" id="lw-post-text-${p.id}">${claimsTextDisplay(p.text)}</p>
        <button class="news-more" data-lw-more="${p.id}" id="lw-post-more-${p.id}">
          نمایش بیشتر
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="news-foot">
          <div><span class="news-topic">${escHtml(lawsSourceOf(ch))}</span></div>
          <div>${p.link ? `<a class="news-link" href="${safeUrl(p.link)}" target="_blank" rel="noopener">مشاهده‌ی منبع ↗</a>` : ''}</div>
        </div>
        ${admin ? `<div class="post-admin-row">${postHideBtnHtml(p)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  wireMediaViewerClicks(feed);
  updateMoreButtons('lw', list);
  if(document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(()=>updateMoreButtons('lw', list));
}
// «نمایش بیشتر» عمومی برای فیدهای تازه (پیشوند id جدا تا با فیدهای دیگر تصادم نکند)
export function updateMoreButtons(prefix, list){
  list.forEach(p=>{
    const t = document.getElementById(prefix + '-post-text-' + p.id), b = document.getElementById(prefix + '-post-more-' + p.id);
    if(t && b) b.style.display = t.scrollHeight > t.clientHeight + 1 ? '' : 'none';
  });
}
export function toggleMoreText(prefix, id){
  const t = document.getElementById(prefix + '-post-text-' + id), b = document.getElementById(prefix + '-post-more-' + id);
  if(!t || !b) return;
  const open = t.classList.toggle('expanded');
  b.classList.toggle('open', open);
  b.firstChild.textContent = open ? 'بستن ' : 'نمایش بیشتر ';
}
export function setupLaws(){
  document.getElementById('laws-search').addEventListener('input', e=>{ LAWS_STATE.q = e.target.value; renderLaws(); });
  document.getElementById('laws-time-seg').addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b || b.dataset.t === undefined) return;
    document.querySelectorAll('#laws-time-seg > button').forEach(x=>x.classList.toggle('active', x === b));
    LAWS_STATE.time = b.dataset.t; renderLaws();
  });
  document.getElementById('laws-source-chips').addEventListener('click', e=>{
    const b = e.target.closest('[data-src]'); if(!b) return;
    LAWS_STATE.src = b.dataset.src; renderLaws();
  });
  document.getElementById('laws-feed').addEventListener('click', e=>{
    const b = e.target.closest('button[data-lw-more]'); if(b) toggleMoreText('lw', b.dataset.lwMore);
  });
}

