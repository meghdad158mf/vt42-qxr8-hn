// تب‌بار «یادداشت‌ها»: سازمان‌ها، چهره‌ها، اندیشکده‌ها (گالری مشترک) و بسته‌های تحلیلی سایر نهادها
import { lsSet } from '../../core/local-store.js';
import { navMark } from '../../core/router.js';
import { pfMode, setPfMode } from './profile-gallery.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { ensureVisibleTab, switchSection, viewerHidden } from '../../app.js';

export const PEOPLE_TAB_INFO = {
  orgs: 'مطالب و تحلیل‌های منتشرشده‌ی سازمان‌ها و نهادها؛ برای دیدن مطالب، سازمان موردنظر را انتخاب کنید.',
  figures: 'یادداشت‌ها و مطالب کانال‌های معرفی‌شده به‌عنوان چهره‌ی سیاسی.',
  thinktanks: 'گزارش‌ها و یادداشت‌های اندیشکده‌ها و پژوهشگاه‌ها؛ برای دیدن مطالب، اندیشکده‌ی موردنظر را انتخاب کنید.',
  archive: 'تولیدات تحلیلی سایر نهادها، جدا از بسته‌های تحلیلی خودِ جریان.'
};
export function goToPeopleTab(tab){
  switchSection('people');
  const tabBtn = document.querySelector('#people-page-tabs button[data-people-tab="'+tab+'"]');
  if(tabBtn) tabBtn.click();
}
// برگشت به «یادداشت‌ها»: حالت گالری (pfMode) و نمایش ظرف با تب فعال همون بخش هم‌سو بشه
export function syncPeopleTab(){
  const b = document.querySelector('#people-page-tabs button.active');
  const t = b ? b.dataset.peopleTab : 'figures';
  const pfTab = ['orgs','figures','thinktanks'].includes(t);
  document.getElementById('people-tab-figures').style.display = pfTab ? '' : 'none';
  document.getElementById('people-tab-archive').style.display = t === 'archive' ? '' : 'none';
  if(pfTab && pfMode !== t) setPfMode(t);
}
// زیرتب‌های «یادداشت‌ها»: چهره‌های سیاسی (پیش‌فرض) + دو تب منتقل‌شده از
// بخش قبلاً مستقل «ضمیمه جریان» (سایر بسته‌های تحلیلی/بسته‌های آموزشی)
export const peoplePageTabsEl = document.getElementById('people-page-tabs');
export function setupPeopleTabs(){
  if(peoplePageTabsEl) peoplePageTabsEl.addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b || !b.dataset.peopleTab) return;
    if(viewerHidden('people/' + b.dataset.peopleTab)){ ensureVisibleTab('people'); return; }
    navMark();
    lsSet('jarian_last_people_tab', b.dataset.peopleTab);
    peoplePageTabsEl.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const peopleSubEl = document.getElementById('people-tab-subtitle');
    if(peopleSubEl) peopleSubEl.querySelector('span').textContent = PEOPLE_TAB_INFO[b.dataset.peopleTab] || '';
    const tab = b.dataset.peopleTab;
    // orgs، figures و thinktanks هر سه ظرف people-tab-figures رو نشون می‌دن
    const container = (tab === 'orgs' || tab === 'thinktanks') ? 'figures' : tab;
    ['figures','archive'].forEach(key=>{
      const el = document.getElementById('people-tab-'+key);
      if(el) el.style.display = key === container ? '' : 'none';
    });
    if(tab === 'orgs' || tab === 'figures' || tab === 'thinktanks') setPfMode(tab);
  });
}

