// «وضعیت سامانه»: فضای ذخیره‌سازی، مدت نگهداری رسانه و سابقه‌ی ظرفیت (migration_043)
import { api } from '../../core/api.js';
import { calParts, jalaliMonthStarts } from '../../core/date.js';
import { escAttr, escHtml, faNum, toFaDigits } from '../../core/text.js';
import { renderNewspaperDateTabs } from '../../features/news/newspapers.js';
import { RETENTION_OPTIONS, mediaRetentionHours } from '../../data/site-settings.js';
import { saveSiteSetting } from '../site-settings.js';
import { showToast } from '../../ui/toast.js';
import { STORAGE_LIMIT_MB, SYS_BUCKET_NAMES, faMb } from './jobs.js';
import { tehranDateStr } from '../activity.js';
import { uiConfirm } from '../../ui/confirm.js';

export async function renderSysStorage(){
  const el = document.getElementById('sys-storage');
  el.innerHTML = '<div class="sys-note">در حال بررسی…</div>';
  try{
    const r = await api('/rpc/storage_usage', { method:'POST', body:'{}' });
    if(r.status === 404){ el.innerHTML = '<div class="sys-note">برای نمایش این بخش، فایل <b>db/migration_034_system_status.sql</b> باید یک‌بار در SQL Editor سوپابیس اجرا شود.</div>'; return; }
    if(!r.ok) throw new Error('storage_usage ' + r.status);
    const rows = (await r.json()).sort((a,b)=>b.size_bytes - a.size_bytes);
    const total = rows.reduce((t,x)=>t + Number(x.size_bytes||0), 0);
    SYS_STORAGE = { total, postMedia: Number((rows.find(x=>x.bucket_id === 'post-media') || {}).size_bytes || 0) };
    renderSysRetention();
    const pct = Math.min(100, total / (STORAGE_LIMIT_MB*1048576) * 100);
    const cls = pct >= 85 ? 'bad' : pct >= 65 ? 'warn' : '';
    el.innerHTML = `<div class="sys-storage-head"><span><b>${faMb(total)}</b> از ${faNum(STORAGE_LIMIT_MB)} مگابایت</span><span>${toFaDigits(pct.toFixed(0))}٪</span></div>
      <div class="sys-bar ${cls}"><span style="width:${pct.toFixed(1)}%"></span></div>
      <div class="sys-storage-buckets">${rows.filter(x=>Number(x.file_count)>0).map(x=>`<span>${escHtml(SYS_BUCKET_NAMES[x.bucket_id]||x.bucket_id)}: ${faMb(x.size_bytes)} مگ (${faNum(x.file_count)} فایل)</span>`).join('') || '<span>هیچ فایلی ذخیره نشده</span>'}</div>`;
  }catch(e){
    console.error(e);
    el.innerHTML = '<div class="sys-note">خطا در دریافت حجم فضای ذخیره‌سازی.</div>';
  }
}
export const RETENTION_MAX_PCT = 85;
export let SYS_STORAGE = null; // {total, postMedia}
export function retentionProjectedPct(h){
  if(!SYS_STORAGE) return null;
  const cur = mediaRetentionHours();
  const pm = SYS_STORAGE.postMedia * (h + 12) / (cur + 12);
  return (SYS_STORAGE.total - SYS_STORAGE.postMedia + pm) / (STORAGE_LIMIT_MB*1048576) * 100;
}
export function renderSysRetention(){
  const el = document.getElementById('sys-retention');
  if(!el) return;
  const cur = mediaRetentionHours();
  el.innerHTML = `<div class="sys-ret">
    <label for="sys-ret-sel"><b>مدت نگهداری عکس و فیلم پست‌ها</b><span>قدیمی‌ترها هر روز ساعت ۹:۴۵ و ۲۱:۴۵ پاک می‌شوند؛ متن پست‌ها همیشه می‌ماند.</span></label>
    <div class="sys-ret-ctl">
      <select id="sys-ret-sel">${RETENTION_OPTIONS.map(([h, l])=>{
        const pct = retentionProjectedPct(h);
        const est = pct === null ? '' : ' — حدود ' + toFaDigits(Math.round(pct)) + '٪ فضا' + (pct > RETENTION_MAX_PCT ? ' (بیش از حد مجاز)' : '');
        return `<option value="${h}" ${h === cur ? 'selected' : ''}>${l}${h === cur ? ' (فعلی)' : est}</option>`;
      }).join('')}</select>
      <button type="button" class="btn btn-sm" id="sys-ret-save" onclick="saveMediaRetention()">ذخیره</button>
    </div>
  </div>`;
}
export async function saveMediaRetention(){
  const h = Number(document.getElementById('sys-ret-sel').value);
  const cur = mediaRetentionHours();
  if(h === cur){ showToast('مدت نگهداری همان مقدار فعلی است.'); return; }
  const pct = retentionProjectedPct(h);
  if(pct !== null && pct > RETENTION_MAX_PCT){
    showToast('با این مدت، فضای ذخیره‌سازی حدود ' + toFaDigits(Math.round(pct)) + '٪ پر می‌شود و ممکن است سایت قفل شود؛ مدت کوتاه‌تری انتخاب کنید.');
    return;
  }
  const label = (RETENTION_OPTIONS.find(([x])=>x === h) || [0, ''])[1];
  if(!await uiConfirm('تغییر مدت نگهداری رسانه به ' + label + '\n' + (h > cur ? 'از این پس عکس‌ها و فیلم‌ها بیشتر می‌مانند و فضای بیشتری می‌گیرند؛ عکس‌هایی که تا الان پاک شده‌اند برنمی‌گردند.' : 'در اجرای بعدی پاک‌سازی، عکس‌ها و فیلم‌های قدیمی‌تر از ' + label + ' پاک می‌شوند.'))) return;
  const btn = document.getElementById('sys-ret-save');
  btn.disabled = true;
  try{
    await saveSiteSetting('media_retention_hours', h);
    showToast('ذخیره شد؛ از اجرای بعدی پاک‌سازی اعمال می‌شود.');
    renderNewspaperDateTabs();
  }catch(e){
    console.error(e);
    showToast('ذخیره نشد. اتصال اینترنت را بررسی کنید؛ اگر مشکل ماند، migration_043 را در SQL Editor اجرا کنید.');
  }finally{ btn.disabled = false; }
  renderSysRetention();
}
// ---- سابقه‌ی ظرفیت (۵.۲۵.۰، capacity_snapshots — migration_043) ----
export const DB_LIMIT_MB = 500;
export const CAP_DB_NAMES = { posts:'پست‌ها', hawza:'«درباره حوزه» (خزنده)', logs:'لاگ‌ها و آمار', other:'بقیه (منابع، روزنامه‌ها، تنظیمات…)' };
export let CAP_ROWS = null, CAP_KIND = 'storage', CAP_RANGE = 30, CAP_MISSING = false;
export function capLimitBytes(kind){ return (kind === 'db' ? DB_LIMIT_MB : STORAGE_LIMIT_MB) * 1048576; }
export function capCatName(kind, c){ return kind === 'db' ? (CAP_DB_NAMES[c] || c) : (SYS_BUCKET_NAMES[c] || c); }
export function capDayLabel(day){ return new Date(day + 'T12:00:00Z').toLocaleDateString('fa-IR', { timeZone:'Asia/Tehran', day:'numeric', month:'long' }); }
export async function renderSysCapacity(){
  const el = document.getElementById('sys-capacity');
  if(!el) return;
  el.innerHTML = '<div class="sys-note">در حال بررسی…</div>';
  try{
    // عکس امروز (اگه pg_cron هنوز نگرفته) — idempotent
    const snap = await api('/rpc/capacity_snapshot', { method:'POST', body:'{}' });
    const since = tehranDateStr(Date.now() - 400*86400000);
    const r = await api('/capacity_snapshots?select=day,kind,category,bytes,files&day=gte.' + since + '&order=day.asc');
    CAP_MISSING = snap.status === 404 || r.status === 404 || r.status === 400;
    if(CAP_MISSING){ el.innerHTML = '<div class="sys-note">برای نمایش این بخش، فایل <b>db/migration_043_capacity_errors.sql</b> باید یک‌بار در SQL Editor سوپابیس اجرا شود.</div>'; return; }
    if(!r.ok) throw new Error('capacity_snapshots ' + r.status);
    CAP_ROWS = await r.json();
    drawSysCapacity();
  }catch(e){
    console.error(e);
    el.innerHTML = '<div class="sys-note">خطا در دریافت سابقه‌ی ظرفیت.</div>';
  }
}
export function drawSysCapacity(){
  const el = document.getElementById('sys-capacity');
  const rows = (CAP_ROWS || []).filter(x=>x.kind === CAP_KIND);
  const byDay = new Map();
  rows.forEach(x=>{ if(!byDay.has(x.day)) byDay.set(x.day, {}); byDay.get(x.day)[x.category] = Number(x.bytes) || 0; });
  const days = [...byDay.keys()].sort();
  const total = d => Object.values(byDay.get(d) || {}).reduce((a, b)=>a + b, 0);
  const limit = capLimitBytes(CAP_KIND);
  const toggles = `<div class="sys-cap-tabs">
      <div class="sys-cap-seg">${[['storage','فضای فایل (۱ گیگ)'],['db','پایگاه داده (۵۰۰ مگ)']].map(([k, l])=>`<button type="button" class="usr-chip ${CAP_KIND===k?'active':''}" data-cap-kind="${k}">${l}</button>`).join('')}</div>
      <div class="sys-cap-seg">${[[30,'۳۰ روز'],[365,'۱۲ ماه']].map(([k, l])=>`<button type="button" class="usr-chip ${CAP_RANGE===k?'active':''}" data-cap-range="${k}">${l}</button>`).join('')}</div>
    </div>`;
  if(!days.length){ el.innerHTML = toggles + '<div class="sys-note">هنوز سابقه‌ای ثبت نشده است.</div>'; return; }
  const today = days[days.length - 1];
  const ms = jalaliMonthStarts();
  const firstFrom = from => days.find(d=>d >= from) || null;
  const curStart = firstFrom(ms.cur), prevStart = days.find(d=>d >= ms.prev && d < ms.cur) || null;
  const mb = b => faMb(b) + ' مگ';
  const pct = b => toFaDigits(Math.round(b / limit * 100)) + '٪';
  const tTot = total(today);
  // علامت +/− در متن راست‌به‌چپ جابه‌جا دیده می‌شه — با واژه
  const delta = (a, b) => { const d = a - b; return Math.abs(d) < 52429 ? 'بدون تغییر' : faMb(Math.abs(d)) + ' مگ ' + (d > 0 ? 'افزایش' : 'کاهش'); };
  const tile = (label, val, sub) => `<div class="sys-cap-tile"><span>${label}</span><b>${val}</b><small>${sub}</small></div>`;
  const tiles = [
    tile('امروز', mb(tTot), pct(tTot) + ' از سقف'),
    tile('اول این ماه', curStart ? mb(total(curStart)) : '—', curStart ? capDayLabel(curStart) : 'هنوز ثبت نشده'),
    tile('ماه گذشته', prevStart ? mb(total(prevStart)) : '—', prevStart ? 'از ' + capDayLabel(prevStart) : 'هنوز ثبت نشده'),
    tile('تغییر این ماه', curStart ? delta(tTot, total(curStart)) : '—', curStart ? 'نسبت به ' + capDayLabel(curStart) : 'سابقه از امروز ثبت می‌شود'),
  ].join('');
  // تفکیک دسته‌ها
  const cats = Object.entries(byDay.get(today)).sort((a, b)=>b[1] - a[1]);
  const base = curStart ? byDay.get(curStart) : null;
  const breakdown = cats.map(([c, b])=>{
    const w = tTot ? Math.max(1, b / tTot * 100) : 0;
    const ch = base && base[c] !== undefined ? '<em>این ماه: ' + delta(b, base[c]) + '</em>' : '';
    return `<div class="sys-cap-cat"><span class="sys-cap-cat-name">${escHtml(capCatName(CAP_KIND, c))}</span><span class="sys-cap-cat-bar"><i style="width:${w.toFixed(1)}%"></i></span><span class="sys-cap-cat-val">${mb(b)}${ch}</span></div>`;
  }).join('');
  // روند: ۳۰ روز = هر روز؛ ۱۲ ماه = آخرین عکس هر ماه شمسی
  let points;
  if(CAP_RANGE === 30){
    const from = tehranDateStr(Date.now() - 29*86400000);
    points = days.filter(d=>d >= from).map(d=>({ d, v: total(d), label: capDayLabel(d) }));
  }else{
    const byMonth = new Map();
    days.forEach(d=>{ const p = calParts(new Date(d + 'T12:00:00Z'), 'persian'); byMonth.set(p.year * 100 + p.month, d); });
    points = [...byMonth.values()].slice(-12).map(d=>({ d, v: total(d), label: new Date(d + 'T12:00:00Z').toLocaleDateString('fa-IR', { timeZone:'Asia/Tehran', month:'long' }) }));
  }
  const maxV = Math.max(limit * 0.25, ...points.map(p=>p.v));
  const chart = `<div class="act-days sys-cap-chart">${points.map(p=>`<div class="act-day" title="${escAttr(p.label + ': ' + mb(p.v))}"><i style="height:${Math.max(2, p.v / maxV * 100).toFixed(1)}%"></i></div>`).join('')}</div>
    <div class="act-days-axis"><span>${escHtml(points[0].label)}</span><span>${escHtml(points[points.length - 1].label)}</span></div>`;
  // پیش‌بینی: رشد روزانه‌ی میانگین ۱۴ روز اخیر (حداقل ۷ روز سابقه)
  let proj = '', projCls = '';
  const back = days.filter(d=>d >= tehranDateStr(Date.now() - 14*86400000));
  if(back.length < 7 || days.length < 7){
    proj = 'برای پیش‌بینی، دست‌کم ۷ روز سابقه لازم است (از ' + capDayLabel(days[0]) + ' ثبت می‌شود).';
  }else{
    const first = back[0];
    const span = Math.max(1, (new Date(today) - new Date(first)) / 86400000);
    const perDay = (tTot - total(first)) / span;
    if(perDay <= 1048576 * 0.05){
      proj = 'روند ۱۴ روز اخیر: بدون رشد محسوس؛ با این روند پر نمی‌شود.';
    }else{
      const left = Math.max(0, (limit - tTot) / perDay);
      projCls = left < 30 ? 'bad' : left < 90 ? 'warn' : '';
      const when = left < 60 ? toFaDigits(Math.round(left)) + ' روز' : toFaDigits(Math.round(left / 30)) + ' ماه';
      proj = 'با روند ۱۴ روز اخیر (روزانه حدود ' + faMb(perDay) + ' مگ افزایش)، ' + (CAP_KIND === 'db' ? 'پایگاه داده' : 'فضای فایل') + ' حدود ' + when + ' دیگر پر می‌شود.';
    }
  }
  el.innerHTML = toggles + `<div class="sys-cap-tiles">${tiles}</div>
    <div class="sys-cap-grid"><div><div class="sys-cap-sub">تفکیک امروز</div>${breakdown}</div>
    <div><div class="sys-cap-sub">روند ${CAP_RANGE === 30 ? '۳۰ روز اخیر' : '۱۲ ماه اخیر'}</div>${chart}</div></div>
    <p class="sys-cap-proj ${projCls}">${proj}</p>`;
}
export function setupSysStorage(){
  document.getElementById('sys-capacity').addEventListener('click', e=>{
    const k = e.target.closest('[data-cap-kind]'), r = e.target.closest('[data-cap-range]');
    if(k){ CAP_KIND = k.dataset.capKind; drawSysCapacity(); }
    if(r){ CAP_RANGE = Number(r.dataset.capRange); drawSysCapacity(); }
  });
}

