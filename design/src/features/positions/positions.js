// «مواضع مراجع و علماء» (۵.۲۸.۰، مدار دوم): پنج تب، هر تب همون گالری/فید «یادداشت‌ها» با pfMode = pos-<تب>
import { lsGet, lsSet } from '../../core/local-store.js';
import { navMark } from '../../core/router.js';
import { placePfPanel, setPfMode } from '../people/profile-gallery.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { firstVisibleTab, switchSection, viewerHidden } from '../../app.js';

// ---- «مواضع مراجع و علماء» (۵.۲۸.۰، مدار دوم) ----
// پنج تب؛ هر تب = گالری لوگو + فید منبع با همون ظرف «یادداشت‌ها» (pfMode = 'pos-<تب>')؛
// عضویت منبع: channels.show_in_positions + positions_tab (migration_047)
export var POS_TAB_INFO = {
  leader: 'بیانات، پیام‌ها و مواضع رهبر معظم انقلاب.',
  maraji: 'مواضع و بیانیه‌های مراجع تقلید و علمای طراز اول در برابر مسائل روز.',
  hawza: 'مواضع رسمی حوزه‌های علمیه در برابر مسائل خاص (بیشتر از سوی مدیر حوزه)؛ این تب خبر نیست، فقط موضع رسمی.',
  imams: 'خطبه‌ها و مواضع ائمه جمعه.',
  orgs: 'مواضع و بیانیه‌های تشکل‌ها و نخبگان حوزوی.',
};
export var POS_TAB_LABEL = { leader:'رهبر انقلاب', maraji:'مراجع و علماء', hawza:'حوزه‌های علمیه', imams:'ائمه جمعه', orgs:'تشکل‌ها و نخبگان' };
export var POS_TAB = (t=>POS_TAB_INFO[t] ? t : 'leader')(lsGet('jarian_last_pos_tab', 'leader'));
export function setPosTab(tab){
  if(!POS_TAB_INFO[tab]) tab = 'leader';
  if(viewerHidden('positions/' + tab)) tab = firstVisibleTab('positions') || tab;
  navMark();
  POS_TAB = tab;
  lsSet('jarian_last_pos_tab', tab);
  document.querySelectorAll('#positions-page-tabs button[data-pos-tab]').forEach(b=>b.classList.toggle('active', b.dataset.posTab === tab));
  const sub = document.querySelector('#positions-tab-subtitle span');
  if(sub) sub.textContent = POS_TAB_INFO[tab];
  placePfPanel('positions');
  setPfMode('pos-' + tab);
}
export function goToPosTab(tab){
  if(POS_TAB_INFO[tab]){ POS_TAB = tab; lsSet('jarian_last_pos_tab', tab); }
  switchSection('positions'); // خودش تب POS_TAB رو باز می‌کنه
}
export function setupPositionsTabs(){
  document.getElementById('positions-page-tabs').addEventListener('click', e=>{
    const b = e.target.closest('button[data-pos-tab]'); if(!b) return;
    if(viewerHidden('positions/' + b.dataset.posTab)) return;
    setPosTab(b.dataset.posTab);
  });
}

