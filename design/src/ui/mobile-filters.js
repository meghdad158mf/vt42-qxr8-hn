// دکمه‌ی «فیلترها» در نمای گوشی: فیلترهای جانبی پشت یه دکمه جمع می‌شن (ظرف data-mfilters)
import { toFaDigits } from '../core/text.js';

function toggleMobileFilters(btn){
  const box = btn.closest('[data-mfilters]');
  if(box) box.classList.toggle('m-open');
  btn.classList.toggle('active', box && box.classList.contains('m-open'));
}
export function setMobileFilterCount(boxSel, n){
  const el = document.querySelector(boxSel+' .m-filter-count');
  if(el) el.textContent = n ? toFaDigits(n) : '';
}

export function setupMobileFilters(){
  document.querySelectorAll('.m-filter-btn').forEach(btn=>btn.addEventListener('click', ()=>toggleMobileFilters(btn)));
}
