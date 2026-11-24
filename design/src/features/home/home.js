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
// ۵.۳۵.۰ (انتخاب کاربر): «شماره‌ی تازه» با جلد بزرگ در مرکز + ردیف ۴ شماره‌ی قبلی، به‌جای جلدها روی قوس.
// ترتیب همان ترتیب مدیر در MAGAZINES است (اولی = تازه‌ترین). شماره‌ی بی‌فایل باز نمی‌شود.
const issueLabel = (m) => m.issue_no ? 'شماره ' + toFaDigits(String(m.issue_no)) : faTitle(m.title);
const coverHtml = (m) => m.cover_url
  ? `<img src="${escAttr(m.cover_url)}" alt="${escAttr(m.title || '')}" draggable="false" data-no-menu />`
  : (m.file_type === 'images' ? ICONS.photo : ICONS.doc);
export function renderMagazineCarousel(){
  const wrap = document.getElementById('pkg-covers');
  if(!wrap) return;
  wrap.innerHTML = '';
  if(!MAGAZINES.length){
    wrap.innerHTML = '<div class="pkg-spot-empty">هنوز شماره‌ای بارگذاری نشده.</div>';
    return;
  }
  const [m, ...prev] = MAGAZINES;
  const files = Array.isArray(m.files) ? m.files : [];
  const open = (x) => { if(Array.isArray(x.files) && x.files.length) openMagazineViewer(x); };
  const meta = [m.publish_date ? new Date(m.publish_date).toLocaleDateString('fa-IR', { day:'numeric', month:'long', year:'numeric' }) : '',
    m.file_type === 'images' && files.length ? toFaDigits(files.length) + ' صفحه' : ''].filter(Boolean).join('، ');
  // عنوان شماره فقط وقتی چیزی بیش از «بسته تحلیلی جریان — شماره N» بگوید
  const sub = m.issue_no && m.title && faTitle(m.title) !== issueLabel(m) && !/بسته\s*(ی\s*)?تحلیلی\s*جریان/.test(m.title) ? faTitle(m.title) : '';
  wrap.innerHTML = `<div class="pkg-spot">
      <button type="button" class="pkg-spot-cover" aria-label="مطالعه‌ی ${escAttr(issueLabel(m))}">${coverHtml(m)}</button>
      <div class="pkg-spot-info"><span class="pkg-spot-eyebrow">شماره‌ی تازه</span>
        <h3>بسته تحلیلی جریان — ${escHtml(issueLabel(m))}</h3>
        ${meta ? `<div class="pkg-spot-meta">${escHtml(meta)}</div>` : ''}
        ${sub ? `<p class="pkg-spot-sub">${escHtml(sub)}</p>` : ''}
        <div class="pkg-spot-btns"><button type="button" class="p pkg-spot-read"${files.length ? '' : ' disabled'}>مطالعه‌ی این شماره</button></div>
      </div></div>
    ${prev.length ? `<div class="pkg-prev"><div class="pkg-prev-lb">شماره‌های قبلی</div><div class="pkg-prev-row">${prev.slice(0, 4).map((x, i) =>
      `<button type="button" class="pkg-prev-it" data-prev="${i}"><span class="pkg-prev-cv">${coverHtml(x)}</span><span><b>${escHtml(issueLabel(x))}</b><small>مطالعه ←</small></span></button>`).join('')}</div></div>` : ''}`;
  wrap.querySelector('.pkg-spot-cover').addEventListener('click', () => open(m));
  wrap.querySelector('.pkg-spot-read').addEventListener('click', () => open(m));
  wrap.querySelectorAll('.pkg-prev-it').forEach(b => b.addEventListener('click', () => open(prev[Number(b.dataset.prev)])));
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
  // واگذاری روی سند: دکمه‌های اسکرول هرو (hero-slider.js) بعد از بارگذاری داده ساخته می‌شوند
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-home-scroll]');
    if(!b) return;
    if(b.dataset.homeScroll === 'package') scrollToPackageCard(); else scrollToDomainGrid();
  });
}

