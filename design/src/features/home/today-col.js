// داده‌ی «امروز در جریان» صفحه‌ی نخست (از ۵.۳۹.۰ فقط داده؛ رسم در home-v3.js). پنج گروه: اخبار / شایعه /
// موضع / درباره حوزه / یادداشت — از آنچه loadAll آورده، بدون درخواست اضافه. todayFeed() آن‌ها را یکی‌درمیان
// (گروه‌به‌گروه) در یک فهرست می‌چیند تا از هر عرصه چیزی دیده شود.
import { CHANNELS, POSTS_CACHE, HIDDEN_POST_IDS, chName } from '../../data/store.js';
import { toFaDigits } from '../../core/text.js';
import { iranTodayStartMs, newsRelTime } from '../../core/date.js';
import { newsPickItems } from '../news/picks.js';
import { POS_TAB_LABEL } from '../positions/positions.js';

const PER_TAB = 4;
const IC = {
  news: '<path d="M4 4h12v16H6a2 2 0 01-2-2V4zM16 8h4v10a2 2 0 01-2 2M8 8h4M8 12h4M8 16h3"/>',
  claim: '<path d="M12 3l9 16H3L12 3zM12 10v4M12 17h.01"/>',
  pos: '<path d="M7 7h4v4H7zM13 7h4v4h-4zM7 11c0 3-1 4-3 5M13 11c0 3-1 4-3 5"/>',
  hawza: '<path d="M4 21h16M6 21V10l6-5 6 5v11M10 21v-6h4v6"/>',
  note: '<path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8l-5-5zM14 3v5h5M9 13h6M9 17h4"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;
const tOf = (p) => new Date(p.posted_at || p.scraped_at).getTime();
const byNew = (a, b) => tOf(b) - tOf(a);
const visible = (p) => !p.hidden_at && !HIDDEN_POST_IDS.has(Number(p.id));
const headline = (p) => (p.title || String(p.text || '').replace(/\s+/g, ' ')).trim().slice(0, 170);
const thumbOf = (p) => {
  if(!p || !p.media_path) return '';
  const realVideo = p.media_type === 'video' && /\.mp4($|\?)/i.test(p.media_path);
  return p.media_type === 'photo' || (p.media_type === 'video' && !realVideo) ? p.media_path : '';
};
// نتیجه‌ی راستی‌آزمایی از متن پست «رصد شایعات» (همان‌جا با این واژه‌ها نوشته می‌شود)
function claimVerdict(p){
  const s = (p.title || '') + ' ' + (p.text || '');
  if(/گمراه[‌\s]?کننده/.test(s)) return 'گمراه‌کننده';
  if(/نادرست|کذب|صحت ندارد|تکذیب|جعلی/.test(s)) return 'نادرست';
  return '';
}

function channelsWhere(fn){ return new Set(CHANNELS.filter(fn).map(c => c.id)); }
function postsOf(ids, extra = () => true){ return POSTS_CACHE.filter(p => ids.has(p.channel_id) && visible(p) && extra(p)).sort(byNew); }

// هر زبانه: { key, label, count (امروز), items:[{text, meta, badges:[[cls,txt]], thumb, link}], more:{label, go|newsGo}, featLabel }
let EXCLUDE = new Set();
function buildTabs(){
  const today = iranTodayStartMs();
  const tabs = [];
  // اخبار: «اخبار منتخب» (سنجاق مدیر + هوش مصنوعی)؛ تا هوش مصنوعی برنگشته، تازه‌ترین خبرها
  const newsIds = channelsWhere(c => c.show_in_news && c.platform !== 'bale' && !c.show_in_hawza);
  const newsAll = postsOf(newsIds);
  const picks = newsPickItems();
  const newsItems = picks.length
    ? picks.map(({ sp, post }) => ({
        text: sp.headline || (post && headline(post)) || '',
        meta: chName(post ? post.channel_id : sp.channel_id) + (sp.sources > 1 ? ' و ' + toFaDigits(sp.sources - 1) + ' منبع دیگر' : '') + (sp.time ? '، ' + newsRelTime(sp.time) : ''),
        badges: [...(sp.sources >= 5 ? [['w', 'پرتکرار']] : []), ...((Array.isArray(sp.tags) ? sp.tags : []).slice(0, 1).map(t => ['', t]))],
        thumb: thumbOf(post), link: (post && post.link) || sp.link || '',
      }))
    : newsAll.map(p => ({ text: headline(p), meta: chName(p.channel_id) + '، ' + newsRelTime(p.posted_at || p.scraped_at), badges: [], thumb: thumbOf(p), link: p.link }));
  tabs.push({ key: 'news', label: 'اخبار', count: newsAll.filter(p => tOf(p) >= today).length, items: newsItems,
    featLabel: picks.length ? 'مهم‌ترین امروز' : 'تازه‌ترین خبر', more: { label: 'همه‌ی اخبار', newsGo: picks.length ? 'analytics' : 'study' } });
  // شایعه: کانال «رصد شایعات» (بله)
  const claims = POSTS_CACHE.filter(p => p.platform === 'bale' && visible(p)).sort(byNew);
  tabs.push({ key: 'claim', label: 'شایعه', count: claims.filter(p => tOf(p) >= today).length,
    items: claims.map(p => { const v = claimVerdict(p); return { text: headline(p), meta: chName(p.channel_id) + '، ' + newsRelTime(p.posted_at || p.scraped_at), badges: v ? [['f', v]] : [], thumb: '', link: p.link }; }),
    featLabel: 'تازه‌ترین شایعه', more: { label: 'همه‌ی ادعاها و شایعه‌ها', newsGo: 'claims' } });
  // موضع: فقط آنچه در خود بخش هم دیده می‌شود (تأیید هوش مصنوعی، section_relevant)
  const posCh = new Map(CHANNELS.filter(c => c.show_in_positions).map(c => [c.id, c]));
  // مواضعی که همین حالا در هرو (اسلاید ۱) دیده می‌شوند اینجا تکرار نمی‌شوند
  const inHero = EXCLUDE;
  const positions = postsOf(new Set(posCh.keys()), p => p.section_relevant === true && !inHero.has(p.id));
  tabs.push({ key: 'pos', label: 'موضع', count: positions.filter(p => tOf(p) >= today).length,
    items: positions.map(p => { const g = POS_TAB_LABEL[posCh.get(p.channel_id)?.positions_tab]; return { text: headline(p), meta: chName(p.channel_id) + '، ' + newsRelTime(p.posted_at || p.scraped_at), badges: g ? [['g', g]] : [], thumb: '', link: p.link }; }),
    featLabel: 'تازه‌ترین موضع', more: { label: 'همه‌ی مواضع', go: 'positions' } });
  // درباره حوزه: اخبار حوزه (سیاسی‌اجتماعی به تشخیص هوش مصنوعی، hawza_relevant)
  const hawza = postsOf(channelsWhere(c => c.show_in_hawza), p => p.hawza_relevant === true && !inHero.has(p.id));
  tabs.push({ key: 'hawza', label: 'درباره حوزه', count: hawza.filter(p => tOf(p) >= today).length,
    items: hawza.map(p => ({ text: headline(p), meta: chName(p.channel_id) + '، ' + newsRelTime(p.posted_at || p.scraped_at), badges: [], thumb: thumbOf(p), link: p.link })),
    featLabel: 'تازه‌ترین خبر حوزه', more: { label: 'همه‌ی مطالب درباره حوزه', go: 'hawza' } });
  // یادداشت: چهره‌ها، سازمان‌ها و اندیشکده‌ها
  const notes = postsOf(channelsWhere(c => c.show_in_people || c.show_in_orgs || c.show_in_thinktanks));
  tabs.push({ key: 'note', label: 'یادداشت', count: notes.filter(p => tOf(p) >= today).length,
    items: notes.map(p => ({ text: headline(p), meta: chName(p.channel_id) + '، ' + newsRelTime(p.posted_at || p.scraped_at), badges: [], thumb: '', link: p.link })),
    featLabel: 'تازه‌ترین یادداشت', more: { label: 'همه‌ی یادداشت‌ها', go: 'people' } });
  // زبانه‌ی بی‌مطلب نشان داده نمی‌شود
  return tabs.map(t => ({ ...t, items: t.items.filter(i => i.text).slice(0, PER_TAB) })).filter(t => t.items.length);
}

// فهرست یکی‌درمیان؛ exclude = شناسه‌ی پستی که بالای ستون (مطلب اصلی) آمده
export function todayFeed(exclude = new Set(), max = 12){
  EXCLUDE = exclude;
  const tabs = buildTabs();
  const out = [];
  for(let i = 0; out.length < max; i++){
    let any = false;
    for(const t of tabs){ const it = t.items[i]; if(it){ any = true; out.push({ ...it, kind: t.key, label: t.label }); } }
    if(!any) break;
  }
  return out.slice(0, max);
}
export const todayIcon = icon;
