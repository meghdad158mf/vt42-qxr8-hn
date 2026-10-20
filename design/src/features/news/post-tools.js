// ابزار کارت خبرها: ترجمه به فارسی (Edge Function translate) و کلیدواژه‌های هوش مصنوعی (ویرایش مدیر)
import { api } from '../../core/api.js';
import { authToken } from '../../core/session.js';
import { claimsTextDisplay, escAttr, escHtml } from '../../core/text.js';
import { POSTS_CACHE } from '../../data/store.js';
import { renderNewsFeed, updateNewsMoreButtons } from './news-feed.js';
import { showToast } from '../../ui/toast.js';
import { SUPABASE_URL } from '../../core/config.js';

export function editPostKeywords(id){
  const rowEl = document.getElementById('news-kw-row-'+id);
  const p = POSTS_CACHE.find(x=>x.id===id);
  if(!rowEl || !p) return;
  const current = (p.ai_keywords||[]).join('، ');
  rowEl.innerHTML = `
    <input type="text" id="news-kw-input-${id}" value="${escAttr(current)}" placeholder="کلیدواژه‌ها، جدا با ویرگول" style="flex:1;font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid var(--border-strong);background:var(--surface-2);color:var(--text);font-family:inherit;" />
    <button type="button" class="news-kw-edit-btn" data-kw-save="${id}">ذخیره</button>
    <button type="button" class="news-kw-edit-btn" data-kw-cancel>انصراف</button>
  `;
  document.getElementById('news-kw-input-'+id).focus();
}
export async function savePostKeywords(id){
  const inputEl = document.getElementById('news-kw-input-'+id);
  if(!inputEl) return;
  const keywords = inputEl.value.split(/[,،]/).map(k=>k.trim()).filter(Boolean);
  const r = await api('/posts?id=eq.'+id, {method:'PATCH', headers:{Prefer:'return=minimal'}, body: JSON.stringify({ai_keywords: keywords, ai_keywords_extracted_at: new Date().toISOString()})});
  if(!r.ok){ showToast('انجام نشد؛ اتصال را بررسی کنید و دوباره امتحان کنید.'); return; }
  const p = POSTS_CACHE.find(x=>x.id===id);
  if(p) p.ai_keywords = keywords;
  renderNewsFeed();
}
// ترجمه‌ی اختیاری/به‌درخواست هر پست به فارسی — با هوش مصنوعی (لیارا AI
// Gateway، مدل openai/gpt-4o-mini) از طریق یه Supabase Edge Function
// (`supabase/functions/translate`) که کلید API لیارا رو سمت سرور نگه
// می‌داره؛ فرانت‌اند مستقیم به لیارا وصل نمی‌شه چون اون کلید (برخلاف anon
// key) پولیه و هیچ RLSای ازش محافظت نمی‌کنه. توکن ورود خودِ کاربر
// (`authToken`) برای Edge Function فرستاده می‌شه تا فقط کاربر واردشده
// (مدیر/بیننده) بتونه ازش استفاده کنه.
async function aiTranslate(postId){
  // فقط شناسه‌ی پست فرستاده می‌شه، نه خودِ متن — تابع سمت سرور خودش متن
  // واقعی رو با توکن همون کاربر از دیتابیس می‌خونه (نگاه کن به توضیح
  // بالای supabase/functions/translate/index.ts)
  const r = await fetch(SUPABASE_URL + '/functions/v1/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ postId }),
  });
  if(!r.ok) throw new Error('translate request failed');
  return await r.json(); // { title, text }
}
const NEWS_TRANSLATION_CACHE = {}; // id -> {title, text} — تا با toggle رفت‌وبرگشت دوباره درخواست نزنیم
function resetNewsTextExpand(id){
  const t = document.getElementById('news-text-'+id);
  const b = document.getElementById('news-more-'+id);
  if(!t || !b) return;
  t.classList.remove('expanded');
  b.classList.remove('open');
  b.firstChild.textContent = 'نمایش بیشتر ';
}
export async function translatePost(id){
  const p = POSTS_CACHE.find(x=>x.id===id);
  const btn = document.getElementById('news-translate-btn-'+id);
  const textEl = document.getElementById('news-text-'+id);
  const titleEl = document.getElementById('news-title-'+id);
  if(!p || !btn || !textEl) return;

  // چون ترجمه به‌جای متن اصلی می‌شینه (نه زیرش)، طول کارت عوض نمی‌شه —
  // برای همینم بعد از هر جایگزینی باید هم حالت «نمایش بیشتر» ریست بشه هم
  // سرریز متن با اندازه‌ی جدید دوباره چک بشه
  if(textEl.classList.contains('is-translated')){
    textEl.innerHTML = claimsTextDisplay(p.text);
    textEl.classList.remove('is-translated');
    if(titleEl){ titleEl.textContent = p.title; titleEl.classList.remove('is-translated'); }
    btn.textContent = 'ترجمه به فارسی';
    resetNewsTextExpand(id);
    updateNewsMoreButtons([p]);
    return;
  }
  const cached = NEWS_TRANSLATION_CACHE[id];
  if(cached){
    textEl.innerHTML = escHtml(cached.text);
    textEl.classList.add('is-translated');
    if(titleEl && cached.title){ titleEl.textContent = cached.title; titleEl.classList.add('is-translated'); }
    btn.textContent = 'بازگشت به متن اصلی';
    resetNewsTextExpand(id);
    updateNewsMoreButtons([p]);
    return;
  }
  const originalLabel = btn.textContent;
  btn.textContent = 'در حال ترجمه…';
  btn.disabled = true;
  try{
    const { title: titleFa, text: textFa } = await aiTranslate(id);
    NEWS_TRANSLATION_CACHE[id] = { title: titleFa, text: textFa };
    textEl.innerHTML = escHtml(textFa);
    textEl.classList.add('is-translated');
    if(titleEl && titleFa){ titleEl.textContent = titleFa; titleEl.classList.add('is-translated'); }
    btn.textContent = 'بازگشت به متن اصلی';
    resetNewsTextExpand(id);
    updateNewsMoreButtons([p]);
  }catch(e){
    btn.textContent = originalLabel;
    showToast('ترجمه ناموفق بود، دوباره امتحان کنید');
  }finally{
    btn.disabled = false;
  }
}


// دکمه‌های کارت خبر در فید (ترجمه، ویرایش/ذخیره/انصراف کلیدواژه)
export function setupPostTools(){
  document.getElementById('news-feed').addEventListener('click', e=>{
    const b = e.target.closest('[data-translate], [data-kw-edit], [data-kw-save], [data-kw-cancel]');
    if(!b) return;
    if(b.dataset.translate) translatePost(Number(b.dataset.translate));
    else if(b.dataset.kwEdit) editPostKeywords(Number(b.dataset.kwEdit));
    else if(b.dataset.kwSave) savePostKeywords(Number(b.dataset.kwSave));
    else renderNewsFeed();
  });
}
