// تب‌بار «کنشگری مجازی»: «پست‌های منتشر شده» و «افراد و مجموعه‌ها»
import { lsSet } from '../../core/local-store.js';
import { navMark } from '../../core/router.js';
import { POSTS_FOCUS_FROM_TABLE, clearPostsFocus } from './posts-feed.js';
import { renderCyberPeopleGrid } from './cyber-people.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { ensureVisibleTab, switchSection, viewerHidden } from '../../app.js';

export const POSTS_TAB_INFO = {
  feed: 'پست‌های منتشرشده‌ی کانال‌های کنشگر فضای مجازی، قابل‌فیلتر بر اساس کانال، دسته و زمان.',
  people: 'فهرست کانال‌های کنشگر به‌همراه صاحب کانال، تعداد مخاطب و سطح فعالیت هرکدام.'
};
export function goToPostsTab(tab){
  switchSection('posts');
  const tabBtn = document.querySelector('#posts-page-tabs button[data-posts-tab="'+tab+'"]');
  if(tabBtn) tabBtn.click();
}
// ---- «افراد و مجموعه‌ها»: زیرتب دوم «کنشگری مجازی»، گالری معرفی همون
// کانال‌هایی که پست‌هاشون توی زیرتب «پست‌های منتشر شده» جمع می‌شه ----
export const postsPageTabsEl = document.getElementById('posts-page-tabs');
export function setupCyberTabs(){
  if(postsPageTabsEl) postsPageTabsEl.addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b || !b.dataset.postsTab) return;
    if(viewerHidden('posts/' + b.dataset.postsTab)){ ensureVisibleTab('posts'); return; }
    navMark();
    lsSet('jarian_last_posts_tab', b.dataset.postsTab);
    postsPageTabsEl.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const postsSubEl = document.getElementById('posts-tab-subtitle');
    if(postsSubEl) postsSubEl.querySelector('span').textContent = POSTS_TAB_INFO[b.dataset.postsTab] || '';
    ['feed','people'].forEach(key=>{
      const el = document.getElementById('posts-tab-'+key);
      if(el) el.style.display = key === b.dataset.postsTab ? '' : 'none';
    });
    if(b.dataset.postsTab === 'people'){
      if(POSTS_FOCUS_FROM_TABLE) clearPostsFocus();
      renderCyberPeopleGrid();
    }
  });
}

