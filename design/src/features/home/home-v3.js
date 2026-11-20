// صفحه‌ی نخست ۵.۳۹.۰ (انتخاب کاربر بعد از چند دور ماکت؛ الگوی داشبورد «Planti»)؛ ۵.۴۰.۰ (خواست کاربر):
//   ستون «امروز در جریان» = خلاصه‌ی روز و درگاه صفحه‌ی «منتخب مطالب امروز» (today-page.js)
//   شش کاشی عرصه (کوچک و بزرگ؛ عدد زنده از domain-live.js)، کارت «بسته تحلیلی جریان» و جست‌وجوی سرصفحه.
import { escAttr, escHtml, faTitle, toFaDigits } from '../../core/text.js';
import { iranTodayStartMs } from '../../core/date.js';
import { POSTS_CACHE, HIDDEN_POST_IDS } from '../../data/store.js';
import { MAGAZINES, openMagazineViewer, onMagazinesRendered } from '../reports/magazines.js';
import { todayTabs, todayIcon } from './today-col.js';
import { goToNewsTab } from '../news/news-tabs.js';

const TZ = { timeZone: 'Asia/Tehran' };
const ms = (iso) => (iso ? new Date(iso).getTime() : 0);
const faNum = (n) => toFaDigits(String(n));
const tehranHour = (t) => Number(new Intl.DateTimeFormat('en-US', { ...TZ, hour: 'numeric', hour12: false }).format(t)) % 24;
const EMPTY = '<p class="hm-empty">هنوز مطلبی برای امروز رصد نشده است.</p>';

// ستون «امروز در جریان» = درگاه صفحه‌ی «منتخب مطالب امروز» (۵.۴۰.۰، مدل «خلاصه‌ی روز» به انتخاب کاربر):
// هر ردیف/دکمه = رفتن به صفحه‌ی منتخب (data-go="today") و با data-td-scroll پرش به همان قسمت آن صفحه.
const SEC = { news: 'td-news', claim: 'td-claim', pos: 'td-pos', hawza: 'td-hawza', note: 'td-note' };
const go = (k) => `data-go="today"${k && SEC[k] ? ` data-td-scroll="${SEC[k]}"` : ''}`;
function todayPulse(){
  const d0 = iranTodayStartMs(), now = Date.now();
  const hours = new Array(24).fill(0);
  const srcs = new Set();
  POSTS_CACHE.forEach(p => {
    const t = ms(p.posted_at || p.scraped_at);
    if(t >= d0 && t <= now && !p.hidden_at && !HIDDEN_POST_IDS.has(Number(p.id))){ hours[tehranHour(t)]++; srcs.add(p.channel_id); }
  });
  return { hours, total: hours.reduce((a, b) => a + b, 0), sources: srcs.size, cur: tehranHour(now) };
}
const barsHtml = ({ hours, cur }) => {
  const max = Math.max(1, ...hours);
  return hours.map((n, h) => `<i class="${h === cur ? 'now' : h > cur ? 'fut' : ''}" style="--h:${h > cur ? 0 : Math.max(6, Math.round(n / max * 100))}%"></i>`).join('');
};
const goBtn = (txt = 'مشاهده‌ی منتخب مطالب امروز') => `<button type="button" class="hm-today-go" data-go="today"><span>${escHtml(txt)}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg></button>`;

// خلاصه‌ی روز: کارت سرمه‌ای با شمار امروز و نمودار ریز ساعتی؛ زیرش یک ردیف برای هر نوع مطلب
//    (آیکون، نام، شمار امروز، تازه‌ترین تیتر) — کلیک = همان قسمت در صفحه‌ی منتخب
function vDigest(tabs){
  const p = todayPulse();
  const top = `<button type="button" class="dg-card" ${go()}><span class="dg-eb">منتخب مطالب امروز</span><b>${faNum(p.total)}</b><span class="dg-sub">مطلب از ${faNum(p.sources)} منبع تا این ساعت</span><span class="dg-bars" aria-hidden="true">${barsHtml(p)}</span></button>`;
  const rows = tabs.map(t => { const i = t.items[0]; return `<button type="button" class="dg-row" ${go(t.key)}>
      <span class="hm-ic">${todayIcon(t.key)}</span>
      <span class="dg-tx"><span class="dg-h"><em>${escHtml(t.label)}</em>${t.count ? `<i>${faNum(t.count)} امروز</i>` : ''}</span><b>${escHtml(i.text)}</b></span>
      <svg class="dg-ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>`; }).join('');
  return { top, list: rows || EMPTY, foot: goBtn() };
}

function renderToday(){
  const box = document.getElementById('hm-today');
  const topEl = document.getElementById('hm-tabs'), list = document.getElementById('hm-items'), foot = document.getElementById('hm-today-foot');
  if(!box || !list) return;
  const out = vDigest(todayTabs());
  if(topEl){ topEl.hidden = !out.top; topEl.innerHTML = out.top || ''; }
  list.innerHTML = out.list;
  if(foot){ foot.hidden = !out.foot; foot.innerHTML = out.foot || ''; }
}

function renderPackage(){
  const box = document.getElementById('pkg-flow');
  if(!box) return;
  const m = MAGAZINES[0];
  if(!m){ box.innerHTML = '<p class="hm-empty">هنوز شماره‌ای از بسته تحلیلی جریان بارگذاری نشده است.</p>'; return; }
  const files = Array.isArray(m.files) ? m.files : [];
  const label = m.issue_no ? 'شماره ' + toFaDigits(String(m.issue_no)) : faTitle(m.title);
  const sub = m.title && !/بسته\s*(ی\s*)?تحلیلی\s*جریان/.test(m.title) ? faTitle(m.title) : '';
  // ۵.۴۰.۰: سه شماره‌ی قبلیِ دارای فایل کنار کارت (رایانه)
  const prev = MAGAZINES.slice(1).filter(x => Array.isArray(x.files) && x.files.length).slice(0, 3);
  box.innerHTML = `<button type="button" class="hm-pkg-cv" aria-label="مطالعه‌ی ${escAttr(label)}">${m.cover_url ? `<img src="${escAttr(m.cover_url)}" alt="" data-no-menu />` : '<span>جریان</span>'}</button>
    <div class="hm-pkg-tx"><span class="hm-eb">بسته تحلیلی جریان — تازه‌ترین شماره</span><h3>${escHtml(label)}</h3>${sub ? `<p>${escHtml(sub)}</p>` : ''}
      <div class="hm-pkg-acts"><button type="button" class="hm-btn hm-pkg-read"${files.length ? '' : ' disabled'}>مطالعه‌ی این شماره</button>
      <button type="button" class="hm-more" data-go="reports">همه‌ی شماره‌ها ←</button></div></div>
    ${prev.length ? `<div class="hm-pkg-prev" aria-label="شماره‌های قبلی">${prev.map((x, i) => {
      const l = x.issue_no ? 'شماره ' + toFaDigits(String(x.issue_no)) : faTitle(x.title);
      return `<button type="button" data-pkg-prev="${i}" aria-label="مطالعه‌ی ${escAttr(l)}"><i>${x.cover_url ? `<img src="${escAttr(x.cover_url)}" alt="" loading="lazy" data-no-menu />` : ''}</i><small>${escHtml(l)}</small></button>`;
    }).join('')}</div>` : ''}`;
  const open = () => { if(files.length) openMagazineViewer(m); };
  box.querySelector('.hm-pkg-cv').addEventListener('click', open);
  box.querySelector('.hm-pkg-read').addEventListener('click', open);
  box.querySelectorAll('[data-pkg-prev]').forEach(b => b.addEventListener('click', () => openMagazineViewer(prev[Number(b.dataset.pkgPrev)])));
}

// شمار مطالب امروز (از hero-stats.js) در زیرعنوان سرصفحه
export function setHomeTodayCount(n){
  const el = document.getElementById('hm-sub');
  if(!el) return;
  const now = new Date(), tz = { timeZone: 'Asia/Tehran' };
  const d = new Intl.DateTimeFormat('fa-IR', { ...tz, weekday: 'long' }).format(now) + ' ' + new Intl.DateTimeFormat('fa-IR-u-ca-persian', { ...tz, day: 'numeric', month: 'long' }).format(now);
  el.textContent = d + (n ? ' — امروز ' + toFaDigits(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '٬')) + ' مطلب رصد شد' : '');
}

export function renderHome(){
  renderToday();
  renderPackage();
}

export function setupHomeV3(){
  setHomeTodayCount(0);
  onMagazinesRendered(renderPackage);
  // رفتن به صفحه‌ی منتخب (data-go روی سند) و پرش به قسمت همان نوع مطلب
  document.getElementById('hm-today')?.addEventListener('click', e => {
    const b = e.target.closest('[data-td-scroll]');
    if(b) setTimeout(() => document.getElementById(b.dataset.tdScroll)?.scrollIntoView({ block: 'start' }), 80);
  });
  // جست‌وجوی سرصفحه = جست‌وجو در اخبار و رویدادها (تب شبکه‌های اجتماعی، همان کادر جست‌وجوی آنجا)
  document.getElementById('hm-search')?.addEventListener('submit', e => {
    e.preventDefault();
    const q = document.getElementById('hm-search-input').value.trim();
    goToNewsTab('study');
    const box = document.getElementById('news-search-input');
    if(box){ box.value = q; box.dispatchEvent(new Event('input', { bubbles: true })); }
  });
}
