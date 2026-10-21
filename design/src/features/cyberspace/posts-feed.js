// تب «پست‌های منتشر شده» (کنشگری مجازی): فیلترها، صفحه‌بندی ۱۲تایی و «نمایش بیشتر»
import { CATEGORIES, CHANNELS, POSTS_CACHE, catNameOf, chById, chName, regionNameOf } from '../../data/store.js';
import { claimsTextDisplay, escAttr, escHtml, safeUrl, toFaDigits } from '../../core/text.js';
import { currentRole } from '../../core/session.js';
import { ICONS } from '../../ui/icons.js';
import { matchesTime, newsRelTime } from '../../core/date.js';
import { NEWS_PAGE_SIZE, renderPagination } from '../../ui/pagination.js';
import { NEWS_PLATFORM_ICON, NEWS_PLATFORM_LABEL } from '../../ui/platforms.js';
import { scrollToListTop } from '../../ui/scroll.js';
import { searchHay, searchNorm } from '../../core/search.js';
import { setupJalaliRange } from '../../ui/jalali-range.js';
import { wireMediaViewerClicks } from '../../ui/media-viewer.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { postHideBtnHtml, updateMobileFilterBadges } from '../../app.js';

// کانالی که از جدول «افراد و مجموعه‌ها» باز شده: بالای فید یه نوار «فقط پست‌های X» با
// «نمایش همه» نشون داده می‌شه، و با برگشتن به جدول انتخاب پاک می‌شه — قبلاً بی‌صدا
// روی فید می‌موند و کاربر فکر می‌کرد پست‌ها کمه
export var POSTS_FOCUS_FROM_TABLE = false;
export function clearPostsFocus(){
  POSTS_FOCUS_FROM_TABLE = false;
  postsSelectedChannels = [];
  populatePostSourceOptions();
  renderPosts();
}
export function renderPostsFocusBar(){
  const bar = document.getElementById('posts-focus-bar');
  if(!bar) return;
  if(!POSTS_FOCUS_FROM_TABLE || postsSelectedChannels.length !== 1){ POSTS_FOCUS_FROM_TABLE = false; bar.style.display = 'none'; return; }
  const ch = chById(Number(postsSelectedChannels[0])) || {};
  bar.innerHTML = `<span>فقط پست‌های <b>${escHtml(ch.title || ch.username || '')}</b></span><button type="button" data-posts-focus-clear>نمایش همه‌ی کانال‌ها</button>`;
  bar.style.display = '';
}
export function openPersonFeed(channelId){
  POSTS_FOCUS_FROM_TABLE = true;
  postsSelectedChannels = [String(channelId)];
  populatePostSourceOptions();
  renderPosts();
  const tabBtn = document.querySelector('#posts-page-tabs button[data-posts-tab="feed"]');
  if(tabBtn) tabBtn.click();
}
// ---- posts page ----
export const filterCatEl = document.getElementById('posts-filter-cat');
// زمان فید کنشگری: '' | today | yesterday | week | custom (بازه‌ی شمسی، postsDateFrom/To میلادی)
export let postsTime = '', postsDateFrom = '', postsDateTo = '';
export const searchEl = document.getElementById('posts-search');
export const postsList = document.getElementById('posts-list');
export const postsEmpty = document.getElementById('posts-empty');
// به‌جای یه select تک‌انتخابی، مثل «انتخاب رسانه‌ها…» تب شبکه‌های اجتماعی
// یه چندانتخابی چک‌باکسیه — بشه چندتا کانال رو هم‌زمان انتخاب کرد
export let postsSelectedChannels = [];
// فیلتر «طلاب خراسان / سایر» — '' یعنی همه؛ نگاه کن به matchesActivistGroup
export let postsGroupFilter = '';
export function updatePostSourceSummary(){
  const summary = document.getElementById('posts-source-summary');
  if(!summary) return;
  const n = postsSelectedChannels.length;
  summary.textContent = n === 0 ? 'انتخاب کانال‌ها…' : toFaDigits(n) + ' کانال انتخاب‌شده';
}
export function populatePostSourceOptions(){
  const list = document.getElementById('posts-source-list');
  if(!list) return;
  const cyberChannels = CHANNELS.filter(c=>c.show_in_cyberspace);
  const validIds = new Set(cyberChannels.map(c=>String(c.id)));
  postsSelectedChannels = postsSelectedChannels.filter(id=>validIds.has(id));
  list.innerHTML = cyberChannels.map(c=>{
    const id = String(c.id);
    const checked = postsSelectedChannels.includes(id) ? 'checked' : '';
    return `<label><input type="checkbox" value="${id}" ${checked}> ${escAttr(c.title||c.username)}</label>`;
  }).join('');
  list.querySelectorAll('input[type=checkbox]').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const id = chk.value;
      POSTS_FOCUS_FROM_TABLE = false;
      if(chk.checked){ if(!postsSelectedChannels.includes(id)) postsSelectedChannels.push(id); }
      else{ postsSelectedChannels = postsSelectedChannels.filter(x=>x!==id); }
      updatePostSourceSummary();
      renderPosts();
    });
  });
  updatePostSourceSummary();
}
export function populatePostFilters(){
  populatePostSourceOptions();
  filterCatEl.innerHTML = '<option value="">همه‌ی دسته‌بندی‌ها</option>' +
    CATEGORIES.map(c=>`<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
}
// فیلتر مشترک «طلاب خراسان / سایر» بخش «کنشگری مجازی» — هم توی فید
// «پست‌های منتشر شده» هم توی جدول «افراد و مجموعه‌ها» استفاده می‌شه
// (نگاه کن به postsGroupFilter/cyberPeopleGroupFilter)
export function matchesActivistGroup(ch, group){
  if(!group) return true;
  if(group === 'khorasan') return !!(ch && ch.is_khorasan_talabeh);
  if(group === 'other') return !(ch && ch.is_khorasan_talabeh);
  return true;
}
export function filteredPosts(){
  const catFilter = filterCatEl.value;
  const q = searchEl.value.trim();
  const fromMs = postsDateFrom ? new Date(postsDateFrom + 'T00:00:00').getTime() : null;
  const toMs = postsDateTo ? new Date(postsDateTo + 'T23:59:59').getTime() : null;
  return POSTS_CACHE.filter(p=>{
    const ownerCh = chById(p.channel_id);
    if(!ownerCh || !ownerCh.show_in_cyberspace) return false;
    if(!matchesActivistGroup(ownerCh, postsGroupFilter)) return false;
    if(postsSelectedChannels.length && !postsSelectedChannels.includes(String(p.channel_id))) return false;
    if(catFilter){
      const ch = chById(p.channel_id);
      if(!ch || String(ch.category_id) !== catFilter) return false;
    }
    if(postsTime === 'custom'){
      const ms = new Date(p.scraped_at).getTime();
      if(fromMs !== null && ms < fromMs) return false;
      if(toMs !== null && ms > toMs) return false;
    }else if(!matchesTime(p.scraped_at, postsTime)) return false;
    if(q && !searchHay(p).includes(searchNorm(q)) && !searchNorm(chName(p.channel_id)).includes(searchNorm(q))) return false;
    return true;
  });
}
export function postMediaBlock(p){
  const isMedia = p.media_type && p.media_type!=='none';
  if(!isMedia) return '';
  const mediaIcon = p.media_type==='video' ? ICONS.video : ICONS.photo;
  if(!p.media_path){
    return `<div class="pt-media">${mediaIcon}<b>${p.media_type==='video'?'فیلم':'عکس'}</b><span>پیش‌نمایش موجود نیست</span></div>`;
  }
  const path = p.media_path;
  if(p.media_type==='photo'){
    return `<div class="pt-media has-img"><img src="${escAttr(path)}" loading="lazy" alt="" data-viewer-kind="image" data-viewer-src="${escAttr(path)}"><span class="pt-media-badge">${ICONS.photo}</span></div>`;
  }
  if(p.media_type==='video'){
    const isRealVideo = /\.mp4($|\?)/i.test(path);
    if(isRealVideo){
      return `<div class="pt-media has-img"><video src="${escAttr(path)}" muted preload="metadata" data-viewer-kind="video" data-viewer-src="${escAttr(path)}"></video><span class="pt-media-badge">${ICONS.video}</span><a class="pt-media-link" href="${escAttr(path)}" target="_blank" rel="noopener" download data-stop-click>${ICONS.download}دانلود فیلم</a></div>`;
    }
    // ایتا: فقط تصویر بندانگشتی دانلود شده، نه فایل کامل — کلیک روی تصویر
    // بزرگش می‌کنه، لینک جدا به منبع اصلی می‌ره
    const srcLink = p.link || path;
    return `<div class="pt-media has-img"><img src="${escAttr(path)}" loading="lazy" alt="" data-viewer-kind="image" data-viewer-src="${escAttr(path)}" data-viewer-link="${escAttr(srcLink)}"><span class="pt-media-badge">${ICONS.video}</span><a class="pt-media-link" href="${escAttr(srcLink)}" target="_blank" rel="noopener" data-stop-click>${ICONS.external}مشاهده در مبدأ</a></div>`;
  }
  return `<div class="pt-media">${mediaIcon}<b>رسانه</b><span>پیش‌نمایش موجود نیست</span></div>`;
}
// ظاهر کارت‌های این صفحه دقیقاً همون کارت‌های تب «شبکه‌های اجتماعی» توی
// اخبار رسمی‌ه (همون کلاس‌های news-card/news-thumb/news-text و...) —
// فقط منبع داده و فیلترها فرق داره (filteredPosts به‌جای filteredNewsPosts)
// صفحه‌بندی فید پست‌ها (همون اندازه‌ی صفحه‌ی اخبار). با عوض شدن هر فیلتر
// (امضای postsFilterKey) به صفحه‌ی ۱ برمی‌گرده؛ رفرش داده صفحه رو نگه می‌داره
export let postsPage = 1, postsFilterSig = '';
export function postsFilterKey(){
  return JSON.stringify([filterCatEl.value, postsTime, postsDateFrom, postsDateTo, searchEl.value.trim(), postsGroupFilter, postsSelectedChannels]);
}
export function goPostsPage(p){
  postsPage = p;
  renderPosts();
  scrollToListTop(document.getElementById('posts-tab-feed'));
}
export function renderPosts(){
  updateMobileFilterBadges();
  renderPostsFocusBar();
  const filtered = filteredPosts();
  postsEmpty.style.display = filtered.length ? 'none' : 'block';
  const sig = postsFilterKey();
  if(sig !== postsFilterSig){ postsFilterSig = sig; postsPage = 1; }
  const totalPages = Math.max(1, Math.ceil(filtered.length / NEWS_PAGE_SIZE));
  postsPage = Math.min(Math.max(1, postsPage), totalPages);
  const list = filtered.slice((postsPage - 1) * NEWS_PAGE_SIZE, postsPage * NEWS_PAGE_SIZE);
  renderPagination('posts-pagination', postsPage, totalPages, goPostsPage);
  postsList.innerHTML = list.map(p=>{
    const ch = chById(p.channel_id) || {};
    const topic = catNameOf(p.channel_id);
    const isRealVideo = p.media_type === 'video' && p.media_path && /\.mp4($|\?)/i.test(p.media_path);
    const hasThumb = !!p.media_path && (p.media_type === 'photo' || (p.media_type === 'video' && !isRealVideo));
    const thumbBadge = p.media_type === 'video' ? `<span class="pt-media-badge">${ICONS.video}</span>` : '';
    const thumbHtml = hasThumb
      ? `<div class="news-thumb" style="position:relative">${thumbBadge}<img src="${escAttr(p.media_path)}" alt="" loading="lazy" data-viewer-kind="image" data-viewer-src="${escAttr(p.media_path)}"${p.media_type==='video' && p.link ? ` data-viewer-link="${escAttr(p.link)}"` : ''} /></div>`
      : ch.avatar_url
        ? `<div class="news-thumb"><img src="${escAttr(ch.avatar_url)}" alt="" loading="lazy" /></div>`
        : `<div class="news-thumb placeholder">${ICONS.doc}</div>`;
    return `
    <div class="news-card">
      ${thumbHtml}
      <div class="news-body">
        <div class="news-head">
          <span class="news-source">${escHtml(ch.title||ch.username||'؟')}</span>
          <span class="news-platform">${NEWS_PLATFORM_ICON[ch.platform]||''}${NEWS_PLATFORM_LABEL[ch.platform]||ch.platform}</span>
          ${ch.region_id ? `<span class="news-region">${escHtml(regionNameOf(ch.region_id))}</span>` : ''}
          <span class="news-time">${newsRelTime(p.posted_at||p.scraped_at)}</span>
        </div>
        <p class="news-text" id="post-text-${p.id}">${claimsTextDisplay(p.text)}</p>
        <button class="news-more" data-post-more="${p.id}" id="post-more-${p.id}">
          نمایش بیشتر
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="news-foot">
          <div>${topic ? `<span class="news-topic">${escHtml(topic)}</span>` : ''}</div>
          <div style="display:flex; gap:10px; align-items:center;">
            ${isRealVideo ? `<a class="news-link" href="${safeUrl(p.media_path)}" target="_blank" rel="noopener" download>دانلود فیلم ↓</a>` : ''}
            ${p.link ? `<a class="news-link" href="${safeUrl(p.link)}" target="_blank" rel="noopener">مشاهده‌ی منبع ↗</a>` : ''}
          </div>
        </div>
        ${currentRole === 'app_admin' ? `<div class="post-admin-row">${postHideBtnHtml(p)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  wireMediaViewerClicks(postsList);
  updatePostMoreButtons(list);
  if(document.fonts && document.fonts.status !== 'loaded'){
    document.fonts.ready.then(()=> updatePostMoreButtons(list));
  }
}
export function updatePostMoreButtons(list){
  list.forEach(p=>{
    const textEl = document.getElementById('post-text-'+p.id);
    const moreBtn = document.getElementById('post-more-'+p.id);
    if(!textEl || !moreBtn) return;
    const overflowing = textEl.scrollHeight > textEl.clientHeight + 1;
    moreBtn.style.display = overflowing ? '' : 'none';
  });
}
export function togglePostText(postId){
  const t = document.getElementById('post-text-'+postId);
  const b = document.getElementById('post-more-'+postId);
  if(!t || !b) return;
  const isOpen = t.classList.toggle('expanded');
  b.classList.toggle('open', isOpen);
  b.firstChild.textContent = isOpen ? 'بستن ' : 'نمایش بیشتر ';
}
export function updatePostsRangeSummary(){
  const has = !!(postsDateFrom || postsDateTo);
  const f = postsDateFrom ? new Date(postsDateFrom).toLocaleDateString('fa-IR') : '…';
  const t = postsDateTo ? new Date(postsDateTo).toLocaleDateString('fa-IR') : '…';
  document.getElementById('posts-daterange-summary').textContent = has ? f + ' تا ' + t : 'بازه زمانی';
  document.getElementById('posts-daterange-details').classList.toggle('has-value', has);
}
export function clearPostsRange(){
  postsDateFrom = ''; postsDateTo = '';
  document.querySelectorAll('#posts-daterange-details .jdate select').forEach(sel=>{ sel.value = ''; });
  updatePostsRangeSummary();
}
export const postsGroupSegEl = document.getElementById('posts-group-seg');
export function setupPostsFeed(){
  filterCatEl.addEventListener('change', renderPosts);
  document.getElementById('posts-time-seg').addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b || b.dataset.t === undefined) return;
    document.querySelectorAll('#posts-time-seg > button').forEach(x=>x.classList.toggle('active', x === b));
    postsTime = b.dataset.t;
    clearPostsRange();
    document.getElementById('posts-daterange-details').removeAttribute('open');
    renderPosts();
  });
  setupJalaliRange(document.getElementById('posts-daterange-details'), (which, iso)=>{
    if(which === 'from') postsDateFrom = iso; else postsDateTo = iso;
    postsTime = 'custom';
    document.querySelectorAll('#posts-time-seg > button').forEach(x=>x.classList.remove('active'));
    updatePostsRangeSummary();
    renderPosts();
  });
  document.getElementById('posts-daterange-clear').addEventListener('click', e=>{
    e.stopPropagation();
    clearPostsRange();
    postsTime = '';
    document.querySelectorAll('#posts-time-seg > button').forEach(x=>x.classList.toggle('active', x.dataset.t === ''));
    document.getElementById('posts-daterange-details').removeAttribute('open');
    renderPosts();
  });
  searchEl.addEventListener('input', renderPosts);
  postsList.addEventListener('click', e=>{
    const b = e.target.closest('button[data-post-more]'); if(b) togglePostText(b.dataset.postMore);
  });
  document.getElementById('posts-focus-bar').addEventListener('click', e=>{
    if(e.target.closest('[data-posts-focus-clear]')) clearPostsFocus();
  });
  if(postsGroupSegEl) postsGroupSegEl.addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b || b.dataset.g===undefined) return;
    postsGroupSegEl.querySelectorAll(':scope > button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    postsGroupFilter = b.dataset.g;
    renderPosts();
  });
}

