// اسکرول: برگشت به ابتدای فهرست، دکمه‌ی «بالای صفحه» (#to-top)

// صفحه‌ی بعد/قبل فهرست: برگشت به ابتدای فهرست. ⚠️ scrollIntoView روی تب‌بار جواب نمی‌ده —
// تب‌بار sticky‌ه و مرورگر اون رو «همین الان دیده می‌شه» حساب می‌کرد، پس کاربر ته صفحه‌ی جدید می‌موند
export function scrollToListTop(el){
  if(!el) return;
  const bar = document.querySelector('.section.active .news-page-tabs');
  const barH = bar ? bar.getBoundingClientRect().height : 0;
  const y = el.getBoundingClientRect().top + window.scrollY - barH - 12;
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
}
// دکمه‌ی «بالای صفحه» (۵.۲۰.۰) — به‌روزرسانی فقط یک‌بار در هر فریم
const TO_TOP_EL = document.getElementById('to-top');
let TO_TOP_RAF = 0;
export function updateToTop(){
  TO_TOP_RAF = 0;
  const show = window.scrollY > window.innerHeight * 1.5;
  TO_TOP_EL.classList.toggle('show', show);
  if(!show) return;
  const ann = document.getElementById('ann-bar');
  const lift = (window.innerWidth <= 640 && ann && ann.childElementCount) ? ann.offsetHeight + 26 : 0;
  TO_TOP_EL.style.bottom = lift ? lift + 'px' : '';
}
export function scrollToPageTop(){
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top:0, behavior: reduce ? 'auto' : 'smooth' });
}
export function setupToTop(){
  TO_TOP_EL.addEventListener('click', scrollToPageTop);
  window.addEventListener('scroll', ()=>{ if(!TO_TOP_RAF) TO_TOP_RAF = requestAnimationFrame(updateToTop); }, { passive:true });
  window.addEventListener('resize', ()=>{ if(!TO_TOP_RAF) TO_TOP_RAF = requestAnimationFrame(updateToTop); }, { passive:true });
}

