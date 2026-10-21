// لمس خودِ متن کارت پست (.news-card .news-text) = «نمایش بیشتر» — همه‌ی فیدها (گوشی، بازبینی UX ۵.۱۸.۱)

export function setupCardTextTap(){
  // لمس خودِ متن پست = «نمایش بیشتر» (دکمه‌ی کوچیکش روی گوشی سخت زده می‌شد)؛ اگه کاربر
  // داره متن رو انتخاب می‌کنه یا متن کوتاهه (دکمه مخفیه)، کاری نمی‌کنه
  document.addEventListener('click', e=>{
    const t = e.target.closest('.news-card .news-text');
    if(!t || e.target.closest('a')) return;
    const sel = window.getSelection && window.getSelection();
    if(sel && String(sel).trim()) return;
    const more = t.parentElement && t.parentElement.querySelector(':scope > .news-more');
    if(more && more.style.display !== 'none' && more.offsetParent) more.click();
  });
}

