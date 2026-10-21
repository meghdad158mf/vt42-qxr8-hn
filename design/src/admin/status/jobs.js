// «وضعیت سامانه ← کارهای خودکار» و «برنامه‌ی اجرا»: تازگی خروجی هر کار، نتیجه‌ی گیت‌هاب، جدول ساعتی امروز
import { authToken } from '../../core/session.js';
import { escAttr, escHtml, faNum, toFaDigits } from '../../core/text.js';
import { fetchExactCount } from '../../core/api.js';
import { mediaRetentionHours } from '../../data/site-settings.js';
import { newsRelTime } from '../../core/date.js';
import { SUPABASE_URL } from '../../core/config.js';

// صفحه‌ی «وضعیت سامانه» (sec-status، فقط مدیر). همه‌ی بررسی‌ها فقط با باز
// کردن همین صفحه اجرا می‌شن، نه در بارگذاری عادی سایت.
// کارها: زمان آخرین خروجی هر کار از خودِ داده‌ها + نتیجه‌ی واقعی آخرین
// اجرای گیت‌هاب (run-job با action:'status'). آستانه‌ها با تأخیر معمول
// کرون‌های گیت‌هاب (نکته‌ی عملیاتی ۲۰ CLAUDE.md) کمی دست‌بازتر گرفته شدن.
export const SYS_STATUS_JOBS = [
  { job:'eitaa', name:'جمع‌آوری ایتا',        path:'/posts?platform=eq.eitaa&select=scraped_at&order=scraped_at.desc&limit=1', col:'scraped_at', exp:'هر ۲ ساعت', warn:5, bad:12 },
  { job:'telegram', name:'جمع‌آوری تلگرام',      path:'/posts?platform=eq.telegram&select=scraped_at&order=scraped_at.desc&limit=1', col:'scraped_at', exp:'هر ۲ ساعت', warn:5, bad:12 },
  { job:'website', name:'جمع‌آوری وب‌سایت‌ها',   path:'/posts?platform=eq.website&select=scraped_at&order=scraped_at.desc&limit=1', col:'scraped_at', exp:'هر ۲ ساعت', warn:5, bad:12 },
  { job:'bale', name:'ادعاها و شایعات (بله)', path:'/posts?platform=eq.bale&select=scraped_at&order=scraped_at.desc&limit=1', col:'scraped_at', exp:'چند بار در روز', warn:12, bad:36 },
  { job:'newspapers', name:'روزنامه‌ها',            path:'/newspapers?select=scraped_at&order=scraped_at.desc&limit=1', col:'scraped_at', exp:'روزانه', warn:30, bad:54 },
  { job:'insights', name:'تحلیل «در یک نگاه»',    path:'/news_ai_insights?select=computed_at&order=computed_at.desc&limit=1', col:'computed_at', exp:'هر ۶ ساعت', warn:10, bad:24 },
  { job:'keywords', name:'کلیدواژه‌ی هوش مصنوعی', path:'/posts?ai_keywords_extracted_at=not.is.null&select=ai_keywords_extracted_at&order=ai_keywords_extracted_at.desc&limit=1', col:'ai_keywords_extracted_at', exp:'هر ۲ ساعت', warn:8, bad:24, extra: sysKeywordQueue },
  // پاک‌سازی خروجی داده‌ای نداره؛ به‌جاش شمار رسانه‌هایی که باید پاک می‌شدن و
  // نشدن (قدیمی‌تر از ۳۰ ساعت، با RETENTION_DAYS=0.5 و اجرای روزی ۲ بار)
  { job:'cleanup', name:'پاک‌سازی رسانه‌های قدیمی', exp:'روزی ۲ بار', custom: sysCleanupCheck },
  // خروجی خزنده = آخرین خبری که خوانده (crawl_seen)، نه آخرین خبر مرتبط — ممکنه چند
  // ساعت خبری درباره‌ی حوزه نباشه و این خرابی نیست (migration_041)
  { job:'hawza', name:'خزنده‌ی «درباره حوزه»', path:'/crawl_seen?select=seen_at&order=seen_at.desc&limit=1', col:'seen_at', exp:'هر ۳ ساعت', warn:7, bad:14 },
];
// تاریخ انقضای توکن‌ها — با ساخت توکن جدید، همین‌جا به‌روز بشه (CLAUDE.md)
export const SYS_TOKENS = [
  { name:'نصب خودکار تابع‌های سوپابیس', key:'SUPABASE_ACCESS_TOKEN', where:'گیت‌هاب ← Settings ← Secrets', exp:'2026-12-04' },
  { name:'اجرای دستی کارها', key:'GITHUB_DISPATCH_TOKEN', where:'سوپابیس ← Edge Functions ← Secrets', exp:'2026-12-26' },
];
export const SYS_BUCKET_NAMES = { 'post-media':'عکس/فیلم پست‌ها', 'newspaper-covers':'روزنامه‌ها', 'magazines':'مجلات', 'magazine-covers':'جلد مجلات', 'archive-reports':'بسته‌های تحلیلی', 'archive-report-covers':'جلد بسته‌ها', 'channel-avatars':'عکس منابع', 'school-reports':'گزارش مدارس', 'basirat-course-posters':'پوستر بصیرت' };
export const STORAGE_LIMIT_MB = 1024;
export const faMb = bytes => toFaDigits((bytes/1048576).toFixed(1));
export async function sysKeywordQueue(){
  const n = await fetchExactCount('/posts?ai_keywords=is.null&channels.show_in_news=eq.true&channels.platform=neq.bale', 'id,channels!inner(show_in_news,platform)');
  // روند: مقایسه با آخرین شمارشی که حداقل ۱ ساعت قبل ذخیره شده (فقط همین مرورگر)
  let prev = null;
  try{ prev = JSON.parse(localStorage.getItem('jarian_kw_queue') || 'null'); }catch(e){}
  let trend = '';
  if(prev && typeof prev.n === 'number'){
    const d = n - prev.n;
    const since = newsRelTime(new Date(prev.at).toISOString());
    trend = d === 0 ? '؛ بدون تغییر نسبت به ' + since
      : '؛ ' + faNum(Math.abs(d)) + (d > 0 ? ' تا بیشتر' : ' تا کمتر') + ' از ' + since;
  }
  if(!prev || Date.now() - prev.at > 3600000){
    try{ localStorage.setItem('jarian_kw_queue', JSON.stringify({ n, at: Date.now() })); }catch(e){}
  }
  return 'صف بررسی‌نشده: ' + faNum(n) + ' پست' + trend;
}
export async function sysCleanupCheck(){
  // مدت نگهداری + ۱۸ ساعت (فاصله‌ی دو پاک‌سازی + حاشیه)؛ پیش‌فرض ۱۲ → ۳۰ ساعت
  const cutoff = new Date(Date.now() - (mediaRetentionHours() + 18)*3600000).toISOString();
  // همون معیار خودِ cleanup_media.py (زمان دانلود فایل، media_fetched_at) — نه زمان
  // جمع‌آوری پست؛ رسانه‌ی بدون media_fetched_at هم هیچ‌وقت پاک نمی‌شه، پس شمرده می‌شه
  const n = await fetchExactCount('/posts?media_storage_path=not.is.null&or=' + encodeURIComponent('(media_fetched_at.lt.' + cutoff + ',media_fetched_at.is.null)'));
  return { cls: n > 50 ? 'bad' : n > 0 ? 'warn' : 'ok', when: n ? 'رسانه‌ی قدیمیِ پاک‌نشده: ' + faNum(n) + ' فایل' : 'رسانه‌ی قدیمیِ پاک‌نشده: ندارد' };
}
export async function sysFetchGithubRuns(){
  try{
    const r = await fetch(SUPABASE_URL + '/functions/v1/run-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ action: 'status' }),
    });
    if(!r.ok) return null;
    const data = await r.json();
    SYS_GH_HISTORY = data.history || null; // اجراهای ۳۰ ساعت اخیر برای «برنامه‌ی اجرا»
    return data.runs || null;
  }catch(e){ return null; }
}
// ---- «برنامه‌ی اجرا» (۵.۲۲.۳، خواست کاربر): خط زمانی ۱۲ ساعت گذشته تا ۱۲ ساعت آینده ----
// زمان‌بندی‌ها (UTC) — باید با cron.schedule های db/migration_040_cron_scheduler.sql یکی بمونه
export const SYS_SCHEDULES = {
  eitaa: ['0 */2'], telegram: ['15 */2'], website: ['5 */2'], bale: ['30 1,5,7,9,11,13,15,17'],
  newspapers: ['30 0,2,4,6,10'], insights: ['30 4,10,16,22'], keywords: ['30 1-23/2'], cleanup: ['15 6', '15 18'], hawza:['45 2-23/3'],
};
export let SYS_GH_HISTORY = null;
export function cronHourList(f){
  const out = new Set();
  f.split(',').forEach(part=>{
    const [range, stepS] = part.split('/');
    const step = Number(stepS) || 1;
    let a = 0, b = 23;
    if(range !== '*'){ const [x, y] = range.split('-').map(Number); a = x; b = isNaN(y) ? (stepS ? 23 : x) : y; }
    for(let h = a; h <= b; h += step) out.add(h);
  });
  return [...out];
}
export function sysPlannedTimes(job, from, to){
  const times = [];
  const day0 = Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth(), new Date(from).getUTCDate()) - 864e5;
  (SYS_SCHEDULES[job] || []).forEach(expr=>{
    const [m, h] = expr.split(' ');
    for(let d = day0; d <= to + 864e5; d += 864e5){
      cronHourList(h).forEach(hr=>{
        const t = d + hr * 3600e3 + Number(m) * 60e3;
        if(t >= from && t <= to) times.push(t);
      });
    }
  });
  return times.sort((a,b)=>a-b);
}
export function sysClock(t){ return new Date(t).toLocaleTimeString('fa-IR', { timeZone:'Asia/Tehran', hour:'2-digit', minute:'2-digit' }); }
// نسخه‌ی انتخاب کاربر: «جدول ساعتی امروز» — ستون = ساعت ۰۰ تا ۲۳ امروزِ تهران (راست به چپ)،
// ردیف = کار، عدد هر خانه = دقیقه‌ی برنامه‌ی اجرا؛ ردیف بالا = تعداد کارهای هم‌ساعت
export function sysSlotStatus(job, from, to){
  const planned = sysPlannedTimes(job, from, to);
  const hist = (SYS_GH_HISTORY && SYS_GH_HISTORY[job] || []).map(r => Object.assign({ t: new Date(r.created_at).getTime() }, r));
  const now = Date.now();
  return planned.map((t, i)=>{
    if(t > now) return { t, st:'plan' };
    if(!SYS_GH_HISTORY) return { t, st:'wait' };
    // اجرا شده؟ هر اجرایی از ۵ دقیقه قبل تا برنامه‌ی بعدی (حداکثر ۳ ساعت)
    const until = Math.min(planned[i + 1] || t + 3 * 3600e3, t + 3 * 3600e3, now + 60e3);
    const r = hist.find(x => x.t >= t - 5 * 60e3 && x.t < until);
    if(!r) return { t, st: now - t < 15 * 60e3 ? 'wait' : 'miss' }; // ۱۵ دقیقه‌ی اول هنوز «اجرا نشد» حساب نمی‌شه
    const late = Math.max(0, Math.round((r.t - t) / 60e3));
    const st = r.status !== 'completed' ? 'run' : r.conclusion === 'success' ? (late > 10 ? 'late' : 'ok')
      : (r.conclusion === 'cancelled' || r.conclusion === 'skipped') ? 'skip' : 'bad';
    return { t, st, late, at: r.t };
  });
}
export function renderSysTimeline(){
  const el = document.getElementById('sys-timeline');
  if(!el) return;
  const now = Date.now(), TEH = 3.5 * 3600e3;
  const day0 = Math.floor((now + TEH) / 864e5) * 864e5 - TEH; // نیمه‌شب امروزِ تهران
  const curH = Math.floor((now - day0) / 3600e3);
  const ST_LABEL = { plan:'در برنامه', wait:'در انتظار شروع', ok:'انجام شد', late:'انجام شد با تأخیر', run:'در حال اجرا', bad:'ناموفق', skip:'لغو شد', miss:'اجرا نشد' };
  const perHour = Array(24).fill(0);
  let done = 0, due = 0;
  // کارهایی که دقیقاً در همان دقیقه شروع می‌شن (برای نشانه‌ی «هم‌زمان»)
  const allSlots = SYS_STATUS_JOBS.map(j => ({ j, slots: sysSlotStatus(j.job, day0, day0 + 864e5) }));
  const sameMin = {};
  allSlots.forEach(({ j, slots }) => slots.forEach(x => { (sameMin[x.t] = sameMin[x.t] || []).push(j.name); }));
  const rows = allSlots.map(({ j, slots })=>{
    let cells = '';
    for(let h = 0; h < 24; h++){
      const s = slots.find(x => Math.floor((x.t - day0) / 3600e3) === h);
      if(!s){ cells += `<span class="hg-c${h === curH ? ' cur' : ''}" data-h="${h}"></span>`; continue; }
      perHour[h]++;
      if(s.st !== 'plan' && s.st !== 'wait'){ due++; if(s.st === 'ok' || s.st === 'late' || s.st === 'run') done++; }
      const m = new Date(s.t).getUTCMinutes(); // دقیقه در تهران هم همینه (اختلاف ۳:۳۰)
      let tip = j.name + ' — برنامه: ساعت ' + sysClock(s.t) + '، ' + ST_LABEL[s.st];
      if(s.at) tip += ' (شروع ' + sysClock(s.at) + (s.late ? '، ' + faNum(s.late) + ' دقیقه تأخیر' : '') + ')';
      const others = (sameMin[s.t] || []).filter(n => n !== j.name);
      if(others.length) tip += ' — هم‌زمان با: ' + others.join('، ');
      cells += `<span class="hg-c is-slot ${s.st}${others.length ? ' same' : ''}${h === curH ? ' cur' : ''}" data-h="${h}" title="${escAttr(tip)}">${toFaDigits(String(m).padStart(2, '0'))}</span>`;
    }
    return `<span class="hg-n">${escHtml(j.name)}</span>${cells}`;
  }).join('');
  let head = '<span class="hg-n hg-corner">ساعت</span>', load = '<span class="hg-n hg-corner">تعداد کار</span>';
  for(let h = 0; h < 24; h++){
    head += `<span class="hg-h${h === curH ? ' cur' : ''}" data-h="${h}">${toFaDigits(String(h).padStart(2, '0'))}</span>`;
    load += `<span class="hg-load${perHour[h] > 1 ? ' multi' : ''}${h === curH ? ' cur' : ''}" data-h="${h}" title="${perHour[h] ? escAttr(faNum(perHour[h]) + ' کار در ساعت ' + toFaDigits(String(h).padStart(2, '0'))) : ''}">${perHour[h] ? toFaDigits(perHour[h]) : ''}</span>`;
  }
  const sum = !SYS_GH_HISTORY
    ? '<div class="hg-sum">در حال دریافت اجراهای گیت‌هاب…</div>'
    : `<div class="hg-sum${due - done ? ' warn' : ''}">امروز تا این لحظه: ${faNum(done)} از ${faNum(due)} اجرا انجام شد</div>`;
  el.innerHTML = `${sum}<div class="hg-wrap"><div class="hg">${head}${load}${rows}</div></div>
    <div class="hg-leg"><span><i class="hg-c is-slot ok">۰۰</i>انجام شد</span><span><i class="hg-c is-slot late">۰۰</i>با تأخیر بیش از ۱۰ دقیقه</span><span><i class="hg-c is-slot bad">۰۰</i>ناموفق</span><span><i class="hg-c is-slot miss">۰۰</i>اجرا نشد</span><span><i class="hg-c is-slot run">۰۰</i>در حال اجرا</span><span><i class="hg-c is-slot plan">۰۰</i>در برنامه</span><span><i class="hg-c is-slot plan same">۳۰</i>هم‌زمان با کار دیگر (همان دقیقه)</span><span class="hg-leg-note">عدد هر خانه = دقیقه‌ی اجرا؛ ستونی که ماوس رویش است پررنگ می‌شود تا کارهای هم‌ساعت دیده شوند.</span></div>`;
  // پررنگ شدن ستون زیر ماوس/لمس — کارهای هم‌ساعت کنار هم دیده می‌شن
  const grid = el.querySelector('.hg');
  const mark = h => grid.querySelectorAll('[data-h]').forEach(c => c.classList.toggle('col-hi', c.dataset.h === h));
  grid.addEventListener('mouseover', e => { const c = e.target.closest('[data-h]'); if(c) mark(c.dataset.h); });
  grid.addEventListener('mouseleave', () => mark(null));
  grid.addEventListener('click', e => { const c = e.target.closest('[data-h]'); if(c) mark(c.dataset.h); });
  // گوشی: جدول افقی اسکرول می‌خوره — ساعت فعلی بیاد توی دید
  const wrap = el.querySelector('.hg-wrap'), cur = grid.querySelector('.hg-h.cur');
  if(wrap && cur && wrap.scrollWidth > wrap.clientWidth){
    const wr = wrap.getBoundingClientRect(), cr = cur.getBoundingClientRect();
    wrap.scrollLeft += (cr.left + cr.width / 2) - (wr.left + wr.width / 2);
  }
}
export function sysGithubLine(run){
  if(!run) return { cls:'', text:'نتیجه‌ی گیت‌هاب: در دسترس نیست' };
  const when = newsRelTime(run.created_at);
  if(run.status !== 'completed'){
    // وضعیت «در حال اجرا»ی API گیت‌هاب گاهی ساعت‌ها دیر به‌روز می‌شه (نکته‌ی ۲۵)
    const fresh = Date.now() - new Date(run.created_at).getTime() < 3600000;
    return { cls:'', text: fresh ? 'گیت‌هاب: در حال اجرا (' + when + ')' : 'گیت‌هاب: آخرین اجرا ' + when };
  }
  if(run.conclusion === 'success') return { cls:'ok', text:'✓ گیت‌هاب: موفق، ' + when };
  if(run.conclusion === 'cancelled' || run.conclusion === 'skipped') return { cls:'', text:'گیت‌هاب: لغوشده، ' + when };
  return { cls:'bad', text:'✗ گیت‌هاب: ناموفق، ' + when };
}

