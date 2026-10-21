// گالری لوگو + فید منبع «یادداشت‌ها» (چهره‌ها، سازمان‌ها، اندیشکده‌ها) — همون ظرف در «مواضع مراجع و علماء» (pfMode = pos-<تب>)
import { api } from '../../core/api.js';
import { CHANNELS, CHANNEL_PROFILE_GROUPS, HIDDEN_POST_IDS, POSTS_CACHE, PROFILE_GROUPS, catNameOf, chById, regionNameOf } from '../../data/store.js';
import { claimsTextDisplay, escAttr, escHtml, faNum, safeUrl, toFaDigits } from '../../core/text.js';
import { currentRole } from '../../core/session.js';
import { ICONS } from '../../ui/icons.js';
import { matchesTime, newsRelTime } from '../../core/date.js';
import { navMark } from '../../core/router.js';
import { NEWS_PAGE_SIZE, renderPagination } from '../../ui/pagination.js';
import { NEWS_PLATFORM_ICON, NEWS_PLATFORM_LABEL } from '../../ui/platforms.js';
import { scrollToListTop } from '../../ui/scroll.js';
import { searchHay, searchNorm } from '../../core/search.js';
import { wireMediaViewerClicks } from '../../ui/media-viewer.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { postHideBtnHtml } from '../../app.js';

// ---- چهره‌های سیاسی (تنها محتوای بخش «یادداشت‌ها») ----
// عیناً هم‌الگو با فید «کنشگری مجازی» بالا (همون POSTS_CACHE، فقط فیلتر
// عضویت show_in_people به‌جای show_in_cyberspace)؛ چون یه
// پست ممکنه هم‌زمان توی هر دو فید ظاهر بشه (کانالش هر دو عضویت رو
// داشته باشه)، آی‌دی‌های DOM این فید با پیشوند pf- جدا شدن تا با
// آی‌دی‌های post-text-{id}/post-more-{id} فید کنشگری مجازی تصادم نکنن.
// دکمه‌های زمان؛ value مثل همون select قبلی خونده/نوشته می‌شه
export const pfTimeSegEl = document.getElementById('political-figures-filter-time');
export const pfFilterTimeEl = pfTimeSegEl ? {
  get value(){ const b = pfTimeSegEl.querySelector('button.active'); return b ? b.dataset.t : ''; },
  set value(v){ pfTimeSegEl.querySelectorAll('button').forEach(x=>x.classList.toggle('active', x.dataset.t === v)); }
} : null;
export const pfSearchEl = document.getElementById('political-figures-search');
export const pfList = document.getElementById('political-figures-list');
export const pfEmpty = document.getElementById('political-figures-empty');
export const pfGallerySearchEl = document.getElementById('pf-gallery-search');
// pfMode: 'figures' (ستون show_in_people) یا 'orgs' (ستون show_in_orgs)؛
// pfSelectedChannel: کانالی که از گالری انتخاب شده (null = نمایش گالری)
export let pfMode = 'figures';
export let pfSelectedChannel = null;
// حالت‌ها: figures/orgs/thinktanks («یادداشت‌ها») و pos-<تب> («مواضع مراجع و علماء»، ۵.۲۸.۰)
export function pfDomainField(mode){
  mode = mode || pfMode;
  return mode === 'orgs' ? 'show_in_orgs' : mode === 'thinktanks' ? 'show_in_thinktanks'
    : mode.startsWith('pos-') ? 'show_in_positions' : 'show_in_people';
}
export function pfModeMatch(ch, mode){
  if(!ch || !ch[pfDomainField(mode)]) return false;
  return !mode.startsWith('pos-') || ch.positions_tab === mode.slice(4);
}
export function pfChannelMatch(ch){ return pfModeMatch(ch, pfMode); }
export function politicalFigureChannels(){
  return CHANNELS.filter(pfChannelMatch);
}
// حالت‌های تازه منابع کم‌تکرار دارن (بیانیه‌ی مرجع، گزارش اندیشکده) — از سقف ۱۰۰۰تایی POSTS_CACHE
// زود بیرون می‌افتن؛ پس با باز شدن هر حالت، پست‌های همون منابع جدا گرفته و کنار کش نگه داشته می‌شن
export var PF_EXTRA_POSTS = [], PF_EXTRA_AT = {}, PF_EXTRA_LOADING = {};
// عضویت بخش‌های منابع عوض شد (ذخیره‌ی منبع/افزودن گروهی) — پست‌های جدا دوباره گرفته بشن
export function resetPfExtraCache(){ PF_EXTRA_AT = {}; }
export async function ensurePfExtra(mode){
  if(mode === 'figures' || mode === 'orgs') return;
  if(PF_EXTRA_AT[mode] && Date.now() - PF_EXTRA_AT[mode] < 600000) return;
  if(PF_EXTRA_LOADING[mode]) return;
  const ids = CHANNELS.filter(c=>pfModeMatch(c, mode)).map(c=>c.id);
  if(!ids.length){ PF_EXTRA_AT[mode] = Date.now(); return; }
  PF_EXTRA_LOADING[mode] = true;
  try{
    const r = await api('/posts?select=*&channel_id=in.(' + ids.join(',') + ')&order=scraped_at.desc&limit=600');
    if(r.ok){
      const have = new Set(PF_EXTRA_POSTS.map(p=>p.id));
      (await r.json()).forEach(p=>{ if(!p.hidden_at && !have.has(p.id)) PF_EXTRA_POSTS.push(p); });
      PF_EXTRA_AT[mode] = Date.now();
    }
  }catch(e){}
  finally{ PF_EXTRA_LOADING[mode] = false; }
  if(pfMode === mode) renderPoliticalFigures();
}
// ۵.۲۹.۰ (migration_048): در تب‌های «مواضع» فقط مطلبی نمایش داده می‌شود که
// هوش مصنوعی مرتبط تشخیص داده (section_relevant=true؛ NULL = هنوز بررسی نشده — خواست کاربر: پنهان)
// اندیشکده‌ها عمداً بدون فیلتر (خواست کاربر: «فعلاً نیاز به بررسی هوش مصنوعی ندارد»)
export function pfModeFiltered(mode){ mode = mode || pfMode; return mode.startsWith('pos-'); }
export function secRelevant(p){ return p.section_relevant === true; }
// متن «در انتظار بررسی» فقط برای مدیر
export function secPendingNote(list){
  if(currentRole !== 'app_admin' || !list.length) return '';
  if(!('section_relevant' in list[0])) return 'برای فعال شدن فیلتر هوش مصنوعی، migration_048 باید در سوپابیس اجرا شود؛ تا آن موقع مطلبی نمایش داده نمی‌شود.';
  const n = list.filter(p=>p.section_relevant == null).length;
  return n ? faNum(n) + ' مطلب در انتظار بررسی هوش مصنوعی است (برای بیننده‌ها نمایش داده نمی‌شود).' : '';
}
export function pfPostsAll(){
  if(!PF_EXTRA_POSTS.length) return POSTS_CACHE;
  const ids = new Set(POSTS_CACHE.map(p=>p.id));
  return POSTS_CACHE.concat(PF_EXTRA_POSTS.filter(p=>!ids.has(p.id) && !HIDDEN_POST_IDS.has(p.id)));
}
export let pfGroupFilter = null; // id گروه انتخاب‌شده در ردیف چیپ‌ها (null = همه)
export function pfGroupsOfKind(){ return PROFILE_GROUPS.filter(g=>g.kind === pfMode); }
export function pfGroupIdsOf(channelId){
  return CHANNEL_PROFILE_GROUPS.filter(x=>x.channel_id === channelId).map(x=>x.group_id);
}
export function setPfMode(mode){
  navMark();
  if(pfMode !== mode){ pfMode = mode; pfSelectedChannel = null; pfGroupFilter = null; }
  if(pfGallerySearchEl) pfGallerySearchEl.value = '';
  renderPoliticalFigures();
  ensurePfExtra(mode);
}
export function pfLogoHtml(ch){
  if(ch.avatar_url) return `<span class="pf-logo"><img src="${escAttr(ch.avatar_url)}" alt="" loading="lazy" /></span>`;
  const initial = (ch.title || ch.username || '؟').trim().charAt(0);
  return `<span class="pf-logo">${escAttr(initial)}</span>`;
}
export function pfChannelUrl(ch){
  if(ch.platform === 'telegram') return 'https://t.me/' + ch.username;
  if(ch.platform === 'eitaa') return 'https://eitaa.com/' + ch.username;
  return '';
}
// قبلاً دراپ‌داون چندانتخابی کانال‌ها رو پر می‌کرد؛ الان انتخاب کانال از
// گالری لوگوهاست — اسم تابع برای سازگاری با loadAll() حفظ شده
export function populatePoliticalFiguresSourceOptions(){
  if(pfSelectedChannel && !politicalFigureChannels().some(c=>c.id===pfSelectedChannel)) pfSelectedChannel = null;
}
export function renderPfGallery(){
  const grid = document.getElementById('pf-logo-grid');
  const empty = document.getElementById('pf-gallery-empty');
  if(!grid) return;
  const q = searchNorm(pfGallerySearchEl ? pfGallerySearchEl.value : '');
  const all = politicalFigureChannels();
  const stats = {};
  const filt = pfModeFiltered();
  pfPostsAll().forEach(p=>{
    if(filt && !secRelevant(p)) return;
    const st = stats[p.channel_id] || (stats[p.channel_id] = {n:0, last:''});
    st.n++;
    const t = p.posted_at || p.scraped_at || '';
    if(t > st.last) st.last = t;
  });
  const channels = all
    .filter(c=> !q || searchNorm(c.title).includes(q) || searchNorm(c.username).includes(q))
    .sort((a,b)=> ((stats[b.id]||{}).last||'').localeCompare((stats[a.id]||{}).last||''));
  if(!all.length){
    empty.textContent = pfMode === 'orgs' ? 'هنوز سازمانی به این بخش اضافه نشده است.'
      : pfMode === 'figures' ? 'هنوز چهره‌ای به این بخش اضافه نشده است.'
      : pfMode === 'thinktanks' ? 'هنوز اندیشکده‌ای به این بخش اضافه نشده است.'
      : 'هنوز منبعی به این تب اضافه نشده است.' + (currentRole === 'app_admin' ? ' منابع از «تنظیمات بخش‌ها ← مدیریت منابع»، بخش «مواضع مراجع و علماء» اضافه می‌شوند.' : '');
  }else{
    empty.textContent = 'موردی با این نام پیدا نشد.';
  }
  empty.style.display = channels.length ? 'none' : 'block';
  const unit = pfMode === 'figures' ? 'یادداشت' : 'مطلب';
  const cardHtml = (ch,i)=>{
    const st = stats[ch.id];
    const meta = st ? `${toFaDigits(st.n)} ${unit}<br>${newsRelTime(st.last)}` : `بدون ${unit} اخیر`;
    return `<button type="button" class="pf-logo-card" data-ch="${ch.id}" style="animation-delay:${Math.min(i,12)*30}ms" title="مشاهده‌ی مطالب ${escAttr(ch.title||ch.username)}">
        ${pfLogoHtml(ch)}
        <span class="pf-logo-name">${escAttr(ch.title||ch.username)}</span>
        <span class="pf-logo-meta">${meta}</span>
      </button>`;
  };
  // گروه‌ها: ردیف چیپ («همه» + گروه‌های همین تب)؛ در حالت «همه» لوگوها
  // زیر تیتر هر گروه بخش‌بخش می‌شن (کانال چندگروهه توی هر گروهش تکرار
  // می‌شه) + بخش «سایر» برای بدون‌گروه‌ها؛ با انتخاب یه گروه فقط همون
  const groups = pfGroupsOfKind();
  if(pfGroupFilter && !groups.some(g=>g.id===pfGroupFilter)) pfGroupFilter = null;
  const chipRow = document.getElementById('pf-group-row');
  chipRow.style.display = groups.length ? '' : 'none';
  chipRow.innerHTML = [`<button type="button" class="news-topic-chip${pfGroupFilter ? '' : ' active'}" data-group="">همه</button>`]
    .concat(groups.map(g=>`<button type="button" class="news-topic-chip${pfGroupFilter===g.id ? ' active' : ''}" data-group="${g.id}">${escAttr(g.name)}</button>`)).join('');
  const inGroup = (ch, gid)=> pfGroupIdsOf(ch.id).includes(gid);
  let visible = channels;
  if(pfGroupFilter) visible = channels.filter(ch=>inGroup(ch, pfGroupFilter));
  empty.style.display = visible.length ? 'none' : 'block';
  if(pfGroupFilter && channels.length && !visible.length) empty.textContent = 'موردی در این گروه نیست.';
  if(pfGroupFilter || !groups.length){
    grid.className = 'pf-logo-grid';
    grid.innerHTML = visible.map(cardHtml).join('');
    return;
  }
  grid.className = '';
  const sections = groups.map(g=>({title:g.name, items:channels.filter(ch=>inGroup(ch, g.id))}));
  const groupIds = new Set(groups.map(g=>g.id));
  sections.push({title:'سایر', items:channels.filter(ch=>!pfGroupIdsOf(ch.id).some(id=>groupIds.has(id)))});
  grid.innerHTML = sections.filter(sec=>sec.items.length).map(sec=>`
    <div class="pf-group-section">
      <h4 class="pf-group-title">${escAttr(sec.title)} <small>${toFaDigits(sec.items.length)}</small></h4>
      <div class="pf-logo-grid">${sec.items.map(cardHtml).join('')}</div>
    </div>`).join('');
}
export function openPfChannel(id){
  navMark();
  pfSelectedChannel = id;
  if(pfSearchEl) pfSearchEl.value = '';
  if(pfFilterTimeEl) pfFilterTimeEl.value = '';
  renderPoliticalFigures();
  window.scrollTo(0,0);
}
export function closePfChannel(){
  navMark();
  pfSelectedChannel = null;
  renderPoliticalFigures();
  window.scrollTo(0,0);
}
export const pfLogoGridEl = document.getElementById('pf-logo-grid');
export const pfBackBtnEl = document.getElementById('pf-back-btn');
export const pfGroupRowEl = document.getElementById('pf-group-row');
export var PF_PAGE = 1, PF_PAGE_KEY = ''; // var: renderPoliticalFigures ممکنه پیش از این خط صدا زده بشه
export function goPfPage(p){
  PF_PAGE = p;
  renderPoliticalFigures();
  scrollToListTop(document.getElementById('pf-feed-view'));
}
export function filteredPoliticalFigurePosts(){
  const timeFilter = pfFilterTimeEl ? pfFilterTimeEl.value : '';
  const q = searchNorm(pfSearchEl ? pfSearchEl.value : '');
  const filt = pfModeFiltered();
  return pfPostsAll().filter(p=>{
    if(p.channel_id !== pfSelectedChannel) return false;
    if(filt && !secRelevant(p)) return false;
    if(!matchesTime(p.scraped_at, timeFilter)) return false;
    if(q && !searchHay(p).includes(q)) return false;
    return true;
  }).sort((a,b)=>String(b.scraped_at || '').localeCompare(String(a.scraped_at || '')));
}
export function renderPoliticalFigures(){
  if(!pfList) return;
  const galleryView = document.getElementById('pf-gallery-view');
  const feedView = document.getElementById('pf-feed-view');
  const selCh = pfSelectedChannel ? chById(pfSelectedChannel) : null;
  if(!selCh || !pfChannelMatch(selCh)){
    pfSelectedChannel = null;
    galleryView.style.display = '';
    feedView.style.display = 'none';
    renderPfGallery();
    return;
  }
  galleryView.style.display = 'none';
  feedView.style.display = '';
  const url = pfChannelUrl(selCh);
  document.getElementById('pf-feed-identity').innerHTML = `${pfLogoHtml(selCh)}
    <div><h3>${escAttr(selCh.title||selCh.username)}</h3>
    ${url ? `<a href="${escAttr(url)}" target="_blank" rel="noopener">${NEWS_PLATFORM_LABEL[selCh.platform]||selCh.platform} ↗</a>` : ''}
    ${(()=>{ const names = pfGroupsOfKind().filter(g=>pfGroupIdsOf(selCh.id).includes(g.id)).map(g=>`<span>${escAttr(g.name)}</span>`);
      return names.length ? `<div class="pf-feed-groups">${names.join('')}</div>` : ''; })()}</div>`;
  const filtered = filteredPoliticalFigurePosts();
  pfEmpty.style.display = filtered.length ? 'none' : 'block';
  if(pfModeFiltered()){
    const chPosts = pfPostsAll().filter(p=>p.channel_id === pfSelectedChannel);
    const note = secPendingNote(chPosts);
    pfEmpty.textContent = (chPosts.some(secRelevant) ? 'مطلبی با این فیلتر پیدا نشد.' : 'هنوز مطلب مرتبطی از این منبع ثبت نشده است.') + (note ? ' ' + note : '');
    const head = document.getElementById('pf-feed-identity');
    if(note && filtered.length) head.insertAdjacentHTML('beforeend', `<div class="sec-pending-note">${escHtml(note)}</div>`);
  }else pfEmpty.textContent = 'مطلبی با این فیلتر پیدا نشد.';
  // صفحه‌بندی ۱۲تایی مثل اخبار و کنشگری (۵.۲۱.۰؛ قبلاً تا ۱۵۰ مطلب یک‌جا)؛ با عوض شدن
  // کانال/فیلتر به صفحه‌ی ۱ برمی‌گرده
  const pfKey = [pfSelectedChannel, pfFilterTimeEl ? pfFilterTimeEl.value : '', pfSearchEl ? pfSearchEl.value : ''].join('|');
  if(pfKey !== PF_PAGE_KEY){ PF_PAGE_KEY = pfKey; PF_PAGE = 1; }
  const pfPages = Math.max(1, Math.ceil(filtered.length / NEWS_PAGE_SIZE));
  if(PF_PAGE > pfPages) PF_PAGE = pfPages;
  const list = filtered.slice((PF_PAGE - 1) * NEWS_PAGE_SIZE, PF_PAGE * NEWS_PAGE_SIZE);
  renderPagination('pf-pagination', PF_PAGE, pfPages, goPfPage);
  pfList.innerHTML = list.map(p=>{
    const ch = chById(p.channel_id) || {};
    const topic = catNameOf(p.channel_id);
    const isRealVideo = p.media_type === 'video' && p.media_path && /\.mp4($|\?)/i.test(p.media_path);
    const hasThumb = !!p.media_path && (p.media_type === 'photo' || (p.media_type === 'video' && !isRealVideo));
    const thumbBadge = p.media_type === 'video' ? `<span class="pt-media-badge">${ICONS.video}</span>` : '';
    const thumbHtml = hasThumb
      ? `<div class="news-thumb" style="position:relative">${thumbBadge}<img src="${escAttr(p.media_path)}" alt="" loading="lazy" data-viewer-kind="image" data-viewer-src="${escAttr(p.media_path)}"${p.media_type==='video' && p.link ? ` data-viewer-link="${escAttr(p.link)}"` : ''} /></div>`
      : '';
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
        ${p.title ? `<h4 class="news-title" dir="auto">${escHtml(p.title)}</h4>` : ''}
        <p class="news-text" id="pf-post-text-${p.id}">${claimsTextDisplay(p.text)}</p>
        <button class="news-more" data-pf-more="${p.id}" id="pf-post-more-${p.id}">
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
  wireMediaViewerClicks(pfList);
  updatePoliticalFigureMoreButtons(list);
  if(document.fonts && document.fonts.status !== 'loaded'){
    document.fonts.ready.then(()=> updatePoliticalFigureMoreButtons(list));
  }
}
export function updatePoliticalFigureMoreButtons(list){
  list.forEach(p=>{
    const textEl = document.getElementById('pf-post-text-'+p.id);
    const moreBtn = document.getElementById('pf-post-more-'+p.id);
    if(!textEl || !moreBtn) return;
    const overflowing = textEl.scrollHeight > textEl.clientHeight + 1;
    moreBtn.style.display = overflowing ? '' : 'none';
  });
}
export function togglePoliticalFigureText(postId){
  const t = document.getElementById('pf-post-text-'+postId);
  const b = document.getElementById('pf-post-more-'+postId);
  if(!t || !b) return;
  const isOpen = t.classList.toggle('expanded');
  b.classList.toggle('open', isOpen);
  b.firstChild.textContent = isOpen ? 'بستن ' : 'نمایش بیشتر ';
}
// ظرف گالری/فید «یادداشت‌ها» (people-tab-figures) بین «یادداشت‌ها» و «مواضع» جابه‌جا می‌شه
// — خودِ عنصر، مثل placeNewsStudyPanel
export var PF_PANEL_HOME = null;
export function placePfPanel(where){
  const panel = document.getElementById('people-tab-figures');
  if(!panel) return;
  if(!PF_PANEL_HOME){
    PF_PANEL_HOME = document.createComment('pf-panel-home');
    panel.parentNode.insertBefore(PF_PANEL_HOME, panel);
  }
  if(where === 'positions'){
    const slot = document.getElementById('positions-pf-slot');
    if(panel.parentNode !== slot) slot.appendChild(panel);
    panel.style.display = '';
  }else if(PF_PANEL_HOME.nextSibling !== panel){
    PF_PANEL_HOME.parentNode.insertBefore(panel, PF_PANEL_HOME.nextSibling);
  }
}
export function setupProfileGallery(){
  if(pfLogoGridEl) pfLogoGridEl.addEventListener('click', e=>{
    const card = e.target.closest('.pf-logo-card'); if(!card) return;
    openPfChannel(Number(card.dataset.ch));
  });
  if(pfBackBtnEl) pfBackBtnEl.addEventListener('click', closePfChannel);
  if(pfGallerySearchEl) pfGallerySearchEl.addEventListener('input', renderPfGallery);
  if(pfGroupRowEl) pfGroupRowEl.addEventListener('click', e=>{
    const chip = e.target.closest('.news-topic-chip'); if(!chip) return;
    pfGroupFilter = chip.dataset.group ? Number(chip.dataset.group) : null;
    renderPfGallery();
  });
  if(pfTimeSegEl) pfTimeSegEl.addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b || !pfTimeSegEl.contains(b)) return;
    pfFilterTimeEl.value = b.dataset.t || '';
    renderPoliticalFigures();
  });
  if(pfSearchEl) pfSearchEl.addEventListener('input', renderPoliticalFigures);
  if(pfList) pfList.addEventListener('click', e=>{
    const b = e.target.closest('button[data-pf-more]'); if(b) togglePoliticalFigureText(b.dataset.pfMore);
  });
}

