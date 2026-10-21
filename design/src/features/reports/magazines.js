// «بسته تحلیلی جریان» (magazines): کارت هر شماره با جلد و «مطالعه» در نمایشگر سند؛ فرم بارگذاری در app.js
import { api } from '../../core/api.js';
import { authToken, currentRole } from '../../core/session.js';
import { cardAdminControls } from '../../ui/card-controls.js';
import { escAttr, escHtml, faTitle, toFaDigits } from '../../core/text.js';
import { ICONS } from '../../ui/icons.js';
import { openDocViewer } from '../../ui/doc-viewer.js';
import { showToast } from '../../ui/toast.js';
import { signStoragePaths } from '../../core/signed-urls.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../core/config.js';
import { uiConfirm } from '../../ui/confirm.js';
import { adminHook } from '../../core/admin-hooks.js';

export let MAGAZINES = [];   // {id, title, issue_no, publish_date, file_type, files, cover_url, uploaded_at}
// بعد از هر رندر فهرست شماره‌ها؛ home.js جلدهای «بسته تحلیلی جریان» صفحه‌ی نخست رو ثبت می‌کنه (بدون import دوطرفه)
let MAGAZINES_RENDERED = null;
export function onMagazinesRendered(fn){ MAGAZINES_RENDERED = fn; }
export async function loadMagazines(){
  const r = await api('/magazines?select=*&order=sort_order.asc,uploaded_at.desc');
  MAGAZINES = r.ok ? await r.json() : [];
}
// ---- magazines library (بخش تحلیلی) ----
export const MAG_TYPE_LABEL = { pdf:'PDF', images:'چند عکس' };
export function renderMagazines(){
  adminHook('renderUploadLists'); // فهرست «بارگذاری محتوا» (admin/uploads.js)
  const grid = document.getElementById('magazine-grid');
  const empty = document.getElementById('magazines-empty');
  const isAdmin = currentRole === 'app_admin';
  grid.innerHTML = '';
  empty.style.display = MAGAZINES.length ? 'none' : 'block';
  MAGAZINES.forEach((m, i)=>{
    const files = Array.isArray(m.files) ? m.files : [];
    const meta = [
      m.issue_no ? ('شماره ' + toFaDigits(m.issue_no)) : '',
      m.publish_date ? new Date(m.publish_date).toLocaleDateString('fa-IR') : '',
      m.file_type === 'images' ? (toFaDigits(files.length) + ' صفحه') : 'PDF',
    ].filter(Boolean).map(escHtml).join('، ');
    // هم‌شکل کارت‌های «بسته‌های تحلیلی» یادداشت‌ها: جلد بلند + عنوان + یه دکمه‌ی «مطالعه» (قبلاً
    // آیکون کوچیک به‌جای جلد و برای هر صفحه‌ی شماره‌ی عکسی یه دکمه‌ی «مشاهده N» جدا)
    const el = document.createElement('div'); el.className = 'magazine-card archive-report-card mag-issue-card';
    el.innerHTML = `<div class="archive-report-poster">${m.cover_url ? `<img src="${escAttr(m.cover_url)}" alt="${escAttr(m.title)}" draggable="false" oncontextmenu="return false" />` : (m.file_type==='images' ? ICONS.photo : ICONS.doc)}</div>
      <div class="mag-title">${escHtml(faTitle(m.title))}</div>
      <div class="mag-meta">${meta}</div>
      <div class="mag-actions"></div>`;
    const actions = el.querySelector('.mag-actions');
    if(files.length){
      el.querySelector('.archive-report-poster').style.cursor = 'pointer';
      el.querySelector('.archive-report-poster').addEventListener('click', () => openMagazineViewer(m));
      const btn = document.createElement('button');
      btn.className = 'btn primary mag-read-btn'; btn.textContent = 'مطالعه';
      btn.addEventListener('click', () => openMagazineViewer(m));
      actions.appendChild(btn);
    }
    if(isAdmin) actions.appendChild(cardAdminControls(i, MAGAZINES.length, d => moveMagazine(m, d), () => deleteMagazine(m), 'مجله‌ی ' + m.title));
    grid.appendChild(el);
  });
  if(MAGAZINES_RENDERED) MAGAZINES_RENDERED(); // جلدهای صفحه‌ی نخست (home.js)
}
export function openMagazineViewer(m){
  const files = Array.isArray(m.files) ? m.files : [];
  openDocViewer(m.title, async ()=>{
    if(!files.length) return [];
    const urls = await signStoragePaths('magazines', files);
    const isPdf = m.file_type === 'pdf';
    return files.map((f, k)=>({ kind: isPdf ? 'pdf' : 'image', url: urls[k], label: m.title + (files.length > 1 ? ' — صفحه‌ی ' + toFaDigits(k + 1) : '') }));
  });
}
export async function moveMagazine(m, direction){
  const idx = MAGAZINES.findIndex(x=>x.id===m.id);
  const swapIdx = idx + direction;
  if(swapIdx < 0 || swapIdx >= MAGAZINES.length) return;
  const other = MAGAZINES[swapIdx];
  const aOrder = m.sort_order || 0, bOrder = other.sort_order || 0;
  await Promise.all([
    api('/magazines?id=eq.'+m.id, {method:'PATCH', body: JSON.stringify({sort_order: bOrder})}),
    api('/magazines?id=eq.'+other.id, {method:'PATCH', body: JSON.stringify({sort_order: aOrder})}),
  ]);
  await loadMagazines(); renderMagazines();
}
export async function deleteMagazine(m){
  if(!await uiConfirm('مجله‌ی «' + m.title + '» حذف شود؟ فایل‌های آن هم برای همیشه پاک می‌شوند.')) return;
  try{
    const files = Array.isArray(m.files) ? m.files : [];
    if(files.length){
      await fetch(SUPABASE_URL + '/storage/v1/object/remove/magazines', {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: files }),
      });
    }
    if(m.cover_url && m.cover_url.includes('/magazine-covers/')){
      const coverPath = m.cover_url.split('/magazine-covers/')[1];
      await fetch(SUPABASE_URL + '/storage/v1/object/remove/magazine-covers', {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [coverPath] }),
      });
    }
    await api('/magazines?id=eq.'+m.id, {method:'DELETE'});
    await loadMagazines(); renderMagazines();
    showToast('مجله حذف شد');
  }catch(e){
    showToast('حذف ناموفق بود');
  }
}

