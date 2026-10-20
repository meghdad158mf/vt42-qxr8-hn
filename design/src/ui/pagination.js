// دکمه‌های صفحه‌بندی فهرست‌ها (قبلی/شماره‌ها/بعدی)
import { toFaDigits } from '../core/text.js';

// دکمه‌های صفحه‌بندی مشترک (اخبار و رویدادها، پست‌های کنشگری مجازی)
export function renderPagination(wrapId, cur, totalPages, goFn){
  const wrap = document.getElementById(wrapId);
  if(!wrap) return;
  if(totalPages <= 1){ wrap.innerHTML = ''; return; }
  const pages = [...new Set([1, totalPages, cur-1, cur, cur+1].filter(p=>p>=1 && p<=totalPages))].sort((a,b)=>a-b);
  let html = `<button ${cur===1?'disabled':''} data-page="${cur-1}">قبلی</button>`;
  let prev = 0;
  pages.forEach(p=>{
    if(prev && p - prev > 1) html += `<span class="dots">…</span>`;
    html += `<button class="${p===cur?'active':''}" data-page="${p}">${toFaDigits(p)}</button>`;
    prev = p;
  });
  html += `<button ${cur===totalPages?'disabled':''} data-page="${cur+1}">بعدی</button>`;
  wrap.innerHTML = html;
  wrap.onclick = e=>{ const b = e.target.closest('button[data-page]'); if(b) goFn(Number(b.dataset.page)); };
}

