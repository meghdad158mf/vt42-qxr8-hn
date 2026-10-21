// «کاربران ← فهرست کاربران» (app_users، migration_037/050): جدول، ویرایشگر، کد ملی، دانلود فهرست، و مشترکین فرم «اطلاع از انتشار» (notify_subscribers)
import { api } from '../core/api.js';
import { downloadBlob, downloadCsv, toCSV } from './download.js';
import { escHtml, faDigitsToLatin, toFaDigits } from '../core/text.js';
import { FEEDBACK_LIST, loadFeedbackList, renderFeedbackList } from './feedback.js';
import { markFeedbackSeen } from './alerts-badge.js';
import { newsRelTime } from '../core/date.js';
import { nidValid, normalizeIrMobile } from '../core/validate.js';
import { searchNorm } from '../core/search.js';
import { showToast } from '../ui/toast.js';
import { uiConfirm } from '../ui/confirm.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { switchSection } from '../app.js';

// ---- «کاربران» (دفترچه‌ی کاربران migration_037 + مشترکین فرم + ارسال گروهی + نظرات) ----
// سطح دسترسی فعلاً فقط ثبت/نمایش؛ ارسال گروهی: فعلاً فقط انتخاب افراد + متن (ابزارهای دستی کپی/CSV به خواست کاربر حذف شدن) — پیامک
// و ایتا بعد از تهیه‌ی حساب/تصمیم کاربر اضافه می‌شن.
export const USER_LEVELS = { plus:'پلاس', pro:'پرو', normal:'عادی', limited:'محدود' };
export let APP_USERS = [];
export let APP_USERS_MISSING = false;
export let USR_FILTER = 'all';
export const USR_SELECTED = new Set();
export let USR_EDIT_ID = null;
export let USR_NID_READY = false;   // migration_050 (ستون‌های national_id_last4 و is_admin) اجرا شده؟
export async function loadAppUsers(){
  try{
    const [r, probe] = await Promise.all([
      api('/app_users?select=*&order=created_at.desc'),
      api('/app_users?select=national_id_last4,is_admin&limit=1'),
    ]);
    APP_USERS_MISSING = r.status === 404 || r.status === 400;
    USR_NID_READY = probe.ok;
    APP_USERS = r.ok ? await r.json() : [];
  }catch(e){ APP_USERS = []; }
}
// «••••••۲۴۱۹» — کد ملی هیچ‌وقت کامل به مرورگر نمی‌رسه، فقط ۴ رقم آخر
export function usrNidMask(u){ return u && u.national_id_last4 ? '••••••' + toFaDigits(u.national_id_last4) : ''; }
export function usrCanLogin(u){ return !!(u.active && u.phone && u.national_id_last4); }
// هر ردیف فهرست: کاربر ثبت‌شده، یا مشترک فرم که شماره‌ش هنوز در کاربران نیست
export function usrRows(){
  const phones = new Set(APP_USERS.map(u=>u.phone).filter(Boolean));
  const users = APP_USERS.map(u=>({ key:'u:'+u.id, kind:'user', u, name:u.full_name, phone:u.phone||'', eitaa:u.eitaa_id||'', title:u.title||'', level:u.access_level, active:u.active }));
  const subs = (NOTIFY_SUBSCRIBERS||[]).filter(x=>!phones.has(x.phone)).map(x=>({ key:'s:'+x.id, kind:'sub', s:x, name:'', phone:x.phone, eitaa:'', title:'', level:'sub', active:true }));
  return [...users, ...subs];
}
export function usrVisible(){
  // نرمال‌سازی مثل جست‌وجوی اخبار (ي/ك عربی، ارقام فارسی، نیم‌فاصله) — ۵.۲۱.۰
  const q = searchNorm(document.getElementById('usr-search').value);
  return usrRows().filter(r => (USR_FILTER === 'all' || r.level === USR_FILTER) &&
    (!q || searchNorm([r.name, r.title, r.phone, r.eitaa].join(' ')).includes(q)));
}
export function openUsersSection(){
  switchSection('users');
  if(document.getElementById('am-feedback-badge').classList.contains('show'))
    setTimeout(()=>document.getElementById('usr-feedback-panel').scrollIntoView({ behavior:'smooth', block:'start' }), 400);
}
export async function renderUsersSection(){
  await Promise.all([loadAppUsers(), loadNotifySubscribers(), loadFeedbackList()]);
  document.getElementById('usr-missing').style.display = APP_USERS_MISSING ? '' : 'none';
  document.getElementById('usr-nid-missing').style.display = !APP_USERS_MISSING && !USR_NID_READY ? '' : 'none';
  document.querySelectorAll('#usr-editor .usr-nid-field').forEach(el=>{ el.style.display = USR_NID_READY ? '' : 'none'; });
  document.querySelector('#usr-panel .usr-add').style.display = APP_USERS_MISSING ? 'none' : '';
  renderUsersTable();
  renderFeedbackList(); markFeedbackSeen();
  document.getElementById('users-count-feedback').textContent = FEEDBACK_LIST.length ? toFaDigits(FEEDBACK_LIST.length) : '';
}
export function renderUsersTable(){
  const all = usrRows();
  const counts = { all: all.length };
  all.forEach(r=>{ counts[r.level] = (counts[r.level]||0) + 1; });
  const chips = [['all','همه'], ...Object.entries(USER_LEVELS), ['sub','مشترک فرم']];
  document.getElementById('usr-filters').innerHTML = chips.map(([k,l])=>`<button type="button" class="usr-chip ${USR_FILTER===k?'active':''}" data-f="${k}">${l}<span>${toFaDigits(counts[k]||0)}</span></button>`).join('');
  document.getElementById('usr-send-quick').innerHTML = '<span>انتخاب سریع:</span>' + chips.map(([k,l])=>`<button type="button" class="usr-quick" data-q="${k}">${k==='all'?'همه‌ی فعال‌ها':l}</button>`).join('') + '<button type="button" class="usr-quick" data-q="none">هیچ‌کس</button>';
  const rows = usrVisible();
  const t = document.getElementById('usr-table');
  const allSel = rows.length && rows.every(r=>USR_SELECTED.has(r.key));
  t.innerHTML = `<thead><tr><th><input type="checkbox" id="usr-sel-all" ${allSel?'checked':''} aria-label="انتخاب همه"></th><th>نام</th><th>موبایل</th>${USR_NID_READY ? '<th>کد ملی</th>' : ''}<th>ایتا</th><th>سمت</th><th>سطح دسترسی</th><th>وضعیت</th><th></th></tr></thead><tbody>` +
    (rows.length ? rows.map(r=>{
      const lvl = r.kind==='sub' ? '<span class="usr-lvl sub">مشترک فرم</span>' : `<span class="usr-lvl ${r.level}">${USER_LEVELS[r.level]||r.level}</span>`;
      const st = r.kind==='sub' ? (r.s.notified_at ? '<span class="usr-st done">اطلاع‌رسانی‌شده</span>' : '<span class="usr-st">در انتظار</span>') : (r.active ? '<span class="usr-st on">فعال</span>' : '<span class="usr-st off">غیرفعال</span>');
      const act = r.kind==='sub'
        ? (APP_USERS_MISSING ? '' : `<button type="button" class="usr-act" data-promote="${r.s.id}">افزودن به کاربران</button>`)
        : `<button type="button" class="usr-act" data-edit="${r.u.id}">ویرایش</button><button type="button" class="usr-act del" data-del="${r.u.id}">حذف</button>`;
      // کلاس هر خانه برای نمای کارتی گوشی (۵.۲۰.۰)؛ خانه‌ی خالی روی گوشی پنهان می‌شه
      const emp = v => v ? '' : ' is-empty';
      return `<tr class="${r.kind==='user' && !r.active ? 'inactive' : ''}"><td class="u-sel"><input type="checkbox" data-sel="${r.key}" ${USR_SELECTED.has(r.key)?'checked':''} aria-label="انتخاب"></td>
        <td class="u-name">${r.kind==='sub' ? '<span class="usr-dim">— (از فرم اطلاع‌رسانی)</span>' : `<b>${escHtml(r.name)}</b>${r.u.is_admin ? '<span class="usr-admin-tag">مدیر</span>' : ''}`}</td>
        <td class="u-phone mono${emp(r.phone)}" dir="ltr">${escHtml(r.phone)||'—'}</td>${USR_NID_READY ? `<td class="u-nid${r.kind==='sub' ? ' is-empty' : ''}">${r.kind==='sub' ? '—' : (usrNidMask(r.u) ? `<span class="mono" dir="ltr">${usrNidMask(r.u)}</span>` : '<span class="usr-nid-none">ثبت نشده</span>')}</td>` : ''}<td class="u-eitaa${emp(r.eitaa)}" dir="ltr">${escHtml(r.eitaa)||'—'}</td>
        <td class="u-title${emp(r.title)}">${escHtml(r.title)||'—'}</td><td class="u-lvl">${lvl}</td><td class="u-st">${st}</td><td class="u-act${act ? '' : ' is-empty'}"><div class="usr-acts">${act}</div></td></tr>`;
    }).join('') : `<tr><td colspan="${USR_NID_READY ? 9 : 8}" class="usr-empty">موردی نیست.</td></tr>`) + '</tbody>';
  // کاربر فعالی که با این وضع نمی‌تونه وارد بشه (کد ملی یا موبایل نداره)
  const stuck = USR_NID_READY ? APP_USERS.filter(u=>u.active && !usrCanLogin(u)) : [];
  const warn = document.getElementById('usr-nologin');
  warn.style.display = stuck.length ? '' : 'none';
  warn.textContent = stuck.length ? toFaDigits(stuck.length) + ' کاربر فعال کد ملی یا موبایل ثبت‌شده ندارد و نمی‌تواند وارد سامانه شود: ' + stuck.slice(0, 6).map(u=>u.full_name).join('، ') + (stuck.length > 6 ? '، …' : '') : '';
  updateUsrSelCount();
}
export function updateUsrSelCount(){
  const valid = new Set(usrRows().map(r=>r.key));
  [...USR_SELECTED].forEach(k=>{ if(!valid.has(k)) USR_SELECTED.delete(k); });
  document.getElementById('usr-sel-count').textContent = toFaDigits(USR_SELECTED.size) + ' نفر انتخاب شده';
}
export function usrSelectedRows(){ return usrRows().filter(r=>USR_SELECTED.has(r.key)); }
// خروجی CSV همون ردیف‌هایی که الان در جدول دیده می‌شن (فیلتر سطح + جست‌وجو)
export function usrDownload(){
  const rows = usrVisible();
  if(!rows.length){ showToast('موردی برای خروجی نیست'); return; }
  // شماره با قالب ="09…" تا اکسل صفر اولش را حذف نکند
  const out = rows.map(r=>({
    'نام': r.name || '(مشترک فرم اطلاع‌رسانی)', 'موبایل': r.phone ? '="' + r.phone + '"' : '','ایتا': r.eitaa, 'سمت': r.title,
    'سطح دسترسی': r.kind === 'sub' ? 'مشترک فرم' : (USER_LEVELS[r.level] || r.level),
    'نقش': r.kind === 'sub' ? '' : (r.u.is_admin ? 'مدیر' : 'بیننده'),
    'وضعیت': r.kind === 'sub' ? (r.s.notified_at ? 'اطلاع‌رسانی‌شده' : 'در انتظار') : (r.active ? 'فعال' : 'غیرفعال'),
  }));
  // کد ملی عمداً در خروجی نیست (خواست کاربر: حفاظت از کد ملی)
  const cols = ['نام','موبایل','ایتا','سمت','سطح دسترسی','نقش','وضعیت'];
  const tag = USR_FILTER === 'all' ? '' : '-' + USR_FILTER;
  downloadBlob('jarian-users' + tag + '.csv', '\ufeff' + toCSV(out, cols), 'text/csv;charset=utf-8');
  showToast('فهرست ' + toFaDigits(rows.length) + ' نفر دانلود شد');
}
export function openUserEditor(u){
  USR_EDIT_ID = u ? u.id : null;
  document.getElementById('usr-editor-title').textContent = u ? 'ویرایش کاربر' : 'افزودن کاربر';
  document.getElementById('usr-name').value = u ? u.full_name : '';
  document.getElementById('usr-title').value = u ? (u.title||'') : '';
  document.getElementById('usr-phone').value = u ? (u.phone||'') : '';
  document.getElementById('usr-eitaa').value = u ? (u.eitaa_id||'') : '';
  document.getElementById('usr-level').value = u ? u.access_level : 'normal';
  document.getElementById('usr-active').value = !u || u.active ? '1' : '0';
  document.getElementById('usr-notes').value = u ? (u.notes||'') : '';
  document.getElementById('usr-nid').value = '';
  document.getElementById('usr-nid-cur').innerHTML = u && u.national_id_last4 ? 'ثبت‌شده: <bdi dir="ltr">' + usrNidMask(u) + '</bdi> — فقط برای تغییر، کد ملی تازه را وارد کنید.' : 'برای ورود به سامانه لازم است.';
  document.getElementById('usr-role').value = u && u.is_admin ? '1' : '0';
  const ed = document.getElementById('usr-editor'); ed.style.display = '';
  ed.scrollIntoView({ behavior:'smooth', block:'center' });
  document.getElementById('usr-name').focus({ preventScroll:true });
}
export function closeUserEditor(){ document.getElementById('usr-editor').style.display = 'none'; USR_EDIT_ID = null; }
export async function saveUser(){
  const phone = normalizeIrMobile(document.getElementById('usr-phone').value);
  if(phone && !/^09\d{9}$/.test(phone)){ showToast('شماره‌ی موبایل باید ۱۱ رقم و با ۰۹ شروع شود'); return; }
  const body = {
    full_name: document.getElementById('usr-name').value.trim(),
    title: document.getElementById('usr-title').value.trim() || null,
    phone: phone || null,
    eitaa_id: document.getElementById('usr-eitaa').value.trim().replace(/^@?/, '@').replace(/^@$/, '') || null,
    access_level: document.getElementById('usr-level').value,
    active: document.getElementById('usr-active').value === '1',
    notes: document.getElementById('usr-notes').value.trim() || null,
  };
  if(!body.full_name){ showToast('نام را وارد کنید'); return; }
  const nid = USR_NID_READY ? faDigitsToLatin(document.getElementById('usr-nid').value) : '';
  if(nid && !nidValid(nid)){ showToast('کد ملی معتبر نیست؛ ۱۰ رقم را دوباره بررسی کنید'); return; }
  if(USR_NID_READY) body.is_admin = document.getElementById('usr-role').value === '1';
  const btn = document.getElementById('usr-save'); btn.disabled = true;
  try{
    const r = USR_EDIT_ID
      ? await api('/app_users?id=eq.' + USR_EDIT_ID, { method:'PATCH', headers:{ Prefer:'return=minimal' }, body: JSON.stringify(body) })
      : await api('/app_users?select=id', { method:'POST', headers:{ Prefer:'return=representation' }, body: JSON.stringify(body) });
    if(r.status === 409){ showToast('این شماره قبلاً برای کاربر دیگری ثبت شده'); return; }
    if(!r.ok) throw new Error('app_users ' + r.status);
    const id = USR_EDIT_ID || ((await r.json().catch(()=>[]))[0] || {}).id;
    // کد ملی جدا و فقط از تابع سمت سرور (HMAC؛ نه در ردیف کاربر، نه در دفتر تغییرات)
    if(nid && id){
      const rr = await api('/rpc/set_user_national_id', { method:'POST', body: JSON.stringify({ p_user_id: id, p_nid: nid }) });
      const d = rr.ok ? await rr.json() : {};
      if(!d.ok){
        await loadAppUsers(); renderUsersTable(); USR_EDIT_ID = id;
        showToast(d.error === 'duplicate' ? 'کاربر ذخیره شد، ولی این کد ملی قبلاً برای کاربر دیگری ثبت شده است' : 'کاربر ذخیره شد، ولی ثبت کد ملی انجام نشد');
        return;
      }
    }
    closeUserEditor(); await loadAppUsers(); renderUsersTable(); showToast('ذخیره شد');
  }catch(e){ console.error(e); showToast('ذخیره ناموفق بود'); }
  finally{ btn.disabled = false; document.getElementById('usr-nid').value = ''; }
}
export async function deleteAppUser(id){
  const u = APP_USERS.find(x=>x.id === id);
  if(!u || !await uiConfirm('«' + u.full_name + '» از فهرست کاربران حذف شود؟')) return;
  const r = await api('/app_users?id=eq.' + id, { method:'DELETE' });
  if(!r.ok){ showToast('حذف ناموفق بود'); return; }
  await loadAppUsers(); renderUsersTable(); showToast('حذف شد');
}
export let NOTIFY_SUBSCRIBERS = []; // {id, phone, created_at, notified_at} — فقط با ورود مدیر به تب «خروجی‌گیری» لود می‌شه
export async function loadNotifySubscribers(){
  const r = await api('/notify_subscribers?select=*&order=created_at.desc');
  NOTIFY_SUBSCRIBERS = r.ok ? await r.json() : [];
}
export function renderNotifySubscribers(){
  const wrap = document.getElementById('notify-subs-list');
  const summary = document.getElementById('notify-subs-summary');
  if(!wrap || !summary) return;
  const total = NOTIFY_SUBSCRIBERS.length;
  const pending = NOTIFY_SUBSCRIBERS.filter(s=>!s.notified_at).length;
  summary.textContent = total
    ? `${toFaDigits(total)} مشترک ثبت‌نامی — ${toFaDigits(pending)} نفر در انتظار اطلاع‌رسانی`
    : 'هنوز کسی از صفحه‌ی ورود ثبت‌نام نکرده.';
  wrap.innerHTML = '';
  NOTIFY_SUBSCRIBERS.forEach(s=>{
    const row = document.createElement('div'); row.className = 'notify-sub-row';
    const phone = document.createElement('span'); phone.className = 'mono'; phone.textContent = s.phone;
    const time = document.createElement('span'); time.className = 'notify-sub-time'; time.textContent = newsRelTime(s.created_at);
    const status = document.createElement('span'); status.className = 'notify-sub-status' + (s.notified_at ? ' done' : '');
    status.textContent = s.notified_at ? 'اطلاع‌رسانی‌شده' : 'در انتظار';
    row.appendChild(phone); row.appendChild(time); row.appendChild(status);
    wrap.appendChild(row);
  });
}
export function exportNotifySubscribers(){
  if(!NOTIFY_SUBSCRIBERS.length){ showToast('هنوز مشترکی ثبت نشده'); return; }
  const rows = NOTIFY_SUBSCRIBERS.map(s=>({ phone: s.phone, created_at: s.created_at, notified_at: s.notified_at||'' }));
  downloadCsv('notify-subscribers.csv', rows, ['phone','created_at','notified_at']);
  showToast('خروجی لیست شماره‌ها آماده شد');
}
export async function markNotifySubscribersNotified(){
  const pending = NOTIFY_SUBSCRIBERS.filter(s=>!s.notified_at);
  if(!pending.length){ showToast('کسی در انتظار اطلاع‌رسانی نیست'); return; }
  if(!await uiConfirm(`${toFaDigits(pending.length)} مشترک به‌عنوان اطلاع‌رسانی‌شده علامت بخورند؟`)) return;
  try{
    const r = await api('/notify_subscribers?notified_at=is.null', {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ notified_at: new Date().toISOString() }),
    });
    if(!r.ok) throw new Error('update failed');
    await loadNotifySubscribers();
    renderNotifySubscribers();
    renderUsersTable();
    showToast('علامت‌گذاری انجام شد');
  }catch(e){
    showToast('علامت‌گذاری ناموفق بود');
  }
}
export function setupUsersAdmin(){
  document.getElementById('sec-users').addEventListener('click', e=>{
    const t = e.target.closest('button, input[type=checkbox]');
    if(!t) return;
    if(t.dataset.f){ USR_FILTER = t.dataset.f; renderUsersTable(); return; }
    if(t.dataset.q){
      const rows = usrRows();
      if(t.dataset.q === 'none') USR_SELECTED.clear();
      else rows.filter(r => (t.dataset.q === 'all' || r.level === t.dataset.q) && r.active).forEach(r=>USR_SELECTED.add(r.key));
      renderUsersTable(); return;
    }
    if(t.dataset.sel){ t.checked ? USR_SELECTED.add(t.dataset.sel) : USR_SELECTED.delete(t.dataset.sel); updateUsrSelCount(); return; }
    if(t.id === 'usr-sel-all'){ usrVisible().forEach(r => t.checked ? USR_SELECTED.add(r.key) : USR_SELECTED.delete(r.key)); renderUsersTable(); return; }
    if(t.dataset.edit){ openUserEditor(APP_USERS.find(x=>x.id === Number(t.dataset.edit))); return; }
    if(t.dataset.del){ deleteAppUser(Number(t.dataset.del)); return; }
    if(t.dataset.promote){
      const sub = NOTIFY_SUBSCRIBERS.find(x=>x.id === Number(t.dataset.promote));
      openUserEditor(null);
      document.getElementById('usr-phone').value = sub ? sub.phone : '';
      document.getElementById('usr-level').value = 'limited';
    }
  });
  document.getElementById('usr-search').addEventListener('input', renderUsersTable);
}

