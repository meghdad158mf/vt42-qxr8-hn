// پنجره‌های روی صفحه (.modal-overlay): بستن با کلیک بیرون پنجره، دکمه‌ی × (.modal-close) و
// هر دکمه‌ی data-modal-close (مثل «انصراف»). «برگشت» مرورگر هم .modal-close رو می‌زنه (core/router.js).
export function bindModal(id, close){
  const ov = document.getElementById(id);
  ov.addEventListener('click', e=>{
    if(e.target === ov || e.target.closest('.modal-close, [data-modal-close]')) close();
  });
}
