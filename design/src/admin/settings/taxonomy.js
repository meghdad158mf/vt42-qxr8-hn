// «تنظیمات بخش‌ها»: موضوع منابع (categories)، مناطق (regions) و میان‌برهای جست‌وجوی وب‌سایت‌ها (news_topics)؛ تغییر نام درجا
import { api } from '../../core/api.js';
import { CATEGORIES, CHANNELS, REGIONS } from '../../data/store.js';
import { escAttr, toFaDigits } from '../../core/text.js';
import { makeRenamable, patchOk } from './inline-rename.js';
import { NEWS_TOPICS, loadNewsTopics, renderNewsFeed, renderNewsRegionChips, renderNewsTopicRow } from '../../features/news/news-feed.js';
import { populateExportFilters } from '../export.js';
import { populatePostFilters } from '../../features/cyberspace/posts-feed.js';
import { refreshChanList } from './chan-list-hook.js';
import { renderChannelCards, renderCyberPeopleGrid } from '../../features/cyberspace/cyber-people.js';
import { showToast } from '../../ui/toast.js';
import { uiConfirm } from '../../ui/confirm.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { loadCategories, loadChannels, loadRegions } from '../../app.js';

// ---- settings: categories & channels (real CRUD against Postgres) ----
export const catGridEl = document.getElementById('cat-grid');
export const regionGridEl = document.getElementById('region-grid');
export const topicGridEl = document.getElementById('topic-grid');
// گزینه‌های «موضوع»/«منطقه» حالا فقط توی پنجره‌ی ویرایش منبع هستن و موقع
// باز شدنش پر می‌شن — این دو تابع برای سازگاری با صداکننده‌های قدیمی موندن
export function refreshCatOptions(){}
export function refreshRegionOptions(){}
export function renderRegionGrid(){
  regionGridEl.innerHTML = '';
  REGIONS.forEach(r=>{
    const count = CHANNELS.filter(ch=>ch.region_id===r.id).length;
    const el=document.createElement('div'); el.className='cat-card';
    el.innerHTML = `<span class="name">${escAttr(r.name)}</span><span class="cc-actions"><span class="count mono" title="تعداد منابع">${toFaDigits(count)} منبع</span></span>`;
    makeRenamable(el.querySelector('.name'), r.name, async val=>{
      await patchOk('/regions?id=eq.'+r.id, {name: val});
      await loadRegions(); renderRegionGrid(); renderNewsRegionChips(); renderNewsFeed();
    });
    const del=document.createElement('button'); del.className='del-btn'; del.textContent='✕'; del.title='حذف منطقه'; del.setAttribute('aria-label','حذف منطقه‌ی '+r.name);
    del.addEventListener('click', async ()=>{
      if(!await uiConfirm('منطقه‌ی «' + r.name + '» حذف شود؟' + (count ? '\n' + count + ' منبع بدون منطقه می‌شوند.' : ''))) return;
      await api('/regions?id=eq.'+r.id, {method:'DELETE'});
      await loadRegions(); await loadChannels();
      refreshRegionOptions(); renderRegionGrid(); renderNewsRegionChips(); refreshChanList(); renderNewsFeed();
    });
    el.querySelector('.cc-actions').appendChild(del);
    regionGridEl.appendChild(el);
  });
}
export function renderCatGrid(){
  catGridEl.innerHTML = '';
  CATEGORIES.forEach(c=>{
    const count = CHANNELS.filter(ch=>ch.category_id===c.id).length;
    const el=document.createElement('div'); el.className='cat-card';
    el.innerHTML = `<span class="name">${escAttr(c.name)}</span><span class="cc-actions"><span class="count mono" title="تعداد منابع">${toFaDigits(count)} منبع</span></span>`;
    makeRenamable(el.querySelector('.name'), c.name, async val=>{
      await patchOk('/categories?id=eq.'+c.id, {name: val});
      await loadCategories(); renderCatGrid(); refreshChanList(); renderCyberPeopleGrid(); populatePostFilters(); populateExportFilters();
    });
    const del=document.createElement('button'); del.className='del-btn'; del.textContent='✕'; del.title='حذف موضوع'; del.setAttribute('aria-label','حذف موضوع '+c.name);
    del.addEventListener('click', async ()=>{
      if(!await uiConfirm('موضوع «' + c.name + '» حذف شود؟' + (count ? '\n' + count + ' منبع بدون موضوع می‌شوند.' : ''))) return;
      await api('/categories?id=eq.'+c.id, {method:'DELETE'});
      await loadCategories(); await loadChannels();
      refreshCatOptions(); renderCatGrid(); refreshChanList(); renderChannelCards(); renderCyberPeopleGrid(); populatePostFilters(); populateExportFilters();
    });
    el.querySelector('.cc-actions').appendChild(del);
    catGridEl.appendChild(el);
  });
}
export function renderTopicGrid(){
  topicGridEl.innerHTML = '';
  NEWS_TOPICS.forEach(t=>{
    const el=document.createElement('div'); el.className='cat-card';
    el.innerHTML = `<span class="name"><b>${escAttr(t.name)}</b><div style="font-size:11px;font-weight:500;color:var(--text-faint);margin-top:2px;">${escAttr(t.keywords)}</div></span><span class="cc-actions"></span>`;
    const del=document.createElement('button'); del.className='del-btn'; del.textContent='✕'; del.title='حذف موضوع'; del.setAttribute('aria-label','حذف موضوع‌ی '+t.name);
    del.addEventListener('click', async ()=>{
      if(!await uiConfirm('موضوع «' + t.name + '» حذف شود؟')) return;
      await api('/news_topics?id=eq.'+t.id, {method:'DELETE'});
      await loadNewsTopics();
      renderTopicGrid(); renderNewsTopicRow();
    });
    el.querySelector('.cc-actions').appendChild(del);
    topicGridEl.appendChild(el);
  });
}
export function setupTaxonomyAdmin(){
  document.getElementById('add-cat-btn').addEventListener('click', async ()=>{
    const el = document.getElementById('new-cat-name');
    const v = el.value.trim();
    if(!v) return;
    const r = await api('/categories', {method:'POST', headers:{Prefer:'return=minimal'}, body: JSON.stringify({name:v})});
    if(r.ok){ el.value=''; await loadCategories(); refreshCatOptions(); renderCatGrid(); refreshChanList(); }
    else showToast('این دسته‌بندی از قبل وجود دارد یا خطایی رخ داد.');
  });
  document.getElementById('add-region-btn').addEventListener('click', async ()=>{
    const el = document.getElementById('new-region-name');
    const v = el.value.trim();
    if(!v) return;
    const r = await api('/regions', {method:'POST', headers:{Prefer:'return=minimal'}, body: JSON.stringify({name:v})});
    if(r.ok){ el.value=''; await loadRegions(); refreshRegionOptions(); renderRegionGrid(); renderNewsRegionChips(); refreshChanList(); }
    else showToast('این منطقه از قبل وجود دارد یا خطایی رخ داد.');
  });
  document.getElementById('add-topic-btn').addEventListener('click', async ()=>{
    const nameEl = document.getElementById('new-topic-name');
    const kwEl = document.getElementById('new-topic-keywords');
    const name = nameEl.value.trim();
    const keywords = kwEl.value.trim();
    if(!name || !keywords) return;
    const r = await api('/news_topics', {method:'POST', headers:{Prefer:'return=minimal'}, body: JSON.stringify({name, keywords, sort_order: NEWS_TOPICS.length})});
    if(r.ok){
      nameEl.value=''; kwEl.value='';
      await loadNewsTopics();
      renderTopicGrid(); renderNewsTopicRow();
    }else{
      showToast('انجام نشد؛ اتصال را بررسی کنید و دوباره امتحان کنید.');
    }
  });
}

