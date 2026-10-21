// «وضعیت سامانه ← سرویس‌های مرتبط»: سوپابیس از مرورگر، بقیه از سمت سرور با run-job {action:health}
import { api } from '../../core/api.js';
import { authToken } from '../../core/session.js';
import { escAttr, faNum, toFaDigits } from '../../core/text.js';
import { SUPABASE_URL } from '../../core/config.js';

// «سرویس‌های مرتبط»: سه‌تای اول از همین مرورگر چک می‌شن، بقیه از سمت سرور
// (run-job با action:'health') — چون کلید لیارا و توکن گیت‌هاب فقط اونجان و
// مرورگر به‌خاطر CORS نمی‌تونه سایت‌های منبع رو مستقیم چک کنه.
export const SYS_SERVICES = [
  { key:'db',       name:'پایگاه داده (سوپابیس)',   use:'همه‌ی مطالب، منابع و تنظیمات سایت', slow:3000, group:'infra' },
  { key:'storage',  name:'فضای فایل (سوپابیس)',     use:'عکس‌ها، روزنامه‌ها، مجلات و فایل‌ها', slow:3000, group:'infra' },
  { key:'functions',name:'تابع‌های سرور (سوپابیس)',  use:'ترجمه، هوش مصنوعی و اجرای دستی کارها', slow:8000, group:'infra' },
  { key:'liara',    name:'هوش مصنوعی لیارا',        use:'ترجمه، کلیدواژه‌ها و تحلیل «در یک نگاه»', slow:8000, group:'proc' },
  { key:'github',   name:'گیت‌هاب (کارهای خودکار)', use:'اجرای زمان‌بندی‌شده‌ی جمع‌آوری و تحلیل‌ها', slow:5000, group:'proc' },
  { key:'eitaa',    name:'ایتا',                    use:'جمع‌آوری پست‌های کانال‌های ایتا', slow:6000, group:'src' },
  { key:'telegram', name:'تلگرام',                  use:'جمع‌آوری پست‌های کانال‌های تلگرام', slow:6000, group:'src' },
  { key:'bale',     name:'بله',                     use:'ادعاها و شایعات (کانال رصد شایعات)', slow:6000, group:'src' },
  { key:'jaaar',    name:'جار (کیوسک روزنامه)',      use:'صفحه‌ی اول روزنامه‌ها', slow:6000, group:'src' },
];
export const SYS_SERVICE_GROUPS = [
  { key:'infra', name:'زیرساخت سایت' },
  { key:'proc',  name:'پردازش و کارهای خودکار' },
  { key:'src',   name:'منابع جمع‌آوری' },
];
export function sysSvcTime(ms){
  return ms < 1000 ? toFaDigits(String(ms)) + ' میلی‌ثانیه' : toFaDigits((ms/1000).toFixed(1)) + ' ثانیه';
}
export async function sysTimed(fn){
  const t0 = performance.now();
  try{
    const r = await fn();
    return { ok: r.ok, status: r.status, ms: Math.round(performance.now() - t0) };
  }catch(e){ return { ok:false, status:0, ms: Math.round(performance.now() - t0), detail: String(e) }; }
}
export async function renderSysServices(){
  const el = document.getElementById('sys-services');
  if(!el) return;
  el.innerHTML = sysServicesHtml(null);
  let healthData = null;
  const healthP = sysTimed(()=>fetch(SUPABASE_URL + '/functions/v1/run-job', {
    method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + authToken },
    body: JSON.stringify({ action:'health' }),
  }).then(async r=>{ if(r.ok){ try{ healthData = (await r.json()).services; }catch(e){} } return r; }));
  const [db, storage, fnRes] = await Promise.all([
    sysTimed(()=>api('/categories?select=id&limit=1')),
    // شیء ناموجود: ۴۰۰/۴۰۴ یعنی سرویس فایل جواب داده؛ فقط ۵xx یا قطعی ارتباط خطاست
    sysTimed(()=>fetch(SUPABASE_URL + '/storage/v1/object/public/channel-avatars/__jarian_ping__').then(r=>({ ok: r.status < 500, status: r.status }))),
    healthP,
  ]);
  const results = { db, storage, functions: fnRes };
  if(healthData) Object.assign(results, healthData);
  el.innerHTML = sysServicesHtml(results);
}
// نمای «سرویس‌های مرتبط»: خلاصه‌ی بالا + سه گروه با ردیف‌های فشرده و نوار زمان پاسخ
// (عمداً متفاوت از کارت‌های «کارهای خودکار»). results=null یعنی «در حال بررسی».
export function sysServicesHtml(results){
  const rows = SYS_SERVICES.map(s=>{
    if(!results) return { s, cls:'', pill:'…', note:'در حال بررسی', pct:0 };
    const r = results[s.key];
    let cls, pill, note = s.use;
    if(!r){ cls = ''; pill = 'نامعلوم'; note = 'تابع‌های سرور پاسخ ندادند'; }
    else if(!r.ok){
      cls = 'bad';
      pill = r.detail === 'timeout' ? 'بی‌پاسخ' : r.status ? 'خطای ' + toFaDigits(String(r.status)) : 'قطع';
      if(r.detail === 'timeout') note = 'بیش از ۱۲ ثانیه جواب نداد';
    }else{
      cls = r.ms >= s.slow ? 'warn' : 'ok';
      pill = sysSvcTime(r.ms);
    }
    if(s.key === 'github' && r && r.ok && typeof r.remaining === 'number') note += '، سهمیه‌ی باقی‌مانده: ' + faNum(r.remaining);
    // نوار: زمان پاسخ نسبت به ۱.۵ برابر آستانه‌ی کُندی؛ خطا = پر و قرمز
    const pct = !r ? 0 : !r.ok ? 100 : Math.max(4, Math.min(100, r.ms / (s.slow * 1.5) * 100));
    const tip = r && r.detail && r.detail !== 'timeout' ? r.detail : '';
    return { s, cls, pill, note, pct, tip };
  });
  let head;
  if(!results){
    head = '<div class="svc-summary"><span class="svc-summary-num">…</span><span class="svc-summary-text">در حال بررسی سرویس‌ها</span></div>';
  }else{
    const ok = rows.filter(x=>x.cls === 'ok').length, warn = rows.filter(x=>x.cls === 'warn').length, bad = rows.filter(x=>x.cls === 'bad').length;
    const cls = bad ? 'bad' : warn ? 'warn' : ok === rows.length ? 'ok' : '';
    const text = bad ? faNum(bad) + ' سرویس قطع یا دچار خطاست' : warn ? faNum(warn) + ' سرویس کُند پاسخ می‌دهد' : ok === rows.length ? 'همه‌ی سرویس‌ها در دسترس‌اند' : 'وضعیت برخی سرویس‌ها نامعلوم است';
    head = `<div class="svc-summary ${cls}"><span class="svc-summary-num">${faNum(ok)}<small> از ${faNum(rows.length)}</small></span><span class="svc-summary-text">${text}</span></div>`;
  }
  return head + '<div class="svc-groups">' + SYS_SERVICE_GROUPS.map(g=>`<div class="svc-group"><div class="svc-group-title">${g.name}</div>${rows.filter(x=>x.s.group === g.key).map(x=>`<div class="svc-row ${x.cls}"${x.tip ? ` title="${escAttr(x.tip)}"` : ''}><span class="svc-dot"></span><div class="svc-main"><div class="svc-name">${x.s.name}</div><div class="svc-note">${x.note}</div><div class="svc-meter"><span style="width:${x.pct.toFixed(0)}%"></span></div></div><span class="svc-pill">${x.pill}</span></div>`).join('')}</div>`).join('') + '</div>';
}

