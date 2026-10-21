// تب «افراد و مجموعه‌ها» (کنشگری مجازی): جدول کانال‌های کنشگر با مرتب‌سازی و فیلتر طلاب خراسان
import { CATEGORIES, CHANNELS, POSTS_CACHE } from '../../data/store.js';
import { escAttr, escHtml, toFaDigits } from '../../core/text.js';
import { ICONS } from '../../ui/icons.js';
import { matchesActivistGroup, openPersonFeed } from './posts-feed.js';

// ---- channels & people page ----
export function activityOf(channelId){
  // هفته‌ی اخیر rolling (نه ۲۴ساعته) — طبق درخواست صریح کاربر، آستانه‌ی
  // قبلی (۲۴ساعته، ≥۸/≥۳) برای کانال‌های کنشگری مجازی زیادی سخت‌گیرانه بود
  const weekAgo = Date.now() - 7*24*3600*1000;
  const n = POSTS_CACHE.filter(p=>p.channel_id===channelId && new Date(p.scraped_at).getTime()>=weekAgo).length;
  if(n === 0) return {level:'inactive', label:'غیرفعال', n};
  if(n > 20) return {level:'high', label:'زیاد', n};
  if(n >= 7) return {level:'mid', label:'متوسط', n};
  return {level:'low', label:'کم', n};
}
export function renderChannelCards(){
  const wrap = document.getElementById('channel-cards');
  wrap.innerHTML = '';
  CHANNELS.forEach(ch=>{
    const act = activityOf(ch.id);
    const cat = CATEGORIES.find(c=>c.id===ch.category_id);
    const el=document.createElement('div'); el.className='channel-card';
    el.innerHTML = `<div class="cc-photo"><div class="cc-portrait">${ICONS.person}</div></div>
      <div class="cc-body">
        <div class="cc-name">${escHtml(ch.title || ch.username)}</div>
        <div class="cc-admin">${ch.platform==='telegram'?'تلگرام':'ایتا'} · <span class="mono">@${escHtml(ch.username)}</span></div>
        <div class="cc-activity ${act.level}"><span class="dot"></span>فعالیت ${act.label}</div>
        <div class="cc-cats">${cat?`<span>${escHtml(cat.name)}</span>`:''}<span>${ch.type==='news_agency'?'خبرگزاری':'شخصیت'}</span></div>
      </div>`;
    wrap.appendChild(el);
  });
}
// فیلتر «طلاب خراسان / سایر» جدول «افراد و مجموعه‌ها» — '' یعنی همه؛
// نگاه کن به matchesActivistGroup
export let cyberPeopleGroupFilter = '';
export const cyberPeopleGroupSegEl = document.getElementById('cyber-people-group-seg');
// مرتب‌سازی جدول «افراد و مجموعه‌ها» با کلیک روی سرستون‌ها — بدون سرور،
// کاملاً سمت کلاینت روی همون آرایه‌ی فیلترشده‌ی CHANNELS
export let cyberPeopleSort = { field: null, dir: 'asc' };
export const CPT_NUMERIC_SORT = ['subscribers', 'activity'];
// روی گوشی سربرگ جدول مخفیه — مرتب‌سازی با این فهرست کشویی
export function syncCyberPeopleSortSelect(){
  const sel = document.getElementById('cyber-people-sort-m');
  if(sel) sel.value = cyberPeopleSort.field ? cyberPeopleSort.field + ':' + cyberPeopleSort.dir : '';
}
export function cyberPeopleSortValue(ch, field){
  switch(field){
    case 'name': return ch.title || ch.username || '';
    case 'platform': return ch.platform==='telegram' ? 'تلگرام' : 'ایتا';
    case 'owner': return ch.owner_name || '';
    case 'subscribers': return ch.subscriber_count == null ? null : ch.subscriber_count;
    case 'activity': return activityOf(ch.id).n;
    case 'category': { const c = CATEGORIES.find(x=>x.id===ch.category_id); return c ? c.name : ''; }
    case 'group': return ch.is_khorasan_talabeh ? 'طلاب خراسان' : 'سایر کنشگران';
    default: return '';
  }
}
export const cyberPeopleHeadEl = document.getElementById('cyber-people-head');
export function renderCyberPeopleGrid(){
  const wrap = document.getElementById('cyber-people-grid');
  const table = document.getElementById('cyber-people-table');
  const empty = document.getElementById('cyber-people-empty');
  if(!wrap) return;
  const channels = CHANNELS.filter(c=>c.show_in_cyberspace && matchesActivistGroup(c, cyberPeopleGroupFilter));
  if(empty) empty.textContent = (CHANNELS.some(c=>c.show_in_cyberspace) && cyberPeopleGroupFilter)
    ? 'کانالی با این فیلتر پیدا نشد.'
    : 'هنوز کانالی برای «کنشگری مجازی» تگ نشده.';
  if(cyberPeopleSort.field){
    const field = cyberPeopleSort.field;
    const dir = cyberPeopleSort.dir === 'desc' ? -1 : 1;
    channels.sort((a,b)=>{
      const va = cyberPeopleSortValue(a, field), vb = cyberPeopleSortValue(b, field);
      // بدون مقدار (مثلاً مخاطب ثبت‌نشده) همیشه ته فهرست، در هر دو جهت
      const ea = va === null || va === '', eb = vb === null || vb === '';
      if(ea || eb) return ea === eb ? 0 : (ea ? 1 : -1);
      if(typeof va === 'number' && typeof vb === 'number') return (va-vb)*dir;
      return String(va).localeCompare(String(vb), 'fa') * dir;
    });
  }
  if(cyberPeopleHeadEl) cyberPeopleHeadEl.querySelectorAll('.cpt-sort-btn').forEach(btn=>{
    const isActive = btn.dataset.sort === cyberPeopleSort.field;
    btn.classList.toggle('active', isActive);
    const ind = btn.querySelector('.cpt-sort-ind');
    if(ind) ind.textContent = isActive ? (cyberPeopleSort.dir==='asc' ? '▲' : '▼') : '⇅';
  });
  empty.style.display = channels.length ? 'none' : 'block';
  table.style.display = channels.length ? '' : 'none';
  const countEl = document.getElementById('cyber-people-count');
  if(countEl){
    const allCyber = CHANNELS.filter(c=>c.show_in_cyberspace);
    const khCount = allCyber.filter(c=>c.is_khorasan_talabeh).length;
    const otherCount = allCyber.length - khCount;
    countEl.innerHTML = `مجموع: <b>${toFaDigits(channels.length)}</b> کانال` +
      (cyberPeopleGroupFilter ? '' : ` (طلاب خراسان: <b>${toFaDigits(khCount)}</b> · سایر کنشگران: <b>${toFaDigits(otherCount)}</b>)`);
  }
  wrap.innerHTML = '';
  channels.forEach(ch=>{
    const act = activityOf(ch.id);
    const cat = CATEGORIES.find(c=>c.id===ch.category_id);
    const el=document.createElement('div'); el.className='cpt-row';
    el.title = 'مشاهده‌ی پست‌های ' + (ch.title || ch.username);
    const channelUrl = ch.platform==='telegram' ? `https://t.me/${encodeURIComponent(ch.username||'')}` : `https://eitaa.com/${encodeURIComponent(ch.username||'')}`;
    el.innerHTML = `<div class="cpt-who">
        <div class="cpt-avatar-wrap">
          <div class="cpt-avatar">${ch.avatar_url ? `<img src="${escAttr(ch.avatar_url)}" alt="" loading="lazy" />` : ICONS.person}</div>
          <span class="cpt-dot ${act.level}" title="${act.level==='inactive' ? act.label : 'فعالیت ' + act.label}"></span>
        </div>
        <div class="cpt-who-txt">
          <div class="cpt-name">${escHtml(ch.title || ch.username)}</div>
        </div>
      </div>
      <div class="cpt-platform">
        <span class="cpt-platform-name">${ch.platform==='telegram'?'تلگرام':'ایتا'}</span>
        <a class="cpt-platform-link mono" href="${escAttr(channelUrl)}" target="_blank" rel="noopener">${escHtml(channelUrl.replace('https://',''))}</a>
      </div>
      <div class="cpt-owner">${ch.owner_name ? ICONS.userLine + `<span>${escHtml(ch.owner_name)}</span>` : ''}</div>
      <div class="cpt-num">${ch.subscriber_count ? `<span class="cpt-num-val">${ICONS.users}${toFaDigits(ch.subscriber_count)}</span>` : ''}</div>
      <div class="cpt-activity-col"><span class="cpt-activity ${act.level}"><span class="dt"></span>${act.level==='inactive' ? act.label : 'فعالیت ' + act.label}</span></div>
      <div class="cpt-tagcol">${cat ? `<span class="cpt-tag">${escHtml(cat.name)}</span>` : ''}</div>
      <div class="cpt-groupcol"><span class="cpt-tag${ch.is_khorasan_talabeh ? ' cpt-tag-khorasan' : ''}">${ch.is_khorasan_talabeh ? 'طلاب خراسان' : 'سایر کنشگران'}</span></div>
      <span class="cpt-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg></span>`;
    el.querySelector('.cpt-platform-link').addEventListener('click', e => e.stopPropagation());
    el.addEventListener('click', ()=> openPersonFeed(ch.id));
    wrap.appendChild(el);
  });
}
export function setupCyberPeople(){
  if(cyberPeopleGroupSegEl) cyberPeopleGroupSegEl.addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b || b.dataset.g===undefined) return;
    cyberPeopleGroupSegEl.querySelectorAll(':scope > button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    cyberPeopleGroupFilter = b.dataset.g;
    renderCyberPeopleGrid();
  });
  // مرتب‌سازی جدول «افراد و مجموعه‌ها» روی گوشی (سربرگ جدول مخفیه)
  document.getElementById('cyber-people-sort-m').addEventListener('change', e=>{
    const [f, d] = e.target.value.split(':');
    cyberPeopleSort = { field: f || null, dir: d || 'asc' };
    renderCyberPeopleGrid();
  });
  if(cyberPeopleHeadEl) cyberPeopleHeadEl.addEventListener('click', e=>{
    const btn = e.target.closest('.cpt-sort-btn'); if(!btn) return;
    const field = btn.dataset.sort;
    if(cyberPeopleSort.field === field){ cyberPeopleSort.dir = cyberPeopleSort.dir==='asc' ? 'desc' : 'asc'; }
    // ستون‌های عددی (مخاطب، فعالیت) با کلیک اول از بیشترین شروع می‌شن
    else{ cyberPeopleSort.field = field; cyberPeopleSort.dir = CPT_NUMERIC_SORT.includes(field) ? 'desc' : 'asc'; }
    syncCyberPeopleSortSelect();
    renderCyberPeopleGrid();
  });
}

