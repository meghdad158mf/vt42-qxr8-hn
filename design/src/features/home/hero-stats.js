// پنل آماری هروی صفحه‌ی نخست (۵.۳۰.۰): منبع رصد، محتوای رصدشده، رصد امروز، بخش رصد، بسته تحلیلی — با شمارش از صفر (بدون کتابخانه از ۶.۰.۲)
import { api, fetchExactCount } from '../../core/api.js';
import { CHANNELS } from '../../data/store.js';
import { iranTodayStartMs } from '../../core/date.js';
import { MAGAZINES } from '../reports/magazines.js';
import { NEWSPAPERS } from '../news/newspapers.js';
import { SITE_VIS_ITEMS } from '../../data/site-sections.js';
import { toFaDigits } from '../../core/text.js';
import { setHomeTodayCount } from './home-v3.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { visHidden } from '../../app.js';

// برای شمارش «خبرگزاری» توی هرو صفحه‌ی نخست — تعداد عنوان‌های یکتای روزنامه
// (از کل جدول، نه فقط چند روز اخیر مثل NEWSPAPERS نمایشی) رو می‌خواد. یکتاسازی
// با View دیتابیسی newspaper_unique_slugs (migration_030) انجام می‌شه، نه با
// گرفتن کل ستون slug و Set کردنش توی جاوااسکریپت — چون اون روش قبلی به سقف
// «Max Rows» سوپابیس (۱۰۰۰ ردیف واقعی در هر پاسخ، مستقل از limit کلاینت) می‌خورد
// و بعد از رد شدن جدول newspapers از ۱۰۰۰ ردیف، عنوان‌های یکتای جدیدتر از
// شمارش جا می‌موندن. الان فقط *تعداد* رو با همون ترفند Content-Range
// (fetchExactCount، بدون انتقال ردیف‌های واقعی) می‌گیریم — این هیچ‌وقت به آن
// سقف نمی‌خوره.
// «منبع رصد» صفحه‌ی نخست = منابعی که الان رصد می‌شن، هر منبع یک‌بار (خواست کاربر، ۵.۳۰.۰):
// منابع فعال «مدیریت منابع» + روزنامه‌های ۳۰ روز اخیر + سایت‌های خزنده‌ی «درباره حوزه» که در
// «مدیریت منابع» نیستن — RPC monitored_source_counts (migration_049؛ crawl_sites فقط برای مدیر
// خواندنیه). تا migration اجرا نشده: منابع فعال + روزنامه‌های ۳۰ روز اخیر از NEWSPAPERS.
async function fetchSourceRpc(){
  try{
    const r = await api('/rpc/monitored_source_counts', { method:'POST', body:'{}' });
    if(r.ok){
      const d = await r.json();
      if(d && typeof d.channels === 'number') return d.channels + (+d.newspapers || 0) + (+d.crawl || 0);
    }
  }catch(e){ /* بدون migration_049 → شمارش سمت کلاینت */ }
  return null;
}
function sourceFallback(){
  const since = new Date(iranTodayStartMs() - 30 * 864e5).toISOString().slice(0, 10);
  return CHANNELS.filter(c=>c.active !== false).length
    + new Set(NEWSPAPERS.filter(n=>n.edition_date >= since).map(n=>n.slug)).size;
}
export async function fetchMonitoredSourceCount(){
  const n = await fetchSourceRpc();
  return n === null ? sourceFallback() : n;
}

// ۶.۰.۲ (کارت‌های آمار صفحه‌ی خوش‌آمد دیر می‌آمدند): این ۷ درخواست شمارش قبلاً فقط بعد از
// پایان کل loadAll شروع می‌شدند؛ حالا loadAll همان اول prefetchHeroCounts() را صدا می‌زند تا
// هم‌زمان با بقیه‌ی داده‌ها برسند. نیازی به داده‌ی دیگر ندارند (جز جایگزین «منبع رصد» بدون RPC
// که پس از loadAll حساب می‌شود).
const CRAWL_ONLY = '/hawza_mentions?post_id=is.null&hidden_at=is.null';
function tehranDay(){ return new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Tehran', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date()); }
function fetchHeroCounts(){
  const todayIso = encodeURIComponent(new Date(iranTodayStartMs()).toISOString());
  return Promise.all([
    fetchExactCount('/posts'),
    fetchExactCount('/newspapers'),
    fetchExactCount(CRAWL_ONLY),
    fetchExactCount('/posts?scraped_at=gte.' + todayIso),
    fetchExactCount('/newspapers?edition_date=eq.' + tehranDay()),
    fetchExactCount(CRAWL_ONLY + '&scraped_at=gte.' + todayIso),
    fetchSourceRpc(),
  ]);
}
let HERO_PREFETCH = null;
export function prefetchHeroCounts(){ HERO_PREFETCH = fetchHeroCounts(); }

// آخرین عددهای صفحه‌ی خوش‌آمد (همان روز تهران) — تا عددهای تازه برسند، خوش‌آمد خالی نماند
const WL_CACHE = 'jarian_wl_stats';
const WL_LABELS = ['رصد امروز', 'منبع رصد', 'محتوای رصد شده', 'شماره‌ی بسته تحلیلی'];
function wlHtml(values, from){
  return values.map((v, i) => `<div><b data-value="${v}"${from && from[i] != null ? ` data-from="${from[i]}"` : ''}>${fmtHeroStat(v)}</b><span>${WL_LABELS[i]}</span></div>`).join('');
}
export function renderWelcomeStatsFromCache(){
  const wl = document.getElementById('wl-stats');
  if(!wl || wl.children.length) return;
  try{
    const c = JSON.parse(localStorage.getItem(WL_CACHE) || 'null');
    if(c && c.day === tehranDay() && Array.isArray(c.v) && c.v.length === 4) wl.innerHTML = wlHtml(c.v);
  }catch(e){ /* storage در دسترس نیست */ }
}

export async function renderDashHeroStats(){
  // ۵.۳۹.۰: پنل آمار هرو از صفحه‌ی نخست برداشته شد — عددها به صفحه‌ی خوش‌آمد (#wl-stats)، زیرعنوان سرصفحه و پنل «نمایش کامل» می‌روند
  const wrap = document.getElementById('dash-hero-stats');

  // پنج کارت = مسیر کار سامانه از منبع تا تحلیل (۵.۳۰.۰، خواست کاربر: کارت‌ها «منطقی و به هم
  // مرتبط» باشن): از کجا (منبع رصد) ← چقدر (محتوای رصد شده) ← زنده بودن (رصد امروز) ← در چه
  // حوزه‌هایی (بخش رصد) ← حاصل کار (بسته تحلیلی). قبلاً «خبرگزاری»/«کنشگر مجازی» (دو زیرمجموعه‌ی
  // ناقص منابع) و «مدارس علمیه» (عدد دستی ۱۲۶) بود.
  // همه‌ی عددها با count=exact از خودِ جدول‌ها (نه از کش‌های محدود POSTS_CACHE/NEWSPAPERS).
  // «محتوای رصد شده»/«رصد امروز» = پست‌ها + روزنامه‌ها + یافته‌های خزنده‌ی «درباره حوزه» از سایت‌ها
  // (hawza_mentions با post_id خالی؛ یافته‌های شبکه‌های اجتماعی خودشون پست‌ان و دوباره شمرده نمی‌شن).
  // scraped_at فقط موقع درج اول پر می‌شه (کالکتورها روی upsert دوباره‌اش نمی‌نویسن)، پس پست
  // قدیمیِ دوباره‌اسکن‌شده در «رصد امروز» نمیاد.
  const pending = HERO_PREFETCH || fetchHeroCounts();
  HERO_PREFETCH = null;
  const [postsTotal, newspapersTotal, crawlTotal, postsToday, newspapersToday, crawlToday, rpcSources] = await pending;
  const sources = rpcSources === null ? sourceFallback() : rpcSources;
  const trackedContentCount = postsTotal + newspapersTotal + crawlTotal;
  const todayCount = postsToday + newspapersToday + crawlToday;
  const sourceCount = sources;

  // «بخش رصد» — زیربخش‌های عرصه‌هایی که بیننده زیر همین هرو در «عرصه‌های رصد و پایش» می‌بینه
  // (خواست کاربر: ملاک تب‌ها باشن، نه خودِ عرصه‌ها): هر تب = یک بخش، عرصه‌ی بی‌تب = یک بخش؛
  // کارت‌های «به‌زودی» و بخش/تب‌های پنهان‌شده از «نمایش سایت» نه
  const domainCount = [...document.querySelectorAll('.domain-card[data-vis]')]
    .filter(c=>!c.classList.contains('soon-item') && !visHidden(c.dataset.vis))
    .reduce((n, c)=>{
      const it = SITE_VIS_ITEMS.find(x=>x.key === c.dataset.vis);
      if(!it || !it.tabs.length) return n + 1;
      return n + it.tabs.filter(([t])=>!visHidden(it.key + '/' + t)).length;
    }, 0);

  const magazinesCount = MAGAZINES.length; // «بسته تحلیلی» — مجلات خودِ جریان

  const ic = d => `<span class="dash-hero-stat-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg></span>`;
  const stat = (icon, value, label) => `<div class="dash-hero-stat">${ic(icon)}<span class="dash-hero-stat-t"><b data-value="${value}">۰</b><span class="dash-hero-stat-l">${label}</span></span></div>`;
  if(wrap) wrap.innerHTML =
    stat('<circle cx="12" cy="12" r="2"/><path d="M8.5 15.5a5 5 0 010-7M15.5 8.5a5 5 0 010 7M5.6 18.4a9 9 0 010-12.8M18.4 5.6a9 9 0 010 12.8"/>', sourceCount, 'منبع رصد') +
    stat('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>', trackedContentCount, 'محتوای رصد شده') +
    stat('<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>', todayCount, 'رصد امروز') +
    stat('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6.4-6.4"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>', domainCount, 'بخش رصد') +
    stat('<path d="M2 5.5c2.5-1 6-1 10 1.5 4-2.5 7.5-2.5 10-1.5V19c-2.5-1-6-1-10 1.5C8 18 4.5 18 2 19z"/><path d="M12 7v13.5"/>', magazinesCount, 'بسته تحلیلی');
  if(wrap) animateHeroStatCounters(wrap);
  setHomeTodayCount(todayCount);
  const wl = document.getElementById('wl-stats');
  const wlValues = [todayCount, sourceCount, trackedContentCount, magazinesCount];
  // اگر خوش‌آمد همین حالا عددهای قبلی (کش یا بار قبل) را نشان می‌دهد، شمارش از همان‌ها ادامه می‌یابد نه از صفر
  const shown = wl && !document.getElementById('welcome')?.hidden ? [...wl.querySelectorAll('b[data-value]')].map(b => Number(b.dataset.value)) : null;
  if(wl) wl.innerHTML = wlHtml(wlValues, shown && shown.length === 4 ? shown : null);
  try{ localStorage.setItem(WL_CACHE, JSON.stringify({ day: tehranDay(), v: wlValues })); }catch(e){ /* storage در دسترس نیست */ }
  // ۶.۰.۰ (خواست کاربر): شمارش سریع از صفر تا عدد، اگر صفحه‌ی خوش‌آمد همین حالا باز است
  if(wl && !document.getElementById('welcome')?.hidden) animateWelcomeStats();
  // ستون کناری (۵.۳۸.۰، طرح «دونیمه‌ی عمودی»): سه عدد اصلی همین پنل (پنهان در ستون از ۵.۳۹.۰)
  const k = (v, l) => `<div class="sn-kpi"><b>${fmtHeroStat(v)}</b><span>${l}</span></div>`;
  const three = k(todayCount, 'رصد امروز') + k(sourceCount, 'منبع رصد') + k(trackedContentCount, 'محتوای رصد شده');
  const side = document.getElementById('sn-kpis');
  if(side) side.innerHTML = three;
}
// «۳۷٬۹۶۶» — جداکننده‌ی هزارگان فارسی برای خوانایی عددهای بزرگ
export function fmtHeroStat(n){ return toFaDigits(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '٬')); }
export function animateHeroStatCounters(wrap, sel = '.dash-hero-stat b'){
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  wrap.querySelectorAll(sel).forEach((el, i) => {
    const target = Number(el.dataset.value) || 0;
    const from = Number(el.dataset.from) || 0;
    if(reduceMotion || !target || from === target){
      el.textContent = fmtHeroStat(target);
      return;
    }
    el.textContent = fmtHeroStat(from);   // بدون چشمک عدد نهایی پیش از شروع شمارش
    countUp(el, from, target, from ? 600 : 1100, from ? 0 : 150 + i * 50);
  });
}
// شمارش از صفر (یا عدد قبلی) تا عدد با منحنی power2.out (همان حرکت GSAP قبلی، بدون کتابخانه — ۶.۰.۲)؛
// فراخوانی دوباره روی همان عنصر شمارش قبلی را کنار می‌گذارد
function countUp(el, from, target, duration, delay){
  const token = (el._countToken = (el._countToken || 0) + 1);
  let start = 0;
  const step = (now) => {
    if(el._countToken !== token) return;
    if(!start) start = now + delay;
    const t = Math.min(1, Math.max(0, (now - start) / duration));
    el.textContent = fmtHeroStat(Math.round(from + (target - from) * (1 - (1 - t) * (1 - t))));
    if(t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}


// آمار صفحه‌ی خوش‌آمد (#wl-stats): همان شمارش سریع کارت‌های آمار (از صفر، ~۱ ثانیه، پشت‌سرهم)
export function animateWelcomeStats(){
  const wl = document.getElementById('wl-stats');
  if(wl) animateHeroStatCounters(wl, 'b[data-value]');
}
