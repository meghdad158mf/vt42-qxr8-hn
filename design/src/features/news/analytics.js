// تب «در یک نگاه»: ردیف شاخص‌ها، موضوعات پرتکرار، جدیدترین ادعاها، نمودارهای ساعتی و پرکارترین منابع (Chart.js تنبل‌لود)
import { CHANNELS, POSTS_CACHE, chById, chName } from '../../data/store.js';
import { escHtml, toFaDigits } from '../../core/text.js';
import { iranTodayStartMs, newsRelTime } from '../../core/date.js';
import { loadScriptOnce, scriptRequested } from '../../core/load-script.js';
import { NEWS_AI_INSIGHTS } from './insights.js';
import { renderNewsPicks } from './picks.js';
import { WAVE_LIVE_H, WAVE_STATE, onWavesComputed, renderNewsWaves, waveTime } from './waves.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { topChannelsByCount } from '../../app.js';

// «آنالیز» تب «اخبار و رویدادها» فقط روی «شبکه‌های اجتماعی» + «وب‌سایت‌ها»
// تعریف شده — نه «روزنامه‌ها» (جدول جدایی داره، posts نیست) و نه «ادعاها
// و شایعات» (کانال بله، محتوایی متفاوته)
export function newsAnalyticsChannels(){
  return CHANNELS.filter(c => c.show_in_news && c.platform !== 'bale');
}
// معیار محاسبات تب «آنالیز» ۲۴ ساعت اخیره — hours رو خالی بذار برای
// بدون محدودیت زمانی (فعلاً همه‌جا با hours=24 صدا زده می‌شه)
export function newsAnalyticsPosts(hours){
  const ids = new Set(newsAnalyticsChannels().map(c=>c.id));
  const cutoff = hours ? Date.now() - hours*3600*1000 : 0;
  return POSTS_CACHE.filter(p=>{
    if(!ids.has(p.channel_id)) return false;
    if(!hours) return true;
    const t = new Date(p.posted_at || p.scraped_at).getTime();
    return t >= cutoff;
  });
}
export let newsTrendChart, newsSourcesChart, newsTopicsChart;
export let chartDefaultsApplied = false;
export function applyChartDefaultsOnce(){
  if(chartDefaultsApplied || typeof Chart === 'undefined') return;
  Chart.defaults.font.family = "'IRANSansX','Inter',Tahoma,'Segoe UI',system-ui,sans-serif";
  Chart.defaults.color = '#5b6472';
  Chart.defaults.plugins.tooltip.backgroundColor = '#16202a';
  Chart.defaults.plugins.tooltip.titleColor = '#fff';
  Chart.defaults.plugins.tooltip.bodyColor = 'rgba(255,255,255,0.85)';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.displayColors = false;
  Chart.defaults.plugins.tooltip.rtl = true;
  // ارقام فارسی روی محورها و راهنمای نمودارها (Chart.js عددها رو با Intl و همین locale قالب می‌زنه)
  Chart.defaults.locale = 'fa-IR';
  Chart.defaults.plugins.tooltip.titleFont = { weight: '700' };
  chartDefaultsApplied = true;
}
// گرادیان افقی برای میله‌های چارت‌های indexAxis:'y' — دقیقاً همون
// گرادیان برند (accent-strong → accent) که قبلاً روی .bar استفاده می‌شد
export function horizontalBarGradient(from, to){
  return (context)=>{
    const { ctx, chartArea } = context.chart;
    if(!chartArea) return from;
    const g = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
    g.addColorStop(0, to); g.addColorStop(1, from);
    return g;
  };
}
// پالت ۶رنگه‌ی هم‌خانواده با برند برای نمودار دونات موضوعات پرتکرار
export const TOPIC_DONUT_COLORS = ['#b5651d', '#EAB393', '#16202a', '#5b6472', '#d98a4f', '#3a4756'];
// ردیف شاخص‌های بالای «در یک نگاه» — امروز = از نیمه‌شب تهران؛ کارت موج‌ها بعد
// از رسیدن نتیجه‌ی موج‌ها (ناهمگام) دوباره پر می‌شه
export function renderNgaKpis(){
  const el = document.getElementById('nga-kpis');
  if(!el) return;
  const todayStartMs = iranTodayStartMs();
  const isToday = p=>new Date(p.posted_at || p.scraped_at).getTime() >= todayStartMs;
  const todayPosts = newsAnalyticsPosts().filter(isToday);
  const activeCh = new Set(todayPosts.map(p=>p.channel_id)).size;
  const allCh = newsAnalyticsChannels().length;
  const claimsToday = POSTS_CACHE.filter(p=>p.platform === 'bale' && isToday(p)).length;
  const waves = WAVE_STATE.loading ? null : (WAVE_STATE.result || []);
  const live = waves ? waves.filter(w=>Date.now() - waveTime(w.last) <= WAVE_LIVE_H * 3600 * 1000).length : 0;
  const now = new Date();
  const weekday = now.toLocaleDateString('fa-IR', { weekday:'long', timeZone:'Asia/Tehran' });
  const dateTxt = now.toLocaleDateString('fa-IR', { day:'numeric', month:'long', year:'numeric', timeZone:'Asia/Tehran' });
  const aiTxt = NEWS_AI_INSIGHTS ? ('تحلیل هوشمند: ' + newsRelTime(NEWS_AI_INSIGHTS.computed_at)) : 'تحلیل هوشمند هنوز آماده نشده';
  el.innerHTML = `
    <div class="nga-kpi is-date"><span class="k-label">${escHtml(weekday)}</span><span class="k-val">${escHtml(dateTxt)}</span><span class="k-sub">${escHtml(aiTxt)}</span></div>
    <div class="nga-kpi"><span class="k-label">اخبار امروز</span><span class="k-val">${toFaDigits(todayPosts.length)}</span><span class="k-sub">از نیمه‌شب تا الان</span></div>
    <div class="nga-kpi"><span class="k-label">منابع فعال امروز</span><span class="k-val">${toFaDigits(activeCh)} <small>از ${toFaDigits(allCh)}</small></span><span class="k-sub">منبعی که امروز خبر داده</span></div>
    <button type="button" class="nga-kpi${live ? ' is-alert' : ''}" data-scroll-to="news-waves-panel">
      <span class="k-label">موج‌های خبری</span><span class="k-val">${waves ? toFaDigits(waves.length) : '…'}</span>
      <span class="k-sub">${!waves ? 'در حال بررسی…' : live ? toFaDigits(live) + ' موج در حال گسترش' : '۱۲ ساعت اخیر'}</span></button>
    <button type="button" class="nga-kpi" data-news-go="claims"><span class="k-label">ادعا و شایعه امروز</span><span class="k-val">${toFaDigits(claimsToday)}</span><span class="k-sub">مشاهده‌ی همه ←</span></button>`;
}
export function renderNewsAnalytics(){
  renderNewsWaves();
  // معیار محاسبات ۳ ویجت آماری این تب (روند/منابع/ابرکلمات): ۲۴ ساعت
  // اخیر، سمت کلاینت. دو ویجت دیگه («اخبار منتخب»/«موضوعات پرتکرار») از
  // هوش مصنوعی میان و مستقل از این متغیرن — NEWS_AI_INSIGHTS رو
  // می‌خونن که سمت سرور، روی پنجره‌ی ۶ساعته‌ی خودش، روزی ۴ بار
  // (نه هر بار بازکردن این تب) محاسبه شده
  const posts = newsAnalyticsPosts(24);
  const hasChart = typeof Chart !== 'undefined';
  if(hasChart) applyChartDefaultsOnce();
  // Chart.js تنبل‌لود می‌شه؛ بار اول بقیه‌ی ویجت‌ها رندر می‌شن و بعد از
  // رسیدن کتابخونه، کل تب یه‌بار دیگه (این‌بار با نمودارها) رندر می‌شه
  else if(!scriptRequested('vendor/chart.min.js')){
    loadScriptOnce('vendor/chart.min.js').then(ok=>{ if(ok) renderNewsAnalytics(); });
  }

  // اخبار منتخب — تشخیص هوش مصنوعی (نه صرفاً جدیدترین). این خودِ
  // renderNewsAnalytics() هیچی محاسبه نمی‌کنه — فقط آخرین ردیف
  // news_ai_insights (که روزی ۴ بار از GitHub Actions پر می‌شه) رو نشون
  // می‌ده؛ اگه هنوز هیچ تحلیلی اجرا نشده باشه، پیام «هنوز آماده نشده» میاد.
  // headline از سمت هوش مصنوعی میاد (نه اسلایس خام متن پست) — یه جمله‌ی
  // کامل و فارسی (اگه منبع انگلیسی بود، ترجمه‌شده)، نه نصفه‌رهاشده؛ لیبل
  // «دلیل انتخاب» مهر ۱۴۰۵ به خواست کاربر برگشت — به‌صورت برچسب‌های کوتاه (پایین‌تر).
  renderNewsPicks();

  // آمار تولید خبر — امروز (نه ۲۴ ساعت اخیر؛ از نیمه‌شب تقویمی امروز به
  // وقت ایران، صریح — نه ساعت محلی مرورگر) — فقط عدد کل، بدون تفکیک
  // پلتفرم؛ بدون عنوان پنل، عدد توی کادر خودش سمت راست + تاریخ شمسی
  // امروز سمت چپ همون ردیف
  renderNgaKpis();

  // جدیدترین ادعا یا شایعه — ۳ مورد اخیر از تب «ادعاها و شایعات»
  // (platform=bale، همون فیلتری که خودِ تب claims استفاده می‌کنه)، فقط
  // عنوان کافیه؛ posts.title رو collect_bale.py همیشه پر می‌کنه
  const claimsRecentList = document.getElementById('news-claims-recent-list');
  const claimsRecentEmpty = document.getElementById('news-claims-recent-empty');
  const recentClaims = POSTS_CACHE.filter(p=>p.platform==='bale')
    .sort((a,b)=> new Date(b.posted_at||b.scraped_at) - new Date(a.posted_at||a.scraped_at))
    .slice(0,3);
  claimsRecentList.innerHTML = '';
  claimsRecentEmpty.style.display = recentClaims.length ? 'none' : '';
  recentClaims.forEach((p,i)=>{
    const text = p.title || (p.text||'').slice(0,140);
    const el = document.createElement('div'); el.className = 'rank-item';
    el.innerHTML = `<span class="rank-num">${toFaDigits(i+1)}</span>
      <div class="rc"><p>${escHtml(text)}</p>
      <div class="rmeta">${escHtml(chName(p.channel_id))} · ${newsRelTime(p.posted_at||p.scraped_at)}</div></div>`;
    claimsRecentList.appendChild(el);
  });

  if(!hasChart) return; // بارگذاری Chart.js از CDN شکست خورده — بقیه‌ی نمودارها رو رد کن

  // روند حجم اخبار — ۲۴ ساعت اخیر، به تفکیک ساعت
  const hourLabels = [], hourCounts = [];
  for(let i=23;i>=0;i--){
    const d = new Date(); d.setMinutes(0,0,0); d.setHours(d.getHours()-i);
    const next = new Date(d); next.setHours(d.getHours()+1);
    const n = posts.filter(p=>{
      const t = new Date(p.posted_at || p.scraped_at).getTime();
      return t>=d.getTime() && t<next.getTime();
    }).length;
    hourLabels.push(d.toLocaleTimeString('fa-IR', {hour:'2-digit'}));
    hourCounts.push(n);
  }
  if(newsTrendChart) newsTrendChart.destroy();
  newsTrendChart = new Chart(document.getElementById('news-trend-chart'), {
    type: 'line',
    data: { labels: hourLabels, datasets: [{
      data: hourCounts,
      borderColor: '#b5651d',
      borderWidth: 2.5,
      backgroundColor: (context)=>{
        const { ctx, chartArea } = context.chart;
        if(!chartArea) return 'rgba(234,179,147,0.25)';
        const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        g.addColorStop(0, 'rgba(234,179,147,0.5)'); g.addColorStop(1, 'rgba(234,179,147,0.02)');
        return g;
      },
      fill: true, tension: 0.35,
      pointRadius: 2, pointBackgroundColor: '#b5651d', pointBorderColor: '#fff', pointBorderWidth: 1.5,
      pointHoverRadius: 6, pointHoverBackgroundColor: '#b5651d', pointHoverBorderWidth: 2,
    }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display:false } },
      scales: {
        y: { beginAtZero:true, ticks:{ precision:0 }, grid:{ color:'rgba(20,27,36,0.06)' } },
        x: { grid:{ display:false }, ticks:{ maxRotation:0, autoSkip:true, maxTicksLimit:8 } },
      },
    },
  });

  // حجم تولید محتوا به تفکیک منبع — ۲۴ ساعت اخیر، ۸ منبع برتر
  const topSources = topChannelsByCount(posts).slice(0,8);
  if(newsSourcesChart) newsSourcesChart.destroy();
  newsSourcesChart = new Chart(document.getElementById('news-sources-chart'), {
    type: 'bar',
    data: {
      labels: topSources.map(([id])=>{ const ch=chById(Number(id)); return ch ? (ch.title||ch.username) : id; }),
      datasets: [{
        data: topSources.map(([,n])=>n),
        backgroundColor: horizontalBarGradient('#b5651d', '#EAB393'),
        borderRadius: 6, maxBarThickness: 30, barPercentage: 0.65, categoryPercentage: 0.75,
      }],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display:false } },
      scales: {
        x: { beginAtZero:true, ticks:{ precision:0 }, grid:{ color:'rgba(20,27,36,0.06)' } },
        y: { grid:{ display:false } },
      },
    },
  });

  // موضوعات پرتکرار — تشخیص هوش مصنوعی (همون news_ai_insights بالا)؛ دونات
  // چون درباره‌ی «سهم» موضوعات از هم‌دیگه‌ست، نه رتبه‌بندی مطلق
  const topicCounts = (NEWS_AI_INSIGHTS?.topics || []).map(t=>[t.name, t.weight]);
  const topicsBox = document.getElementById('news-topics-chart-box');
  const topicsCanvas = document.getElementById('news-topics-chart');
  const topicsEmpty = document.getElementById('news-topics-empty');
  const topicsUpdatedEl = document.getElementById('news-topics-updated');
  topicsUpdatedEl.textContent = NEWS_AI_INSIGHTS ? ('به‌روزرسانی: ' + newsRelTime(NEWS_AI_INSIGHTS.computed_at)) : '';
  if(newsTopicsChart){ newsTopicsChart.destroy(); newsTopicsChart = null; }
  if(!topicCounts.length){
    topicsBox.style.display = 'none';
    topicsEmpty.style.display = '';
  }else{
    topicsBox.style.display = '';
    topicsEmpty.style.display = 'none';
    newsTopicsChart = new Chart(topicsCanvas, {
      type: 'doughnut',
      data: {
        labels: topicCounts.map(([name])=>name),
        datasets: [{
          data: topicCounts.map(([,n])=>n),
          backgroundColor: TOPIC_DONUT_COLORS.slice(0, topicCounts.length),
          borderColor: '#fff', borderWidth: 2, hoverOffset: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: { legend: { display:true, position:'bottom', rtl:true, labels:{ boxWidth:11, padding:12, font:{ size:12 } } } },
      },
    });
  }
}

export function setupNewsAnalytics(){
  document.getElementById('nga-kpis').addEventListener('click', e=>{
    const b = e.target.closest('[data-scroll-to]');
    if(b) document.getElementById(b.dataset.scrollTo).scrollIntoView({behavior:'smooth'});
  });
  onWavesComputed(renderNgaKpis);
}
