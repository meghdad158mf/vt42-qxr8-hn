// تب «روزنامه‌ها»: جلد صفحه‌ی اول روزنامه‌ها، برچسب‌های تاریخ (از مدت نگهداری رسانه) و انتخاب روزنامه
import { api } from '../../core/api.js';
import { escAttr, toFaDigits } from '../../core/text.js';
import { wireMediaViewerClicks } from '../../ui/media-viewer.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { mediaRetentionHours } from '../../app.js';

export let NEWSPAPERS = [];  // {id, slug, title, edition_date, image_url, media_storage_path, reader_url}
export let NEWSPAPER_TODAYS = [];  // زیرمجموعه‌ی NEWSPAPERS مربوط به تاریخ انتخاب‌شده — برای فیلتر بدون rebuild چک‌باکس‌ها
export let NEWSPAPER_DATES = [];   // تاریخ‌های موجود (نزولی) که حداقل یه عکس پاک‌نشده دارن
export const newspaperState = { selected: [], date: null };  // date=null یعنی جدیدترین تاریخ موجود
export async function loadNewspapers(){
  // limit=1000: کیوسک جار حدود ۱۶۵ عنوان در روز داره و مدت نگهداری رسانه (۵.۲۵.۰) تا ۳ روز
  // می‌ره → تب «روزنامه‌ها» تا ۴ برگه‌ی تاریخ (~۶۶۰ ردیف). ۵۰۰ قبلی روز چهارم رو ناقص
  // می‌آورد. فیلتر تاریخ نذاشتیم چون جلدهای آخرین تاریخ (تعطیلی طولانی) هیچ‌وقت پاک نمی‌شن.
  const r = await api('/newspapers?select=*&order=edition_date.desc,title.asc&limit=1000');
  NEWSPAPERS = r.ok ? await r.json() : [];
}
// تب «روزنامه‌ها» — گرید صفحه‌ی اول روزنامه‌ها برای یه تاریخ انتخاب‌شده.
// پیش‌فرض جدیدترین تاریخ موجوده (معمولاً امروز)، ولی چون cleanup_media.py
// فقط عکس‌های قدیمی‌تر از ۳ روز رو پاک می‌کنه، تا وقتی پاک نشدن، تاریخ‌های
// قبلی هم توی newspaper-date-tabs قابل‌انتخاب می‌مونن.
export function renderNewspapers(){
  const grid = document.getElementById('newspaper-grid');
  const empty = document.getElementById('newspapers-empty');
  if(!grid) return;
  const withImage = NEWSPAPERS.filter(n => n.image_url);
  NEWSPAPER_DATES = [...new Set(withImage.map(n => n.edition_date))].sort().reverse();
  empty.style.display = NEWSPAPER_DATES.length ? 'none' : 'block';
  if(!NEWSPAPER_DATES.length){
    grid.innerHTML = '';
    NEWSPAPER_TODAYS = [];
    renderNewspaperDateTabs();
    populateNewspaperSourceOptions();
    return;
  }
  if(!newspaperState.date || !NEWSPAPER_DATES.includes(newspaperState.date)) newspaperState.date = NEWSPAPER_DATES[0];
  renderNewspaperDateTabs();
  NEWSPAPER_TODAYS = withImage.filter(n => n.edition_date === newspaperState.date);
  populateNewspaperSourceOptions();
  renderNewspaperGrid();
}
// «امروز» اینجا صریح از تاریخ تقویمی تهران گرفته می‌شه (نه تایم‌زون محلی
// مرورگر بازدیدکننده) — بعد از گرفتن رشته‌ی YYYY-MM-DD تهران، بقیه‌ی
// محاسبات روی همون رشته با UTC انجام می‌شه (چون edition_date خودش فقط
// تاریخه، بدون ساعت؛ این‌جوری هیچ ابهام تایم‌زونی توی خودِ محاسبه نمی‌مونه)
export function newspaperDateLabel(dateStr){
  const today = new Date().toLocaleDateString('en-CA', { timeZone:'Asia/Tehran' });
  const diffDays = Math.round((new Date(today+'T00:00:00Z') - new Date(dateStr+'T00:00:00Z')) / 86400000);
  if(diffDays === 0) return 'امروز';
  if(diffDays === 1) return 'دیروز';
  if(diffDays > 1) return toFaDigits(diffDays) + ' روز قبل';
  return new Date(dateStr).toLocaleDateString('fa-IR'); // حالت غیرمنتظره (تاریخ در آینده)
}
export function renderNewspaperDateTabs(){
  const wrap = document.getElementById('newspaper-date-tabs');
  if(!wrap) return;
  // همیشه ۲ گزینه‌ی ثابت (امروز/دیروز) نشون داده می‌شه؛ چون RETENTION_DAYS
  // فعلاً ۱ روزه، «۲ روز قبل» همیشه خالیه و حذف شد. فقط اونی که واقعاً
  // توی NEWSPAPER_DATES داده داره کلیک‌پذیره، بقیه غیرفعالن
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone:'Asia/Tehran' });
  // تعداد روزها از مدت نگهداری رسانه (۱۲/۲۴ ساعت → ۲، ۲ روز → ۳، ۳ روز → ۴)
  const nSlots = Math.max(2, Math.ceil(mediaRetentionHours() / 24) + 1);
  const slots = Array.from({ length: nSlots }, (_, i) => i).map(offset => {
    const d = new Date(todayStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - offset);
    return d.toISOString().slice(0, 10);
  });
  wrap.style.display = '';
  wrap.innerHTML = slots.map(d => {
    const label = newspaperDateLabel(d);
    if(!NEWSPAPER_DATES.includes(d)) return `<button disabled>${label}</button>`;
    return `<button class="${d === newspaperState.date ? 'active' : ''}" data-date="${d}">${label}</button>`;
  }).join('');
}
// فقط خودِ گرید رو بازمی‌سازه (نه چک‌باکس‌های فیلتر) — تا با تغییر انتخاب
// کاربر توی dropdown، خودِ dropdown بسته/rebuild نشه
export function renderNewspaperGrid(){
  const grid = document.getElementById('newspaper-grid');
  if(!grid) return;
  const list = newspaperState.selected.length
    ? NEWSPAPER_TODAYS.filter(n => newspaperState.selected.includes(n.slug))
    : NEWSPAPER_TODAYS;
  grid.innerHTML = list.map(n => `
    <div class="newspaper-card">
      <div class="newspaper-cover">
        <img src="${escAttr(n.image_url)}" alt="${escAttr(n.title)}" loading="lazy" draggable="false" oncontextmenu="return false"
             data-viewer-kind="image" data-viewer-src="${escAttr(n.image_url)}"${n.reader_url ? ` data-viewer-link="${escAttr(n.reader_url)}"` : ''} />
      </div>
      <div class="newspaper-title">${escAttr(n.title)}</div>
    </div>`).join('');
  wireMediaViewerClicks(grid);
}
export function updateNewspaperSourceSummary(){
  const summary = document.getElementById('newspaper-source-summary');
  if(!summary) return;
  const n = newspaperState.selected.length;
  summary.textContent = n === 0 ? 'انتخاب روزنامه‌ها…' : toFaDigits(n) + ' روزنامه انتخاب‌شده';
}
export function populateNewspaperSourceOptions(){
  const list = document.getElementById('newspaper-source-list');
  if(!list) return;
  const validSlugs = new Set(NEWSPAPER_TODAYS.map(n=>n.slug));
  newspaperState.selected = newspaperState.selected.filter(s=>validSlugs.has(s));
  list.innerHTML = NEWSPAPER_TODAYS.map(n=>{
    const checked = newspaperState.selected.includes(n.slug) ? 'checked' : '';
    return `<label><input type="checkbox" value="${escAttr(n.slug)}" ${checked}> ${escAttr(n.title)}</label>`;
  }).join('');
  list.querySelectorAll('input[type=checkbox]').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const slug = chk.value;
      if(chk.checked){ if(!newspaperState.selected.includes(slug)) newspaperState.selected.push(slug); }
      else{ newspaperState.selected = newspaperState.selected.filter(x=>x!==slug); }
      updateNewspaperSourceSummary();
      renderNewspaperGrid();
    });
  });
  updateNewspaperSourceSummary();
}
export function setupNewspapers(){
  document.getElementById('newspaper-date-tabs').addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b || !b.dataset.date) return;
    newspaperState.date = b.dataset.date;
    renderNewspapers();
  });
}

