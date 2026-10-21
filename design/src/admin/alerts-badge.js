// نشانگرهای هشدار منوی «مدیریت»: موارد وضعیت سامانه (با «دیده شد») و نظرهای جدید کاربران
import { api, fetchExactCount } from '../core/api.js';
import { authToken, currentRole } from '../core/session.js';
import { faNum, toFaDigits } from '../core/text.js';
import { FEEDBACK_LIST } from './feedback.js';
import { newsRelTime } from '../core/date.js';
import { STORAGE_LIMIT_MB, SYS_STATUS_JOBS, SYS_TOKENS } from './status/jobs.js';

// ---- نشانگرهای هشدار منوی «مدیریت» ----
// فقط برای مدیر، ۲ ثانیه بعد از ورود و بعد هر ۱۵ دقیقه. عمداً سبک: همون
// بررسی‌های صفحه‌ی «وضعیت سامانه» که فقط یه ردیف/یه عدد می‌خونن (زمان آخرین خروجی
// کارها، رسانه‌ی پاک‌نشده، حجم فضا، تلاش ناموفق ورود، انقضای توکن‌ها) — بدون
// «سرویس‌های مرتبط» و نتیجه‌ی گیت‌هاب (که لیارا/سهمیه‌ی API رو مصرف می‌کنن).
// «نظرات خونده‌نشده» نسبت به آخرین باری که همین مرورگر بخش نظرات رو باز کرده
// (localStorage) — بار اول از همون لحظه شمرده می‌شه.
// «دیده شد» (خواست کاربر، تا هشدار زردِ طولانی چشم رو عادت نده): با باز کردن صفحه‌ی
// وضعیت، موارد فعلی با سطحشون در jarian_status_ack ذخیره می‌شن و دیگه شمرده نمی‌شن —
// مگر مورد جدید باشه یا سطحش بالاتر بره. مورد قرمز همیشه شمرده می‌شه. موردی که
// برطرف شد از ack پاک می‌شه تا اگه برگشت، دوباره «جدید» باشه.
export const FEEDBACK_SEEN_KEY = 'jarian_feedback_seen';
export const STATUS_ACK_KEY = 'jarian_status_ack';
export let ADMIN_ALERT_TIMER = null;
export let ADMIN_ISSUES = []; // [{key, cls, msg}]
export async function refreshAdminAlerts(){
  clearTimeout(ADMIN_ALERT_TIMER);
  if(currentRole !== 'app_admin' || !authToken) return;
  ADMIN_ALERT_TIMER = setTimeout(refreshAdminAlerts, 15*60000);
  const rank = { '':0, ok:0, warn:1, bad:2 };
  let level = '';
  const issues = [];
  const note = (cls, msg, key) => { if(rank[cls] > 0) issues.push({ key, cls, msg }); };
  const jobChecks = SYS_STATUS_JOBS.map(async j=>{
    try{
      if(j.custom){ const r = await j.custom(); note(r.cls, j.name + ': ' + r.when, 'job:' + j.job); return; }
      const r = await api(j.path); if(!r.ok) return;
      const rows = await r.json(); const at = rows[0] ? rows[0][j.col] : null;
      if(!at){ note('bad', j.name + ': هنوز خروجی ندارد', 'job:' + j.job); return; }
      const hours = (Date.now() - new Date(at).getTime()) / 3600000;
      note(hours >= j.bad ? 'bad' : hours >= j.warn ? 'warn' : 'ok', j.name + ': آخرین خروجی ' + newsRelTime(at), 'job:' + j.job);
    }catch(e){}
  });
  const storageCheck = (async()=>{
    try{
      const r = await api('/rpc/storage_usage', { method:'POST', body:'{}' }); if(!r.ok) return;
      const total = (await r.json()).reduce((t,x)=>t + Number(x.size_bytes||0), 0);
      const pct = total / (STORAGE_LIMIT_MB*1048576) * 100;
      note(pct >= 85 ? 'bad' : pct >= 65 ? 'warn' : 'ok', 'فضای ذخیره‌سازی: ' + toFaDigits(pct.toFixed(0)) + '٪ پر', 'storage');
    }catch(e){}
  })();
  const loginCheck = (async()=>{
    try{
      const since = new Date(Date.now() - 86400000).toISOString();
      const n = await fetchExactCount('/login_events?success=is.false&blocked=is.false&created_at=gt.' + since);
      const locks = await fetchLoginLocks().catch(()=>null);
      if(locks && locks.length) note('warn', 'ورود از ' + faNum(locks.length) + ' اتصال قفل است', 'login-lock');
      note(n >= 20 ? 'bad' : n >= 5 ? 'warn' : 'ok', 'تلاش ناموفق ورود در ۲۴ ساعت: ' + faNum(n), 'logins');
    }catch(e){}
  })();
  SYS_TOKENS.forEach(t=>{
    const days = Math.ceil((new Date(t.exp + 'T00:00:00Z').getTime() - Date.now()) / 86400000);
    note(days <= 7 ? 'bad' : days <= 21 ? 'warn' : 'ok', 'توکن «' + t.name + '»: ' + (days < 0 ? 'منقضی شده' : toFaDigits(days) + ' روز مانده'), 'token:' + t.key);
  });
  const feedbackCheck = (async()=>{
    let seen = null;
    try{ seen = localStorage.getItem(FEEDBACK_SEEN_KEY); }catch(e){}
    if(!seen){ seen = new Date().toISOString(); try{ localStorage.setItem(FEEDBACK_SEEN_KEY, seen); }catch(e){} }
    try{ return await fetchExactCount('/feedback?created_at=gt.' + encodeURIComponent(seen)); }catch(e){ return 0; }
  })();
  await Promise.all([...jobChecks, storageCheck, loginCheck]);
  const unread = await feedbackCheck;
  ADMIN_ISSUES = issues;
  // موارد برطرف‌شده از «دیده شد» پاک بشن
  const ack = statusAckGet();
  Object.keys(ack).forEach(k=>{ if(!issues.some(x=>x.key === k)) delete ack[k]; });
  statusAckSet(ack);
  // اگه همین الان توی صفحه‌ی وضعیت هستیم (مثلاً رفرش روی همین صفحه)، همه دیده‌شده‌ان
  if(document.getElementById('sec-status').classList.contains('active')) ackAdminAlerts(); else renderAdminStatusDot();
  setFeedbackBadge(unread);
  updateAdminBtnDot();
}
export function statusAckGet(){ try{ return JSON.parse(localStorage.getItem(STATUS_ACK_KEY) || '{}') || {}; }catch(e){ return {}; } }
export function statusAckSet(o){ try{ localStorage.setItem(STATUS_ACK_KEY, JSON.stringify(o)); }catch(e){} }
export function renderAdminStatusDot(){
  const rank = { warn:1, bad:2 };
  const ack = statusAckGet();
  // قرمز همیشه؛ زرد فقط اگه دیده‌نشده یا سطحش از زمان دیدن بالاتر رفته
  const fresh = ADMIN_ISSUES.filter(x => x.cls === 'bad' || !ack[x.key] || rank[x.cls] > (rank[ack[x.key]] || 0));
  const level = fresh.some(x=>x.cls === 'bad') ? 'bad' : fresh.length ? 'warn' : '';
  const dot = document.getElementById('am-status-dot');
  dot.className = 'am-dot' + (level ? ' ' + level : '');
  dot.textContent = fresh.length ? toFaDigits(fresh.length) : '';
  const statusBtn = dot.closest('button');
  const seen = ADMIN_ISSUES.filter(x=>!fresh.includes(x));
  statusBtn.title = (fresh.length ? 'نیاز به توجه:\n' + fresh.map(x=>x.msg).join('\n') : '') +
    (seen.length ? (fresh.length ? '\n\n' : '') + 'دیده‌شده (هنوز برقرار):\n' + seen.map(x=>x.msg).join('\n') : '');
  updateAdminBtnDot();
}
// با باز کردن صفحه‌ی «وضعیت سامانه»
export function ackAdminAlerts(){
  const ack = statusAckGet();
  ADMIN_ISSUES.forEach(x=>{ ack[x.key] = x.cls; });
  statusAckSet(ack);
  renderAdminStatusDot();
}
export function setFeedbackBadge(n){
  const b = document.getElementById('am-feedback-badge');
  b.textContent = n > 99 ? '۹۹+' : toFaDigits(n);
  b.classList.toggle('show', n > 0);
  updateAdminBtnDot();
}
export function updateAdminBtnDot(){
  const st = document.getElementById('am-status-dot').className;
  const lvl = /\bbad\b/.test(st) ? 'bad' : /\bwarn\b/.test(st) ? 'warn' : document.getElementById('am-feedback-badge').classList.contains('show') ? 'info' : '';
  const d = document.getElementById('am-btn-dot');
  d.className = 'am-btn-dot' + (lvl ? ' ' + lvl : '');
  const btn = document.getElementById('admin-menu-btn');
  btn.title = lvl === 'bad' || lvl === 'warn' ? 'وضعیت سامانه نیاز به توجه دارد' : lvl === 'info' ? 'نظر جدید کاربران' : '';
}
export function markFeedbackSeen(){
  const newest = FEEDBACK_LIST && FEEDBACK_LIST[0] && FEEDBACK_LIST[0].created_at;
  try{ localStorage.setItem(FEEDBACK_SEEN_KEY, newest || new Date().toISOString()); }catch(e){}
  setFeedbackBadge(0);
}
// ---- قفل ورود (migration_042): IPهای قفل‌شده در «وضعیت سامانه ← ورودها» ----
export async function fetchLoginLocks(){
  const r = await api('/rpc/login_lock_status', { method:'POST', body:'{}' });
  if(!r.ok) return null; // migration اجرا نشده
  return await r.json();
}

