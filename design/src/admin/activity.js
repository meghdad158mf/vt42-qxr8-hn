// «گزارش فعالیت» (migration_039): پست‌های پنهان‌شده، آمار بازدید و دفتر تغییرات
import { api } from '../core/api.js';
import { CATEGORIES, HIDDEN_POST_IDS, POSTS_CACHE, chById, regionNameOf, setPostsCache } from '../data/store.js';
import { escAttr, escHtml, faNum, safeUrl, toFaDigits } from '../core/text.js';
import { navMark } from '../core/router.js';
import { NEWS_PLATFORM_LABEL } from '../ui/platforms.js';
import { NEWSLETTER_POSTS, setNewsletterPosts } from '../features/news/newsletter.js';
import { newsRelTime } from '../core/date.js';
import { POS_TAB_LABEL } from '../features/positions/positions.js';
import { searchNorm } from '../core/search.js';
import { showToast } from '../ui/toast.js';
import { sysDeviceLabel } from '../core/device.js';
import { TITLES } from '../data/section-titles.js';
import { uiConfirm } from '../ui/confirm.js';
import { USER_LEVELS } from './users.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { rerenderPostViews } from '../app.js';

// ---- «گزارش فعالیت» (فقط مدیر، migration_039) ----
// سه قسمت: پنهان‌کردن پست (دکمه زیر هر پست برای مدیر + فهرست/بازگرداندن)،
// آمار بازدید (شمارنده‌ی روزانه‌ی هر بخش/تب — فقط عدد، بدون نام یا دستگاه) و
// دفتر تغییرات (admin_audit، پرشده با trigger دیتابیس — از فرانت‌اند قابل دور
// زدن نیست؛ کارهای خودکار گیت‌هاب/Edge Functionها ثبت نمی‌شن). تا وقتی
// migration_039 اجرا نشده، همه‌ی این‌ها بی‌صدا غیرفعال‌ان و بقیه‌ی سایت سالمه.
export var ACT_TAB = 'views';
export let ACT_HIDDEN = null, ACT_AUDIT = null, ACT_VIEWS = null;
export let ACT_VIEWS_DAYS = 30, ACT_VIEWS_ROLE = 'app_viewer', ACT_AUDIT_FILTER = 'all', ACT_AUDIT_SHOW = 50;
export const ACT_TAB_INFO = {
  views: 'هر بخش و تب سایت چند بار باز شده، به تفکیک روز. فقط عدد ثبت می‌شود، نه نام یا دستگاه افراد.',
  audit: 'تغییرهایی که از پنل مدیریت انجام شده: چه چیزی، کی و از کدام دستگاه. کارهای خودکار سامانه ثبت نمی‌شوند.',
  hidden: 'پست‌هایی که از دید بیننده‌ها پنهان شده‌اند؛ با «بازگرداندن» دوباره در همه‌ی بخش‌ها دیده می‌شوند.',
};
export const ACT_MIGRATION_NOTE = 'برای این بخش، فایل <b>db/migration_039_admin_activity.sql</b> باید یک‌بار در SQL Editor سوپابیس اجرا شود.';
export async function hidePost(id){
  if(!await uiConfirm('این پست برای همه‌ی بیننده‌ها پنهان شود؟\nبعداً از «مدیریت ← گزارش فعالیت ← پست‌های پنهان‌شده» قابل بازگرداندن است.')) return;
  const r = await api('/posts?id=eq.' + id, { method:'PATCH', headers:{ Prefer:'return=minimal' }, body: JSON.stringify({ hidden_at: new Date().toISOString() }) });
  if(!r.ok){ showToast(r.status === 400 ? 'اول باید migration_039 در سوپابیس اجرا شود' : 'پنهان کردن پست انجام نشد'); return; }
  HIDDEN_POST_IDS.add(id);
  setPostsCache(POSTS_CACHE.filter(p=>p.id !== id));
  setNewsletterPosts(NEWSLETTER_POSTS.filter(np=>np.post_id !== id));
  ACT_HIDDEN = null;
  rerenderPostViews();
  showToast('پست پنهان شد');
}
export async function unhidePost(id){
  const r = await api('/posts?id=eq.' + id, { method:'PATCH', headers:{ Prefer:'return=representation' }, body: JSON.stringify({ hidden_at: null }) });
  if(!r.ok){ showToast('بازگرداندن پست انجام نشد'); return; }
  const rows = await r.json().catch(()=>[]);
  HIDDEN_POST_IDS.delete(id);
  if(rows[0] && !POSTS_CACHE.some(p=>p.id === id)){
    setPostsCache(POSTS_CACHE.concat(rows).sort((a,b)=>String(b.scraped_at||'').localeCompare(String(a.scraped_at||''))));
  }
  if(ACT_HIDDEN) ACT_HIDDEN = ACT_HIDDEN.filter(p=>p.id !== id);
  renderActHidden();
  rerenderPostViews();
  showToast('پست بازگردانده شد');
}
export function setActTab(tab){
  navMark();
  ACT_TAB = ACT_TAB_INFO[tab] ? tab : 'views';
  document.querySelectorAll('#act-page-tabs button').forEach(b=>b.classList.toggle('active', b.dataset.actTab === ACT_TAB));
  document.querySelector('#act-tab-subtitle span').textContent = ACT_TAB_INFO[ACT_TAB];
  ['views','audit','hidden'].forEach(t=>{ document.getElementById('act-pane-' + t).style.display = t === ACT_TAB ? '' : 'none'; });
  // هر بار باز کردن تب = داده‌ی تازه (بدون اثر روی سرعت بقیه‌ی سایت)
  if(ACT_TAB === 'views'){ ACT_VIEWS = null; renderActViews(); }
  if(ACT_TAB === 'audit'){ ACT_AUDIT = null; ACT_AUDIT_SHOW = 50; renderActAudit(); }
  if(ACT_TAB === 'hidden'){ ACT_HIDDEN = null; renderActHidden(); }
}
export const ACT_SECTION_NAMES = { dashboard:'صفحه نخست', overview:'اخبار و رویدادها', posts:'کنشگری مجازی', people:'یادداشت‌ها', hawza:'درباره حوزه', schools:'برنامه مدارس', reports:'بسته تحلیلی جریان' };
export const ACT_TAB_NAMES = { magazines:'بسته تحلیلی جریان', archive:'بسته‌های سایر نهادها', schools:'گزارش‌های مدارس' };
export function actSectionName(s){ return ACT_SECTION_NAMES[s] || TITLES[s] || s; }
export function actTabName(s, t){
  if(!t) return 'بدون تب';
  for(const b of document.querySelectorAll('#sec-' + s + ' .news-page-tabs button')){
    if(!Object.values(b.dataset).includes(t)) continue;
    const c = b.cloneNode(true);
    c.querySelectorAll('.news-soon').forEach(x=>x.remove());
    return c.textContent.trim() || t;
  }
  return ACT_TAB_NAMES[t] || t;
}
export function tehranDateStr(ms){ return new Date(ms).toLocaleDateString('en-CA', { timeZone:'Asia/Tehran' }); }
export async function renderActViews(){
  const el = document.getElementById('act-views');
  document.getElementById('act-views-days').innerHTML = [[7,'۷ روز اخیر'],[30,'۳۰ روز اخیر'],[90,'۹۰ روز اخیر']].map(([d,l])=>`<button type="button" class="usr-chip ${ACT_VIEWS_DAYS===d?'active':''}" data-d="${d}">${l}</button>`).join('');
  document.getElementById('act-views-role').innerHTML = [['app_viewer','بیننده‌ها'],['app_admin','مدیر'],['all','همه']].map(([k,l])=>`<button type="button" class="usr-chip ${ACT_VIEWS_ROLE===k?'active':''}" data-r="${k}">${l}</button>`).join('');
  if(!ACT_VIEWS){
    el.innerHTML = '<div class="sys-note">در حال دریافت…</div>';
    try{
      const since = tehranDateStr(Date.now() - 89 * 86400000);
      const rows = [];
      for(let page = 0; page < 10; page++){
        const r = await api('/page_views?select=day,section,tab,role,views&day=gte.' + since + '&order=day.asc&limit=1000&offset=' + (page * 1000));
        if(r.status === 404 || r.status === 400){ el.innerHTML = '<div class="ann-missing">' + ACT_MIGRATION_NOTE + '</div>'; return; }
        if(!r.ok) throw new Error('page_views ' + r.status);
        const part = await r.json();
        rows.push(...part);
        if(part.length < 1000) break;
      }
      ACT_VIEWS = rows;
    }catch(e){ console.error(e); el.innerHTML = '<div class="sys-note">خطا در دریافت آمار بازدید.</div>'; return; }
  }
  const days = [];
  for(let i = ACT_VIEWS_DAYS - 1; i >= 0; i--) days.push(tehranDateStr(Date.now() - i * 86400000));
  const rows = ACT_VIEWS.filter(x=>x.day >= days[0] && (ACT_VIEWS_ROLE === 'all' || x.role === ACT_VIEWS_ROLE));
  const pages = rows.filter(x=>x.section !== 'session');
  const total = pages.reduce((a,x)=>a + x.views, 0);
  const sessions = rows.filter(x=>x.section === 'session').reduce((a,x)=>a + x.views, 0);
  if(!ACT_VIEWS.length){
    el.innerHTML = '<div class="sys-note">هنوز بازدیدی ثبت نشده. آمار از زمان اجرای migration_039 جمع می‌شود.</div>';
    return;
  }
  const perDay = {}; days.forEach(d=>perDay[d] = 0);
  pages.forEach(x=>{ if(x.day in perDay) perDay[x.day] += x.views; });
  const maxDay = Math.max(1, ...Object.values(perDay));
  const secs = {};
  pages.forEach(x=>{
    const s = secs[x.section] || (secs[x.section] = { n:0, tabs:{} });
    s.n += x.views;
    const tk = x.tab || ''; // ردیف بدون تب (مثل صفحه‌ی نخست) زیرردیف جدا نمی‌گیره
    s.tabs[tk] = (s.tabs[tk] || 0) + x.views;
  });
  const secList = Object.entries(secs).sort((a,b)=>b[1].n - a[1].n);
  const maxSec = secList.length ? secList[0][1].n : 1;
  const fmtDay = d=>new Date(d + 'T12:00:00Z').toLocaleDateString('fa-IR', { timeZone:'Asia/Tehran', day:'numeric', month:'long' });
  const top = secList[0];
  el.innerHTML = `<div class="sys-login-sum">
      <div class="sys-login-stat"><b>${faNum(total)}</b><span>بازدید بخش‌ها و تب‌ها</span></div>
      <div class="sys-login-stat"><b>${faNum(sessions)}</b><span>ورود به سایت (هر زبانه‌ی مرورگر یک‌بار)</span></div>
      <div class="sys-login-stat"><b>${faNum(Math.round(total / days.length))}</b><span>میانگین بازدید در روز</span></div>
      <div class="sys-login-stat"><b>${top ? escHtml(actSectionName(top[0])) : '—'}</b><span>پربازدیدترین بخش</span></div>
    </div>
    <div class="act-chart-title">بازدید روزانه</div>
    <div class="act-days">${days.map(d=>`<div class="act-day" title="${escAttr(fmtDay(d) + '، ' + faNum(perDay[d]) + ' بازدید')}"><i style="height:${(perDay[d] / maxDay * 100).toFixed(1)}%"></i></div>`).join('')}</div>
    <div class="act-days-axis"><span>${fmtDay(days[0])}</span><span>${fmtDay(days[days.length - 1])}</span></div>
    <div class="act-chart-title">بازدید به تفکیک بخش و تب</div>
    ${secList.length ? `<div class="act-secs">${secList.map(([s, v])=>{
      const tabs = Object.entries(v.tabs).filter(([t])=>t).sort((a,b)=>b[1] - a[1]);
      return `<div class="act-sec-row"><span><b>${escHtml(actSectionName(s))}</b></span><span class="act-bar"><i style="width:${(v.n / maxSec * 100).toFixed(1)}%"></i></span><span>${faNum(v.n)}</span></div>`
        + tabs.map(([t, n])=>`<div class="act-sec-row sub"><span>${escHtml(actTabName(s, t))}</span><span class="act-bar"><i style="width:${(n / maxSec * 100).toFixed(1)}%"></i></span><span>${faNum(n)}</span></div>`).join('');
    }).join('')}</div>` : '<div class="sys-note">در این بازه بازدیدی ثبت نشده.</div>'}`;
}
// ---- دفتر تغییرات ----
export const AUDIT_TBL = {
  channels:['منبع','sources'], categories:['موضوع منابع','sources'], regions:['منطقه','sources'], profile_groups:['گروه چهره/سازمان','sources'],
  channel_profile_groups:['عضویت منبع در گروه','sources'], news_topics:['میان‌بر جست‌وجو','content'], dossier_topics:['پرونده‌ی موضوعی','content'],
  dossier_topic_posts:['مطلب پرونده','content'], newsletter_posts:['خبرنامه مدارس','content'], magazines:['بسته تحلیلی جریان','content'],
  archive_reports:['بسته‌ی سایر نهادها','content'], school_reports:['گزارش برنامه مدارس','content'], announcements:['اطلاعیه','content'],
  app_users:['کاربر','users'], feedback:['نظر کاربر','users'], notify_subscribers:['مشترک اطلاع‌رسانی','users'],
  posts:['پست','posts'], app_config:['رمز عبور','security'],
  crawl_sites:['منبع خزنده','sources'], hawza_mentions:['خبر «درباره حوزه»','content'],
  site_settings:['نمایش سایت','content'], login_events:['قفل ورود','security'],
};
export const AUDIT_GROUPS = [['all','همه'],['sources','منابع'],['content','محتوا'],['posts','پست‌ها'],['users','کاربران'],['security','امنیت']];
export const AUDIT_OP = { insert:['افزودن','add'], update:['ویرایش',''], delete:['حذف','del'], hide:['پنهان کردن','del'], unhide:['بازگرداندن','add'], password:['تغییر رمز','sec'], publish:['انتشار','add'], unlock:['باز کردن قفل ورود','add'] };
export const AUDIT_FIELD = {
  title:'عنوان', name:'نام', username:'آدرس / شناسه', platform:'بستر', active:'فعال', category_id:'موضوع', region_id:'منطقه', hawza_region_id:'منطقه‌ی حوزه',
  show_in_news:'بخش اخبار و رویدادها', show_in_cyberspace:'بخش کنشگری مجازی', show_in_people:'بخش چهره‌ها', show_in_orgs:'بخش سازمان‌ها', show_in_hawza:'بخش درباره حوزه',
  show_in_positions:'بخش مواضع مراجع و علماء', positions_tab:'تب مواضع', show_in_thinktanks:'بخش اندیشکده‌ها', show_in_laws:'بخش قوانین و مصوبات', laws_source:'مرجع صادرکننده',
  avatar_url:'عکس', owner_name:'صاحب کانال', subscriber_count:'مخاطب', is_khorasan_talabeh:'طلاب خراسان', keywords:'کلیدواژه‌ها', color:'رنگ', kind:'نوع',
  excluded:'پنهان در پرونده', message:'متن', level:'اهمیت', expires_at:'انقضا', full_name:'نام', phone:'موبایل', eitaa_id:'شناسه‌ی ایتا',
  access_level:'سطح دسترسی', national_id_last4:'کد ملی (۴ رقم آخر)', is_admin:'نقش مدیر', notes:'یادداشت', issue_no:'شماره', publish_date:'تاریخ انتشار', file_type:'نوع فایل', files:'فایل‌ها', cover_url:'جلد',
  source_org:'نهاد', image_url:'تصویر', media_storage_path:'فایل', notified_at:'زمان اطلاع‌رسانی', type:'نوع منبع', value:'مقدار',
};
export const AUDIT_FILE_FIELDS = ['avatar_url','files','cover_url','image_url','media_storage_path'];
export function auditVal(k, v){
  if(v === null || v === undefined || v === '') return '—';
  if(typeof v === 'boolean') return v ? 'بله' : 'خیر';
  if(k === 'category_id'){ const c = CATEGORIES.find(x=>x.id === v); return c ? escHtml(c.name) : faNum(v); }
  if(k === 'region_id' || k === 'hawza_region_id') return escHtml(regionNameOf(v) || String(v));
  if(k === 'access_level') return escHtml(USER_LEVELS[v] || v);
  if(k === 'level') return v === 'important' ? 'مهم' : 'عادی';
  if(k === 'positions_tab') return escHtml(POS_TAB_LABEL[v] || v);
  if(k === 'platform') return escHtml(NEWS_PLATFORM_LABEL[v] || v);
  if(typeof v === 'number') return faNum(v);
  if(typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v)) return new Date(v).toLocaleString('fa-IR', { timeZone:'Asia/Tehran', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
  const t = typeof v === 'string' ? v : JSON.stringify(v);
  return escHtml(t.length > 70 ? t.slice(0, 70) + '…' : t);
}
export function auditChangesHtml(x){
  if(!x.changes || typeof x.changes !== 'object') return '';
  return Object.entries(x.changes).map(([k, pair])=>{
    const label = escHtml(AUDIT_FIELD[k] || k);
    if(AUDIT_FILE_FIELDS.includes(k)) return `<div><b>${label}</b>: عوض شد</div>`;
    const [a, b] = Array.isArray(pair) ? pair : [null, pair];
    return `<div><b>${label}</b>: ${auditVal(k, a)} ← ${auditVal(k, b)}</div>`;
  }).join('');
}
export async function renderActAudit(){
  const el = document.getElementById('act-audit');
  if(!ACT_AUDIT){
    el.innerHTML = '<div class="sys-note">در حال دریافت…</div>';
    try{
      const r = await api('/admin_audit?select=*&order=created_at.desc&limit=1000');
      if(r.status === 404 || r.status === 400){ document.getElementById('act-audit-filters').innerHTML = ''; el.innerHTML = '<div class="ann-missing">' + ACT_MIGRATION_NOTE + '</div>'; return; }
      if(!r.ok) throw new Error('admin_audit ' + r.status);
      ACT_AUDIT = await r.json();
    }catch(e){ console.error(e); el.innerHTML = '<div class="sys-note">خطا در دریافت دفتر تغییرات.</div>'; return; }
  }
  const groupOf = x=>(AUDIT_TBL[x.tbl] || [x.tbl, 'content'])[1];
  const counts = { all: ACT_AUDIT.length };
  ACT_AUDIT.forEach(x=>{ const g = groupOf(x); counts[g] = (counts[g] || 0) + 1; });
  document.getElementById('act-audit-filters').innerHTML = AUDIT_GROUPS.map(([k,l])=>`<button type="button" class="usr-chip ${ACT_AUDIT_FILTER===k?'active':''}" data-f="${k}">${l}<span>${toFaDigits(counts[k] || 0)}</span></button>`).join('');
  // همون نرمال‌سازی جست‌وجوی اخبار (ي/ك عربی، نیم‌فاصله، ارقام فارسی) — ۵.۲۰.۰
  const q = searchNorm((document.getElementById('act-audit-search').value || '').trim());
  const list = ACT_AUDIT.filter(x=>(ACT_AUDIT_FILTER === 'all' || groupOf(x) === ACT_AUDIT_FILTER) && (!q || searchNorm((x.label || '') + ' ' + ((AUDIT_TBL[x.tbl] || [x.tbl])[0] || '')).includes(q)));
  if(!list.length){
    el.innerHTML = '<div class="sys-note">' + (ACT_AUDIT.length ? 'موردی با این فیلتر پیدا نشد.' : 'هنوز تغییری ثبت نشده. از این به بعد هر تغییر در پنل مدیریت اینجا دیده می‌شود.') + '</div>';
    return;
  }
  const shown = list.slice(0, ACT_AUDIT_SHOW);
  el.innerHTML = `<div class="sys-login-wrap"><table class="sys-login-table act-audit-table"><thead><tr><th>زمان</th><th>عملیات</th><th>بخش</th><th>مورد</th><th>جزئیات</th><th>دستگاه</th></tr></thead><tbody>${shown.map(x=>{
      const when = new Date(x.created_at).toLocaleString('fa-IR', { timeZone:'Asia/Tehran', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
      const op = AUDIT_OP[x.op] || [x.op, ''];
      const ua = sysDeviceLabel(x.user_agent);
      return `<tr><td>${escHtml(when)}</td><td><span class="act-op ${op[1]}">${escHtml(op[0])}</span></td><td>${escHtml((AUDIT_TBL[x.tbl] || [x.tbl])[0])}</td>`
        + `<td class="act-item">${escHtml(x.label || '—')}</td><td class="act-chg">${auditChangesHtml(x)}</td>`
        + `<td title="${escAttr((x.user_agent || '') + (x.ip ? ' — IP: ' + x.ip : ''))}">${escHtml(ua)}</td></tr>`;
    }).join('')}</tbody></table></div>${list.length > ACT_AUDIT_SHOW ? `<button type="button" class="btn sys-login-more" data-act="audit-more">نمایش بیشتر (${faNum(list.length - ACT_AUDIT_SHOW)} مورد دیگر)</button>` : ''}`;
}
// ---- پست‌های پنهان‌شده ----
export async function renderActHidden(){
  const el = document.getElementById('act-hidden');
  if(!ACT_HIDDEN){
    el.innerHTML = '<div class="sys-note">در حال دریافت…</div>';
    try{
      const r = await api('/posts?select=id,channel_id,platform,title,text,link,hidden_at,posted_at,scraped_at&hidden_at=not.is.null&order=hidden_at.desc&limit=300');
      if(r.status === 400){ el.innerHTML = '<div class="ann-missing">' + ACT_MIGRATION_NOTE + '</div>'; return; }
      if(!r.ok) throw new Error('posts ' + r.status);
      ACT_HIDDEN = await r.json();
    }catch(e){ console.error(e); el.innerHTML = '<div class="sys-note">خطا در دریافت پست‌های پنهان‌شده.</div>'; return; }
  }
  if(!ACT_HIDDEN.length){
    el.innerHTML = '<div class="sys-note">هیچ پستی پنهان نشده. برای پنهان کردن یک پست، روی «پنهان کردن پست» زیر همان پست بزنید.</div>';
    return;
  }
  el.innerHTML = ACT_HIDDEN.map(p=>{
    const ch = chById(p.channel_id) || {};
    const text = (p.title ? p.title + ' — ' : '') + (p.text || '');
    return `<div class="act-hid-item"><div>
        <div class="act-hid-meta"><b>${escHtml(ch.title || ch.username || '؟')}</b>، ${escHtml(NEWS_PLATFORM_LABEL[p.platform] || p.platform || '')}، انتشار ${escHtml(newsRelTime(p.posted_at || p.scraped_at))}، پنهان‌شده ${escHtml(newsRelTime(p.hidden_at))}</div>
        <div class="act-hid-text">${escHtml(text.slice(0, 400))}</div>
      </div><div class="act-hid-acts">
        <button type="button" class="btn" data-unhide-post="${Number(p.id)}">بازگرداندن</button>
        ${p.link ? `<a href="${safeUrl(p.link)}" target="_blank" rel="noopener">مشاهده‌ی منبع ↗</a>` : ''}
      </div></div>`;
  }).join('');
}
export function setupActivity(){
  document.getElementById('act-hidden').addEventListener('click', e=>{
    const b = e.target.closest('[data-unhide-post]'); if(b) unhidePost(Number(b.dataset.unhidePost));
  });
  // دکمه‌ی «پنهان کردن» زیر پست‌ها (postHideBtnHtml در app.js، فقط برای مدیر ساخته می‌شه) در همه‌ی فیدها
  document.addEventListener('click', e=>{
    const b = e.target.closest('[data-hide-post]'); if(b) hidePost(Number(b.dataset.hidePost));
  });
  document.getElementById('act-page-tabs').addEventListener('click', e=>{
    const b = e.target.closest('button');
    if(b && b.dataset.actTab && b.dataset.actTab !== ACT_TAB) setActTab(b.dataset.actTab);
  });
  document.getElementById('act-views-days').addEventListener('click', e=>{ const b = e.target.closest('button'); if(b){ ACT_VIEWS_DAYS = Number(b.dataset.d); renderActViews(); } });
  document.getElementById('act-views-role').addEventListener('click', e=>{ const b = e.target.closest('button'); if(b){ ACT_VIEWS_ROLE = b.dataset.r; renderActViews(); } });
  document.getElementById('act-audit-filters').addEventListener('click', e=>{ const b = e.target.closest('button'); if(b){ ACT_AUDIT_FILTER = b.dataset.f; ACT_AUDIT_SHOW = 50; renderActAudit(); } });
  document.getElementById('act-audit').addEventListener('click', e=>{
    if(e.target.closest('[data-act="audit-more"]')){ ACT_AUDIT_SHOW += 100; renderActAudit(); }
  });
  document.getElementById('act-audit-search').addEventListener('input', ()=>{ ACT_AUDIT_SHOW = 50; renderActAudit(); });
}

