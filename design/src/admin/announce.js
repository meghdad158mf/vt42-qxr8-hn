// «درج اطلاعیه» (announcements، migration_036): پیش‌نمایش زنده، انتشار، توقف و حذف
import { ANNOUNCEMENTS, ANN_TABLE_MISSING, annIsLive, annItemHtml, loadAnnouncements, renderAnnBar } from '../features/announcements/ann-bar.js';
import { api } from '../core/api.js';
import { escAttr, escHtml, toFaDigits } from '../core/text.js';
import { showToast } from '../ui/toast.js';
import { uiConfirm } from '../ui/confirm.js';

export function updateAnnPreview(){
  const msg = document.getElementById('ann-msg').value.trim();
  document.getElementById('ann-counter').textContent = toFaDigits(document.getElementById('ann-msg').value.length) + ' / ۳۰۰';
  document.getElementById('ann-preview').innerHTML = annItemHtml({ message: msg || 'متن اطلاعیه اینجا نمایش داده می‌شود.', level: document.getElementById('ann-level').value }, false);
}
export function renderAnnAdmin(){
  document.getElementById('ann-missing').style.display = ANN_TABLE_MISSING ? '' : 'none';
  document.getElementById('ann-form').style.display = ANN_TABLE_MISSING ? 'none' : '';
  updateAnnPreview();
  const el = document.getElementById('ann-list');
  if(!ANNOUNCEMENTS.length){ el.innerHTML = '<div class="upl-empty">هنوز اطلاعیه‌ای منتشر نشده.</div>'; return; }
  const fmt = d => new Date(d).toLocaleDateString('fa-IR', { timeZone:'Asia/Tehran', day:'numeric', month:'long' });
  el.innerHTML = '';
  ANNOUNCEMENTS.forEach(a => {
    const live = annIsLive(a);
    const status = !a.active ? 'متوقف‌شده' : live ? (a.expires_at ? 'فعال تا ' + fmt(a.expires_at) : 'فعال، بدون انقضا') : 'منقضی‌شده';
    const row = document.createElement('div'); row.className = 'upl-item ann-row' + (live ? ' live' : '');
    row.innerHTML = `<span class="ann-dot"></span><span class="upl-meta"><b title="${escAttr(a.message)}">${escHtml(a.message)}</b><span>${a.level === 'important' ? 'مهم، ' : ''}${fmt(a.created_at)}، ${status}</span></span>
      ${live ? '<button type="button" class="upl-del ann-stop">توقف</button>' : ''}<button type="button" class="upl-del ann-del">حذف</button>`;
    const stop = row.querySelector('.ann-stop');
    if(stop) stop.addEventListener('click', () => updateAnnouncement(a.id, { active:false }, 'اطلاعیه متوقف شد'));
    row.querySelector('.ann-del').addEventListener('click', async () => { if(await uiConfirm('این اطلاعیه حذف شود؟')) updateAnnouncement(a.id, null, 'اطلاعیه حذف شد'); });
    el.appendChild(row);
  });
}
export async function updateAnnouncement(id, patch, okMsg){
  try{
    const r = await api('/announcements?id=eq.' + id, patch ? { method:'PATCH', headers:{ Prefer:'return=minimal' }, body: JSON.stringify(patch) } : { method:'DELETE' });
    if(!r.ok) throw new Error('ann ' + r.status);
    await loadAnnouncements(); renderAnnAdmin(); renderAnnBar(); showToast(okMsg);
  }catch(e){ console.error(e); showToast('انجام نشد'); }
}
export async function publishAnnouncement(){
  const msg = document.getElementById('ann-msg').value.trim();
  if(!msg){ showToast('متن اطلاعیه را بنویسید'); return; }
  const days = Number(document.getElementById('ann-exp').value);
  const btn = document.getElementById('ann-publish');
  btn.disabled = true; btn.textContent = 'در حال انتشار…';
  try{
    const body = { message: msg, level: document.getElementById('ann-level').value, expires_at: days ? new Date(Date.now() + days*86400000).toISOString() : null };
    const r = await api('/announcements', { method:'POST', headers:{ Prefer:'return=minimal' }, body: JSON.stringify(body) });
    if(!r.ok) throw new Error('ann ' + r.status);
    document.getElementById('ann-msg').value = '';
    await loadAnnouncements(); renderAnnAdmin(); renderAnnBar(); showToast('اطلاعیه منتشر شد');
  }catch(e){ console.error(e); showToast('انتشار ناموفق بود'); }
  finally{ btn.disabled = false; btn.textContent = 'انتشار اطلاعیه'; }
}
export function setupAnnounceAdmin(){
  document.getElementById('ann-msg').addEventListener('input', updateAnnPreview);
  document.getElementById('ann-level').addEventListener('change', updateAnnPreview);
}

