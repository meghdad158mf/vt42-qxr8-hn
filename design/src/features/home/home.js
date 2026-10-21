// صفحه‌ی نخست: مدار دوم عرصه‌ها، دسترسی سریع، جلدهای «بسته تحلیلی جریان» روی قوس، فرم «اطلاع از انتشار»
import { api } from '../../core/api.js';
import { escAttr, escHtml, faTitle, toFaDigits } from '../../core/text.js';
import { ICONS } from '../../ui/icons.js';
import { MAGAZINES, openMagazineViewer, onMagazinesRendered } from '../reports/magazines.js';
import { normalizeIrMobile } from '../../core/validate.js';
import { showToast } from '../../ui/toast.js';

export async function subscribeNotify(){
  const input = document.getElementById('notify-phone');
  const btn = document.getElementById('notify-subscribe-btn');
  const phone = normalizeIrMobile(input.value);
  if(!/^09\d{9}$/.test(phone)){ showToast('شماره موبایل معتبر نیست — مثال: ۰۹۱۲xxxxxxx'); return; }
  btn.disabled = true;
  try{
    const r = await api('/notify_subscribers', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ phone }),
    });
    if(r.ok){
      showToast('ثبت شد — به‌محض انتشار بسته جدید به شما پیامک اطلاع‌رسانی ارسال می‌شود');
      input.value = '';
    }else if(r.status === 409){
      showToast('این شماره قبلاً ثبت شده است');
    }else{
      showToast('ثبت‌نام ناموفق بود — دوباره امتحان کنید');
    }
  }catch(e){
    showToast('خطا در ارتباط با سرور');
  }finally{
    btn.disabled = false;
  }
}
// ---- مدار دوم صفحه‌ی نخست: سوراخ‌های mask پشت کارت‌های دیده‌شده ----
// کارت‌ها وسط‌چین‌اند (فاصله‌ی مراکز ۱۸۶px)؛ با کارت پنهان/«به‌زودی» (بیننده) جای
// سوراخ‌ها از نو حساب می‌شه تا قوس پشت جای خالی بریده دیده نشه
export function layoutOrbit2(){
  const grid = document.querySelector('.domain-grid-2');
  if(!grid) return;
  const cards = [...grid.querySelectorAll('.domain-card')].filter(c=>getComputedStyle(c).display !== 'none');
  grid.classList.toggle('is-empty', !cards.length);
  const g = document.getElementById('dom-orbit2-holes');
  if(!g) return;
  const n = cards.length;
  g.innerHTML = cards.map((c, i)=>`<circle cx="${(i - (n - 1) / 2) * 186}" cy="74" r="58" fill="url(#dom-orbit2-hole)"/>`).join('');
}
// «بسته تحلیلی جریان» صفحه‌ی نخست — جلد ۵ شماره‌ی اول (به ترتیب مدیر) روی قوس
// جلدهای بسته: ردیف بالا ۴ جلد (مدار کوچک‌تر) و ردیف پایین ۵ جلد (مدار بزرگ)
// هر ردیف مدار خودش را دارد؛ ردیف دوم با همان هندسه‌ی ردیف اول و ضریب ۰٫۷۵
// مدار هر ردیف عیناً مثل مدار عرصه‌های صفحه‌ی نخست: ردیف بزرگ (۵ جلد) = مدار اول،
// ردیف کوچک (۴ جلد) = مدار دوم با ضریب ۰٫۷۵. مرکز جلدها روی همان خط مرکز آیکون‌هاست.
export function pkgOrbitSvg(ri, n){
  const big = ri === 1, id = 'pkg-orbit-' + ri;
  const d1 = big ? 'M -562 24 Q 0 184, 562 24' : 'M -421.5 36.5 Q 0 156.5, 421.5 36.5';
  const d2 = big ? 'M -512 2 Q 0 122, 512 2' : 'M -384 20 Q 0 110, 384 20';
  const ex = big ? 562 : 421.5, ey = big ? 24 : 36.5;
  const kt = big ? '0;.65;1' : '0;.51;1', v = big ? '-1159;130;130' : '-874;130;130';
  const holes = Array.from({length: n}, (_, i) => `<rect x="${(i - (n - 1) / 2) * 186 - 61}" y="-6" width="122" height="159" rx="8" fill="#000"/>`).join('');
  const streak = (w, o, d) => `<use href="#${id}-path" stroke-width="${w}" stroke-opacity="${o}" stroke-dasharray="${d} 2278"><animate attributeName="stroke-dashoffset" values="${v}" keyTimes="${kt}" dur="9s" repeatCount="indefinite"/></use>`;
  return `<svg class="pkg-orbit" viewBox="-600 -100 1200 360" aria-hidden="true"><defs>
      <mask id="${id}-mask" maskUnits="userSpaceOnUse" x="-600" y="-100" width="1200" height="360"><rect x="-600" y="-100" width="1200" height="360" fill="#fff"/>${holes}</mask>
      <path id="${id}-path" d="${d1}"/>
      <path id="${id}-path2" d="${d2}"/>
    </defs>
    <g mask="url(#${id}-mask)">
      <use href="#${id}-path" fill="none" stroke="#EAB393" stroke-opacity=".32" stroke-width="1.3"/>
      <use href="#${id}-path2" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="1"/>
      <g class="flow" fill="none" stroke="#EAB393" stroke-linecap="round">${streak(3, 1, 18)}${streak(2, 0.45, 55)}${streak(1.4, 0.18, 110)}</g>
    </g>
    <circle cx="${-ex}" cy="${ey}" r="5.7" fill="#EAB393" fill-opacity=".09"/><circle cx="${-ex}" cy="${ey}" r="2.2" fill="#EAB393" fill-opacity=".5"/>
    <circle cx="${ex}" cy="${ey}" r="5.7" fill="#EAB393" fill-opacity=".09"/><circle cx="${ex}" cy="${ey}" r="2.2" fill="#EAB393" fill-opacity=".5"/>
  </svg>`;
}
export function pkgTile(m){
  const files = Array.isArray(m.files) ? m.files : [];
  const tile = document.createElement('div'); tile.className = 'pkg-tile';
  tile.setAttribute('role', 'button'); tile.tabIndex = 0;
  tile.innerHTML = `<div class="pkg-cover">${m.cover_url ? `<img src="${escAttr(m.cover_url)}" alt="${escAttr(m.title)}" draggable="false" oncontextmenu="return false" />` : (m.file_type==='images' ? ICONS.photo : ICONS.doc)}</div>
    <div class="pkg-title">${escHtml(m.issue_no ? 'شماره ' + toFaDigits(String(m.issue_no)) : faTitle(m.title))}</div>`;
  tile.addEventListener('click', () => { if(files.length) openMagazineViewer(m); });
  return tile;
}
export function renderMagazineCarousel(){
  const wrap = document.getElementById('pkg-covers');
  if(!wrap) return;
  wrap.innerHTML = '';
  if(!MAGAZINES.length){
    wrap.innerHTML = '<div class="pkg-empty">هنوز شماره‌ای بارگذاری نشده.</div>';
    return;
  }
  const items = MAGAZINES.slice(0, 9);
  const rows = items.length > 4 ? [items.slice(0, 4), items.slice(4)] : [items];
  rows.forEach((list, ri)=>{
    const row = document.createElement('div'); row.className = 'pkg-row';
    row.innerHTML = pkgOrbitSvg(rows.length === 2 ? ri : 0, list.length);
    const covers = document.createElement('div'); covers.className = 'pkg-covers';
    list.forEach(m => covers.appendChild(pkgTile(m)));
    row.appendChild(covers);
    wrap.appendChild(row);
  });
}
// سه کارت راهنمای سریع زیر هرو — فقط اسکرول توی همون صفحه‌ی نخست،
// نه switchSection (چون هر سه مقصد از قبل توی همین sec-dashboard هستن)
export function scrollToDomainGrid(){
  const el = document.querySelector('.section-label');
  if(el) el.scrollIntoView({ behavior:'smooth', block:'start' });
}
export function scrollToPackageCard(){
  const el = document.getElementById('pkg-flow');
  if(el) el.scrollIntoView({ behavior:'smooth', block:'start' });
}
export function setupHome(){
  onMagazinesRendered(renderMagazineCarousel);
  document.getElementById('notify-subscribe-btn').addEventListener('click', subscribeNotify);
  document.getElementById('notify-phone').addEventListener('keydown', e=>{ if(e.key === 'Enter') subscribeNotify(); });
  document.querySelectorAll('[data-home-scroll]').forEach(b=>b.addEventListener('click', ()=>{
    if(b.dataset.homeScroll === 'package') scrollToPackageCard(); else scrollToDomainGrid();
  }));
}

