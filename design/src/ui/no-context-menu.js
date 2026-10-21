// جلدهای روزنامه‌ها و بسته‌ها: منوی راست‌کلیک («ذخیره‌ی تصویر») باز نشه — هر عنصر با data-no-menu
// (قبلاً oncontextmenu="return false" روی هر تصویر)
export function setupNoContextMenu(){
  document.addEventListener('contextmenu', e=>{
    if(e.target.closest && e.target.closest('[data-no-menu]')) e.preventDefault();
  });
}
