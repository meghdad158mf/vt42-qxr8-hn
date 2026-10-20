// دکمه‌ی «برگشت» مرورگر/گوشی و آدرس هر بخش (#بخش/تب/کانال)
// بخش‌ها و تب‌ها فقط با عوض‌شدن کلاس روی همین صفحه جابه‌جا می‌شن (ناوبری واقعی
// نیست)، پس بدون این بخش «برگشت» کلاً از سایت بیرون می‌رفت. هر جابه‌جایی
// (بخش، تب، فید یه کانال در «یادداشت‌ها»، تب «بارگذاری محتوا») یه ورودی تاریخچه
// با آدرس #بخش/تب/کانال می‌سازه؛ «برگشت» همون حالت + جای اسکرول رو برمی‌گردونه.
// هر تابع ناوبری اول navMark() صدا می‌زنه؛ ثبت واقعی بعد از تموم‌شدن همون
// کار انجام می‌شه (setTimeout) تا switchSection + setNewsPageTab پشت‌سرهم
// یه ورودی بشن. پنجره‌های روی صفحه (عکس/فیلم، ویرایش منبع و...) هم یه ورودی
// دارن تا «برگشت» روی گوشی اول پنجره رو ببنده.
// این ماژول فقط سازوکار تاریخچه‌ست؛ «حالت فعلی چیه» و «برگشت به یه حالت» رو
// خودِ برنامه با startRouter می‌ده (navCurrentState/navApply در app.js).

let READY = false, TIMER = null, PENDING_Y = null, RESTORING = false, MODAL_OPEN = false;
const HOOKS = { current: null, isActive: ()=>false, onEnter: ()=>{}, onPop: ()=>{} };

export function navMark(){
  if(!READY) return;
  if(PENDING_Y === null) PENDING_Y = window.scrollY;
  if(!TIMER) TIMER = setTimeout(navFlush, 0);
}
// ورود/رفرش/برگشت: ثبت بعدی جایگزین ورودی فعلی می‌شه، نه یه ورودی تازه
export function navRestoring(){ RESTORING = true; }

function navFlush(){
  TIMER = null;
  const y = PENDING_Y; PENDING_Y = null;
  const restoring = RESTORING; RESTORING = false;
  if(!HOOKS.isActive()) return;
  const st = HOOKS.current();
  HOOKS.onEnter(st);
  const cur = history.state;
  try{
    if(restoring || !cur || !cur.jarian){
      if(!cur || cur.key !== st.key) history.replaceState(st, '', '#' + st.key);
      return;
    }
    if(cur.key === st.key) return;
    history.replaceState(Object.assign({}, cur, { y }), '');
    history.pushState(st, '', '#' + st.key);
  }catch(e){}
}

// current() → حالت فعلی { jarian:1, key, ... }؛ isActive() → داشبورد باز است؛
// onEnter(st) بعد از هر ثبت (آمار بازدید)؛ onPop(state) برای «برگشت» (بعد از بستن پنجره‌ها)
export function startRouter(hooks){
  Object.assign(HOOKS, hooks);
  window.addEventListener('popstate', e=>{
    // اول پنجره‌ی باز (عکس/فیلم، ویرایش منبع...) بسته می‌شه، نه خودِ بخش
    if(MODAL_OPEN){
      MODAL_OPEN = false;
      document.querySelectorAll('.modal-overlay.active .modal-close').forEach(b=>b.click());
      return;
    }
    HOOKS.onPop(e.state);
  });
  // پنجره‌ها: باز شدن = یه ورودی اضافه؛ بستن با × یا کلیک بیرون = مصرف همون ورودی
  document.querySelectorAll('.modal-overlay').forEach(ov=>{
    new MutationObserver(()=>{
      const anyOpen = !!document.querySelector('.modal-overlay.active');
      if(anyOpen && !MODAL_OPEN){
        MODAL_OPEN = true;
        try{ history.pushState(Object.assign({}, history.state, { modal:1 }), ''); }catch(e){}
      }else if(!anyOpen && MODAL_OPEN){
        MODAL_OPEN = false;
        if(history.state && history.state.modal) history.back();
      }
    }).observe(ov, { attributes:true, attributeFilter:['class'] });
  });
  READY = true;
}

// برگشت به جای اسکرول قبل از رفرش. عکس‌ها/کاروسل‌ها تا چند ثانیه بعد ارتفاع
// صفحه رو عوض می‌کنن و مرورگر اسکرول رو جابه‌جا می‌کنه؛ پس تا ۳ ثانیه با هر
// تغییر ارتفاع دوباره همون y اعمال می‌شه — مگر کاربر خودش اسکرول کرده باشه
export function restoreScrollY(y){
  let userMoved = false;
  const stop = ()=>{ userMoved = true; };
  const evs = ['wheel','touchstart','keydown','mousedown'];
  evs.forEach(e=>window.addEventListener(e, stop, { once:true, passive:true }));
  const apply = ()=>{ if(!userMoved) window.scrollTo(0, y); };
  requestAnimationFrame(apply);
  const ro = new ResizeObserver(apply);
  ro.observe(document.body);
  setTimeout(()=>{ ro.disconnect(); evs.forEach(e=>window.removeEventListener(e, stop)); }, 3000);
}
