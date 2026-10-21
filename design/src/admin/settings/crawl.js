// «تنظیمات بخش‌ها ← منابع خزنده‌ی درباره حوزه» (crawl_sites، crawl_suggestions — migration_041): همگام با مدیریت منابع، پیشنهاد منبع
import { api } from '../../core/api.js';
import { CHANNELS, POSTS_CACHE } from '../../data/store.js';
import { currentRole } from '../../core/session.js';
import { escAttr, escHtml, needsTranslation, safeUrl, toFaDigits } from '../../core/text.js';
import { newsRelTime } from '../../core/date.js';
import { refreshChanList } from './chan-list-hook.js';
import { showToast } from '../../ui/toast.js';
import { uiConfirm } from '../../ui/confirm.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { loadChannels } from '../../app.js';

// ---- منابع خزنده‌ی «درباره حوزه» (crawl_sites، migration_041 — ۵.۲۳.۰) ----
export let CRAWL_SITES = null, CRAWL_SITES_ERR = '';
export const CRAWL_VIA = { sitemap:'فهرست خبری (sitemap)', rss:'فید RSS', homepage:'صفحه‌ی اول' };
export async function loadCrawlSites(sync = true){
  if(currentRole !== 'app_admin') return;
  try{
    const r = await api('/crawl_sites?select=*&order=name');
    CRAWL_SITES_ERR = r.ok ? '' : ((r.status === 404 || r.status === 400) ? 'missing' : 'error');
    CRAWL_SITES = r.ok ? await r.json() : [];
  }catch(e){ CRAWL_SITES_ERR = 'error'; CRAWL_SITES = []; }
  if(sync && !CRAWL_SITES_ERR && await syncCrawlSitesFromChannels()) return loadCrawlSites(false);
  renderCrawlSites();
}
// ---- سایت‌های «مدیریت منابع» → خزش کامل (خواست کاربر: بعضی سایت‌ها فقط با RSS یه بخش
// در مدیریت منابع‌ان، ولی برای «درباره حوزه» کل سایت باید گشته بشه) ----
// نشانی اصلی سایت از آدرس RSS: isna.ir/rss/tp/5 → https://www.isna.ir؛ زیردامنه‌ی فید
// (feeds./rss./moxie.) برداشته می‌شه و بخش زبانی (/persian، /farsi، /fa-ir) می‌مونه
export function rssSiteRoot(rss){
  try{
    const u = new URL(rss);
    let h = u.hostname.toLowerCase(), stripped = false;
    const MAP = { 'feeds.bbci.co.uk':'bbc.com', 'feeds.a.dj.com':'wsj.com' };
    if(MAP[h]){ h = MAP[h]; stripped = true; }
    else if(/^(feeds?|rss|moxie)\./.test(h)){ h = h.replace(/^(feeds?|rss|moxie)\./, ''); stripped = true; }
    const seg = (u.pathname.split('/')[1] || '').toLowerCase();
    const prefix = ['persian','farsi','fa-ir','fa'].includes(seg) && !/\.ir$/.test(h) ? '/' + seg : '';
    const host = stripped && h.split('.').length === 2 ? 'www.' + h : h;
    return 'https://' + host + prefix;
  }catch(e){ return null; }
}
export function crawlSiteKey(url){
  try{ const u = new URL(url); return u.hostname.toLowerCase().replace(/^www\./, '') + u.pathname.replace(/\/+$/, ''); }catch(e){ return ''; }
}
export function channelCrawlRoots(){
  const out = {};
  CHANNELS.filter(c=>c.platform === 'website' && c.active !== false && !c.show_in_hawza).forEach(c=>{
    const root = rssSiteRoot(c.username);
    if(!root) return;
    const k = crawlSiteKey(root);
    if(!out[k]) out[k] = { root, channels: [] };
    out[k].channels.push(c);
  });
  return out;
}
export async function syncCrawlSitesFromChannels(){
  const have = new Set((CRAWL_SITES || []).map(c=>crawlSiteKey(c.url)));
  const rows = [];
  Object.entries(channelCrawlRoots()).forEach(([k, v])=>{
    if(have.has(k)) return;
    // سایت غیرفارسی (CNN، گاردین…): خزش کاملش سنگینه و بعضی‌ها ربات رو می‌بندن —
    // متوقف اضافه می‌شه (فید RSSش همچنان بررسی می‌شه) و مدیر می‌تونه فعالش کنه
    const sample = POSTS_CACHE.filter(p=>v.channels.some(c=>c.id === p.channel_id)).slice(0, 10);
    const foreign = sample.length > 0 && sample.filter(needsTranslation).length > sample.length / 2;
    const name = (v.channels[0].title || k).split(/\s+[-–—|]\s+/)[0].trim() || k;
    rows.push({ name: name.slice(0, 80), url: v.root, active: !foreign, source: 'channel' });
  });
  if(!rows.length) return false;
  try{
    const r = await api('/crawl_sites?on_conflict=url', { method:'POST', headers:{ Prefer:'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(rows) });
    return r.ok;
  }catch(e){ return false; }
}
export function crawlSiteStatus(c){
  if(!c.active) return { cls:'is-off', text:'متوقف' };
  if(!c.last_run_at) return { cls:'', text:'هنوز اجرا نشده است' };
  const when = newsRelTime(c.last_run_at);
  if(c.last_error) return { cls:'is-bad', text: when + '، ' + c.last_error };
  return { cls:'is-ok', text: when + '، ' + toFaDigits(c.last_pages || 0) + ' خبر تازه خوانده شد، ' + toFaDigits(c.last_found || 0) + ' خبر مرتبط' + (c.last_via ? '، از ' + (CRAWL_VIA[c.last_via] || c.last_via) : '') };
}
export function renderCrawlSites(){
  const box = document.getElementById('crawl-site-list');
  if(!box) return;
  if(CRAWL_SITES_ERR === 'missing'){
    box.innerHTML = '<p class="settings-help">جدول این بخش هنوز ساخته نشده است؛ فایل db/migration_041_hawza_crawler.sql را در SQL Editor سوپابیس اجرا کنید.</p>';
    return;
  }
  if(CRAWL_SITES_ERR === 'error'){ box.innerHTML = '<p class="settings-help">دریافت فهرست انجام نشد؛ صفحه را دوباره باز کنید.</p>'; return; }
  const list = CRAWL_SITES || [];
  const active = list.filter(c=>c.active).length;
  const bad = list.filter(c=>c.active && c.last_error).length;
  document.getElementById('crawl-sites-sum').textContent = toFaDigits(active) + ' سایت فعال' + (bad ? '، ' + toFaDigits(bad) + ' سایت در آخرین اجرا خطا داشت' : '') + '؛ سایت‌هایی که خزنده هر ۳ ساعت برای پیدا کردن خبرهای مربوط به حوزه می‌گردد';
  const sorted = list.slice().sort((a,b)=>(b.active - a.active) || ((b.active && b.last_error ? 1 : 0) - (a.active && a.last_error ? 1 : 0)) || a.name.localeCompare(b.name, 'fa'));
  const fromChannels = channelCrawlRoots();
  box.innerHTML = sorted.map(c=>{
    const st = crawlSiteStatus(c);
    let host = c.url; try{ const u = new URL(c.url); host = u.host.replace(/^www\./, '') + u.pathname.replace(/\/+$/, ''); }catch(e){}
    const linked = fromChannels[crawlSiteKey(c.url)];
    if(CRAWL_EDIT_ID === c.id){
      return `<div class="crawl-site crawl-edit">
        <div class="add-row">
          <input type="text" id="crawl-edit-name" aria-label="نام سایت" value="${escAttr(c.name)}" />
          <input type="url" id="crawl-edit-sitemap" aria-label="نشانی فهرست خبری (اختیاری)" placeholder="sitemap (اختیاری؛ خالی = پیدا کردن خودکار)" dir="ltr" value="${escAttr(c.sitemap_url || '')}" />
          <button type="button" class="btn primary btn-sm" data-crawl-act="save" data-id="${Number(c.id)}">ذخیره</button>
          <button type="button" class="btn btn-sm" data-crawl-edit="">انصراف</button>
        </div>
      </div>`;
    }
    return `<div class="crawl-site ${st.cls}">
      <div class="crawl-site-main">
        <div class="crawl-site-name">${escHtml(c.name)} <a class="crawl-site-host" href="${safeUrl(c.url)}" target="_blank" rel="noopener" dir="ltr">${escHtml(host)}</a>${linked ? '<span class="crawl-sug-kind is-chan" title="این سایت در «مدیریت منابع» هم هست و خودکار به این فهرست اضافه شده است">از مدیریت منابع</span>' : ''}</div>
        <div class="crawl-site-status">${escHtml(st.text)}</div>
      </div>
      <div class="crawl-site-acts">
        <button type="button" class="usr-act" data-crawl-act="toggle" data-id="${Number(c.id)}">${c.active ? 'توقف' : 'فعال‌سازی'}</button>
        <button type="button" class="usr-act" data-crawl-edit="${Number(c.id)}">ویرایش</button>
        ${linked ? '' : `<button type="button" class="usr-act is-del" data-crawl-act="delete" data-id="${Number(c.id)}">حذف</button>`}
      </div>
    </div>`;
  }).join('') || '<p class="settings-help">هنوز سایتی اضافه نشده است.</p>';
}
export let CRAWL_EDIT_ID = null;
export async function saveCrawlSite(id){
  const name = document.getElementById('crawl-edit-name').value.trim();
  let sitemap = document.getElementById('crawl-edit-sitemap').value.trim();
  if(!name){ showToast('نام سایت را وارد کنید.'); return; }
  if(sitemap){
    try{ sitemap = new URL(/^https?:\/\//i.test(sitemap) ? sitemap : 'https://' + sitemap).href; }
    catch(e){ showToast('نشانی فهرست خبری درست نیست؛ می‌توانید آن را خالی بگذارید.'); return; }
  }
  const r = await api('/crawl_sites?id=eq.' + id, { method:'PATCH', headers:{ Prefer:'return=minimal' }, body: JSON.stringify({ name, sitemap_url: sitemap || null }) });
  if(!r.ok){ showToast('ذخیره انجام نشد؛ دوباره امتحان کنید.'); return; }
  const c = (CRAWL_SITES || []).find(x=>x.id === id);
  if(c){ c.name = name; c.sitemap_url = sitemap || null; }
  CRAWL_EDIT_ID = null;
  renderCrawlSites();
  showToast('ذخیره شد');
}
export async function toggleCrawlSite(id){
  const c = (CRAWL_SITES || []).find(x=>x.id === id);
  if(!c) return;
  const r = await api('/crawl_sites?id=eq.' + id, { method:'PATCH', headers:{ Prefer:'return=minimal' }, body: JSON.stringify({ active: !c.active }) });
  if(!r.ok){ showToast('انجام نشد؛ اتصال را بررسی کنید و دوباره امتحان کنید.'); return; }
  c.active = !c.active;
  renderCrawlSites();
  showToast(c.active ? '«' + c.name + '» در اجرای بعدی خزنده جست‌وجو می‌شود' : '«' + c.name + '» دیگر جست‌وجو نمی‌شود');
}
export async function deleteCrawlSite(id){
  const c = (CRAWL_SITES || []).find(x=>x.id === id);
  if(!c || !await uiConfirm('حذف «' + c.name + '» از منابع خزنده؟\nخبرهایی که تا الان از این سایت پیدا شده، باقی می‌مانند.')) return;
  const r = await api('/crawl_sites?id=eq.' + id, { method:'DELETE', headers:{ Prefer:'return=minimal' } });
  if(!r.ok){ showToast('حذف انجام نشد؛ دوباره امتحان کنید.'); return; }
  CRAWL_SITES = CRAWL_SITES.filter(x=>x.id !== id);
  renderCrawlSites();
}
export let CRAWL_SUGGEST = [];
export const CRAWL_SUG_KIND = { site:'سایت', eitaa:'ایتا', telegram:'تلگرام' };
export async function loadCrawlSuggestions(){
  try{
    const r = await api('/crawl_suggestions?select=*&status=eq.new&order=found.desc,hits.desc,last_seen_at.desc&limit=40');
    CRAWL_SUGGEST = r.ok ? await r.json() : [];
  }catch(e){ CRAWL_SUGGEST = []; }
  renderCrawlSuggestions();
}
export function crawlSugUrl(s){
  return s.kind === 'site' ? 'https://' + s.key : s.kind === 'telegram' ? 'https://t.me/' + s.key : 'https://eitaa.com/' + s.key;
}
export function renderCrawlSuggestions(){
  const wrap = document.getElementById('crawl-sug-wrap');
  const box = document.getElementById('crawl-sug-list');
  if(!wrap || !box) return;
  wrap.hidden = !CRAWL_SUGGEST.length;
  box.innerHTML = CRAWL_SUGGEST.map(s=>{
    const stat = toFaDigits(s.hits) + ' مطلب مرتبط به آن لینک داده' + (s.found ? '، ' + toFaDigits(s.found) + ' صفحه‌ی آن درباره‌ی حوزه بود' : '');
    return `<div class="crawl-site crawl-sug">
      <div class="crawl-site-main">
        <div class="crawl-site-name"><span class="crawl-sug-kind">${escHtml(CRAWL_SUG_KIND[s.kind] || s.kind)}</span><a class="crawl-site-host" href="${safeUrl(crawlSugUrl(s))}" target="_blank" rel="noopener" dir="ltr">${escHtml(s.kind === 'site' ? s.key : '@' + s.key)}</a></div>
        <div class="crawl-site-status">${escHtml(stat)}${s.sample_url ? ` — <a href="${safeUrl(s.sample_url)}" target="_blank" rel="noopener">نمونه</a>` : ''}</div>
      </div>
      <div class="crawl-site-acts">
        <button type="button" class="usr-act" data-sug-act="add" data-id="${Number(s.id)}">افزودن</button>
        <button type="button" class="usr-act" data-sug-act="ignore" data-id="${Number(s.id)}">نادیده گرفتن</button>
      </div>
    </div>`;
  }).join('');
}
export async function setCrawlSuggestionStatus(id, status){
  const r = await api('/crawl_suggestions?id=eq.' + id, { method:'PATCH', headers:{ Prefer:'return=minimal' }, body: JSON.stringify({ status }) });
  if(r.ok){ CRAWL_SUGGEST = CRAWL_SUGGEST.filter(x=>x.id !== id); renderCrawlSuggestions(); }
  return r.ok;
}
export async function ignoreCrawlSuggestion(id){
  if(!await setCrawlSuggestionStatus(id, 'ignored')) showToast('انجام نشد؛ دوباره امتحان کنید.');
}
export async function addCrawlSuggestion(id){
  const s = CRAWL_SUGGEST.find(x=>x.id === id);
  if(!s) return;
  let r;
  if(s.kind === 'site'){
    r = await api('/crawl_sites', { method:'POST', headers:{ Prefer:'return=minimal' }, body: JSON.stringify({ name: s.name || s.key, url: 'https://' + s.key }) });
  }else{
    r = await api('/channels', { method:'POST', headers:{ Prefer:'return=minimal' }, body: JSON.stringify({ platform: s.kind, username: s.key, title: s.key, active: true }) });
  }
  if(!r.ok && r.status !== 409){ showToast('افزودن انجام نشد؛ اتصال را بررسی کنید و دوباره امتحان کنید.'); return; }
  await setCrawlSuggestionStatus(id, 'added');
  if(s.kind === 'site'){
    await loadCrawlSites();
    showToast('«' + s.key + '» به منابع خزنده اضافه شد و در اجرای بعدی جست‌وجو می‌شود. نام فارسی آن را می‌توانید بعداً با حذف و افزودن دوباره اصلاح کنید.');
  }else{
    try{ await loadChannels(); refreshChanList(); loadCrawlSites(); }catch(e){}
    showToast('کانال @' + s.key + ' به «مدیریت منابع» اضافه شد؛ پست‌هایش از اجرای بعدی جمع و بررسی می‌شود. نام و بخش‌های نمایش آن را از همان‌جا تنظیم کنید.');
  }
}
export function setupCrawlAdmin(){
  document.getElementById('crawl-site-list').addEventListener('click', e=>{
    const b = e.target.closest('[data-crawl-act]'); if(!b) return;
    const id = Number(b.dataset.id);
    if(b.dataset.crawlAct === 'save') saveCrawlSite(id);
    else if(b.dataset.crawlAct === 'toggle') toggleCrawlSite(id);
    else if(b.dataset.crawlAct === 'delete') deleteCrawlSite(id);
  });
  document.getElementById('crawl-sug-list').addEventListener('click', e=>{
    const b = e.target.closest('[data-sug-act]'); if(!b) return;
    if(b.dataset.sugAct === 'add') addCrawlSuggestion(Number(b.dataset.id)); else ignoreCrawlSuggestion(Number(b.dataset.id));
  });
  document.getElementById('crawl-site-list').addEventListener('click', e=>{
    const b = e.target.closest('[data-crawl-edit]');
    if(b){ CRAWL_EDIT_ID = b.dataset.crawlEdit ? Number(b.dataset.crawlEdit) : null; renderCrawlSites(); }
  });
  document.getElementById('add-crawl-btn').addEventListener('click', async ()=>{
    const nameEl = document.getElementById('new-crawl-name');
    const urlEl = document.getElementById('new-crawl-url');
    const smEl = document.getElementById('new-crawl-sitemap');
    const name = nameEl.value.trim();
    const norm = v=>{ v = v.trim(); if(!v) return ''; if(!/^https?:\/\//i.test(v)) v = 'https://' + v; try{ const u = new URL(v); return u.origin + u.pathname.replace(/\/+$/, ''); }catch(e){ return null; } };
    const url = norm(urlEl.value);
    const sitemap = smEl.value.trim() ? (()=>{ try{ return new URL(/^https?:\/\//i.test(smEl.value.trim()) ? smEl.value.trim() : 'https://' + smEl.value.trim()).href; }catch(e){ return null; } })() : '';
    if(!name || !url){ showToast(url === null ? 'نشانی سایت درست نیست؛ مثلاً https://www.isna.ir' : 'نام و نشانی سایت را وارد کنید.'); return; }
    if(sitemap === null){ showToast('نشانی فهرست خبری درست نیست؛ می‌توانید آن را خالی بگذارید.'); return; }
    const r = await api('/crawl_sites', { method:'POST', headers:{ Prefer:'return=minimal' }, body: JSON.stringify({ name, url, sitemap_url: sitemap || null }) });
    if(!r.ok){ showToast(r.status === 409 ? 'این سایت قبلاً اضافه شده است.' : 'افزودن انجام نشد؛ اتصال را بررسی کنید و دوباره امتحان کنید.'); return; }
    nameEl.value = ''; urlEl.value = ''; smEl.value = '';
    await loadCrawlSites();
    showToast('«' + name + '» اضافه شد و در اجرای بعدی خزنده جست‌وجو می‌شود.');
  });
}

