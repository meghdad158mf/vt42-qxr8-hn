// تب «پرونده‌های موضوعی» (نمای بیننده): موضوعات موقت و پست‌های منتسب به هر موضوع؛ مدیریت موضوعات در تنظیمات (app.js)
import { api } from '../../core/api.js';
import { claimsTextDisplay, escAttr, escHtml, safeUrl } from '../../core/text.js';
import { ICONS } from '../../ui/icons.js';
import { NEWS_PLATFORM_ICON, NEWS_PLATFORM_LABEL } from '../../ui/platforms.js';
import { newsRelTime, tehranDayDiff } from '../../core/date.js';
import { POSTS_CACHE, chById, regionNameOf } from '../../data/store.js';
import { wireMediaViewerClicks } from '../../ui/media-viewer.js';

export let DOSSIER_TOPICS = []; // {id, name, keywords, active, sort_order} — موضوعات موقت «پرونده‌های موضوعی»
export let DOSSIER_TOPIC_POSTS = []; // {id, topic_id, post_id, source, excluded} — پست‌های منتسب به هر موضوع
export async function loadDossierTopics(){
  const r = await api('/dossier_topics?select=*&order=sort_order.asc');
  DOSSIER_TOPICS = r.ok ? await r.json() : [];
}
export async function loadDossierTopicPosts(){
  const r = await api('/dossier_topic_posts?select=*&order=created_at.desc&limit=2000');
  DOSSIER_TOPIC_POSTS = r.ok ? await r.json() : [];
}
// ---- تب «پرونده‌های موضوعی» — اخبار مرتبط با موضوعات موقت/چرخشی، دسته‌بندی‌شده
// بر اساس dossier_topic_posts (فقط موضوعات active، فقط excluded=false) ----
// فیلتر «بازه‌ی زمانی» از نیمه‌شب تقویمی تهران حساب می‌شه (tehranDayDiff،
// کنار iranTodayStartMs) — نه فاصله‌ی خام از همین لحظه. طبق نظر کاربر،
// چیدمان سایدباریه: موضوعات ستون راست زیر هم، فقط یکی در هر لحظه
// انتخاب/نمایش داده می‌شه (نه accordion چندبازِ قبلی)
export let dossierState = { time: 'all', topicId: null };
export function renderDossierTab(){
  const sidebar = document.getElementById('dossier-sidebar');
  const wrap = document.getElementById('dossier-groups');
  const empty = document.getElementById('dossier-empty');
  if(!wrap || !sidebar) return;
  const groups = DOSSIER_TOPICS.filter(t=>t.active).map(t=>{
    const postIds = DOSSIER_TOPIC_POSTS.filter(dp=>dp.topic_id===t.id && !dp.excluded).map(dp=>dp.post_id);
    let posts = postIds.map(id=>POSTS_CACHE.find(p=>p.id===id)).filter(Boolean);
    if(dossierState.time !== 'all'){
      posts = posts.filter(p=>{
        const diffDays = tehranDayDiff(p.posted_at || p.scraped_at);
        if(dossierState.time === 'today') return diffDays === 0;
        if(dossierState.time === 'yesterday') return diffDays === 1;
        if(dossierState.time === 'week') return diffDays >= 0 && diffDays <= 6;
        return true;
      });
    }
    posts.sort((a,b)=> new Date(b.posted_at||b.scraped_at) - new Date(a.posted_at||a.scraped_at));
    return { topic: t, posts };
  }).filter(g=>g.posts.length);

  empty.style.display = groups.length ? 'none' : 'block';
  if(!groups.length){ sidebar.innerHTML=''; wrap.innerHTML=''; return; }

  // اگه موضوع انتخاب‌شده دیگه بین موضوعات دارای خبر نیست (غیرفعال شده یا
  // با فیلتر زمانی خالی شده)، طبق نظر کاربر آخرین موضوع (پایین‌ترین ردیف
  // سایدبار) پیش‌فرض انتخاب می‌شه
  if(!groups.some(g=>g.topic.id===dossierState.topicId)){
    dossierState.topicId = groups[groups.length-1].topic.id;
  }

  sidebar.innerHTML = groups.map(g=>`
    <button type="button" class="dossier-nav-item${g.topic.id===dossierState.topicId?' active':''}" data-topic="${g.topic.id}">${escAttr(g.topic.name)}</button>
  `).join('');

  const active = groups.find(g=>g.topic.id===dossierState.topicId);
  wrap.innerHTML = `<div class="news-feed grid-view dossier-feed">${active.posts.map(p=>dossierPostCardHtml(p, active.topic.id)).join('')}</div>`;
  wireMediaViewerClicks(wrap);
  updateDossierMoreButtons(wrap);
  if(document.fonts && document.fonts.status !== 'loaded'){
    document.fonts.ready.then(()=> updateDossierMoreButtons(wrap));
  }
}
// کارت خبر «پرونده‌های موضوعی» — با دکمه‌ی «نمایش بیشتر» مثل فید اصلی، ولی چون
// این پنل هم‌زمان با فیدهای دیگه توی DOM می‌مونه (فقط display:none
// می‌شه) و چون یه پست می‌تونه هم‌زمان زیر چند موضوع مختلف هم ظاهر بشه،
// idهای تعاملی (متن/دکمه) با ترکیب topicId-postId ساخته می‌شن، نه فقط
// postId خام — تا با id پست توی فید اصلی یا موضوع دیگه تداخل نکنه
export function dossierPostCardHtml(p, topicId){
  const ch = chById(p.channel_id) || {};
  const isRealVideo = p.media_type === 'video' && p.media_path && /\.mp4($|\?)/i.test(p.media_path);
  const hasThumb = !!p.media_path && (p.media_type === 'photo' || (p.media_type === 'video' && !isRealVideo));
  const thumbHtml = hasThumb
    ? `<div class="news-thumb"><img src="${escAttr(p.media_path)}" alt="" loading="lazy" data-viewer-kind="image" data-viewer-src="${escAttr(p.media_path)}"${p.media_type==='video' && p.link ? ` data-viewer-link="${escAttr(p.link)}"` : ''} /></div>`
    : ch.avatar_url
      ? `<div class="news-thumb"><img src="${escAttr(ch.avatar_url)}" alt="" loading="lazy" /></div>`
      : `<div class="news-thumb placeholder">${ICONS.doc}</div>`;
  const uid = topicId + '-' + p.id;
  return `
  <div class="news-card">
    ${thumbHtml}
    <div class="news-body">
      <div class="news-head">
        <span class="news-source">${escAttr(ch.title||ch.username||'؟')}</span>
        <span class="news-platform">${NEWS_PLATFORM_ICON[ch.platform]||''}${NEWS_PLATFORM_LABEL[ch.platform]||ch.platform}</span>
        ${ch.region_id ? `<span class="news-region">${escHtml(regionNameOf(ch.region_id))}</span>` : ''}
        <span class="news-time">${newsRelTime(p.posted_at||p.scraped_at)}</span>
      </div>
      ${p.title ? `<h3 class="news-title">${escHtml(p.title)}</h3>` : ''}
      <p class="news-text" id="dossier-text-${uid}">${claimsTextDisplay(p.text)}</p>
      <button class="news-more" data-dossier-more="${uid}" id="dossier-more-${uid}">
        نمایش بیشتر
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="news-foot">
        <div></div>
        <div>${(!isRealVideo && p.link) ? `<a class="news-link" href="${safeUrl(p.link)}" target="_blank" rel="noopener">مشاهده‌ی منبع ↗</a>` : ''}${isRealVideo ? `<a class="news-link" href="${safeUrl(p.media_path)}" target="_blank" rel="noopener" download>دانلود فیلم ↓</a>` : ''}</div>
      </div>
    </div>
  </div>`;
}
export function toggleDossierText(uid){
  const t = document.getElementById('dossier-text-'+uid);
  const b = document.getElementById('dossier-more-'+uid);
  if(!t || !b) return;
  const isOpen = t.classList.toggle('expanded');
  b.classList.toggle('open', isOpen);
  b.firstChild.textContent = isOpen ? 'بستن ' : 'نمایش بیشتر ';
}
// چون <details> بسته محتواش رو layout نمی‌کنه، scrollHeight/clientHeight
// موقع بسته بودن قابل‌اعتماد نیست — این تابع فقط روی یه گروه/بخش مشخص
// (که همون لحظه بازه) صدا زده می‌شه، نه کل wrap
export function updateDossierMoreButtons(scopeEl){
  if(!scopeEl) return;
  scopeEl.querySelectorAll('.news-text[id^="dossier-text-"]').forEach(textEl=>{
    const uid = textEl.id.slice('dossier-text-'.length);
    const moreBtn = document.getElementById('dossier-more-'+uid);
    if(!moreBtn) return;
    const overflowing = textEl.scrollHeight > textEl.clientHeight + 1;
    moreBtn.style.display = overflowing ? '' : 'none';
  });
}
export function setupDossierTab(){
  document.getElementById('dossier-groups').addEventListener('click', e=>{
    const b = e.target.closest('[data-dossier-more]');
    if(b) toggleDossierText(b.dataset.dossierMore);
  });
  // ---- فیلتر و سایدبار تب «پرونده‌های موضوعی» ----
  document.getElementById('dossier-time-seg').addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b || !b.dataset.t) return;
    document.querySelectorAll('#dossier-time-seg > button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    dossierState.time = b.dataset.t;
    renderDossierTab();
  });
  document.getElementById('dossier-sidebar').addEventListener('click', e=>{
    const btn = e.target.closest('.dossier-nav-item'); if(!btn) return;
    dossierState.topicId = Number(btn.dataset.topic);
    renderDossierTab();
  });
}

