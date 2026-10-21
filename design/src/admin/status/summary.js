// خلاصه‌ی بالای «وضعیت سامانه» (۵.۲۰.۰): موارد زرد/قرمز از خودِ کارت‌های صفحه، با چیپ اسکرول به هر کارت
import { CAP_KIND } from './storage.js';
import { escHtml, faNum } from '../../core/text.js';

// خلاصه‌ی بالای صفحه (۵.۲۰.۰): موارد زرد/قرمز همه‌ی کارت‌ها از خودِ صفحه‌ی رندرشده
// جمع می‌شن؛ کلیک روی هر مورد = اسکرول به همون کارت
export let SYS_SUMMARY_TARGETS = [];
export function renderSysSummary(loading){
  const el = document.getElementById('sys-summary');
  if(!el) return;
  if(loading){ el.className = 'sys-summary'; el.innerHTML = '<b>در حال بررسی وضعیت سامانه…</b>'; return; }
  const items = [];
  const add = (cls, text, target) => items.push({ cls, text, target });
  const lvl = e => e.classList.contains('bad') ? 'bad' : e.classList.contains('warn') ? 'warn' : '';
  const bar = document.querySelector('#sys-storage .sys-bar');
  if(bar && lvl(bar)) add(lvl(bar), 'فضای ذخیره‌سازی ' + (document.querySelector('#sys-storage .sys-storage-head span:last-child') || {}).textContent + ' پر', bar.closest('.panel'));
  document.querySelectorAll('#sys-services .svc-row.bad, #sys-services .svc-row.warn').forEach(r=>{
    const n = (r.querySelector('.svc-name') || {}).textContent || '';
    add(lvl(r), n + (lvl(r) === 'bad' ? ': قطع یا خطا' : ': کُند'), r);
  });
  document.querySelectorAll('#sys-status-list .sys-status-item.bad, #sys-status-list .sys-status-item.warn').forEach(r=>{
    add(lvl(r), (r.querySelector('.sys-status-name') || {}).textContent || '', r);
  });
  const lockBox = document.querySelector('#sys-logins .sys-lock-box');
  if(lockBox) add('warn', 'ورود از ' + faNum(lockBox.querySelectorAll('.sys-lock-row').length) + ' اتصال قفل است', lockBox);
  document.querySelectorAll('#sys-logins .sys-login-stat.bad, #sys-logins .sys-login-stat.warn').forEach(r=>{
    add(lvl(r), 'تلاش ناموفق ورود زیاد', r);
  });
  const proj = document.querySelector('#sys-capacity .sys-cap-proj.bad, #sys-capacity .sys-cap-proj.warn');
  if(proj) add(lvl(proj), (CAP_KIND === 'db' ? 'پایگاه داده' : 'فضای فایل') + ' رو به پر شدن', proj);
  const aerr = document.querySelector('#sys-alerts .sys-alert-err');
  if(aerr) add('warn', 'ارسال ایمیل هشدار ناموفق', aerr);
  const cerr = document.querySelectorAll('#sys-client-errors .sys-cerr-row.warn');
  if(cerr.length) add('warn', faNum(cerr.length) + ' خطای پرتکرار در مرورگر کاربران', cerr[0]);
  const stale = document.querySelectorAll('#sys-stale .sys-row');
  if(stale.length) add([...stale].some(r=>r.classList.contains('bad')) ? 'bad' : 'warn', faNum(stale.length) + ' منبع بی‌خبر', stale[0].closest('.panel'));
  document.querySelectorAll('#sys-tokens .sys-row.bad, #sys-tokens .sys-row.warn').forEach(r=>{
    add(lvl(r), 'انقضای توکن «' + ((r.querySelector('.sys-row-name') || {}).textContent || '') + '»', r);
  });
  items.sort((a,b)=>(b.cls === 'bad') - (a.cls === 'bad'));
  SYS_SUMMARY_TARGETS = items.map(x=>x.target);
  if(!items.length){
    el.className = 'sys-summary ok';
    el.innerHTML = '<b>همه‌چیز سالم است</b><span>هیچ موردی نیاز به رسیدگی ندارد.</span>';
    return;
  }
  el.className = 'sys-summary ' + (items.some(x=>x.cls === 'bad') ? 'bad' : 'warn');
  el.innerHTML = `<b>${faNum(items.length)} مورد نیازمند توجه</b><div class="sys-sum-chips">${items.map((x,i)=>`<button type="button" class="sys-sum-chip ${x.cls}" data-i="${i}">${escHtml(x.text)}</button>`).join('')}</div>`;
}
export function setupSysSummary(){
  document.getElementById('sys-summary').addEventListener('click', e=>{
    const b = e.target.closest('.sys-sum-chip'); if(!b) return;
    const t = SYS_SUMMARY_TARGETS[+b.dataset.i]; if(!t || !t.isConnected) return;
    t.scrollIntoView({ behavior:'smooth', block:'center' });
    t.classList.remove('sys-flash'); void t.offsetWidth; t.classList.add('sys-flash');
  });
}

