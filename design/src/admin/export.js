// «خروجی محتوا»: پست‌های یک بازه (از سرور، صفحه‌ای) به CSV/JSON و گزارش آنالیز
import { api, fetchExactCount } from '../core/api.js';
import { calParts } from '../core/date.js';
import { CATEGORIES, CHANNELS, HIDDEN_POST_IDS, catNameOf, chById, chName } from '../data/store.js';
import { downloadBlob, downloadCsv } from './download.js';
import { escHtml, faNum } from '../core/text.js';
import { setupJalaliRange } from '../ui/jalali-range.js';
import { showToast } from '../ui/toast.js';
import { uiConfirm } from '../ui/confirm.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { topChannelsByCount, wordFrequency } from '../app.js';

// ---- export ----
export function populateExportFilters(){
  const chOpts = '<option value="">همه‌ی منابع</option>' + CHANNELS.map(c=>`<option value="${c.id}">${escHtml(c.title||c.username)}</option>`).join('');
  const catOpts = '<option value="">همه‌ی موضوع‌ها</option>' + CATEGORIES.map(c=>`<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
  document.getElementById('export-posts-channel').innerHTML = chOpts;
  document.getElementById('export-posts-cat').innerHTML = catOpts;
}
export function selectedFormat(rowId){
  const sel = document.querySelector('#'+rowId+' .fmt.sel');
  return sel ? sel.dataset.f : 'csv';
}
// ---- «خروجی محتوا» (۵.۲۰.۰) ----
// داده‌ها برای کل بازه از سرور گرفته می‌شن (صفحه‌ای، ۱۰۰۰تایی) — قبلاً فقط از ۱۰۰۰ مطلب آخرِ
// POSTS_CACHE ساخته می‌شد و بازه‌ی طولانی بی‌صدا ناقص می‌اومد. بازه بر اساس scraped_at
// (پست‌های ایتا posted_at ندارن) و نیمه‌شب تهران؛ بدون تاریخ = ۳۰ روز اخیر.
export const EXPORT_RANGE = { posts:{ from:'', to:'' }, report:{ from:'', to:'' } };
export function exportBounds(k){
  const r = EXPORT_RANGE[k];
  const tehranIso = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone:'Asia/Tehran' });
  const to = r.to || tehranIso(Date.now());
  const from = r.from || tehranIso(Date.now() - 29*86400000);
  if(from > to) return null;
  const start = new Date(from + 'T00:00:00+03:30');
  const end = new Date(new Date(to + 'T00:00:00+03:30').getTime() + 86400000);
  const jl = iso => { const p = calParts(new Date(iso + 'T12:00:00+03:30'), 'persian'); return p.year + '-' + String(p.month).padStart(2,'0') + '-' + String(p.day).padStart(2,'0'); };
  return { start: start.toISOString(), end: end.toISOString(), tag: jl(from) + '_' + jl(to) };
}
// همه‌ی مطالب بازه، صفحه‌ای؛ onProgress(دریافت‌شده، کل). پست‌های پنهان‌شده حذف می‌شن.
export async function fetchPostsInRange(b, filter, cols, onProgress){
  const base = '/posts?scraped_at=gte.' + encodeURIComponent(b.start) + '&scraped_at=lt.' + encodeURIComponent(b.end) + (filter || '');
  const total = await fetchExactCount(base);
  if(total > 30000 && !await uiConfirm(faNum(total) + ' مطلب در این بازه هست و دریافتش ممکن است چند دقیقه طول بکشد. ادامه می‌دهید؟')) return null;
  const out = [];
  for(let off = 0; off < Math.max(total, 1); off += 1000){
    onProgress(out.length, total);
    const r = await api(base + '&select=' + cols + '&order=scraped_at.asc,id.asc&limit=1000&offset=' + off);
    if(!r.ok) throw new Error('posts ' + r.status);
    const rows = await r.json();
    out.push(...rows);
    if(rows.length < 1000) break;
  }
  return out.filter(p=>!HIDDEN_POST_IDS.has(Number(p.id)));
}
export const EXPORT_PLAT = { eitaa:'ایتا', telegram:'تلگرام', website:'وب‌سایت', bale:'بله' };
export async function runExport(btn, label, job){
  btn.disabled = true;
  try{ await job(t=>{ btn.textContent = t; }); }
  catch(e){ console.error(e); showToast('دریافت اطلاعات انجام نشد؛ اتصال را بررسی کنید و دوباره امتحان کنید'); }
  finally{ btn.disabled = false; btn.textContent = label; }
}
export function exportPosts(){
  const b = exportBounds('posts');
  if(!b){ showToast('تاریخ «از» بعد از تاریخ «تا» است'); return; }
  const fmt = selectedFormat('export-posts-fmt');
  const chFilter = document.getElementById('export-posts-channel').value;
  const catFilter = document.getElementById('export-posts-cat').value;
  let filter = '';
  if(chFilter) filter = '&channel_id=eq.' + Number(chFilter);
  else if(catFilter){
    const ids = CHANNELS.filter(c=>String(c.category_id) === catFilter).map(c=>c.id);
    if(!ids.length){ showToast('هیچ منبعی با این موضوع نیست'); return; }
    filter = '&channel_id=in.(' + ids.join(',') + ')';
  }
  const btn = document.getElementById('export-posts-btn');
  runExport(btn, 'دانلود خروجی پست‌ها', async setLabel=>{
    setLabel('در حال شمارش…');
    const list = await fetchPostsInRange(b, filter, 'id,channel_id,platform,title,text,link,posted_at,scraped_at', (n, t)=>setLabel('در حال دریافت ' + faNum(n) + ' از ' + faNum(t) + '…'));
    if(!list) return;
    if(!list.length){ showToast('در این بازه مطلبی پیدا نشد'); return; }
    const dateF = new Intl.DateTimeFormat('fa-IR-u-nu-latn', { timeZone:'Asia/Tehran', year:'numeric', month:'2-digit', day:'2-digit' });
    const timeF = new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Tehran', hour:'2-digit', minute:'2-digit' });
    const plain = t => String(t || '').replace(/<[^>]+>/g, '');
    const name = 'jarian-posts-' + b.tag;
    if(fmt === 'json'){
      const rows = list.map(p=>({ channel: chName(p.channel_id), platform: p.platform, category: catNameOf(p.channel_id), title: p.title || null, text: plain(p.text), link: p.link, posted_at: p.posted_at, scraped_at: p.scraped_at }));
      downloadBlob(name + '.json', JSON.stringify(rows, null, 2), 'application/json');
    }else{
      const cols = ['منبع','بستر','موضوع منبع','عنوان','متن','لینک','تاریخ (شمسی)','ساعت'];
      const rows = list.map(p=>{ const d = new Date(p.posted_at || p.scraped_at); return { 'منبع': chName(p.channel_id), 'بستر': EXPORT_PLAT[p.platform] || p.platform, 'موضوع منبع': catNameOf(p.channel_id), 'عنوان': p.title || '', 'متن': plain(p.text), 'لینک': p.link || '', 'تاریخ (شمسی)': dateF.format(d), 'ساعت': timeF.format(d) }; });
      downloadCsv(name + '.csv', rows, cols);
    }
    showToast('خروجی ' + faNum(list.length) + ' مطلب آماده شد');
  });
}
export function exportReport(){
  const b = exportBounds('report');
  if(!b){ showToast('تاریخ «از» بعد از تاریخ «تا» است'); return; }
  const fmt = selectedFormat('export-report-fmt');
  const type = document.getElementById('export-report-type').value;
  const btn = document.getElementById('export-report-btn');
  runExport(btn, 'دانلود گزارش آنالیز', async setLabel=>{
    setLabel('در حال شمارش…');
    const list = await fetchPostsInRange(b, '', type === 'words' ? 'id,channel_id,text' : 'id,channel_id', (n, t)=>setLabel('در حال دریافت ' + faNum(n) + ' از ' + faNum(t) + '…'));
    if(!list) return;
    if(!list.length){ showToast('در این بازه مطلبی پیدا نشد'); return; }
    let rows, cols, name;
    if(type === 'words'){
      rows = wordFrequency(list, 100).map(([w, n])=>({ 'واژه': w, 'تعداد': n }));
      cols = ['واژه','تعداد']; name = 'jarian-words-' + b.tag;
    }else{
      rows = topChannelsByCount(list).map(([id, n])=>{ const ch = chById(Number(id)); return { 'منبع': chName(Number(id)), 'بستر': ch ? (EXPORT_PLAT[ch.platform] || ch.platform) : '', 'تعداد مطلب': n }; });
      cols = ['منبع','بستر','تعداد مطلب']; name = 'jarian-sources-' + b.tag;
    }
    if(fmt === 'json') downloadBlob(name + '.json', JSON.stringify(rows, null, 2), 'application/json');
    else downloadCsv(name + '.csv', rows, cols);
    showToast('گزارش آماده شد (' + faNum(list.length) + ' مطلب بررسی شد)');
  });
}
export function setupExport(){
  document.querySelectorAll('.fmt-row').forEach(row=>{
    row.addEventListener('click', e=>{
      const b = e.target.closest('.fmt'); if(!b) return;
      row.querySelectorAll('.fmt').forEach(x=>x.classList.remove('sel'));
      b.classList.add('sel');
    });
  });
  ['posts','report'].forEach(k=>{
    const panel = document.getElementById('export-' + k + '-panel');
    setupJalaliRange(panel, (which, iso)=>{ EXPORT_RANGE[k][which] = iso; });
  });
  document.getElementById('sec-export').addEventListener('click', e=>{
    const b = e.target.closest('.exp-clear'); if(!b) return;
    const k = b.dataset.clear;
    EXPORT_RANGE[k] = { from:'', to:'' };
    document.querySelectorAll('#export-' + k + '-panel .jdate select').forEach(sel=>{ sel.value = ''; });
  });
}

