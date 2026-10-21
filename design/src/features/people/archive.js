// تب «بسته‌های تحلیلی» یادداشت‌ها: تولیدات سایر نهادها (archive_reports) در نمایشگر سند
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

export let ARCHIVE_REPORTS = [];   // {id, title, source_org, publish_date, file_type, files, cover_url, uploaded_at}
export async function loadArchiveReports(){
  const r = await api('/archive_reports?select=*&order=sort_order.asc,uploaded_at.desc');
  ARCHIVE_REPORTS = r.ok ? await r.json() : [];
}
// ---- زیرتب‌های «ضمیمه جریان» (بخش مستقل، نه زیرمجموعه‌ی بخش تحلیلی) ----
// «سایر بسته‌های تحلیلی»: برخلاف مجلات جریان، این‌ها تولیدات نهادهای دیگه‌ست
// که فقط بایگانی می‌کنیم — همون الگوی داده/Storage مجلات (bucket خصوصی برای
// فایل + bucket عمومی برای جلد)، فقط با یه ستون اضافه‌ی source_org.
export function renderArchiveReports(){
  adminHook('renderUploadLists'); // فهرست «بارگذاری محتوا» (admin/uploads.js)
  const grid = document.getElementById('archive-report-grid');
  const empty = document.getElementById('archive-reports-empty');
  if(!grid) return;
  const isAdmin = currentRole === 'app_admin';
  grid.innerHTML = '';
  empty.style.display = ARCHIVE_REPORTS.length ? 'none' : 'block';
  ARCHIVE_REPORTS.forEach((m, i)=>{
    const files = Array.isArray(m.files) ? m.files : [];
    // ۵.۲۲.۰: هم‌شکل کارت‌های «بسته تحلیلی جریان» — جلد + عنوان + متا با ارقام فارسی + «مطالعه»
    // (قبلاً فقط کلیک روی جلد، و فقط فایل اول در زبانه‌ی جدید باز می‌شد)
    const meta = [
      m.source_org || '',
      m.publish_date ? new Date(m.publish_date).toLocaleDateString('fa-IR') : '',
      m.file_type === 'images' ? (toFaDigits(files.length) + ' صفحه') : (files.length > 1 ? toFaDigits(files.length) + ' فایل PDF' : 'PDF'),
    ].filter(Boolean).map(escHtml).join('، ');
    const el = document.createElement('div'); el.className = 'magazine-card archive-report-card mag-issue-card';
    el.innerHTML = `<div class="archive-report-poster">${m.cover_url ? `<img src="${escAttr(m.cover_url)}" alt="${escAttr(m.title)}" draggable="false" oncontextmenu="return false" />` : (m.file_type==='images' ? ICONS.photo : ICONS.doc)}</div>
      <div class="mag-title">${escHtml(faTitle(m.title))}</div>
      <div class="mag-meta">${meta}</div>
      <div class="mag-actions"></div>`;
    const poster = el.querySelector('.archive-report-poster');
    const actions = el.querySelector('.mag-actions');
    if(files.length){
      poster.style.cursor = 'pointer';
      poster.addEventListener('click', () => openArchiveViewer(m));
      const btn = document.createElement('button');
      btn.className = 'btn primary mag-read-btn'; btn.textContent = 'مطالعه';
      btn.addEventListener('click', () => openArchiveViewer(m));
      actions.appendChild(btn);
    }
    if(isAdmin) actions.appendChild(cardAdminControls(i, ARCHIVE_REPORTS.length, d => moveArchiveReport(m, d), () => deleteArchiveReport(m), m.title));
    grid.appendChild(el);
  });
}
// نمایشگر سند (همون «بسته تحلیلی جریان»): همه‌ی فایل‌ها، ورق‌زدن، بدون window.open بعد از await
export function openArchiveViewer(m){
  const files = Array.isArray(m.files) ? m.files : [];
  const title = faTitle(m.title || 'بسته‌ی تحلیلی');
  openDocViewer(title, async ()=>{
    if(!files.length) return [];
    const urls = await signStoragePaths('archive-reports', files);
    return files.map((f, k)=>{
      const isPdf = /\.pdf$/i.test(f) || (m.file_type === 'pdf' && !/\.(jpe?g|png|webp|gif)$/i.test(f));
      return { kind: isPdf ? 'pdf' : 'image', url: urls[k], label: title + (files.length > 1 ? ' — ' + (isPdf ? 'فایل ' : 'صفحه‌ی ') + toFaDigits(k + 1) : '') };
    });
  });
}
export async function moveArchiveReport(m, direction){
  const idx = ARCHIVE_REPORTS.findIndex(x=>x.id===m.id);
  const swapIdx = idx + direction;
  if(swapIdx < 0 || swapIdx >= ARCHIVE_REPORTS.length) return;
  const other = ARCHIVE_REPORTS[swapIdx];
  const aOrder = m.sort_order || 0, bOrder = other.sort_order || 0;
  await Promise.all([
    api('/archive_reports?id=eq.'+m.id, {method:'PATCH', body: JSON.stringify({sort_order: bOrder})}),
    api('/archive_reports?id=eq.'+other.id, {method:'PATCH', body: JSON.stringify({sort_order: aOrder})}),
  ]);
  await loadArchiveReports(); renderArchiveReports();
}
export async function deleteArchiveReport(m){
  if(!await uiConfirm('«' + m.title + '» از آرشیو حذف شود؟ فایل‌های آن هم برای همیشه پاک می‌شوند.')) return;
  try{
    const files = Array.isArray(m.files) ? m.files : [];
    if(files.length){
      await fetch(SUPABASE_URL + '/storage/v1/object/remove/archive-reports', {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: files }),
      });
    }
    if(m.cover_url && m.cover_url.includes('/archive-report-covers/')){
      const coverPath = m.cover_url.split('/archive-report-covers/')[1];
      await fetch(SUPABASE_URL + '/storage/v1/object/remove/archive-report-covers', {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [coverPath] }),
      });
    }
    await api('/archive_reports?id=eq.'+m.id, {method:'DELETE'});
    await loadArchiveReports(); renderArchiveReports();
    showToast('از آرشیو حذف شد');
  }catch(e){
    showToast('حذف ناموفق بود');
  }
}

