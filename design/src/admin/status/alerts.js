// «وضعیت سامانه»: هشدار ایمیلی (alert_settings، migration_045) و خطاهای مرورگر کاربران (client_errors)
import { actTabName, tehranDateStr } from '../activity.js';
import { api } from '../../core/api.js';
import { authToken } from '../../core/session.js';
import { escAttr, escHtml, faNum, toFaDigits } from '../../core/text.js';
import { newsRelTime } from '../../core/date.js';
import { renderSysSummary } from './summary.js';
import { showToast } from '../../ui/toast.js';
import { SUPABASE_URL } from '../../core/config.js';
import { TITLES } from '../../data/section-titles.js';
import { uiConfirm } from '../../ui/confirm.js';

// ---- هشدار ایمیلی (۵.۲۷.۰، alert_settings — migration_045، Edge Function notify) ----
export let ALERT_SETTINGS = null;
export function alertErrHint(err){
  if(!err) return '';
  if(/RESEND_API_KEY/.test(err)) return 'کلید Resend هنوز در سوپابیس تنظیم نشده است (Edge Functions ← Secrets ← RESEND_API_KEY).';
  if(/Resend 403|testing emails|verify a domain/i.test(err)) return 'Resend بدون دامنه‌ی تأییدشده فقط به ایمیلی می‌فرستد که با آن در Resend ثبت‌نام کرده‌اید؛ همان نشانی را اینجا وارد کنید.';
  if(/Resend 401|Resend 400/.test(err)) return 'کلید Resend نامعتبر است؛ کلید تازه بسازید و در سوپابیس جایگزین کنید.';
  return 'خطا در ارسال: ' + err;
}
export async function renderSysAlerts(){
  const el = document.getElementById('sys-alerts');
  if(!el) return;
  el.innerHTML = '<div class="sys-note">در حال بررسی…</div>';
  try{
    const r = await api('/alert_settings?id=eq.1&select=*');
    if(r.status === 404 || r.status === 400){ el.innerHTML = '<div class="sys-note">برای فعال شدن این بخش، فایل <b>db/migration_045_email_alerts.sql</b> باید یک‌بار در SQL Editor سوپابیس اجرا شود.</div>'; return; }
    if(!r.ok) throw new Error('alert_settings ' + r.status);
    ALERT_SETTINGS = (await r.json())[0] || { email:'', alerts_on:true, daily_on:true };
    const a = ALERT_SETTINGS;
    const when = t => t ? escHtml(newsRelTime(t)) : 'هنوز نه';
    el.innerHTML = `<div class="sys-alerts-grid">
        <div class="sys-alerts-form">
          <div class="field"><label for="sys-alert-email">نشانی ایمیل گیرنده</label><input type="email" id="sys-alert-email" dir="ltr" value="${escAttr(a.email || '')}" placeholder="name@example.com" autocomplete="email"></div>
          <label class="ce-check"><input type="checkbox" id="sys-alert-on" ${a.alerts_on ? 'checked' : ''}>ایمیل فوری هنگام خرابی <small>(بررسی هر ۳۰ دقیقه؛ یادآوری هر ۱۲ ساعت تا برطرف شود)</small></label>
          <label class="ce-check"><input type="checkbox" id="sys-alert-daily" ${a.daily_on ? 'checked' : ''}>گزارش روزانه <small>(هر روز ساعت ۷:۲۲ صبح، حتی اگر همه‌چیز سالم باشد)</small></label>
          <div class="sys-btn-row"><button type="button" class="btn btn-sm primary" id="sys-alert-save" onclick="saveAlertSettings()">ذخیره</button><button type="button" class="btn btn-sm" id="sys-alert-test" onclick="testAlertEmail()">ارسال ایمیل آزمایشی</button></div>
        </div>
        <div class="sys-alerts-stat">
          <div><span>آخرین بررسی</span><b>${when(a.last_check_at)}</b></div>
          <div><span>آخرین هشدار ارسال‌شده</span><b>${when(a.last_alert_at)}</b></div>
          <div><span>آخرین گزارش روزانه</span><b>${when(a.last_daily_at)}</b></div>
          ${a.last_error ? `<p class="sys-alert-err warn">${escHtml(alertErrHint(a.last_error))}</p>` : ''}
          ${!a.email ? '<p class="sys-note">تا نشانی ایمیل وارد نشود، هیچ ایمیلی فرستاده نمی‌شود.</p>' : ''}
        </div>
      </div>`;
  }catch(e){
    console.error(e);
    el.innerHTML = '<div class="sys-note">خطا در دریافت تنظیمات هشدار ایمیلی.</div>';
  }
}
export async function saveAlertSettings(silent){
  const email = document.getElementById('sys-alert-email').value.trim();
  if(email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ showToast('نشانی ایمیل درست نیست؛ مثل name@example.com وارد کنید.'); return false; }
  const body = { email: email || null, alerts_on: document.getElementById('sys-alert-on').checked, daily_on: document.getElementById('sys-alert-daily').checked };
  let r;
  try{ r = await api('/alert_settings?id=eq.1', { method:'PATCH', headers:{ Prefer:'return=minimal' }, body: JSON.stringify(body) }); }
  catch(e){ r = null; }
  if(!r || !r.ok){ showToast('ذخیره نشد؛ اتصال اینترنت را بررسی کنید.'); return false; }
  Object.assign(ALERT_SETTINGS || {}, body);
  if(!silent){ showToast(email ? 'ذخیره شد.' : 'ذخیره شد؛ بدون نشانی ایمیل، چیزی فرستاده نمی‌شود.'); renderSysAlerts(); }
  return true;
}
export async function testAlertEmail(){
  const btn = document.getElementById('sys-alert-test');
  if(!document.getElementById('sys-alert-email').value.trim()){ showToast('اول نشانی ایمیل گیرنده را وارد کنید.'); return; }
  btn.disabled = true; btn.textContent = 'در حال ارسال…';
  try{
    if(!await saveAlertSettings(true)) return;
    const r = await fetch(SUPABASE_URL + '/functions/v1/notify', {
      method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + authToken }, body: JSON.stringify({ mode:'test' }),
    });
    const d = await r.json().catch(()=>({}));
    if(r.ok && d.ok) showToast('ایمیل آزمایشی فرستاده شد؛ صندوق ورودی (و پوشه‌ی هرزنامه) را ببینید.');
    else if(r.status === 404) showToast('تابع ارسال هنوز نصب نشده است؛ چند دقیقه بعد از انتشار دوباره امتحان کنید.');
    else showToast(alertErrHint(d.error || ('خطای ' + r.status)));
  }catch(e){
    console.error(e);
    showToast('ارسال ناموفق بود؛ اتصال اینترنت را بررسی کنید.');
  }finally{ renderSysAlerts(); }
}
// ---- خطاهای مرورگر کاربران (۵.۲۵.۰، client_errors — migration_043) ----
export async function renderSysClientErrors(){
  const el = document.getElementById('sys-client-errors');
  if(!el) return;
  el.innerHTML = '<div class="sys-note">در حال بررسی…</div>';
  try{
    const r = await api('/client_errors?select=*&day=gte.' + tehranDateStr(Date.now() - 6*86400000) + '&order=last_at.desc&limit=500');
    if(r.status === 404 || r.status === 400){ el.innerHTML = '<div class="sys-note">برای نمایش این بخش، فایل <b>db/migration_043_capacity_errors.sql</b> باید یک‌بار در SQL Editor سوپابیس اجرا شود.</div>'; return; }
    if(!r.ok) throw new Error('client_errors ' + r.status);
    const groups = new Map();
    (await r.json()).forEach(x=>{
      const g = groups.get(x.sig) || { sig:x.sig, message:x.message, sessions:0, last:x.last_at, place:x.place, device:x.device, version:x.version, recent:0 };
      g.sessions += x.sessions;
      if(Date.now() - new Date(x.last_at).getTime() < 86400000) g.recent += x.sessions;
      if(x.last_at > g.last){ g.last = x.last_at; g.place = x.place; g.device = x.device; g.version = x.version; }
      groups.set(x.sig, g);
    });
    const list = [...groups.values()].sort((a, b)=>b.last.localeCompare(a.last));
    if(!list.length){ el.innerHTML = '<div class="sys-note">در ۷ روز اخیر هیچ خطایی در مرورگر کاربران ثبت نشده است.</div>'; return; }
    const placeName = k => {
      if(!k) return '—';
      const [sec, tab] = k.split('/');
      return (TITLES[sec] || sec) + (tab ? ' ← ' + actTabName(sec, tab) : '');
    };
    el.innerHTML = list.slice(0, 30).map(g=>{
      const cls = g.recent >= 3 ? 'warn' : '';
      return `<div class="sys-cerr-row ${cls}">
        <div class="sys-cerr-msg" dir="auto">${escHtml(g.message)}</div>
        <div class="sys-cerr-meta">در ${faNum(g.sessions)} نشست، آخرین بار ${escHtml(newsRelTime(g.last))}، ${escHtml(placeName(g.place))}، ${escHtml(g.device || 'دستگاه نامشخص')}، نسخه‌ی ${escHtml(toFaDigits(g.version || '—'))}</div>
        <button type="button" class="btn btn-sm" data-cerr="${escAttr(g.sig)}">رفع شد</button>
      </div>`;
    }).join('') + (list.length > 30 ? `<div class="sys-note">و ${faNum(list.length - 30)} خطای دیگر.</div>` : '');
  }catch(e){
    console.error(e);
    el.innerHTML = '<div class="sys-note">خطا در دریافت فهرست خطاها.</div>';
  }
}
export function setupSysAlerts(){
  document.getElementById('sys-client-errors').addEventListener('click', async e=>{
    const b = e.target.closest('[data-cerr]'); if(!b) return;
    if(!await uiConfirm('حذف این خطا از فهرست\nاگر دوباره رخ دهد، باز در فهرست ظاهر می‌شود.')) return;
    const r = await api('/client_errors?sig=eq.' + encodeURIComponent(b.dataset.cerr), { method:'DELETE' });
    if(!r.ok){ showToast('حذف ناموفق بود؛ اتصال اینترنت را بررسی کنید.'); return; }
    renderSysClientErrors().then(renderSysSummary);
  });
}

