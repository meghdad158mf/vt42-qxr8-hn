// «تنظیمات بخش‌ها ← پرونده‌های موضوعی»: موضوعات، کلیدواژه‌ها، تطبیق خودکار و افزودن/پنهان کردن دستی پست
import { api } from '../../core/api.js';
import { DOSSIER_TOPICS, DOSSIER_TOPIC_POSTS, loadDossierTopicPosts, loadDossierTopics } from '../../features/news/dossier.js';
import { escAttr, toFaDigits } from '../../core/text.js';
import { POSTS_CACHE } from '../../data/store.js';
import { showToast } from '../../ui/toast.js';
import { uiConfirm } from '../../ui/confirm.js';

// تطبیق متنی ساده‌ی کلیدواژه‌ها (همون منطق دوطرفه‌ی Edge Function
// extract-post-keywords) — برای بررسی اولیه‌ی خودکار موضوع تازه‌ساخته‌شده
// روی backlog پست‌های موجود، و برای دکمه‌ی «جست‌وجوی خودکار» دستی
export function keywordListsMatch(topicKeywords, postKeywords){
  return topicKeywords.some(tk => postKeywords.some(pk => pk.includes(tk) || tk.includes(pk)));
}
// چرا این تابع لازمه، جدا از تطبیق خودکار داخل Edge Function: اون فقط
// همون دسته‌ی تازه‌پردازش‌شده‌ی هر اجرای extract-post-keywords رو با
// موضوعات فعال تطبیق می‌ده — یه موضوع تازه‌ساخته‌شده هیچ‌وقت روی
// backlog پست‌هایی که از قبل کلیدواژه گرفتن (posted_at قدیمی‌تر از
// آخرین batch) بررسی نمی‌شه. این تابع همون تطبیق رو مستقیم از فرانت‌اند
// (با توکن مدیر) روی همه‌ی پست‌های ai_keywords-دار موجود اجرا می‌کنه.
export async function autoMatchDossierTopic(topicId, opts){
  opts = opts || {};
  const topic = DOSSIER_TOPICS.find(t=>t.id===topicId);
  if(!topic) return 0;
  const topicKeywords = (topic.keywords||'').split(',').map(k=>k.trim()).filter(Boolean);
  if(!topicKeywords.length) return 0;
  const r = await api('/posts?select=id,ai_keywords&ai_keywords=not.is.null&order=posted_at.desc&limit=3000');
  const posts = r.ok ? await r.json() : [];
  const already = new Set(DOSSIER_TOPIC_POSTS.filter(dp=>dp.topic_id===topicId).map(dp=>dp.post_id));
  const inserts = [];
  for(const p of posts){
    if(already.has(p.id)) continue;
    const postKeywords = Array.isArray(p.ai_keywords) ? p.ai_keywords : [];
    if(postKeywords.length && keywordListsMatch(topicKeywords, postKeywords)) inserts.push({topic_id: topicId, post_id: p.id, source:'auto'});
  }
  if(inserts.length){
    // on_conflict + ignore-duplicates: اگه مدیر قبلاً یه match رو دستی
    // حذف/پنهان کرده بود، این اجرای دوباره نباید دوباره‌ش اضافه کنه —
    // چون همون ردیف (topic_id,post_id) از قبل هست، insert نادیده گرفته می‌شه
    await api('/dossier_topic_posts?on_conflict=topic_id,post_id', {method:'POST', headers:{Prefer:'resolution=ignore-duplicates,return=minimal'}, body: JSON.stringify(inserts)});
    await loadDossierTopicPosts();
    renderDossierTopicAdminList();
  }
  if(!opts.silent) showToast(inserts.length ? (toFaDigits(inserts.length) + ' خبر با کلیدواژه‌های این موضوع پیدا و اضافه شد.') : 'با کلیدواژه‌های فعلی این موضوع، خبر جدیدی در پست‌های موجود پیدا نشد.');
  return inserts.length;
}
// ویرایش کلیدواژه‌های یه موضوع «پرونده‌های موضوعی» — جایگزینی درجا (inline) شبیه
// الگوی editPostKeywords/savePostKeywords، بدون مودال جدا
export function editDossierTopicKeywords(id){
  const t = DOSSIER_TOPICS.find(x=>x.id===id);
  const kwEl = document.getElementById('dossier-topic-kw-'+id);
  if(!t || !kwEl) return;
  kwEl.innerHTML = `
    <input type="text" id="dossier-topic-kw-input-${id}" value="${escAttr(t.keywords)}" placeholder="کلیدواژه‌ها، جدا با ویرگول" style="width:100%;font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--border-strong);background:var(--surface-2);color:var(--text);font-family:inherit;box-sizing:border-box;" />
    <div style="display:flex;gap:6px;margin-top:6px;">
      <button type="button" class="btn btn-sm" data-dt-act="save-kw" data-id="${id}">ذخیره</button>
      <button type="button" class="btn btn-sm" data-dt-act="cancel-kw">انصراف</button>
    </div>`;
  document.getElementById('dossier-topic-kw-input-'+id).focus();
}
// بعد از ذخیره، همون بررسی «جست‌وجوی خودکار» رو هم خودکار روی
// کلیدواژه‌های تازه اجرا می‌کنه — چون کلیدواژه عوض شده، ممکنه خبرهای
// تازه‌ای توی backlog match بشن که با کلیدواژه‌ی قبلی نمی‌شدن. match
// قبلی که با کلیدواژه‌ی جدید دیگه ربطی نداره خودکار حذف نمی‌شه — مدیر
// باید خودش دستی «پنهان»/حذفش کنه (تا هیچ رکوردی بی‌سروصدا از دست نره)
export async function saveDossierTopicKeywords(id){
  const inputEl = document.getElementById('dossier-topic-kw-input-'+id);
  if(!inputEl) return;
  const keywords = inputEl.value.trim();
  if(!keywords) return;
  const r = await api('/dossier_topics?id=eq.'+id, {method:'PATCH', headers:{Prefer:'return=minimal'}, body: JSON.stringify({keywords})});
  if(!r.ok){ showToast('انجام نشد؛ اتصال را بررسی کنید و دوباره امتحان کنید.'); return; }
  await loadDossierTopics();
  renderDossierTopicAdminList();
  const count = await autoMatchDossierTopic(id, {silent:true});
  showToast(count ? ('کلیدواژه‌ها ذخیره شد. ' + toFaDigits(count) + ' خبر تازه با کلیدواژه‌های جدید پیدا و اضافه شد.') : 'کلیدواژه‌ها ذخیره شد. با کلیدواژه‌های تازه، خبر جدیدی در پست‌های موجود پیدا نشد.');
}
export function renderDossierTopicAdminList(){
  const wrap = document.getElementById('dossier-topic-admin-list');
  if(!wrap) return;
  wrap.innerHTML = DOSSIER_TOPICS.map(t=>dossierTopicAdminCardHtml(t)).join('');
}
export function dossierTopicAdminCardHtml(t){
  const posts = DOSSIER_TOPIC_POSTS.filter(dp=>dp.topic_id===t.id);
  const postsHtml = posts.length ? posts.map(dp=>{
    const p = POSTS_CACHE.find(x=>x.id===dp.post_id);
    const label = p ? (p.title || (p.text||'').slice(0,60) || ('پست #'+p.id)) : ('پست #'+dp.post_id+' (حذف‌شده)');
    return `
    <div class="dossier-topic-post-row${dp.excluded?' excluded':''}">
      <span class="txt">${escAttr(label)}</span>
      <span style="display:flex;gap:8px;flex-shrink:0;">
        <button class="btn btn-sm" data-dt-act="exclude" data-id="${dp.id}">${dp.excluded?'نمایش':'پنهان'}</button>
        <button class="del-btn" style="min-width:24px;min-height:24px;font-size:11px;" title="حذف کامل" data-dt-act="del-post" data-id="${dp.id}">✕</button>
      </span>
    </div>`;
  }).join('') : '<p class="dossier-topic-empty">هنوز خبری برای این موضوع ثبت نشده.</p>';

  return `
  <div class="dossier-topic-card${t.active?'':' inactive'}">
    <div class="dossier-topic-card-head">
      <span class="name"><b>${escAttr(t.name)}</b><div class="kw" id="dossier-topic-kw-${t.id}">${escAttr(t.keywords)}</div></span>
      <span class="dossier-topic-card-actions">
        <button class="btn btn-sm" data-dt-act="edit-kw" data-id="${t.id}">ویرایش کلیدواژه</button>
        <button class="btn btn-sm" title="پست‌های موجود دوباره با کلیدواژه‌های این موضوع تطبیق داده شوند" data-dt-act="auto" data-id="${t.id}">جست‌وجوی خودکار</button>
        <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;">
          <input type="checkbox" ${t.active?'checked':''} data-dt-active="${t.id}" />
          فعال
        </label>
        <button class="del-btn" title="حذف موضوع" data-dt-act="del-topic" data-id="${t.id}">✕</button>
      </span>
    </div>
    <div class="dossier-topic-posts">${postsHtml}</div>
    <div class="dossier-manual-add">
      <input type="text" placeholder="جست‌وجوی دستی پست برای افزودن به این موضوع…" data-dt-search="${t.id}" />
      <div class="dossier-manual-results" id="dossier-manual-results-${t.id}"></div>
    </div>
  </div>`;
}
export async function toggleDossierTopicActive(id, active){
  await api('/dossier_topics?id=eq.'+id, {method:'PATCH', headers:{Prefer:'return=minimal'}, body: JSON.stringify({active})});
  await loadDossierTopics();
  renderDossierTopicAdminList();
}
export async function deleteDossierTopic(id){
  const t = DOSSIER_TOPICS.find(x=>x.id===id);
  if(!await uiConfirm('موضوع «' + (t?t.name:'') + '» حذف شود؟ (پست‌های منتسب به این موضوع هم حذف می‌شوند)')) return;
  await api('/dossier_topics?id=eq.'+id, {method:'DELETE'});
  await loadDossierTopics();
  await loadDossierTopicPosts();
  renderDossierTopicAdminList();
}
export async function toggleDossierTopicPostExcluded(id){
  const dp = DOSSIER_TOPIC_POSTS.find(x=>x.id===id);
  if(!dp) return;
  await api('/dossier_topic_posts?id=eq.'+id, {method:'PATCH', headers:{Prefer:'return=minimal'}, body: JSON.stringify({excluded: !dp.excluded})});
  await loadDossierTopicPosts();
  renderDossierTopicAdminList();
}
export async function deleteDossierTopicPost(id){
  await api('/dossier_topic_posts?id=eq.'+id, {method:'DELETE'});
  await loadDossierTopicPosts();
  renderDossierTopicAdminList();
}
export function searchDossierManualAdd(topicId, query){
  const resultsEl = document.getElementById('dossier-manual-results-'+topicId);
  if(!resultsEl) return;
  query = (query||'').trim();
  if(query.length < 2){ resultsEl.innerHTML=''; return; }
  const already = new Set(DOSSIER_TOPIC_POSTS.filter(dp=>dp.topic_id===topicId).map(dp=>dp.post_id));
  const matches = POSTS_CACHE.filter(p=> !already.has(p.id) && ((p.title||'').includes(query) || (p.text||'').includes(query))).slice(0,8);
  resultsEl.innerHTML = matches.length ? matches.map(p=>{
    const label = p.title || (p.text||'').slice(0,60) || ('پست #'+p.id);
    return `<div class="dossier-manual-result-row"><span class="txt">${escAttr(label)}</span><button class="btn btn-sm" data-dt-act="add-post" data-id="${topicId}" data-post="${p.id}">افزودن</button></div>`;
  }).join('') : '<p class="dossier-topic-empty">موردی پیدا نشد.</p>';
}
export async function addDossierManualPost(topicId, postId){
  const r = await api('/dossier_topic_posts', {method:'POST', headers:{Prefer:'return=minimal'}, body: JSON.stringify({topic_id: topicId, post_id: postId, source:'manual', excluded:false})});
  if(!r.ok){ showToast('این پست از قبل در این موضوع ثبت شده یا ذخیره انجام نشد.'); return; }
  await loadDossierTopicPosts();
  renderDossierTopicAdminList();
}
export function setupDossierAdmin(){
  const list = document.getElementById('dossier-topic-admin-list');
  list.addEventListener('click', e=>{
    const b = e.target.closest('[data-dt-act]'); if(!b) return;
    const id = Number(b.dataset.id);
    switch(b.dataset.dtAct){
      case 'save-kw': saveDossierTopicKeywords(id); break;
      case 'cancel-kw': renderDossierTopicAdminList(); break;
      case 'exclude': toggleDossierTopicPostExcluded(id); break;
      case 'del-post': deleteDossierTopicPost(id); break;
      case 'edit-kw': editDossierTopicKeywords(id); break;
      case 'auto': autoMatchDossierTopic(id); break;
      case 'del-topic': deleteDossierTopic(id); break;
      case 'add-post': addDossierManualPost(id, Number(b.dataset.post)); break;
    }
  });
  list.addEventListener('change', e=>{
    const c = e.target.closest('[data-dt-active]'); if(c) toggleDossierTopicActive(Number(c.dataset.dtActive), c.checked);
  });
  list.addEventListener('input', e=>{
    const i = e.target.closest('[data-dt-search]'); if(i) searchDossierManualAdd(Number(i.dataset.dtSearch), i.value);
  });
  // ---- پنل مدیریت موضوعات «پرونده‌های موضوعی» ----
  document.getElementById('add-dossier-topic-btn').addEventListener('click', async ()=>{
    const nameEl = document.getElementById('new-dossier-topic-name');
    const kwEl = document.getElementById('new-dossier-topic-keywords');
    const name = nameEl.value.trim();
    const keywords = kwEl.value.trim();
    if(!name || !keywords) return;
    // return=representation نه minimal: بلافاصله بعد از ساخت موضوع، به id تازه
    // نیاز داریم تا بررسی اولیه‌ی خودکار (autoMatchDossierTopic) رو روی همون
    // موضوع اجرا کنیم — بدون این، باید یه round-trip جدا برای پیداکردن id بزنیم
    const r = await api('/dossier_topics', {method:'POST', headers:{Prefer:'return=representation'}, body: JSON.stringify({name, keywords, active:true, sort_order: DOSSIER_TOPICS.length})});
    if(r.ok){
      const rows = await r.json();
      const created = Array.isArray(rows) ? rows[0] : null;
      nameEl.value=''; kwEl.value='';
      await loadDossierTopics();
      renderDossierTopicAdminList();
      if(created){
        const count = await autoMatchDossierTopic(created.id, {silent:true});
        showToast(count ? ('موضوع اضافه شد. ' + toFaDigits(count) + ' خبر مرتبط از پست‌های موجود پیدا و اضافه شد.') : 'موضوع اضافه شد. فعلاً خبری با این کلیدواژه‌ها در پست‌های موجود پیدا نشد — با ورود خبر تازه یا با دکمه‌ی «جست‌وجوی خودکار» دوباره بررسی می‌شود.');
      }
    }else{
      showToast('انجام نشد؛ اتصال را بررسی کنید و دوباره امتحان کنید.');
    }
  });
}

