// «بارگذاری محتوا»: سه کارت انتخاب و فرم‌های بسته تحلیلی جریان، بسته‌های سایر نهادها و گزارش‌های مدارس
import { api } from '../core/api.js';
import { ARCHIVE_REPORTS, deleteArchiveReport, loadArchiveReports, renderArchiveReports } from '../features/people/archive.js';
import { authToken } from '../core/session.js';
import { escAttr, escHtml, faTitle, toFaDigits } from '../core/text.js';
import { ICONS } from '../ui/icons.js';
import { MAGAZINES, deleteMagazine, loadMagazines, renderMagazines } from '../features/reports/magazines.js';
import { navMark } from '../core/router.js';
import { publicPathOf, removeStoragePaths, sortFilesByName, uploadErrorMsg, uploadFilesWithProgress, uploadHttpError, uploadTooBig } from './upload-utils.js';
import { SCHOOL_REPORTS, deleteSchoolReport, loadSchoolReports, renderSchoolReports, schoolReportSrc } from '../features/schools/school-reports.js';
import { showToast } from '../ui/toast.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../core/config.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { switchSection } from '../app.js';
import { setAdminHook } from '../core/admin-hooks.js';

// ---- «بارگذاری محتوا» ----
export let UPLOADS_TAB = 'magazines';
export function setUploadsTab(tab){
  navMark();
  UPLOADS_TAB = tab;
  document.querySelectorAll('.upl-choice').forEach(b=>b.classList.toggle('active', b.dataset.uplTab === tab));
  ['magazines','archive','schools'].forEach(t=>{ document.getElementById('upl-pane-'+t).style.display = t === tab ? '' : 'none'; });
  setupUploadForms();
  renderUploadLists();
}
export function goToUploadsTab(tab){ switchSection('uploads'); setUploadsTab(tab); }
// بهبودهای فرم (فقط داخل همین بخش): دکمه‌ی انتخاب فایل فارسی به‌جای «Choose Files»
// مرورگر (خودِ input پنهان ولی فعال می‌مونه تا هندلرهای موجود دست‌نخورده بمونن)،
// تشخیص خودکار «نوع فایل» از فایل‌های انتخاب‌شده، تاریخ پیش‌فرض امروز + معادل شمسی
// کنار انتخاب‌گر تاریخ میلادی مرورگر
export let UPLOAD_FORMS_READY = false;
export function setupUploadForms(){
  if(!UPLOAD_FORMS_READY){
    UPLOAD_FORMS_READY = true;
    document.querySelectorAll('#sec-uploads input[type=file]').forEach(inp=>{
      const wrap = document.createElement('label'); wrap.className = 'upl-file';
      inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
      wrap.insertAdjacentHTML('beforeend', `<span class="upl-file-btn">${inp.multiple ? 'انتخاب فایل‌ها' : 'انتخاب فایل'}</span><span class="upl-file-name"></span>`);
      inp.addEventListener('change', ()=>{ updateUploadFileLabel(inp); autoUploadFileType(inp); });
    });
    ['mag-date','arc-date'].forEach(id=>{
      const el = document.getElementById(id);
      el.insertAdjacentHTML('afterend', '<span class="upl-jdate"></span>');
      el.addEventListener('input', ()=>updateUploadJDate(el));
    });
  }
  ['mag-date','arc-date'].forEach(id=>{ const el = document.getElementById(id); if(!el.value) el.value = new Date().toLocaleDateString('en-CA', { timeZone:'Asia/Tehran' }); updateUploadJDate(el); });
  document.querySelectorAll('#sec-uploads input[type=file]').forEach(updateUploadFileLabel);
}
export function updateUploadFileLabel(inp){
  const name = inp.closest('.upl-file') && inp.closest('.upl-file').querySelector('.upl-file-name');
  if(!name) return;
  const fs = Array.from(inp.files || []);
  name.textContent = !fs.length ? 'فایلی انتخاب نشده' : fs.length === 1 ? fs[0].name : toFaDigits(fs.length) + ' فایل انتخاب شد';
  name.classList.toggle('has', fs.length > 0);
}
export function autoUploadFileType(inp){
  const sel = { 'mag-files':'mag-file-type', 'arc-files':'arc-file-type' }[inp.id];
  const fs = Array.from(inp.files || []);
  if(!sel || !fs.length) return;
  document.getElementById(sel).value = fs.every(f=>/^image\//.test(f.type)) ? 'images' : 'pdf';
}
export function updateUploadJDate(el){
  const j = el.nextElementSibling;
  if(!j || !j.classList.contains('upl-jdate')) return;
  j.textContent = el.value ? new Date(el.value + 'T12:00:00Z').toLocaleDateString('fa-IR', { day:'numeric', month:'long', year:'numeric' }) : '';
}
export function renderUploadLists(){
  if(UPLOAD_FORMS_READY) setupUploadForms();
  const lists = {
    magazines: { rows: MAGAZINES, del: deleteMagazine, meta: m => [m.issue_no ? 'شماره ' + toFaDigits(m.issue_no) : '', m.publish_date ? new Date(m.publish_date).toLocaleDateString('fa-IR') : '', m.file_type === 'images' ? 'چند عکس' : 'PDF'] },
    archive:   { rows: ARCHIVE_REPORTS, del: deleteArchiveReport, meta: m => [m.source_org || '', m.publish_date ? new Date(m.publish_date).toLocaleDateString('fa-IR') : '', m.file_type === 'images' ? 'چند عکس' : 'PDF'] },
    schools:   { rows: SCHOOL_REPORTS, del: deleteSchoolReport, meta: m => [m.uploaded_at ? new Date(m.uploaded_at).toLocaleDateString('fa-IR') : '', ({ image:'تصویر', pdf:'PDF', excel:'اکسل' })[m.file_type || 'image'] || ''] },
  };
  Object.entries(lists).forEach(([k, cfg])=>{
    const el = document.getElementById('upl-list-'+k);
    const cnt = document.getElementById('upl-count-'+k);
    if(cnt) cnt.textContent = cfg.rows.length ? toFaDigits(cfg.rows.length) : '';
    if(!el) return;
    if(!cfg.rows.length){ el.innerHTML = '<div class="upl-empty">هنوز موردی بارگذاری نشده.</div>'; return; }
    el.innerHTML = '';
    cfg.rows.forEach(m=>{
      const thumbSrc = k === 'schools' ? ((m.file_type || 'image') === 'image' ? schoolReportSrc(m) : '') : m.cover_url;
      const row = document.createElement('div'); row.className = 'upl-item';
      row.innerHTML = `<span class="upl-thumb">${thumbSrc ? `<img src="${escAttr(thumbSrc)}" alt="" loading="lazy">` : ICONS.doc}</span>
        <span class="upl-meta"><b>${escHtml(faTitle(m.title) || 'بدون عنوان')}</b><span>${cfg.meta(m).filter(Boolean).map(escHtml).join('، ')}</span></span>
        <button type="button" class="upl-del">حذف</button>`;
      row.querySelector('.upl-del').addEventListener('click', () => cfg.del(m));
      el.appendChild(row);
    });
  });
}
export function detectSchoolReportFileType(file){
  const name = (file.name || '').toLowerCase();
  if(/\.pdf$/.test(name)) return 'pdf';
  if(/\.(xlsx|xls|csv)$/.test(name)) return 'excel';
  return 'image';
}
export async function uploadSchoolReportFile(file){
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = Date.now() + '-' + Math.random().toString(36).slice(2,8) + '-' + safeName;
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/school-reports/' + path, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if(!r.ok) throw await uploadHttpError(r, file);
  return { path, url: SUPABASE_URL + '/storage/v1/object/public/school-reports/' + path };
}
export async function uploadMagazineFile(file){
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = Date.now() + '-' + Math.random().toString(36).slice(2,8) + '-' + safeName;
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/magazines/' + path, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if(!r.ok) throw await uploadHttpError(r, file);
  return path;
}
// جلدها توی یه bucket عمومی جداگانه‌ن (magazine-covers) تا بدون signed URL مستقیم نمایش داده بشن —
// خودِ فایل کامل مجله همچنان توی bucket خصوصی می‌مونه
export async function uploadCoverFile(file){
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = Date.now() + '-' + Math.random().toString(36).slice(2,8) + '-' + safeName;
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/magazine-covers/' + path, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if(!r.ok) throw await uploadHttpError(r, file);
  return SUPABASE_URL + '/storage/v1/object/public/magazine-covers/' + path;
}
export async function uploadArchiveReportFile(file){
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = Date.now() + '-' + Math.random().toString(36).slice(2,8) + '-' + safeName;
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/archive-reports/' + path, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if(!r.ok) throw await uploadHttpError(r, file);
  return path;
}
export async function uploadArchiveCoverFile(file){
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = Date.now() + '-' + Math.random().toString(36).slice(2,8) + '-' + safeName;
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/archive-report-covers/' + path, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if(!r.ok) throw await uploadHttpError(r, file);
  return SUPABASE_URL + '/storage/v1/object/public/archive-report-covers/' + path;
}
export function setupUploads(){
  document.querySelectorAll('.upl-goto[data-upl]').forEach(b=>b.addEventListener('click', ()=>goToUploadsTab(b.dataset.upl)));
  document.querySelectorAll('.upl-choice[data-upl-tab]').forEach(b=>b.addEventListener('click', ()=>setUploadsTab(b.dataset.uplTab)));
  setAdminHook('renderUploadLists', renderUploadLists);
  document.getElementById('school-report-upload-btn').addEventListener('click', async () => {
    const btn = document.getElementById('school-report-upload-btn');
    const titleEl = document.getElementById('school-report-title');
    const fileEl = document.getElementById('school-report-file');
    const file = fileEl.files[0];
    if(!file){ showToast('یک فایل انتخاب کنید'); return; }
    const tooBig = uploadTooBig([file]);
    if(tooBig){ showToast(tooBig); return; }
    btn.disabled = true; btn.textContent = 'در حال بارگذاری…';
    let path = null, saved = false;
    try{
      const up = await uploadSchoolReportFile(file);
      path = up.path; const url = up.url;
      const nextOrder = SCHOOL_REPORTS.length ? Math.max(...SCHOOL_REPORTS.map(r=>r.sort_order||0)) + 1 : 0;
      const body = { title: titleEl.value.trim() || null, image_url: url, media_storage_path: path, sort_order: nextOrder, file_type: detectSchoolReportFileType(file), file_name: file.name };
      const r = await api('/school_reports', {method:'POST', headers:{Prefer:'return=minimal'}, body: JSON.stringify(body)});
      if(!r.ok) throw new Error('insert failed');
      saved = true;
      titleEl.value=''; fileEl.value='';
      await loadSchoolReports(); renderSchoolReports();
      showToast('گزارش بارگذاری شد');
    }catch(e){
      console.error(e);
      if(!saved) await removeStoragePaths('school-reports', [path]);
      showToast(saved ? 'ذخیره شد، ولی فهرست به‌روز نشد؛ صفحه را تازه کنید.' : uploadErrorMsg(e));
    }finally{
      btn.disabled = false; btn.textContent = 'بارگذاری گزارش';
    }
  });
  document.getElementById('mag-upload-btn').addEventListener('click', async () => {
    const btn = document.getElementById('mag-upload-btn');
    const titleEl = document.getElementById('mag-title');
    const issueEl = document.getElementById('mag-issue');
    const dateEl = document.getElementById('mag-date');
    const typeEl = document.getElementById('mag-file-type');
    const filesEl = document.getElementById('mag-files');
    const coverEl = document.getElementById('mag-cover');
    const title = titleEl.value.trim();
    const files = Array.from(filesEl.files || []);
    if(!title || !files.length){ showToast('عنوان و حداقل یک فایل لازم است'); return; }
    const tooBig = uploadTooBig(files.concat(coverEl.files[0] || []));
    if(tooBig){ showToast(tooBig); return; }
    btn.disabled = true; btn.textContent = 'در حال بارگذاری…';
    let paths = [], coverUrl = null, saved = false;
    try{
      paths = await uploadFilesWithProgress(sortFilesByName(files), uploadMagazineFile, 'magazines', btn);
      const coverFile = coverEl.files[0];
      if(coverFile){ btn.textContent = 'در حال بارگذاری جلد…'; coverUrl = await uploadCoverFile(coverFile); }
      const nextOrder = MAGAZINES.length ? Math.max(...MAGAZINES.map(m=>m.sort_order||0)) + 1 : 0;
      const body = { title, issue_no: issueEl.value.trim() || null, publish_date: dateEl.value || null, file_type: typeEl.value, files: paths, cover_url: coverUrl, sort_order: nextOrder };
      const r = await api('/magazines', {method:'POST', headers:{Prefer:'return=minimal'}, body: JSON.stringify(body)});
      if(!r.ok) throw new Error('insert failed');
      saved = true;
      titleEl.value=''; issueEl.value=''; dateEl.value=''; filesEl.value=''; coverEl.value='';
      await loadMagazines(); renderMagazines();
      showToast('مجله بارگذاری شد');
    }catch(e){
      console.error(e);
      // فایل‌هایی که رفتن ولی ردیفشون ثبت نشد، پاک بشن
      if(!saved){
        await removeStoragePaths('magazines', paths);
        await removeStoragePaths('magazine-covers', [publicPathOf(coverUrl, 'magazine-covers')]);
      }
      showToast(saved ? 'ذخیره شد، ولی فهرست به‌روز نشد؛ صفحه را تازه کنید.' : uploadErrorMsg(e));
    }finally{
      btn.disabled = false; btn.textContent = 'بارگذاری مجله';
    }
  });
  document.getElementById('arc-upload-btn').addEventListener('click', async () => {
    const btn = document.getElementById('arc-upload-btn');
    const titleEl = document.getElementById('arc-title');
    const sourceOrgEl = document.getElementById('arc-source-org');
    const dateEl = document.getElementById('arc-date');
    const typeEl = document.getElementById('arc-file-type');
    const filesEl = document.getElementById('arc-files');
    const coverEl = document.getElementById('arc-cover');
    const title = titleEl.value.trim();
    const sourceOrg = sourceOrgEl.value.trim();
    const files = Array.from(filesEl.files || []);
    if(!title || !sourceOrg || !files.length){ showToast('عنوان، نهاد تولیدکننده و حداقل یک فایل لازم است'); return; }
    const tooBig = uploadTooBig(files.concat(coverEl.files[0] || []));
    if(tooBig){ showToast(tooBig); return; }
    btn.disabled = true; btn.textContent = 'در حال بارگذاری…';
    let paths = [], coverUrl = null, saved = false;
    try{
      paths = await uploadFilesWithProgress(sortFilesByName(files), uploadArchiveReportFile, 'archive-reports', btn);
      const coverFile = coverEl.files[0];
      if(coverFile){ btn.textContent = 'در حال بارگذاری جلد…'; coverUrl = await uploadArchiveCoverFile(coverFile); }
      const nextOrder = ARCHIVE_REPORTS.length ? Math.max(...ARCHIVE_REPORTS.map(m=>m.sort_order||0)) + 1 : 0;
      const body = { title, source_org: sourceOrg, publish_date: dateEl.value || null, file_type: typeEl.value, files: paths, cover_url: coverUrl, sort_order: nextOrder };
      const r = await api('/archive_reports', {method:'POST', headers:{Prefer:'return=minimal'}, body: JSON.stringify(body)});
      if(!r.ok) throw new Error('insert failed');
      saved = true;
      titleEl.value=''; sourceOrgEl.value=''; dateEl.value=''; filesEl.value=''; coverEl.value='';
      await loadArchiveReports(); renderArchiveReports();
      showToast('به آرشیو اضافه شد');
    }catch(e){
      console.error(e);
      if(!saved){
        await removeStoragePaths('archive-reports', paths);
        await removeStoragePaths('archive-report-covers', [publicPathOf(coverUrl, 'archive-report-covers')]);
      }
      showToast(saved ? 'ذخیره شد، ولی فهرست به‌روز نشد؛ صفحه را تازه کنید.' : uploadErrorMsg(e));
    }finally{
      btn.disabled = false; btn.textContent = 'بارگذاری';
    }
  });
}

