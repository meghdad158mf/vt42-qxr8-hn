// مقایسه با دیروز برای «در یک نگاه» (۵.۳۵.۰): شاخص‌های امروز در برابر «دیروز تا همین ساعت» و
// خط‌چین ۲۴ ساعتِ قبل روی نمودار ساعتی. کش ۱۰۰۰تایی POSTS_CACHE دیروز را کامل نمی‌پوشاند، پس
// زمان پست‌های ۴۸ ساعت اخیر جدا و سبک (فقط ستون‌های زمان/منبع) گرفته می‌شود؛ تا loadAll بعدی کش.
import { api } from '../../core/api.js';
import { iranTodayStartMs } from '../../core/date.js';
import { POSTS_CACHE, HIDDEN_POST_IDS } from '../../data/store.js';

const DAY = 24 * 3600 * 1000;
export let COMPARE_STATE = { forCache: null, loading: false, rows: null };
let COMPARE_READY = () => {};
export function onCompareReady(fn){ COMPARE_READY = fn; }

const postTime = (p) => new Date(p.posted_at || p.scraped_at).getTime();

async function loadCompareRows(){
  const since = new Date(Date.now() - 2 * DAY).toISOString();
  const out = [];
  for(let page = 0; page < 10; page++){
    const r = await api('/posts?select=id,channel_id,platform,posted_at,scraped_at&scraped_at=gte.' + encodeURIComponent(since)
      + '&order=scraped_at.desc&limit=1000&offset=' + (page * 1000));
    if(!r.ok) throw new Error('compare rows ' + r.status);
    const rows = await r.json();
    out.push(...rows.filter(p => !HIDDEN_POST_IDS.has(Number(p.id))));
    if(rows.length < 1000) break;
  }
  return out;
}

// یک‌بار برای هر بار بارگذاری داده؛ با رسیدن نتیجه COMPARE_READY (رندر دوباره‌ی تب) صدا زده می‌شود
export function ensureCompareData(){
  if(COMPARE_STATE.forCache === POSTS_CACHE) return;
  const st = COMPARE_STATE = { forCache: POSTS_CACHE, loading: true, rows: null };
  loadCompareRows().then(rows => { st.rows = rows; }).catch(() => { st.rows = null; }).finally(() => {
    if(COMPARE_STATE !== st) return;
    st.loading = false;
    if(st.rows) COMPARE_READY();
  });
}

// شمارش امروز (از نیمه‌شب تهران تا الان) و دیروز در همان بازه‌ی ساعتی؛ null تا داده نرسیده
export function todayVsYesterday(filter){
  if(!COMPARE_STATE.rows) return null;
  const now = Date.now(), t0 = iranTodayStartMs();
  const today = [], yest = [];
  for(const p of COMPARE_STATE.rows){
    if(!filter(p)) continue;
    const t = postTime(p);
    if(t >= t0 && t <= now) today.push(p);
    else if(t >= t0 - DAY && t <= now - DAY) yest.push(p);
  }
  return { today, yest };
}

// شمارش ساعتی ۲۴ ساعت اخیر و ۲۴ ساعتِ پیش از آن (هم‌تراز با برچسب‌های نمودار)؛ null تا داده نرسیده
export function hourlyWithPrevDay(filter){
  if(!COMPARE_STATE.rows) return null;
  const cur = new Array(24).fill(0), prev = new Array(24).fill(0);
  const h0 = new Date(); h0.setMinutes(0, 0, 0);
  const start = h0.getTime() - 23 * 3600 * 1000;
  for(const p of COMPARE_STATE.rows){
    if(!filter(p)) continue;
    const t = postTime(p);
    const i = Math.floor((t - start) / 3600000);
    if(i >= 0 && i < 24) cur[i]++;
    const j = Math.floor((t + DAY - start) / 3600000);
    if(j >= 0 && j < 24) prev[j]++;
  }
  return { cur, prev };
}

// برچسب تغییر: درصد وقتی پایه‌ی دیروز معنادار است (≥۵)، وگرنه اختلاف مطلق
export function deltaInfo(today, yest){
  const diff = today - yest;
  if(diff === 0) return { dir: 'flat', text: 'بدون تغییر' };
  const dir = diff > 0 ? 'up' : 'down';
  const pct = yest >= 5 ? Math.round(Math.abs(diff) / yest * 100) : null;
  return { dir, text: pct != null ? pct + '٪' : Math.abs(diff) + '' };
}
