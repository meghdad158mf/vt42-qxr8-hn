// بارگذاری تنبل کتابخانه‌های بزرگ (Chart.js، html2canvas، jsPDF) فقط وقتی لازم شدن —
// تا ~۷۶۰KB از بارگذاری اول سایت (به‌خصوص روی اینترنت موبایل) کم بشه. همه از design/vendor/،
// عمداً نه CDN: خیلی از افزونه‌های ad-blocker هر اسکریپتی با کلمه‌ی «chart» توی آدرسش رو
// (حتی از cdnjs) بی‌صدا مسدود می‌کنن؛ فایل محلی از همون دامنه‌ی خودِ سایت این مشکل رو نداره.
const SCRIPT_LOADS = {};
export function loadScriptOnce(src){
  if(!SCRIPT_LOADS[src]){
    SCRIPT_LOADS[src] = new Promise(resolve=>{
      const el = document.createElement('script');
      el.src = src;
      el.onload = ()=> resolve(true);
      el.onerror = ()=> resolve(false);
      document.head.appendChild(el);
    });
  }
  return SCRIPT_LOADS[src];
}
// کتابخانه قبلاً درخواست شده؟ (حتی اگه هنوز نرسیده)
export function scriptRequested(src){ return !!SCRIPT_LOADS[src]; }
