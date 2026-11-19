// ستون ثابت کناری رایانه‌ی پهن (۵.۳۸.۰، خواست کاربر: «هدر و فوتر در ستون بیاید؛ ستون باز شود تا تقریباً
// تمام صفحه و جزئیات لازم را نشان دهد»)
// روی ≥۱۲۸۰px خودِ ابزارهای نوار بالا (.topbar-right) و فوتر (.app-footer) به جای خالی‌شان در ستون
// جابه‌جا می‌شوند — کپی نه، تا idها و listenerها همان بمانند (مثل placeNewsStudyPanel)؛ در پهنای کمتر
// به جای اصلی‌شان (نشانگر comment) برمی‌گردند.
// «نمایش کامل»: ستون همان‌طور می‌ماند و پنل روشن #sn-detail کنارش تا تقریباً تمام صفحه باز می‌شود (صفحه
// دو رنگ — خواست کاربر)؛ هر بخش با توضیح و همه‌ی زیرتب‌ها. بستن با همان دکمه، ×، Esc، کلیک روی پس‌زمینه یا
// رفتن به یک بخش. رفتن و پررنگ کردن جای فعلی در ui/menus.js.

const MQ = window.matchMedia('(min-width:1280px)');
const MOVES = [];   // [عنصر، جای ستون، نشانگر جای اصلی]
let SIDE = null, BTN = null, BACKDROP = null, DETAIL = null;

function place(){
  for(const [node, slot, marker] of MOVES){
    if(MQ.matches){ if(node.parentNode !== slot) slot.appendChild(node); }
    else if(node.parentNode === slot) marker.parentNode.insertBefore(node, marker);
  }
  if(!MQ.matches) setSideWide(false);
}
function track(sel, slotId){
  const node = document.querySelector(sel), slot = document.getElementById(slotId);
  if(!node || !slot) return;
  const marker = document.createComment('side-nav:' + slotId);
  node.parentNode.insertBefore(marker, node);
  MOVES.push([node, slot, marker]);
}

export function setSideWide(on){
  if(!SIDE) return;
  on = !!on && MQ.matches;
  SIDE.classList.toggle('is-wide', on);
  BACKDROP.hidden = !on;
  DETAIL.hidden = !on;
  document.documentElement.classList.toggle('sn-wide-open', on);  // اسکرول صفحه‌ی پشت قفل
  const label = on ? 'بستن نمایش کامل' : 'نمایش کامل بخش‌ها';
  BTN.setAttribute('aria-expanded', on ? 'true' : 'false');
  BTN.setAttribute('aria-label', label);
  BTN.title = label;
  if(on) DETAIL.scrollTop = 0;
}

export function setupSideNav(){
  SIDE = document.getElementById('side-nav');
  BTN = document.getElementById('sn-toggle');
  BACKDROP = document.getElementById('sn-backdrop');
  DETAIL = document.getElementById('sn-detail');
  if(!SIDE || !BTN || !BACKDROP || !DETAIL) return;
  track('#view-dash .topbar-right', 'sn-tools');
  track('#view-dash .app-footer', 'sn-foot');
  place();
  MQ.addEventListener('change', place);
  BTN.addEventListener('click', ()=>setSideWide(!SIDE.classList.contains('is-wide')));
  BACKDROP.addEventListener('click', ()=>setSideWide(false));
  document.getElementById('snd-close')?.addEventListener('click', ()=>setSideWide(false));
  DETAIL.addEventListener('click', e=>{ if(e.target.closest('button[data-nav], .snd-issue')) setSideWide(false); });
  // رفتن به یک بخش یا باز کردن یک شماره‌ی بسته = بستن نمای کامل (منوی «مدیریت» و «نمای سایت» نه)
  SIDE.addEventListener('click', e=>{
    if(e.target.closest('.sn-list button, .sn-brand, [data-admin-go]')) setSideWide(false);
  });
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && SIDE.classList.contains('is-wide')) setSideWide(false);
  });
}
