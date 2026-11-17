// عدد زنده‌ی هر کاشی عرصه در صفحه‌ی نخست (۵.۳۵.۰، چینش بنتو). از همان داده‌ی بارگذاری‌شده (POSTS_CACHE،
// ۱۰۰۰ مطلب آخر کل سایت) شمرده می‌شود — بدون درخواست اضافه به سرور؛ برای عرصه‌های پرحجم «امروز» و
// برای کم‌تکرارها «این هفته». عدد صفر → «مشاهده ←» (نه «۰»، که گمراه‌کننده است).
import { CHANNELS, POSTS_CACHE } from '../../data/store.js';
import { toFaDigits } from '../../core/text.js';
import { iranTodayStartMs } from '../../core/date.js';
import { SCHOOL_REPORTS } from '../schools/school-reports.js';

const WEEK = 7 * 24 * 3600 * 1000;
const postTime = (p) => new Date(p.posted_at || p.scraped_at).getTime();

function countPosts(chFilter, since, postFilter = () => true){
  const ids = new Set(CHANNELS.filter(chFilter).map(c => c.id));
  let n = 0;
  for(const p of POSTS_CACHE) if(ids.has(p.channel_id) && postTime(p) >= since && postFilter(p)) n++;
  return n;
}

export function renderDomainLive(){
  const today = iranTodayStartMs(), week = Date.now() - WEEK;
  const counts = {
    overview: [countPosts(c => c.show_in_news && c.platform !== 'bale' && !c.show_in_hawza, today), 'مطلب امروز'],
    people: [countPosts(c => c.show_in_people || c.show_in_orgs || c.show_in_thinktanks, week), 'یادداشت این هفته'],
    hawza: [countPosts(c => c.show_in_hawza, today, p => p.hawza_relevant === true), 'خبر حوزه امروز'],
    posts: [countPosts(c => c.show_in_cyberspace, today), 'پست امروز'],
    schools: [SCHOOL_REPORTS.length, 'گزارش'],
    // مواضع فقط پس از تأیید هوش مصنوعی دیده می‌شوند (section_relevant) — همان که کاربر در بخش می‌بیند
    positions: [countPosts(c => c.show_in_positions, week, p => p.section_relevant === true), 'موضع این هفته'],
  };
  document.querySelectorAll('.dc-live[data-live]').forEach(el => {
    const c = counts[el.dataset.live];
    if(!c) return;
    el.textContent = c[0] > 0 ? toFaDigits(c[0]) + ' ' + c[1] + ' ←' : 'مشاهده ←';
  });
}
