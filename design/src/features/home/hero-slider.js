// هرو سه‌اسلایدی صفحه‌ی نخست (۵.۳۷.۰، انتخاب کاربر بعد از چند دور ماکت):
//   ۱) «امروز در حوزه و مواضع» روی دیوار متحرک صفحه‌ی اول روزنامه‌های امروز:
//      یک مطلب «درباره حوزه» (یافته‌ی خزنده؛ نبود → اخبار حوزه) + تازه‌ترین مواضع مراجع و علماء
//   ۲) «عرصه‌های رصد و پایش»: شش عرصه با عدد زنده
//   ۳) «بسته تحلیلی جریان»: جلد شماره‌ی تازه
// نوار زبانه‌ی پایین هرو: زبانه‌ی فعال «پیوسته» (هم‌رنگ اسلاید و بالا آمده، انتخاب کاربر)، بدون فلش قبلی/بعدی.
// چرخش خودکار (اسلاید ۱ دوازده ثانیه، بقیه هفت)؛ مکث با ماوس/فوکوس، توقف با کلیک/لمس/کشیدن،
// و بدون چرخش با prefers-reduced-motion یا زبانه‌ی پنهان مرورگر.
import { api } from '../../core/api.js';
import { CHANNELS, POSTS_CACHE, HIDDEN_POST_IDS, chName, chInitials } from '../../data/store.js';
import { escAttr, escHtml, faTitle, safeUrl, toFaDigits } from '../../core/text.js';
import { newsRelTime } from '../../core/date.js';
import { NEWSPAPERS } from '../news/newspapers.js';
import { MAGAZINES, openMagazineViewer } from '../reports/magazines.js';
import { POS_TAB_LABEL } from '../positions/positions.js';
import { habHighlight } from '../hawza/hawza-about.js';
import { domainLiveCounts, domainLiveText } from './domain-live.js';

const DURATIONS = [12000, 7000, 7000];
const POS_MAX = 4;
const TABS = [
  { label: 'امروز در حوزه و مواضع', icon: '<img src="images/domain-icon-hawza.webp" alt="" />' },
  { label: 'عرصه‌های رصد و پایش', icon: '<img src="images/domain-icon-news.webp" alt="" />' },
  { label: 'بسته تحلیلی جریان', icon: '<span class="hs-mcv" aria-hidden="true">جریان</span>' },
];
const DOMAINS = [
  ['overview', 'news', 'اخبار و رویدادها'], ['people', 'people', 'یادداشت‌ها'], ['hawza', 'hawza', 'درباره حوزه'],
  ['posts', 'cyberspace', 'کنشگری مجازی'], ['schools', 'schools', 'برنامه مدارس'], ['positions', 'positions', 'مواضع مراجع و علماء'],
];

const tOf = (p) => new Date(p.posted_at || p.scraped_at).getTime();
const visible = (p) => !p.hidden_at && !HIDDEN_POST_IDS.has(Number(p.id));
const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const linkTitle = (text, url, tag) => {
  const u = url ? safeUrl(url) : '#';
  return u !== '#' ? `<${tag}><a href="${u}" target="_blank" rel="noopener">${escHtml(text)}</a></${tag}>` : `<${tag}>${escHtml(text)}</${tag}>`;
};

// ---- داده ----
// یافته‌های خزنده‌ی «آنچه درباره حوزه گفته می‌شود» فقط با باز شدن همان تب بار می‌شوند؛ اینجا فقط ۳۰ ردیف آخر، یک‌بار در هر بارگذاری
let MENTIONS = null, MENTIONS_LOADING = null;
function loadMentions(){
  if(MENTIONS || MENTIONS_LOADING) return MENTIONS_LOADING;
  MENTIONS_LOADING = api('/hawza_mentions?select=id,url,site,site_name,title,excerpt,kind,in_title,published_at,scraped_at,hidden_at&order=scraped_at.desc&limit=30')
    .then(r => r.ok ? r.json() : []).then(rows => { MENTIONS = rows.filter(x => !x.hidden_at && x.title); })
    .catch(() => { MENTIONS = []; }).finally(() => { MENTIONS_LOADING = null; });
  return MENTIONS_LOADING;
}
function hawzaFeature(){
  const DAY2 = Date.now() - 48 * 3600e3;
  const t = (x) => new Date(x.published_at || x.scraped_at).getTime();
  if(MENTIONS && MENTIONS.length){
    const fresh = MENTIONS.filter(x => t(x) >= DAY2);
    const m = fresh.find(x => x.in_title) || fresh[0] || MENTIONS[0];
    const src = m.kind === 'social' ? (m.site_name || m.site) : (m.site_name || m.site);
    return { title: oneLine(m.title), excerpt: oneLine(m.excerpt).slice(0, 220), url: m.url,
      meta: [src, m.kind === 'social' ? 'شبکه‌ی اجتماعی' : 'سایت خبری', newsRelTime(m.published_at || m.scraped_at)].filter(Boolean).join('، '), postId: null };
  }
  // نبود جدول/یافته → تازه‌ترین «اخبار حوزه» (سیاسی‌اجتماعی به تشخیص هوش مصنوعی)
  const ids = new Set(CHANNELS.filter(c => c.show_in_hawza).map(c => c.id));
  const p = POSTS_CACHE.filter(x => ids.has(x.channel_id) && visible(x) && x.hawza_relevant === true).sort((a, b) => tOf(b) - tOf(a))[0];
  if(!p) return null;
  const text = oneLine(p.title || p.text);
  return { title: text.slice(0, 140), excerpt: p.title ? oneLine(p.text).slice(0, 220) : '', url: p.link,
    meta: chName(p.channel_id) + '، ' + newsRelTime(p.posted_at || p.scraped_at), postId: p.id };
}
function positionItems(){
  const chs = new Map(CHANNELS.filter(c => c.show_in_positions).map(c => [c.id, c]));
  // فقط مواضعی که در خود بخش هم دیده می‌شوند (تأیید هوش مصنوعی، section_relevant)
  return POSTS_CACHE.filter(p => chs.has(p.channel_id) && visible(p) && p.section_relevant === true)
    .sort((a, b) => tOf(b) - tOf(a)).slice(0, POS_MAX).map(p => ({ p, ch: chs.get(p.channel_id) }));
}
// شناسه‌ی پست‌هایی که الان در هرو دیده می‌شوند — ستون «امروز در جریان» تکرارشان نمی‌کند
let SHOWN = new Set();
export const heroShownPostIds = () => SHOWN;

// ---- رسم ----
function wallHtml(){
  const withImg = NEWSPAPERS.filter(n => n.image_url);
  if(!withImg.length) return '';
  const latest = withImg[0].edition_date;
  let covers = withImg.filter(n => n.edition_date === latest);
  if(covers.length < 8) covers = withImg;
  covers = covers.slice(0, 12);
  const row = (off) => { const list = covers.map((_, k) => covers[(k + off) % covers.length]);
    const items = list.map(n => `<img src="${escAttr(n.image_url)}" alt="" loading="lazy" decoding="async" draggable="false" />`).join('');
    return `<div class="hs-row">${items}${items}</div>`; };
  return `<div class="hs-wall" aria-hidden="true"><div class="hs-tilt">${row(0)}${row(4)}${row(8)}</div></div>`;
}
function slide1(){
  const h = hawzaFeature();
  const pos = positionItems();
  SHOWN = new Set([...(h && h.postId ? [h.postId] : []), ...pos.map(x => x.p.id)]);
  const hz = h ? `<div class="hs-k"><img src="images/domain-icon-hawza.webp" alt="" />درباره حوزه<small>آنچه امروز درباره‌ی حوزه گفته شد</small></div>
      ${linkTitle(h.title, h.url, 'h3')}${h.excerpt ? `<p>${habHighlight(h.excerpt)}</p>` : ''}<span class="hs-meta">${escHtml(h.meta)}</span>`
    // هنوز مطلبی درباره‌ی حوزه نیست → شعار سامانه تیتر اصلی اسلاید
    : `<h3 class="hs-motto">نبض <span>فضای سیاسی اجتماعی</span><small>به روایت حوزه علمیه خراسان</small></h3>`;
  const posHtml = pos.length ? pos.map(({ p, ch }) => {
    const g = POS_TAB_LABEL[ch.positions_tab];
    const av = ch.avatar_url ? `<img src="${escAttr(ch.avatar_url)}" alt="" loading="lazy" />` : escHtml(chInitials(ch.id));
    return `<div class="hs-pi"><span class="hs-av">${av}</span><div><div class="hs-who">${escHtml(chName(ch.id))}${g ? `<em>${escHtml(g)}</em>` : ''}</div>
      ${linkTitle(oneLine(p.title || p.text).slice(0, 120), p.link, 'p')}<small>${escHtml(newsRelTime(p.posted_at || p.scraped_at))}</small></div></div>`;
  }).join('') : '<p class="hs-empty">مواضع تازه پس از بررسی در اینجا نمایش داده می‌شود.</p>';
  return `<div class="hs-slide s1" data-i="0">${wallHtml()}<div class="hs-in">
      <div class="hs-tx">${h ? '<h2 class="hs-brand">نبض <span>فضای سیاسی اجتماعی</span> · به روایت حوزه علمیه خراسان</h2>' : ''}${hz}
        <div><button type="button" class="hs-link" data-go="hawza">همه‌ی مطالب درباره حوزه ←</button></div></div>
      <div class="hs-pos"><div class="hs-pos-h"><img src="images/domain-icon-positions.webp" alt="" /><b>مواضع مراجع و علماء</b><small>تازه‌ترین‌ها</small></div>
        ${posHtml}<button type="button" class="hs-pos-more" data-go="positions">همه‌ی مواضع ←</button></div></div></div>`;
}
function slide2(){
  const counts = domainLiveCounts();
  return `<div class="hs-slide s2" data-i="1"><div class="hs-in">
      <div class="hs-tx"><span class="hs-tag">شش عرصه‌ی رصد</span><h2 class="hs-big">عرصه‌های رصد و پایش</h2>
        <p>از خبرگزاری‌ها و شبکه‌های اجتماعی تا مواضع مراجع، کنشگری مجازی و برنامه‌ی مدارس — هر عرصه با منابع و روش پایش خودش، هر روز به‌روز.</p>
        <button type="button" class="hs-cta" data-home-scroll="domains">ورود به عرصه‌ها ↓</button></div>
      <div class="hs-dg">${DOMAINS.map(([go, ic, name], i) => { const n = domainLiveText(counts[go]);
        return `<button type="button" class="hs-dc" data-go="${go}" style="--i:${i}"><img src="images/domain-icon-${ic}.webp" alt="" /><b>${name}</b>${n ? `<small>${escHtml(n)}</small>` : ''}</button>`; }).join('')}</div>
    </div></div>`;
}
const issueLabel = (m) => m.issue_no ? 'شماره‌ی ' + toFaDigits(String(m.issue_no)) : faTitle(m.title || '');
function slide3(){
  const m = MAGAZINES[0];
  if(!m) return '';
  const cover = (x, cls) => `<span class="hs-cv ${cls}">${x && x.cover_url ? `<img src="${escAttr(x.cover_url)}" alt="" loading="lazy" draggable="false" />` : '<b>جریان</b>'}</span>`;
  const sub = m.title && !/بسته\s*(ی\s*)?تحلیلی\s*جریان/.test(m.title) ? faTitle(m.title) : '';
  const date = m.publish_date ? new Date(m.publish_date).toLocaleDateString('fa-IR', { month: 'long', year: 'numeric' }) : '';
  const files = Array.isArray(m.files) ? m.files : [];
  return `<div class="hs-slide s3" data-i="2"><div class="hs-in">
      <div class="hs-tx"><span class="hs-tag"><em>تازه</em>${escHtml([issueLabel(m), date].filter(Boolean).join('، '))}</span>
        <h2 class="hs-big">بسته تحلیلی جریان</h2>${sub ? `<h3>${escHtml(sub)}</h3>` : ''}
        <p>تحلیل رصد فضای سیاسی‌اجتماعی در یک بسته‌ی منظم — از موج‌های خبری و مواضع مراجع تا شایعه‌ها و کنشگری مجازی.</p>
        <div class="hs-btns"><button type="button" class="hs-cta hs-read"${files.length ? '' : ' disabled'}>مطالعه‌ی این شماره</button>
          <button type="button" class="hs-cta2" data-home-scroll="package">شماره‌های قبلی ↓</button></div></div>
      <div class="hs-art">${cover(MAGAZINES[2], 'b2')}${cover(MAGAZINES[1], 'b1')}<button type="button" class="hs-cv f hs-read" aria-label="مطالعه‌ی ${escAttr(issueLabel(m))}">${m.cover_url ? `<img src="${escAttr(m.cover_url)}" alt="" draggable="false" />` : '<b>جریان</b>'}</button></div>
    </div></div>`;
}

let cur = 0, timer = null, stopped = false, paused = false, count = 0;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function show(i, fromUser){
  const hs = document.getElementById('hero-slider');
  if(!hs || !count) return;
  cur = (i + count) % count;
  hs.querySelectorAll('.hs-slide').forEach((s, k) => { s.classList.toggle('on', k === cur); s.setAttribute('aria-hidden', k === cur ? 'false' : 'true'); s.inert = k !== cur; });
  hs.querySelectorAll('.hs-tab').forEach((b, k) => { b.classList.toggle('on', k === cur); b.setAttribute('aria-selected', k === cur ? 'true' : 'false'); });
  const here = hs.querySelector('.hs-here');
  if(here) here.innerHTML = `<span><b>${toFaDigits(cur + 1)}</b>${escHtml(TABS[cur].label)}<small>(${toFaDigits(cur + 1)} از ${toFaDigits(count)})</small></span>`;
  if(fromUser) stop();
  schedule();
}
function stop(){ stopped = true; clearTimeout(timer); document.getElementById('hero-slider')?.classList.remove('is-rotating'); }
function schedule(){
  const hs = document.getElementById('hero-slider');
  clearTimeout(timer);
  if(!hs || stopped || reduced() || count < 2 || document.hidden) return;
  hs.style.setProperty('--hs-dur', DURATIONS[cur] + 'ms');
  hs.classList.remove('is-rotating'); void hs.offsetWidth; hs.classList.add('is-rotating');
  timer = setTimeout(() => { if(paused) schedule(); else show(cur + 1); }, DURATIONS[cur]);
}

export function renderHeroSlider(){
  const hs = document.getElementById('hero-slider');
  if(!hs) return;
  const slides = [slide1(), slide2(), slide3()].filter(Boolean);
  count = slides.length;
  hs.querySelector('.hs-slides').innerHTML = slides.join('');
  const news = domainLiveCounts().overview;
  const subs = ['درباره حوزه، مواضع مراجع و علماء', '۶ عرصه' + (news && news[0] ? '، ' + toFaDigits(news[0]) + ' مطلب امروز' : ''),
    MAGAZINES[0] ? issueLabel(MAGAZINES[0]) + '، تازه منتشر شد' : ''];
  hs.querySelector('.hs-tabs').innerHTML = TABS.slice(0, count).map((t, k) =>
    `<button type="button" role="tab" class="hs-tab" data-hs="${k}" aria-selected="false" aria-controls="hero-slider">${t.icon}<span><b><em>${toFaDigits(k + 1)}</em>${escHtml(t.label)}</b>${subs[k] ? `<small>${escHtml(subs[k])}</small>` : ''}</span><i aria-hidden="true"></i></button>`).join('');
  hs.querySelectorAll('.hs-read').forEach(b => b.addEventListener('click', () => { const m = MAGAZINES[0]; if(m && Array.isArray(m.files) && m.files.length) openMagazineViewer(m); }));
  show(Math.min(cur, count - 1));
  // یافته‌های خزنده بعداً می‌رسند → فقط اسلاید ۱ دوباره ساخته می‌شود
  if(!MENTIONS) loadMentions()?.then(() => {
    const old = hs.querySelector('.hs-slide.s1');
    if(!old || !MENTIONS || !MENTIONS.length) return;
    const tmp = document.createElement('div'); tmp.innerHTML = slide1();
    const fresh = tmp.firstElementChild;
    fresh.classList.toggle('on', old.classList.contains('on')); fresh.inert = old.inert; fresh.setAttribute('aria-hidden', old.getAttribute('aria-hidden'));
    old.replaceWith(fresh);
  });
}

export function setupHeroSlider(){
  const hs = document.getElementById('hero-slider');
  if(!hs) return;
  hs.querySelector('.hs-tabs').addEventListener('click', e => { const b = e.target.closest('[data-hs]'); if(b) show(Number(b.dataset.hs), true); });
  hs.addEventListener('mouseenter', () => { paused = true; }); hs.addEventListener('mouseleave', () => { paused = false; });
  hs.addEventListener('focusin', () => { paused = true; }); hs.addEventListener('focusout', () => { paused = false; });
  // کشیدن انگشت روی گوشی: چپ = بعدی، راست = قبلی (راست‌چین)
  let x0 = null;
  hs.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; stop(); }, { passive: true });
  hs.addEventListener('touchend', e => {
    if(x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if(Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1), true);
  }, { passive: true });
  document.addEventListener('visibilitychange', () => { if(document.hidden) clearTimeout(timer); else schedule(); });
}
