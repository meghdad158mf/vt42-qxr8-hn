// «تنظیمات بخش‌ها ← مدیریت منابع»: فهرست و فیلتر منابع، پنجره‌ی ویرایش منبع (بخش‌ها از CHAN_SECTIONS) و افزودن گروهی
import { api } from '../../core/api.js';
import { bindModal } from '../../ui/modal.js';
import { CATEGORIES, CHANNELS, CHANNEL_PROFILE_GROUPS, PROFILE_GROUPS, REGIONS } from '../../data/store.js';
import { escAttr, escHtml, faDigitsToEn, faNum, toFaDigits } from '../../core/text.js';
import { ICONS } from '../../ui/icons.js';
import { LAWS_SOURCES, lawsSourceOf, resetLawsCache } from '../../features/laws/laws.js';
import { loadCrawlSites } from './crawl.js';
import { openDeleteChannelModal } from './delete-channel.js';
import { populateExportFilters } from '../export.js';
import { populatePoliticalFiguresSourceOptions, renderPoliticalFigures, resetPfExtraCache } from '../../features/people/profile-gallery.js';
import { populatePostFilters, renderPosts } from '../../features/cyberspace/posts-feed.js';
import { POS_TAB_LABEL } from '../../features/positions/positions.js';
import { renderCatGrid } from './taxonomy.js';
import { renderChannelCards, renderCyberPeopleGrid } from '../../features/cyberspace/cyber-people.js';
import { renderNewsFeed } from '../../features/news/news-feed.js';
import { renderProfileGroupAdmin } from './profile-groups.js';
import { searchNorm } from '../../core/search.js';
import { showToast } from '../../ui/toast.js';
import { uiConfirm } from '../../ui/confirm.js';
import { uploadChannelAvatarFile } from '../upload-utils.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { loadChannelProfileGroups, loadChannels } from '../../app.js';
import { onChanListRender } from './chan-list-hook.js';

export const chanListEl = document.getElementById('chan-list');
export const chanSearchEl = document.getElementById('chan-search');
export const chanFilterPlatformEl = document.getElementById('chan-filter-platform');
// فیلتر بخش با چیپ (نه select): '' = همه، '__none' = منابع بدون هیچ بخشی
export let chanDomainFilter = '';
export const chanFilterCountEl = document.getElementById('chan-filter-count');
export function filteredChanList(){
  const q = searchNorm(chanSearchEl.value); // ۵.۲۱.۰: مثل جست‌وجوی اخبار
  const platform = chanFilterPlatformEl.value;
  const domain = chanDomainFilter;
  return CHANNELS.filter(ch=>{
    if(platform && ch.platform !== platform) return false;
    if(domain === '__none'){ if(chanSectionsOf(ch).length) return false; }
    else if(domain && !chanSecOn(ch, domain)) return false;
    if(q && !searchNorm((ch.title||'') + ' ' + (ch.username||'')).includes(q)) return false;
    return true;
  });
}
// هر بخش سایت که یه منبع می‌تونه توش نمایش داده بشه — منبع واحد برای
// برچسب‌های فهرست، چیپ‌های فیلتر و مرحله‌ی ۳ پنجره‌ی ویرایش
// ترتیب هم‌راستا با کارت‌های «عرصه‌های رصد» صفحه‌ی نخست (برنامه مدارس منبع نداره).
// «درباره حوزه» توی دیتابیس = show_in_hawza (+ show_in_news که برای کلیدواژه/
// تشخیص سیاسی‌اجتماعی لازمه)، فقط برای وب‌سایت؛ منبعِ حوزوی در «وب‌سایت‌ها»ی
// «اخبار و رویدادها» نمیاد، پس اینجا هم برچسب «اخبار» نمی‌گیره (chanSecOn)
export const CHAN_SECTIONS = [
  { field:'show_in_news', label:'اخبار و رویدادها', short:'اخبار',
    hint:'پست‌ها در تب «شبکه‌های اجتماعی» (ایتا/تلگرام) یا «وب‌سایت‌ها» می‌آیند و در تحلیل «در یک نگاه» حساب می‌شوند.' },
  { field:'show_in_people', label:'چهره‌ها و فعالان سیاسی', short:'چهره‌ها',
    hint:'بخش «یادداشت‌ها»: لوگوی منبع در گالری چهره‌ها نمایش داده می‌شود.' },
  { field:'show_in_orgs', label:'تحلیل سازمان‌ها', short:'سازمان‌ها',
    hint:'بخش «یادداشت‌ها»: لوگوی منبع در گالری سازمان‌ها نمایش داده می‌شود.' },
  { field:'show_in_thinktanks', label:'اندیشکده‌ها و پژوهشگاه‌ها', short:'اندیشکده‌ها', needsMig:true,
    hint:'بخش «یادداشت‌ها»: لوگوی منبع در گالری اندیشکده‌ها نمایش داده می‌شود.' },
  { field:'show_in_hawza', label:'درباره حوزه', short:'درباره حوزه', webOnly:true,
    hint:'تب «اخبار حوزه»: فقط برای خبرگزاری‌های حوزوی (وب‌سایت)؛ اخبار سیاسی‌اجتماعی‌شان به تشخیص هوش مصنوعی نمایش داده می‌شود.' },
  { field:'show_in_cyberspace', label:'کنشگری مجازی', short:'کنشگری',
    hint:'پست‌ها در «پست‌های منتشر شده» می‌آیند و منبع در جدول «افراد و مجموعه‌ها» معرفی می‌شود.' },
  // ۵.۲۸.۰ — عرصه‌های مدار دوم (migration_047)
  { field:'show_in_positions', label:'مواضع مراجع و علماء', short:'مواضع', needsMig:true, noBulk:true,
    hint:'لوگوی منبع در گالری تبی که انتخاب می‌کنید نمایش داده می‌شود؛ فقط مواضع سیاسی‌اجتماعی (به تشخیص هوش مصنوعی) می‌آیند.' },
  { field:'show_in_laws', label:'قوانین و مصوبات', short:'قوانین', needsMig:true,
    hint:'فقط مصوبه‌ها و مواضع رسمی منبع (به تشخیص هوش مصنوعی) در فید «قوانین و مصوبات» با برچسب مرجع صادرکننده می‌آیند.' },
];
// ستون‌های migration_047 هنوز در پایگاه داده نیستند → این بخش‌ها غیرفعال (وگرنه ذخیره‌ی منبع خطا می‌دهد)
export function newColsReady(){ return !CHANNELS.length || ('show_in_positions' in CHANNELS[0]); }
export function chanSecUsable(sec){ return !sec.needsMig || newColsReady(); }
export const CHAN_PLATFORM_LABEL = { eitaa:'ایتا', telegram:'تلگرام', website:'وب‌سایت', bale:'بله' };
export function chanSecOn(ch, field){
  if(field === 'show_in_news') return !!ch.show_in_news && !ch.show_in_hawza;
  return !!ch[field];
}
export function chanSectionsOf(ch){
  return CHAN_SECTIONS.filter(sec=>chanSecOn(ch, sec.field)).map(sec=>
    // کانال بله فقط تب «ادعاها و شایعات» رو تغذیه می‌کنه، نه فید عمومی اخبار
    sec.field === 'show_in_news' && ch.platform === 'bale' ? 'ادعاها و شایعات'
    : sec.field === 'show_in_positions' && POS_TAB_LABEL[ch.positions_tab] ? 'مواضع (' + POS_TAB_LABEL[ch.positions_tab] + ')'
    : sec.field === 'show_in_laws' ? 'قوانین (' + lawsSourceOf(ch) + ')'
    : sec.short);
}
export function chanAvatarHtml(ch){
  if(ch.avatar_url) return `<img src="${escAttr(ch.avatar_url)}" alt="" />`;
  return escAttr((ch.title || ch.username || '؟').trim().charAt(0));
}
export function renderChanSectionChips(){
  const wrap = document.getElementById('chan-section-chips');
  if(!wrap) return;
  const opts = [{key:'', label:'همه', n:CHANNELS.length}]
    .concat(CHAN_SECTIONS.map(sec=>({key:sec.field, label:sec.label, n:CHANNELS.filter(c=>chanSecOn(c, sec.field)).length})))
    .concat([{key:'__none', label:'بدون بخش', n:CHANNELS.filter(c=>!chanSectionsOf(c).length).length}]);
  wrap.innerHTML = opts.map(o=>`<button type="button" class="news-topic-chip${chanDomainFilter===o.key?' active':''}" data-domain="${o.key}">${o.label}<b>${toFaDigits(o.n)}</b></button>`).join('');
}
export function renderChanList(){
  renderChanSectionChips();
  chanListEl.innerHTML = '';
  const list = filteredChanList();
  chanFilterCountEl.textContent = list.length===CHANNELS.length
    ? `${toFaDigits(CHANNELS.length)} منبع`
    : `${toFaDigits(list.length)} از ${toFaDigits(CHANNELS.length)} منبع`;
  if(!list.length){
    chanListEl.innerHTML = '<p style="font-size:12px;color:var(--text-faint);padding:14px 4px;">منبعی با این فیلتر پیدا نشد.</p>';
    return;
  }
  list.forEach(ch=>{
    const row=document.createElement('div'); row.className='chan-item';
    row.title = 'ویرایش ' + (ch.title || ch.username);
    const sections = chanSectionsOf(ch);
    const handleText = ch.platform==='website' ? ch.username : '@'+ch.username;
    const cat = CATEGORIES.find(c=>c.id===ch.category_id);
    row.innerHTML = `
      <span class="chan-item-avatar">${chanAvatarHtml(ch)}</span>
      <div class="chan-item-main">
        <div class="chan-item-name">${escAttr(ch.title||ch.username)}</div>
        <div class="chan-item-sub">${escAttr(handleText)} · ${CHAN_PLATFORM_LABEL[ch.platform]||ch.platform}${cat ? ' · '+escAttr(cat.name) : ''}</div>
      </div>
      <div class="chan-item-badges">${sections.length
        ? sections.map(t=>`<span class="chan-badge">${t}</span>`).join('')
        : '<span class="chan-badge none">در هیچ بخشی نمایش داده نمی‌شود</span>'}</div>
      <button type="button" class="chan-item-edit">ویرایش</button>`;
    row.addEventListener('click', ()=> openChanEditor(ch));
    const del=document.createElement('button'); del.className='del-btn'; del.textContent='✕'; del.title='حذف منبع'; del.setAttribute('aria-label','حذف منبع '+(ch.title||ch.username));
    del.addEventListener('click', e=>{ e.stopPropagation(); openDeleteChannelModal(ch); });
    row.appendChild(del);
    chanListEl.appendChild(row);
  });
}
// ---- پنجره‌ی ویرایش/افزودن منبع (سه مرحله: مشخصات، موضوع، بخش‌ها) ----
export let CE_CHANNEL = null;      // null = افزودن منبع جدید
export let CE_AVATAR_FILE = null;  // عکس انتخاب‌شده، تا کلیک «ذخیره» آپلود نمی‌شه
export const ceEl = id => document.getElementById(id);
export function ceUpdateHandleLabel(){
  const isWeb = ceEl('ce-platform').value === 'website';
  ceEl('ce-handle-label').textContent = isWeb ? 'آدرس فید RSS' : 'یوزرنیم کانال (بدون @)';
  ceEl('ce-handle').placeholder = isWeb ? 'https://example.com/rss' : 'channel_name';
  ceRenderSections();
}
export function ceRenderSections(){
  const ch = CE_CHANNEL || {};
  const wrap = ceEl('ce-sections');
  // وضعیت فعلی تیک‌ها (اگه کاربر قبلاً توی همین پنجره عوض کرده) حفظ بشه
  const prev = {};
  wrap.querySelectorAll('[data-ce]').forEach(el=>{ prev[el.dataset.ce] = el.type==='checkbox' ? el.checked : el.value; });
  const val = (key, fallback)=> key in prev ? prev[key] : fallback;
  const isWeb = ceEl('ce-platform').value === 'website';
  const chGroups = ch.id ? CHANNEL_PROFILE_GROUPS.filter(x=>x.channel_id===ch.id).map(x=>x.group_id) : [];
  const groupsHtml = kind=>{
    const gs = PROFILE_GROUPS.filter(g=>g.kind===kind);
    if(!gs.length) return `<p class="ce-hint ce-full">هنوز گروهی برای این بخش تعریف نشده (تنظیمات ← گروه‌های «چهره‌ها» و «سازمان‌ها»).</p>`;
    return `<div class="ce-full"><label class="ce-sub-label">گروه‌ها (می‌توانید چند گروه انتخاب کنید)</label><div class="ce-groups">${gs.map(g=>
      `<label class="ce-check"><input type="checkbox" data-ce="group-${g.id}" ${val('group-'+g.id, chGroups.includes(g.id)) ? 'checked' : ''}/>${escAttr(g.name)}</label>`).join('')}</div></div>`;
  };
  const extras = {
    show_in_news: `
      <div class="field"><label>منطقه‌ی جغرافیایی</label><select data-ce="region_id">
        <option value="">بدون منطقه</option>${REGIONS.map(r=>`<option value="${r.id}" ${String(val('region_id', ch.region_id||''))===String(r.id)?'selected':''}>${escAttr(r.name)}</option>`).join('')}
      </select></div>`,
    show_in_hawza: `
      <div class="field"><label>منطقه‌ی جغرافیایی</label><select data-ce="hawza_region_id">
        <option value="">بدون منطقه</option>${REGIONS.map(r=>`<option value="${r.id}" ${String(val('hawza_region_id', ch.region_id||''))===String(r.id)?'selected':''}>${escAttr(r.name)}</option>`).join('')}
      </select></div>`,
    show_in_cyberspace: `
      <div class="field"><label>صاحب کانال</label><input type="text" data-ce="owner_name" value="${escAttr(val('owner_name', ch.owner_name||''))}" placeholder="نام صاحب کانال" /></div>
      <div class="field"><label>تعداد مخاطب</label><input type="number" min="0" data-ce="subscriber_count" value="${escAttr(val('subscriber_count', ch.subscriber_count==null?'':ch.subscriber_count))}" placeholder="مثلاً ۱۲۰۰۰" /></div>
      <label class="ce-check ce-full"><input type="checkbox" data-ce="is_khorasan_talabeh" ${val('is_khorasan_talabeh', !!ch.is_khorasan_talabeh)?'checked':''}/>صاحب کانال، طلبه‌ی حوزه‌ی خراسان است</label>`,
    show_in_people: groupsHtml('figures'),
    show_in_orgs: groupsHtml('orgs'),
    show_in_thinktanks: '',
    show_in_positions: `
      <div class="field"><label>تب</label><select data-ce="positions_tab">
        ${Object.keys(POS_TAB_LABEL).map(k=>`<option value="${k}" ${val('positions_tab', ch.positions_tab || 'maraji') === k ? 'selected' : ''}>${POS_TAB_LABEL[k]}</option>`).join('')}
      </select></div>`,
    show_in_laws: (()=>{
      const cur = String(val('laws_source', ch.laws_source || '') || '');
      const opts = LAWS_SOURCES.concat(cur && !LAWS_SOURCES.includes(cur) ? [cur] : []);
      return `<div class="field"><label>مرجع صادرکننده (فیلتر)</label><select data-ce="laws_source">
        ${opts.map(s=>`<option value="${escAttr(s === 'سایر' ? '' : s)}" ${(cur || '') === (s === 'سایر' ? '' : s) ? 'selected' : ''}>${escHtml(s)}</option>`).join('')}
      </select></div>`;
    })(),
  };
  wrap.innerHTML = CHAN_SECTIONS.map(sec=>{
    const noMig = !chanSecUsable(sec);
    const blocked = (sec.webOnly && !isWeb) || noMig;
    const on = !blocked && val(sec.field, chanSecOn(ch, sec.field));
    return `<div class="ce-section${on?' on':''}${blocked?' blocked':''}">
      <label class="ce-section-toggle"><input type="checkbox" data-ce="${sec.field}" ${on?'checked':''} ${blocked?'disabled':''}/>
        <div><b>${sec.label}</b><span>${noMig ? 'برای فعال شدن این بخش، ابتدا migration_047 باید در سوپابیس اجرا شود.' : blocked ? 'فقط برای منابع «وب‌سایت» (خبرگزاری‌های حوزوی) قابل انتخاب است.' : sec.hint}</span></div></label>
      <div class="ce-section-extra">${extras[sec.field]}</div>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.ce-section-toggle input').forEach(chk=>{
    chk.addEventListener('change', ()=> chk.closest('.ce-section').classList.toggle('on', chk.checked));
  });
}
export function openChanEditor(ch){
  CE_CHANNEL = ch || null;
  CE_AVATAR_FILE = null;
  ceEl('ce-title').textContent = ch ? 'ویرایش «' + (ch.title || ch.username) + '»' : 'افزودن منبع جدید';
  ceEl('ce-name').value = ch ? (ch.title || '') : '';
  ceEl('ce-handle').value = ch ? (ch.username || '') : '';
  ceEl('ce-platform').value = ch ? ch.platform : 'eitaa';
  // بستر منبع ثبت‌شده عوض نمی‌شه (کالکتورها بر اساس همین پست جمع می‌کنن)
  ceEl('ce-platform').disabled = !!ch;
  ceEl('ce-avatar-preview').innerHTML = ch ? chanAvatarHtml(ch) : ICONS.photo;
  ceEl('ce-cat').innerHTML = '<option value="">بدون موضوع</option>' +
    CATEGORIES.map(c=>`<option value="${c.id}" ${ch && c.id===ch.category_id ? 'selected':''}>${escAttr(c.name)}</option>`).join('');
  ceEl('ce-sections').innerHTML = '';
  ceUpdateHandleLabel();
  ceEl('chan-editor-modal').classList.add('active');
  ceEl('chan-editor-modal').querySelector('.modal-card').scrollTop = 0;
}
export function closeChanEditor(){
  ceEl('chan-editor-modal').classList.remove('active');
  CE_CHANNEL = null; CE_AVATAR_FILE = null;
}
// ---- افزودن گروهی منابع (۵.۲۶.۰) ----
// هر خط: «لینک [نام]». ایتا eitaa.com/x، تلگرام t.me/x (لینک دعوت خصوصی نه)، @x یا x
// = بستر پیش‌فرض انتخاب‌شده، http(s) دیگه = فید RSS وب‌سایت. بله نه — کالکتورش فقط
// قالب «رصد شایعات» رو می‌شناسه. تکراری = همون بستر + شناسه در منابع فعلی یا همین فهرست.
export let BULK_ROWS = [];
export const BULK_MAX = 300;
export function openBulkChan(){
  BULK_ROWS = [];
  document.getElementById('bulk-chan-text').value = '';
  document.getElementById('bulk-chan-step1').hidden = false;
  document.getElementById('bulk-chan-step2').hidden = true;
  document.getElementById('bulk-chan-modal').classList.add('active');
  setTimeout(()=>document.getElementById('bulk-chan-text').focus(), 50);
}
export function closeBulkChan(){ document.getElementById('bulk-chan-modal').classList.remove('active'); }
export function bulkChanBack(){ document.getElementById('bulk-chan-step1').hidden = false; document.getElementById('bulk-chan-step2').hidden = true; }
export function parseBulkLine(line, defPlat){
  // نیم‌فاصله‌ی نام منبع دست نمی‌خوره (فقط از خودِ لینک/شناسه حذف می‌شه)؛ گیومه‌های CSV چسبانده‌شده هم مثل فایل
  line = faDigitsToEn(line).replace(/"/g, '').trim();
  if(!line || line.startsWith('#')) return null;
  const m = line.match(/^(\S+?)(?:(?:\s*[,،;]\s*|\s+)(.*))?$/);
  const tok = m[1].replace(/[​-‏﻿]/g, '').replace(/[,،;]+$/, ''), title = (m[2] || '').replace(/^[,،;\s]+|[,،;\s]+$/g, '').slice(0, 120);
  const row = { raw: line, title, platform:null, username:null, error:null };
  let x;
  // لینک ایتا/تلگرام/بله: ?… و #… (مثل ?single) کنار؛ اگه با الگوی کانال عمومی نخونه خطاست، هرگز «وب‌سایت»
  const msg = tok.match(/^(?:https?:\/\/)?(?:www\.)?(t\.me|telegram\.me|eitaa\.com|web\.eitaa\.com|ble\.ir)(\/.*)?$/i);
  if(msg){
    const host = msg[1].toLowerCase(), rest = msg[2] || '';
    const webEitaa = host === 'web.eitaa.com' && rest.match(/#@?([A-Za-z0-9_]{3,})/);
    const path = rest.replace(/[?#].*$/, '');
    if(host === 'ble.ir'){ row.error = 'کانال بله پشتیبانی نمی‌شود (جمع‌آوری بله فقط برای «رصد شایعات» ساخته شده)'; return row; }
    if(/^\/(joinchat\/|\+|c\/)/i.test(path)){ row.error = 'لینک دعوت یا کانال خصوصی؛ فقط کانال عمومی قابل رصد است'; return row; }
    if(host === 't.me' || host === 'telegram.me'){
      if((x = path.match(/^\/(?:s\/)?([A-Za-z0-9_]{4,})\/?(?:\d+\/?)?$/))){ row.platform = 'telegram'; row.username = x[1]; return row; }
    }else if(webEitaa){ row.platform = 'eitaa'; row.username = webEitaa[1]; return row; }
    else if(host === 'eitaa.com'){
      if((x = path.match(/^\/([A-Za-z0-9_]{3,})\/?(?:\d+\/?)?$/))){ row.platform = 'eitaa'; row.username = x[1]; return row; }
    }
    row.error = 'لینک ' + (host.includes('eitaa') ? 'ایتا' : 'تلگرام') + ' قابل تشخیص نیست؛ نشانی کانال را به شکل ' + (host.includes('eitaa') ? 'eitaa.com/نام' : 't.me/نام') + ' وارد کنید';
    return row;
  }
  if((x = tok.match(/^@?([A-Za-z][A-Za-z0-9_]{2,})$/))){ row.platform = defPlat; row.username = x[1]; return row; }
  if(/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(tok)){ row.platform = 'website'; row.username = tok; return row; }
  row.error = 'لینک یا نام کاربری قابل تشخیص نیست';
  return row;
}
export function bulkKey(platform, username){ return platform + '|' + (platform === 'website' ? username.replace(/\/+$/, '') : username.toLowerCase()); }
export function bulkChanPreview(){
  const defPlat = document.getElementById('bulk-chan-default').value;
  const lines = document.getElementById('bulk-chan-text').value.split(/\r?\n/);
  const existing = new Map(CHANNELS.map(c=>[bulkKey(c.platform, String(c.username || '')), c]));
  const seen = new Set();
  const parsed = lines.map(l=>parseBulkLine(l, defPlat)).filter(Boolean);
  BULK_ROWS = parsed.slice(0, BULK_MAX);
  if(!BULK_ROWS.length){ showToast('فهرست خالی است؛ دست‌کم یک لینک وارد کنید.'); return; }
  const cut = parsed.length - BULK_ROWS.length;
  BULK_ROWS.forEach(r=>{
    if(r.error){ r.status = 'bad'; return; }
    const k = bulkKey(r.platform, r.username);
    const ex = existing.get(k);
    if(ex){ r.status = 'dup'; r.dupName = ex.title || ex.username; return; }
    if(seen.has(k)){ r.status = 'dup'; r.dupName = 'تکرار در همین فهرست'; return; }
    seen.add(k); r.status = 'new';
    if(!r.title) r.title = r.platform === 'website' ? (()=>{ try{ return new URL(r.username).hostname.replace(/^www\./, ''); }catch(e){ return r.username; } })() : r.username;
  });
  const n = BULK_ROWS.filter(r=>r.status === 'new').length, d = BULK_ROWS.filter(r=>r.status === 'dup').length, b = BULK_ROWS.filter(r=>r.status === 'bad').length;
  document.getElementById('bulk-chan-sum').innerHTML = `<b>${faNum(n)} منبع تازه</b>${d ? '، ' + faNum(d) + ' تکراری' : ''}${b ? '، ' + faNum(b) + ' نامعتبر' : ''}. تکراری‌ها و نامعتبرها اضافه نمی‌شوند؛ نام منابع تازه را اگر لازم است اصلاح کنید.${cut ? `<br><b class="bulk-cut">فقط ${faNum(BULK_MAX)} خط اول بررسی شد؛ ${faNum(cut)} خط باقی‌مانده را بعد از ذخیره در نوبت بعدی وارد کنید.</b>` : ''}`;
  const PL = { eitaa:'ایتا', telegram:'تلگرام', website:'وب‌سایت' };
  document.getElementById('bulk-chan-table').innerHTML = `<thead><tr><th>بستر</th><th>شناسه یا آدرس</th><th>نام</th><th>وضعیت</th></tr></thead><tbody>${BULK_ROWS.map((r, i)=>`<tr class="${r.status}">
    <td>${r.platform ? PL[r.platform] : '—'}</td>
    <td dir="ltr" class="bulk-handle">${escHtml(r.username || r.raw)}</td>
    <td>${r.status === 'new' ? `<input type="text" data-bulk-title="${i}" value="${escAttr(r.title)}" maxlength="120" aria-label="نام منبع">` : escHtml(r.title || '—')}</td>
    <td><span class="bulk-badge ${r.status}">${r.status === 'new' ? 'تازه' : r.status === 'dup' ? 'تکراری' : 'نامعتبر'}</span>${r.status === 'dup' ? `<small>${escHtml(r.dupName)}</small>` : r.error ? `<small>${escHtml(r.error)}</small>` : ''}</td>
  </tr>`).join('')}</tbody>`;
  // تنظیمات مشترک
  document.getElementById('bulk-chan-cat').innerHTML = '<option value="">بدون موضوع</option>' + CATEGORIES.map(c=>`<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
  document.getElementById('bulk-chan-region').innerHTML = '<option value="">بدون منطقه</option>' + REGIONS.map(r=>`<option value="${r.id}">${escHtml(r.name)}</option>`).join('');
  const hasWeb = BULK_ROWS.some(r=>r.status === 'new' && r.platform === 'website');
  document.getElementById('bulk-chan-secs').innerHTML = CHAN_SECTIONS.filter(sec=>!sec.noBulk && chanSecUsable(sec)).map(sec=>`<label class="ce-check"><input type="checkbox" data-bulk-sec="${sec.field}" ${sec.webOnly && !hasWeb ? 'disabled' : ''}/>${escHtml(sec.label)}${sec.webOnly ? '<small>(فقط وب‌سایت‌ها)</small>' : ''}</label>`).join('');
  const save = document.getElementById('bulk-chan-save');
  save.textContent = n ? 'افزودن ' + faNum(n) + ' منبع' : 'منبع تازه‌ای نیست';
  save.disabled = !n;
  document.getElementById('bulk-chan-step1').hidden = true;
  document.getElementById('bulk-chan-step2').hidden = false;
}
export async function bulkChanSave(){
  const rows = BULK_ROWS.filter(r=>r.status === 'new');
  if(!rows.length) return;
  const secs = {};
  document.querySelectorAll('#bulk-chan-secs [data-bulk-sec]').forEach(el=>{ secs[el.dataset.bulkSec] = el.checked && !el.disabled; });
  if(!Object.values(secs).some(Boolean) && !await uiConfirm('هیچ بخشی انتخاب نشده است\nمنابع اضافه می‌شوند و جمع‌آوری می‌شوند، ولی تا وقتی بخشی برایشان تیک نزنید در سایت دیده نمی‌شوند. ادامه می‌دهید؟')) return;
  const cat = document.getElementById('bulk-chan-cat').value, reg = document.getElementById('bulk-chan-region').value;
  const body = rows.map(r=>{
    const b = { platform: r.platform, username: r.username, title: (r.title || '').trim() || r.username, category_id: cat ? Number(cat) : null };
    CHAN_SECTIONS.filter(sec=>!sec.noBulk && chanSecUsable(sec)).forEach(sec=>{ b[sec.field] = !!secs[sec.field]; });
    if(r.platform !== 'website') b.show_in_hawza = false;
    if(b.show_in_hawza) b.show_in_news = true; // مثل ویرایشگر تکی: کلیدواژه/تشخیص سیاسی فقط روی show_in_news
    b.region_id = (b.show_in_news && reg) ? Number(reg) : null;
    return b;
  });
  const btn = document.getElementById('bulk-chan-save');
  btn.disabled = true; btn.textContent = 'در حال افزودن…';
  try{
    const r = await api('/channels?on_conflict=platform,username', { method:'POST', headers:{ Prefer:'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(body) });
    if(!r.ok) throw new Error('channels bulk ' + r.status);
    const added = (await r.json()).length;
    closeBulkChan();
    await loadChannels();
    resetPfExtraCache(); resetLawsCache();
    renderChanList(); renderCatGrid(); renderChannelCards(); populatePostFilters(); populateExportFilters();
    renderNewsFeed(); renderPosts(); renderCyberPeopleGrid(); populatePoliticalFiguresSourceOptions(); renderPoliticalFigures();
    loadCrawlSites();
    showToast(faNum(added) + ' منبع اضافه شد؛ از اجرای بعدی جمع‌آوری (حداکثر ۲ ساعت دیگر) مطالبشان می‌رسد.');
  }catch(e){
    console.error(e);
    showToast('افزودن ناموفق بود؛ اتصال اینترنت را بررسی کنید و دوباره امتحان کنید.');
    btn.disabled = false; btn.textContent = 'افزودن ' + faNum(rows.length) + ' منبع';
  }
}
export function setupChannelsAdmin(){
  document.getElementById('bulk-chan-btn').addEventListener('click', ()=>openBulkChan());
  document.getElementById('bulk-chan-preview').addEventListener('click', ()=>bulkChanPreview());
  document.getElementById('bulk-chan-back').addEventListener('click', ()=>bulkChanBack());
  document.getElementById('bulk-chan-save').addEventListener('click', ()=>bulkChanSave());
  onChanListRender(renderChanList);
  chanSearchEl.addEventListener('input', renderChanList);
  chanFilterPlatformEl.addEventListener('change', renderChanList);
  document.getElementById('chan-section-chips').addEventListener('click', e=>{
    const chip = e.target.closest('.news-topic-chip'); if(!chip) return;
    chanDomainFilter = chip.dataset.domain || '';
    renderChanList();
  });
  bindModal('chan-editor-modal', closeChanEditor);
  bindModal('bulk-chan-modal', closeBulkChan);
  document.getElementById('bulk-chan-file').addEventListener('change', async e=>{
    const f = e.target.files[0]; e.target.value = '';
    if(!f) return;
    if(f.size > 1048576){ showToast('فایل بزرگ‌تر از ۱ مگابایت است؛ فهرست را کوتاه‌تر کنید.'); return; }
    const txt = (await f.text()).replace(/^﻿/, '');
    const ta = document.getElementById('bulk-chan-text');
    ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + txt.split(/\r?\n/).map(l=>l.replace(/"/g, '').replace(/;/g, ',')).join('\n');
    showToast('فایل خوانده شد؛ «بررسی فهرست» را بزنید.');
  });
  document.getElementById('bulk-chan-table').addEventListener('input', e=>{
    const inp = e.target.closest('[data-bulk-title]'); if(inp) BULK_ROWS[Number(inp.dataset.bulkTitle)].title = inp.value;
  });
  ceEl('ce-platform').addEventListener('change', ceUpdateHandleLabel);
  ceEl('ce-avatar-input').addEventListener('change', ()=>{
    const file = ceEl('ce-avatar-input').files[0];
    if(!file) return;
    CE_AVATAR_FILE = file;
    ceEl('ce-avatar-preview').innerHTML = `<img src="${URL.createObjectURL(file)}" alt="" />`;
  });
  ceEl('add-chan-btn').addEventListener('click', ()=> openChanEditor(null));
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && ceEl('chan-editor-modal').classList.contains('active')) closeChanEditor();
  });
  ceEl('ce-save-btn').addEventListener('click', async ()=>{
    const btn = ceEl('ce-save-btn');
    const ch = CE_CHANNEL;
    const platform = ceEl('ce-platform').value;
    const name = ceEl('ce-name').value.trim();
    const rawHandle = ceEl('ce-handle').value.trim();
    const handle = platform === 'website' ? rawHandle : rawHandle.replace(/^@/,'');
    if(!name){ showToast('نام منبع را وارد کنید'); ceEl('ce-name').focus(); return; }
    if(!handle){ showToast(platform==='website' ? 'آدرس فید RSS را وارد کنید' : 'یوزرنیم کانال را وارد کنید'); ceEl('ce-handle').focus(); return; }
    const get = key=>{ const el = ceEl('ce-sections').querySelector(`[data-ce="${key}"]`); return el ? (el.type==='checkbox' ? el.checked : el.value) : undefined; };
    const catVal = ceEl('ce-cat').value;
    const body = { title:name, username:handle, category_id: catVal ? Number(catVal) : null };
    CHAN_SECTIONS.filter(chanSecUsable).forEach(sec=>{ body[sec.field] = !!get(sec.field); });
    if(newColsReady()){
      body.positions_tab = body.show_in_positions ? (get('positions_tab') || 'maraji') : null;
      body.laws_source = body.show_in_laws ? ((get('laws_source') || '').trim() || null) : null;
    }
    if(platform !== 'website') body.show_in_hawza = false;
    // «درباره حوزه» توی دیتابیس show_in_news رو هم لازم داره (کلیدواژه و تشخیص
    // سیاسی‌اجتماعی فقط روی منابع show_in_news اجرا می‌شن)
    const newsTicked = body.show_in_news;
    if(body.show_in_hawza) body.show_in_news = true;
    if(newsTicked || body.show_in_hawza){
      const reg = newsTicked ? get('region_id') : get('hawza_region_id');
      body.region_id = reg ? Number(reg) : null;
    }
    if(body.show_in_cyberspace){
      body.owner_name = (get('owner_name')||'').trim() || null;
      const sub = get('subscriber_count'); body.subscriber_count = sub==='' || sub==null ? null : Number(faDigitsToEn(String(sub)));
      body.is_khorasan_talabeh = !!get('is_khorasan_talabeh');
    }
    btn.disabled = true; btn.textContent = 'در حال ذخیره…';
    try{
      if(CE_AVATAR_FILE) body.avatar_url = await uploadChannelAvatarFile(CE_AVATAR_FILE);
      let id = ch && ch.id;
      if(ch){
        const r = await api('/channels?id=eq.'+ch.id, {method:'PATCH', body: JSON.stringify(body)});
        if(!r.ok) throw new Error('patch');
      }else{
        body.platform = platform;
        const r = await api('/channels', {method:'POST', headers:{Prefer:'return=representation'}, body: JSON.stringify(body)});
        if(!r.ok){ showToast('این منبع از قبل ثبت شده یا خطایی رخ داد'); return; }
        id = (await r.json())[0].id;
      }
      // گروه‌ها: فقط گروه‌های بخش‌هایی که تیکشون خورده؛ بقیه‌ی عضویت‌ها حذف می‌شن
      const kinds = [body.show_in_people && 'figures', body.show_in_orgs && 'orgs'].filter(Boolean);
      const wanted = new Set(PROFILE_GROUPS.filter(g=>kinds.includes(g.kind) && get('group-'+g.id)).map(g=>g.id));
      const current = new Set(CHANNEL_PROFILE_GROUPS.filter(x=>x.channel_id===id).map(x=>x.group_id));
      const ops = [];
      wanted.forEach(gid=>{ if(!current.has(gid)) ops.push(api('/channel_profile_groups', {method:'POST', headers:{Prefer:'return=minimal'}, body: JSON.stringify({channel_id:id, group_id:gid})})); });
      current.forEach(gid=>{ if(!wanted.has(gid)) ops.push(api('/channel_profile_groups?channel_id=eq.'+id+'&group_id=eq.'+gid, {method:'DELETE'})); });
      await Promise.all(ops);
      await Promise.all([loadChannels(), loadChannelProfileGroups()]);
      resetPfExtraCache(); resetLawsCache(); // عضویت بخش‌های تازه عوض شده باشه، داده‌ی جدا دوباره گرفته بشه
      closeChanEditor();
      renderChanList(); renderCatGrid(); renderChannelCards(); populatePostFilters(); populateExportFilters();
      renderNewsFeed(); renderPosts(); renderCyberPeopleGrid(); populatePoliticalFiguresSourceOptions(); renderPoliticalFigures(); renderProfileGroupAdmin();
      loadCrawlSites(); // سایت تازه‌ی مدیریت منابع → خودکار در فهرست خزنده‌ی «درباره حوزه»
      showToast(ch ? 'تغییرات ذخیره شد' : 'منبع جدید اضافه شد');
    }catch(e){
      showToast('ذخیره ناموفق بود؛ دوباره تلاش کنید');
    }finally{
      btn.disabled = false; btn.textContent = 'ذخیره';
    }
  });
}

