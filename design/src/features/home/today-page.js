// صفحه‌ی «منتخب مطالب امروز جریان» (۵.۴۰.۰، خواست کاربر: «یک صفحه به عنوان منتخب مطالب امروز؛ از ستون
// «امروز در جریان» به آن ارجاع داده شود»). بخش #today — فقط از داده‌ای که loadAll آورده، بدون درخواست اضافه.
//   سربرگ سرمه‌ای: تاریخ، شمار مطالب و منابع امروز، نمودار ریز ساعت‌به‌ساعت و پرش به هر قسمت
//   اخبار منتخب (کارت اول بزرگ با عکس) | ادعاها و شایعه‌ها + مواضع
//   درباره حوزه | یادداشت‌ها — و ردیف جلد روزنامه‌های امروز
import { escAttr, escHtml, safeUrl, toFaDigits } from '../../core/text.js';
import { iranTodayStartMs } from '../../core/date.js';
import { CHANNELS, POSTS_CACHE, HIDDEN_POST_IDS, chName, chInitials } from '../../data/store.js';
import { NEWSPAPERS } from '../news/newspapers.js';
import { todayTabs, todayIcon } from './today-col.js';

const TZ = { timeZone: 'Asia/Tehran' };
const ms = (iso) => (iso ? new Date(iso).getTime() : 0);
const faNum = (n) => toFaDigits(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));
const tehranHour = (t) => Number(new Intl.DateTimeFormat('en-US', { ...TZ, hour: 'numeric', hour12: false }).format(t)) % 24;
function clock(iso){
  if(!iso) return '';
  const t = ms(iso), d0 = iranTodayStartMs();
  if(t >= d0) return new Intl.DateTimeFormat('fa-IR', { ...TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(t);
  if(t >= d0 - 864e5) return 'دیروز';
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { ...TZ, day: 'numeric', month: 'short' }).format(t);
}
const link = (text, url) => {
  const u = url ? safeUrl(url) : '#';
  return u !== '#' ? `<a href="${u}" target="_blank" rel="noopener">${escHtml(text)}</a>` : escHtml(text);
};
const source = (i) => (i.cid ? chName(i.cid) : String(i.meta || '').split('،')[0].trim());
function avatar(cid){
  const ch = CHANNELS.find(c => c.id === cid);
  const u = ch && ch.avatar_url ? safeUrl(ch.avatar_url) : '#';
  return u !== '#' ? `<span class="td-av"><img src="${u}" alt="" loading="lazy" data-no-menu /></span>` : `<span class="td-av is-txt">${escHtml(cid ? chInitials(cid) : '؟')}</span>`;
}
const badges = (i) => (i.badges || []).map(([cls, t]) => `<span class="td-badge${cls ? ' is-' + cls : ''}">${escHtml(t)}</span>`).join('');
const meta = (i) => `<small class="td-meta"><span class="td-src">${escHtml(source(i))}</span>${i.time ? `<span class="td-time">${escHtml(clock(i.time))}</span>` : ''}</small>`;
const moreBtn = (m, label) => m ? `<button type="button" class="td-more" ${m.newsGo ? `data-news-go="${escAttr(m.newsGo)}"` : `data-go="${escAttr(m.go)}"`}>${escHtml(label || m.label)} ←</button>` : '';
const head = (id, title, tab, sub) => `<div class="td-h" id="${id}"><span class="td-h-ic">${todayIcon(tab ? tab.key : 'news')}</span><div><h2>${escHtml(title)}</h2>${sub ? `<p>${escHtml(sub)}</p>` : ''}</div>${tab ? moreBtn(tab.more) : ''}</div>`;
const EMPTY = (t) => `<p class="td-empty">${escHtml(t)}</p>`;

function heroHtml(tabs){
  const d0 = iranTodayStartMs(), now = Date.now();
  const hours = new Array(24).fill(0);
  const srcs = new Set();
  POSTS_CACHE.forEach(p => {
    const t = ms(p.posted_at || p.scraped_at);
    if(t >= d0 && t <= now && !p.hidden_at && !HIDDEN_POST_IDS.has(Number(p.id))){ hours[tehranHour(t)]++; srcs.add(p.channel_id); }
  });
  const total = hours.reduce((a, b) => a + b, 0), max = Math.max(1, ...hours), cur = tehranHour(now);
  const peak = hours.indexOf(Math.max(...hours));
  const day = new Intl.DateTimeFormat('fa-IR', { ...TZ, weekday: 'long' }).format(now) + ' ' +
    new Intl.DateTimeFormat('fa-IR-u-ca-persian', { ...TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  const bars = hours.map((n, h) => `<i class="${h === cur ? 'now' : h > cur ? 'fut' : ''}" style="--h:${h > cur ? 0 : Math.max(4, Math.round(n / max * 100))}%" title="ساعت ${toFaDigits(String(h))}: ${toFaDigits(String(n))} مطلب"></i>`).join('');
  const jumps = [['td-news', 'اخبار منتخب', 'news'], ['td-claim', 'شایعه‌ها', 'claim'], ['td-pos', 'مواضع', 'pos'], ['td-hawza', 'درباره حوزه', 'hawza'], ['td-note', 'یادداشت‌ها', 'note'], ['td-np', 'روزنامه‌ها', null]]
    .filter(([id, , k]) => (k ? tabs.some(t => t.key === k) : id !== 'td-np' || NEWSPAPERS.some(n => n.image_url)))
    .map(([id, l, k]) => { const t = k && tabs.find(x => x.key === k); return `<button type="button" class="td-jump" data-td-jump="${id}">${escHtml(l)}${t && t.count ? `<i>${toFaDigits(String(t.count))}</i>` : ''}</button>`; }).join('');
  return `<header class="td-hero">
    <div class="td-hero-tx">
      <span class="td-eb">منتخب مطالب امروز جریان</span>
      <h1>${escHtml(day)}</h1>
      <p>امروز تا این ساعت <b>${faNum(total)}</b> مطلب از <b>${faNum(srcs.size)}</b> منبع رصد شد${total ? `؛ بیشترین مطلب در ساعت ${toFaDigits(String(peak))}` : ''}.</p>
      <nav class="td-jumps" aria-label="پرش به قسمت‌ها">${jumps}</nav>
    </div>
    <div class="td-hero-chart" aria-hidden="true"><div class="td-bars">${bars}</div><div class="td-axis"><span>۰</span><span>۶</span><span>۱۲</span><span>۱۸</span><span>۲۴</span></div></div>
  </header>`;
}

function newsHtml(tab){
  if(!tab) return EMPTY('هنوز خبر منتخبی برای امروز نیست.');
  const [first, ...rest] = tab.items;
  const lead = `<article class="td-lead${first.thumb ? '' : ' no-img'}">
      ${first.thumb ? `<span class="td-lead-img"><img src="${escAttr(first.thumb)}" alt="" loading="lazy" data-no-menu /></span>` : ''}
      <div class="td-lead-tx"><span class="td-rank">۱</span><div class="td-badges">${badges(first)}</div><h3>${link(first.text, first.link)}</h3>${meta(first)}</div>
    </article>`;
  const list = rest.map((i, k) => `<article class="td-card">
      ${i.thumb ? `<span class="td-thumb"><img src="${escAttr(i.thumb)}" alt="" loading="lazy" data-no-menu /></span>` : `<span class="td-rank sm">${toFaDigits(String(k + 2))}</span>`}
      <div class="td-card-tx"><h3>${link(i.text, i.link)}</h3><div class="td-badges">${badges(i)}</div>${meta(i)}</div>
    </article>`).join('');
  return lead + (list ? `<div class="td-grid2">${list}</div>` : '');
}
const simpleList = (tab, empty) => tab ? `<div class="td-list">${tab.items.map(i => `<article class="td-li"><div class="td-badges">${badges(i)}</div><h3>${link(i.text, i.link)}</h3>${meta(i)}</article>`).join('')}</div>` : EMPTY(empty);
function hawzaHtml(tab){
  if(!tab) return EMPTY('امروز مطلبی درباره حوزه رصد نشده است.');
  return `<div class="td-tiles">${tab.items.slice(0, 4).map(i => `<article class="td-tile">${i.thumb ? `<span class="td-tile-img"><img src="${escAttr(i.thumb)}" alt="" loading="lazy" data-no-menu /></span>` : ''}<h3>${link(i.text, i.link)}</h3>${meta(i)}</article>`).join('')}</div>`;
}
function notesHtml(tab){
  if(!tab) return EMPTY('امروز یادداشت تازه‌ای نیست.');
  return `<div class="td-list">${tab.items.map(i => `<article class="td-note">${avatar(i.cid)}<div><small class="td-meta"><span class="td-src">${escHtml(source(i))}</span>${i.time ? `<span class="td-time">${escHtml(clock(i.time))}</span>` : ''}</small><h3>${link(i.text, i.link)}</h3></div></article>`).join('')}</div>`;
}
function papersHtml(){
  const withImg = NEWSPAPERS.filter(n => n.image_url);
  if(!withImg.length) return '';
  const last = withImg.map(n => n.edition_date).sort().pop();
  const list = withImg.filter(n => n.edition_date === last).slice(0, 10);
  return `<section class="td-box td-papers">${head('td-np', 'صفحه‌ی اول روزنامه‌ها', null, 'جلد روزنامه‌های امروز')}<button type="button" class="td-more td-np-more" data-news-go="newspapers">همه‌ی روزنامه‌ها ←</button>
    <div class="td-covers">${list.map(n => `<button type="button" class="td-cover" data-news-go="newspapers" aria-label="${escAttr(n.title)}"><img src="${escAttr(n.image_url)}" alt="" loading="lazy" data-no-menu /><span>${escHtml(n.title)}</span></button>`).join('')}</div></section>`;
}

export function renderTodayPage(){
  const box = document.getElementById('today-page');
  if(!box) return;
  const tabs = todayTabs(7);
  const by = (k) => tabs.find(t => t.key === k);
  const news = by('news'), claim = by('claim'), pos = by('pos'), hawza = by('hawza'), note = by('note');
  box.innerHTML = `${heroHtml(tabs)}
    <div class="td-main">
      <section class="td-box td-news">${head('td-news', news ? news.featLabel === 'مهم‌ترین امروز' ? 'اخبار منتخب امروز' : 'تازه‌ترین خبرها' : 'اخبار منتخب امروز', news, 'به انتخاب ویراستار و هوش مصنوعی، بر اساس تعداد منابع و اهمیت')}${newsHtml(news)}</section>
      <div class="td-side">
        <section class="td-box">${head('td-claim', 'ادعاها و شایعه‌ها', claim, 'راستی‌آزمایی «رصد شایعات»')}${simpleList(claim ? { ...claim, items: claim.items.slice(0, 3) } : null, 'امروز ادعا یا شایعه‌ی تازه‌ای ثبت نشده است.')}</section>
        <section class="td-box">${head('td-pos', 'مواضع مراجع و علماء', pos)}${simpleList(pos ? { ...pos, items: pos.items.slice(0, 3) } : null, 'امروز موضع تازه‌ای ثبت نشده است.')}</section>
      </div>
    </div>
    <div class="td-row">
      <section class="td-box">${head('td-hawza', 'درباره حوزه', hawza)}${hawzaHtml(hawza)}</section>
      <section class="td-box">${head('td-note', 'یادداشت‌ها', note, 'چهره‌ها، سازمان‌ها و اندیشکده‌ها')}${notesHtml(note ? { ...note, items: note.items.slice(0, 4) } : null)}</section>
    </div>
    ${papersHtml()}`;
}

export function setupTodayPage(){
  document.getElementById('today-page')?.addEventListener('click', e => {
    const j = e.target.closest('[data-td-jump]');
    if(j) document.getElementById(j.dataset.tdJump)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
}
