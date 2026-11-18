// ستون «امروز در جریان» کنار کاشی‌های عرصه‌ها (۵.۳۶.۰، انتخاب کاربر بعد از چند دور ماکت):
// پنج زبانه‌ی اخبار / شایعه / موضع / درباره حوزه / یادداشت؛ بالای هر زبانه یک مطلب برجسته و زیرش سه مطلب.
// زبانه‌ها خودکار می‌چرخند (هر ۱۰ ثانیه) — با رفتن ماوس/فوکوس/لمس مکث، با کلیک کاربر متوقف،
// و با prefers-reduced-motion اصلاً نمی‌چرخند. داده فقط از آنچه loadAll آورده (بدون درخواست اضافه).
import { CHANNELS, POSTS_CACHE, HIDDEN_POST_IDS, chName } from '../../data/store.js';
import { escAttr, escHtml, safeUrl, toFaDigits } from '../../core/text.js';
import { iranTodayStartMs, newsRelTime } from '../../core/date.js';
import { newsPickItems } from '../news/picks.js';
import { POS_TAB_LABEL } from '../positions/positions.js';

const ROTATE_MS = 15000; // آرام‌تر از کاشی‌های عرصه‌ها، تا با آن‌ها رقابت نکند
const PER_TAB = 4; // ۱ برجسته + ۳ فهرستی
const IC = {
  news: '<path d="M4 4h12v16H6a2 2 0 01-2-2V4zM16 8h4v10a2 2 0 01-2 2M8 8h4M8 12h4M8 16h3"/>',
  claim: '<path d="M12 3l9 16H3L12 3zM12 10v4M12 17h.01"/>',
  pos: '<path d="M7 7h4v4H7zM13 7h4v4h-4zM7 11c0 3-1 4-3 5M13 11c0 3-1 4-3 5"/>',
  hawza: '<path d="M4 21h16M6 21V10l6-5 6 5v11M10 21v-6h4v6"/>',
  note: '<path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8l-5-5zM14 3v5h5M9 13h6M9 17h4"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;
const tOf = (p) => new Date(p.posted_at || p.scraped_at).getTime();
const byNew = (a, b) => tOf(b) - tOf(a);
const visible = (p) => !p.hidden_at && !HIDDEN_POST_IDS.has(Number(p.id));
const headline = (p) => (p.title || String(p.text || '').replace(/\s+/g, ' ')).trim().slice(0, 170);
const thumbOf = (p) => {
  if(!p || !p.media_path) return '';
  const realVideo = p.media_type === 'video' && /\.mp4($|\?)/i.test(p.media_path);
  return p.media_type === 'photo' || (p.media_type === 'video' && !realVideo) ? p.media_path : '';
};
// نتیجه‌ی راستی‌آزمایی از متن پست «رصد شایعات» (همان‌جا با این واژه‌ها نوشته می‌شود)
function claimVerdict(p){
  const s = (p.title || '') + ' ' + (p.text || '');
  if(/گمراه[‌\s]?کننده/.test(s)) return 'گمراه‌کننده';
  if(/نادرست|کذب|صحت ندارد|تکذیب|جعلی/.test(s)) return 'نادرست';
  return '';
}

function channelsWhere(fn){ return new Set(CHANNELS.filter(fn).map(c => c.id)); }
function postsOf(ids, extra = () => true){ return POSTS_CACHE.filter(p => ids.has(p.channel_id) && visible(p) && extra(p)).sort(byNew); }

// هر زبانه: { key, label, count (امروز), items:[{text, meta, badges:[[cls,txt]], thumb, link}], more:{label, go|newsGo}, featLabel }
function buildTabs(){
  const today = iranTodayStartMs();
  const tabs = [];
  // اخبار: «اخبار منتخب» (سنجاق مدیر + هوش مصنوعی)؛ تا هوش مصنوعی برنگشته، تازه‌ترین خبرها
  const newsIds = channelsWhere(c => c.show_in_news && c.platform !== 'bale' && !c.show_in_hawza);
  const newsAll = postsOf(newsIds);
  const picks = newsPickItems();
  const newsItems = picks.length
    ? picks.map(({ sp, post }) => ({
        text: sp.headline || (post && headline(post)) || '',
        meta: chName(post ? post.channel_id : sp.channel_id) + (sp.sources > 1 ? ' و ' + toFaDigits(sp.sources - 1) + ' منبع دیگر' : '') + (sp.time ? '، ' + newsRelTime(sp.time) : ''),
        badges: [...(sp.sources >= 5 ? [['w', 'پرتکرار']] : []), ...((Array.isArray(sp.tags) ? sp.tags : []).slice(0, 1).map(t => ['', t]))],
        thumb: thumbOf(post), link: (post && post.link) || sp.link || '',
      }))
    : newsAll.map(p => ({ text: headline(p), meta: chName(p.channel_id) + '، ' + newsRelTime(p.posted_at || p.scraped_at), badges: [], thumb: thumbOf(p), link: p.link }));
  tabs.push({ key: 'news', label: 'اخبار', count: newsAll.filter(p => tOf(p) >= today).length, items: newsItems,
    featLabel: picks.length ? 'مهم‌ترین امروز' : 'تازه‌ترین خبر', more: { label: 'همه‌ی اخبار', newsGo: picks.length ? 'analytics' : 'study' } });
  // شایعه: کانال «رصد شایعات» (بله)
  const claims = POSTS_CACHE.filter(p => p.platform === 'bale' && visible(p)).sort(byNew);
  tabs.push({ key: 'claim', label: 'شایعه', count: claims.filter(p => tOf(p) >= today).length,
    items: claims.map(p => { const v = claimVerdict(p); return { text: headline(p), meta: chName(p.channel_id) + '، ' + newsRelTime(p.posted_at || p.scraped_at), badges: v ? [['f', v]] : [], thumb: '', link: p.link }; }),
    featLabel: 'تازه‌ترین شایعه', more: { label: 'همه‌ی ادعاها و شایعه‌ها', newsGo: 'claims' } });
  // موضع: فقط آنچه در خود بخش هم دیده می‌شود (تأیید هوش مصنوعی، section_relevant)
  const posCh = new Map(CHANNELS.filter(c => c.show_in_positions).map(c => [c.id, c]));
  const positions = postsOf(new Set(posCh.keys()), p => p.section_relevant === true);
  tabs.push({ key: 'pos', label: 'موضع', count: positions.filter(p => tOf(p) >= today).length,
    items: positions.map(p => { const g = POS_TAB_LABEL[posCh.get(p.channel_id)?.positions_tab]; return { text: headline(p), meta: chName(p.channel_id) + '، ' + newsRelTime(p.posted_at || p.scraped_at), badges: g ? [['g', g]] : [], thumb: '', link: p.link }; }),
    featLabel: 'تازه‌ترین موضع', more: { label: 'همه‌ی مواضع', go: 'positions' } });
  // درباره حوزه: اخبار حوزه (سیاسی‌اجتماعی به تشخیص هوش مصنوعی، hawza_relevant)
  const hawza = postsOf(channelsWhere(c => c.show_in_hawza), p => p.hawza_relevant === true);
  tabs.push({ key: 'hawza', label: 'درباره حوزه', count: hawza.filter(p => tOf(p) >= today).length,
    items: hawza.map(p => ({ text: headline(p), meta: chName(p.channel_id) + '، ' + newsRelTime(p.posted_at || p.scraped_at), badges: [], thumb: thumbOf(p), link: p.link })),
    featLabel: 'تازه‌ترین خبر حوزه', more: { label: 'همه‌ی مطالب درباره حوزه', go: 'hawza' } });
  // یادداشت: چهره‌ها، سازمان‌ها و اندیشکده‌ها
  const notes = postsOf(channelsWhere(c => c.show_in_people || c.show_in_orgs || c.show_in_thinktanks));
  tabs.push({ key: 'note', label: 'یادداشت', count: notes.filter(p => tOf(p) >= today).length,
    items: notes.map(p => ({ text: headline(p), meta: chName(p.channel_id) + '، ' + newsRelTime(p.posted_at || p.scraped_at), badges: [], thumb: '', link: p.link })),
    featLabel: 'تازه‌ترین یادداشت', more: { label: 'همه‌ی یادداشت‌ها', go: 'people' } });
  // زبانه‌ی بی‌مطلب نشان داده نمی‌شود
  return tabs.map(t => ({ ...t, items: t.items.filter(i => i.text).slice(0, PER_TAB) })).filter(t => t.items.length);
}

const badgesHtml = (b) => b.length ? `<div class="tc-bd">${b.map(([c, t]) => `<span class="${c}">${escHtml(t)}</span>`).join('')}</div>` : '';
// عنوان هر مطلب: پیوند به منبع اصلی (زبانه‌ی تازه)، اگر نشانی معتبر داشته باشد
const titleHtml = (i, tag) => {
  const u = i.link ? safeUrl(i.link) : '#';
  return u !== '#' ? `<${tag}><a href="${u}" target="_blank" rel="noopener">${escHtml(i.text)}</a></${tag}>` : `<${tag}>${escHtml(i.text)}</${tag}>`;
};
function bodyHtml(t){
  const [f, ...rest] = t.items;
  const feat = `<div class="tc-feat t-${t.key}${f.thumb ? '' : ' no-img'}">
      ${f.thumb ? `<div class="tc-feat-img"><img src="${escAttr(f.thumb)}" alt="" loading="lazy" data-no-menu /></div>` : `<span class="tc-feat-ic">${icon(t.key)}</span>`}
      <span class="tc-feat-lbl">${escHtml(t.featLabel)}</span>
      <div class="tc-feat-tx">${badgesHtml(f.badges)}${titleHtml(f, 'p')}<small>${escHtml(f.meta)}</small></div></div>`;
  const list = rest.map(i => `<div class="tc-it t-${t.key}">${i.thumb ? `<span class="tc-th"><img src="${escAttr(i.thumb)}" alt="" loading="lazy" data-no-menu /></span>` : `<span class="tc-tic">${icon(t.key)}</span>`}
      <div>${badgesHtml(i.badges)}${titleHtml(i, 'p')}<small>${escHtml(i.meta)}</small></div></div>`).join('');
  const more = t.more.newsGo ? `data-news-go="${t.more.newsGo}"` : `data-go="${t.more.go}"`;
  return `${feat}${list}<button type="button" class="tc-more" ${more}>${escHtml(t.more.label)} ←</button>`;
}

let TABS = [], current = 0, timer = null, stopped = false, paused = false;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function show(i, fromUser){
  const col = document.getElementById('today-col');
  if(!col || !TABS.length) return;
  current = (i + TABS.length) % TABS.length;
  col.querySelectorAll('.tc-tab').forEach((b, j) => { b.classList.toggle('on', j === current); b.setAttribute('aria-selected', j === current ? 'true' : 'false'); });
  const body = col.querySelector('.tc-body');
  body.innerHTML = bodyHtml(TABS[current]);
  body.setAttribute('aria-labelledby', 'tc-tab-' + TABS[current].key);
  fitTodayCol();
  if(fromUser){ stopped = true; col.classList.remove('is-rotating'); }
  restartProgress(col);
}
// ستون هم‌قد کاشی‌هاست (CSS)؛ مطالب فهرستی که جا نشوند از ته کنار گذاشته می‌شوند تا هیچ مطلبی نصفه بریده نشود
// و پایین ستون با پایین کاشی‌ها هم‌تراز بماند. روی گوشی (ستون زیر کاشی‌ها) لازم نیست.
function fitTodayCol(){
  const body = document.querySelector('#today-col .tc-body');
  if(!body || !body.clientHeight) return;
  body.querySelectorAll('.tc-it[hidden]').forEach(el => { el.hidden = false; });
  const items = [...body.querySelectorAll('.tc-it')];
  while(body.scrollHeight > body.clientHeight + 1 && items.length){ items.pop().hidden = true; }
}
function restartProgress(col){
  clearTimeout(timer);
  if(stopped || reduced() || TABS.length < 2) return;
  // نوار پیشرفت زیر زبانه‌ی فعال با انیمیشن CSS هم‌زمان با زمان‌سنج
  col.classList.remove('is-rotating'); void col.offsetWidth; col.classList.add('is-rotating');
  col.style.setProperty('--tc-rotate', ROTATE_MS + 'ms');
  timer = setTimeout(() => { if(!paused && !stopped) show(current + 1); else restartProgress(col); }, ROTATE_MS);
}

export function renderTodayCol(){
  const col = document.getElementById('today-col');
  if(!col) return;
  TABS = buildTabs();
  col.hidden = !TABS.length;
  document.querySelector('.home-split')?.classList.toggle('no-col', !TABS.length);
  if(!TABS.length) return;
  col.querySelector('.tc-tabs').innerHTML = TABS.map((t, j) =>
    `<button type="button" role="tab" class="tc-tab" id="tc-tab-${t.key}" data-tc="${j}" aria-selected="false">${icon(t.key)}${escHtml(t.label)}${t.count ? `<em>${toFaDigits(t.count)}</em>` : ''}</button>`).join('');
  show(Math.min(current, TABS.length - 1));
}

export function setupTodayCol(){
  const col = document.getElementById('today-col');
  if(!col) return;
  col.querySelector('.tc-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tc]'); if(b) show(Number(b.dataset.tc), true); });
  // مکث چرخش وقتی کاربر روی ستون است
  const pause = () => { paused = true; col.classList.add('is-paused'); };
  const resume = () => { paused = false; col.classList.remove('is-paused'); };
  col.addEventListener('mouseenter', pause); col.addEventListener('mouseleave', resume);
  col.addEventListener('focusin', pause); col.addEventListener('focusout', resume);
  col.addEventListener('touchstart', () => { stopped = true; col.classList.remove('is-rotating'); clearTimeout(timer); }, { passive: true });
  // تغییر اندازه‌ی پنجره یا کاشی‌ها (مثلاً رسیدن عددهای زنده) → جا دادن دوباره
  if(typeof ResizeObserver !== 'undefined'){
    let lastH = 0;
    new ResizeObserver(() => { const h = col.clientHeight; if(h !== lastH){ lastH = h; fitTodayCol(); } }).observe(col);
  }
  // زبانه‌ی پنهان مرورگر: زمان‌سنج‌ها بی‌فایده‌اند
  document.addEventListener('visibilitychange', () => { if(document.hidden) clearTimeout(timer); else restartProgress(col); });
}
