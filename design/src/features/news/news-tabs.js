// «اخبار و رویدادها»: تب‌ها و جابه‌جایی پنل مشترک فید بین این بخش و «درباره حوزه»
import { lsGet, lsSet } from '../../core/local-store.js';
import { navMark } from '../../core/router.js';
import { newsState, populateNewsSourceOptions, renderNewsFeed, updateNewsTopicVisibility } from './news-feed.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { firstVisibleTab, goToHawzaTab, renderDossierTab, renderNewsAnalytics, renderNewsletterTab, renderNewspapers, switchSection, viewerHidden } from '../../app.js';

// میان‌برهای کارت‌های صفحه‌ی نخست به زیربخش‌های خودِ همون صفحه
export function goToNewsTab(tab){
  if(tab === 'hawza'){ goToHawzaTab('news'); return; } // تب قدیمی، حالا بخش «درباره حوزه»
  switchSection('overview');
  setNewsPageTab(tab);
}
// متن زیرنویس هر تب (سه گروه: اخبار و رویدادها / کنشگری مجازی / یادداشت‌ها)
// — یه خط کوتاه هدف همون تب رو توضیح می‌ده؛ در setNewsPageTab و دو هندلر
// کلیک posts-page-tabs/people-page-tabs مصرف می‌شه
const NEWS_TAB_INFO = {
  analytics: 'خلاصه‌ی هوشمند اخبار مهم و موضوعات پرتکرار اخیر.',
  claims: 'ادعاها و شایعات منتشرشده در اخبار رسانه ها همراه با توضیحات',
  study: 'پست‌های منتشر شده در صفحات شبکه‌های اجتماعی',
  website: 'مقالات سایت‌های خبری رسمی، با امکان جست‌وجوی موضوعی و ترجمه‌ی خودکار.',
  newspapers: 'صفحه‌ی اول روزنامه‌های کشور، جمع‌آوری‌شده‌ی روزانه از کیوسک مطبوعات.',
  dossier: 'اخبار مرتبط با چند موضوع خاص و گروه‌بندی‌شده.',
  newsletter: 'خبرنامه‌ی روزانه‌ی قابل‌دانلود، متشکل از اخبار منتخب.'
};
// پنل مشترک «شبکه‌های اجتماعی/وب‌سایت‌ها/ادعاها» که «اخبار حوزه» (بخش «درباره
// حوزه») هم ازش استفاده می‌کنه — جابه‌جایی خودِ عنصر، نه کپی
export const NEWS_TABS = ['analytics','claims','study','website','newspapers','dossier','newsletter'];
export let NEWS_CURRENT_TAB = (t=>NEWS_TABS.includes(t) ? t : 'analytics')(lsGet('jarian_last_news_tab', 'analytics'));
let NEWS_STUDY_HOME = null;
export function placeNewsStudyPanel(where){
  const panel = document.getElementById('news-study-panel');
  if(!NEWS_STUDY_HOME){
    NEWS_STUDY_HOME = document.createComment('news-study-panel-home');
    panel.parentNode.insertBefore(NEWS_STUDY_HOME, panel);
  }
  if(where === 'hawza'){
    const slot = document.getElementById('hawza-news-slot');
    if(panel.parentNode !== slot) slot.appendChild(panel);
  }else if(NEWS_STUDY_HOME.nextSibling !== panel){
    NEWS_STUDY_HOME.parentNode.insertBefore(panel, NEWS_STUDY_HOME.nextSibling);
  }
}
// تنظیم پنل مشترک برای یه منبع (social/website/hawza/claims) و رندر فید
export function activateNewsStudy(platform){
  // جست‌وجوی یه تب نباید بی‌صدا روی تب بعدی هم اعمال بمونه (کاربر فکر می‌کرد خبرهای اون تب کمه)
  if(newsState.platform !== platform && newsState.query){
    newsState.query = '';
    document.getElementById('news-search-input').value = '';
    document.querySelectorAll('.news-topic-chip').forEach(c=>c.classList.toggle('active', c.dataset.kw === ''));
  }
  newsState.platform = platform;
  newsState.page = 1;
  // تب «ادعاها و شایعات» فقط یه منبع (کانال بله) داره — فیلتر منطقه و
  // دراپ‌داون چندانتخابی رسانه‌ها بی‌معنیه، پس مخفی می‌شن
  const isClaims = platform === 'claims';
  document.getElementById('news-region-row').style.display = isClaims ? 'none' : '';
  document.getElementById('news-source-details').style.display = isClaims ? 'none' : '';
  document.getElementById('news-filter-divider-1').style.display = isClaims ? 'none' : '';
  updateNewsTopicVisibility();
  populateNewsSourceOptions();
  renderNewsFeed();
}
export function setNewsPageTab(tab){
  if(viewerHidden('overview/' + tab)) tab = firstVisibleTab('overview') || tab;
  navMark();
  NEWS_CURRENT_TAB = tab;
  lsSet('jarian_last_news_tab', tab);
  placeNewsStudyPanel('overview');
  const subEl = document.getElementById('news-tab-subtitle');
  if(subEl) subEl.querySelector('span').textContent = NEWS_TAB_INFO[tab] || '';
  document.getElementById('news-tab-study').classList.toggle('active', tab==='study');
  document.getElementById('news-tab-website').classList.toggle('active', tab==='website');
  document.getElementById('news-tab-claims').classList.toggle('active', tab==='claims');
  document.getElementById('news-tab-newspapers').classList.toggle('active', tab==='newspapers');
  document.getElementById('news-tab-analytics').classList.toggle('active', tab==='analytics');
  document.getElementById('news-tab-dossier').classList.toggle('active', tab==='dossier');
  document.getElementById('news-tab-newsletter').classList.toggle('active', tab==='newsletter');
  document.getElementById('news-feed').classList.toggle('social-tab', tab==='study');
  // «شبکه‌های اجتماعی»، «وب‌سایت‌ها» و «ادعاها و شایعات» (+ «اخبار حوزه» در بخش «درباره حوزه»)
  // یه پنل مشترک (news-study-panel) رو با فیلترها/جست‌وجو/صفحه‌بندی
  // یکسان به اشتراک می‌ذارن — فقط newsState.platform عوض می‌شه که
  // newsChannels() بر اساسش کانال‌های پیام‌رسان/وب‌سایت/حوزه/بله رو
  // برمی‌گردونه
  const showStudy = tab==='study' || tab==='website' || tab==='claims';
  document.getElementById('news-study-panel').style.display = showStudy ? '' : 'none';
  document.getElementById('news-newspapers-panel').style.display = tab==='newspapers' ? '' : 'none';
  document.getElementById('news-analytics-panel').style.display = tab==='analytics' ? '' : 'none';
  document.getElementById('news-dossier-panel').style.display = tab==='dossier' ? '' : 'none';
  document.getElementById('news-newsletter-panel').style.display = tab==='newsletter' ? '' : 'none';
  if(showStudy) activateNewsStudy(tab==='website' ? 'website' : tab==='claims' ? 'claims' : 'social');
  if(tab==='newspapers') renderNewspapers();
  if(tab==='analytics') renderNewsAnalytics();
  if(tab==='dossier') renderDossierTab();
  if(tab==='newsletter') renderNewsletterTab();
}


// تب‌بار «اخبار و رویدادها» (دکمه‌ها id="news-tab-<تب>") و پیوندهای data-news-go (مثل «همه ←» ادعاها)
export function setupNewsTabs(){
  document.querySelector('#sec-overview .news-page-tabs').addEventListener('click', e=>{
    const b = e.target.closest('button[id^="news-tab-"]');
    if(b) setNewsPageTab(b.id.slice('news-tab-'.length));
  });
  document.addEventListener('click', e=>{
    const a = e.target.closest('[data-news-go]');
    if(a) goToNewsTab(a.dataset.newsGo);
  });
}
