// تازگی داده در نوار بالا (۵.۳۵.۰): به‌جای متن ثابت «به‌روزرسانی خودکار هر ۲ ساعت»، زمان واقعی آخرین
// مطلب جمع‌آوری‌شده؛ اگر از ۳ ساعت گذشت (کالکتورها هر ۲ ساعت) زرد می‌شود تا کاربر بداند داده تازه نیست.
import { POSTS_CACHE } from '../data/store.js';
import { newsRelTime } from '../core/date.js';

const STALE_MS = 3 * 3600 * 1000;
let timer = null;

export function renderFreshness(){
  const el = document.querySelector('.topbar-status');
  if(!el) return;
  let newest = 0;
  for(const p of POSTS_CACHE){
    const t = p.scraped_at ? new Date(p.scraped_at).getTime() : 0;
    if(t > newest) newest = t;
  }
  if(!newest) return; // داده‌ای نرسیده — همان متن پیش‌فرض بماند
  const stale = Date.now() - newest > STALE_MS;
  const txt = 'آخرین خبر: ' + newsRelTime(new Date(newest).toISOString()) + (stale ? ' — جمع‌آوری کند شده' : '');
  el.classList.toggle('is-stale', stale);
  el.title = stale ? 'بیش از ۳ ساعت است مطلب تازه‌ای جمع‌آوری نشده' : 'زمان آخرین مطلب جمع‌آوری‌شده';
  el.innerHTML = '<span class="dot2"></span>';
  el.appendChild(document.createTextNode(txt));
  // هر دقیقه «… دقیقه پیش» تازه شود
  if(!timer) timer = setInterval(renderFreshness, 60 * 1000);
}
