// نمای «خواندن» (۵.۴۱.۰، مدل ۴ به انتخاب کاربر): فهرست فشرده‌ی دوخطی (راست) + متن کامل مطلبِ
// انتخاب‌شده (چپ)؛ هر دو ستون هم‌قد صفحه و جدا اسکرول می‌خورند تا با فهرست بلند، ستون خواندن جلوی چشم بماند.
// نوار تعداد/خوانده‌نشده، کلیدهای ↑↓ (و j/k)، کم‌رنگ شدن مطالب خوانده‌شده (localStorage) و «مطالب دیگر همین منبع».
// فقط رایانه ≥۱۱۰۰px؛ پایین‌تر همان کارت‌ها. یک «خواننده» برای هر فید با createReader():
// اخبار (news-feed.js، نما با سه دکمه‌ی خودش)، و پرونده‌ها، «آنچه درباره حوزه گفته می‌شود»، پست‌های کنشگری
// و فید منبع یادداشت‌ها/مواضع (نمای مشترک «خواندن/کارت» با دکمه‌های [data-rv] — feedsReaderOn).
// فهرست و ستون خواندن داخل خودِ ظرف فید ساخته می‌شوند تا دستگیره‌های واگذارشده‌ی آن فید (ترجمه، پنهان‌کردن،
// کلیدواژه…) روی کارتِ ستون خواندن بی‌تغییر کار کنند. این ماژول هیچ feature دیگری را import نمی‌کند
// (کارت، ردیف و صفحه‌بندی پارامترند) — tests/unit/import-cycles.test.js.
import { chById, POSTS_CACHE, HIDDEN_POST_IDS } from '../../data/store.js';
import { toFaDigits, escHtml } from '../../core/text.js';
import { lsGet, lsSet } from '../../core/local-store.js';
import { renderPagination } from '../../ui/pagination.js';
import { NEWS_PLATFORM_LABEL } from '../../ui/platforms.js';
import { wireMediaViewerClicks } from '../../ui/media-viewer.js';

export const READER_PAGE_SIZE = 30;
export const READER_MQ = window.matchMedia('(min-width:1100px)');
const READ_MAX = 3000;
const TZ = { timeZone: 'Asia/Tehran' };

const faNum = (n) => toFaDigits(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));
const postTime = (p) => new Date(p.posted_at || p.scraped_at);
const clock = (d) => new Intl.DateTimeFormat('fa-IR', { ...TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
const dayKey = (d) => new Intl.DateTimeFormat('en-CA', TZ).format(d);
function when(d){
  if(isNaN(d)) return '';
  const k = dayKey(d);
  if(k === dayKey(new Date())) return clock(d);
  if(k === dayKey(new Date(Date.now() - 864e5))) return 'دیروز ' + clock(d);
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { ...TZ, day: 'numeric', month: 'short' }).format(d);
}
export const plainText = (t, n = 260) => String(t || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

// ردیف پیش‌فرض برای پست‌ها (اخبار، پرونده‌ها، کنشگری، یادداشت‌ها)
export function postRow(p){
  const ch = chById(p.channel_id) || {};
  const bale = ch.platform === 'bale';
  return {
    src: bale ? 'ادعا یا شایعه' : (ch.title || ch.username || '؟'),
    plat: ch.platform && !bale ? (NEWS_PLATFORM_LABEL[ch.platform] || ch.platform) : '',
    title: p.title || '', text: p.text || '',
  };
}
// «مطالب دیگر همین منبع» برای پست‌ها: ۴ مطلب آخر همان کانال در کش (بله نه)
export function postRelated(sel){
  const ch = chById(sel.channel_id) || {};
  if(ch.platform === 'bale') return null;
  const items = POSTS_CACHE.filter(p => p.channel_id === sel.channel_id && p.id !== sel.id && !p.hidden_at && !HIDDEN_POST_IDS.has(Number(p.id)))
    .sort((a, b) => postTime(b) - postTime(a)).slice(0, 4);
  return { title: 'مطالب دیگر ' + (ch.title || 'همین منبع'), items };
}

// ---- همه‌ی خواننده‌ها: کلیک و کلیدها با یک دستگیره‌ی سراسری ----
const READERS = new Map();   // ظرف فید → خواننده
let wired = false;
function wireGlobal(){
  if(wired) return; wired = true;
  document.addEventListener('click', e => {
    const host = e.target.closest('.reader-view');
    const r = host && READERS.get(host);
    if(!r) return;
    const row = e.target.closest('[data-nr]');
    if(row && !row.disabled){ r.select(Number(row.dataset.nr)); return; }
    if(e.target.closest('[data-nr-readall]')) r.readAll();
  });
  // ↑↓ (و j/k): مطلب قبلی/بعدی — فقط برای فیدی که دیده می‌شود و وقتی کاربر در کادری تایپ نمی‌کند
  document.addEventListener('keydown', e => {
    if(e.altKey || e.ctrlKey || e.metaKey) return;
    const dir = (e.key === 'ArrowDown' || e.key === 'j') ? 1 : (e.key === 'ArrowUp' || e.key === 'k') ? -1 : 0;
    if(!dir) return;
    if(e.target.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('.modal-overlay.active, #doc-viewer.active')) return;
    for(const [host, r] of READERS){
      if(host.classList.contains('reader-view') && host.offsetParent && r.step(dir)){ e.preventDefault(); return; }
    }
  });
}

/* cfg: { key (پیشوند idها)، readKey (کلید localStorage خوانده‌ها)، row(x) → {src, plat, title, text}،
   time(x) → Date، related(x) → {title, items} | null، cardHtml(x)، afterPane(x)، goPage(p) } */
export function createReader(cfg){
  wireGlobal();
  const row = cfg.row || postRow, timeOf = cfg.time || postTime;
  const READ = new Set(lsGet(cfg.readKey, []));
  let SEL = null, CTX = null;
  const saveRead = () => lsSet(cfg.readKey, [...READ].slice(-READ_MAX));
  const markRead = (id) => { if(!READ.has(id)){ READ.add(id); saveRead(); } };
  const $ = (s) => document.getElementById(cfg.key + '-' + s);

  function rowHtml(x){
    const r = row(x);
    return `<button type="button" class="nr-row${READ.has(x.id) ? ' is-read' : ''}${x.id === SEL ? ' on' : ''}" data-nr="${x.id}" aria-current="${x.id === SEL}">
    <span class="nr-meta">${r.src ? `<b>${escHtml(r.src)}</b>` : ''}${r.plat ? `<i>${escHtml(r.plat)}</i>` : ''}<time>${when(timeOf(x))}</time></span>
    ${r.title ? `<span class="nr-t is-head" dir="auto">${escHtml(plainText(r.title, 200))}</span>${r.text ? `<span class="nr-x" dir="auto">${escHtml(plainText(r.text, 200))}</span>` : ''}`
      : `<span class="nr-t" dir="auto">${escHtml(plainText(r.text) || (x.media_type === 'video' ? 'ویدئو بدون متن' : x.media_path ? 'تصویر بدون متن' : 'بدون متن'))}</span>`}</button>`;
  }
  function barHtml(){
    const unread = CTX.list.filter(x => !READ.has(x.id)).length;
    return `<div class="nr-bar"><b>${faNum(CTX.opts.total)} مطلب</b>${unread ? `<span>${faNum(unread)} خوانده‌نشده</span>` : '<span>همه‌ی این صفحه خوانده شد</span>'}
    ${unread ? '<button type="button" class="nr-readall" data-nr-readall>همه خوانده شد</button>' : ''}</div>`;
  }
  function relatedHtml(sel){
    const rel = cfg.related ? cfg.related(sel) : null;
    if(!rel || !rel.items.length) return '';
    const inList = new Set(CTX.list.map(x => x.id));
    return `<section class="nr-rel"><h4>${escHtml(rel.title)}</h4>${rel.items.map(x => { const r = row(x);
      return `<button type="button" class="nr-rel-it"${inList.has(x.id) ? ` data-nr="${x.id}"` : ' disabled'}><span dir="auto">${escHtml(plainText(r.title || r.text) || (x.media_type === 'video' ? 'ویدئو بدون متن' : x.media_path ? 'تصویر بدون متن' : 'بدون متن'))}</span><time>${when(timeOf(x))}</time></button>`; }).join('')}</section>`;
  }
  function paintPane(){
    const pane = $('pane');
    if(!pane) return;
    const sel = CTX.list.find(x => x.id === SEL);
    pane.innerHTML = sel ? cfg.cardHtml(sel) + relatedHtml(sel) : '';
    pane.scrollTop = 0;
    wireMediaViewerClicks(pane);
    if(sel && cfg.afterPane) cfg.afterPane(sel);
  }
  function select(id, scroll){
    if(!CTX || id === SEL) return;
    SEL = id;
    markRead(id);
    const list = $('list');
    list?.querySelectorAll('.nr-row').forEach(r => { const on = Number(r.dataset.nr) === id; r.classList.toggle('on', on); r.setAttribute('aria-current', on); if(on) r.classList.add('is-read'); });
    const bar = list?.querySelector('.nr-bar');
    if(bar) bar.outerHTML = barHtml();
    if(scroll) list?.querySelector(`.nr-row[data-nr="${id}"]`)?.scrollIntoView({ block: 'nearest' });
    paintPane();
  }
  const api = {
    // ظرف فید: کلاس reader-view می‌گیرد؛ پاک کردن کلاس و بازسازی کارت‌ها با خودِ فید است
    render(feed, list, opts){
      READERS.set(feed, api);
      // فهرست خالی: کادر خالی نما نه — پیام «پیدا نشد» خودِ فید دیده شود
      if(!list.length){ CTX = null; feed.classList.remove('reader-view'); feed.innerHTML = ''; return; }
      CTX = { feed, list, opts };
      feed.classList.add('reader-view');
      if(!list.some(x => x.id === SEL)) SEL = list[0] ? list[0].id : null;
      if(SEL != null) markRead(SEL);
      feed.innerHTML = `<div class="nr-list" id="${cfg.key}-list">${barHtml()}<div class="nr-rows">${list.map(rowHtml).join('')}</div><div class="news-pagination nr-pag" id="${cfg.key}-pag"></div></div>
      <div class="nr-pane" id="${cfg.key}-pane"></div>`;
      renderPagination(cfg.key + '-pag', opts.page || 1, opts.totalPages || 1, (p) => cfg.goPage(p));
      paintPane();
    },
    select,
    readAll(){
      if(!CTX) return;
      CTX.list.forEach(x => READ.add(x.id)); saveRead();
      $('list')?.querySelectorAll('.nr-row').forEach(r => r.classList.add('is-read'));
      const bar = $('list')?.querySelector('.nr-bar'); if(bar) bar.outerHTML = barHtml();
    },
    step(dir){
      if(!CTX) return false;
      const i = CTX.list.findIndex(x => x.id === SEL);
      const next = CTX.list[i + dir];
      if(!next) return false;
      select(next.id, true);
      return true;
    },
    selected: () => SEL,
  };
  return api;
}

// ---- اخبار و رویدادها ----
let NEWS_READER = null, NEWS_OPTS = null;
export function renderNewsReader(feed, list, opts){
  NEWS_OPTS = opts;
  if(!NEWS_READER) NEWS_READER = createReader({ key: 'nr', readKey: 'jarian_news_read', related: postRelated,
    cardHtml: (p) => NEWS_OPTS.cardHtml(p), afterPane: (p) => NEWS_OPTS.afterPane(p), goPage: (p) => NEWS_OPTS.goPage(p) });
  NEWS_READER.render(feed, list, opts);
}
export function setupNewsReader(){ wireGlobal(); setupFeedsView(); }
export const readerSelected = () => NEWS_READER?.selected() ?? null;

// ---- نمای مشترک چهار فید دیگر: «خواندن» یا «کارت» (دکمه‌های [data-rv]) ----
let FEEDS_VIEW = lsGet('jarian_feeds_view', 'reader');
const FEEDS_LISTENERS = [];
export const feedsReaderOn = () => FEEDS_VIEW === 'reader' && READER_MQ.matches;
export function onFeedsView(fn){ FEEDS_LISTENERS.push(fn); }
function syncFeedsToggles(){ document.querySelectorAll('[data-rv]').forEach(b => b.classList.toggle('active', b.dataset.rv === FEEDS_VIEW)); }
export function setupFeedsView(){
  syncFeedsToggles();
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-rv]');
    if(!b || b.dataset.rv === FEEDS_VIEW) return;
    FEEDS_VIEW = b.dataset.rv; lsSet('jarian_feeds_view', FEEDS_VIEW);
    syncFeedsToggles();
    FEEDS_LISTENERS.forEach(fn => fn());
  });
  READER_MQ.addEventListener('change', () => FEEDS_LISTENERS.forEach(fn => fn()));
}
