// «وضعیت سامانه»: منابع بی‌خبر، ورودها و قفل ورود (login_events، migration_035/042)، انقضای توکن‌ها
import { api } from '../../core/api.js';
import { CHANNELS } from '../../data/store.js';
import { escAttr, escHtml, faNum, toFaDigits } from '../../core/text.js';
import { fetchLoginLocks, refreshAdminAlerts } from '../alerts-badge.js';
import { newsRelTime } from '../../core/date.js';
import { openChanEditor } from '../settings/channels.js';
import { showToast } from '../../ui/toast.js';
import { SYS_TOKENS } from './jobs.js';
import { sysDeviceLabel } from '../../core/device.js';
import { uiConfirm } from '../../ui/confirm.js';

export async function renderSysStale(){
  const el = document.getElementById('sys-stale');
  el.innerHTML = '<div class="sys-note">در حال بررسی…</div>';
  try{
    const r = await api('/rpc/channel_last_post', { method:'POST', body:'{}' });
    if(r.status === 404){ el.innerHTML = '<div class="sys-note">برای نمایش این بخش، فایل <b>db/migration_034_system_status.sql</b> باید یک‌بار در SQL Editor سوپابیس اجرا شود.</div>'; return; }
    if(!r.ok) throw new Error('channel_last_post ' + r.status);
    const last = {};
    (await r.json()).forEach(x=>{ last[x.channel_id] = x.last_scraped_at; });
    const LIMIT = 3*86400000;
    const PLAT = { eitaa:'ایتا', telegram:'تلگرام', website:'وب‌سایت', bale:'بله' };
    const stale = CHANNELS.filter(c=>c.active !== false)
      .map(c=>({ c, at: last[c.id] ? new Date(last[c.id]).getTime() : 0 }))
      .filter(x=>Date.now() - x.at > LIMIT)
      .sort((a,b)=>a.at - b.at);
    el.innerHTML = stale.length
      ? '<div class="sys-rows">' + stale.map(x=>`<div class="sys-row sys-row-link ${x.at ? 'warn' : 'bad'}" role="button" tabindex="0" data-chan="${x.c.id}" title="باز کردن پنجره‌ی ویرایش این منبع"><span class="sys-status-dot"></span><span class="sys-row-name">${escHtml(x.c.title||x.c.username)}</span><span class="sys-row-meta">${PLAT[x.c.platform]||''}، ${x.at ? 'آخرین مطلب ' + newsRelTime(new Date(x.at).toISOString()) : 'تاکنون مطلبی نیامده'}</span><span class="sys-row-edit">ویرایش منبع</span></div>`).join('') + '</div>'
      : '<div class="sys-note">✓ همه‌ی منابع فعال در ۳ روز اخیر مطلب داشته‌اند.</div>';
  }catch(e){
    console.error(e);
    el.innerHTML = '<div class="sys-note">خطا در بررسی منابع.</div>';
  }
}
export let SYS_LOGINS_SHOW_ALL = false;
export async function renderSysLogins(){
  const el = document.getElementById('sys-logins');
  el.innerHTML = '<div class="sys-note">در حال بررسی…</div>';
  try{
    const [r, locks] = await Promise.all([
      api('/login_events?select=*&order=created_at.desc&limit=300'),
      fetchLoginLocks().catch(()=>null),
    ]);
    if(r.status === 404 || r.status === 400){ el.innerHTML = '<div class="sys-note">برای نمایش این بخش، فایل <b>db/migration_035_login_events.sql</b> باید یک‌بار در SQL Editor سوپابیس اجرا شود.</div>'; return; }
    if(!r.ok) throw new Error('login_events ' + r.status);
    const rows = await r.json();
    const dayAgo = Date.now() - 86400000;
    const day = rows.filter(x=>new Date(x.created_at).getTime() > dayAgo);
    const okAdmin = day.filter(x=>x.success && x.role==='app_admin').length;
    const okViewer = day.filter(x=>x.success && x.role==='app_viewer').length;
    const fails = day.filter(x=>!x.success && !x.blocked);
    const failCls = fails.length >= 20 ? 'bad' : fails.length >= 5 ? 'warn' : '';
    const byIp = {};
    fails.forEach(x=>{ const k = x.ip || 'نامشخص'; byIp[k] = (byIp[k]||0) + 1; });
    const topIps = Object.entries(byIp).sort((a,b)=>b[1]-a[1]).slice(0,3);
    const list = SYS_LOGINS_SHOW_ALL ? rows : rows.slice(0, 15);
    // قفل موقت ورود (migration_042)
    const lockHtml = locks === null
      ? '<div class="sys-note sys-lock-note">قفل خودکار ورود هنوز فعال نیست؛ برای فعال شدن، فایل <b>db/migration_042_login_lock_site_settings.sql</b> را یک‌بار در SQL Editor سوپابیس اجرا کنید.</div>'
      : locks.length
        ? `<div class="sys-lock-box warn"><div class="sys-lock-head"><b>ورود از ${faNum(locks.length)} اتصال موقتاً بسته است</b>${locks.length > 1 ? '<button type="button" class="btn btn-sm" data-unlock-all>باز کردن همه</button>' : ''}</div>${locks.map(x=>{
            const until = new Date(x.locked_until);
            const mins = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000));
            return `<div class="sys-lock-row"><span dir="ltr" class="sys-lock-ip">${escHtml(x.ip || 'نامشخص')}</span><span class="sys-lock-meta">${faNum(x.attempts)} تلاش ناموفق، باز شدن خودکار تا ${faNum(mins)} دقیقه‌ی دیگر</span><button type="button" class="btn btn-sm" data-unlock="${escAttr(x.ip || '')}">باز کردن قفل</button></div>`;
          }).join('')}<p class="sys-lock-help">اگر همکاران پشت یک اینترنت مشترک هستند، قفل برای همه‌ی آن‌ها اعمال می‌شود. اگر مطمئن هستید تلاش‌ها از طرف خودتان بوده، قفل را باز کنید.</p></div>`
        : '<div class="sys-note sys-lock-note">قفل خودکار فعال است: با ۵ رمز اشتباه در ۱۵ دقیقه از یک اتصال، ورود از آن اتصال ۱۵ دقیقه بسته می‌شود. الان هیچ اتصالی قفل نیست.</div>';
    el.innerHTML = lockHtml + `<div class="sys-login-sum">
        <div class="sys-login-stat"><b>${faNum(okAdmin)}</b><span>ورود مدیر در ۲۴ ساعت اخیر</span></div>
        <div class="sys-login-stat"><b>${faNum(okViewer)}</b><span>ورود بیننده در ۲۴ ساعت اخیر</span></div>
        <div class="sys-login-stat ${failCls}"><b>${faNum(fails.length)}</b><span>تلاش ناموفق (رمز اشتباه) در ۲۴ ساعت اخیر${topIps.length ? '<br>بیشترین از: ' + topIps.map(([ip,n])=>escHtml(ip) + ' (' + faNum(n) + ')').join('، ') : ''}</span></div>
      </div>` + (rows.length ? `<div class="sys-login-wrap"><table class="sys-login-table"><thead><tr><th>زمان</th><th>نتیجه</th><th>نقش</th><th>نام</th><th>دستگاه</th><th>IP</th></tr></thead><tbody>${list.map(x=>{
        const d = new Date(x.created_at);
        const full = d.toLocaleString('fa-IR', { timeZone:'Asia/Tehran', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
        return `<tr class="${x.success ? '' : 'fail'}"><td title="${escAttr(full)}">${escHtml(full)}</td><td><span class="sys-login-badge ${x.success ? '' : 'fail'}">${x.success ? 'موفق' : x.blocked ? (x.role === 'app_viewer' ? 'رمز بیننده بسته است' : 'رد شد (قفل)') : x.user_id ? 'کد پیامک اشتباه' : 'رمز اشتباه'}</span></td><td>${x.role==='app_admin' ? 'مدیر' : x.role==='app_viewer' ? 'بیننده' : '—'}</td><td>${x.user_name ? escHtml(x.user_name) : x.success ? '<span class="usr-dim">رمز مشترک</span>' : '—'}</td><td title="${escAttr(x.user_agent||'')}">${escHtml(sysDeviceLabel(x.user_agent))}</td><td dir="ltr">${escHtml(x.ip||'—')}</td></tr>`;
      }).join('')}</tbody></table></div>${rows.length > 15 ? `<button type="button" class="btn sys-login-more" data-act="logins-toggle">${SYS_LOGINS_SHOW_ALL ? 'نمایش کمتر' : 'نمایش همه (' + faNum(rows.length) + ')'}</button>` : ''}` : '<div class="sys-note">هنوز ورودی ثبت نشده.</div>');
  }catch(e){
    console.error(e);
    el.innerHTML = '<div class="sys-note">خطا در دریافت فهرست ورودها.</div>';
  }
}
export function renderSysTokens(){
  const el = document.getElementById('sys-tokens');
  el.innerHTML = '<div class="sys-rows">' + SYS_TOKENS.map(t=>{
    const days = Math.ceil((new Date(t.exp + 'T00:00:00Z').getTime() - Date.now()) / 86400000);
    const cls = days <= 7 ? 'bad' : days <= 21 ? 'warn' : 'ok';
    const left = days < 0 ? 'منقضی شده!' : toFaDigits(days) + ' روز مانده';
    const date = new Date(t.exp + 'T12:00:00Z').toLocaleDateString('fa-IR', { timeZone:'Asia/Tehran', day:'numeric', month:'long', year:'numeric' });
    return `<div class="sys-row ${cls}" title="${escAttr(t.key + ' — ' + t.where)}"><span class="sys-status-dot"></span><span class="sys-row-name">${t.name}</span><span class="sys-row-meta">${date}، ${left}</span></div>`;
  }).join('') + '</div>';
}
// «منابع بی‌خبر»: کلیک = پنجره‌ی ویرایش همون منبع (۵.۲۰.۰)
export function openStaleChannel(e){
  const row = e.target.closest('.sys-row-link'); if(!row) return;
  if(e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  const ch = CHANNELS.find(c=>String(c.id) === row.dataset.chan);
  if(ch) openChanEditor(ch);
}
export async function unlockLogin(ip){
  const all = ip === null;
  if(!await uiConfirm(all ? 'باز کردن قفل همه‌ی اتصال‌ها\nورود از همه‌ی IPهای قفل‌شده دوباره ممکن می‌شود.' : 'باز کردن قفل ورود\nورود از IP ' + (ip || 'نامشخص') + ' دوباره ممکن می‌شود.')) return;
  try{
    const r = await api('/rpc/login_unlock', { method:'POST', body: JSON.stringify({ p_ip: ip }) });
    if(!r.ok) throw new Error('unlock ' + r.status);
    showToast('قفل باز شد.');
  }catch(e){ console.error(e); showToast('باز کردن قفل ناموفق بود؛ اتصال اینترنت را بررسی کنید.'); }
  renderSysLogins();
  refreshAdminAlerts();
}
export function setupSysLogins(){
  document.getElementById('sys-logins').addEventListener('click', e=>{
    if(e.target.closest('[data-act="logins-toggle"]')){ SYS_LOGINS_SHOW_ALL = !SYS_LOGINS_SHOW_ALL; renderSysLogins(); }
  });
  document.getElementById('sys-logins').addEventListener('click', e=>{
    if(e.target.closest('[data-unlock-all]')){ unlockLogin(null); return; }
    const b = e.target.closest('[data-unlock]'); if(b) unlockLogin(b.dataset.unlock);
  });
  document.getElementById('sys-stale').addEventListener('click', openStaleChannel);
  document.getElementById('sys-stale').addEventListener('keydown', openStaleChannel);
}

