// صفحه‌ی خوش‌آمد (۵.۳۹.۰، انتخاب کاربر): بعد از ورود، ستون کناری اول کل صفحه را می‌گیرد —
// راست متن و تیترها، وسط جلد تازه‌ترین شماره‌ی نشریه‌ی جریان، چپ آمارها (#wl-stats از hero-stats.js).
// «شروع» → روی رایانه‌ی پهن (≥۱۲۸۰px) با clip-path به ستون ۲۸۰px سمت راست جمع می‌شود؛ گوشی و رایانه‌ی باریک: محو.
// فقط یک‌بار در هر ورود (sessionStorage: jarian_welcome_seen؛ خروج پاکش می‌کند). کاهش حرکت → فقط محو.
import { escAttr } from '../../core/text.js';
import { MAGAZINES } from '../reports/magazines.js';
import { animateWelcomeStats } from './hero-stats.js';

const KEY = 'jarian_welcome_seen';
const wide = () => typeof matchMedia === 'function' && matchMedia('(min-width:1280px)').matches;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function coverHtml(m, cls){
  if(m && m.cover_url) return `<div class="${cls}"><img src="${escAttr(m.cover_url)}" alt="" data-no-menu /></div>`;
  return `<div class="${cls} wl-cv-ph"><b>جریان</b><i></i><small>بسته تحلیلی</small></div>`;
}

export function maybeShowWelcome(){
  const el = document.getElementById('welcome');
  if(!el) return;
  let seen = false;
  try{ seen = sessionStorage.getItem(KEY) === '1'; sessionStorage.setItem(KEY, '1'); }catch(e){ /* storage در دسترس نیست */ }
  if(seen) return;
  const [m, prev] = MAGAZINES;
  const mid = el.querySelector('.wl-mid');
  if(mid) mid.innerHTML = `${prev ? coverHtml(prev, 'wl-cv wl-cv2') : ''}${coverHtml(m, 'wl-cv wl-cv1')}`;
  const d = el.querySelector('.wl-date');
  // روز هفته و تاریخ جدا قالب‌بندی می‌شوند (ترکیبشان در Chromium «۱۴۰۵ آبان ۲۹, جمعه» درمی‌آید)
  const now = new Date(), tz = { timeZone: 'Asia/Tehran' };
  if(d) d.textContent = new Intl.DateTimeFormat('fa-IR', { ...tz, weekday: 'long' }).format(now) + ' ' + new Intl.DateTimeFormat('fa-IR-u-ca-persian', { ...tz, day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  el.hidden = false;
  document.documentElement.classList.add('wl-open');
  animateWelcomeStats(); // اگر عددها از قبل رسیده‌اند (وگرنه renderDashHeroStats با رسیدنشان می‌شمارد)
}

function closeWelcome(){
  const el = document.getElementById('welcome');
  if(!el || el.hidden || el.classList.contains('go')) return;
  el.classList.add('go', wide() && !reduced() ? 'to-side' : 'fade');
  document.documentElement.classList.remove('wl-open');
  setTimeout(() => { el.hidden = true; el.classList.remove('go', 'to-side', 'fade'); }, reduced() ? 300 : 680);
}

export function resetWelcome(){ try{ sessionStorage.removeItem(KEY); }catch(e){ /* storage در دسترس نیست */ } }

export function setupWelcome(){
  document.getElementById('wl-go')?.addEventListener('click', closeWelcome);
  document.addEventListener('keydown', e => { if(e.key === 'Escape') closeWelcome(); });
}
