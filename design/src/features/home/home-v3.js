// صفحه‌ی نخست ۵.۳۹.۰ (انتخاب کاربر بعد از چند دور ماکت؛ الگوی داشبورد «Planti»):
//   ستون «امروز در جریان»: مطلب اصلی امروز روی دیوار جلد روزنامه‌ها + فهرست تازه‌ترین مطالب همه‌ی عرصه‌ها
//   شش کارت عرصه (عدد زنده از domain-live.js)، کارت باریک «بسته تحلیلی جریان»، و جست‌وجوی سرصفحه.
// مطلب اصلی: یافته‌ی «آنچه درباره حوزه گفته می‌شود» (ترجیح اشاره در تیتر، ۴۸ ساعت اخیر)؛ نبود → اولین مطلب فهرست.
import { api } from '../../core/api.js';
import { CHANNELS, POSTS_CACHE, HIDDEN_POST_IDS, chName } from '../../data/store.js';
import { escAttr, escHtml, faTitle, safeUrl, toFaDigits } from '../../core/text.js';
import { newsRelTime } from '../../core/date.js';
import { NEWSPAPERS } from '../news/newspapers.js';
import { MAGAZINES, openMagazineViewer, onMagazinesRendered } from '../reports/magazines.js';
import { todayFeed, todayIcon } from './today-col.js';
import { goToNewsTab } from '../news/news-tabs.js';

const tOf = (p) => new Date(p.posted_at || p.scraped_at).getTime();
const visible = (p) => !p.hidden_at && !HIDDEN_POST_IDS.has(Number(p.id));
const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const link = (text, url) => {
  const u = url ? safeUrl(url) : '#';
  return u !== '#' ? `<a href="${u}" target="_blank" rel="noopener">${escHtml(text)}</a>` : escHtml(text);
};

// یافته‌های خزنده فقط با باز شدن تب خودشان بار می‌شوند؛ اینجا فقط ۳۰ ردیف آخر، یک‌بار در هر بارگذاری
let MENTIONS = null, MENTIONS_LOADING = null;
function loadMentions(){
  if(MENTIONS || MENTIONS_LOADING) return MENTIONS_LOADING;
  MENTIONS_LOADING = api('/hawza_mentions?select=id,url,site,site_name,title,excerpt,kind,in_title,published_at,scraped_at,hidden_at&order=scraped_at.desc&limit=30')
    .then(r => r.ok ? r.json() : []).then(rows => { MENTIONS = rows.filter(x => !x.hidden_at && x.title); })
    .catch(() => { MENTIONS = []; }).finally(() => { MENTIONS_LOADING = null; });
  return MENTIONS_LOADING;
}
function leadStory(){
  const DAY2 = Date.now() - 48 * 3600e3;
  const t = (x) => new Date(x.published_at || x.scraped_at).getTime();
  if(MENTIONS && MENTIONS.length){
    const fresh = MENTIONS.filter(x => t(x) >= DAY2);
    const m = fresh.find(x => x.in_title) || fresh[0] || MENTIONS[0];
    return { kind: 'درباره حوزه', title: oneLine(m.title), url: m.url, postId: null,
      meta: [m.site_name || m.site, newsRelTime(m.published_at || m.scraped_at)].filter(Boolean).join('، ') };
  }
  const ids = new Set(CHANNELS.filter(c => c.show_in_hawza).map(c => c.id));
  const p = POSTS_CACHE.filter(x => ids.has(x.channel_id) && visible(x) && x.hawza_relevant === true).sort((a, b) => tOf(b) - tOf(a))[0];
  if(!p) return null;
  return { kind: 'درباره حوزه', title: oneLine(p.title || p.text).slice(0, 140), url: p.link, postId: p.id,
    meta: chName(p.channel_id) + '، ' + newsRelTime(p.posted_at || p.scraped_at) };
}
function wallHtml(){
  const imgs = NEWSPAPERS.filter(n => n.image_url).slice(0, 8);
  if(!imgs.length) return '';
  return `<div class="hm-wall" aria-hidden="true">${imgs.map(n => `<img src="${escAttr(n.image_url)}" alt="" loading="lazy" data-no-menu />`).join('')}</div>`;
}

function renderToday(){
  const lead = leadStory();
  const feed = todayFeed(lead && lead.postId ? new Set([lead.postId]) : new Set(), 10);
  const top = lead || (feed[0] ? { kind: feed[0].label, title: feed[0].text, url: feed[0].link, meta: feed[0].meta } : null);
  const items = lead ? feed : feed.slice(1);
  const leadEl = document.getElementById('hm-lead');
  if(leadEl){
    leadEl.hidden = !top;
    leadEl.innerHTML = top ? `${wallHtml()}<div class="hm-lead-tx"><span class="hm-eb">مهم‌ترین مطلب امروز · ${escHtml(top.kind)}</span>
      <h3>${link(top.title, top.url)}</h3><small>${escHtml(top.meta || '')}</small>
      <div class="hm-lead-btns">${safeUrl(top.url || '') !== '#' ? `<a class="hm-btn" href="${safeUrl(top.url)}" target="_blank" rel="noopener">ادامه‌ی مطلب</a>` : ''}<button type="button" class="hm-btn g" data-go="hawza">همه‌ی مطالب حوزه</button></div></div>` : '';
  }
  const list = document.getElementById('hm-items');
  if(list){
    list.innerHTML = items.length ? items.map(i => `<div class="hm-it"><span class="hm-ic">${todayIcon(i.kind)}</span><div><em>${escHtml(i.label)}</em><b>${link(i.text, i.link)}</b><small>${escHtml(i.meta)}</small></div></div>`).join('')
      : '<p class="hm-empty">هنوز مطلبی برای امروز رصد نشده است.</p>';
  }
}

function renderPackage(){
  const box = document.getElementById('pkg-flow');
  if(!box) return;
  const m = MAGAZINES[0];
  if(!m){ box.innerHTML = '<p class="hm-empty">هنوز شماره‌ای از بسته تحلیلی جریان بارگذاری نشده است.</p>'; return; }
  const files = Array.isArray(m.files) ? m.files : [];
  const label = m.issue_no ? 'شماره ' + toFaDigits(String(m.issue_no)) : faTitle(m.title);
  const sub = m.title && !/بسته\s*(ی\s*)?تحلیلی\s*جریان/.test(m.title) ? faTitle(m.title) : '';
  box.innerHTML = `<button type="button" class="hm-pkg-cv" aria-label="مطالعه‌ی ${escAttr(label)}">${m.cover_url ? `<img src="${escAttr(m.cover_url)}" alt="" data-no-menu />` : '<span>جریان</span>'}</button>
    <div class="hm-pkg-tx"><h3>بسته تحلیلی جریان — ${escHtml(label)}</h3>${sub ? `<p>${escHtml(sub)}</p>` : ''}</div>
    <button type="button" class="hm-btn hm-pkg-read"${files.length ? '' : ' disabled'}>مطالعه‌ی این شماره</button>
    <button type="button" class="hm-more" data-go="reports">همه‌ی شماره‌ها ←</button>`;
  const open = () => { if(files.length) openMagazineViewer(m); };
  box.querySelector('.hm-pkg-cv').addEventListener('click', open);
  box.querySelector('.hm-pkg-read').addEventListener('click', open);
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
  if(!MENTIONS) loadMentions()?.then(renderToday);
}

export function setupHomeV3(){
  setHomeTodayCount(0);
  onMagazinesRendered(renderPackage);
  // جست‌وجوی سرصفحه = جست‌وجو در اخبار و رویدادها (تب شبکه‌های اجتماعی، همان کادر جست‌وجوی آنجا)
  document.getElementById('hm-search')?.addEventListener('submit', e => {
    e.preventDefault();
    const q = document.getElementById('hm-search-input').value.trim();
    goToNewsTab('study');
    const box = document.getElementById('news-search-input');
    if(box){ box.value = q; box.dispatchEvent(new Event('input', { bubbles: true })); }
  });
}
