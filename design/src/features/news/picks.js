// «اخبار منتخب»: انتخاب هوش مصنوعی + سنجاق/حذف دستی مدیر (news_pick_edits، migration_044)
import { api } from '../../core/api.js';
import { currentRole } from '../../core/session.js';
import { escHtml, toFaDigits } from '../../core/text.js';
import { NEWS_AI_INSIGHTS } from './insights.js';
import { newsRelTime } from '../../core/date.js';
import { POSTS_CACHE, chName, HIDDEN_POST_IDS } from '../../data/store.js';
import { showToast } from '../../ui/toast.js';
import { uiConfirm } from '../../ui/confirm.js';

// ---- «اخبار منتخب» (هوش مصنوعی + ویرایش دستی مدیر — ۵.۲۶.۰، migration_044) ----
// فهرست = سنجاق‌شده‌ها (news_pick_edits.action='pin'، به ترتیب sort_order، با مشخصات
// ذخیره‌شده در pick — پس بعد از اجرای بعدی هوش مصنوعی هم می‌مونن) + انتخاب‌های هوش
// مصنوعی به ترتیب امتیاز، بدون «حذف از منتخب»ها و پست‌های پنهان؛ جمعاً تا ۱۰ (سنجاق‌ها همیشه).
export let NEWS_PICK_EDITS = [];
export let NEWS_PICK_EDITS_MISSING = false;
// true = خونده شد؛ خطای موقت (نه جدول نبودن) فهرست قبلی رو نگه می‌داره
export async function loadNewsPickEdits(){
  try{
    const r = await api('/news_pick_edits?select=*&order=sort_order.asc,id.asc');
    NEWS_PICK_EDITS_MISSING = r.status === 404 || r.status === 400;
    if(r.ok){ NEWS_PICK_EDITS = await r.json(); return true; }
    if(NEWS_PICK_EDITS_MISSING) NEWS_PICK_EDITS = [];
    return false;
  }catch(e){ return false; }
}
export const PICK_MAX = 10;
// سنجاق‌هایی که واقعاً در فهرست دیده می‌شن (پست پنهان‌شده یا بی‌مشخصات نه)
export const pickVisiblePin = x=>x.action === 'pin' && x.pick && !HIDDEN_POST_IDS.has(Number(x.post_id));
export function newsPickItems(){
  const pins = NEWS_PICK_EDITS.filter(pickVisiblePin);
  const skip = new Set(NEWS_PICK_EDITS.map(x=>Number(x.post_id)));
  const ai = (NEWS_AI_INSIGHTS?.selected_posts || [])
    .filter(sp => !HIDDEN_POST_IDS.has(Number(sp.id)) && !skip.has(Number(sp.id)))
    .map(sp => ({ sp, post: POSTS_CACHE.find(p=>p.id===sp.id) }))
    .filter(x => x.post || x.sp.channel_id);
  return [
    ...pins.map(x=>({ sp: x.pick, post: POSTS_CACHE.find(p=>p.id===Number(x.post_id)), edit: x })),
    ...ai.slice(0, Math.max(0, PICK_MAX - pins.length)),
  ];
}
export const PICK_IC = {
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>',
};
export function renderNewsPicks(){
  const selectedList = document.getElementById('news-analytics-selected-list');
  const selectedEmpty = document.getElementById('news-analytics-selected-empty');
  const selectedUpdatedEl = document.getElementById('news-selected-updated');
  selectedUpdatedEl.textContent = NEWS_AI_INSIGHTS ? ('به‌روزرسانی: ' + newsRelTime(NEWS_AI_INSIGHTS.computed_at)) : '';
  // از مهر ۱۴۰۵ هر مورد خودش channel_id/time/link/sources رو هم داره (news-insights
  // خبرها رو خوشه‌بندی می‌کنه و sources = تعداد واقعی منابع همون خبره) — پس
  // اگه پست در کش ۱۰۰۰تایی نبود هم نمایش داده می‌شه؛ ردیف‌های قدیمی (فقط id)
  // مثل قبل از روی POSTS_CACHE
  const aiSelected = newsPickItems();
  const isAdmin = currentRole === 'app_admin';
  const pinCount = aiSelected.filter(x=>x.edit).length;
  selectedList.innerHTML = '';
  selectedEmpty.style.display = aiSelected.length ? 'none' : '';
  aiSelected.forEach(({sp, post:p, edit}, i)=>{
    const text = sp.headline || (p && (p.title || (p.text||'').slice(0,140))) || '';
    const chId = p ? p.channel_id : sp.channel_id;
    const when = sp.time || (p && (p.posted_at||p.scraped_at));
    // برچسب‌های معیار انتخاب (کاربر، مهر ۱۴۰۵: کوتاه، نه جمله‌ی توضیحی): «پرتکرار»
    // از تعداد واقعی منابع (≥۵، همون آستانه‌ی موج خبری) + ۱–۲ برچسب تحلیلی هوش
    // مصنوعی از فهرست ثابت TAGS در news-insights. ردیف‌های کمی قدیمی‌تر فقط
    // criterion (یک برچسب) دارن
    const tags = [];
    if(sp.sources >= 5) tags.push('<span class="sel-tag is-wide">پرتکرار</span>');
    const aiTags = Array.isArray(sp.tags) ? sp.tags : (sp.criterion ? [sp.criterion] : []);
    aiTags.forEach(t=>tags.push(`<span class="sel-tag is-crit">${escHtml(t)}</span>`));
    const srcTxt = sp.sources > 1 ? ` و ${toFaDigits(sp.sources - 1)} منبع دیگر` : '';
    if(edit && isAdmin) tags.unshift('<span class="sel-tag is-pin">سنجاق‌شده</span>');
    const pid = Number(edit ? edit.post_id : sp.id);
    const ctl = !isAdmin ? '' : edit
      ? `<div class="pick-ctl"><button type="button" data-pick="up" data-id="${edit.id}" ${i === 0 ? 'disabled' : ''} title="بالاتر" aria-label="بالاتر">${PICK_IC.up}</button><button type="button" data-pick="down" data-id="${edit.id}" ${i === pinCount - 1 ? 'disabled' : ''} title="پایین‌تر" aria-label="پایین‌تر">${PICK_IC.down}</button><button type="button" data-pick="unpin" data-id="${edit.id}">${PICK_IC.x}برداشتن سنجاق</button></div>`
      : `<div class="pick-ctl"><button type="button" data-pick="pin" data-post="${pid}">${PICK_IC.pin}سنجاق</button><button type="button" data-pick="hide" data-post="${pid}">${PICK_IC.x}حذف از منتخب</button></div>`;
    const el = document.createElement('div'); el.className = 'rank-item' + (edit && isAdmin ? ' is-pinned' : '');
    el.innerHTML = `<span class="rank-num">${toFaDigits(i+1)}</span>
      <div class="rc">${tags.length ? `<div class="sel-tags">${tags.join('')}</div>` : ''}<p>${escHtml(text)}</p>
      <div class="rmeta"><span>${escHtml(chName(chId))}${srcTxt}${when ? '،' : ''}</span><span>${when ? newsRelTime(when) : ''}</span></div>${ctl}</div>`;
    selectedList.appendChild(el);
  });

  if(isAdmin && NEWS_PICK_EDITS_MISSING) selectedList.insertAdjacentHTML('beforeend', '<p class="pick-missing">برای ویرایش این فهرست، فایل <b>db/migration_044_news_pick_edits.sql</b> باید یک‌بار در SQL Editor سوپابیس اجرا شود.</p>');
}
// مشخصات لازم برای نمایش یه خبر منتخب — از خودِ پست (برای «افزودن به منتخب»)
export function pickFromPost(p){
  const head = (p.title || String(p.text || '').replace(/\s+/g, ' ')).trim().slice(0, 160);
  return { id: p.id, headline: head, sources: 1, posts: 1, channel_id: p.channel_id, time: p.posted_at || p.scraped_at, link: p.link || null, tags: [] };
}
export async function upsertPickEdit(body){
  const r = await api('/news_pick_edits?on_conflict=post_id', { method:'POST', headers:{ Prefer:'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body) });
  if(!r.ok) throw new Error('news_pick_edits ' + r.status);
}
export function pickNextOrder(){ return NEWS_PICK_EDITS.filter(x=>x.action === 'pin').reduce((m, x)=>Math.max(m, x.sort_order), 0) + 1; }
// بعد از هر تغییر منتخب، دکمه‌های «افزودن به منتخب» فید اخبار هم تازه بشن (news-feed.js؛
// با hook، چون فید خودش pickAddBtnHtml رو از این ماژول می‌گیره و import دوطرفه چرخه می‌شد)
let PICKS_CHANGED = ()=>{};
export function onPicksChanged(fn){ PICKS_CHANGED = fn; }
export async function pickAfterChange(msg){
  const fresh = await loadNewsPickEdits();
  renderNewsPicks();
  try{ PICKS_CHANGED(); }catch(e){}
  if(!fresh) showToast((msg ? msg + ' ' : '') + 'فهرست تازه دریافت نشد؛ برای دیدن نتیجه صفحه را دوباره بارگذاری کنید.');
  else if(msg) showToast(msg);
}
export function pickFailMsg(){ return NEWS_PICK_EDITS_MISSING ? 'انجام نشد؛ اول migration_044 را در SQL Editor سوپابیس اجرا کنید.' : 'انجام نشد؛ اتصال اینترنت را بررسی و دوباره تلاش کنید.'; }
// «افزودن به منتخب» از روی کارت خبر (فقط مدیر)
export function pickAddBtnHtml(p){
  if(currentRole !== 'app_admin') return '';
  const on = NEWS_PICK_EDITS.some(x=>Number(x.post_id) === Number(p.id) && x.action === 'pin');
  return `<button type="button" class="post-hide-btn pick-add-btn" ${on ? 'disabled' : ''} data-pick-add="${Number(p.id)}" title="این خبر بالای «اخبار منتخب» در تب «در یک نگاه» سنجاق می‌شود">${PICK_IC.pin}${on ? 'در اخبار منتخب' : 'افزودن به منتخب'}</button>`;
}
export async function addPostToPicks(id){
  const p = POSTS_CACHE.find(x=>x.id === id);
  if(!p){ showToast('این خبر پیدا نشد؛ صفحه را دوباره بارگذاری کنید.'); return; }
  try{
    const sp = pickFromPost(p);
    await upsertPickEdit({ post_id: id, action:'pin', title: sp.headline, pick: sp, sort_order: pickNextOrder() });
    await pickAfterChange('به «اخبار منتخب» اضافه شد (بالای فهرست، در تب «در یک نگاه»).');
  }catch(e){ console.error(e); showToast(pickFailMsg()); }
}
export function setupNewsPicks(){
  // «افزودن به منتخب» روی کارت‌های فید اخبار
  document.getElementById('news-feed').addEventListener('click', e=>{
    const b = e.target.closest('[data-pick-add]');
    if(b && !b.disabled) addPostToPicks(Number(b.dataset.pickAdd));
  });
  document.getElementById('news-analytics-selected-list').addEventListener('click', async e=>{
    const b = e.target.closest('[data-pick]'); if(!b || currentRole !== 'app_admin') return;
    const act = b.dataset.pick;
    b.disabled = true;
    try{
      if(act === 'pin' || act === 'hide'){
        const sp = (NEWS_AI_INSIGHTS?.selected_posts || []).find(x=>Number(x.id) === Number(b.dataset.post));
        if(!sp) return;
        if(act === 'hide' && !await uiConfirm('حذف این خبر از «اخبار منتخب»\nخودِ پست در سایت می‌ماند؛ فقط از این فهرست برداشته می‌شود.')){ b.disabled = false; return; }
        await upsertPickEdit(act === 'pin'
          ? { post_id: Number(sp.id), action:'pin', title: sp.headline || null, pick: sp, sort_order: pickNextOrder() }
          : { post_id: Number(sp.id), action:'hide', title: sp.headline || null, pick: null, sort_order: 0 });
        await pickAfterChange(act === 'pin' ? 'سنجاق شد؛ در اجراهای بعدی هوش مصنوعی هم بالای فهرست می‌ماند.' : 'از «اخبار منتخب» برداشته شد.');
      }else if(act === 'unpin'){
        const r = await api('/news_pick_edits?id=eq.' + Number(b.dataset.id), { method:'DELETE' });
        if(!r.ok) throw new Error('unpin ' + r.status);
        await pickAfterChange('سنجاق برداشته شد.');
      }else if(act === 'up' || act === 'down'){
        // فقط سنجاق‌های دیده‌شده جابه‌جا می‌شن (هم‌سو با newsPickItems)؛ بقیه ته ترتیب
        const pins = NEWS_PICK_EDITS.filter(pickVisiblePin);
        const rest = NEWS_PICK_EDITS.filter(x=>x.action === 'pin' && !pickVisiblePin(x));
        const i = pins.findIndex(x=>x.id === Number(b.dataset.id)), j = act === 'up' ? i - 1 : i + 1;
        if(i < 0 || j < 0 || j >= pins.length) return;
        // ترتیب از نو شماره‌گذاری می‌شه (sort_orderهای برابر هم درست جابه‌جا بشن)
        [pins[i], pins[j]] = [pins[j], pins[i]];
        const res = await Promise.all([...pins, ...rest].map((x, k)=>x.sort_order === k + 1 ? { ok:true } : api('/news_pick_edits?id=eq.' + x.id, { method:'PATCH', body: JSON.stringify({ sort_order: k + 1 }) })));
        if(res.some(r=>!r.ok)) throw new Error('reorder');
        await pickAfterChange('');
      }
    }catch(err){
      console.error(err);
      showToast(pickFailMsg());
      b.disabled = false;
    }
  });
}

