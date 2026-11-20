// ستون ثابت کناری رایانه‌ی پهن (۵.۳۸.۰، خواست کاربر: «هدر و فوتر در ستون بیاید»)
// روی ≥۱۲۸۰px خودِ ابزارهای نوار بالا (.topbar-right) و فوتر (.app-footer) به جای خالی‌شان در ستون
// جابه‌جا می‌شوند — کپی نه، تا idها و listenerها همان بمانند (مثل placeNewsStudyPanel)؛ در پهنای کمتر
// به جای اصلی‌شان (نشانگر comment) برمی‌گردند.
// پنل «نمایش کامل» (۵.۳۸.۰) در ۵.۴۰.۰ به خواست کاربر حذف شد. رفتن و پررنگ کردن جای فعلی در ui/menus.js.

const MQ = window.matchMedia('(min-width:1280px)');
const MOVES = [];   // [عنصر، جای ستون، نشانگر جای اصلی]
let SIDE = null;

// ۵.۴۰.۰ (خواست کاربر): تیترهای ستون باز و بسته می‌شوند — هم‌زمان فقط یکی باز (تا ستون اسکرول نخورد)؛
// رفتن به یک بخش زیرمجموعه‌های همان بخش را باز می‌کند (updateSideNavCurrent در ui/menus.js)
export function expandSideGroup(key){
  if(!SIDE) SIDE = document.getElementById('side-nav');
  SIDE?.querySelectorAll('.sn-group').forEach(g=>{
    const on = !!key && g.dataset.sn === key && !!g.querySelector('.sn-exp');
    g.classList.toggle('is-exp', on);
    g.querySelector('.sn-exp')?.setAttribute('aria-expanded', on ? 'true' : 'false');
  });
}
// «ارتباط با ما» و «درباره‌ی سامانه»: پنجره‌ی کوچک کنار ستون (هم‌زمان یکی)
function setPop(id){
  [['sn-contact','sn-contact-btn'], ['sn-foot','sn-info-btn']].forEach(([pid, bid])=>{
    const pop = document.getElementById(pid), b = document.getElementById(bid);
    if(!pop || !b) return;
    const on = pid === id && MQ.matches;
    pop.hidden = !on;
    b.setAttribute('aria-expanded', on ? 'true' : 'false');
    b.classList.toggle('is-on', on);
  });
}

function place(){
  for(const [node, slot, marker] of MOVES){
    if(MQ.matches){ if(node.parentNode !== slot) slot.appendChild(node); }
    else if(node.parentNode === slot) marker.parentNode.insertBefore(node, marker);
  }
  if(!MQ.matches) setPop(null);
}
function track(sel, slotId){
  const node = document.querySelector(sel), slot = document.getElementById(slotId);
  if(!node || !slot) return;
  const marker = document.createComment('side-nav:' + slotId);
  node.parentNode.insertBefore(marker, node);
  MOVES.push([node, slot, marker]);
}

export function setupSideNav(){
  SIDE = document.getElementById('side-nav');
  if(!SIDE) return;
  track('#view-dash .topbar-right', 'sn-tools');
  track('#home-contact', 'sn-contact');
  track('#view-dash .app-footer', 'sn-foot');
  place();
  MQ.addEventListener('change', place);
  // فلش تیترها و دو دکمه‌ی پنجره‌ی کوچک
  SIDE.addEventListener('click', e=>{
    const exp = e.target.closest('.sn-exp');
    if(exp){
      const g = exp.closest('.sn-group');
      expandSideGroup(g.classList.contains('is-exp') ? null : g.dataset.sn);
      return;
    }
    const dock = e.target.closest('#sn-contact-btn, #sn-info-btn');
    if(dock){
      const id = dock.getAttribute('aria-controls');
      setPop(document.getElementById(id).hidden ? id : null);
      return;
    }
    if(e.target.closest('.app-footer-intro')) setPop(null);
  });
  // کلیک بیرون از پنجره‌ی کوچک و دکمه‌اش = بستن
  document.addEventListener('click', e=>{
    if(!e.target.closest('.sn-pop, #sn-contact-btn, #sn-info-btn')) setPop(null);
  });
  document.addEventListener('keydown', e=>{
    if(e.key !== 'Escape') return;
    setPop(null);
  });
}
