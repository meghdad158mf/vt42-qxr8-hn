// ثبت خودکار خطاهای مرورگر کاربران — اولین ماژولی که اجرا می‌شه (main.js) تا خطاهای راه‌اندازی هم ثبت بشن
import { SUPABASE_URL, SUPABASE_ANON_KEY, APP_VERSION } from './config.js';
import { authToken } from './session.js';

// (۵.۲۵.۰، migration_043)
// خطاهای جاوااسکریپت، promiseهای ردشده، هر console.error و پاسخ‌های ۵xx سرور → RPC
// log_client_error. هر متن خطا در هر زبانه یک‌بار (پس شمارش سمت سرور = تعداد نشست‌ها)،
// حداکثر ۲۰ در ساعت؛ آدرس‌ها بدون query (ممکنه عبارت جست‌وجو داشته باشن)؛ متن پست/رمز
// هیچ‌جا فرستاده نمی‌شه. با fetch خام (نه api()) تا خطای خودش دوباره ثبت نشه.
const CLIENT_ERR_SENT = new Set();
let CLIENT_ERR_TIMES = [];
// جای فعلی کاربر و نام دستگاه از خودِ برنامه می‌آد (setErrorContext در app.js)
const CONTEXT = { place: ()=>'', device: ()=>'' };
export function setErrorContext(ctx){ Object.assign(CONTEXT, ctx); }
export function reportClientError(msg){
  try{
    if(!authToken) return;
    msg = String(msg || '').replace(/https?:\/\/[^\s'"]+/g, u=>u.split('?')[0]).replace(/\s+/g, ' ').trim().slice(0, 300);
    if(!msg || CLIENT_ERR_SENT.has(msg)) return;
    if(/ResizeObserver loop|^Script error\.?$|AbortError|aborted/i.test(msg)) return;
    const now = Date.now();
    CLIENT_ERR_TIMES = CLIENT_ERR_TIMES.filter(t=>now - t < 3600000);
    if(CLIENT_ERR_TIMES.length >= 20) return;
    CLIENT_ERR_SENT.add(msg); CLIENT_ERR_TIMES.push(now);
    let ver = APP_VERSION, place = '', device = '';
    try{ place = CONTEXT.place(); }catch(e){}
    try{ device = CONTEXT.device(); }catch(e){}
    fetch(SUPABASE_URL + '/rest/v1/rpc/log_client_error', {
      method:'POST', keepalive:true,
      headers:{ apikey: SUPABASE_ANON_KEY, 'Content-Type':'application/json', Authorization:'Bearer ' + authToken },
      body: JSON.stringify({ p_msg: msg, p_place: place, p_version: ver, p_device: device }),
    }).catch(()=>{});
  }catch(e){}
}
window.addEventListener('error', e=>reportClientError((e.error && e.error.message) || e.message));
window.addEventListener('unhandledrejection', e=>{ const r = e.reason; reportClientError(r && r.message ? r.message : String(r)); });
(function(){
  const orig = console.error.bind(console);
  console.error = function(...args){
    orig(...args);
    try{
      const err = args.find(x=>x instanceof Error);
      const label = typeof args[0] === 'string' ? args[0] : '';
      reportClientError(err ? (label ? label + ': ' : '') + err.message : args.map(x=>typeof x === 'string' ? x : (x && x.message) || '').join(' '));
    }catch(e){}
  };
})();
