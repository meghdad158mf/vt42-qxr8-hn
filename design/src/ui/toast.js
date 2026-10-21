// پیام کوتاه پایین صفحه — زمان نمایش به اندازه‌ی متن (پیام‌های بلندِ قبلاً alert هم اینجا میان)
let TOAST_TIMER = null;
export function showToast(msg, ms){
  const t=document.getElementById('toast');
  if(msg) t.textContent = msg;
  t.classList.add('show');
  clearTimeout(TOAST_TIMER);
  TOAST_TIMER = setTimeout(()=>t.classList.remove('show'), ms || Math.min(7000, Math.max(2200, (t.textContent || '').length * 55)));
}

