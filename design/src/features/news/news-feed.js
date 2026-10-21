// «اخبار و رویدادها»: فید مشترک تب‌های شبکه‌های اجتماعی/وب‌سایت‌ها/ادعاها (و «اخبار حوزه» در «درباره حوزه»)
// با فیلترهای زمان، بازه‌ی شمسی، منطقه، منبع، میان‌بر جست‌وجو و جست‌وجو؛ صفحه‌بندی ۱۲تایی
import { api } from '../../core/api.js';
import { CHANNELS, POSTS_CACHE, REGIONS, catNameOf, chById, regionNameOf } from '../../data/store.js';
import { claimsTextDisplay, escAttr, escHtml, needsTranslation, safeUrl, toFaDigits } from '../../core/text.js';
import { currentRole } from '../../core/session.js';
import { ICONS } from '../../ui/icons.js';
import { NEWS_PAGE_SIZE, renderPagination } from '../../ui/pagination.js';
import { NEWS_PLATFORM_ICON, NEWS_PLATFORM_LABEL } from '../../ui/platforms.js';
import { newsRelTime, tehranDayDiff } from '../../core/date.js';
import { scrollToListTop } from '../../ui/scroll.js';
import { searchHay, searchNorm } from '../../core/search.js';
import { setupJalaliRange } from '../../ui/jalali-range.js';
import { wireMediaViewerClicks } from '../../ui/media-viewer.js';
import { pickAddBtnHtml, onPicksChanged } from './picks.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { postHideBtnHtml, updateMobileFilterBadges } from '../../app.js';

export const newsState = { region: '', time: 'all', sources: [], query: '', page: 1, dateFrom: '', dateTo: '', platform: 'social' };
// platform: 'social' = پیام‌رسان‌ها (ایتا/تلگرام)، 'website' = سایت‌های خبری عمومی،
// 'hawza' = سایت‌های خبری اختصاصی حوزه (هم platform=website ولی show_in_hawza=true،
// برای همین از سطل 'website' مستثنا می‌شن تا دوبار نمایش داده نشن)،
// 'claims' = کانال بله «ادعاها و شایعات»
export function newsChannels(){
  return CHANNELS.filter(c => {
    if(!c.show_in_news) return false;
    if(newsState.platform === 'website') return c.platform === 'website' && !c.show_in_hawza;
    if(newsState.platform === 'hawza') return c.platform === 'website' && !!c.show_in_hawza;
    if(newsState.platform === 'claims') return c.platform === 'bale';
    return c.platform !== 'website' && c.platform !== 'bale';
  });
}
export function newsPosts(){
  const newsChanIds = new Set(newsChannels().map(c=>c.id));
  return POSTS_CACHE.filter(p=>newsChanIds.has(p.channel_id));
}
export function renderNewsRegionChips(){
  const row = document.getElementById('news-region-row');
  if(!row) return;
  row.innerHTML = '<span class="news-region-chip active" data-r="">همه رسانه‌ها</span>' +
    REGIONS.map(r=>`<span class="news-region-chip" data-r="${r.id}">${escHtml(r.name)}</span>`).join('');
  newsState.region = '';
}
export function renderNewsTopicRow(){
  const row = document.getElementById('news-topic-row');
  if(!row) return;
  row.innerHTML = '<span class="news-topic-chip active" data-kw="">همه</span>' +
    NEWS_TOPICS.map(t=>`<span class="news-topic-chip" data-kw="${escAttr(t.keywords)}">${escAttr(t.name)}</span>`).join('');
  updateNewsTopicVisibility();
}
// ردیف موضوعات فقط توی تب «وب‌سایت‌ها» معنا داره (جایی که این فیچر برای
// مرور مقالات موضوعی سایت‌های خبری ساخته شده) — توی «شبکه‌های اجتماعی»
// و «ادعاها و شایعات» عمداً مخفیه
export function updateNewsTopicVisibility(){
  const wrap = document.getElementById('news-topic-filter-row');
  if(!wrap) return;
  wrap.style.display = (newsState.platform === 'website' && NEWS_TOPICS.length) ? '' : 'none';
}
export function updateNewsSourceSummary(){
  const summary = document.getElementById('news-source-summary');
  if(!summary) return;
  const n = newsState.sources.length;
  summary.textContent = n === 0 ? 'انتخاب رسانه‌ها…' : toFaDigits(n) + ' رسانه انتخاب‌شده';
}
export function populateNewsSourceOptions(){
  const list = document.getElementById('news-source-list');
  if(!list) return;
  // منابعی که دیگه بین کانال‌های فعلی نیستن (مثلاً حذف شدن) از فیلتر انتخاب‌شده هم پاک بشن
  const validIds = new Set(newsChannels().map(c=>String(c.id)));
  newsState.sources = newsState.sources.filter(id=>validIds.has(id));
  list.innerHTML = newsChannels().map(c=>{
    const id = String(c.id);
    const checked = newsState.sources.includes(id) ? 'checked' : '';
    return `<label><input type="checkbox" value="${id}" ${checked}> ${escAttr(c.title||c.username)}</label>`;
  }).join('');
  list.querySelectorAll('input[type=checkbox]').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const id = chk.value;
      if(chk.checked){ if(!newsState.sources.includes(id)) newsState.sources.push(id); }
      else{ newsState.sources = newsState.sources.filter(x=>x!==id); }
      newsState.page = 1;
      updateNewsSourceSummary();
      renderNewsFeed();
    });
  });
  updateNewsSourceSummary();
}
export function filteredNewsPosts(){
  return newsPosts().filter(p=>{
    const ch = chById(p.channel_id);
    // تب «اخبار حوزه»: فقط پست‌هایی که هوش مصنوعی صریحاً سیاسی/اجتماعی
    // تشخیص داده (posts.hawza_relevant===true) نشون داده می‌شن — پست‌های
    // تازه‌ی هنوز-بررسی‌نشده (NULL) و پست‌های غیرسیاسی/غیراجتماعی (false)
    // هر دو مخفی می‌مونن؛ نگاه کن به Edge Function extract-post-keywords
    if(newsState.platform === 'hawza' && p.hawza_relevant !== true) return false;
    if(newsState.region && String(ch.region_id) !== newsState.region) return false;
    if(newsState.sources.length && !newsState.sources.includes(String(p.channel_id))) return false;
    if(newsState.time === 'custom'){
      const postedMs = p.posted_at ? new Date(p.posted_at).getTime() : (p.scraped_at ? new Date(p.scraped_at).getTime() : 0);
      if(newsState.dateFrom && postedMs < new Date(newsState.dateFrom+'T00:00:00').getTime()) return false;
      if(newsState.dateTo && postedMs > new Date(newsState.dateTo+'T23:59:59').getTime()) return false;
    }else if(newsState.time !== 'all'){
      // نیمه‌شب تقویمی تهران، نه فاصله‌ی خام از همین لحظه — تابع
      // tehranDayDiff رو ببین (کنار iranTodayStartMs)
      const diffDays = tehranDayDiff(p.posted_at || p.scraped_at);
      if(newsState.time === 'today' && diffDays !== 0) return false;
      if(newsState.time === 'yesterday' && diffDays !== 1) return false;
      if(newsState.time === 'week' && (diffDays < 0 || diffDays > 6)) return false;
    }
    if(newsState.query){
      // یه موضوعِ ذخیره‌شده چندتا کلیدواژه‌ی جدا با ویرگول می‌فرسته — این‌ها
      // با OR چک می‌شن (کافیه پست حداقل یکی رو داشته باشه)، نه AND؛ برای
      // جستجوی دستی معمولی (بدون ویرگول) رفتار قبلی (تطبیق کامل عبارت) حفظ می‌شه.
      const hay = searchHay(p);
      const terms = newsState.query.split(/[,،]/).map(searchNorm).filter(Boolean);
      if(terms.length && !terms.some(t=>hay.includes(t))) return false;
    }
    return true;
  }).sort((a,b)=> new Date(b.posted_at||b.scraped_at) - new Date(a.posted_at||a.scraped_at));
}
export function renderNewsFeed(){
  updateMobileFilterBadges();
  const feed = document.getElementById('news-feed');
  const empty = document.getElementById('news-empty');
  if(!feed) return;
  const fullList = filteredNewsPosts();
  empty.style.display = fullList.length ? 'none' : 'block';
  const totalPages = Math.max(1, Math.ceil(fullList.length / NEWS_PAGE_SIZE));
  if(newsState.page > totalPages) newsState.page = totalPages;
  if(newsState.page < 1) newsState.page = 1;
  const start = (newsState.page - 1) * NEWS_PAGE_SIZE;
  const list = fullList.slice(start, start + NEWS_PAGE_SIZE);
  renderNewsPagination(totalPages);
  const isAdmin = currentRole === 'app_admin';
  feed.innerHTML = list.map(p=>{
    const ch = chById(p.channel_id) || {};
    const topic = catNameOf(p.channel_id);
    const isClaims = ch.platform === 'bale';
    const isRealVideo = p.media_type === 'video' && p.media_path && /\.mp4($|\?)/i.test(p.media_path);
    const hasThumb = !!p.media_path && (p.media_type === 'photo' || (p.media_type === 'video' && !isRealVideo));
    const thumbBadge = p.media_type === 'video' ? `<span class="pt-media-badge">${ICONS.video}</span>` : '';
    // کانال بله (تب «ادعاها و شایعات») هیچ‌وقت عکس نداره — به‌جای باکس
    // خالی placeholder، کارت کاملاً متنی (تمام‌عرض) طراحی می‌شه
    // اگه خودِ پست عکس نداره، عکس پیش‌فرض همون کانال (اگه از پنل «مدیریت
    // کانال‌ها» آپلود شده باشه) به‌جای باکس خالی placeholder نشون داده می‌شه
    const thumbHtml = isClaims ? '' : hasThumb
      ? `<div class="news-thumb" style="position:relative">${thumbBadge}<img src="${escAttr(p.media_path)}" alt="" loading="lazy" data-viewer-kind="image" data-viewer-src="${escAttr(p.media_path)}"${p.media_type==='video' && p.link ? ` data-viewer-link="${escAttr(p.link)}"` : ''} /></div>`
      : ch.avatar_url
        ? `<div class="news-thumb"><img src="${escAttr(ch.avatar_url)}" alt="" loading="lazy" /></div>`
        : `<div class="news-thumb placeholder">${ICONS.doc}</div>`;
    return `
    <div class="news-card">
      ${thumbHtml}
      <div class="news-body">
        <div class="news-head">
          <span class="news-source">${isClaims ? 'ادعا یا شایعه' : escHtml(ch.title||ch.username||'؟')}</span>
          ${isClaims ? '' : `<span class="news-platform">${NEWS_PLATFORM_ICON[ch.platform]||''}${NEWS_PLATFORM_LABEL[ch.platform]||ch.platform}</span>`}
          ${ch.region_id ? `<span class="news-region">${escHtml(regionNameOf(ch.region_id))}</span>` : ''}
          <span class="news-time">${newsRelTime(p.posted_at||p.scraped_at)}</span>
        </div>
        ${p.title ? `<h3 class="news-title" id="news-title-${p.id}">${escHtml(p.title)}</h3>` : ''}
        <p class="news-text${isClaims ? ' claims-text' : ''}" id="news-text-${p.id}">${claimsTextDisplay(p.text)}</p>
        <button class="news-more" data-news-more="${p.id}" id="news-more-${p.id}">
          نمایش بیشتر
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="news-foot">
          <div>${topic ? `<span class="news-topic">${escHtml(topic)}</span>` : ''}</div>
          <div style="display:flex; gap:10px; align-items:center;">
            ${ch.platform === 'website' && needsTranslation(p) ? `<button type="button" class="news-translate-btn" id="news-translate-btn-${p.id}" data-translate="${p.id}">ترجمه به فارسی</button>` : ''}
            ${isRealVideo ? `<a class="news-link" href="${safeUrl(p.media_path)}" target="_blank" rel="noopener" download>دانلود فیلم ↓</a>` : ''}
            ${(!isClaims && p.link) ? `<a class="news-link" href="${safeUrl(p.link)}" target="_blank" rel="noopener">مشاهده‌ی منبع ↗</a>` : ''}
          </div>
        </div>
        ${isAdmin ? `
        <div class="news-kw-row" id="news-kw-row-${p.id}" style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:8px;">
          <div class="news-kw-chips" id="news-kw-chips-${p.id}">${keywordChipsHtml(p.ai_keywords)}</div>
          <button type="button" class="news-kw-edit-btn" data-kw-edit="${p.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>ویرایش کلیدواژه</button>
          ${isClaims ? '' : pickAddBtnHtml(p)}
          ${postHideBtnHtml(p)}
        </div>` : ''}
      </div>
    </div>`;
  }).join('');
  wireMediaViewerClicks(feed);
  // دکمه‌ی «نمایش بیشتر» فقط وقتی نشون داده بشه که متن واقعاً از ۳ خط رد شده
  // باشه — وگرنه برای پست‌های کوتاه، کلیک روش هیچ تغییری ایجاد نمی‌کرد.
  // فونت فارسی سفارشی (IRANSansX) به‌صورت async لود می‌شه؛ اگه اندازه‌گیری
  // قبل از لود کامل فونت انجام بشه، ارتفاع متن با فونت جایگزین محاسبه
  // می‌شه و ممکنه اشتباهاً «سرریز نشده» تشخیص داده بشه — برای همین بعد از
  // آماده‌شدن فونت‌ها هم یه‌بار دیگه چک می‌کنیم.
  updateNewsMoreButtons(list);
  if(document.fonts && document.fonts.status !== 'loaded'){
    document.fonts.ready.then(()=> updateNewsMoreButtons(list));
  }
}
export function updateNewsMoreButtons(list){
  list.forEach(p=>{
    const textEl = document.getElementById('news-text-'+p.id);
    const moreBtn = document.getElementById('news-more-'+p.id);
    if(!textEl || !moreBtn) return;
    const overflowing = textEl.scrollHeight > textEl.clientHeight + 1;
    moreBtn.style.display = overflowing ? '' : 'none';
  });
}
export function renderNewsPagination(totalPages){
  renderPagination('news-pagination', newsState.page, totalPages, goNewsPage);
}
export function goNewsPage(p){
  newsState.page = p;
  renderNewsFeed();
  scrollToListTop(document.querySelector('#news-study-panel .news-filters'));
}
export function toggleNewsText(postId){
  const t = document.getElementById('news-text-'+postId);
  const b = document.getElementById('news-more-'+postId);
  if(!t || !b) return;
  const isOpen = t.classList.toggle('expanded');
  b.classList.toggle('open', isOpen);
  b.firstChild.textContent = isOpen ? 'بستن ' : 'نمایش بیشتر ';
}
export function setNewsView(mode){
  const feed = document.getElementById('news-feed');
  feed.classList.toggle('grid-view', mode === 'grid');
  document.getElementById('news-view-list-btn').classList.toggle('active', mode === 'list');
  document.getElementById('news-view-grid-btn').classList.toggle('active', mode === 'grid');
}
export function updateDateRangeSummary(){
  const summary = document.getElementById('news-daterange-summary');
  const details = document.getElementById('news-daterange-details');
  if(!summary) return;
  const hasValue = !!(newsState.dateFrom || newsState.dateTo);
  if(hasValue){
    const f = newsState.dateFrom ? new Date(newsState.dateFrom).toLocaleDateString('fa-IR') : '…';
    const t = newsState.dateTo ? new Date(newsState.dateTo).toLocaleDateString('fa-IR') : '…';
    summary.textContent = f + ' تا ' + t;
  }else{
    summary.textContent = 'بازه زمانی';
  }
  if(details) details.classList.toggle('has-value', hasValue);
}
export function clearNewsDateRange(){
  newsState.dateFrom = ''; newsState.dateTo = '';
  document.querySelectorAll('#news-daterange-details .jdate select').forEach(sel=>{ sel.value = ''; });
  updateDateRangeSummary();
}
export function applyNewsDateRange(){
  newsState.time = 'custom';
  document.querySelectorAll('#news-time-seg > button').forEach(x=>x.classList.remove('active'));
  newsState.page = 1;
  updateDateRangeSummary();
  renderNewsFeed();
}
export let NEWS_TOPICS = []; // {id, name, keywords, sort_order} — موضوعات جستجوی ذخیره‌شده («اخبار رسمی»)
export async function loadNewsTopics(){
  const r = await api('/news_topics?select=*&order=sort_order.asc');
  NEWS_TOPICS = r.ok ? await r.json() : [];
}
// ---- کلیدواژه‌های هوش مصنوعی (posts.ai_keywords) — نمایش/ویرایش فقط
// برای مدیر، زیر پست‌های تب‌های «شبکه‌های اجتماعی»/«وب‌سایت‌ها» — برای
// بازبینی رندوم/اصلاح دستی کیفیت استخراج خودکار (نکاه به Edge Function
// extract-post-keywords). NULL یعنی هنوز بررسی نشده؛ آرایه‌ی خالی یعنی
// بررسی شد ولی کلیدواژه‌ی معناداری نداشت.
export function keywordChipsHtml(keywords){
  if(keywords == null) return '<span class="news-kw-chip empty">هنوز بررسی نشده</span>';
  if(!keywords.length) return '<span class="news-kw-chip empty">بدون کلیدواژه</span>';
  return keywords.map(k=>`<span class="news-kw-chip">${escAttr(k)}</span>`).join('');
}
export function setupNewsFeed(){
  onPicksChanged(renderNewsFeed);   // «افزودن به منتخب» → دکمه‌های کارت‌ها تازه بشن
  document.getElementById('news-view-list-btn').addEventListener('click', ()=>setNewsView('list'));
  document.getElementById('news-view-grid-btn').addEventListener('click', ()=>setNewsView('grid'));
  document.getElementById('news-feed').addEventListener('click', e=>{
    const more = e.target.closest('[data-news-more]');
    if(more) toggleNewsText(Number(more.dataset.newsMore));
  });
  document.getElementById('news-search-input').addEventListener('input', e=>{
    newsState.query = e.target.value.trim();
    newsState.page = 1;
    document.querySelectorAll('.news-topic-chip').forEach(c=>c.classList.remove('active'));
    const allTopicChip = document.querySelector('.news-topic-chip[data-kw=""]');
    if(allTopicChip) allTopicChip.classList.add('active');
    renderNewsFeed();
  });
  document.getElementById('news-time-seg').addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b || !b.dataset.t) return;
    document.querySelectorAll('#news-time-seg > button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    newsState.time = b.dataset.t;
    newsState.page = 1;
    clearNewsDateRange();
    document.getElementById('news-daterange-details').removeAttribute('open');
    renderNewsFeed();
  });
  setupJalaliRange(document.getElementById('news-daterange-details'), (which, iso)=>{
    if(which === 'from') newsState.dateFrom = iso; else newsState.dateTo = iso;
    applyNewsDateRange();
  });
  document.getElementById('news-daterange-clear').addEventListener('click', (e)=>{
    e.stopPropagation();
    clearNewsDateRange();
    newsState.time = 'all';
    document.querySelectorAll('#news-time-seg > button').forEach(x=>x.classList.toggle('active', x.dataset.t==='all'));
    document.getElementById('news-daterange-details').removeAttribute('open');
    newsState.page = 1;
    renderNewsFeed();
  });
  document.getElementById('news-region-row').addEventListener('click', e=>{
    const chip = e.target.closest('.news-region-chip'); if(!chip) return;
    document.querySelectorAll('.news-region-chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    newsState.region = chip.dataset.r;
    newsState.page = 1;
    renderNewsFeed();
  });
  document.getElementById('news-topic-row').addEventListener('click', e=>{
    const chip = e.target.closest('.news-topic-chip'); if(!chip) return;
    document.querySelectorAll('.news-topic-chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    newsState.query = chip.dataset.kw;
    document.getElementById('news-search-input').value = chip.dataset.kw;
    newsState.page = 1;
    renderNewsFeed();
  });
}

