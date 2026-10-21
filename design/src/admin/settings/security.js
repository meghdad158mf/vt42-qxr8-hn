// «تنظیمات بخش‌ها ← امنیت»: تغییر رمز، ورود با پیامک (کلید وب‌سرویس، الگو، پیامک آزمایشی) و ورود اضطراری
import { api } from '../../core/api.js';
import { bindModal } from '../../ui/modal.js';
import { escHtml, faDigitsToLatin, toFaDigits } from '../../core/text.js';
import { normalizeIrMobile } from '../../core/validate.js';
import { saveSiteSetting } from '../site-settings.js';
import { showToast } from '../../ui/toast.js';
import { SITE_SETTINGS } from '../../data/site-settings.js';
import { uiConfirm } from '../../ui/confirm.js';

// ---- settings: password change ----
// تغییر رمز در پنجره‌ی اختصاصی (نه prompt مرورگر): رمز پنهان + تکرار برای
// جلوگیری از قفل‌شدن مدیر با یک غلط تایپی
export let PW_ROLE = null;
export const PW_MIN_LEN = 6;
export function changePassword(role){
  PW_ROLE = role;
  const label = role==='admin' ? 'مدیر' : 'بیننده';
  document.getElementById('pw-modal-title').textContent = 'تغییر رمز ' + label;
  document.getElementById('pw-modal-warn').textContent = role==='admin'
    ? 'این رمز برای ورود خود شما به‌عنوان مدیر است؛ آن را جایی امن یادداشت کنید.'
    : 'همه‌ی کاربرانی که با نقش بیننده وارد می‌شوند باید از رمز جدید استفاده کنند.';
  ['pw-new','pw-new2'].forEach(id=>{ const el=document.getElementById(id); el.value=''; el.type='password'; });
  document.getElementById('pw-show').checked = false;
  document.getElementById('pw-modal-error').textContent = '';
  document.getElementById('pw-modal').classList.add('active');
  setTimeout(()=> document.getElementById('pw-new').focus(), 50);
}
export function closePwModal(){
  document.getElementById('pw-modal').classList.remove('active');
  PW_ROLE = null;
}
// ---- «ورود با پیامک» در تنظیمات (۵.۳۱.۰، migration_050) ----
export const SMS_REPLY_HELP = [
  [/کلید کنسول معتبر نیست|invalid.*key/i, 'کلید کنسول معتبر نیست'],
  [/الگو|body/i, 'شماره‌ی الگو یا متن الگو درست نیست'],
  [/اعتبار|credit/i, 'اعتبار پنل پیامک کافی نیست'],
];
export function smsReplyText(row){
  if(row.status_code == null) return row.reply ? 'خطا: ' + row.reply : 'در انتظار پاسخ';
  const ok = row.status_code >= 200 && row.status_code < 300 && !/false|error|خطا|نامعتبر|معتبر نیست/i.test(row.reply || '');
  if(ok) return 'ارسال شد';
  const hit = SMS_REPLY_HELP.find(([rx])=>rx.test(row.reply || ''));
  return 'ناموفق (' + toFaDigits(row.status_code) + ')' + (hit ? '، ' + hit[1] : '');
}
export async function renderSmsPanel(){
  const missing = document.getElementById('sms-missing'), body = document.getElementById('sms-body');
  document.getElementById('sms-viewer-pw').checked = SITE_SETTINGS.viewer_password_login === true;
  let d = null;
  try{ const r = await api('/rpc/sms_status', { method:'POST', body:'{}' }); if(r.ok) d = await r.json(); }catch(e){}
  missing.style.display = d ? 'none' : '';
  body.style.display = d ? '' : 'none';
  if(!d){ document.getElementById('sms-sum').textContent = 'هنوز راه‌اندازی نشده'; return; }
  const ready = d.key_set && d.body_id;
  document.getElementById('sms-sum').textContent = ready ? 'فعال — الگوی ' + toFaDigits(d.body_id) : 'کلید یا شماره‌ی الگو ثبت نشده';
  document.getElementById('sms-status').innerHTML = ready
    ? '<span class="sms-dot ok"></span><span>کلید وب‌سرویس ثبت شده است؛ الگوی <b>' + escHtml(toFaDigits(d.body_id)) + '</b>.</span>'
    : '<span class="sms-dot bad"></span><span>' + (d.key_set ? 'شماره‌ی الگو ثبت نشده است.' : d.body_id ? 'کلید وب‌سرویس ثبت نشده است.' : 'کلید وب‌سرویس و شماره‌ی الگو ثبت نشده‌اند؛ تا ثبت نشوند، هیچ‌کس با پیامک وارد نمی‌شود.') + '</span>';
  document.getElementById('sms-body-id').value = d.body_id || '';
  renderSmsAdmins();
  const rec = Array.isArray(d.recent) ? d.recent : [];
  document.getElementById('sms-recent').innerHTML = rec.length
    ? '<b class="sms-recent-title">ده پیامک آخر ورود</b><table class="sms-recent-table"><tbody>' + rec.map(x=>`<tr><td>${escHtml(new Date(x.at).toLocaleString('fa-IR', { timeZone:'Asia/Tehran', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' }))}</td><td>${escHtml(x.name || '—')}</td><td class="${/^ارسال شد/.test(smsReplyText(x)) ? 'ok' : 'bad'}">${escHtml(smsReplyText(x))}</td></tr>`).join('') + '</tbody></table>'
    : '<p class="settings-help">هنوز پیامک ورودی فرستاده نشده است.</p>';
}
// ۵.۳۱.۱: مدیر هم با کد ملی وارد می‌شود (بعدش روش ورود را انتخاب می‌کند) — پس دست‌کم یک مدیر باید
// کد ملی ثبت‌شده داشته باشد، وگرنه بعد از این نشست هیچ مدیری نمی‌تواند وارد شود
export async function renderSmsAdmins(){
  const el = document.getElementById('sms-admins');
  let rows = null;
  try{ const r = await api('/app_users?select=id&is_admin=eq.true&active=eq.true&national_id_last4=not.is.null&limit=1'); if(r.ok) rows = await r.json(); }catch(e){}
  el.className = 'sms-admins warn';
  el.innerHTML = rows && !rows.length
    ? '<span><b>هنوز هیچ مدیری کد ملی ثبت‌شده ندارد.</b> ورود مدیر هم با کد ملی است؛ پیش از خروج، در «کاربران» کد ملی خودتان را با نقش «مدیر» ثبت کنید.</span>' : '';
}
export async function saveSmsConfig(){
  const key = document.getElementById('sms-key').value.trim();
  const bodyId = faDigitsToLatin(document.getElementById('sms-body-id').value);
  if(!key && !bodyId){ showToast('کلید یا شماره‌ی الگو را وارد کنید'); return; }
  const btn = document.getElementById('sms-save'); btn.disabled = true;
  try{
    const r = await api('/rpc/sms_config_set', { method:'POST', body: JSON.stringify({ p_api_key: key, p_body_id: bodyId }) });
    const d = r.ok ? await r.json() : {};
    if(!d.ok){ showToast(d.error === 'invalid_key' ? 'کلید وارد‌شده درست به نظر نمی‌رسد؛ کلید کنسول را دوباره از پنل ملی‌پیامک کپی کنید' : 'ذخیره ناموفق بود'); return; }
    document.getElementById('sms-key').value = '';
    showToast('ذخیره شد'); renderSmsPanel();
  }catch(e){ console.error(e); showToast('ذخیره ناموفق بود'); }
  finally{ btn.disabled = false; }
}
export async function sendSmsTest(){
  const phone = normalizeIrMobile(document.getElementById('sms-test-phone').value);
  const out = document.getElementById('sms-test-result');
  if(!/^09\d{9}$/.test(phone)){ showToast('شماره‌ی موبایل باید ۱۱ رقم و با ۰۹ شروع شود'); return; }
  const btn = document.getElementById('sms-test-btn'); btn.disabled = true;
  out.hidden = false; out.className = 'sms-test-result'; out.textContent = 'در حال ارسال…';
  try{
    const r = await api('/rpc/sms_test', { method:'POST', body: JSON.stringify({ p_phone: phone }) });
    const d = r.ok ? await r.json() : {};
    if(!d.ok){ out.classList.add('bad'); out.textContent = d.error === 'sms_not_configured' ? 'اول کلید و شماره‌ی الگو را ذخیره کنید.' : 'ارسال انجام نشد.'; return; }
    // pg_net درخواست رو بعد از تراکنش می‌فرسته — چند ثانیه بعد نتیجه رو می‌خونیم
    for(let i = 0; i < 8; i++){
      await new Promise(res=>setTimeout(res, 1500));
      const rr = await api('/rpc/sms_test_result', { method:'POST', body: JSON.stringify({ p_req_id: d.req_id }) });
      const x = rr.ok ? await rr.json() : {};
      if(x.pending) continue;
      const txt = smsReplyText({ status_code: x.status_code, reply: x.reply });
      out.classList.add(/^ارسال شد/.test(txt) ? 'ok' : 'bad');
      out.textContent = /^ارسال شد/.test(txt) ? 'پیامک فرستاده شد؛ چند ثانیه‌ی دیگر روی گوشی بررسی کنید.' : txt + (x.reply ? ' — پاسخ ملی‌پیامک: ' + x.reply : '');
      return;
    }
    out.textContent = 'پاسخی از ملی‌پیامک نرسید؛ چند دقیقه‌ی دیگر نتیجه را در فهرست پایین ببینید.';
  }catch(e){ console.error(e); out.classList.add('bad'); out.textContent = 'ارسال انجام نشد.'; }
  finally{ btn.disabled = false; }
}
export async function saveViewerPasswordLogin(on){
  if(on && !await uiConfirm('ورود با رمز مشترک بیننده دوباره باز شود؟\nهر کسی که رمز بیننده را بداند، بدون کد ملی وارد می‌شود. فقط وقتی ارسال پیامک از کار افتاده است روشن کنید.')){
    document.getElementById('sms-viewer-pw').checked = false; return;
  }
  try{ await saveSiteSetting('viewer_password_login', !!on); showToast(on ? 'ورود اضطراری با رمز مشترک روشن شد' : 'ورود با رمز مشترک بیننده بسته شد'); }
  catch(e){ console.error(e); showToast('ذخیره ناموفق بود'); document.getElementById('sms-viewer-pw').checked = !on; }
}
export function setupSecurityAdmin(){
  document.querySelectorAll('[data-pw-role]').forEach(b=>b.addEventListener('click', ()=>changePassword(b.dataset.pwRole)));
  document.getElementById('sms-save').addEventListener('click', ()=>saveSmsConfig());
  document.getElementById('sms-test-btn').addEventListener('click', ()=>sendSmsTest());
  document.getElementById('sms-viewer-pw').addEventListener('change', e=>saveViewerPasswordLogin(e.target.checked));
  bindModal('pw-modal', closePwModal);
  document.getElementById('pw-show').addEventListener('change', e=>{
    ['pw-new','pw-new2'].forEach(id=> document.getElementById(id).type = e.target.checked ? 'text' : 'password');
  });
  document.getElementById('pw-save-btn').addEventListener('click', async ()=>{
    const pw = document.getElementById('pw-new').value;
    const pw2 = document.getElementById('pw-new2').value;
    const err = document.getElementById('pw-modal-error');
    if(pw.length < PW_MIN_LEN){ err.textContent = 'رمز باید دست‌کم ' + toFaDigits(PW_MIN_LEN) + ' نویسه باشد.'; return; }
    if(pw !== pw2){ err.textContent = 'رمز و تکرار آن یکسان نیستند.'; return; }
    const role = PW_ROLE, label = role==='admin' ? 'مدیر' : 'بیننده';
    const btn = document.getElementById('pw-save-btn');
    btn.disabled = true;
    try{
      const r = await api('/rpc/change_password', {method:'POST', body: JSON.stringify({target_role: role, new_password: pw})});
      if(r.ok){ closePwModal(); showToast('رمز ' + label + ' تغییر کرد'); }
      else err.textContent = 'تغییر رمز ناموفق بود؛ فقط مدیر می‌تواند رمز را تغییر دهد.';
    }finally{ btn.disabled = false; }
  });
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && document.getElementById('pw-modal').classList.contains('active')) closePwModal();
  });
}

