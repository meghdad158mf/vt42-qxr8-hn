// «برنامه مدارس»: گالری خروجی Power BI (school_reports، bucket خصوصی با امضای دسته‌ای) با چیپ ماه شمسی؛ فرم بارگذاری در app.js
import { api } from '../../core/api.js';
import { authToken, currentRole } from '../../core/session.js';
import { escAttr, escHtml, faTitle, toFaDigits } from '../../core/text.js';
import { JALALI_MONTHS, calParts } from '../../core/date.js';
import { openDocViewer } from '../../ui/doc-viewer.js';
import { showToast } from '../../ui/toast.js';
import { signStoragePaths } from '../../core/signed-urls.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../core/config.js';
import { uiConfirm } from '../../ui/confirm.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { renderUploadLists } from '../../app.js';

export let SCHOOL_REPORTS = []; // {id, title, image_url, media_storage_path, sort_order, uploaded_at, file_type, file_name} — گزارش‌های تحلیل Power BI (تصویر/PDF/اکسل)
export async function loadSchoolReports(){
  const r = await api('/school_reports?select=*&order=sort_order.asc,uploaded_at.desc');
  SCHOOL_REPORTS = r.ok ? await r.json() : [];
  await signSchoolReports(SCHOOL_REPORTS);
}
// bucket «school-reports» از مهر ۱۴۰۵ خصوصیه (migration_038) — عکس‌ها با signed URL چندساعته
// نمایش داده می‌شن و فایل‌های PDF/اکسل با signed URL شصت‌ثانیه‌ای باز می‌شن (مثل مجلات).
// تا وقتی migration اجرا نشده، امضا شکست می‌خوره و نشانی عمومی قبلی (image_url) استفاده می‌شه.
export const SCHOOL_REPORT_IMG_TTL = 6 * 3600;
export function schoolReportPath(r){
  if(r.media_storage_path) return r.media_storage_path;
  const m = /\/school-reports\/([^?]+)$/.exec(r.image_url || '');
  return m ? m[1] : null;
}
export function schoolReportSrc(r){ return r.signed_url || r.image_url; }
export async function signSchoolReports(rows){
  const paths = [...new Set(rows.map(schoolReportPath).filter(Boolean))];
  if(!paths.length) return;
  try{
    const res = await fetch(SUPABASE_URL + '/storage/v1/object/sign/school-reports', {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: SCHOOL_REPORT_IMG_TTL, paths }),
    });
    if(!res.ok) throw new Error('sign failed');
    const out = await res.json();
    const map = new Map((Array.isArray(out) ? out : []).filter(x => x && x.signedURL && !x.error).map(x => [x.path, SUPABASE_URL + '/storage/v1' + x.signedURL]));
    rows.forEach(r => { r.signed_url = map.get(schoolReportPath(r)) || null; });
  }catch(e){
    rows.forEach(r => { r.signed_url = null; });
  }
}
// «برنامه مدارس» (۵.۱۹.۰): گزارش‌ها زیر تیتر ماه (شمسی، از تاریخ بارگذاری) + چیپ‌های ماه برای
// پیدا کردن گزارش یه ماه خاص؛ تصویرها با کلیک در نمایشگر سند باز می‌شن (بزرگ‌نمایی + ورق زدن
// بین همه‌ی گزارش‌های تصویری)؛ PDF/اکسل کارت جدا با نوع فایل و «مشاهده/دانلود»
export var SCHOOL_MONTH = '';
export const SCH_TYPE = {
  pdf:   { label:'PDF',  action:'مشاهده', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>' },
  excel: { label:'اکسل', action:'دانلود', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/></svg>' },
};
export function schoolMonthKey(r){
  if(!r.uploaded_at) return '';
  const p = calParts(new Date(r.uploaded_at), 'persian');
  return p.year + '-' + String(p.month).padStart(2, '0');
}
export function schoolMonthLabel(key){
  const [y, m] = key.split('-').map(Number);
  return (JALALI_MONTHS[m - 1] || '') + ' ' + toFaDigits(y);
}
export function openSchoolImage(r){
  const imgs = SCHOOL_REPORTS.filter(x => (x.file_type || 'image') === 'image');
  openDocViewer('گزارش‌های برنامه مدارس', ()=> imgs.map(x => ({ kind:'image', url: schoolReportSrc(x), label: x.title || '' })), Math.max(0, imgs.indexOf(r)));
}
export function openSchoolReportFile(r){
  const path = schoolReportPath(r);
  const kind = (r.file_type === 'pdf') ? 'pdf' : 'file';
  openDocViewer(r.title || 'گزارش', async ()=>{
    let url = null;
    if(path){ try{ url = (await signStoragePaths('school-reports', [path]))[0]; }catch(e){} }
    return [{ kind, url: url || r.image_url, label: r.title || '' }];
  });
}
export function renderSchoolReports(){
  renderUploadLists();
  const list = document.getElementById('school-report-list');
  const empty = document.getElementById('school-reports-empty');
  if(!list) return;
  const isAdmin = currentRole === 'app_admin';
  empty.style.display = SCHOOL_REPORTS.length ? 'none' : 'block';
  // چیپ‌های ماه (فقط وقتی بیش از یک ماه هست)
  const months = [...new Set(SCHOOL_REPORTS.map(schoolMonthKey).filter(Boolean))].sort().reverse();
  if(SCHOOL_MONTH && !months.includes(SCHOOL_MONTH)) SCHOOL_MONTH = '';
  const row = document.getElementById('sch-month-row');
  row.style.display = months.length > 1 ? '' : 'none';
  row.innerHTML = [`<button type="button" class="news-topic-chip${SCHOOL_MONTH ? '' : ' active'}" data-m="">همه</button>`]
    .concat(months.map(k => `<button type="button" class="news-topic-chip${SCHOOL_MONTH === k ? ' active' : ''}" data-m="${k}">${schoolMonthLabel(k)}</button>`)).join('');
  list.innerHTML = '';
  let lastMonth = null;
  SCHOOL_REPORTS.forEach(r => {
    const mk = schoolMonthKey(r);
    if(SCHOOL_MONTH && mk !== SCHOOL_MONTH) return;
    if(months.length > 1 && mk && mk !== lastMonth){
      lastMonth = mk;
      const h = document.createElement('h4'); h.className = 'pf-group-title sch-month-title';
      h.textContent = schoolMonthLabel(mk);
      list.appendChild(h);
    }
    const el = document.createElement('div'); el.className = 'school-report-block';
    const type = r.file_type || 'image';
    const dateStr = r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString('fa-IR') : '';
    const titleText = escHtml(faTitle(r.title) || 'گزارش بدون عنوان');
    if(type === 'image'){
      el.innerHTML = `<button type="button" class="school-report-img-btn" aria-label="بزرگ‌نمایی ${escAttr(r.title || 'گزارش')}"><img class="school-report-full-img" src="${escAttr(schoolReportSrc(r))}" alt="${escAttr(r.title||'')}" loading="lazy" /><span class="school-report-zoom"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/></svg>بزرگ‌نمایی</span></button>
        <div class="school-report-caption">
          <span class="school-report-title">${titleText}</span>
          <span class="school-report-date">${dateStr}</span>
        </div>`;
      el.querySelector('.school-report-img-btn').addEventListener('click', () => openSchoolImage(r));
    }else{
      const t = SCH_TYPE[type] || SCH_TYPE.pdf;
      el.innerHTML = `
        <button type="button" class="school-report-file-card">
          <span class="school-report-file-icon sch-${type}">${t.icon}</span>
          <span class="school-report-file-text"><span class="school-report-title">${titleText}</span><span class="school-report-date">${t.label}، ${dateStr}</span></span>
          <span class="school-report-file-action">${t.action}</span>
        </button>`;
      el.querySelector('.school-report-file-card').addEventListener('click', () => openSchoolReportFile(r));
    }
    if(isAdmin){
      const del = document.createElement('button'); del.className = 'del-btn'; del.textContent = '✕';
      del.title = 'حذف گزارش'; del.setAttribute('aria-label', 'حذف گزارش');
      del.style.cssText = 'position:absolute;top:8px;left:8px;background:rgba(20,27,36,0.6);color:#fff;z-index:2;';
      del.addEventListener('click', e => { e.stopPropagation(); deleteSchoolReport(r); });
      el.style.position = 'relative';
      el.appendChild(del);
    }
    list.appendChild(el);
  });
}
export async function deleteSchoolReport(r){
  if(!await uiConfirm('این گزارش حذف شود؟')) return;
  try{
    if(r.media_storage_path){
      await fetch(SUPABASE_URL + '/storage/v1/object/remove/school-reports', {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [r.media_storage_path] }),
      });
    }
    await api('/school_reports?id=eq.'+r.id, {method:'DELETE'});
    await loadSchoolReports(); renderSchoolReports();
    showToast('گزارش حذف شد');
  }catch(e){
    showToast('حذف ناموفق بود');
  }
}
export function setupSchoolReports(){
  document.getElementById('sch-month-row').addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    SCHOOL_MONTH = b.dataset.m || '';
    renderSchoolReports();
  });
}

