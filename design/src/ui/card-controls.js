// کنترل‌های مدیر زیر جلدها (جابه‌جایی + حذف) — قبلاً پیکان‌های ۲۲×۱۸ و یه «✕» بی‌برچسب
export function cardAdminControls(i, total, onMove, onDelete, label){
  const box = document.createElement('div'); box.className = 'card-admin';
  const mk = (cls, html, title, fn, disabled)=>{
    const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.innerHTML = html;
    b.title = title; b.setAttribute('aria-label', title); b.disabled = !!disabled;
    b.addEventListener('click', fn); box.appendChild(b); return b;
  };
  mk('card-move', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>', 'انتقال به قبل', () => onMove(-1), i === 0);
  mk('card-move', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>', 'انتقال به بعد', () => onMove(1), i === total - 1);
  mk('card-del', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg><span>حذف</span>', 'حذف ' + label, onDelete);
  return box;
}

