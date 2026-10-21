// «کاربران ← نظرات کاربران» (feedback)
import { api } from '../core/api.js';
import { newsRelTime } from '../core/date.js';
import { showToast } from '../ui/toast.js';
import { uiConfirm } from '../ui/confirm.js';

export let FEEDBACK_LIST = [];     // {id, name, message, created_at} — فقط با ورود مدیر به تب «نظرات کاربران» لود می‌شه
// تب مدیریتی «نظرات کاربران» — فقط مدیر (RLS جدول feedback فقط سلکت
// مدیر رو اجازه می‌ده)؛ متن نظر همیشه با textContent (نه innerHTML)
// نشون داده می‌شه چون ورودی آزاد کاربره و نباید به‌عنوان HTML اجرا بشه
export async function loadFeedbackList(){
  const r = await api('/feedback?order=created_at.desc');
  FEEDBACK_LIST = r.ok ? await r.json() : [];
}
export function renderFeedbackList(){
  const wrap = document.getElementById('feedback-list');
  if(!wrap) return;
  wrap.innerHTML = '';
  if(!FEEDBACK_LIST.length){
    wrap.innerHTML = '<p style="color:var(--text-faint);font-size:13px;text-align:center;padding:20px 0;">هنوز نظری ثبت نشده.</p>';
    return;
  }
  FEEDBACK_LIST.forEach(f=>{
    const row = document.createElement('div'); row.className = 'feedback-row';
    const main = document.createElement('div'); main.className = 'feedback-row-main';
    const head = document.createElement('div'); head.className = 'feedback-row-head';
    const name = document.createElement('span'); name.className = 'feedback-row-name';
    name.textContent = f.name || 'ناشناس';
    const time = document.createElement('span'); time.className = 'feedback-row-time';
    time.textContent = newsRelTime(f.created_at);
    head.appendChild(name); head.appendChild(time);
    const msg = document.createElement('div'); msg.className = 'feedback-row-message';
    msg.textContent = f.message;
    main.appendChild(head); main.appendChild(msg);
    const del = document.createElement('button'); del.className = 'del-btn'; del.textContent = '✕';
    del.title = 'حذف'; del.setAttribute('aria-label', 'حذف این نظر');
    del.addEventListener('click', () => deleteFeedback(f));
    row.appendChild(main); row.appendChild(del);
    wrap.appendChild(row);
  });
}
export async function deleteFeedback(f){
  if(!await uiConfirm('این نظر حذف شود؟')) return;
  try{
    const r = await api('/feedback?id=eq.'+f.id, {method:'DELETE'});
    if(!r.ok) throw new Error('delete failed');
    FEEDBACK_LIST = FEEDBACK_LIST.filter(x=>x.id!==f.id);
    renderFeedbackList();
  }catch(e){
    showToast('حذف نظر ناموفق بود');
  }
}

