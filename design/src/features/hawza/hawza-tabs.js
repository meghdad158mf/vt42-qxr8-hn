// تب‌بار «درباره حوزه»: «اخبار حوزه» (پنل مشترک اخبار، placeNewsStudyPanel) و «آنچه درباره حوزه گفته می‌شود» (۵.۲۳.۰)
import { activateNewsStudy, placeNewsStudyPanel, onLegacyHawzaTab } from '../news/news-tabs.js';
import { lsGet, lsSet } from '../../core/local-store.js';
import { navMark } from '../../core/router.js';
import { openHawzaAbout } from './hawza-about.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { firstVisibleTab, switchSection, viewerHidden } from '../../app.js';

// «درباره حوزه» دو تب داره: «اخبار حوزه» (پنل مشترک اخبار) و «آنچه درباره حوزه
// گفته می‌شود» (خزنده، hawza_mentions — ۵.۲۳.۰)
export const HAWZA_TAB_INFO = {
  news: 'اخبار سیاسی و اجتماعی منتشرشده در پایگاه‌های خبری حوزوی.',
  about: 'خبرهای سایت‌های خبری و پست‌های کانال‌های ایتا، تلگرام و بله که درباره‌ی حوزه، روحانیت، مراجع تقلید و طلاب هستند؛ هر ۳ ساعت به‌صورت خودکار جست‌وجو می‌شوند.',
};
export let HAWZA_TAB = (t=>HAWZA_TAB_INFO[t] ? t : 'news')(lsGet('jarian_last_hawza_tab', 'news'));
export function setHawzaTab(tab){
  if(!HAWZA_TAB_INFO[tab]) tab = 'news';
  if(viewerHidden('hawza/' + tab)) tab = firstVisibleTab('hawza') || tab;
  navMark();
  HAWZA_TAB = tab;
  lsSet('jarian_last_hawza_tab', tab);
  document.getElementById('hawza-tab-news').classList.toggle('active', tab === 'news');
  document.getElementById('hawza-tab-about').classList.toggle('active', tab === 'about');
  const sub = document.querySelector('#hawza-tab-subtitle span');
  if(sub) sub.textContent = HAWZA_TAB_INFO[tab];
  document.getElementById('hawza-about-panel').style.display = tab === 'about' ? '' : 'none';
  if(tab === 'about'){
    placeNewsStudyPanel('overview'); // پنل مشترک اخبار سر جای خودش (و مخفی) برگرده
    openHawzaAbout();
    return;
  }
  placeNewsStudyPanel('hawza');
  document.getElementById('news-study-panel').style.display = '';
  document.getElementById('news-feed').classList.remove('social-tab');
  activateNewsStudy('hawza');
}
export function goToHawzaTab(tab){
  if(HAWZA_TAB_INFO[tab]){ HAWZA_TAB = tab; lsSet('jarian_last_hawza_tab', tab); }
  switchSection('hawza'); // خودش تب HAWZA_TAB رو باز می‌کنه
}
export function setupHawzaTabs(){
  onLegacyHawzaTab(()=>goToHawzaTab('news'));
  document.getElementById('hawza-tab-news').addEventListener('click', ()=>setHawzaTab('news'));
  document.getElementById('hawza-tab-about').addEventListener('click', ()=>setHawzaTab('about'));
}

