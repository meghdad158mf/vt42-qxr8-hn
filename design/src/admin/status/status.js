// صفحه‌ی «وضعیت سامانه»: اجرای همه‌ی بررسی‌ها، خلاصه‌ی بالای صفحه و «اجرای دستی» هر کار
import { api } from '../../core/api.js';
import { authToken, currentRole } from '../../core/session.js';
import { newsRelTime } from '../../core/date.js';
import { renderSysAlerts, renderSysClientErrors } from './alerts.js';
import { renderSysCapacity, renderSysStorage } from './storage.js';
import { renderSysLogins, renderSysStale, renderSysTokens } from './logins.js';
import { renderSysServices } from './services.js';
import { renderSysSummary } from './summary.js';
import { showToast } from '../../ui/toast.js';
import { SUPABASE_URL } from '../../core/config.js';
import { SYS_STATUS_JOBS, renderSysTimeline, sysFetchGithubRuns, sysGithubLine } from './jobs.js';

// auto=true: رفرش دقیقه‌ای یا بعد از «اجرای دستی» — سرویس‌های مرتبط (که لیارا و
// سایت‌های بیرونی رو صدا می‌زنن) فقط با باز کردن صفحه یا «به‌روزرسانی همه» بررسی می‌شن
export async function renderSystemStatus(auto){
  const wrap = document.getElementById('sys-status-list');
  if(!wrap) return;
  renderSysTokens();
  const parts = [renderSysStorage(), renderSysStale(), renderSysLogins(), renderSysClientErrors()];
  if(auto !== true) parts.push(renderSysAlerts());
  if(auto !== true) parts.push(renderSysServices(), renderSysCapacity());
  renderSysSummary(true);
  renderSysTimeline();
  wrap.innerHTML = SYS_STATUS_JOBS.map(j=>`<div class="sys-status-item"><span class="sys-status-dot"></span><div><div class="sys-status-name">${j.name}</div><div class="sys-status-when">در حال بررسی…</div></div></div>`).join('');
  const ghPromise = sysFetchGithubRuns();
  const results = await Promise.all(SYS_STATUS_JOBS.map(async j=>{
    try{
      const extra = j.extra ? j.extra().catch(()=>'') : Promise.resolve('');
      if(j.custom) return Object.assign(await j.custom(), { extra: await extra });
      const r = await api(j.path);
      if(!r.ok) return { err:true };
      const rows = await r.json();
      return { at: rows[0] ? rows[0][j.col] : null, extra: await extra };
    }catch(e){ return { err:true }; }
  }));
  const ghRuns = await ghPromise;
  renderSysTimeline();
  wrap.innerHTML = SYS_STATUS_JOBS.map((j,i)=>{
    const res = results[i];
    let cls = '', when;
    // درخواست اجرای دستی تا وقتی خروجی تازه‌تر از زمان درخواست نیومده «در حال اجرا»ست
    // (برای پاک‌سازی که خروجی زمان‌دار نداره، از زمان آخرین اجرای گیت‌هاب)؛ یا تا وقتی
    // گیت‌هاب اجرای بعد از درخواست رو «تموم‌شده» (موفق یا ناموفق) گزارش نده — وگرنه
    // اجرای ناموفق که خروجی نمی‌ده دکمه رو ۲۰ دقیقه قفل نگه می‌داشت
    const reqAt = JOB_REQUESTED_AT[j.job];
    const run = ghRuns ? ghRuns[j.job] : null;
    const doneAt = res.at || (j.custom && run && run.status === 'completed' ? run.created_at : null);
    const runFinishedAfterReq = run && run.status === 'completed' && new Date(run.created_at).getTime() > reqAt - 60000;
    const pending = reqAt && (Date.now() - reqAt < 20*60000) && !runFinishedAfterReq && !(doneAt && new Date(doneAt).getTime() > reqAt);
    if(!pending) delete JOB_REQUESTED_AT[j.job];
    if(res.err){ when = 'خطا در دریافت وضعیت'; }
    else if(j.custom){ cls = res.cls; when = res.when; }
    else if(!res.at){ cls = 'bad'; when = 'هنوز هیچ خروجی ثبت نشده'; }
    else{
      const hours = (Date.now() - new Date(res.at).getTime()) / 3600000;
      cls = hours >= j.bad ? 'bad' : hours >= j.warn ? 'warn' : 'ok';
      when = 'آخرین خروجی: ' + newsRelTime(res.at);
    }
    const gh = sysGithubLine(run);
    if(gh.cls === 'bad') cls = 'bad';
    const runBtn = currentRole === 'app_admin'
      ? `<button type="button" class="sys-run-btn" data-job="${j.job}" ${pending ? 'disabled' : ''}>${pending ? 'در حال اجرا…' : 'اجرای دستی'}</button>` : '';
    const logBtn = currentRole === 'app_admin' && run ? `<button type="button" class="sys-run-btn sys-log-btn" data-log="${j.job}">مشاهده‌ی گزارش</button>` : '';
    return `<div class="sys-status-item ${cls}"><span class="sys-status-dot"></span><div class="sys-status-body"><div class="sys-status-name">${j.name}</div><div class="sys-status-when">${when}</div>${res.extra ? `<div class="sys-extra">${res.extra}</div>` : ''}<div class="sys-gh ${gh.cls}">${gh.text}</div><div class="sys-status-exp">زمان‌بندی: ${j.exp}</div><div class="sys-btn-row">${runBtn}${logBtn}</div></div></div>`;
  }).join('');
  await Promise.all(parts.map(x=>Promise.resolve(x).catch(()=>{})));
  renderSysSummary();
  // تا وقتی اجرایی در جریانه، هر دقیقه (فقط اگه همچنان توی همین صفحه باشیم) دوباره چک کن
  clearTimeout(SYS_STATUS_TIMER);
  if(Object.keys(JOB_REQUESTED_AT).length){
    SYS_STATUS_TIMER = setTimeout(()=>{
      if(document.getElementById('sec-status').classList.contains('active')) renderSystemStatus(true);
    }, 60000);
  }
}
export const JOB_REQUESTED_AT = {};
export let SYS_STATUS_TIMER = null;
// از طریق Edge Function run-job (توکن گیت‌هاب فقط سمت سرور، فقط مدیر)
export async function runJobManually(job, btn){
  btn.disabled = true; btn.textContent = 'در حال ارسال…';
  try{
    const r = await fetch(SUPABASE_URL + '/functions/v1/run-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ job }),
    });
    if(!r.ok) throw new Error('run-job ' + r.status);
    JOB_REQUESTED_AT[job] = Date.now();
    showToast('درخواست اجرا ثبت شد؛ معمولاً ۱ تا ۵ دقیقه طول می‌کشد');
    renderSystemStatus(true);
  }catch(e){
    console.error(e);
    showToast('اجرای دستی ناموفق بود');
    btn.disabled = false; btn.textContent = 'اجرای دستی';
  }
}
export function setupSystemStatus(){
  document.addEventListener('click', e=>{
    const b = e.target.closest('.sys-run-btn:not(.sys-log-btn)');
    if(b && !b.disabled) runJobManually(b.dataset.job, b);
  });
}

