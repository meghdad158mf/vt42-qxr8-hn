// بدنه‌ی برنامه — مرحله‌ی ۳ ماژولار کردن (۵.۳۲.۲): کل اسکریپت قبلی صفحه، حالا یه ES module.
// هسته (تنظیمات، نشست، api، متن/جست‌وجو/تاریخ، اعتبارسنجی، تاریخچه‌ی مرورگر) در core/ جدا شده؛
// بقیه در مرحله‌های بعد به ui/، features/<بخش> و admin/ تقسیم می‌شه (CLAUDE.md، «ماژولار کردن»).
import { SUPABASE_URL, SUPABASE_ANON_KEY, APP_VERSION } from './core/config.js';
import { authToken, currentRole, saveSession, clearSession } from './core/session.js';
import { api, SESSION_EXPIRED, resetSessionExpired } from './core/api.js';
import { setErrorContext } from './core/error-reporting.js';
import { escAttr, escHtml, safeUrl, claimsTextDisplay, toFaDigits, faTitle, faNum, faDigitsToEn, faDigitsToLatin, needsTranslation } from './core/text.js';
import { searchNorm, searchHay } from './core/search.js';
import { JALALI_MONTHS, jalaliToGregorian, jalaliMonthLength, calParts, jalaliMonthStarts, iranTodayStartMs, tehranDayDiff } from './core/date.js';
import { nidValid, normalizeIrMobile } from './core/validate.js';
import { loadScriptOnce, scriptRequested } from './core/load-script.js';
import { navMark, navRestoring, startRouter, restoreScrollY } from './core/router.js';

// ⚠️ پل موقت: دستگیره‌های درون HTML (onclick="…" در صفحه و در HTMLهایی که همین فایل می‌سازه)
// فقط تابع سراسری رو می‌بینن، ولی تابع‌های یه module سراسری نیستن. این فهرست تا جایگزینی همه‌ی
// onclickها با event delegation (مرحله‌های ۴ تا ۷) می‌مونه و هر بار کوچیک‌تر می‌شه؛ تابع تازه
// اینجا اضافه نکن — به‌جاش addEventListener. tests/unit/inline-handlers.test.js هم‌خوانیش رو می‌سنجه.
Object.assign(window, {
  addCrawlSuggestion, addDossierManualPost, addNewsletterManualPost, addPostToPicks, autoMatchDossierTopic,
  bulkChanBack, bulkChanPreview, bulkChanSave, changePassword, clearPostsFocus, closeAdminMenu, closeBulkChan,
  closeChanEditor, closeDeleteChannelModal, closeDocViewer, closeIntro, closeJobLog, closeMediaViewer,
  closeNavMenu, closePwModal, closeUserEditor, copyJobLog, deleteCrawlSite, deleteDossierTopic,
  deleteDossierTopicPost, downloadBackup, downloadNewsletter, dvGo, dvToggleZoom, editDossierTopicKeywords,
  editPostKeywords, exportPosts, exportReport, goToHawzaTab, goToNewsTab, goToPeopleTab, goToPosTab,
  goToUploadsTab, handleLogin, hideHawzaMention, hidePost, ignoreCrawlSuggestion, introGo, logout,
  openBulkChan, openIntro, openSiteSettingsPanel, openUserEditor, openUsersSection, otpBack, otpChooseSms,
  otpResend, otpShow, otpSubmit, publishAnnouncement, publishNewsletter, removeNewsletterDraftItem,
  renderDossierTopicAdminList, renderNewsFeed, renderSystemStatus, retryLoadAll, retryMaintenance,
  saveAlertSettings, saveCrawlSite, saveDossierTopicKeywords, saveHiddenSections, saveMaintenance,
  saveMediaRetention, savePostKeywords, saveSmsConfig, saveUser, saveViewerPasswordLogin, scrollToDomainGrid,
  scrollToPackageCard, scrollToPageTop, searchDossierManualAdd, searchNewsletterManualAdd, sendSmsTest,
  setHawzaTab, setNewsPageTab, setNewsView, setUploadsTab, submitFeedback, subscribeNotify,
  suggestNewsletterSection, switchSection, testAlertEmail, toggleAdminMenu, toggleCrawlSite,
  toggleDossierText, toggleDossierTopicActive, toggleDossierTopicPostExcluded, toggleMobileFilters,
  toggleMoreText, toggleNavMenu, toggleNewsText, togglePasswordVisibility, togglePoliticalFigureText,
  togglePostText, translateMention, translatePost, uiConfirmClose, unhidePost, unlockLogin, usrDownload
});

// خطاهای مرورگر: جای فعلی کاربر و دستگاه برای گزارش (core/error-reporting.js)
setErrorContext({ place: ()=>navCurrentState().key, device: ()=>sysDeviceLabel(navigator.userAgent) });

// ambient dot-field — quiet tactile backdrop, paused under reduced-motion
(function(){
  const cv = document.getElementById('ambient');
  const ctx = cv.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w,h,dpr;
  function size(){
    dpr = Math.min(window.devicePixelRatio||1, 2);
    w = cv.width = innerWidth*dpr; h = cv.height = innerHeight*dpr;
    cv.style.width = innerWidth+'px'; cv.style.height = innerHeight+'px';
  }
  const GAP = 34;
  function draw(t){
    ctx.clearRect(0,0,w,h);
    const cols = Math.ceil(w/(GAP*dpr))+1, rows = Math.ceil(h/(GAP*dpr))+1;
    for(let y=0;y<rows;y++){
      for(let x=0;x<cols;x++){
        const px = x*GAP*dpr, py = y*GAP*dpr;
        const wobble = reduced ? 0 : Math.sin((t||0)/2600 + x*0.5 + y*0.5)*1.2;
        const alt = (x+y)%2===0;
        ctx.beginPath();
        ctx.arc(px, py+wobble*dpr, 1*dpr, 0, Math.PI*2);
        ctx.fillStyle = alt ? 'rgba(58,80,104,0.14)' : 'rgba(181,101,29,0.10)';
        ctx.fill();
      }
    }
  }
  size();
  window.addEventListener('resize', ()=>{ size(); if(reduced) draw(0); });
  if(reduced){ draw(0); }
  else{ requestAnimationFrame(function loop(t){ draw(t); requestAnimationFrame(loop); }); }
})();

const ICONS = {
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="6" width="13" height="12" rx="2"/><path d="M15.5 10l6-3.2v10.4l-6-3.2"/></svg>',
  photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15.5l-5.5-5-6.5 6.5-2.5-2.5-3 3"/></svg>',
  person: '<svg viewBox="0 0 100 100" fill="currentColor"><circle cx="50" cy="34" r="17"/><path d="M16 96c0-24 15-40 34-40s34 16 34 40"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v13M7 11l5 5 5-5"/><path d="M4 20h16"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 4h6v6M20 4l-9 9"/><path d="M9 5H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-4"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 6.5c-1.8-1.3-4.3-2-7-2v13.5c2.7 0 5.2.7 7 2 1.8-1.3 4.3-2 7-2V4.5c-2.7 0-5.2.7-7 2z"/><path d="M12 6.5v13.5"/></svg>',
  graduation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 9l10-5 10 5-10 5-10-5z"/><path d="M6 11.5v4.5c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5"/><path d="M22 9v6"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z"/></svg>',
  audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="2.5" y="13" width="5" height="7" rx="2"/><rect x="16.5" y="13" width="5" height="7" rx="2"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v4M9 22h6"/></svg>',
  interview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.4 0-2.7-.3-3.9-.9L3 20l1-4.9A8.4 8.4 0 0 1 3 11.5 8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z"/></svg>',
  newspaper: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h13v13a3 3 0 0 0 3 3H7a3 3 0 0 1-3-3V4z"/><path d="M17 8h3v9a3 3 0 0 1-3 3"/><path d="M7.5 8h6M7.5 11h6M7.5 14h4"/></svg>',
  userLine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><path d="M2.5 19c0-3.3 2.8-5.6 6.5-5.6s6.5 2.3 6.5 5.6"/><path d="M16 8.2a3 3 0 1 1 1.2 5.7"/><path d="M18 13.6c2.6.6 3.5 2.6 3.5 4.7"/></svg>'
};

const adminLinks = document.getElementById('admin-menu');



// خطای ورود/بارگذاری روی صفحه‌ی ورود؛ withRetry دکمه‌ی «تلاش دوباره» رو هم نشون می‌ده
function showLoginError(msg, withRetry){
  const errEl = document.getElementById('login-error');
  errEl.textContent = msg;
  errEl.style.display = 'block';
  document.getElementById('login-retry-btn').style.display = withRetry ? '' : 'none';
}
// بارگذاری اطلاعات بعد از ورود؛ اگه شکست خورد، به‌جای ماندن بی‌صدا روی صفحه‌ی
// ورود، علتش (نشست منقضی / قطع اتصال) رو می‌گه
async function loadAllAndEnter(){
  resetSessionExpired();
  try{
    await loadAll();
    if(SESSION_EXPIRED) throw new Error('session expired');
    startSitePoll();
    // حالت تعمیر (migration_042): بیننده به‌جای سایت فقط پیام به‌روزرسانی رو می‌بینه
    if(currentRole !== 'app_admin' && maintOn()){ showMaintView(); return true; }
    navRestoring();
    enterDash(lastSectionKey());
    const hashSt = navParse(location.hash);
    if(hashSt) navApply(hashSt);
    navMark();
    setTimeout(refreshAdminAlerts, 2000);
    maybeShowIntro();
    if(document.body.classList.contains('app-loading')){
      // رفرش: اسکرول همون جایی که کاربر بود (بعد از رسیدن محتوا، تا ارتفاع صفحه درست باشه)
      let y = 0;
      try{ y = parseInt(sessionStorage.getItem('jarian_last_scroll'), 10) || 0; }catch(e){}
      if(y) restoreScrollY(y);
      document.body.classList.remove('app-loading');
    }
    return true;
  }catch(e){
    console.error('loadAll failed', e);
    document.body.classList.remove('app-loading');
    goLogin();
    if(SESSION_EXPIRED){
      clearSession();
      showLoginError('نشست شما منقضی شده است؛ لطفاً دوباره وارد شوید.', false);
    }else{
      showLoginError('ورود انجام شد، ولی دریافت اطلاعات از سرور ناموفق بود. اتصال اینترنت را بررسی و دوباره تلاش کنید.', true);
    }
    return false;
  }
}
async function retryLoadAll(){
  const btn = document.getElementById('login-retry-btn');
  btn.disabled = true; btn.textContent = 'در حال تلاش…';
  document.getElementById('login-error').style.display = 'none';
  await loadAllAndEnter();
  btn.disabled = false; btn.textContent = 'تلاش دوباره';
}

// شمارش دقیق و تاریخی (نه محدود به limit صفحه‌بندی‌شده‌ی کش‌های محلی مثل POSTS_CACHE) —
// با هدر count=exact پستگرست، بدون نیاز به دانلود واقعی ردیف‌ها، از Content-Range می‌خونیم
// column پیش‌فرض 'id'ه (همه‌ی جدول‌های اصلی این ستون رو دارن)؛ برای Viewهایی
// که ستون id ندارن (مثل newspaper_unique_slugs، migration_030)، باید صریح
// یه ستون واقعاً موجود پاس داده بشه — وگرنه PostgREST با ۴۰۰ رد می‌کنه.
async function fetchExactCount(path, column){
  try{
    const col = column || 'id';
    const sep = path.includes('?') ? '&' : '?';
    const r = await api(path + sep + 'select=' + col + '&limit=1', { headers: { Prefer: 'count=exact', Range: '0-0' } });
    if(!r.ok) return 0;
    const cr = r.headers.get('content-range');
    if(!cr) return 0;
    const total = cr.split('/')[1];
    return total === '*' ? 0 : (parseInt(total, 10) || 0);
  }catch(e){ return 0; }
}

// برای شمارش «خبرگزاری» توی هرو صفحه‌ی نخست — تعداد عنوان‌های یکتای روزنامه
// (از کل جدول، نه فقط چند روز اخیر مثل NEWSPAPERS نمایشی) رو می‌خواد. یکتاسازی
// با View دیتابیسی newspaper_unique_slugs (migration_030) انجام می‌شه، نه با
// گرفتن کل ستون slug و Set کردنش توی جاوااسکریپت — چون اون روش قبلی به سقف
// «Max Rows» سوپابیس (۱۰۰۰ ردیف واقعی در هر پاسخ، مستقل از limit کلاینت) می‌خورد
// و بعد از رد شدن جدول newspapers از ۱۰۰۰ ردیف، عنوان‌های یکتای جدیدتر از
// شمارش جا می‌موندن. الان فقط *تعداد* رو با همون ترفند Content-Range
// (fetchExactCount، بدون انتقال ردیف‌های واقعی) می‌گیریم — این هیچ‌وقت به آن
// سقف نمی‌خوره.
// «منبع رصد» صفحه‌ی نخست = منابعی که الان رصد می‌شن، هر منبع یک‌بار (خواست کاربر، ۵.۳۰.۰):
// منابع فعال «مدیریت منابع» + روزنامه‌های ۳۰ روز اخیر + سایت‌های خزنده‌ی «درباره حوزه» که در
// «مدیریت منابع» نیستن — RPC monitored_source_counts (migration_049؛ crawl_sites فقط برای مدیر
// خواندنیه). تا migration اجرا نشده: منابع فعال + روزنامه‌های ۳۰ روز اخیر از NEWSPAPERS.
async function fetchMonitoredSourceCount(){
  try{
    const r = await api('/rpc/monitored_source_counts', { method:'POST', body:'{}' });
    if(r.ok){
      const d = await r.json();
      if(d && typeof d.channels === 'number') return d.channels + (+d.newspapers || 0) + (+d.crawl || 0);
    }
  }catch(e){}
  const since = new Date(iranTodayStartMs() - 30 * 864e5).toISOString().slice(0, 10);
  return CHANNELS.filter(c=>c.active !== false).length
    + new Set(NEWSPAPERS.filter(n=>n.edition_date >= since).map(n=>n.slug)).size;
}

async function doLogin(password){
  const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/login', {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if(r.status === 429){
    // قفل موقت ورود (migration_042): ۵ رمز اشتباه در ۱۵ دقیقه از همین اتصال
    const d = await r.json().catch(()=>({}));
    const e = new Error('locked'); e.retryAfter = Number(d.retry_after) || 900; throw e;
  }
  // ۵.۳۱.۰: رمز مشترک بیننده خاموشه (فقط کد ملی + پیامک) مگر مدیر ورود اضطراری رو روشن کرده باشه
  if(r.status === 403) throw new Error('viewer_disabled');
  if(!r.ok) throw new Error('invalid');
  const data = await r.json();
  saveSession(data.token, data.role);
  try{ sessionStorage.removeItem('jarian_user_name'); }catch(e){}
}

// بخشی که کاربر آخرین بار در این زبانه دیده — تا رفرش صفحه به همون‌جا برگرده
// (نه صفحه‌ی نخست). بخش مدیریتی برای بیننده نادیده گرفته می‌شه.
function lastSectionKey(){
  let k = null;
  const fromHash = navParse(location.hash);
  if(fromHash) return fromHash.s;
  try{ k = sessionStorage.getItem('jarian_last_section'); }catch(e){}
  if(!k || !document.getElementById('sec-'+k)) return 'dashboard';
  if(ADMIN_ONLY_SECTIONS.includes(k) && currentRole !== 'app_admin') return 'dashboard';
  return k;
}

function logout(){
  clearSession();
  // «مهم»های بسته‌شده فقط تا ورود بعدی پنهان‌ان — خروج باید اینو هم پاک کنه (قبلاً فقط
  // بستن زبانه پاکش می‌کرد و بعد از خروج/ورود در همون زبانه اطلاعیه‌ی مهم برنمی‌گشت)
  try{ sessionStorage.removeItem('jarian_last_section'); sessionStorage.removeItem('jarian_last_scroll'); sessionStorage.removeItem('jarian_ann_dismissed_s'); sessionStorage.removeItem('jarian_pv_session'); sessionStorage.removeItem('jarian_user_name'); }catch(e){}
  PV_LAST = '';
  clearTimeout(ADMIN_ALERT_TIMER);
  clearInterval(SITE_POLL_TIMER);
  try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){}
  goLogin();
  loadLoginMaintNotice();
}


async function subscribeNotify(){
  const input = document.getElementById('notify-phone');
  const btn = document.getElementById('notify-subscribe-btn');
  const phone = normalizeIrMobile(input.value);
  if(!/^09\d{9}$/.test(phone)){ showToast('شماره موبایل معتبر نیست — مثال: ۰۹۱۲xxxxxxx'); return; }
  btn.disabled = true;
  try{
    const r = await api('/notify_subscribers', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ phone }),
    });
    if(r.ok){
      showToast('ثبت شد — به‌محض انتشار بسته جدید به شما پیامک اطلاع‌رسانی ارسال می‌شود');
      input.value = '';
    }else if(r.status === 409){
      showToast('این شماره قبلاً ثبت شده است');
    }else{
      showToast('ثبت‌نام ناموفق بود — دوباره امتحان کنید');
    }
  }catch(e){
    showToast('خطا در ارتباط با سرور');
  }finally{
    btn.disabled = false;
  }
}

const adminMenuBtn = document.getElementById('admin-menu-btn');
function toggleAdminMenu(){
  const open = adminLinks.classList.toggle('open');
  adminMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function closeAdminMenu(){
  adminLinks.classList.remove('open');
  adminMenuBtn.setAttribute('aria-expanded', 'false');
}
const navMenuEl = document.getElementById('nav-menu');
const navMenuBtn = document.getElementById('nav-menu-btn');
// پررنگ‌کردن جای فعلی کاربر در منو — فقط موقع باز شدن منو حساب می‌شه
function updateNavMenuCurrent(){
  const st = navCurrentState();
  const t = st.t || (st.s === 'hawza' ? 'news' : null);
  const exact = t ? st.s + '/' + t : null;
  let hasExact = false;
  navMenuEl.querySelectorAll('button[data-nav]').forEach(b=>{
    const isExact = b.dataset.nav === exact;
    if(isExact) hasExact = true;
    b.classList.toggle('is-current', isExact);
    b.classList.toggle('is-current-group', b.dataset.nav === st.s);
    b.removeAttribute('aria-current');
  });
  // بخشی که زیرشاخه‌ی منو نداره (صفحه نخست، برنامه مدارس، بسته تحلیلی...) خودش پررنگ می‌شه
  navMenuEl.querySelectorAll('button[data-nav]').forEach(b=>{
    if(b.classList.contains('is-current') || (!hasExact && b.dataset.nav === st.s)){ b.classList.add('is-current'); b.setAttribute('aria-current', 'page'); }
  });
}
function toggleNavMenu(){
  if(!navMenuEl.classList.contains('open')) updateNavMenuCurrent();
  const open = navMenuEl.classList.toggle('open');
  navMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function closeNavMenu(){
  navMenuEl.classList.remove('open');
  navMenuBtn.setAttribute('aria-expanded', 'false');
}
document.addEventListener('click', e=>{
  if(adminLinks.classList.contains('open') && !adminLinks.contains(e.target)) closeAdminMenu();
  if(navMenuEl.classList.contains('open') && !navMenuEl.contains(e.target)) closeNavMenu();
  // دراپ‌داون‌های <details> (انتخاب رسانه‌ها/سمت/تخصص و بازه‌ی زمانی) پیش‌فرض
  // مرورگر فقط با کلیک دوباره روی summary بسته می‌شن — با کلیک بیرونشون هم
  // ببندشون، مثل بقیه‌ی منوهای سفارشی سایت
  document.querySelectorAll('details.news-source-details[open], details.news-daterange-details[open], details.chan-domains-details[open], details.chan-row-domains-details[open]').forEach(d=>{
    if(!d.contains(e.target)) d.removeAttribute('open');
  });
});
document.addEventListener('keydown', e=>{
  if(e.key === 'Escape'){ closeAdminMenu(); closeNavMenu(); }
});

// آکاردئون بخش‌های صفحه‌ی «تنظیمات» — هر بار یه details.settings-accordion
// باز می‌شه، بقیه‌شون بسته می‌شن (تک‌بخش باز، بقیه جمع)
document.querySelectorAll('details.settings-accordion').forEach(d=>{
  d.addEventListener('toggle', ()=>{
    if(!d.open) return;
    document.querySelectorAll('details.settings-accordion').forEach(other=>{
      if(other !== d) other.removeAttribute('open');
    });
  });
});

const ADMIN_ONLY_SECTIONS = ['export','settings','feedback','status','uploads','announce','users','activity'];

function applyRoleUI(){
  const isAdmin = currentRole === 'app_admin';
  adminLinks.style.display = isAdmin ? '' : 'none';
  document.body.classList.toggle('is-admin', isAdmin);
  document.getElementById('magazine-upload-panel').style.display = isAdmin ? '' : 'none';
  document.getElementById('archive-report-upload-panel').style.display = isAdmin ? '' : 'none';
  document.getElementById('school-report-upload-panel').style.display = isAdmin ? '' : 'none';
  const activeSec = document.querySelector('.section.active');
  const activeKey = activeSec && activeSec.id.replace('sec-','');
  if(activeKey && ADMIN_ONLY_SECTIONS.includes(activeKey) && !isAdmin){
    switchSection('dashboard');
  }
}

async function handleLogin(){
  const pwEl = document.getElementById('login-password');
  const errEl = document.getElementById('login-error');
  const btnEl = document.getElementById('login-btn');
  const btnLabelEl = btnEl.querySelector('.login-btn-label');
  errEl.style.display = 'none';
  btnEl.disabled = true;
  btnEl.classList.add('is-loading');
  btnLabelEl.textContent = 'در حال ورود...';
  document.getElementById('login-retry-btn').style.display = 'none';
  try{
    try{
      await doLogin(pwEl.value);
    }catch(e){
      // TypeError یعنی اصلاً به سرور نرسیدیم، نه رمز اشتباه
      showLoginError(e instanceof TypeError ? 'اتصال به سرور برقرار نشد. اتصال اینترنت را بررسی کنید.'
        : e.message === 'locked' ? 'به‌دلیل چند بار وارد کردن رمز اشتباه، ورود از این اتصال موقتاً بسته شده است. حدود ' + faNum(Math.max(1, Math.ceil(e.retryAfter / 60))) + ' دقیقه‌ی دیگر دوباره امتحان کنید.'
        : e.message === 'viewer_disabled' ? 'ورود با رمز مشترک برای بیننده‌ها بسته است. با کد ملی و پیامک وارد شوید.'
        : 'رمز عبور اشتباه است.', false);
      pwEl.focus();
      pwEl.select();
      return;
    }
    applyRoleUI();
    if(await loadAllAndEnter()){ pwEl.value = ''; updateLoginKbHint(); }
  }finally{
    btnEl.disabled = false;
    btnEl.classList.remove('is-loading');
    btnLabelEl.textContent = 'ورود';
  }
}

// ---- ورود با کد ملی + رمز یک‌بارمصرف پیامکی (۵.۳۱.۰، migration_050) ----
// RPCهای otp_request / login_otp با کلید anon (پیش از ورود). کد ملی خام فقط در همین درخواست
// فرستاده می‌شه و در پایگاه داده فقط HMAC‌اش نگه داشته می‌شه؛ اینجا هم در هیچ storage ای نمی‌مونه.
let LOGIN_MODE = 'otp';
const OTP = { id: null, nid: '', method: null, resendAt: 0, timer: null };
document.getElementById('login-mode-switch').addEventListener('click', ()=>setLoginMode(LOGIN_MODE === 'otp' ? 'password' : 'otp'));
function setLoginMode(m){
  LOGIN_MODE = m;
  document.getElementById('otp-form').hidden = m !== 'otp';
  document.getElementById('login-form').hidden = m !== 'password';
  document.getElementById('login-mode-switch').textContent = m === 'otp' ? 'ورود با رمز مشترک' : 'ورود با کد ملی';
  document.getElementById('login-error').style.display = 'none';
  focusLoginPassword();
}
function otpSetBusy(on, label){
  const btn = document.getElementById('otp-btn');
  btn.disabled = on; btn.classList.toggle('is-loading', on);
  btn.querySelector('.login-btn-label').textContent = label;
}
// مرحله‌ها: nid (کد ملی) ← code (کد پیامک‌شده)؛ برای مدیر: nid ← choose ← code یا pass (رمز مدیر)
const OTP_STEPS = ['nid', 'choose', 'pass', 'code'];
function otpStep(){ return OTP_STEPS.find(k=>!document.getElementById('otp-step-' + k).hidden) || 'nid'; }
function otpShow(step){
  OTP_STEPS.forEach(k=>{ document.getElementById('otp-step-' + k).hidden = k !== step; });
  document.getElementById('otp-btn').hidden = step === 'choose';
  document.getElementById('login-error').style.display = 'none';
  otpSetBusy(false, otpBtnLabel());
  const f = { nid:'otp-nid', pass:'otp-pass', code:'otp-code' }[step];
  if(f) document.getElementById(f).focus();
  else document.getElementById('otp-choose-sms').focus();
}
function otpBtnLabel(){ return otpStep() === 'nid' ? 'دریافت کد ورود' : 'ورود'; }
function otpTick(){
  const btn = document.getElementById('otp-resend');
  const left = Math.ceil((OTP.resendAt - Date.now()) / 1000);
  btn.disabled = left > 0;
  btn.textContent = left > 0 ? 'ارسال دوباره تا ' + faNum(left) + ' ثانیه‌ی دیگر' : 'ارسال دوباره‌ی کد';
  if(left <= 0 && OTP.timer){ clearInterval(OTP.timer); OTP.timer = null; }
}
function otpBack(){
  document.getElementById('otp-code').value = '';
  document.getElementById('otp-pass').value = '';
  OTP.id = null; OTP.method = null;
  otpShow('nid');
}
async function otpPost(fn, body){
  const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const d = await r.json().catch(()=>({}));
  return { status: r.status, d: d || {} };
}
function otpWaitText(sec){
  return sec >= 120 ? 'حدود ' + faNum(Math.ceil(sec / 60)) + ' دقیقه‌ی دیگر' : faNum(Math.max(1, sec)) + ' ثانیه‌ی دیگر';
}
async function otpRequestCode(){
  const nid = faDigitsToLatin(document.getElementById('otp-nid').value);
  document.getElementById('login-error').style.display = 'none';
  if(!nidValid(nid)){ showLoginError('کد ملی وارد‌شده معتبر نیست. ۱۰ رقم کد ملی را بدون فاصله وارد کنید.', false); return; }
  otpSetBusy(true, 'در حال ارسال پیامک...');
  try{
    const body = { p_nid: nid };
    if(OTP.method && OTP.nid === nid) body.p_method = OTP.method;
    const { status, d } = await otpPost('otp_request', body);
    if(status === 200 && d.choose){
      // مدیر: پیامکی فرستاده نشده؛ انتخاب روش (بدون موبایل ثبت‌شده فقط رمز)
      OTP.nid = nid;
      document.getElementById('otp-choose-sms').disabled = d.sms === false;
      document.getElementById('otp-choose-sms').title = d.sms === false ? 'برای شما شماره‌ی موبایلی ثبت نشده است' : '';
      otpShow('choose');
      return;
    }
    if(status === 200 && d.otp_id){
      OTP.id = d.otp_id; OTP.nid = nid;
      OTP.resendAt = Date.now() + (Number(d.resend_in) || 60) * 1000;
      document.getElementById('otp-sent').innerHTML = 'کد پیامک‌شده به شماره‌ی <bdi dir="ltr">' + escHtml(toFaDigits(d.phone_hint || '')) + '</bdi> را وارد نمایید.';
      if(OTP.timer) clearInterval(OTP.timer);
      OTP.timer = setInterval(otpTick, 1000); otpTick();
      document.getElementById('otp-code').value = '';
      otpShow('code');
      return;
    }
    const ra = Number(d.retry_after) || 60;
    showLoginError(
      d.code === 'PGRST202' ? 'ورود با کد ملی هنوز راه‌اندازی نشده است. با مدیر سامانه تماس بگیرید.'
      : d.error === 'no_phone' ? 'برای شما شماره‌ی موبایلی ثبت نشده است. با رمز عبور وارد شوید.'
      : d.error === 'not_found' ? 'این کد ملی در سامانه ثبت نشده یا حساب آن غیرفعال است. برای ثبت، با مدیر سامانه تماس بگیرید.'
      : d.error === 'invalid_nid' ? 'کد ملی وارد‌شده معتبر نیست.'
      : d.error === 'wait' ? 'کد قبلی همین حالا فرستاده شده است. ' + otpWaitText(ra) + ' دوباره امتحان کنید.'
      : (d.error === 'ip_limit' || d.error === 'user_limit') ? 'تعداد درخواست کد زیاد بوده است. ' + otpWaitText(ra) + ' دوباره امتحان کنید.'
      : d.error === 'global_limit' ? 'سامانه در این لحظه پیامک‌های زیادی فرستاده است. ' + otpWaitText(ra) + ' دوباره امتحان کنید.'
      : d.error === 'sms_not_configured' ? 'ارسال پیامک هنوز راه‌اندازی نشده است. با مدیر سامانه تماس بگیرید.'
      : 'ارسال کد انجام نشد. چند لحظه‌ی دیگر دوباره امتحان کنید.', false);
  }catch(e){
    showLoginError('اتصال به سرور برقرار نشد. اتصال اینترنت را بررسی کنید.', false);
  }finally{
    if(otpStep() !== 'choose') otpSetBusy(false, otpBtnLabel());
  }
}
async function otpChooseSms(){
  const b = document.getElementById('otp-choose-sms');
  OTP.method = 'sms';
  document.getElementById('otp-nid').value = OTP.nid;
  b.disabled = true; b.textContent = 'در حال ارسال پیامک...';
  try{ await otpRequestCode(); }finally{ b.disabled = false; b.textContent = 'دریافت کد پیامکی'; }
}
function otpResend(){
  if(Date.now() < OTP.resendAt) return;
  document.getElementById('otp-nid').value = OTP.nid;
  otpRequestCode();
}
async function otpVerify(){
  const code = faDigitsToLatin(document.getElementById('otp-code').value);
  document.getElementById('login-error').style.display = 'none';
  if(!/^\d{5}$/.test(code)){ showLoginError('کد ۵ رقمی پیامک‌شده را وارد کنید.', false); return; }
  otpSetBusy(true, 'در حال ورود...');
  try{
    const { status, d } = await otpPost('login_otp', { p_otp_id: OTP.id, p_code: code });
    if(status === 200 && d.token){
      saveSession(d.token, d.role);
      try{ sessionStorage.setItem('jarian_user_name', d.name || ''); }catch(e){}
      if(OTP.timer){ clearInterval(OTP.timer); OTP.timer = null; }
      applyRoleUI();
      if(await loadAllAndEnter()){ OTP.id = null; document.getElementById('otp-nid').value = ''; otpBack(); }
      return;
    }
    showLoginError(
      d.error === 'invalid_code' ? (Number(d.left) > 0 ? 'کد اشتباه است. ' + faNum(d.left) + ' بار دیگر می‌توانید امتحان کنید.' : 'کد اشتباه است و دیگر اعتبار ندارد. کد تازه بگیرید.')
      : d.error === 'expired' ? 'این کد دیگر اعتبار ندارد (منقضی شده یا چند بار اشتباه وارد شده است). کد تازه بگیرید.'
      : d.error === 'locked' ? 'به‌دلیل چند بار ورود ناموفق، ورود از این اتصال موقتاً بسته شده است. حدود ' + faNum(Math.max(1, Math.ceil((Number(d.retry_after) || 900) / 60))) + ' دقیقه‌ی دیگر دوباره امتحان کنید.'
      : d.error === 'inactive' ? 'حساب شما غیرفعال است. با مدیر سامانه تماس بگیرید.'
      : 'ورود انجام نشد. دوباره امتحان کنید.', false);
    const codeEl = document.getElementById('otp-code'); codeEl.focus(); codeEl.select();
  }catch(e){
    showLoginError('اتصال به سرور برقرار نشد. اتصال اینترنت را بررسی کنید.', false);
  }finally{
    otpSetBusy(false, otpBtnLabel());
  }
}
// ورود مدیر با کد ملی + رمز مدیر (login_admin، migration_051)
async function otpPassLogin(){
  const pwEl = document.getElementById('otp-pass');
  document.getElementById('login-error').style.display = 'none';
  if(!pwEl.value){ showLoginError('رمز عبور را وارد کنید.', false); pwEl.focus(); return; }
  otpSetBusy(true, 'در حال ورود...');
  try{
    const { status, d } = await otpPost('login_admin', { p_nid: OTP.nid, p_password: pwEl.value });
    if(status === 200 && d.token){
      saveSession(d.token, d.role);
      try{ sessionStorage.setItem('jarian_user_name', d.name || ''); }catch(e){}
      applyRoleUI();
      if(await loadAllAndEnter()){ document.getElementById('otp-nid').value = ''; otpBack(); }
      return;
    }
    showLoginError(
      d.error === 'locked' ? 'به‌دلیل چند بار ورود ناموفق، ورود از این اتصال موقتاً بسته شده است. حدود ' + faNum(Math.max(1, Math.ceil((Number(d.retry_after) || 900) / 60))) + ' دقیقه‌ی دیگر دوباره امتحان کنید.'
      : d.code === 'PGRST202' ? 'ورود با رمز هنوز راه‌اندازی نشده است (migration_051).'
      : 'رمز عبور اشتباه است.', false);
    pwEl.focus(); pwEl.select();
  }catch(e){
    showLoginError('اتصال به سرور برقرار نشد. اتصال اینترنت را بررسی کنید.', false);
  }finally{
    otpSetBusy(false, otpBtnLabel());
  }
}
function otpSubmit(){
  const st = otpStep();
  return st === 'code' ? otpVerify() : st === 'pass' ? otpPassLogin() : st === 'nid' ? otpRequestCode() : null;
}

function togglePasswordVisibility(){
  const pwEl = document.getElementById('login-password');
  const btn = document.getElementById('login-pw-toggle');
  const show = pwEl.type === 'password';
  pwEl.type = show ? 'text' : 'password';
  btn.setAttribute('aria-label', show ? 'پنهان‌کردن رمز عبور' : 'نمایش رمز عبور');
}

// هشدار صفحه‌کلید (۵.۲۰.۰): رایج‌ترین علت «رمز اشتباه» صفحه‌کلید فارسی یا Caps Lock روشنه
function updateLoginKbHint(e){
  const pwEl = document.getElementById('login-password');
  const hint = document.getElementById('login-kb-hint');
  if(!pwEl || !hint) return;
  if(e && typeof e.getModifierState === 'function') LOGIN_CAPS = e.getModifierState('CapsLock');
  const msgs = [];
  if(/[\u0600-\u06FF]/.test(pwEl.value)) msgs.push('صفحه‌کلید روی فارسی است؛ اگر رمز انگلیسی است، زبان صفحه‌کلید را عوض کنید.');
  if(LOGIN_CAPS) msgs.push('Caps Lock روشن است.');
  hint.textContent = msgs.join(' ');
  hint.hidden = !msgs.length;
}
let LOGIN_CAPS = false;
(function(){
  const pwEl = document.getElementById('login-password');
  ['keydown','keyup'].forEach(ev=>pwEl.addEventListener(ev, updateLoginKbHint));
  pwEl.addEventListener('input', ()=>updateLoginKbHint());
  pwEl.addEventListener('blur', ()=>{ LOGIN_CAPS = false; updateLoginKbHint(); });
})();
// روی رایانه مکان‌نما از اول توی کادر رمز باشه (روی گوشی نه، تا صفحه‌کلید ناخواسته باز نشه)
function focusLoginPassword(){
  const id = LOGIN_MODE === 'password' ? 'login-password'
    : ({ code:'otp-code', pass:'otp-pass', choose:'otp-choose-sms' }[otpStep()] || 'otp-nid');
  try{ if(window.matchMedia('(pointer:fine)').matches) document.getElementById(id).focus({ preventScroll:true }); }catch(e){}
}

let INTRO_STEP = 0;
function introRender(){
  document.querySelectorAll('#intro-modal .intro-step').forEach(el=>{ el.hidden = Number(el.dataset.step) !== INTRO_STEP; });
  document.querySelectorAll('#intro-modal .intro-dots span').forEach((d, i)=>d.classList.toggle('on', i === INTRO_STEP));
  document.getElementById('intro-prev').style.visibility = INTRO_STEP ? 'visible' : 'hidden';
  document.getElementById('intro-next').textContent = INTRO_STEP === 2 ? 'رفتن به «در یک نگاه»' : 'بعدی';
}
function introGo(d){
  if(INTRO_STEP === 2 && d > 0){
    // بستن پنجره یه history.back() می‌زنه (ورودی «modal» دکمه‌ی برگشت)؛ رفتن به تب باید بعد از
    // اون popstate باشه، وگرنه برگشت دوباره صفحه‌ی قبلی رو برمی‌گردونه
    let done = false; const go = ()=>{ if(done) return; done = true; goToNewsTab('analytics'); };
    window.addEventListener('popstate', ()=>setTimeout(go, 0), { once:true });
    closeIntro(); setTimeout(go, 600);
    return;
  }
  INTRO_STEP = Math.max(0, Math.min(2, INTRO_STEP + d));
  introRender();
}
function openIntro(){ INTRO_STEP = 0; introRender(); document.getElementById('intro-modal').classList.add('active'); }
function closeIntro(){
  document.getElementById('intro-modal').classList.remove('active');
  try{ localStorage.setItem('jarian_intro_seen', '1'); }catch(e){}
}
// بار اول بیننده در این مرورگر (مدیر سایت رو می‌شناسه) — نه وقتی پنجره‌ی دیگری بازه
function maybeShowIntro(){
  if(currentRole === 'app_admin') return;
  try{ if(localStorage.getItem('jarian_intro_seen')) return; }catch(e){ return; }
  setTimeout(()=>{ if(!document.querySelector('.modal-overlay.active') && document.getElementById('view-dash').classList.contains('active')) openIntro(); }, 900);
}

let PENDING_DELETE_CHANNEL = null;
function openDeleteChannelModal(ch){
  PENDING_DELETE_CHANNEL = ch;
  document.getElementById('delete-channel-name').textContent = ch.title || ch.username;
  document.getElementById('delete-channel-modal').classList.add('active');
}
function closeDeleteChannelModal(){
  PENDING_DELETE_CHANNEL = null;
  document.getElementById('delete-channel-modal').classList.remove('active');
}
document.getElementById('confirm-delete-channel-btn').addEventListener('click', async ()=>{
  if(!PENDING_DELETE_CHANNEL) return;
  const ch = PENDING_DELETE_CHANNEL;
  closeDeleteChannelModal();
  await api('/channels?id=eq.'+ch.id, {method:'DELETE'});
  await loadChannels(); await loadPosts();
  renderChanList(); renderCatGrid(); renderChannelCards(); populatePostFilters(); populateExportFilters(); renderNewsFeed(); renderPosts(); renderCyberPeopleGrid();
});

function show(id){ document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); document.getElementById(id).classList.add('active'); }
function goLogin(){ document.documentElement.classList.remove('has-session'); show('view-login'); focusLoginPassword(); }
function enterDash(sectionKey){
  if(!authToken){ goLogin(); return; }
  show('view-dash'); document.getElementById('view-dash').classList.add('active'); switchSection(sectionKey);
}

const TITLES = {
  dashboard: 'صفحه نخست',
  posts: 'کنشگری مجازی',
  analytics: 'آنالیز',
  channels: 'کانال‌ها و افراد',
  overview: 'اخبار و رویدادها',
  schools: 'برنامه مدارس',
  people: 'یادداشت‌ها',
  hawza: 'درباره حوزه',
  reports: 'بسته تحلیلی جریان',
  export: 'خروجی محتوا',
  settings: 'تنظیمات بخش‌ها',
  feedback: 'نظرات کاربران',
  status: 'وضعیت سامانه',
  uploads: 'بارگذاری محتوا',
  announce: 'درج اطلاعیه',
  users: 'کاربران',
  activity: 'گزارش فعالیت',
  positions: 'مواضع مراجع و علماء',
  public: 'درباره مردم',
  laws: 'قوانین و مصوبات',
  ask: 'از جریان بپرس',
};

function switchSection(key){
  navMark();
  if(key === 'feedback'){ key = 'users'; setTimeout(()=>document.getElementById('usr-feedback-panel').scrollIntoView({ block:'start' }), 400); } // بخش قدیمی، حالا قسمت دوم «کاربران»
  if(viewerHidden(key)) key = 'dashboard'; // بخش پنهان از بیننده‌ها (تنظیمات بخش‌ها ← نمایش سایت)
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.getElementById('sec-'+key).classList.add('active');
  document.getElementById('sec-title').textContent = TITLES[key];
  try{ sessionStorage.setItem('jarian_last_section', key); }catch(e){}
  // چون بخش‌ها با toggle کلاس روی همون صفحه‌ی بلندِ اسکرول‌شونده عوض
  // می‌شن (نه ناوبری واقعی)، بدون این خط اسکرول قبلی (مثلاً از وسط
  // صفحه‌ی نخست، جایی که کارت‌های عرصه‌های رصد هستن) روی بخش جدید هم
  // می‌مونه و کاربر وسط/پایین بخش جدید فرود میاد، نه بالای اون
  window.scrollTo(0, 0);
  // فید اخبار رسمی اولین‌بار موقع loadAll() ساخته می‌شه، وقتی بخش هنوز
  // display:none‌ه — یعنی clientHeight/scrollHeight برای همه صفر حساب
  // می‌شه و دکمه‌ی «نمایش بیشتر» غلط مخفی می‌مونه. با ری‌رندر همین‌جا (که
  // بخش دیگه واقعاً دیده می‌شه) اندازه‌گیری سرریز درست انجام می‌شه.
  // پنل مشترک ممکنه الان توی «درباره حوزه» باشه — تب فعلی دوباره اعمال می‌شه تا
  // پنل و newsState.platform به «اخبار و رویدادها» برگردن
  if(key === 'overview'){ setNewsPageTab(NEWS_CURRENT_TAB); renderNewsFeed(); renderNewsAnalytics(); }
  if(key === 'hawza') setHawzaTab(HAWZA_TAB);
  if(key === 'posts'){ renderPosts(); renderCyberPeopleGrid(); }
  if(key === 'users') renderUsersSection();
  if(key === 'status'){ renderSystemStatus(); ackAdminAlerts(); }
  if(key === 'uploads') setUploadsTab(UPLOADS_TAB);
  if(key === 'announce') renderAnnAdmin();
  if(key === 'activity') setActTab(ACT_TAB);
  if(key === 'settings'){ renderBackupPanel(); renderSiteSettingsAdmin(); renderSmsPanel(); loadCrawlSites(); if(currentRole === 'app_admin') loadCrawlSuggestions(); }
  if(key === 'posts') restoreLastTab('posts-page-tabs', 'posts-tab', 'jarian_last_posts_tab');
  if(key === 'people') placePfPanel('people'); // ظرف گالری ممکنه الان توی «مواضع مراجع و علماء» باشه
  if(key === 'people') restoreLastTab('people-page-tabs', 'people-tab', 'jarian_last_people_tab');
  if(key === 'people') syncPeopleTab();
  if(key === 'positions') setPosTab(POS_TAB);
  if(key === 'laws') openLaws();
  if(key === 'posts' || key === 'people') ensureVisibleTab(key);
  // بخش تازه دیده‌شده — خط هلویی تب‌هاش بدون انیمیشن سر جاش قرار بگیره
  requestAnimationFrame(()=>document.querySelectorAll('#sec-'+key+' .news-page-tabs').forEach(bar=>updateTabInk(bar, true)));
  peekTabBar(key);
}

// میان‌برهای کارت‌های صفحه‌ی نخست به زیربخش‌های خودِ همون صفحه
function goToNewsTab(tab){
  if(tab === 'hawza'){ goToHawzaTab('news'); return; } // تب قدیمی، حالا بخش «درباره حوزه»
  switchSection('overview');
  setNewsPageTab(tab);
}
function goToHawzaTab(tab){
  if(HAWZA_TAB_INFO[tab]){ HAWZA_TAB = tab; lsSet('jarian_last_hawza_tab', tab); }
  switchSection('hawza'); // خودش تب HAWZA_TAB رو باز می‌کنه
}
function goToPostsTab(tab){
  switchSection('posts');
  const tabBtn = document.querySelector('#posts-page-tabs button[data-posts-tab="'+tab+'"]');
  if(tabBtn) tabBtn.click();
}
function goToPeopleTab(tab){
  switchSection('people');
  const tabBtn = document.querySelector('#people-page-tabs button[data-people-tab="'+tab+'"]');
  if(tabBtn) tabBtn.click();
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
const POSTS_TAB_INFO = {
  feed: 'پست‌های منتشرشده‌ی کانال‌های کنشگر فضای مجازی، قابل‌فیلتر بر اساس کانال، دسته و زمان.',
  people: 'فهرست کانال‌های کنشگر به‌همراه صاحب کانال، تعداد مخاطب و سطح فعالیت هرکدام.'
};
const PEOPLE_TAB_INFO = {
  orgs: 'مطالب و تحلیل‌های منتشرشده‌ی سازمان‌ها و نهادها؛ برای دیدن مطالب، سازمان موردنظر را انتخاب کنید.',
  figures: 'یادداشت‌ها و مطالب کانال‌های معرفی‌شده به‌عنوان چهره‌ی سیاسی.',
  thinktanks: 'گزارش‌ها و یادداشت‌های اندیشکده‌ها و پژوهشگاه‌ها؛ برای دیدن مطالب، اندیشکده‌ی موردنظر را انتخاب کنید.',
  archive: 'تولیدات تحلیلی سایر نهادها، جدا از بسته‌های تحلیلی خودِ جریان.'
};

// ---- تب‌بارها (همه‌ی بخش‌ها): آیکون، خط هلویی لغزان، سایه‌ی لبه‌ی گوشی، رفتن
// تب فعال به دید و یادآوری آخرین تب. آیکون از data-ic.
const TAB_ICONS = {
  analytics: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  claims: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/>',
  study: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/>',
  website: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18 14 14 0 010-18z"/>',
  newspapers: '<path d="M4 5h13v14H6a2 2 0 01-2-2V5z"/><path d="M17 9h3v8a2 2 0 01-2 2M8 9h5M8 13h5"/>',
  dossier: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>',
  newsletter: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  feed: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><rect x="7" y="6" width="10" height="6" rx="1"/><path d="M7 15.5h10M7 18h6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M21.5 20a6.5 6.5 0 00-4-6"/>',
  orgs: '<path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6M9 11h.01M15 11h.01"/>',
  figures: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
  archive: '<path d="M3 20h18M5 20V5h3v15M9 20V8h3v12"/><path d="M13.6 8.6l2.9-.8 3.4 11.6-2.9.8z"/>',
  hawza: '<path d="M4 21V11a8 8 0 0116 0v10M4 21h16M12 3v2M9 21v-5a3 3 0 016 0v5"/>',
  about: '<path d="M5 4h14a2 2 0 012 2v9a2 2 0 01-2 2h-7l-5 4v-4H5a2 2 0 01-2-2V6a2 2 0 012-2z"/><path d="M8.5 9h2v2c0 1.3-.7 2.1-2 2.4M13.5 9h2v2c0 1.3-.7 2.1-2 2.4"/>',
  notify: '<path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 003.4 0"/>',
  feedback: '<path d="M21 11.5a8.4 8.4 0 01-1.2 4.4L21 20l-4.3-1.1a8.5 8.5 0 114.3-7.4z"/>',
  // ۵.۲۸.۰: تب‌های عرصه‌های تازه
  leader: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  maraji: '<path d="M12 6.5C10.3 5 7.8 4.5 4 4.5v13c3.8 0 6.3.5 8 2 1.7-1.5 4.2-2 8-2v-13c-3.8 0-6.3.5-8 2z"/><path d="M12 6.5v13"/>',
  imams: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3M8 21h8"/>',
  thinktank: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/>',
  trends: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8M7.5 12l2-2.2 1.8 1.6 2.2-2.6"/>',
  mood: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
};
function lsGet(k, def){ try{ const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; }catch(e){ return def; } }
function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

function updateTabInk(bar, noAnim){
  const ink = bar.querySelector('.tab-ink'), origin = bar.querySelector('.tab-ink-origin');
  const act = bar.querySelector('button.active');
  if(!ink || !origin || !bar.offsetParent) return;          // بخش مخفیه — با switchSection دوباره
  if(!act){ ink.style.width = '0'; return; }
  const first = ink.dataset.placed !== '1';
  if(first || noAnim) ink.classList.add('no-anim');
  const a = act.getBoundingClientRect(), o = origin.getBoundingClientRect();
  const inset = 10;
  ink.style.width = Math.max(0, a.width - inset*2) + 'px';
  ink.style.transform = `translateX(${a.left - o.left + inset}px)`;
  ink.dataset.placed = '1';
  if(ink.classList.contains('no-anim')) requestAnimationFrame(()=>requestAnimationFrame(()=>ink.classList.remove('no-anim')));
  // گوشی: اگه تب فعال بیرون نوار باشه، نوار خودش اسکرول می‌کنه تا دیده بشه
  if(bar.scrollWidth > bar.clientWidth + 2){
    const b = bar.getBoundingClientRect();
    if(a.left < b.left + 8 || a.right > b.right - 8){
      const cur = bar.scrollLeft, delta = (a.left + a.width/2) - (b.left + b.width/2);
      bar.scrollTo({ left: cur + delta, behavior: (first || noAnim) ? 'auto' : 'smooth' });
    }
  }
  updateTabFade(bar);
}
// سایه‌ی محو لبه‌های نوار روی گوشی، فقط سمتی که تب دیگه‌ای پشتش هست (RTL: شروع = راست)
function updateTabFade(bar){
  const max = bar.scrollWidth - bar.clientWidth;
  const pos = Math.abs(bar.scrollLeft);
  const hasStart = max > 2 && pos > 2, hasEnd = max > 2 && pos < max - 2;
  // محو کمی پهن‌تر از دکمه‌ی فلش تا متن تب زیرش نره
  bar.style.setProperty('--fs', hasStart ? '44px' : '0px');
  bar.style.setProperty('--fe', hasEnd ? '44px' : '0px');
  const wrap = bar.parentElement;
  if(wrap && wrap.classList.contains('tab-bar-wrap')){
    wrap.classList.toggle('has-start', hasStart);
    wrap.classList.toggle('has-end', hasEnd);
  }
}
function updateStuckTabBars(){
  document.querySelectorAll('.section.active .news-page-tabs').forEach(bar=>{
    bar.classList.toggle('is-stuck', window.scrollY > 0 && bar.getBoundingClientRect().top <= 0.5);
  });
}
function refreshAllTabBars(noAnim){
  document.querySelectorAll('.news-page-tabs').forEach(bar=>updateTabInk(bar, noAnim));
}
function setupTabBars(){
  document.querySelectorAll('.news-page-tabs').forEach(bar=>{
    if(bar.dataset.tabsReady) return;
    bar.dataset.tabsReady = '1';
    bar.querySelectorAll('button').forEach(b=>{
      const ic = TAB_ICONS[b.dataset.ic];
      if(ic) b.insertAdjacentHTML('afterbegin', `<svg class="tab-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ic}</svg>`);
      // تغییر کلاس active (از هر هندلری) → خط هلویی به تب جدید سُر می‌خوره
      new MutationObserver(()=>updateTabInk(bar)).observe(b, { attributes:true, attributeFilter:['class'] });
    });
    bar.insertAdjacentHTML('beforeend', '<span class="tab-ink" aria-hidden="true"></span><span class="tab-ink-origin" aria-hidden="true" style="position:absolute;left:0;top:0;width:0;height:0"></span>');
    bar.addEventListener('scroll', ()=>updateTabFade(bar), { passive:true });
    // فلش‌های گوشی: «پایان» (چپ، تب‌های بعدی) و «شروع» (راست)؛ هر بار ~۷۰٪ عرض نوار
    const wrap = document.createElement('div');
    wrap.className = 'tab-bar-wrap';
    bar.parentNode.insertBefore(wrap, bar);
    wrap.appendChild(bar);
    wrap.insertAdjacentHTML('beforeend',
      '<button type="button" class="tab-arrow end" aria-label="تب‌های بعدی"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>' +
      '<button type="button" class="tab-arrow start" aria-label="تب‌های قبلی"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>');
    wrap.querySelectorAll('.tab-arrow').forEach(a=>a.addEventListener('click', ()=>{
      const step = bar.clientWidth * 0.7 * (a.classList.contains('end') ? -1 : 1);   // RTL: به چپ = scrollLeft منفی‌تر
      bar.scrollBy({ left: step, behavior: 'smooth' });
    }));
  });
  window.addEventListener('resize', ()=>refreshAllTabBars(true));
  window.addEventListener('scroll', updateStuckTabBars, { passive:true });
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>refreshAllTabBars(true));
}

// «کنشگری مجازی» و «یادداشت‌ها»: آخرین تب باز‌شده با ورود ساده به بخش برمی‌گرده
function restoreLastTab(barId, dataKey, storeKey){
  const want = lsGet(storeKey, null);
  const bar = document.getElementById(barId);
  if(!want || !bar) return;
  const btn = bar.querySelector(`button[data-${dataKey}="${want}"]`);
  if(btn && !btn.disabled && !btn.classList.contains('active')) btn.click();
}
setupTabBars();

// پنل مشترک «شبکه‌های اجتماعی/وب‌سایت‌ها/ادعاها» که «اخبار حوزه» (بخش «درباره
// حوزه») هم ازش استفاده می‌کنه — جابه‌جایی خودِ عنصر، نه کپی
const NEWS_TABS = ['analytics','claims','study','website','newspapers','dossier','newsletter'];
let NEWS_CURRENT_TAB = (t=>NEWS_TABS.includes(t) ? t : 'analytics')(lsGet('jarian_last_news_tab', 'analytics'));
let NEWS_STUDY_HOME = null;
function placeNewsStudyPanel(where){
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
function activateNewsStudy(platform){
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
// «درباره حوزه» دو تب داره: «اخبار حوزه» (پنل مشترک اخبار) و «آنچه درباره حوزه
// گفته می‌شود» (خزنده، hawza_mentions — ۵.۲۳.۰)
const HAWZA_TAB_INFO = {
  news: 'اخبار سیاسی و اجتماعی منتشرشده در پایگاه‌های خبری حوزوی.',
  about: 'خبرهای سایت‌های خبری و پست‌های کانال‌های ایتا، تلگرام و بله که درباره‌ی حوزه، روحانیت، مراجع تقلید و طلاب هستند؛ هر ۳ ساعت به‌صورت خودکار جست‌وجو می‌شوند.',
};
let HAWZA_TAB = (t=>HAWZA_TAB_INFO[t] ? t : 'news')(lsGet('jarian_last_hawza_tab', 'news'));
function setHawzaTab(tab){
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

// ---- «مواضع مراجع و علماء» (۵.۲۸.۰، مدار دوم) ----
// پنج تب؛ هر تب = گالری لوگو + فید منبع با همون ظرف «یادداشت‌ها» (pfMode = 'pos-<تب>')؛
// عضویت منبع: channels.show_in_positions + positions_tab (migration_047)
var POS_TAB_INFO = {
  leader: 'بیانات، پیام‌ها و مواضع رهبر معظم انقلاب.',
  maraji: 'مواضع و بیانیه‌های مراجع تقلید و علمای طراز اول در برابر مسائل روز.',
  hawza: 'مواضع رسمی حوزه‌های علمیه در برابر مسائل خاص (بیشتر از سوی مدیر حوزه)؛ این تب خبر نیست، فقط موضع رسمی.',
  imams: 'خطبه‌ها و مواضع ائمه جمعه.',
  orgs: 'مواضع و بیانیه‌های تشکل‌ها و نخبگان حوزوی.',
};
var POS_TAB_LABEL = { leader:'رهبر انقلاب', maraji:'مراجع و علماء', hawza:'حوزه‌های علمیه', imams:'ائمه جمعه', orgs:'تشکل‌ها و نخبگان' };
var POS_TAB = (t=>POS_TAB_INFO[t] ? t : 'leader')(lsGet('jarian_last_pos_tab', 'leader'));
function setPosTab(tab){
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
function goToPosTab(tab){
  if(POS_TAB_INFO[tab]){ POS_TAB = tab; lsSet('jarian_last_pos_tab', tab); }
  switchSection('positions'); // خودش تب POS_TAB رو باز می‌کنه
}
document.getElementById('positions-page-tabs').addEventListener('click', e=>{
  const b = e.target.closest('button[data-pos-tab]'); if(!b) return;
  if(viewerHidden('positions/' + b.dataset.posTab)) return;
  setPosTab(b.dataset.posTab);
});
// ظرف گالری/فید «یادداشت‌ها» (people-tab-figures) بین «یادداشت‌ها» و «مواضع» جابه‌جا می‌شه
// — خودِ عنصر، مثل placeNewsStudyPanel
var PF_PANEL_HOME = null;
function placePfPanel(where){
  const panel = document.getElementById('people-tab-figures');
  if(!panel) return;
  if(!PF_PANEL_HOME){
    PF_PANEL_HOME = document.createComment('pf-panel-home');
    panel.parentNode.insertBefore(PF_PANEL_HOME, panel);
  }
  if(where === 'positions'){
    const slot = document.getElementById('positions-pf-slot');
    if(panel.parentNode !== slot) slot.appendChild(panel);
    panel.style.display = '';
  }else if(PF_PANEL_HOME.nextSibling !== panel){
    PF_PANEL_HOME.parentNode.insertBefore(panel, PF_PANEL_HOME.nextSibling);
  }
}
// برگشت به «یادداشت‌ها»: حالت گالری (pfMode) و نمایش ظرف با تب فعال همون بخش هم‌سو بشه
function syncPeopleTab(){
  const b = document.querySelector('#people-page-tabs button.active');
  const t = b ? b.dataset.peopleTab : 'figures';
  const pfTab = ['orgs','figures','thinktanks'].includes(t);
  document.getElementById('people-tab-figures').style.display = pfTab ? '' : 'none';
  document.getElementById('people-tab-archive').style.display = t === 'archive' ? '' : 'none';
  if(pfTab && pfMode !== t) setPfMode(t);
}

// ---- «قوانین و مصوبات» (۵.۲۸.۰، مدار دوم) ----
// بدون تب: یک فید از منابع show_in_laws با فیلتر «مرجع صادرکننده» (channels.laws_source).
// داده فقط با باز شدن بخش (کوئری اختصاصی، نه POSTS_CACHE — منابع کم‌تکرارن) و ۱۰ دقیقه کش.
var LAWS_SOURCES = ['حوزه علمیه خراسان', 'دولت', 'مجلس', 'قوه قضاییه', 'شوراهای عالی', 'استان خراسان رضوی', 'سایر'];
var LAWS_POSTS = null, LAWS_AT = 0, LAWS_KEY = '', LAWS_LOADING = null;
var LAWS_STATE = { q:'', time:'', src:'', page:1, key:'' };
function lawsChannels(){ return CHANNELS.filter(c=>c.show_in_laws); }
function lawsSourceOf(ch){ return (ch && String(ch.laws_source || '').trim()) || 'سایر'; }
async function loadLawsPosts(force){
  const ids = lawsChannels().map(c=>c.id).sort((a,b)=>a-b);
  const key = ids.join(',');
  if(!force && LAWS_POSTS && key === LAWS_KEY && Date.now() - LAWS_AT < 600000) return;
  if(!ids.length){ LAWS_POSTS = []; LAWS_KEY = key; LAWS_AT = Date.now(); return; }
  if(LAWS_LOADING) return LAWS_LOADING;
  LAWS_LOADING = (async()=>{
    try{
      const r = await api('/posts?select=*&channel_id=in.(' + key + ')&order=scraped_at.desc&limit=600');
      if(r.ok){ LAWS_POSTS = (await r.json()).filter(p=>!p.hidden_at); LAWS_KEY = key; LAWS_AT = Date.now(); }
      else if(!LAWS_POSTS) LAWS_POSTS = [];
    }catch(e){ if(!LAWS_POSTS) LAWS_POSTS = []; }
    finally{ LAWS_LOADING = null; }
  })();
  return LAWS_LOADING;
}
async function openLaws(){
  renderLaws();
  await loadLawsPosts();
  renderLaws();
}
function goLawsPage(p){
  LAWS_STATE.page = p;
  renderLaws();
  scrollToListTop(document.querySelector('#sec-laws .laws-filters'));
}
function renderLaws(){
  const feed = document.getElementById('laws-feed'), empty = document.getElementById('laws-empty');
  if(!feed) return;
  const chans = lawsChannels();
  const byId = new Map(chans.map(c=>[c.id, c]));
  const counts = {};
  chans.forEach(c=>{ const s = lawsSourceOf(c); counts[s] = (counts[s] || 0) + 1; });
  const srcs = LAWS_SOURCES.filter(s=>counts[s]).concat(Object.keys(counts).filter(s=>!LAWS_SOURCES.includes(s)));
  if(LAWS_STATE.src && !counts[LAWS_STATE.src]) LAWS_STATE.src = '';
  const chips = document.getElementById('laws-source-chips');
  chips.style.display = srcs.length > 1 ? '' : 'none';
  chips.innerHTML = [`<button type="button" class="news-topic-chip${LAWS_STATE.src ? '' : ' active'}" data-src="">همه</button>`]
    .concat(srcs.map(s=>`<button type="button" class="news-topic-chip${LAWS_STATE.src === s ? ' active' : ''}" data-src="${escAttr(s)}">${escHtml(s)}</button>`)).join('');
  if(LAWS_POSTS === null){
    feed.innerHTML = '';
    empty.textContent = 'در حال بارگذاری…'; empty.style.display = 'block';
    renderPagination('laws-pagination', 1, 1, goLawsPage);
    return;
  }
  const q = searchNorm(LAWS_STATE.q);
  const filtered = LAWS_POSTS.filter(p=>{
    const ch = byId.get(p.channel_id); if(!ch) return false;
    if(HIDDEN_POST_IDS.has(p.id)) return false;
    if(!secRelevant(p)) return false; // فقط مصوبه/موضع رسمی به تشخیص هوش مصنوعی (۵.۲۹.۰)
    if(LAWS_STATE.src && lawsSourceOf(ch) !== LAWS_STATE.src) return false;
    if(!matchesTime(p.scraped_at, LAWS_STATE.time)) return false;
    if(q && !searchHay(p).includes(q)) return false;
    return true;
  });
  const key = [LAWS_STATE.q, LAWS_STATE.time, LAWS_STATE.src].join('|');
  if(key !== LAWS_STATE.key){ LAWS_STATE.key = key; LAWS_STATE.page = 1; }
  const pages = Math.max(1, Math.ceil(filtered.length / NEWS_PAGE_SIZE));
  if(LAWS_STATE.page > pages) LAWS_STATE.page = pages;
  const list = filtered.slice((LAWS_STATE.page - 1) * NEWS_PAGE_SIZE, LAWS_STATE.page * NEWS_PAGE_SIZE);
  renderPagination('laws-pagination', LAWS_STATE.page, pages, goLawsPage);
  if(!filtered.length){
    empty.textContent = !chans.length
      ? (currentRole === 'app_admin' ? 'هنوز منبعی برای این بخش انتخاب نشده است. در «تنظیمات بخش‌ها ← مدیریت منابع»، بخش «قوانین و مصوبات» را برای منابع موردنظر تیک بزنید.' : 'هنوز مطلبی در این بخش منتشر نشده است.')
      : !LAWS_POSTS.length ? 'هنوز مطلبی از منابع این بخش جمع‌آوری نشده است؛ مطالب با اجرای بعدی جمع‌آوری می‌رسند.'
      : !LAWS_POSTS.some(secRelevant) ? 'هنوز مصوبه یا موضع رسمی تازه‌ای ثبت نشده است.'
      : 'مطلبی با این فیلتر پیدا نشد.';
    const note = secPendingNote(LAWS_POSTS);
    if(note) empty.textContent += ' ' + note;
    empty.style.display = 'block';
  }else{
    const note = secPendingNote(LAWS_POSTS);
    empty.textContent = note; empty.style.display = note ? 'block' : 'none';
  }
  const admin = currentRole === 'app_admin';
  feed.innerHTML = list.map(p=>{
    const ch = byId.get(p.channel_id) || {};
    const hasThumb = !!p.media_path && p.media_type === 'photo';
    return `
    <div class="news-card laws-card">
      ${hasThumb ? `<div class="news-thumb"><img src="${escAttr(p.media_path)}" alt="" loading="lazy" data-viewer-kind="image" data-viewer-src="${escAttr(p.media_path)}" /></div>` : ''}
      <div class="news-body">
        <div class="news-head">
          <span class="news-source">${escHtml(ch.title || ch.username || '؟')}</span>
          <span class="news-platform">${NEWS_PLATFORM_ICON[ch.platform] || ''}${NEWS_PLATFORM_LABEL[ch.platform] || ch.platform || ''}</span>
          <span class="news-time">${newsRelTime(p.posted_at || p.scraped_at)}</span>
        </div>
        ${p.title ? `<h4 class="news-title" dir="auto">${escHtml(p.title)}</h4>` : ''}
        <p class="news-text" id="lw-post-text-${p.id}">${claimsTextDisplay(p.text)}</p>
        <button class="news-more" onclick="toggleMoreText('lw', ${p.id})" id="lw-post-more-${p.id}">
          نمایش بیشتر
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="news-foot">
          <div><span class="news-topic">${escHtml(lawsSourceOf(ch))}</span></div>
          <div>${p.link ? `<a class="news-link" href="${safeUrl(p.link)}" target="_blank" rel="noopener">مشاهده‌ی منبع ↗</a>` : ''}</div>
        </div>
        ${admin ? `<div class="post-admin-row">${postHideBtnHtml(p)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  wireMediaViewerClicks(feed);
  updateMoreButtons('lw', list);
  if(document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(()=>updateMoreButtons('lw', list));
}
// «نمایش بیشتر» عمومی برای فیدهای تازه (پیشوند id جدا تا با فیدهای دیگر تصادم نکند)
function updateMoreButtons(prefix, list){
  list.forEach(p=>{
    const t = document.getElementById(prefix + '-post-text-' + p.id), b = document.getElementById(prefix + '-post-more-' + p.id);
    if(t && b) b.style.display = t.scrollHeight > t.clientHeight + 1 ? '' : 'none';
  });
}
function toggleMoreText(prefix, id){
  const t = document.getElementById(prefix + '-post-text-' + id), b = document.getElementById(prefix + '-post-more-' + id);
  if(!t || !b) return;
  const open = t.classList.toggle('expanded');
  b.classList.toggle('open', open);
  b.firstChild.textContent = open ? 'بستن ' : 'نمایش بیشتر ';
}
document.getElementById('laws-search').addEventListener('input', e=>{ LAWS_STATE.q = e.target.value; renderLaws(); });
document.getElementById('laws-time-seg').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b || b.dataset.t === undefined) return;
  document.querySelectorAll('#laws-time-seg > button').forEach(x=>x.classList.toggle('active', x === b));
  LAWS_STATE.time = b.dataset.t; renderLaws();
});
document.getElementById('laws-source-chips').addEventListener('click', e=>{
  const b = e.target.closest('[data-src]'); if(!b) return;
  LAWS_STATE.src = b.dataset.src; renderLaws();
});

// ---- مدار دوم صفحه‌ی نخست: سوراخ‌های mask پشت کارت‌های دیده‌شده ----
// کارت‌ها وسط‌چین‌اند (فاصله‌ی مراکز ۱۸۶px)؛ با کارت پنهان/«به‌زودی» (بیننده) جای
// سوراخ‌ها از نو حساب می‌شه تا قوس پشت جای خالی بریده دیده نشه
function layoutOrbit2(){
  const grid = document.querySelector('.domain-grid-2');
  if(!grid) return;
  const cards = [...grid.querySelectorAll('.domain-card')].filter(c=>getComputedStyle(c).display !== 'none');
  grid.classList.toggle('is-empty', !cards.length);
  const g = document.getElementById('dom-orbit2-holes');
  if(!g) return;
  const n = cards.length;
  g.innerHTML = cards.map((c, i)=>`<circle cx="${(i - (n - 1) / 2) * 186}" cy="74" r="58" fill="url(#dom-orbit2-hole)"/>`).join('');
}

// ---- «آنچه درباره حوزه گفته می‌شود» (خزنده، ۵.۲۳.۰) ----
// داده: hawza_mentions (scripts/crawl_hawza.py، migration_041). فقط با باز شدن
// همین تب گرفته می‌شه (نه در loadAll) و تا ۱۰ دقیقه کش می‌مونه.
let HAB_ROWS = null, HAB_LOADED_AT = 0, HAB_LOADING = null, HAB_ERROR = '';
const HAB_STATE = { q:'', time:'', kind:'', scope:'', site:'', page:1 };
// کلید منبع در فیلتر: سایت = دامنه، پست شبکه‌ی اجتماعی = نام کانال
const habSourceKey = x => x.kind === 'social' ? 'ch:' + (x.site_name || x.site) : x.site;
const HAB_PAGE_SIZE = 12;
// همون عبارت‌های TERMS در scripts/crawl_hawza.py — فقط برای پررنگ کردن در گزیده‌ی
// متن؛ با تغییر فهرست خزنده، این هم هم‌سو بشه. [\s‌]+ = فاصله یا نیم‌فاصله
const HAB_HL_RX = (()=>{
  const pats = ['حوزه(?:[\\s\\u200c]+(?:ی|های|ها)|\\u200c(?:ی|های|ها))?[\\s\\u200c]+علمیه', 'حوزوی(?:ان|ها)?', 'طلاب', 'طلبه(?:[\\s\\u200c]*(?:ها|ای))?',
    'روحانیت', 'روحانیون', 'مراجع(?:[\\s\\u200c]+عظام)?(?:[\\s\\u200c]+تقلید)?', 'مرجع[\\s\\u200c]+تقلید', 'جامعه[\\s\\u200c]+مدرسین',
    'شورای[\\s\\u200c]+عالی[\\s\\u200c]+حوزه(?:[\\s\\u200c]*(?:های|ها))?', 'مدارس[\\s\\u200c]+علمیه', 'مدرسه(?:[\\s\\u200c]*ی)?[\\s\\u200c]+علمیه', 'معممین', 'عمامه'];
  return new RegExp('(?<![\\p{L}\\p{N}])(?:' + pats.join('|').replace(/ی/g, '[یي]').replace(/ک/g, '[کك]') + ')(?![\\p{L}\\p{N}])', 'gu');
})();
function habHighlight(text){
  return escHtml(text).replace(HAB_HL_RX, m=>`<mark class="hab-hl">${m}</mark>`);
}
async function loadHawzaMentions(force){
  if(!force && HAB_ROWS && Date.now() - HAB_LOADED_AT < 600000) return;
  if(HAB_LOADING) return HAB_LOADING;
  HAB_LOADING = (async()=>{
    try{
      const r = await api('/hawza_mentions?select=id,url,site,site_name,title,excerpt,kind,matched_terms,hits,in_title,published_at,scraped_at,hidden_at&order=scraped_at.desc&limit=600');
      if(!r.ok){
        HAB_ERROR = (r.status === 404 || r.status === 400) ? 'missing' : 'error';
        HAB_ROWS = HAB_ROWS || [];
        return;
      }
      HAB_ERROR = '';
      HAB_ROWS = (await r.json()).filter(x=>!x.hidden_at);
      HAB_LOADED_AT = Date.now();
    }catch(e){
      HAB_ERROR = 'error'; HAB_ROWS = HAB_ROWS || [];
    }finally{ HAB_LOADING = null; }
  })();
  return HAB_LOADING;
}
function habTime(x){ return x.published_at || x.scraped_at; }
async function openHawzaAbout(){
  if(!HAB_ROWS) document.getElementById('hab-feed').innerHTML = '<p class="hab-loading">در حال دریافت خبرها…</p>';
  await loadHawzaMentions();
  populateHabSites();
  renderHawzaAbout();
}
function populateHabSites(){
  const sel = document.getElementById('hab-site');
  const counts = {};
  (HAB_ROWS || []).filter(x=>!HAB_STATE.kind || (HAB_STATE.kind === 'social') === (x.kind === 'social')).forEach(x=>{
    const k = habSourceKey(x);
    counts[k] = counts[k] || { name: (x.site_name || x.site) + (x.kind === 'social' ? ' (' + (NEWS_PLATFORM_LABEL[x.site] || x.site) + ')' : ''), n:0 };
    counts[k].n++;
  });
  const opts = Object.entries(counts).sort((a,b)=>b[1].n - a[1].n);
  sel.innerHTML = '<option value="">همه‌ی منابع</option>' + opts.map(([k,v])=>`<option value="${escAttr(k)}">${escHtml(v.name)} (${toFaDigits(v.n)})</option>`).join('');
  sel.value = counts[HAB_STATE.site] ? HAB_STATE.site : '';
  HAB_STATE.site = sel.value;
}
function filteredHawzaMentions(){
  const terms = HAB_STATE.q.split(/[,،]/).map(searchNorm).filter(Boolean);
  return (HAB_ROWS || []).filter(x=>{
    if(HAB_STATE.kind && (HAB_STATE.kind === 'social') !== (x.kind === 'social')) return false;
    if(HAB_STATE.site && habSourceKey(x) !== HAB_STATE.site) return false;
    if(HAB_STATE.scope === 'title' && !x.in_title) return false;
    if(HAB_STATE.time){
      const d = tehranDayDiff(habTime(x));
      if(HAB_STATE.time === 'today' && d !== 0) return false;
      if(HAB_STATE.time === 'yesterday' && d !== 1) return false;
      if(HAB_STATE.time === 'week' && d > 6) return false;
    }
    if(terms.length){
      const hay = searchNorm((x.title || '') + ' ' + (x.excerpt || '') + ' ' + (x.site_name || ''));
      if(!terms.some(t=>hay.includes(t))) return false;
    }
    return true;
  }).sort((a,b)=>String(habTime(b) || '').localeCompare(String(habTime(a) || '')));
}
function renderHawzaAbout(){
  const feed = document.getElementById('hab-feed');
  const empty = document.getElementById('hab-empty');
  const sum = document.getElementById('hab-summary');
  setMobileFilterCount('#hawza-about-panel', (HAB_STATE.time ? 1 : 0) + (HAB_STATE.kind ? 1 : 0) + (HAB_STATE.scope ? 1 : 0) + (HAB_STATE.site ? 1 : 0));
  if(HAB_ERROR === 'missing'){
    feed.innerHTML = ''; sum.textContent = ''; document.getElementById('hab-pagination').innerHTML = '';
    empty.style.display = 'block';
    empty.textContent = currentRole === 'app_admin'
      ? 'جدول این بخش هنوز ساخته نشده است؛ فایل db/migration_041_hawza_crawler.sql را در SQL Editor سوپابیس اجرا کنید.'
      : 'این بخش به‌زودی راه‌اندازی می‌شود.';
    return;
  }
  const list = filteredHawzaMentions();
  const total = (HAB_ROWS || []).length;
  const totalPages = Math.max(1, Math.ceil(list.length / HAB_PAGE_SIZE));
  HAB_STATE.page = Math.min(Math.max(1, HAB_STATE.page), totalPages);
  const page = list.slice((HAB_STATE.page - 1) * HAB_PAGE_SIZE, HAB_STATE.page * HAB_PAGE_SIZE);
  const siteCount = new Set(list.map(habSourceKey)).size;
  sum.textContent = list.length
    ? toFaDigits(list.length) + ' مطلب از ' + toFaDigits(siteCount) + ' منبع' + (list.length !== total ? ' (از ' + toFaDigits(total) + ' مطلب)' : '')
    : '';
  empty.style.display = list.length ? 'none' : 'block';
  empty.textContent = HAB_ERROR === 'error' ? 'دریافت خبرها انجام نشد؛ اتصال اینترنت را بررسی و صفحه را دوباره باز کنید.'
    : total ? 'خبری با این فیلترها پیدا نشد.'
    : 'هنوز خبری پیدا نشده است؛ خزنده هر ۳ ساعت سایت‌های خبری و کانال‌ها را جست‌وجو می‌کند.';
  const isAdmin = currentRole === 'app_admin';
  feed.innerHTML = page.map(x=>{
    const terms = (x.matched_terms || []).slice(0, 4);
    return `
    <article class="news-card hab-card">
      <div class="news-body">
        <div class="news-head">
          <span class="news-source">${escHtml(x.site_name || x.site)}</span>
          ${x.kind === 'social' ? `<span class="news-platform">${NEWS_PLATFORM_ICON[x.site] || ''}${escHtml(NEWS_PLATFORM_LABEL[x.site] || x.site)}</span>` : ''}
          ${x.kind === 'link' ? '<span class="hab-flag is-link" title="این سایت در فهرست منابع خزنده نیست؛ از لینک یک مطلب مرتبط پیدا شد">یافته از لینک</span>' : ''}
          <span class="news-time" title="${escAttr(habTime(x) ? new Date(habTime(x)).toLocaleString('fa-IR', { timeZone:'Asia/Tehran' }) : '')}">${newsRelTime(habTime(x))}</span>
          ${x.in_title ? '<span class="hab-flag">اشاره در تیتر</span>' : ''}
        </div>
        <h3 class="news-title"><a id="hab-title-${Number(x.id)}" dir="auto" href="${safeUrl(x.url)}" target="_blank" rel="noopener">${habHighlight(x.title || '')}</a></h3>
        ${x.excerpt ? `<p class="hab-excerpt" id="hab-ex-${Number(x.id)}" dir="auto">${habHighlight(x.excerpt)}</p>` : ''}
        <div class="news-foot">
          <div class="hab-terms">${terms.map(t=>`<span class="hab-term">${escHtml(t)}</span>`).join('')}</div>
          <div class="hab-foot-acts">
            ${needsTranslation({ title: x.title, text: x.excerpt }) ? `<button type="button" class="news-translate-btn" id="hab-tr-btn-${Number(x.id)}" onclick="translateMention(${Number(x.id)})">ترجمه به فارسی</button>` : ''}
            <a class="news-link" href="${safeUrl(x.url)}" target="_blank" rel="noopener">${x.kind === 'social' ? 'مشاهده‌ی پست ↗' : 'متن کامل در منبع ↗'}</a>
          </div>
        </div>
        ${isAdmin ? `<div class="hab-admin"><button type="button" class="post-hide-btn" onclick="hideHawzaMention(${Number(x.id)})" title="این خبر برای همه‌ی بیننده‌ها پنهان می‌شود (مثلاً اگر واقعاً درباره‌ی حوزه نیست)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c5 0 9 4.5 10 7a13.6 13.6 0 0 1-2.9 3.9M6.6 6.6C4.3 8 2.7 10.1 2 12c1 2.5 5 7 10 7 1.9 0 3.6-.6 5.1-1.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>پنهان کردن</button></div>` : ''}
      </div>
    </article>`;
  }).join('');
  renderPagination('hab-pagination', HAB_STATE.page, totalPages, goHabPage);
}
// ترجمه‌ی خبرهای خارجی (انگلیسی/عربی): فقط تیتر و گزیده — متن کامل ذخیره نمی‌شه.
// ورودی تابع translate فقط شناسه است (mentionId)، مثل aiTranslate پست‌ها
const HAB_TRANSLATION = {};
async function translateMention(id){
  const x = (HAB_ROWS || []).find(r=>r.id === id);
  const btn = document.getElementById('hab-tr-btn-' + id);
  const tEl = document.getElementById('hab-title-' + id);
  const eEl = document.getElementById('hab-ex-' + id);
  if(!x || !btn || !tEl) return;
  const show = tr=>{
    tEl.innerHTML = habHighlight(tr ? (tr.title || x.title) : x.title);
    tEl.classList.toggle('is-translated', !!tr);
    if(eEl){ eEl.innerHTML = habHighlight(tr ? (tr.text || x.excerpt) : x.excerpt); eEl.classList.toggle('is-translated', !!tr); }
    btn.textContent = tr ? 'بازگشت به متن اصلی' : 'ترجمه به فارسی';
  };
  if(tEl.classList.contains('is-translated')){ show(null); return; }
  if(HAB_TRANSLATION[id]){ show(HAB_TRANSLATION[id]); return; }
  btn.textContent = 'در حال ترجمه…';
  btn.disabled = true;
  try{
    const r = await fetch(SUPABASE_URL + '/functions/v1/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ mentionId: id }),
    });
    if(!r.ok) throw new Error('translate failed');
    HAB_TRANSLATION[id] = await r.json();
    show(HAB_TRANSLATION[id]);
  }catch(e){
    btn.textContent = 'ترجمه به فارسی';
    showToast('ترجمه انجام نشد؛ چند لحظه بعد دوباره امتحان کنید.');
  }finally{
    btn.disabled = false;
  }
}
function goHabPage(p){
  HAB_STATE.page = p;
  renderHawzaAbout();
  scrollToListTop(document.querySelector('#hawza-about-panel .news-filters'));
}
async function hideHawzaMention(id){
  if(!await uiConfirm('این خبر برای همه‌ی بیننده‌ها پنهان شود؟\nبرای خبرهایی که خزنده اشتباهی «درباره حوزه» تشخیص داده است.')) return;
  const r = await api('/hawza_mentions?id=eq.' + id, { method:'PATCH', headers:{ Prefer:'return=minimal' }, body: JSON.stringify({ hidden_at: new Date().toISOString() }) });
  if(!r.ok){ showToast('پنهان کردن خبر انجام نشد؛ دوباره امتحان کنید.'); return; }
  HAB_ROWS = (HAB_ROWS || []).filter(x=>x.id !== id);
  populateHabSites();
  renderHawzaAbout();
  showToast('خبر پنهان شد');
}
function setupHawzaAbout(){
  const search = document.getElementById('hab-search');
  let t = null;
  search.addEventListener('input', ()=>{ clearTimeout(t); t = setTimeout(()=>{ HAB_STATE.q = search.value.trim(); HAB_STATE.page = 1; renderHawzaAbout(); }, 200); });
  [['hab-time-seg', 't', 'time'], ['hab-kind-seg', 'k', 'kind'], ['hab-scope-seg', 's', 'scope']].forEach(([id, ds, key])=>{
    document.getElementById(id).addEventListener('click', e=>{
      const b = e.target.closest('button');
      if(!b || b.dataset[ds] === undefined) return;
      document.querySelectorAll('#'+id+' > button').forEach(x=>x.classList.toggle('active', x === b));
      HAB_STATE[key] = b.dataset[ds]; HAB_STATE.page = 1;
      if(key === 'kind') populateHabSites();
      renderHawzaAbout();
    });
  });
  document.getElementById('hab-site').addEventListener('change', e=>{ HAB_STATE.site = e.target.value; HAB_STATE.page = 1; renderHawzaAbout(); });
}
setupHawzaAbout();

function setNewsPageTab(tab){
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

// ---- real data state ----
let CHANNELS = [];    // {id, platform, username, title, type, category_id, active}
let CATEGORIES = [];  // {id, name, color}
let REGIONS = [];     // {id, name}
let PROFILE_GROUPS = []; // {id, name, kind:'figures'|'orgs', sort_order} — گروه‌های گالری «یادداشت‌ها»
let CHANNEL_PROFILE_GROUPS = []; // {id, channel_id, group_id} — عضویت چندگانه‌ی کانال در گروه‌ها
let NEWS_TOPICS = []; // {id, name, keywords, sort_order} — موضوعات جستجوی ذخیره‌شده («اخبار رسمی»)
let DOSSIER_TOPICS = []; // {id, name, keywords, active, sort_order} — موضوعات موقت «پرونده‌های موضوعی»
let DOSSIER_TOPIC_POSTS = []; // {id, topic_id, post_id, source, excluded} — پست‌های منتسب به هر موضوع
let NEWSLETTER_POSTS = []; // {id, section, post_id, sort_order, posts:{...}} — مجموعه‌ی فعلیِ منتشرشده‌ی «خبرنامه مدارس» (بدون آرشیو)؛ posts رکورد کامل پست embedشده‌ست (نه فقط id) چون POSTS_CACHE سقف ۱۰۰۰تایی داره و پست‌های ادعا/شایعه (کمیاب‌تر) زود ازش بیرون می‌افتن — نگاه کن به buildNewsletterPrintHtml
let NEWSLETTER_DRAFT = { claims: [], news: [], dossier: [] }; // پیش‌نویس در‌حال‌ویرایش مدیر (فقط حافظه، تا «انتشار» زده نشه ذخیره نمی‌شه)
let POSTS_CACHE = []; // {id, channel_id, platform, platform_post_id, text, media_type, posted_at, scraped_at, views, forwards, link}
let MAGAZINES = [];   // {id, title, issue_no, publish_date, file_type, files, cover_url, uploaded_at}
let ARCHIVE_REPORTS = [];   // {id, title, source_org, publish_date, file_type, files, cover_url, uploaded_at}
let FEEDBACK_LIST = [];     // {id, name, message, created_at} — فقط با ورود مدیر به تب «نظرات کاربران» لود می‌شه
let NOTIFY_SUBSCRIBERS = []; // {id, phone, created_at, notified_at} — فقط با ورود مدیر به تب «خروجی‌گیری» لود می‌شه
let NEWSPAPERS = [];  // {id, slug, title, edition_date, image_url, media_storage_path, reader_url}
let NEWSPAPER_TODAYS = [];  // زیرمجموعه‌ی NEWSPAPERS مربوط به تاریخ انتخاب‌شده — برای فیلتر بدون rebuild چک‌باکس‌ها
let NEWSPAPER_DATES = [];   // تاریخ‌های موجود (نزولی) که حداقل یه عکس پاک‌نشده دارن
const newspaperState = { selected: [], date: null };  // date=null یعنی جدیدترین تاریخ موجود
let SCHOOL_REPORTS = []; // {id, title, image_url, media_storage_path, sort_order, uploaded_at, file_type, file_name} — گزارش‌های تحلیل Power BI (تصویر/PDF/اکسل)
let NEWS_AI_INSIGHTS = null; // {id, computed_at, window_hours, selected_posts:[{id,headline,score,tags,sources,posts,channel_id,time,link}], topics:[{name,weight}]} — آخرین تحلیل هوش مصنوعی تب «در یک نگاه» (روزی ۴ بار از GitHub Actions، نه هر بار بازکردن تب)

function chById(id){ return CHANNELS.find(c=>c.id===id); }
function chName(id){ const c=chById(id); return c ? (c.title || c.username) : '؟'; }
function chInitials(id){
  const n = chName(id).replace(/^[«»"'”“'`\s]+/,'').trim();
  return n.slice(0,2) || '؟؟';
}
function chAvatar(id){ return `<span class="avatar">${escHtml(chInitials(id))}</span>`; }
function catNameOf(channelId){
  const ch = chById(channelId);
  const cat = ch && CATEGORIES.find(c=>c.id===ch.category_id);
  return cat ? cat.name : '';
}

// ---- اخبار رسمی — بخش مطالعه (فاز ۱) ----
function regionNameOf(id){
  const r = REGIONS.find(x=>x.id===id);
  return r ? r.name : '';
}
const NEWS_PLATFORM_LABEL = { website: 'وب‌سایت', telegram: 'تلگرام', eitaa: 'ایتا', bale: 'بله' };
const NEWS_PLATFORM_ICON = {
  website: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a13 13 0 010 18 13 13 0 010-18z"/></svg>',
  telegram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 3L2 11l6 2m14-10l-4 18-8-6m12-12L8 13"/></svg>',
  eitaa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.4 8.4 0 01-8.9 8.4 8.6 8.6 0 01-3.4-.7L3 20l1-4.8A8.4 8.4 0 1121 11.5z"/></svg>',
  bale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.4 8.4 0 01-8.9 8.4 8.6 8.6 0 01-3.4-.7L3 20l1-4.8A8.4 8.4 0 1121 11.5z"/></svg>',
};
const newsState = { region: '', time: 'all', sources: [], query: '', page: 1, dateFrom: '', dateTo: '', platform: 'social' };

// platform: 'social' = پیام‌رسان‌ها (ایتا/تلگرام)، 'website' = سایت‌های خبری عمومی،
// 'hawza' = سایت‌های خبری اختصاصی حوزه (هم platform=website ولی show_in_hawza=true،
// برای همین از سطل 'website' مستثنا می‌شن تا دوبار نمایش داده نشن)،
// 'claims' = کانال بله «ادعاها و شایعات»
function newsChannels(){
  return CHANNELS.filter(c => {
    if(!c.show_in_news) return false;
    if(newsState.platform === 'website') return c.platform === 'website' && !c.show_in_hawza;
    if(newsState.platform === 'hawza') return c.platform === 'website' && !!c.show_in_hawza;
    if(newsState.platform === 'claims') return c.platform === 'bale';
    return c.platform !== 'website' && c.platform !== 'bale';
  });
}

function newsPosts(){
  const newsChanIds = new Set(newsChannels().map(c=>c.id));
  return POSTS_CACHE.filter(p=>newsChanIds.has(p.channel_id));
}

// صفحه‌ی «وضعیت سامانه» (sec-status، فقط مدیر). همه‌ی بررسی‌ها فقط با باز
// کردن همین صفحه اجرا می‌شن، نه در بارگذاری عادی سایت.
// کارها: زمان آخرین خروجی هر کار از خودِ داده‌ها + نتیجه‌ی واقعی آخرین
// اجرای گیت‌هاب (run-job با action:'status'). آستانه‌ها با تأخیر معمول
// کرون‌های گیت‌هاب (نکته‌ی عملیاتی ۲۰ CLAUDE.md) کمی دست‌بازتر گرفته شدن.
const SYS_STATUS_JOBS = [
  { job:'eitaa', name:'جمع‌آوری ایتا',        path:'/posts?platform=eq.eitaa&select=scraped_at&order=scraped_at.desc&limit=1', col:'scraped_at', exp:'هر ۲ ساعت', warn:5, bad:12 },
  { job:'telegram', name:'جمع‌آوری تلگرام',      path:'/posts?platform=eq.telegram&select=scraped_at&order=scraped_at.desc&limit=1', col:'scraped_at', exp:'هر ۲ ساعت', warn:5, bad:12 },
  { job:'website', name:'جمع‌آوری وب‌سایت‌ها',   path:'/posts?platform=eq.website&select=scraped_at&order=scraped_at.desc&limit=1', col:'scraped_at', exp:'هر ۲ ساعت', warn:5, bad:12 },
  { job:'bale', name:'ادعاها و شایعات (بله)', path:'/posts?platform=eq.bale&select=scraped_at&order=scraped_at.desc&limit=1', col:'scraped_at', exp:'چند بار در روز', warn:12, bad:36 },
  { job:'newspapers', name:'روزنامه‌ها',            path:'/newspapers?select=scraped_at&order=scraped_at.desc&limit=1', col:'scraped_at', exp:'روزانه', warn:30, bad:54 },
  { job:'insights', name:'تحلیل «در یک نگاه»',    path:'/news_ai_insights?select=computed_at&order=computed_at.desc&limit=1', col:'computed_at', exp:'هر ۶ ساعت', warn:10, bad:24 },
  { job:'keywords', name:'کلیدواژه‌ی هوش مصنوعی', path:'/posts?ai_keywords_extracted_at=not.is.null&select=ai_keywords_extracted_at&order=ai_keywords_extracted_at.desc&limit=1', col:'ai_keywords_extracted_at', exp:'هر ۲ ساعت', warn:8, bad:24, extra: sysKeywordQueue },
  // پاک‌سازی خروجی داده‌ای نداره؛ به‌جاش شمار رسانه‌هایی که باید پاک می‌شدن و
  // نشدن (قدیمی‌تر از ۳۰ ساعت، با RETENTION_DAYS=0.5 و اجرای روزی ۲ بار)
  { job:'cleanup', name:'پاک‌سازی رسانه‌های قدیمی', exp:'روزی ۲ بار', custom: sysCleanupCheck },
  // خروجی خزنده = آخرین خبری که خوانده (crawl_seen)، نه آخرین خبر مرتبط — ممکنه چند
  // ساعت خبری درباره‌ی حوزه نباشه و این خرابی نیست (migration_041)
  { job:'hawza', name:'خزنده‌ی «درباره حوزه»', path:'/crawl_seen?select=seen_at&order=seen_at.desc&limit=1', col:'seen_at', exp:'هر ۳ ساعت', warn:7, bad:14 },
];
// تاریخ انقضای توکن‌ها — با ساخت توکن جدید، همین‌جا به‌روز بشه (CLAUDE.md)
const SYS_TOKENS = [
  { name:'نصب خودکار تابع‌های سوپابیس', key:'SUPABASE_ACCESS_TOKEN', where:'گیت‌هاب ← Settings ← Secrets', exp:'2026-12-04' },
  { name:'اجرای دستی کارها', key:'GITHUB_DISPATCH_TOKEN', where:'سوپابیس ← Edge Functions ← Secrets', exp:'2026-12-26' },
];
const SYS_BUCKET_NAMES = { 'post-media':'عکس/فیلم پست‌ها', 'newspaper-covers':'روزنامه‌ها', 'magazines':'مجلات', 'magazine-covers':'جلد مجلات', 'archive-reports':'بسته‌های تحلیلی', 'archive-report-covers':'جلد بسته‌ها', 'channel-avatars':'عکس منابع', 'school-reports':'گزارش مدارس', 'basirat-course-posters':'پوستر بصیرت' };
const STORAGE_LIMIT_MB = 1024;
const faMb = bytes => toFaDigits((bytes/1048576).toFixed(1));

async function sysKeywordQueue(){
  const n = await fetchExactCount('/posts?ai_keywords=is.null&channels.show_in_news=eq.true&channels.platform=neq.bale', 'id,channels!inner(show_in_news,platform)');
  // روند: مقایسه با آخرین شمارشی که حداقل ۱ ساعت قبل ذخیره شده (فقط همین مرورگر)
  let prev = null;
  try{ prev = JSON.parse(localStorage.getItem('jarian_kw_queue') || 'null'); }catch(e){}
  let trend = '';
  if(prev && typeof prev.n === 'number'){
    const d = n - prev.n;
    const since = newsRelTime(new Date(prev.at).toISOString());
    trend = d === 0 ? '؛ بدون تغییر نسبت به ' + since
      : '؛ ' + faNum(Math.abs(d)) + (d > 0 ? ' تا بیشتر' : ' تا کمتر') + ' از ' + since;
  }
  if(!prev || Date.now() - prev.at > 3600000){
    try{ localStorage.setItem('jarian_kw_queue', JSON.stringify({ n, at: Date.now() })); }catch(e){}
  }
  return 'صف بررسی‌نشده: ' + faNum(n) + ' پست' + trend;
}
async function sysCleanupCheck(){
  // مدت نگهداری + ۱۸ ساعت (فاصله‌ی دو پاک‌سازی + حاشیه)؛ پیش‌فرض ۱۲ → ۳۰ ساعت
  const cutoff = new Date(Date.now() - (mediaRetentionHours() + 18)*3600000).toISOString();
  // همون معیار خودِ cleanup_media.py (زمان دانلود فایل، media_fetched_at) — نه زمان
  // جمع‌آوری پست؛ رسانه‌ی بدون media_fetched_at هم هیچ‌وقت پاک نمی‌شه، پس شمرده می‌شه
  const n = await fetchExactCount('/posts?media_storage_path=not.is.null&or=' + encodeURIComponent('(media_fetched_at.lt.' + cutoff + ',media_fetched_at.is.null)'));
  return { cls: n > 50 ? 'bad' : n > 0 ? 'warn' : 'ok', when: n ? 'رسانه‌ی قدیمیِ پاک‌نشده: ' + faNum(n) + ' فایل' : 'رسانه‌ی قدیمیِ پاک‌نشده: ندارد' };
}
async function sysFetchGithubRuns(){
  try{
    const r = await fetch(SUPABASE_URL + '/functions/v1/run-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ action: 'status' }),
    });
    if(!r.ok) return null;
    const data = await r.json();
    SYS_GH_HISTORY = data.history || null; // اجراهای ۳۰ ساعت اخیر برای «برنامه‌ی اجرا»
    return data.runs || null;
  }catch(e){ return null; }
}

// ---- «برنامه‌ی اجرا» (۵.۲۲.۳، خواست کاربر): خط زمانی ۱۲ ساعت گذشته تا ۱۲ ساعت آینده ----
// زمان‌بندی‌ها (UTC) — باید با cron.schedule های db/migration_040_cron_scheduler.sql یکی بمونه
const SYS_SCHEDULES = {
  eitaa: ['0 */2'], telegram: ['15 */2'], website: ['5 */2'], bale: ['30 1,5,7,9,11,13,15,17'],
  newspapers: ['30 0,2,4,6,10'], insights: ['30 4,10,16,22'], keywords: ['30 1-23/2'], cleanup: ['15 6', '15 18'], hawza:['45 2-23/3'],
};
let SYS_GH_HISTORY = null;
function cronHourList(f){
  const out = new Set();
  f.split(',').forEach(part=>{
    const [range, stepS] = part.split('/');
    const step = Number(stepS) || 1;
    let a = 0, b = 23;
    if(range !== '*'){ const [x, y] = range.split('-').map(Number); a = x; b = isNaN(y) ? (stepS ? 23 : x) : y; }
    for(let h = a; h <= b; h += step) out.add(h);
  });
  return [...out];
}
function sysPlannedTimes(job, from, to){
  const times = [];
  const day0 = Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth(), new Date(from).getUTCDate()) - 864e5;
  (SYS_SCHEDULES[job] || []).forEach(expr=>{
    const [m, h] = expr.split(' ');
    for(let d = day0; d <= to + 864e5; d += 864e5){
      cronHourList(h).forEach(hr=>{
        const t = d + hr * 3600e3 + Number(m) * 60e3;
        if(t >= from && t <= to) times.push(t);
      });
    }
  });
  return times.sort((a,b)=>a-b);
}
function sysClock(t){ return new Date(t).toLocaleTimeString('fa-IR', { timeZone:'Asia/Tehran', hour:'2-digit', minute:'2-digit' }); }
// نسخه‌ی انتخاب کاربر: «جدول ساعتی امروز» — ستون = ساعت ۰۰ تا ۲۳ امروزِ تهران (راست به چپ)،
// ردیف = کار، عدد هر خانه = دقیقه‌ی برنامه‌ی اجرا؛ ردیف بالا = تعداد کارهای هم‌ساعت
function sysSlotStatus(job, from, to){
  const planned = sysPlannedTimes(job, from, to);
  const hist = (SYS_GH_HISTORY && SYS_GH_HISTORY[job] || []).map(r => Object.assign({ t: new Date(r.created_at).getTime() }, r));
  const now = Date.now();
  return planned.map((t, i)=>{
    if(t > now) return { t, st:'plan' };
    if(!SYS_GH_HISTORY) return { t, st:'wait' };
    // اجرا شده؟ هر اجرایی از ۵ دقیقه قبل تا برنامه‌ی بعدی (حداکثر ۳ ساعت)
    const until = Math.min(planned[i + 1] || t + 3 * 3600e3, t + 3 * 3600e3, now + 60e3);
    const r = hist.find(x => x.t >= t - 5 * 60e3 && x.t < until);
    if(!r) return { t, st: now - t < 15 * 60e3 ? 'wait' : 'miss' }; // ۱۵ دقیقه‌ی اول هنوز «اجرا نشد» حساب نمی‌شه
    const late = Math.max(0, Math.round((r.t - t) / 60e3));
    const st = r.status !== 'completed' ? 'run' : r.conclusion === 'success' ? (late > 10 ? 'late' : 'ok')
      : (r.conclusion === 'cancelled' || r.conclusion === 'skipped') ? 'skip' : 'bad';
    return { t, st, late, at: r.t };
  });
}
function renderSysTimeline(){
  const el = document.getElementById('sys-timeline');
  if(!el) return;
  const now = Date.now(), TEH = 3.5 * 3600e3;
  const day0 = Math.floor((now + TEH) / 864e5) * 864e5 - TEH; // نیمه‌شب امروزِ تهران
  const curH = Math.floor((now - day0) / 3600e3);
  const ST_LABEL = { plan:'در برنامه', wait:'در انتظار شروع', ok:'انجام شد', late:'انجام شد با تأخیر', run:'در حال اجرا', bad:'ناموفق', skip:'لغو شد', miss:'اجرا نشد' };
  const perHour = Array(24).fill(0);
  let done = 0, due = 0;
  // کارهایی که دقیقاً در همان دقیقه شروع می‌شن (برای نشانه‌ی «هم‌زمان»)
  const allSlots = SYS_STATUS_JOBS.map(j => ({ j, slots: sysSlotStatus(j.job, day0, day0 + 864e5) }));
  const sameMin = {};
  allSlots.forEach(({ j, slots }) => slots.forEach(x => { (sameMin[x.t] = sameMin[x.t] || []).push(j.name); }));
  const rows = allSlots.map(({ j, slots })=>{
    let cells = '';
    for(let h = 0; h < 24; h++){
      const s = slots.find(x => Math.floor((x.t - day0) / 3600e3) === h);
      if(!s){ cells += `<span class="hg-c${h === curH ? ' cur' : ''}" data-h="${h}"></span>`; continue; }
      perHour[h]++;
      if(s.st !== 'plan' && s.st !== 'wait'){ due++; if(s.st === 'ok' || s.st === 'late' || s.st === 'run') done++; }
      const m = new Date(s.t).getUTCMinutes(); // دقیقه در تهران هم همینه (اختلاف ۳:۳۰)
      let tip = j.name + ' — برنامه: ساعت ' + sysClock(s.t) + '، ' + ST_LABEL[s.st];
      if(s.at) tip += ' (شروع ' + sysClock(s.at) + (s.late ? '، ' + faNum(s.late) + ' دقیقه تأخیر' : '') + ')';
      const others = (sameMin[s.t] || []).filter(n => n !== j.name);
      if(others.length) tip += ' — هم‌زمان با: ' + others.join('، ');
      cells += `<span class="hg-c is-slot ${s.st}${others.length ? ' same' : ''}${h === curH ? ' cur' : ''}" data-h="${h}" title="${escAttr(tip)}">${toFaDigits(String(m).padStart(2, '0'))}</span>`;
    }
    return `<span class="hg-n">${escHtml(j.name)}</span>${cells}`;
  }).join('');
  let head = '<span class="hg-n hg-corner">ساعت</span>', load = '<span class="hg-n hg-corner">تعداد کار</span>';
  for(let h = 0; h < 24; h++){
    head += `<span class="hg-h${h === curH ? ' cur' : ''}" data-h="${h}">${toFaDigits(String(h).padStart(2, '0'))}</span>`;
    load += `<span class="hg-load${perHour[h] > 1 ? ' multi' : ''}${h === curH ? ' cur' : ''}" data-h="${h}" title="${perHour[h] ? escAttr(faNum(perHour[h]) + ' کار در ساعت ' + toFaDigits(String(h).padStart(2, '0'))) : ''}">${perHour[h] ? toFaDigits(perHour[h]) : ''}</span>`;
  }
  const sum = !SYS_GH_HISTORY
    ? '<div class="hg-sum">در حال دریافت اجراهای گیت‌هاب…</div>'
    : `<div class="hg-sum${due - done ? ' warn' : ''}">امروز تا این لحظه: ${faNum(done)} از ${faNum(due)} اجرا انجام شد</div>`;
  el.innerHTML = `${sum}<div class="hg-wrap"><div class="hg">${head}${load}${rows}</div></div>
    <div class="hg-leg"><span><i class="hg-c is-slot ok">۰۰</i>انجام شد</span><span><i class="hg-c is-slot late">۰۰</i>با تأخیر بیش از ۱۰ دقیقه</span><span><i class="hg-c is-slot bad">۰۰</i>ناموفق</span><span><i class="hg-c is-slot miss">۰۰</i>اجرا نشد</span><span><i class="hg-c is-slot run">۰۰</i>در حال اجرا</span><span><i class="hg-c is-slot plan">۰۰</i>در برنامه</span><span><i class="hg-c is-slot plan same">۳۰</i>هم‌زمان با کار دیگر (همان دقیقه)</span><span class="hg-leg-note">عدد هر خانه = دقیقه‌ی اجرا؛ ستونی که ماوس رویش است پررنگ می‌شود تا کارهای هم‌ساعت دیده شوند.</span></div>`;
  // پررنگ شدن ستون زیر ماوس/لمس — کارهای هم‌ساعت کنار هم دیده می‌شن
  const grid = el.querySelector('.hg');
  const mark = h => grid.querySelectorAll('[data-h]').forEach(c => c.classList.toggle('col-hi', c.dataset.h === h));
  grid.addEventListener('mouseover', e => { const c = e.target.closest('[data-h]'); if(c) mark(c.dataset.h); });
  grid.addEventListener('mouseleave', () => mark(null));
  grid.addEventListener('click', e => { const c = e.target.closest('[data-h]'); if(c) mark(c.dataset.h); });
  // گوشی: جدول افقی اسکرول می‌خوره — ساعت فعلی بیاد توی دید
  const wrap = el.querySelector('.hg-wrap'), cur = grid.querySelector('.hg-h.cur');
  if(wrap && cur && wrap.scrollWidth > wrap.clientWidth){
    const wr = wrap.getBoundingClientRect(), cr = cur.getBoundingClientRect();
    wrap.scrollLeft += (cr.left + cr.width / 2) - (wr.left + wr.width / 2);
  }
}

function sysGithubLine(run){
  if(!run) return { cls:'', text:'نتیجه‌ی گیت‌هاب: در دسترس نیست' };
  const when = newsRelTime(run.created_at);
  if(run.status !== 'completed'){
    // وضعیت «در حال اجرا»ی API گیت‌هاب گاهی ساعت‌ها دیر به‌روز می‌شه (نکته‌ی ۲۵)
    const fresh = Date.now() - new Date(run.created_at).getTime() < 3600000;
    return { cls:'', text: fresh ? 'گیت‌هاب: در حال اجرا (' + when + ')' : 'گیت‌هاب: آخرین اجرا ' + when };
  }
  if(run.conclusion === 'success') return { cls:'ok', text:'✓ گیت‌هاب: موفق، ' + when };
  if(run.conclusion === 'cancelled' || run.conclusion === 'skipped') return { cls:'', text:'گیت‌هاب: لغوشده، ' + when };
  return { cls:'bad', text:'✗ گیت‌هاب: ناموفق، ' + when };
}

// «سرویس‌های مرتبط»: سه‌تای اول از همین مرورگر چک می‌شن، بقیه از سمت سرور
// (run-job با action:'health') — چون کلید لیارا و توکن گیت‌هاب فقط اونجان و
// مرورگر به‌خاطر CORS نمی‌تونه سایت‌های منبع رو مستقیم چک کنه.
const SYS_SERVICES = [
  { key:'db',       name:'پایگاه داده (سوپابیس)',   use:'همه‌ی مطالب، منابع و تنظیمات سایت', slow:3000, group:'infra' },
  { key:'storage',  name:'فضای فایل (سوپابیس)',     use:'عکس‌ها، روزنامه‌ها، مجلات و فایل‌ها', slow:3000, group:'infra' },
  { key:'functions',name:'تابع‌های سرور (سوپابیس)',  use:'ترجمه، هوش مصنوعی و اجرای دستی کارها', slow:8000, group:'infra' },
  { key:'liara',    name:'هوش مصنوعی لیارا',        use:'ترجمه، کلیدواژه‌ها و تحلیل «در یک نگاه»', slow:8000, group:'proc' },
  { key:'github',   name:'گیت‌هاب (کارهای خودکار)', use:'اجرای زمان‌بندی‌شده‌ی جمع‌آوری و تحلیل‌ها', slow:5000, group:'proc' },
  { key:'eitaa',    name:'ایتا',                    use:'جمع‌آوری پست‌های کانال‌های ایتا', slow:6000, group:'src' },
  { key:'telegram', name:'تلگرام',                  use:'جمع‌آوری پست‌های کانال‌های تلگرام', slow:6000, group:'src' },
  { key:'bale',     name:'بله',                     use:'ادعاها و شایعات (کانال رصد شایعات)', slow:6000, group:'src' },
  { key:'jaaar',    name:'جار (کیوسک روزنامه)',      use:'صفحه‌ی اول روزنامه‌ها', slow:6000, group:'src' },
];
const SYS_SERVICE_GROUPS = [
  { key:'infra', name:'زیرساخت سایت' },
  { key:'proc',  name:'پردازش و کارهای خودکار' },
  { key:'src',   name:'منابع جمع‌آوری' },
];
function sysSvcTime(ms){
  return ms < 1000 ? toFaDigits(String(ms)) + ' میلی‌ثانیه' : toFaDigits((ms/1000).toFixed(1)) + ' ثانیه';
}
async function sysTimed(fn){
  const t0 = performance.now();
  try{
    const r = await fn();
    return { ok: r.ok, status: r.status, ms: Math.round(performance.now() - t0) };
  }catch(e){ return { ok:false, status:0, ms: Math.round(performance.now() - t0), detail: String(e) }; }
}
async function renderSysServices(){
  const el = document.getElementById('sys-services');
  if(!el) return;
  el.innerHTML = sysServicesHtml(null);
  let healthData = null;
  const healthP = sysTimed(()=>fetch(SUPABASE_URL + '/functions/v1/run-job', {
    method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + authToken },
    body: JSON.stringify({ action:'health' }),
  }).then(async r=>{ if(r.ok){ try{ healthData = (await r.json()).services; }catch(e){} } return r; }));
  const [db, storage, fnRes] = await Promise.all([
    sysTimed(()=>api('/categories?select=id&limit=1')),
    // شیء ناموجود: ۴۰۰/۴۰۴ یعنی سرویس فایل جواب داده؛ فقط ۵xx یا قطعی ارتباط خطاست
    sysTimed(()=>fetch(SUPABASE_URL + '/storage/v1/object/public/channel-avatars/__jarian_ping__').then(r=>({ ok: r.status < 500, status: r.status }))),
    healthP,
  ]);
  const results = { db, storage, functions: fnRes };
  if(healthData) Object.assign(results, healthData);
  el.innerHTML = sysServicesHtml(results);
}
// نمای «سرویس‌های مرتبط»: خلاصه‌ی بالا + سه گروه با ردیف‌های فشرده و نوار زمان پاسخ
// (عمداً متفاوت از کارت‌های «کارهای خودکار»). results=null یعنی «در حال بررسی».
function sysServicesHtml(results){
  const rows = SYS_SERVICES.map(s=>{
    if(!results) return { s, cls:'', pill:'…', note:'در حال بررسی', pct:0 };
    const r = results[s.key];
    let cls, pill, note = s.use;
    if(!r){ cls = ''; pill = 'نامعلوم'; note = 'تابع‌های سرور پاسخ ندادند'; }
    else if(!r.ok){
      cls = 'bad';
      pill = r.detail === 'timeout' ? 'بی‌پاسخ' : r.status ? 'خطای ' + toFaDigits(String(r.status)) : 'قطع';
      if(r.detail === 'timeout') note = 'بیش از ۱۲ ثانیه جواب نداد';
    }else{
      cls = r.ms >= s.slow ? 'warn' : 'ok';
      pill = sysSvcTime(r.ms);
    }
    if(s.key === 'github' && r && r.ok && typeof r.remaining === 'number') note += '، سهمیه‌ی باقی‌مانده: ' + faNum(r.remaining);
    // نوار: زمان پاسخ نسبت به ۱.۵ برابر آستانه‌ی کُندی؛ خطا = پر و قرمز
    const pct = !r ? 0 : !r.ok ? 100 : Math.max(4, Math.min(100, r.ms / (s.slow * 1.5) * 100));
    const tip = r && r.detail && r.detail !== 'timeout' ? r.detail : '';
    return { s, cls, pill, note, pct, tip };
  });
  let head;
  if(!results){
    head = '<div class="svc-summary"><span class="svc-summary-num">…</span><span class="svc-summary-text">در حال بررسی سرویس‌ها</span></div>';
  }else{
    const ok = rows.filter(x=>x.cls === 'ok').length, warn = rows.filter(x=>x.cls === 'warn').length, bad = rows.filter(x=>x.cls === 'bad').length;
    const cls = bad ? 'bad' : warn ? 'warn' : ok === rows.length ? 'ok' : '';
    const text = bad ? faNum(bad) + ' سرویس قطع یا دچار خطاست' : warn ? faNum(warn) + ' سرویس کُند پاسخ می‌دهد' : ok === rows.length ? 'همه‌ی سرویس‌ها در دسترس‌اند' : 'وضعیت برخی سرویس‌ها نامعلوم است';
    head = `<div class="svc-summary ${cls}"><span class="svc-summary-num">${faNum(ok)}<small> از ${faNum(rows.length)}</small></span><span class="svc-summary-text">${text}</span></div>`;
  }
  return head + '<div class="svc-groups">' + SYS_SERVICE_GROUPS.map(g=>`<div class="svc-group"><div class="svc-group-title">${g.name}</div>${rows.filter(x=>x.s.group === g.key).map(x=>`<div class="svc-row ${x.cls}"${x.tip ? ` title="${escAttr(x.tip)}"` : ''}><span class="svc-dot"></span><div class="svc-main"><div class="svc-name">${x.s.name}</div><div class="svc-note">${x.note}</div><div class="svc-meter"><span style="width:${x.pct.toFixed(0)}%"></span></div></div><span class="svc-pill">${x.pill}</span></div>`).join('')}</div>`).join('') + '</div>';
}

async function renderSysStorage(){
  const el = document.getElementById('sys-storage');
  el.innerHTML = '<div class="sys-note">در حال بررسی…</div>';
  try{
    const r = await api('/rpc/storage_usage', { method:'POST', body:'{}' });
    if(r.status === 404){ el.innerHTML = '<div class="sys-note">برای نمایش این بخش، فایل <b>db/migration_034_system_status.sql</b> باید یک‌بار در SQL Editor سوپابیس اجرا شود.</div>'; return; }
    if(!r.ok) throw new Error('storage_usage ' + r.status);
    const rows = (await r.json()).sort((a,b)=>b.size_bytes - a.size_bytes);
    const total = rows.reduce((t,x)=>t + Number(x.size_bytes||0), 0);
    SYS_STORAGE = { total, postMedia: Number((rows.find(x=>x.bucket_id === 'post-media') || {}).size_bytes || 0) };
    renderSysRetention();
    const pct = Math.min(100, total / (STORAGE_LIMIT_MB*1048576) * 100);
    const cls = pct >= 85 ? 'bad' : pct >= 65 ? 'warn' : '';
    el.innerHTML = `<div class="sys-storage-head"><span><b>${faMb(total)}</b> از ${faNum(STORAGE_LIMIT_MB)} مگابایت</span><span>${toFaDigits(pct.toFixed(0))}٪</span></div>
      <div class="sys-bar ${cls}"><span style="width:${pct.toFixed(1)}%"></span></div>
      <div class="sys-storage-buckets">${rows.filter(x=>Number(x.file_count)>0).map(x=>`<span>${escHtml(SYS_BUCKET_NAMES[x.bucket_id]||x.bucket_id)}: ${faMb(x.size_bytes)} مگ (${faNum(x.file_count)} فایل)</span>`).join('') || '<span>هیچ فایلی ذخیره نشده</span>'}</div>`;
  }catch(e){
    console.error(e);
    el.innerHTML = '<div class="sys-note">خطا در دریافت حجم فضای ذخیره‌سازی.</div>';
  }
}
// ---- مدت نگهداری عکس/فیلم پست‌ها (۵.۲۵.۰، site_settings.media_retention_hours) ----
// cleanup_media.py همین مقدار رو می‌خونه (روزی ۲ بار). تخمین حجم: حجم post-media تقریباً
// متناسب با بیشترین عمر فایل‌هاست = مدت نگهداری + ۱۲ ساعت فاصله‌ی دو پاک‌سازی.
var RETENTION_OPTIONS = [[12,'۱۲ ساعت'],[24,'۱ روز'],[48,'۲ روز'],[72,'۳ روز']];
const RETENTION_MAX_PCT = 85;
let SYS_STORAGE = null; // {total, postMedia}
function mediaRetentionHours(){
  const h = Number(SITE_SETTINGS.media_retention_hours);
  return RETENTION_OPTIONS.some(([x])=>x === h) ? h : 12;
}
function retentionProjectedPct(h){
  if(!SYS_STORAGE) return null;
  const cur = mediaRetentionHours();
  const pm = SYS_STORAGE.postMedia * (h + 12) / (cur + 12);
  return (SYS_STORAGE.total - SYS_STORAGE.postMedia + pm) / (STORAGE_LIMIT_MB*1048576) * 100;
}
function renderSysRetention(){
  const el = document.getElementById('sys-retention');
  if(!el) return;
  const cur = mediaRetentionHours();
  el.innerHTML = `<div class="sys-ret">
    <label for="sys-ret-sel"><b>مدت نگهداری عکس و فیلم پست‌ها</b><span>قدیمی‌ترها هر روز ساعت ۹:۴۵ و ۲۱:۴۵ پاک می‌شوند؛ متن پست‌ها همیشه می‌ماند.</span></label>
    <div class="sys-ret-ctl">
      <select id="sys-ret-sel">${RETENTION_OPTIONS.map(([h, l])=>{
        const pct = retentionProjectedPct(h);
        const est = pct === null ? '' : ' — حدود ' + toFaDigits(Math.round(pct)) + '٪ فضا' + (pct > RETENTION_MAX_PCT ? ' (بیش از حد مجاز)' : '');
        return `<option value="${h}" ${h === cur ? 'selected' : ''}>${l}${h === cur ? ' (فعلی)' : est}</option>`;
      }).join('')}</select>
      <button type="button" class="btn btn-sm" id="sys-ret-save" onclick="saveMediaRetention()">ذخیره</button>
    </div>
  </div>`;
}
async function saveMediaRetention(){
  const h = Number(document.getElementById('sys-ret-sel').value);
  const cur = mediaRetentionHours();
  if(h === cur){ showToast('مدت نگهداری همان مقدار فعلی است.'); return; }
  const pct = retentionProjectedPct(h);
  if(pct !== null && pct > RETENTION_MAX_PCT){
    showToast('با این مدت، فضای ذخیره‌سازی حدود ' + toFaDigits(Math.round(pct)) + '٪ پر می‌شود و ممکن است سایت قفل شود؛ مدت کوتاه‌تری انتخاب کنید.');
    return;
  }
  const label = (RETENTION_OPTIONS.find(([x])=>x === h) || [0, ''])[1];
  if(!await uiConfirm('تغییر مدت نگهداری رسانه به ' + label + '\n' + (h > cur ? 'از این پس عکس‌ها و فیلم‌ها بیشتر می‌مانند و فضای بیشتری می‌گیرند؛ عکس‌هایی که تا الان پاک شده‌اند برنمی‌گردند.' : 'در اجرای بعدی پاک‌سازی، عکس‌ها و فیلم‌های قدیمی‌تر از ' + label + ' پاک می‌شوند.'))) return;
  const btn = document.getElementById('sys-ret-save');
  btn.disabled = true;
  try{
    await saveSiteSetting('media_retention_hours', h);
    showToast('ذخیره شد؛ از اجرای بعدی پاک‌سازی اعمال می‌شود.');
    renderNewspaperDateTabs();
  }catch(e){
    console.error(e);
    showToast('ذخیره نشد. اتصال اینترنت را بررسی کنید؛ اگر مشکل ماند، migration_043 را در SQL Editor اجرا کنید.');
  }finally{ btn.disabled = false; }
  renderSysRetention();
}

// ---- سابقه‌ی ظرفیت (۵.۲۵.۰، capacity_snapshots — migration_043) ----
const DB_LIMIT_MB = 500;
const CAP_DB_NAMES = { posts:'پست‌ها', hawza:'«درباره حوزه» (خزنده)', logs:'لاگ‌ها و آمار', other:'بقیه (منابع، روزنامه‌ها، تنظیمات…)' };
let CAP_ROWS = null, CAP_KIND = 'storage', CAP_RANGE = 30, CAP_MISSING = false;
function capLimitBytes(kind){ return (kind === 'db' ? DB_LIMIT_MB : STORAGE_LIMIT_MB) * 1048576; }
function capCatName(kind, c){ return kind === 'db' ? (CAP_DB_NAMES[c] || c) : (SYS_BUCKET_NAMES[c] || c); }
function capDayLabel(day){ return new Date(day + 'T12:00:00Z').toLocaleDateString('fa-IR', { timeZone:'Asia/Tehran', day:'numeric', month:'long' }); }
async function renderSysCapacity(){
  const el = document.getElementById('sys-capacity');
  if(!el) return;
  el.innerHTML = '<div class="sys-note">در حال بررسی…</div>';
  try{
    // عکس امروز (اگه pg_cron هنوز نگرفته) — idempotent
    const snap = await api('/rpc/capacity_snapshot', { method:'POST', body:'{}' });
    const since = tehranDateStr(Date.now() - 400*86400000);
    const r = await api('/capacity_snapshots?select=day,kind,category,bytes,files&day=gte.' + since + '&order=day.asc');
    CAP_MISSING = snap.status === 404 || r.status === 404 || r.status === 400;
    if(CAP_MISSING){ el.innerHTML = '<div class="sys-note">برای نمایش این بخش، فایل <b>db/migration_043_capacity_errors.sql</b> باید یک‌بار در SQL Editor سوپابیس اجرا شود.</div>'; return; }
    if(!r.ok) throw new Error('capacity_snapshots ' + r.status);
    CAP_ROWS = await r.json();
    drawSysCapacity();
  }catch(e){
    console.error(e);
    el.innerHTML = '<div class="sys-note">خطا در دریافت سابقه‌ی ظرفیت.</div>';
  }
}
function drawSysCapacity(){
  const el = document.getElementById('sys-capacity');
  const rows = (CAP_ROWS || []).filter(x=>x.kind === CAP_KIND);
  const byDay = new Map();
  rows.forEach(x=>{ if(!byDay.has(x.day)) byDay.set(x.day, {}); byDay.get(x.day)[x.category] = Number(x.bytes) || 0; });
  const days = [...byDay.keys()].sort();
  const total = d => Object.values(byDay.get(d) || {}).reduce((a, b)=>a + b, 0);
  const limit = capLimitBytes(CAP_KIND);
  const toggles = `<div class="sys-cap-tabs">
      <div class="sys-cap-seg">${[['storage','فضای فایل (۱ گیگ)'],['db','پایگاه داده (۵۰۰ مگ)']].map(([k, l])=>`<button type="button" class="usr-chip ${CAP_KIND===k?'active':''}" data-cap-kind="${k}">${l}</button>`).join('')}</div>
      <div class="sys-cap-seg">${[[30,'۳۰ روز'],[365,'۱۲ ماه']].map(([k, l])=>`<button type="button" class="usr-chip ${CAP_RANGE===k?'active':''}" data-cap-range="${k}">${l}</button>`).join('')}</div>
    </div>`;
  if(!days.length){ el.innerHTML = toggles + '<div class="sys-note">هنوز سابقه‌ای ثبت نشده است.</div>'; return; }
  const today = days[days.length - 1];
  const ms = jalaliMonthStarts();
  const firstFrom = from => days.find(d=>d >= from) || null;
  const curStart = firstFrom(ms.cur), prevStart = days.find(d=>d >= ms.prev && d < ms.cur) || null;
  const mb = b => faMb(b) + ' مگ';
  const pct = b => toFaDigits(Math.round(b / limit * 100)) + '٪';
  const tTot = total(today);
  // علامت +/− در متن راست‌به‌چپ جابه‌جا دیده می‌شه — با واژه
  const delta = (a, b) => { const d = a - b; return Math.abs(d) < 52429 ? 'بدون تغییر' : faMb(Math.abs(d)) + ' مگ ' + (d > 0 ? 'افزایش' : 'کاهش'); };
  const tile = (label, val, sub) => `<div class="sys-cap-tile"><span>${label}</span><b>${val}</b><small>${sub}</small></div>`;
  const tiles = [
    tile('امروز', mb(tTot), pct(tTot) + ' از سقف'),
    tile('اول این ماه', curStart ? mb(total(curStart)) : '—', curStart ? capDayLabel(curStart) : 'هنوز ثبت نشده'),
    tile('ماه گذشته', prevStart ? mb(total(prevStart)) : '—', prevStart ? 'از ' + capDayLabel(prevStart) : 'هنوز ثبت نشده'),
    tile('تغییر این ماه', curStart ? delta(tTot, total(curStart)) : '—', curStart ? 'نسبت به ' + capDayLabel(curStart) : 'سابقه از امروز ثبت می‌شود'),
  ].join('');
  // تفکیک دسته‌ها
  const cats = Object.entries(byDay.get(today)).sort((a, b)=>b[1] - a[1]);
  const base = curStart ? byDay.get(curStart) : null;
  const breakdown = cats.map(([c, b])=>{
    const w = tTot ? Math.max(1, b / tTot * 100) : 0;
    const ch = base && base[c] !== undefined ? '<em>این ماه: ' + delta(b, base[c]) + '</em>' : '';
    return `<div class="sys-cap-cat"><span class="sys-cap-cat-name">${escHtml(capCatName(CAP_KIND, c))}</span><span class="sys-cap-cat-bar"><i style="width:${w.toFixed(1)}%"></i></span><span class="sys-cap-cat-val">${mb(b)}${ch}</span></div>`;
  }).join('');
  // روند: ۳۰ روز = هر روز؛ ۱۲ ماه = آخرین عکس هر ماه شمسی
  let points;
  if(CAP_RANGE === 30){
    const from = tehranDateStr(Date.now() - 29*86400000);
    points = days.filter(d=>d >= from).map(d=>({ d, v: total(d), label: capDayLabel(d) }));
  }else{
    const byMonth = new Map();
    days.forEach(d=>{ const p = calParts(new Date(d + 'T12:00:00Z'), 'persian'); byMonth.set(p.year * 100 + p.month, d); });
    points = [...byMonth.values()].slice(-12).map(d=>({ d, v: total(d), label: new Date(d + 'T12:00:00Z').toLocaleDateString('fa-IR', { timeZone:'Asia/Tehran', month:'long' }) }));
  }
  const maxV = Math.max(limit * 0.25, ...points.map(p=>p.v));
  const chart = `<div class="act-days sys-cap-chart">${points.map(p=>`<div class="act-day" title="${escAttr(p.label + ': ' + mb(p.v))}"><i style="height:${Math.max(2, p.v / maxV * 100).toFixed(1)}%"></i></div>`).join('')}</div>
    <div class="act-days-axis"><span>${escHtml(points[0].label)}</span><span>${escHtml(points[points.length - 1].label)}</span></div>`;
  // پیش‌بینی: رشد روزانه‌ی میانگین ۱۴ روز اخیر (حداقل ۷ روز سابقه)
  let proj = '', projCls = '';
  const back = days.filter(d=>d >= tehranDateStr(Date.now() - 14*86400000));
  if(back.length < 7 || days.length < 7){
    proj = 'برای پیش‌بینی، دست‌کم ۷ روز سابقه لازم است (از ' + capDayLabel(days[0]) + ' ثبت می‌شود).';
  }else{
    const first = back[0];
    const span = Math.max(1, (new Date(today) - new Date(first)) / 86400000);
    const perDay = (tTot - total(first)) / span;
    if(perDay <= 1048576 * 0.05){
      proj = 'روند ۱۴ روز اخیر: بدون رشد محسوس؛ با این روند پر نمی‌شود.';
    }else{
      const left = Math.max(0, (limit - tTot) / perDay);
      projCls = left < 30 ? 'bad' : left < 90 ? 'warn' : '';
      const when = left < 60 ? toFaDigits(Math.round(left)) + ' روز' : toFaDigits(Math.round(left / 30)) + ' ماه';
      proj = 'با روند ۱۴ روز اخیر (روزانه حدود ' + faMb(perDay) + ' مگ افزایش)، ' + (CAP_KIND === 'db' ? 'پایگاه داده' : 'فضای فایل') + ' حدود ' + when + ' دیگر پر می‌شود.';
    }
  }
  el.innerHTML = toggles + `<div class="sys-cap-tiles">${tiles}</div>
    <div class="sys-cap-grid"><div><div class="sys-cap-sub">تفکیک امروز</div>${breakdown}</div>
    <div><div class="sys-cap-sub">روند ${CAP_RANGE === 30 ? '۳۰ روز اخیر' : '۱۲ ماه اخیر'}</div>${chart}</div></div>
    <p class="sys-cap-proj ${projCls}">${proj}</p>`;
}
document.getElementById('sys-capacity').addEventListener('click', e=>{
  const k = e.target.closest('[data-cap-kind]'), r = e.target.closest('[data-cap-range]');
  if(k){ CAP_KIND = k.dataset.capKind; drawSysCapacity(); }
  if(r){ CAP_RANGE = Number(r.dataset.capRange); drawSysCapacity(); }
});


// ---- هشدار ایمیلی (۵.۲۷.۰، alert_settings — migration_045، Edge Function notify) ----
let ALERT_SETTINGS = null;
function alertErrHint(err){
  if(!err) return '';
  if(/RESEND_API_KEY/.test(err)) return 'کلید Resend هنوز در سوپابیس تنظیم نشده است (Edge Functions ← Secrets ← RESEND_API_KEY).';
  if(/Resend 403|testing emails|verify a domain/i.test(err)) return 'Resend بدون دامنه‌ی تأییدشده فقط به ایمیلی می‌فرستد که با آن در Resend ثبت‌نام کرده‌اید؛ همان نشانی را اینجا وارد کنید.';
  if(/Resend 401|Resend 400/.test(err)) return 'کلید Resend نامعتبر است؛ کلید تازه بسازید و در سوپابیس جایگزین کنید.';
  return 'خطا در ارسال: ' + err;
}
async function renderSysAlerts(){
  const el = document.getElementById('sys-alerts');
  if(!el) return;
  el.innerHTML = '<div class="sys-note">در حال بررسی…</div>';
  try{
    const r = await api('/alert_settings?id=eq.1&select=*');
    if(r.status === 404 || r.status === 400){ el.innerHTML = '<div class="sys-note">برای فعال شدن این بخش، فایل <b>db/migration_045_email_alerts.sql</b> باید یک‌بار در SQL Editor سوپابیس اجرا شود.</div>'; return; }
    if(!r.ok) throw new Error('alert_settings ' + r.status);
    ALERT_SETTINGS = (await r.json())[0] || { email:'', alerts_on:true, daily_on:true };
    const a = ALERT_SETTINGS;
    const when = t => t ? escHtml(newsRelTime(t)) : 'هنوز نه';
    el.innerHTML = `<div class="sys-alerts-grid">
        <div class="sys-alerts-form">
          <div class="field"><label for="sys-alert-email">نشانی ایمیل گیرنده</label><input type="email" id="sys-alert-email" dir="ltr" value="${escAttr(a.email || '')}" placeholder="name@example.com" autocomplete="email"></div>
          <label class="ce-check"><input type="checkbox" id="sys-alert-on" ${a.alerts_on ? 'checked' : ''}>ایمیل فوری هنگام خرابی <small>(بررسی هر ۳۰ دقیقه؛ یادآوری هر ۱۲ ساعت تا برطرف شود)</small></label>
          <label class="ce-check"><input type="checkbox" id="sys-alert-daily" ${a.daily_on ? 'checked' : ''}>گزارش روزانه <small>(هر روز ساعت ۷:۲۲ صبح، حتی اگر همه‌چیز سالم باشد)</small></label>
          <div class="sys-btn-row"><button type="button" class="btn btn-sm primary" id="sys-alert-save" onclick="saveAlertSettings()">ذخیره</button><button type="button" class="btn btn-sm" id="sys-alert-test" onclick="testAlertEmail()">ارسال ایمیل آزمایشی</button></div>
        </div>
        <div class="sys-alerts-stat">
          <div><span>آخرین بررسی</span><b>${when(a.last_check_at)}</b></div>
          <div><span>آخرین هشدار ارسال‌شده</span><b>${when(a.last_alert_at)}</b></div>
          <div><span>آخرین گزارش روزانه</span><b>${when(a.last_daily_at)}</b></div>
          ${a.last_error ? `<p class="sys-alert-err warn">${escHtml(alertErrHint(a.last_error))}</p>` : ''}
          ${!a.email ? '<p class="sys-note">تا نشانی ایمیل وارد نشود، هیچ ایمیلی فرستاده نمی‌شود.</p>' : ''}
        </div>
      </div>`;
  }catch(e){
    console.error(e);
    el.innerHTML = '<div class="sys-note">خطا در دریافت تنظیمات هشدار ایمیلی.</div>';
  }
}
async function saveAlertSettings(silent){
  const email = document.getElementById('sys-alert-email').value.trim();
  if(email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ showToast('نشانی ایمیل درست نیست؛ مثل name@example.com وارد کنید.'); return false; }
  const body = { email: email || null, alerts_on: document.getElementById('sys-alert-on').checked, daily_on: document.getElementById('sys-alert-daily').checked };
  let r;
  try{ r = await api('/alert_settings?id=eq.1', { method:'PATCH', headers:{ Prefer:'return=minimal' }, body: JSON.stringify(body) }); }
  catch(e){ r = null; }
  if(!r || !r.ok){ showToast('ذخیره نشد؛ اتصال اینترنت را بررسی کنید.'); return false; }
  Object.assign(ALERT_SETTINGS || {}, body);
  if(!silent){ showToast(email ? 'ذخیره شد.' : 'ذخیره شد؛ بدون نشانی ایمیل، چیزی فرستاده نمی‌شود.'); renderSysAlerts(); }
  return true;
}
async function testAlertEmail(){
  const btn = document.getElementById('sys-alert-test');
  if(!document.getElementById('sys-alert-email').value.trim()){ showToast('اول نشانی ایمیل گیرنده را وارد کنید.'); return; }
  btn.disabled = true; btn.textContent = 'در حال ارسال…';
  try{
    if(!await saveAlertSettings(true)) return;
    const r = await fetch(SUPABASE_URL + '/functions/v1/notify', {
      method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + authToken }, body: JSON.stringify({ mode:'test' }),
    });
    const d = await r.json().catch(()=>({}));
    if(r.ok && d.ok) showToast('ایمیل آزمایشی فرستاده شد؛ صندوق ورودی (و پوشه‌ی هرزنامه) را ببینید.');
    else if(r.status === 404) showToast('تابع ارسال هنوز نصب نشده است؛ چند دقیقه بعد از انتشار دوباره امتحان کنید.');
    else showToast(alertErrHint(d.error || ('خطای ' + r.status)));
  }catch(e){
    console.error(e);
    showToast('ارسال ناموفق بود؛ اتصال اینترنت را بررسی کنید.');
  }finally{ renderSysAlerts(); }
}

// ---- خطاهای مرورگر کاربران (۵.۲۵.۰، client_errors — migration_043) ----
async function renderSysClientErrors(){
  const el = document.getElementById('sys-client-errors');
  if(!el) return;
  el.innerHTML = '<div class="sys-note">در حال بررسی…</div>';
  try{
    const r = await api('/client_errors?select=*&day=gte.' + tehranDateStr(Date.now() - 6*86400000) + '&order=last_at.desc&limit=500');
    if(r.status === 404 || r.status === 400){ el.innerHTML = '<div class="sys-note">برای نمایش این بخش، فایل <b>db/migration_043_capacity_errors.sql</b> باید یک‌بار در SQL Editor سوپابیس اجرا شود.</div>'; return; }
    if(!r.ok) throw new Error('client_errors ' + r.status);
    const groups = new Map();
    (await r.json()).forEach(x=>{
      const g = groups.get(x.sig) || { sig:x.sig, message:x.message, sessions:0, last:x.last_at, place:x.place, device:x.device, version:x.version, recent:0 };
      g.sessions += x.sessions;
      if(Date.now() - new Date(x.last_at).getTime() < 86400000) g.recent += x.sessions;
      if(x.last_at > g.last){ g.last = x.last_at; g.place = x.place; g.device = x.device; g.version = x.version; }
      groups.set(x.sig, g);
    });
    const list = [...groups.values()].sort((a, b)=>b.last.localeCompare(a.last));
    if(!list.length){ el.innerHTML = '<div class="sys-note">در ۷ روز اخیر هیچ خطایی در مرورگر کاربران ثبت نشده است.</div>'; return; }
    const placeName = k => {
      if(!k) return '—';
      const [sec, tab] = k.split('/');
      return (TITLES[sec] || sec) + (tab ? ' ← ' + actTabName(sec, tab) : '');
    };
    el.innerHTML = list.slice(0, 30).map(g=>{
      const cls = g.recent >= 3 ? 'warn' : '';
      return `<div class="sys-cerr-row ${cls}">
        <div class="sys-cerr-msg" dir="auto">${escHtml(g.message)}</div>
        <div class="sys-cerr-meta">در ${faNum(g.sessions)} نشست، آخرین بار ${escHtml(newsRelTime(g.last))}، ${escHtml(placeName(g.place))}، ${escHtml(g.device || 'دستگاه نامشخص')}، نسخه‌ی ${escHtml(toFaDigits(g.version || '—'))}</div>
        <button type="button" class="btn btn-sm" data-cerr="${escAttr(g.sig)}">رفع شد</button>
      </div>`;
    }).join('') + (list.length > 30 ? `<div class="sys-note">و ${faNum(list.length - 30)} خطای دیگر.</div>` : '');
  }catch(e){
    console.error(e);
    el.innerHTML = '<div class="sys-note">خطا در دریافت فهرست خطاها.</div>';
  }
}
document.getElementById('sys-client-errors').addEventListener('click', async e=>{
  const b = e.target.closest('[data-cerr]'); if(!b) return;
  if(!await uiConfirm('حذف این خطا از فهرست\nاگر دوباره رخ دهد، باز در فهرست ظاهر می‌شود.')) return;
  const r = await api('/client_errors?sig=eq.' + encodeURIComponent(b.dataset.cerr), { method:'DELETE' });
  if(!r.ok){ showToast('حذف ناموفق بود؛ اتصال اینترنت را بررسی کنید.'); return; }
  renderSysClientErrors().then(renderSysSummary);
});

// ---- گزارش اجرای کارهای خودکار (۵.۲۵.۰، run-job با {action:'logs'}) ----
let JOB_LOG_TEXT = '';
const JOB_LOG_ERR_RX = /##\[error\]|traceback|error|exception|failed|\[!\]|❌/i;
let JOB_LOG_SEQ = 0; // جواب دیرِ گزارش قبلی روی گزارش تازه ننشینه
async function openJobLog(job){
  const seq = ++JOB_LOG_SEQ;
  const j = SYS_STATUS_JOBS.find(x=>x.job === job);
  document.getElementById('job-log-title').textContent = 'گزارش آخرین اجرا: ' + (j ? j.name : job);
  document.getElementById('job-log-meta').textContent = 'در حال دریافت از گیت‌هاب…';
  document.getElementById('job-log-body').innerHTML = '';
  const ghLink = document.getElementById('job-log-gh');
  ghLink.hidden = true; ghLink.removeAttribute('href');
  document.getElementById('job-log-copy').disabled = true;
  JOB_LOG_TEXT = '';
  document.getElementById('job-log-modal').classList.add('active');
  try{
    const r = await fetch(SUPABASE_URL + '/functions/v1/run-job', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + authToken },
      body: JSON.stringify({ action:'logs', job }),
    });
    if(!r.ok) throw new Error('run-job logs ' + r.status);
    const d = await r.json();
    if(seq !== JOB_LOG_SEQ) return;
    if(d.error && !d.lines) throw new Error(d.error);
    const meta = document.getElementById('job-log-meta');
    if(!d.run){ meta.textContent = d.running ? 'اولین اجرا هنوز در جریان است؛ گزارش بعد از پایان آن آماده می‌شود.' : 'هنوز اجرایی ثبت نشده است.'; return; }
    const res = d.run.conclusion === 'success' ? 'موفق' : d.run.conclusion === 'failure' ? 'ناموفق' : d.run.conclusion === 'cancelled' ? 'لغو شده' : (d.run.conclusion || 'نامشخص');
    const when = new Date(d.run.created_at).toLocaleString('fa-IR', { timeZone:'Asia/Tehran', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
    meta.innerHTML = `اجرای ${escHtml(when)} — نتیجه: <b class="${d.run.conclusion === 'success' ? 'ok' : 'bad'}">${escHtml(res)}</b>${d.running ? '؛ یک اجرای تازه‌تر هم در جریان است.' : ''}${d.truncated ? '<br>فقط ۶۰ خط آخر نمایش داده می‌شود.' : ''}`;
    const gh = document.getElementById('job-log-gh');
    const url = safeUrl(d.run.html_url);
    if(url){ gh.href = url; gh.hidden = false; }
    const lines = d.lines || [];
    if(!lines.length){ document.getElementById('job-log-body').innerHTML = '<div class="job-log-line">گزارشی برای این اجرا در دسترس نیست.</div>'; return; }
    const fmtT = t => t ? new Date(t).toLocaleTimeString('en-GB', { timeZone:'Asia/Tehran', hour12:false }) : '';
    JOB_LOG_TEXT = lines.map(l=>(l.t ? fmtT(l.t) + '  ' : '') + l.text).join('\n');
    document.getElementById('job-log-body').innerHTML = lines.map(l=>{
      const err = JOB_LOG_ERR_RX.test(l.text);
      return `<div class="job-log-line ${err ? 'err' : ''} ${l.text.startsWith('▶') ? 'step' : ''}"><span class="job-log-t">${escHtml(fmtT(l.t))}</span><span>${escHtml(l.text.replace('##[error]', '✖ '))}</span></div>`;
    }).join('');
    document.getElementById('job-log-copy').disabled = false;
    const body = document.getElementById('job-log-body');
    body.scrollTop = body.scrollHeight;
  }catch(e){
    if(seq !== JOB_LOG_SEQ) return;
    console.error(e);
    document.getElementById('job-log-meta').textContent = 'دریافت گزارش ناموفق بود. اگر تازه منتشر شده، چند دقیقه بعد دوباره امتحان کنید (تابع run-job باید دوباره نصب شود).';
  }
}
function closeJobLog(){ document.getElementById('job-log-modal').classList.remove('active'); }
async function copyJobLog(){
  try{ await navigator.clipboard.writeText(JOB_LOG_TEXT); showToast('متن گزارش کپی شد؛ می‌توانید آن را برای پشتیبانی بفرستید.'); }
  catch(e){ showToast('کپی ممکن نشد؛ متن را دستی انتخاب و کپی کنید.'); }
}
document.addEventListener('click', e=>{
  const b = e.target.closest('.sys-log-btn');
  if(b) openJobLog(b.dataset.log);
});

async function renderSysStale(){
  const el = document.getElementById('sys-stale');
  el.innerHTML = '<div class="sys-note">در حال بررسی…</div>';
  try{
    const r = await api('/rpc/channel_last_post', { method:'POST', body:'{}' });
    if(r.status === 404){ el.innerHTML = '<div class="sys-note">برای نمایش این بخش، فایل <b>db/migration_034_system_status.sql</b> باید یک‌بار در SQL Editor سوپابیس اجرا شود.</div>'; return; }
    if(!r.ok) throw new Error('channel_last_post ' + r.status);
    const last = {};
    (await r.json()).forEach(x=>{ last[x.channel_id] = x.last_scraped_at; });
    const LIMIT = 3*86400000;
    const PLAT = { eitaa:'ایتا', telegram:'تلگرام', website:'وب‌سایت', bale:'بله' };
    const stale = CHANNELS.filter(c=>c.active !== false)
      .map(c=>({ c, at: last[c.id] ? new Date(last[c.id]).getTime() : 0 }))
      .filter(x=>Date.now() - x.at > LIMIT)
      .sort((a,b)=>a.at - b.at);
    el.innerHTML = stale.length
      ? '<div class="sys-rows">' + stale.map(x=>`<div class="sys-row sys-row-link ${x.at ? 'warn' : 'bad'}" role="button" tabindex="0" data-chan="${x.c.id}" title="باز کردن پنجره‌ی ویرایش این منبع"><span class="sys-status-dot"></span><span class="sys-row-name">${escHtml(x.c.title||x.c.username)}</span><span class="sys-row-meta">${PLAT[x.c.platform]||''}، ${x.at ? 'آخرین مطلب ' + newsRelTime(new Date(x.at).toISOString()) : 'تاکنون مطلبی نیامده'}</span><span class="sys-row-edit">ویرایش منبع</span></div>`).join('') + '</div>'
      : '<div class="sys-note">✓ همه‌ی منابع فعال در ۳ روز اخیر مطلب داشته‌اند.</div>';
  }catch(e){
    console.error(e);
    el.innerHTML = '<div class="sys-note">خطا در بررسی منابع.</div>';
  }
}
// ورودها (migration_035، جدول login_events — فقط مدیر select داره)
function sysDeviceLabel(ua){
  ua = ua || '';
  if(!ua) return 'نامشخص';
  if(/^python/i.test(ua)) return 'اسکریپت خودکار';
  const os = /iphone|ipad/i.test(ua) ? 'آیفون' : /android/i.test(ua) ? 'اندروید' : /windows/i.test(ua) ? 'ویندوز' : /mac os/i.test(ua) ? 'مک' : /linux/i.test(ua) ? 'لینوکس' : '';
  const br = /edg\//i.test(ua) ? 'Edge' : /opr\//i.test(ua) ? 'Opera' : /firefox/i.test(ua) ? 'Firefox' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : '';
  return [os, br].filter(Boolean).join('، ') || 'نامشخص';
}
let SYS_LOGINS_SHOW_ALL = false;
document.getElementById('sys-logins').addEventListener('click', e=>{
  if(e.target.closest('[data-act="logins-toggle"]')){ SYS_LOGINS_SHOW_ALL = !SYS_LOGINS_SHOW_ALL; renderSysLogins(); }
});
async function renderSysLogins(){
  const el = document.getElementById('sys-logins');
  el.innerHTML = '<div class="sys-note">در حال بررسی…</div>';
  try{
    const [r, locks] = await Promise.all([
      api('/login_events?select=*&order=created_at.desc&limit=300'),
      fetchLoginLocks().catch(()=>null),
    ]);
    if(r.status === 404 || r.status === 400){ el.innerHTML = '<div class="sys-note">برای نمایش این بخش، فایل <b>db/migration_035_login_events.sql</b> باید یک‌بار در SQL Editor سوپابیس اجرا شود.</div>'; return; }
    if(!r.ok) throw new Error('login_events ' + r.status);
    const rows = await r.json();
    const dayAgo = Date.now() - 86400000;
    const day = rows.filter(x=>new Date(x.created_at).getTime() > dayAgo);
    const okAdmin = day.filter(x=>x.success && x.role==='app_admin').length;
    const okViewer = day.filter(x=>x.success && x.role==='app_viewer').length;
    const fails = day.filter(x=>!x.success && !x.blocked);
    const failCls = fails.length >= 20 ? 'bad' : fails.length >= 5 ? 'warn' : '';
    const byIp = {};
    fails.forEach(x=>{ const k = x.ip || 'نامشخص'; byIp[k] = (byIp[k]||0) + 1; });
    const topIps = Object.entries(byIp).sort((a,b)=>b[1]-a[1]).slice(0,3);
    const list = SYS_LOGINS_SHOW_ALL ? rows : rows.slice(0, 15);
    // قفل موقت ورود (migration_042)
    const lockHtml = locks === null
      ? '<div class="sys-note sys-lock-note">قفل خودکار ورود هنوز فعال نیست؛ برای فعال شدن، فایل <b>db/migration_042_login_lock_site_settings.sql</b> را یک‌بار در SQL Editor سوپابیس اجرا کنید.</div>'
      : locks.length
        ? `<div class="sys-lock-box warn"><div class="sys-lock-head"><b>ورود از ${faNum(locks.length)} اتصال موقتاً بسته است</b>${locks.length > 1 ? '<button type="button" class="btn btn-sm" onclick="unlockLogin(null)">باز کردن همه</button>' : ''}</div>${locks.map(x=>{
            const until = new Date(x.locked_until);
            const mins = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000));
            return `<div class="sys-lock-row"><span dir="ltr" class="sys-lock-ip">${escHtml(x.ip || 'نامشخص')}</span><span class="sys-lock-meta">${faNum(x.attempts)} تلاش ناموفق، باز شدن خودکار تا ${faNum(mins)} دقیقه‌ی دیگر</span><button type="button" class="btn btn-sm" data-unlock="${escAttr(x.ip || '')}">باز کردن قفل</button></div>`;
          }).join('')}<p class="sys-lock-help">اگر همکاران پشت یک اینترنت مشترک هستند، قفل برای همه‌ی آن‌ها اعمال می‌شود. اگر مطمئن هستید تلاش‌ها از طرف خودتان بوده، قفل را باز کنید.</p></div>`
        : '<div class="sys-note sys-lock-note">قفل خودکار فعال است: با ۵ رمز اشتباه در ۱۵ دقیقه از یک اتصال، ورود از آن اتصال ۱۵ دقیقه بسته می‌شود. الان هیچ اتصالی قفل نیست.</div>';
    el.innerHTML = lockHtml + `<div class="sys-login-sum">
        <div class="sys-login-stat"><b>${faNum(okAdmin)}</b><span>ورود مدیر در ۲۴ ساعت اخیر</span></div>
        <div class="sys-login-stat"><b>${faNum(okViewer)}</b><span>ورود بیننده در ۲۴ ساعت اخیر</span></div>
        <div class="sys-login-stat ${failCls}"><b>${faNum(fails.length)}</b><span>تلاش ناموفق (رمز اشتباه) در ۲۴ ساعت اخیر${topIps.length ? '<br>بیشترین از: ' + topIps.map(([ip,n])=>escHtml(ip) + ' (' + faNum(n) + ')').join('، ') : ''}</span></div>
      </div>` + (rows.length ? `<div class="sys-login-wrap"><table class="sys-login-table"><thead><tr><th>زمان</th><th>نتیجه</th><th>نقش</th><th>نام</th><th>دستگاه</th><th>IP</th></tr></thead><tbody>${list.map(x=>{
        const d = new Date(x.created_at);
        const full = d.toLocaleString('fa-IR', { timeZone:'Asia/Tehran', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
        return `<tr class="${x.success ? '' : 'fail'}"><td title="${escAttr(full)}">${escHtml(full)}</td><td><span class="sys-login-badge ${x.success ? '' : 'fail'}">${x.success ? 'موفق' : x.blocked ? (x.role === 'app_viewer' ? 'رمز بیننده بسته است' : 'رد شد (قفل)') : x.user_id ? 'کد پیامک اشتباه' : 'رمز اشتباه'}</span></td><td>${x.role==='app_admin' ? 'مدیر' : x.role==='app_viewer' ? 'بیننده' : '—'}</td><td>${x.user_name ? escHtml(x.user_name) : x.success ? '<span class="usr-dim">رمز مشترک</span>' : '—'}</td><td title="${escAttr(x.user_agent||'')}">${escHtml(sysDeviceLabel(x.user_agent))}</td><td dir="ltr">${escHtml(x.ip||'—')}</td></tr>`;
      }).join('')}</tbody></table></div>${rows.length > 15 ? `<button type="button" class="btn sys-login-more" data-act="logins-toggle">${SYS_LOGINS_SHOW_ALL ? 'نمایش کمتر' : 'نمایش همه (' + faNum(rows.length) + ')'}</button>` : ''}` : '<div class="sys-note">هنوز ورودی ثبت نشده.</div>');
  }catch(e){
    console.error(e);
    el.innerHTML = '<div class="sys-note">خطا در دریافت فهرست ورودها.</div>';
  }
}
function renderSysTokens(){
  const el = document.getElementById('sys-tokens');
  el.innerHTML = '<div class="sys-rows">' + SYS_TOKENS.map(t=>{
    const days = Math.ceil((new Date(t.exp + 'T00:00:00Z').getTime() - Date.now()) / 86400000);
    const cls = days <= 7 ? 'bad' : days <= 21 ? 'warn' : 'ok';
    const left = days < 0 ? 'منقضی شده!' : toFaDigits(days) + ' روز مانده';
    const date = new Date(t.exp + 'T12:00:00Z').toLocaleDateString('fa-IR', { timeZone:'Asia/Tehran', day:'numeric', month:'long', year:'numeric' });
    return `<div class="sys-row ${cls}" title="${escAttr(t.key + ' — ' + t.where)}"><span class="sys-status-dot"></span><span class="sys-row-name">${t.name}</span><span class="sys-row-meta">${date}، ${left}</span></div>`;
  }).join('') + '</div>';
}

// auto=true: رفرش دقیقه‌ای یا بعد از «اجرای دستی» — سرویس‌های مرتبط (که لیارا و
// سایت‌های بیرونی رو صدا می‌زنن) فقط با باز کردن صفحه یا «به‌روزرسانی همه» بررسی می‌شن
async function renderSystemStatus(auto){
  const wrap = document.getElementById('sys-status-list');
  if(!wrap) return;
  renderSysTokens();
  const parts = [renderSysStorage(), renderSysStale(), renderSysLogins(), renderSysClientErrors()];
  if(auto !== true) parts.push(renderSysAlerts());
  if(auto !== true) parts.push(renderSysServices(), renderSysCapacity());
  renderSysSummary(true);
  renderSysTimeline();
  wrap.innerHTML = SYS_STATUS_JOBS.map(j=>`<div class="sys-status-item"><span class="sys-status-dot"></span><div><div class="sys-status-name">${j.name}</div><div class="sys-status-when">در حال بررسی…</div></div></div>`).join('');
  const ghPromise = sysFetchGithubRuns();
  const results = await Promise.all(SYS_STATUS_JOBS.map(async j=>{
    try{
      const extra = j.extra ? j.extra().catch(()=>'') : Promise.resolve('');
      if(j.custom) return Object.assign(await j.custom(), { extra: await extra });
      const r = await api(j.path);
      if(!r.ok) return { err:true };
      const rows = await r.json();
      return { at: rows[0] ? rows[0][j.col] : null, extra: await extra };
    }catch(e){ return { err:true }; }
  }));
  const ghRuns = await ghPromise;
  renderSysTimeline();
  wrap.innerHTML = SYS_STATUS_JOBS.map((j,i)=>{
    const res = results[i];
    let cls = '', when;
    // درخواست اجرای دستی تا وقتی خروجی تازه‌تر از زمان درخواست نیومده «در حال اجرا»ست
    // (برای پاک‌سازی که خروجی زمان‌دار نداره، از زمان آخرین اجرای گیت‌هاب)؛ یا تا وقتی
    // گیت‌هاب اجرای بعد از درخواست رو «تموم‌شده» (موفق یا ناموفق) گزارش نده — وگرنه
    // اجرای ناموفق که خروجی نمی‌ده دکمه رو ۲۰ دقیقه قفل نگه می‌داشت
    const reqAt = JOB_REQUESTED_AT[j.job];
    const run = ghRuns ? ghRuns[j.job] : null;
    const doneAt = res.at || (j.custom && run && run.status === 'completed' ? run.created_at : null);
    const runFinishedAfterReq = run && run.status === 'completed' && new Date(run.created_at).getTime() > reqAt - 60000;
    const pending = reqAt && (Date.now() - reqAt < 20*60000) && !runFinishedAfterReq && !(doneAt && new Date(doneAt).getTime() > reqAt);
    if(!pending) delete JOB_REQUESTED_AT[j.job];
    if(res.err){ when = 'خطا در دریافت وضعیت'; }
    else if(j.custom){ cls = res.cls; when = res.when; }
    else if(!res.at){ cls = 'bad'; when = 'هنوز هیچ خروجی ثبت نشده'; }
    else{
      const hours = (Date.now() - new Date(res.at).getTime()) / 3600000;
      cls = hours >= j.bad ? 'bad' : hours >= j.warn ? 'warn' : 'ok';
      when = 'آخرین خروجی: ' + newsRelTime(res.at);
    }
    const gh = sysGithubLine(run);
    if(gh.cls === 'bad') cls = 'bad';
    const runBtn = currentRole === 'app_admin'
      ? `<button type="button" class="sys-run-btn" data-job="${j.job}" ${pending ? 'disabled' : ''}>${pending ? 'در حال اجرا…' : 'اجرای دستی'}</button>` : '';
    const logBtn = currentRole === 'app_admin' && run ? `<button type="button" class="sys-run-btn sys-log-btn" data-log="${j.job}">مشاهده‌ی گزارش</button>` : '';
    return `<div class="sys-status-item ${cls}"><span class="sys-status-dot"></span><div class="sys-status-body"><div class="sys-status-name">${j.name}</div><div class="sys-status-when">${when}</div>${res.extra ? `<div class="sys-extra">${res.extra}</div>` : ''}<div class="sys-gh ${gh.cls}">${gh.text}</div><div class="sys-status-exp">زمان‌بندی: ${j.exp}</div><div class="sys-btn-row">${runBtn}${logBtn}</div></div></div>`;
  }).join('');
  await Promise.all(parts.map(x=>Promise.resolve(x).catch(()=>{})));
  renderSysSummary();
  // تا وقتی اجرایی در جریانه، هر دقیقه (فقط اگه همچنان توی همین صفحه باشیم) دوباره چک کن
  clearTimeout(SYS_STATUS_TIMER);
  if(Object.keys(JOB_REQUESTED_AT).length){
    SYS_STATUS_TIMER = setTimeout(()=>{
      if(document.getElementById('sec-status').classList.contains('active')) renderSystemStatus(true);
    }, 60000);
  }
}
const JOB_REQUESTED_AT = {};

// خلاصه‌ی بالای صفحه (۵.۲۰.۰): موارد زرد/قرمز همه‌ی کارت‌ها از خودِ صفحه‌ی رندرشده
// جمع می‌شن؛ کلیک روی هر مورد = اسکرول به همون کارت
let SYS_SUMMARY_TARGETS = [];
function renderSysSummary(loading){
  const el = document.getElementById('sys-summary');
  if(!el) return;
  if(loading){ el.className = 'sys-summary'; el.innerHTML = '<b>در حال بررسی وضعیت سامانه…</b>'; return; }
  const items = [];
  const add = (cls, text, target) => items.push({ cls, text, target });
  const lvl = e => e.classList.contains('bad') ? 'bad' : e.classList.contains('warn') ? 'warn' : '';
  const bar = document.querySelector('#sys-storage .sys-bar');
  if(bar && lvl(bar)) add(lvl(bar), 'فضای ذخیره‌سازی ' + (document.querySelector('#sys-storage .sys-storage-head span:last-child') || {}).textContent + ' پر', bar.closest('.panel'));
  document.querySelectorAll('#sys-services .svc-row.bad, #sys-services .svc-row.warn').forEach(r=>{
    const n = (r.querySelector('.svc-name') || {}).textContent || '';
    add(lvl(r), n + (lvl(r) === 'bad' ? ': قطع یا خطا' : ': کُند'), r);
  });
  document.querySelectorAll('#sys-status-list .sys-status-item.bad, #sys-status-list .sys-status-item.warn').forEach(r=>{
    add(lvl(r), (r.querySelector('.sys-status-name') || {}).textContent || '', r);
  });
  const lockBox = document.querySelector('#sys-logins .sys-lock-box');
  if(lockBox) add('warn', 'ورود از ' + faNum(lockBox.querySelectorAll('.sys-lock-row').length) + ' اتصال قفل است', lockBox);
  document.querySelectorAll('#sys-logins .sys-login-stat.bad, #sys-logins .sys-login-stat.warn').forEach(r=>{
    add(lvl(r), 'تلاش ناموفق ورود زیاد', r);
  });
  const proj = document.querySelector('#sys-capacity .sys-cap-proj.bad, #sys-capacity .sys-cap-proj.warn');
  if(proj) add(lvl(proj), (CAP_KIND === 'db' ? 'پایگاه داده' : 'فضای فایل') + ' رو به پر شدن', proj);
  const aerr = document.querySelector('#sys-alerts .sys-alert-err');
  if(aerr) add('warn', 'ارسال ایمیل هشدار ناموفق', aerr);
  const cerr = document.querySelectorAll('#sys-client-errors .sys-cerr-row.warn');
  if(cerr.length) add('warn', faNum(cerr.length) + ' خطای پرتکرار در مرورگر کاربران', cerr[0]);
  const stale = document.querySelectorAll('#sys-stale .sys-row');
  if(stale.length) add([...stale].some(r=>r.classList.contains('bad')) ? 'bad' : 'warn', faNum(stale.length) + ' منبع بی‌خبر', stale[0].closest('.panel'));
  document.querySelectorAll('#sys-tokens .sys-row.bad, #sys-tokens .sys-row.warn').forEach(r=>{
    add(lvl(r), 'انقضای توکن «' + ((r.querySelector('.sys-row-name') || {}).textContent || '') + '»', r);
  });
  items.sort((a,b)=>(b.cls === 'bad') - (a.cls === 'bad'));
  SYS_SUMMARY_TARGETS = items.map(x=>x.target);
  if(!items.length){
    el.className = 'sys-summary ok';
    el.innerHTML = '<b>همه‌چیز سالم است</b><span>هیچ موردی نیاز به رسیدگی ندارد.</span>';
    return;
  }
  el.className = 'sys-summary ' + (items.some(x=>x.cls === 'bad') ? 'bad' : 'warn');
  el.innerHTML = `<b>${faNum(items.length)} مورد نیازمند توجه</b><div class="sys-sum-chips">${items.map((x,i)=>`<button type="button" class="sys-sum-chip ${x.cls}" data-i="${i}">${escHtml(x.text)}</button>`).join('')}</div>`;
}
document.getElementById('sys-summary').addEventListener('click', e=>{
  const b = e.target.closest('.sys-sum-chip'); if(!b) return;
  const t = SYS_SUMMARY_TARGETS[+b.dataset.i]; if(!t || !t.isConnected) return;
  t.scrollIntoView({ behavior:'smooth', block:'center' });
  t.classList.remove('sys-flash'); void t.offsetWidth; t.classList.add('sys-flash');
});
// «منابع بی‌خبر»: کلیک = پنجره‌ی ویرایش همون منبع (۵.۲۰.۰)
function openStaleChannel(e){
  const row = e.target.closest('.sys-row-link'); if(!row) return;
  if(e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  const ch = CHANNELS.find(c=>String(c.id) === row.dataset.chan);
  if(ch) openChanEditor(ch);
}
document.getElementById('sys-logins').addEventListener('click', e=>{
  const b = e.target.closest('[data-unlock]'); if(b) unlockLogin(b.dataset.unlock);
});
document.getElementById('sys-stale').addEventListener('click', openStaleChannel);
document.getElementById('sys-stale').addEventListener('keydown', openStaleChannel);

// ---- نشانگرهای هشدار منوی «مدیریت» ----
// فقط برای مدیر، ۲ ثانیه بعد از ورود و بعد هر ۱۵ دقیقه. عمداً سبک: همون
// بررسی‌های صفحه‌ی «وضعیت سامانه» که فقط یه ردیف/یه عدد می‌خونن (زمان آخرین خروجی
// کارها، رسانه‌ی پاک‌نشده، حجم فضا، تلاش ناموفق ورود، انقضای توکن‌ها) — بدون
// «سرویس‌های مرتبط» و نتیجه‌ی گیت‌هاب (که لیارا/سهمیه‌ی API رو مصرف می‌کنن).
// «نظرات خونده‌نشده» نسبت به آخرین باری که همین مرورگر بخش نظرات رو باز کرده
// (localStorage) — بار اول از همون لحظه شمرده می‌شه.
// «دیده شد» (خواست کاربر، تا هشدار زردِ طولانی چشم رو عادت نده): با باز کردن صفحه‌ی
// وضعیت، موارد فعلی با سطحشون در jarian_status_ack ذخیره می‌شن و دیگه شمرده نمی‌شن —
// مگر مورد جدید باشه یا سطحش بالاتر بره. مورد قرمز همیشه شمرده می‌شه. موردی که
// برطرف شد از ack پاک می‌شه تا اگه برگشت، دوباره «جدید» باشه.
const FEEDBACK_SEEN_KEY = 'jarian_feedback_seen';
const STATUS_ACK_KEY = 'jarian_status_ack';
let ADMIN_ALERT_TIMER = null;
let ADMIN_ISSUES = []; // [{key, cls, msg}]
async function refreshAdminAlerts(){
  clearTimeout(ADMIN_ALERT_TIMER);
  if(currentRole !== 'app_admin' || !authToken) return;
  ADMIN_ALERT_TIMER = setTimeout(refreshAdminAlerts, 15*60000);
  const rank = { '':0, ok:0, warn:1, bad:2 };
  let level = '';
  const issues = [];
  const note = (cls, msg, key) => { if(rank[cls] > 0) issues.push({ key, cls, msg }); };
  const jobChecks = SYS_STATUS_JOBS.map(async j=>{
    try{
      if(j.custom){ const r = await j.custom(); note(r.cls, j.name + ': ' + r.when, 'job:' + j.job); return; }
      const r = await api(j.path); if(!r.ok) return;
      const rows = await r.json(); const at = rows[0] ? rows[0][j.col] : null;
      if(!at){ note('bad', j.name + ': هنوز خروجی ندارد', 'job:' + j.job); return; }
      const hours = (Date.now() - new Date(at).getTime()) / 3600000;
      note(hours >= j.bad ? 'bad' : hours >= j.warn ? 'warn' : 'ok', j.name + ': آخرین خروجی ' + newsRelTime(at), 'job:' + j.job);
    }catch(e){}
  });
  const storageCheck = (async()=>{
    try{
      const r = await api('/rpc/storage_usage', { method:'POST', body:'{}' }); if(!r.ok) return;
      const total = (await r.json()).reduce((t,x)=>t + Number(x.size_bytes||0), 0);
      const pct = total / (STORAGE_LIMIT_MB*1048576) * 100;
      note(pct >= 85 ? 'bad' : pct >= 65 ? 'warn' : 'ok', 'فضای ذخیره‌سازی: ' + toFaDigits(pct.toFixed(0)) + '٪ پر', 'storage');
    }catch(e){}
  })();
  const loginCheck = (async()=>{
    try{
      const since = new Date(Date.now() - 86400000).toISOString();
      const n = await fetchExactCount('/login_events?success=is.false&blocked=is.false&created_at=gt.' + since);
      const locks = await fetchLoginLocks().catch(()=>null);
      if(locks && locks.length) note('warn', 'ورود از ' + faNum(locks.length) + ' اتصال قفل است', 'login-lock');
      note(n >= 20 ? 'bad' : n >= 5 ? 'warn' : 'ok', 'تلاش ناموفق ورود در ۲۴ ساعت: ' + faNum(n), 'logins');
    }catch(e){}
  })();
  SYS_TOKENS.forEach(t=>{
    const days = Math.ceil((new Date(t.exp + 'T00:00:00Z').getTime() - Date.now()) / 86400000);
    note(days <= 7 ? 'bad' : days <= 21 ? 'warn' : 'ok', 'توکن «' + t.name + '»: ' + (days < 0 ? 'منقضی شده' : toFaDigits(days) + ' روز مانده'), 'token:' + t.key);
  });
  const feedbackCheck = (async()=>{
    let seen = null;
    try{ seen = localStorage.getItem(FEEDBACK_SEEN_KEY); }catch(e){}
    if(!seen){ seen = new Date().toISOString(); try{ localStorage.setItem(FEEDBACK_SEEN_KEY, seen); }catch(e){} }
    try{ return await fetchExactCount('/feedback?created_at=gt.' + encodeURIComponent(seen)); }catch(e){ return 0; }
  })();
  await Promise.all([...jobChecks, storageCheck, loginCheck]);
  const unread = await feedbackCheck;
  ADMIN_ISSUES = issues;
  // موارد برطرف‌شده از «دیده شد» پاک بشن
  const ack = statusAckGet();
  Object.keys(ack).forEach(k=>{ if(!issues.some(x=>x.key === k)) delete ack[k]; });
  statusAckSet(ack);
  // اگه همین الان توی صفحه‌ی وضعیت هستیم (مثلاً رفرش روی همین صفحه)، همه دیده‌شده‌ان
  if(document.getElementById('sec-status').classList.contains('active')) ackAdminAlerts(); else renderAdminStatusDot();
  setFeedbackBadge(unread);
  updateAdminBtnDot();
}
function statusAckGet(){ try{ return JSON.parse(localStorage.getItem(STATUS_ACK_KEY) || '{}') || {}; }catch(e){ return {}; } }
function statusAckSet(o){ try{ localStorage.setItem(STATUS_ACK_KEY, JSON.stringify(o)); }catch(e){} }
function renderAdminStatusDot(){
  const rank = { warn:1, bad:2 };
  const ack = statusAckGet();
  // قرمز همیشه؛ زرد فقط اگه دیده‌نشده یا سطحش از زمان دیدن بالاتر رفته
  const fresh = ADMIN_ISSUES.filter(x => x.cls === 'bad' || !ack[x.key] || rank[x.cls] > (rank[ack[x.key]] || 0));
  const level = fresh.some(x=>x.cls === 'bad') ? 'bad' : fresh.length ? 'warn' : '';
  const dot = document.getElementById('am-status-dot');
  dot.className = 'am-dot' + (level ? ' ' + level : '');
  dot.textContent = fresh.length ? toFaDigits(fresh.length) : '';
  const statusBtn = dot.closest('button');
  const seen = ADMIN_ISSUES.filter(x=>!fresh.includes(x));
  statusBtn.title = (fresh.length ? 'نیاز به توجه:\n' + fresh.map(x=>x.msg).join('\n') : '') +
    (seen.length ? (fresh.length ? '\n\n' : '') + 'دیده‌شده (هنوز برقرار):\n' + seen.map(x=>x.msg).join('\n') : '');
  updateAdminBtnDot();
}
// با باز کردن صفحه‌ی «وضعیت سامانه»
function ackAdminAlerts(){
  const ack = statusAckGet();
  ADMIN_ISSUES.forEach(x=>{ ack[x.key] = x.cls; });
  statusAckSet(ack);
  renderAdminStatusDot();
}
function setFeedbackBadge(n){
  const b = document.getElementById('am-feedback-badge');
  b.textContent = n > 99 ? '۹۹+' : toFaDigits(n);
  b.classList.toggle('show', n > 0);
  updateAdminBtnDot();
}
function updateAdminBtnDot(){
  const st = document.getElementById('am-status-dot').className;
  const lvl = /\bbad\b/.test(st) ? 'bad' : /\bwarn\b/.test(st) ? 'warn' : document.getElementById('am-feedback-badge').classList.contains('show') ? 'info' : '';
  const d = document.getElementById('am-btn-dot');
  d.className = 'am-btn-dot' + (lvl ? ' ' + lvl : '');
  const btn = document.getElementById('admin-menu-btn');
  btn.title = lvl === 'bad' || lvl === 'warn' ? 'وضعیت سامانه نیاز به توجه دارد' : lvl === 'info' ? 'نظر جدید کاربران' : '';
}
function markFeedbackSeen(){
  const newest = FEEDBACK_LIST && FEEDBACK_LIST[0] && FEEDBACK_LIST[0].created_at;
  try{ localStorage.setItem(FEEDBACK_SEEN_KEY, newest || new Date().toISOString()); }catch(e){}
  setFeedbackBadge(0);
}
let SYS_STATUS_TIMER = null;
// از طریق Edge Function run-job (توکن گیت‌هاب فقط سمت سرور، فقط مدیر)
async function runJobManually(job, btn){
  btn.disabled = true; btn.textContent = 'در حال ارسال…';
  try{
    const r = await fetch(SUPABASE_URL + '/functions/v1/run-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ job }),
    });
    if(!r.ok) throw new Error('run-job ' + r.status);
    JOB_REQUESTED_AT[job] = Date.now();
    showToast('درخواست اجرا ثبت شد؛ معمولاً ۱ تا ۵ دقیقه طول می‌کشد');
    renderSystemStatus(true);
  }catch(e){
    console.error(e);
    showToast('اجرای دستی ناموفق بود');
    btn.disabled = false; btn.textContent = 'اجرای دستی';
  }
}
document.addEventListener('click', e=>{
  const b = e.target.closest('.sys-run-btn:not(.sys-log-btn)');
  if(b && !b.disabled) runJobManually(b.dataset.job, b);
});

function newsRelTime(dateStr){
  if(!dateStr) return '';
  const d = new Date(dateStr);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs/60000);
  if(mins < 1) return 'همین الان';
  if(mins < 60) return toFaDigits(mins)+' دقیقه پیش';
  const hours = Math.floor(mins/60);
  if(hours < 24) return toFaDigits(hours)+' ساعت پیش';
  const days = Math.floor(hours/24);
  if(days === 1) return 'دیروز';
  if(days < 7) return toFaDigits(days)+' روز پیش';
  return d.toLocaleDateString('fa-IR');
}

function renderNewsRegionChips(){
  const row = document.getElementById('news-region-row');
  if(!row) return;
  row.innerHTML = '<span class="news-region-chip active" data-r="">همه رسانه‌ها</span>' +
    REGIONS.map(r=>`<span class="news-region-chip" data-r="${r.id}">${escHtml(r.name)}</span>`).join('');
  newsState.region = '';
}

function renderNewsTopicRow(){
  const row = document.getElementById('news-topic-row');
  if(!row) return;
  row.innerHTML = '<span class="news-topic-chip active" data-kw="">همه</span>' +
    NEWS_TOPICS.map(t=>`<span class="news-topic-chip" data-kw="${escAttr(t.keywords)}">${escAttr(t.name)}</span>`).join('');
  updateNewsTopicVisibility();
}
// ردیف موضوعات فقط توی تب «وب‌سایت‌ها» معنا داره (جایی که این فیچر برای
// مرور مقالات موضوعی سایت‌های خبری ساخته شده) — توی «شبکه‌های اجتماعی»
// و «ادعاها و شایعات» عمداً مخفیه
function updateNewsTopicVisibility(){
  const wrap = document.getElementById('news-topic-filter-row');
  if(!wrap) return;
  wrap.style.display = (newsState.platform === 'website' && NEWS_TOPICS.length) ? '' : 'none';
}

function updateNewsSourceSummary(){
  const summary = document.getElementById('news-source-summary');
  if(!summary) return;
  const n = newsState.sources.length;
  summary.textContent = n === 0 ? 'انتخاب رسانه‌ها…' : toFaDigits(n) + ' رسانه انتخاب‌شده';
}

function populateNewsSourceOptions(){
  const list = document.getElementById('news-source-list');
  if(!list) return;
  // منابعی که دیگه بین کانال‌های فعلی نیستن (مثلاً حذف شدن) از فیلتر انتخاب‌شده هم پاک بشن
  const validIds = new Set(newsChannels().map(c=>String(c.id)));
  newsState.sources = newsState.sources.filter(id=>validIds.has(id));
  list.innerHTML = newsChannels().map(c=>{
    const id = String(c.id);
    const checked = newsState.sources.includes(id) ? 'checked' : '';
    return `<label><input type="checkbox" value="${id}" ${checked}> ${escAttr(c.title||c.username)}</label>`;
  }).join('');
  list.querySelectorAll('input[type=checkbox]').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const id = chk.value;
      if(chk.checked){ if(!newsState.sources.includes(id)) newsState.sources.push(id); }
      else{ newsState.sources = newsState.sources.filter(x=>x!==id); }
      newsState.page = 1;
      updateNewsSourceSummary();
      renderNewsFeed();
    });
  });
  updateNewsSourceSummary();
}

function filteredNewsPosts(){
  return newsPosts().filter(p=>{
    const ch = chById(p.channel_id);
    // تب «اخبار حوزه»: فقط پست‌هایی که هوش مصنوعی صریحاً سیاسی/اجتماعی
    // تشخیص داده (posts.hawza_relevant===true) نشون داده می‌شن — پست‌های
    // تازه‌ی هنوز-بررسی‌نشده (NULL) و پست‌های غیرسیاسی/غیراجتماعی (false)
    // هر دو مخفی می‌مونن؛ نگاه کن به Edge Function extract-post-keywords
    if(newsState.platform === 'hawza' && p.hawza_relevant !== true) return false;
    if(newsState.region && String(ch.region_id) !== newsState.region) return false;
    if(newsState.sources.length && !newsState.sources.includes(String(p.channel_id))) return false;
    if(newsState.time === 'custom'){
      const postedMs = p.posted_at ? new Date(p.posted_at).getTime() : (p.scraped_at ? new Date(p.scraped_at).getTime() : 0);
      if(newsState.dateFrom && postedMs < new Date(newsState.dateFrom+'T00:00:00').getTime()) return false;
      if(newsState.dateTo && postedMs > new Date(newsState.dateTo+'T23:59:59').getTime()) return false;
    }else if(newsState.time !== 'all'){
      // نیمه‌شب تقویمی تهران، نه فاصله‌ی خام از همین لحظه — تابع
      // tehranDayDiff رو ببین (کنار iranTodayStartMs)
      const diffDays = tehranDayDiff(p.posted_at || p.scraped_at);
      if(newsState.time === 'today' && diffDays !== 0) return false;
      if(newsState.time === 'yesterday' && diffDays !== 1) return false;
      if(newsState.time === 'week' && (diffDays < 0 || diffDays > 6)) return false;
    }
    if(newsState.query){
      // یه موضوعِ ذخیره‌شده چندتا کلیدواژه‌ی جدا با ویرگول می‌فرسته — این‌ها
      // با OR چک می‌شن (کافیه پست حداقل یکی رو داشته باشه)، نه AND؛ برای
      // جستجوی دستی معمولی (بدون ویرگول) رفتار قبلی (تطبیق کامل عبارت) حفظ می‌شه.
      const hay = searchHay(p);
      const terms = newsState.query.split(/[,،]/).map(searchNorm).filter(Boolean);
      if(terms.length && !terms.some(t=>hay.includes(t))) return false;
    }
    return true;
  }).sort((a,b)=> new Date(b.posted_at||b.scraped_at) - new Date(a.posted_at||a.scraped_at));
}

const NEWS_PAGE_SIZE = 12;


// دکمه‌ی «فیلترها» در نمای گوشی: فیلترهای جانبی پشت یه دکمه جمع می‌شن
function toggleMobileFilters(btn){
  const box = btn.closest('[data-mfilters]');
  if(box) box.classList.toggle('m-open');
  btn.classList.toggle('active', box && box.classList.contains('m-open'));
}
function setMobileFilterCount(boxSel, n){
  const el = document.querySelector(boxSel+' .m-filter-count');
  if(el) el.textContent = n ? toFaDigits(n) : '';
}
function updateMobileFilterBadges(){
  const topic = document.querySelector('#news-topic-row .news-topic-chip.active');
  setMobileFilterCount('#news-study-panel',
    ((newsState.time !== 'all' || newsState.dateFrom || newsState.dateTo) ? 1 : 0)
    + (newsState.region ? 1 : 0) + (newsState.sources.length ? 1 : 0)
    + (topic && topic.dataset.kw ? 1 : 0));
  const catEl = document.getElementById('posts-filter-cat');
  setMobileFilterCount('#posts-tab-feed',
    (postsGroupFilter ? 1 : 0) + (postsSelectedChannels.length ? 1 : 0)
    + (catEl && catEl.value ? 1 : 0) + (postsTime ? 1 : 0));
}

function renderNewsFeed(){
  updateMobileFilterBadges();
  const feed = document.getElementById('news-feed');
  const empty = document.getElementById('news-empty');
  if(!feed) return;
  const fullList = filteredNewsPosts();
  empty.style.display = fullList.length ? 'none' : 'block';
  const totalPages = Math.max(1, Math.ceil(fullList.length / NEWS_PAGE_SIZE));
  if(newsState.page > totalPages) newsState.page = totalPages;
  if(newsState.page < 1) newsState.page = 1;
  const start = (newsState.page - 1) * NEWS_PAGE_SIZE;
  const list = fullList.slice(start, start + NEWS_PAGE_SIZE);
  renderNewsPagination(totalPages);
  const isAdmin = currentRole === 'app_admin';
  feed.innerHTML = list.map(p=>{
    const ch = chById(p.channel_id) || {};
    const topic = catNameOf(p.channel_id);
    const isClaims = ch.platform === 'bale';
    const isRealVideo = p.media_type === 'video' && p.media_path && /\.mp4($|\?)/i.test(p.media_path);
    const hasThumb = !!p.media_path && (p.media_type === 'photo' || (p.media_type === 'video' && !isRealVideo));
    const thumbBadge = p.media_type === 'video' ? `<span class="pt-media-badge">${ICONS.video}</span>` : '';
    // کانال بله (تب «ادعاها و شایعات») هیچ‌وقت عکس نداره — به‌جای باکس
    // خالی placeholder، کارت کاملاً متنی (تمام‌عرض) طراحی می‌شه
    // اگه خودِ پست عکس نداره، عکس پیش‌فرض همون کانال (اگه از پنل «مدیریت
    // کانال‌ها» آپلود شده باشه) به‌جای باکس خالی placeholder نشون داده می‌شه
    const thumbHtml = isClaims ? '' : hasThumb
      ? `<div class="news-thumb" style="position:relative">${thumbBadge}<img src="${escAttr(p.media_path)}" alt="" loading="lazy" data-viewer-kind="image" data-viewer-src="${escAttr(p.media_path)}"${p.media_type==='video' && p.link ? ` data-viewer-link="${escAttr(p.link)}"` : ''} /></div>`
      : ch.avatar_url
        ? `<div class="news-thumb"><img src="${escAttr(ch.avatar_url)}" alt="" loading="lazy" /></div>`
        : `<div class="news-thumb placeholder">${ICONS.doc}</div>`;
    return `
    <div class="news-card">
      ${thumbHtml}
      <div class="news-body">
        <div class="news-head">
          <span class="news-source">${isClaims ? 'ادعا یا شایعه' : escHtml(ch.title||ch.username||'؟')}</span>
          ${isClaims ? '' : `<span class="news-platform">${NEWS_PLATFORM_ICON[ch.platform]||''}${NEWS_PLATFORM_LABEL[ch.platform]||ch.platform}</span>`}
          ${ch.region_id ? `<span class="news-region">${escHtml(regionNameOf(ch.region_id))}</span>` : ''}
          <span class="news-time">${newsRelTime(p.posted_at||p.scraped_at)}</span>
        </div>
        ${p.title ? `<h3 class="news-title" id="news-title-${p.id}">${escHtml(p.title)}</h3>` : ''}
        <p class="news-text${isClaims ? ' claims-text' : ''}" id="news-text-${p.id}">${claimsTextDisplay(p.text)}</p>
        <button class="news-more" onclick="toggleNewsText(${p.id})" id="news-more-${p.id}">
          نمایش بیشتر
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="news-foot">
          <div>${topic ? `<span class="news-topic">${escHtml(topic)}</span>` : ''}</div>
          <div style="display:flex; gap:10px; align-items:center;">
            ${ch.platform === 'website' && needsTranslation(p) ? `<button type="button" class="news-translate-btn" id="news-translate-btn-${p.id}" onclick="translatePost(${p.id})">ترجمه به فارسی</button>` : ''}
            ${isRealVideo ? `<a class="news-link" href="${safeUrl(p.media_path)}" target="_blank" rel="noopener" download>دانلود فیلم ↓</a>` : ''}
            ${(!isClaims && p.link) ? `<a class="news-link" href="${safeUrl(p.link)}" target="_blank" rel="noopener">مشاهده‌ی منبع ↗</a>` : ''}
          </div>
        </div>
        ${isAdmin ? `
        <div class="news-kw-row" id="news-kw-row-${p.id}" style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:8px;">
          <div class="news-kw-chips" id="news-kw-chips-${p.id}">${keywordChipsHtml(p.ai_keywords)}</div>
          <button type="button" class="news-kw-edit-btn" onclick="editPostKeywords(${p.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>ویرایش کلیدواژه</button>
          ${isClaims ? '' : pickAddBtnHtml(p)}
          ${postHideBtnHtml(p)}
        </div>` : ''}
      </div>
    </div>`;
  }).join('');
  wireMediaViewerClicks(feed);
  // دکمه‌ی «نمایش بیشتر» فقط وقتی نشون داده بشه که متن واقعاً از ۳ خط رد شده
  // باشه — وگرنه برای پست‌های کوتاه، کلیک روش هیچ تغییری ایجاد نمی‌کرد.
  // فونت فارسی سفارشی (IRANSansX) به‌صورت async لود می‌شه؛ اگه اندازه‌گیری
  // قبل از لود کامل فونت انجام بشه، ارتفاع متن با فونت جایگزین محاسبه
  // می‌شه و ممکنه اشتباهاً «سرریز نشده» تشخیص داده بشه — برای همین بعد از
  // آماده‌شدن فونت‌ها هم یه‌بار دیگه چک می‌کنیم.
  updateNewsMoreButtons(list);
  if(document.fonts && document.fonts.status !== 'loaded'){
    document.fonts.ready.then(()=> updateNewsMoreButtons(list));
  }
}

// ---- تب «پرونده‌های موضوعی» — اخبار مرتبط با موضوعات موقت/چرخشی، دسته‌بندی‌شده
// بر اساس dossier_topic_posts (فقط موضوعات active، فقط excluded=false) ----
// فیلتر «بازه‌ی زمانی» از نیمه‌شب تقویمی تهران حساب می‌شه (tehranDayDiff،
// کنار iranTodayStartMs) — نه فاصله‌ی خام از همین لحظه. طبق نظر کاربر،
// چیدمان سایدباریه: موضوعات ستون راست زیر هم، فقط یکی در هر لحظه
// انتخاب/نمایش داده می‌شه (نه accordion چندبازِ قبلی)
let dossierState = { time: 'all', topicId: null };

function renderDossierTab(){
  const sidebar = document.getElementById('dossier-sidebar');
  const wrap = document.getElementById('dossier-groups');
  const empty = document.getElementById('dossier-empty');
  if(!wrap || !sidebar) return;
  const groups = DOSSIER_TOPICS.filter(t=>t.active).map(t=>{
    const postIds = DOSSIER_TOPIC_POSTS.filter(dp=>dp.topic_id===t.id && !dp.excluded).map(dp=>dp.post_id);
    let posts = postIds.map(id=>POSTS_CACHE.find(p=>p.id===id)).filter(Boolean);
    if(dossierState.time !== 'all'){
      posts = posts.filter(p=>{
        const diffDays = tehranDayDiff(p.posted_at || p.scraped_at);
        if(dossierState.time === 'today') return diffDays === 0;
        if(dossierState.time === 'yesterday') return diffDays === 1;
        if(dossierState.time === 'week') return diffDays >= 0 && diffDays <= 6;
        return true;
      });
    }
    posts.sort((a,b)=> new Date(b.posted_at||b.scraped_at) - new Date(a.posted_at||a.scraped_at));
    return { topic: t, posts };
  }).filter(g=>g.posts.length);

  empty.style.display = groups.length ? 'none' : 'block';
  if(!groups.length){ sidebar.innerHTML=''; wrap.innerHTML=''; return; }

  // اگه موضوع انتخاب‌شده دیگه بین موضوعات دارای خبر نیست (غیرفعال شده یا
  // با فیلتر زمانی خالی شده)، طبق نظر کاربر آخرین موضوع (پایین‌ترین ردیف
  // سایدبار) پیش‌فرض انتخاب می‌شه
  if(!groups.some(g=>g.topic.id===dossierState.topicId)){
    dossierState.topicId = groups[groups.length-1].topic.id;
  }

  sidebar.innerHTML = groups.map(g=>`
    <button type="button" class="dossier-nav-item${g.topic.id===dossierState.topicId?' active':''}" data-topic="${g.topic.id}">${escAttr(g.topic.name)}</button>
  `).join('');

  const active = groups.find(g=>g.topic.id===dossierState.topicId);
  wrap.innerHTML = `<div class="news-feed grid-view dossier-feed">${active.posts.map(p=>dossierPostCardHtml(p, active.topic.id)).join('')}</div>`;
  wireMediaViewerClicks(wrap);
  updateDossierMoreButtons(wrap);
  if(document.fonts && document.fonts.status !== 'loaded'){
    document.fonts.ready.then(()=> updateDossierMoreButtons(wrap));
  }
}

// کارت خبر «پرونده‌های موضوعی» — با دکمه‌ی «نمایش بیشتر» مثل فید اصلی، ولی چون
// این پنل هم‌زمان با فیدهای دیگه توی DOM می‌مونه (فقط display:none
// می‌شه) و چون یه پست می‌تونه هم‌زمان زیر چند موضوع مختلف هم ظاهر بشه،
// idهای تعاملی (متن/دکمه) با ترکیب topicId-postId ساخته می‌شن، نه فقط
// postId خام — تا با id پست توی فید اصلی یا موضوع دیگه تداخل نکنه
function dossierPostCardHtml(p, topicId){
  const ch = chById(p.channel_id) || {};
  const isRealVideo = p.media_type === 'video' && p.media_path && /\.mp4($|\?)/i.test(p.media_path);
  const hasThumb = !!p.media_path && (p.media_type === 'photo' || (p.media_type === 'video' && !isRealVideo));
  const thumbHtml = hasThumb
    ? `<div class="news-thumb"><img src="${escAttr(p.media_path)}" alt="" loading="lazy" data-viewer-kind="image" data-viewer-src="${escAttr(p.media_path)}"${p.media_type==='video' && p.link ? ` data-viewer-link="${escAttr(p.link)}"` : ''} /></div>`
    : ch.avatar_url
      ? `<div class="news-thumb"><img src="${escAttr(ch.avatar_url)}" alt="" loading="lazy" /></div>`
      : `<div class="news-thumb placeholder">${ICONS.doc}</div>`;
  const uid = topicId + '-' + p.id;
  return `
  <div class="news-card">
    ${thumbHtml}
    <div class="news-body">
      <div class="news-head">
        <span class="news-source">${escAttr(ch.title||ch.username||'؟')}</span>
        <span class="news-platform">${NEWS_PLATFORM_ICON[ch.platform]||''}${NEWS_PLATFORM_LABEL[ch.platform]||ch.platform}</span>
        ${ch.region_id ? `<span class="news-region">${escHtml(regionNameOf(ch.region_id))}</span>` : ''}
        <span class="news-time">${newsRelTime(p.posted_at||p.scraped_at)}</span>
      </div>
      ${p.title ? `<h3 class="news-title">${escHtml(p.title)}</h3>` : ''}
      <p class="news-text" id="dossier-text-${uid}">${claimsTextDisplay(p.text)}</p>
      <button class="news-more" onclick="toggleDossierText('${uid}')" id="dossier-more-${uid}">
        نمایش بیشتر
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="news-foot">
        <div></div>
        <div>${(!isRealVideo && p.link) ? `<a class="news-link" href="${safeUrl(p.link)}" target="_blank" rel="noopener">مشاهده‌ی منبع ↗</a>` : ''}${isRealVideo ? `<a class="news-link" href="${safeUrl(p.media_path)}" target="_blank" rel="noopener" download>دانلود فیلم ↓</a>` : ''}</div>
      </div>
    </div>
  </div>`;
}

function toggleDossierText(uid){
  const t = document.getElementById('dossier-text-'+uid);
  const b = document.getElementById('dossier-more-'+uid);
  if(!t || !b) return;
  const isOpen = t.classList.toggle('expanded');
  b.classList.toggle('open', isOpen);
  b.firstChild.textContent = isOpen ? 'بستن ' : 'نمایش بیشتر ';
}

// چون <details> بسته محتواش رو layout نمی‌کنه، scrollHeight/clientHeight
// موقع بسته بودن قابل‌اعتماد نیست — این تابع فقط روی یه گروه/بخش مشخص
// (که همون لحظه بازه) صدا زده می‌شه، نه کل wrap
function updateDossierMoreButtons(scopeEl){
  if(!scopeEl) return;
  scopeEl.querySelectorAll('.news-text[id^="dossier-text-"]').forEach(textEl=>{
    const uid = textEl.id.slice('dossier-text-'.length);
    const moreBtn = document.getElementById('dossier-more-'+uid);
    if(!moreBtn) return;
    const overflowing = textEl.scrollHeight > textEl.clientHeight + 1;
    moreBtn.style.display = overflowing ? '' : 'none';
  });
}

// ---- تب «خبرنامه مدارس» — خبرنامه‌ی قابل‌دانلود (چاپی، A4)، بدون
// آرشیو: newsletter_posts همیشه فقط مجموعه‌ی «فعلیِ منتشرشده»‌ست. هر
// بار مدیر پنل رو باز می‌کنه، برای هر بخش یه پیش‌نویس محلی
// (NEWSLETTER_DRAFT) از روی مجموعه‌ی منتشرشده (یا اگه چیزی منتشر
// نشده، از یه پیشنهاد خودکار جدیدترین‌ها) ساخته می‌شه؛ تا وقتی
// «انتشار» نزنه، هیچ‌چیز توی دیتابیس تغییر نمی‌کنه.
const NEWSLETTER_SUGGEST_LIMIT = { claims: 5, news: 8, dossier: 6 };

function newsletterCandidatePosts(section){
  if(section === 'claims'){
    const ids = new Set(CHANNELS.filter(c=>c.platform==='bale').map(c=>c.id));
    return POSTS_CACHE.filter(p=>ids.has(p.channel_id));
  }
  if(section === 'news'){
    const ids = new Set(CHANNELS.filter(c=>c.show_in_news && c.platform!=='bale').map(c=>c.id));
    return POSTS_CACHE.filter(p=>ids.has(p.channel_id));
  }
  // dossier: از پست‌های واقعاً منتسب به موضوعات فعال «پرونده‌های موضوعی» (excluded=false)
  const activeTopicIds = new Set(DOSSIER_TOPICS.filter(t=>t.active).map(t=>t.id));
  const postIds = new Set(DOSSIER_TOPIC_POSTS.filter(dp=>!dp.excluded && activeTopicIds.has(dp.topic_id)).map(dp=>dp.post_id));
  return POSTS_CACHE.filter(p=>postIds.has(p.id));
}

function suggestNewsletterPostIds(section){
  return newsletterCandidatePosts(section)
    .sort((a,b)=> new Date(b.posted_at||b.scraped_at) - new Date(a.posted_at||a.scraped_at))
    .slice(0, NEWSLETTER_SUGGEST_LIMIT[section])
    .map(p=>p.id);
}

function initNewsletterDraft(){
  ['claims','news','dossier'].forEach(section=>{
    const published = NEWSLETTER_POSTS.filter(np=>np.section===section).sort((a,b)=>a.sort_order-b.sort_order).map(np=>np.post_id);
    NEWSLETTER_DRAFT[section] = published.length ? published.slice() : suggestNewsletterPostIds(section);
  });
}

function renderNewsletterTab(){
  const statusEl = document.getElementById('newsletter-download-status');
  const downloadBtn = document.getElementById('newsletter-download-btn');
  if(NEWSLETTER_POSTS.length){
    statusEl.textContent = 'خبرنامه‌ی امروز آماده‌ی دانلوده.';
    downloadBtn.disabled = false;
  }else{
    statusEl.textContent = 'هنوز خبرنامه‌ای منتشر نشده.';
    downloadBtn.disabled = true;
  }
  const isAdmin = currentRole === 'app_admin';
  document.getElementById('newsletter-admin-panel').style.display = isAdmin ? '' : 'none';
  if(isAdmin){
    initNewsletterDraft();
    renderNewsletterAdminPanel();
  }
}

function newsletterDraftLabel(postId){
  const p = POSTS_CACHE.find(x=>x.id===postId);
  if(!p) return 'پست #'+postId+' (حذف‌شده)';
  return p.title || (p.text||'').slice(0,60) || ('پست #'+p.id);
}

function renderNewsletterAdminPanel(){
  ['claims','news','dossier'].forEach(section=>{
    const wrap = document.getElementById('newsletter-draft-'+section);
    if(!wrap) return;
    const ids = NEWSLETTER_DRAFT[section];
    wrap.innerHTML = ids.length ? ids.map(id=>`
      <div class="newsletter-draft-item">
        <span class="txt">${escAttr(newsletterDraftLabel(id))}</span>
        <button class="del-btn" style="min-width:24px;min-height:24px;font-size:11px;" title="حذف از خبرنامه" onclick="removeNewsletterDraftItem('${section}', ${id})">✕</button>
      </div>`).join('') : '<p class="dossier-topic-empty">خبری انتخاب نشده.</p>';
  });
}

function removeNewsletterDraftItem(section, postId){
  NEWSLETTER_DRAFT[section] = NEWSLETTER_DRAFT[section].filter(id=>id!==postId);
  renderNewsletterAdminPanel();
}

function suggestNewsletterSection(section){
  NEWSLETTER_DRAFT[section] = suggestNewsletterPostIds(section);
  renderNewsletterAdminPanel();
}

function searchNewsletterManualAdd(section, query){
  const resultsEl = document.getElementById('newsletter-manual-results-'+section);
  if(!resultsEl) return;
  query = (query||'').trim();
  if(query.length < 2){ resultsEl.innerHTML=''; return; }
  const already = new Set(NEWSLETTER_DRAFT[section]);
  const matches = POSTS_CACHE.filter(p=> !already.has(p.id) && ((p.title||'').includes(query) || (p.text||'').includes(query))).slice(0,8);
  resultsEl.innerHTML = matches.length ? matches.map(p=>{
    const label = p.title || (p.text||'').slice(0,60) || ('پست #'+p.id);
    return `<div class="dossier-manual-result-row"><span class="txt">${escAttr(label)}</span><button class="btn btn-sm" onclick="addNewsletterManualPost('${section}', ${p.id})">افزودن</button></div>`;
  }).join('') : '<p class="dossier-topic-empty">موردی پیدا نشد.</p>';
}

function addNewsletterManualPost(section, postId){
  if(!NEWSLETTER_DRAFT[section].includes(postId)) NEWSLETTER_DRAFT[section].push(postId);
  document.getElementById('newsletter-manual-results-'+section).innerHTML = '';
  renderNewsletterAdminPanel();
}

// «انتشار» = جایگزینی کامل (نه insert اضافه‌شونده) — طبق تصمیم کاربر
// این جدول آرشیو نداره، همیشه فقط مجموعه‌ی «فعلی» رو نشون می‌ده
async function publishNewsletter(){
  await api('/newsletter_posts?id=gt.0', {method:'DELETE'});
  const rows = [];
  ['claims','news','dossier'].forEach(section=>{
    NEWSLETTER_DRAFT[section].forEach((postId, idx)=> rows.push({section, post_id: postId, sort_order: idx}));
  });
  if(rows.length){
    const r = await api('/newsletter_posts', {method:'POST', headers:{Prefer:'return=minimal'}, body: JSON.stringify(rows)});
    if(!r.ok){ showToast('انجام نشد؛ اتصال را بررسی کنید و دوباره امتحان کنید.'); return; }
  }
  await loadNewsletterPosts();
  renderNewsletterTab();
  showToast('خبرنامه‌ی امروز منتشر شد.');
}

// idx: شماره‌ی خبر داخل همون بخش (۱-پایه، هر بخش از ۱ دوباره شروع می‌شه) —
// به‌جای نشان مربعی جدا (که با تیتر هم‌ردیف نمی‌شد و بی‌ربط دیده می‌شد)،
// مستقیم قبل از خودِ تیتر، هم‌رنگ و هم‌خط با اون نوشته می‌شه
// ۵.۲۲.۱: زمان مطلق در PDF (قبلاً «۳ ساعت پیش» — فایل بعداً و در روز دیگری خونده می‌شه)
function nlWhen(t){
  if(!t) return '';
  const d = new Date(t);
  return d.toLocaleDateString('fa-IR', { timeZone:'Asia/Tehran', month:'long', day:'numeric' }) + '، ساعت ' +
    d.toLocaleTimeString('fa-IR', { timeZone:'Asia/Tehran', hour:'2-digit', minute:'2-digit' });
}
function newsletterItemHtml(p, idx){
  const ch = chById(p.channel_id) || {};
  const num = `<span class="newsletter-item-num">${toFaDigits(idx)}.</span>`;
  return `
    <div class="newsletter-item">
      ${p.title ? `<div class="newsletter-item-title">${num} ${escAttr(p.title)}</div>` : ''}
      <div class="newsletter-item-text">${p.title ? '' : num + ' '}${claimsTextDisplay(p.text||'')}</div>
      <div class="newsletter-item-meta">${escAttr(ch.title||ch.username||'')} — ${nlWhen(p.posted_at||p.scraped_at)}</div>
    </div>`;
}

// ⚠️ طبق درخواست کاربر: «شبکه‌های اجتماعی...» و «پرونده‌های موضوعی» دیگه دو
// بخش جدا با دو عنوان جدا نیستن — فقط توی پنل مدیریت (بالاتر، سه پنل
// curation جدا) دسته‌بندی‌شون حفظ شده تا مدیر بهتر پیدا/مدیریت‌شون کنه؛
// موقع نمایش نهایی به کاربر، آیتم‌های news+dossier با هم یکی (concat)
// و زیر یه عنوان مشترک «برخی از مهمترین خبرها» با شماره‌گذاری پیوسته
// (نه از سر گرفتن شماره برای هرکدوم) نشون داده می‌شن. صفحه‌ی اول هم
// طبق خواسته‌ی کاربر فقط مخصوص «ادعاها و شایعات»ه — برش اجباری صفحه
// بین این دو بخش توی buildNewsletterPdf (پایین‌تر) با اندازه‌گیری
// مرز #nl-claims-block انجام می‌شه، نه صرفاً جریان پیوسته‌ی قبلی.
function buildNewsletterPrintHtml(){
  const wrap = document.getElementById('newsletter-print-view');
  if(!wrap) return;
  const grouped = { claims: [], news: [], dossier: [] };
  NEWSLETTER_POSTS.forEach(np=>{
    // از np.posts (embedشده توسط loadNewsletterPosts) استفاده می‌کنیم، نه
    // POSTS_CACHE — چون POSTS_CACHE سقف ۱۰۰۰تایی داره و تا وقتی مدیر واقعاً
    // به این تب برمی‌گرده، پست‌های ادعا/شایعه‌ی منتشرشده (کمیاب‌تر از بقیه)
    // ممکنه ازش بیرون افتاده باشن و PDF رو با «خبری ثبت نشده» خالی بسازه
    if(np.posts) grouped[np.section].push(np.posts);
  });
  const highlights = [...grouped.news, ...grouped.dossier];
  const today = new Date().toLocaleDateString('fa-IR', { timeZone:'Asia/Tehran', year:'numeric', month:'long', day:'numeric' });
  const headerHtml = `
    <div class="newsletter-masthead">
      <div class="newsletter-masthead-meta">
        <span>نشریه‌ی داخلی · روزانه</span>
        <span>${today}</span>
      </div>
      <div class="newsletter-masthead-title">خبرنامه مدارس</div>
      <div class="newsletter-masthead-sub">سامانه هوشمند جریان — رصد و تحلیل فضای سیاسی‌اجتماعی</div>
      <div class="newsletter-masthead-rule"></div>
    </div>`;
  wrap.innerHTML = `
    <div class="newsletter-page">
      ${headerHtml}
      <div id="nl-claims-block">
        <h3 class="newsletter-page-title"><span>ادعاها و شایعات</span></h3>
        <div class="newsletter-flow-columns">
          ${grouped.claims.map((p,i)=>newsletterItemHtml(p,i+1)).join('') || '<p>خبری ثبت نشده.</p>'}
        </div>
      </div>
      <h3 class="newsletter-page-title"><span>برخی از مهمترین خبرها</span></h3>
      <div class="newsletter-flow-columns">
        ${highlights.map((p,i)=>newsletterItemHtml(p,i+1)).join('') || '<p>خبری ثبت نشده.</p>'}
      </div>
    </div>`;
}

async function downloadNewsletter(){
  const btn = document.getElementById('newsletter-download-btn');
  if(btn){ btn.disabled = true; btn.dataset.origText = btn.textContent; btn.textContent = 'در حال آماده‌سازی PDF...'; }
  try{
    const libs = await Promise.all([loadScriptOnce('vendor/html2canvas.min.js'), loadScriptOnce('vendor/jspdf.umd.min.js')]);
    if(!libs.every(Boolean)) throw new Error('pdf libraries failed to load');
    await buildNewsletterPdf();
  }catch(err){
    console.error(err);
    showToast('تولید فایل PDF ناموفق بود، دوباره امتحان کنید');
  }
  if(btn){ btn.disabled = false; btn.textContent = btn.dataset.origText || 'دانلود خبرنامه‌ی امروز'; }
}

// ساخت واقعی فایل PDF با jsPDF+html2canvas (نه چاپ مرورگر) — دلیل کامل
// این تغییر معماری بالای همین بخش، کنار #newsletter-print-view، مستند
// شده. مراحل: ۱) هدر برند جدا رندر می‌شه تا روی هر صفحه دوباره چسبونده بشه.
// ۲) هر خبر جدا در عرض یه ستون اندازه‌گیری می‌شه و خبرها به ترتیب در ستون راست،
// بعد چپ، بعد صفحه‌ی بعد چیده می‌شن (۵.۲۲.۱ — قبلاً یه بوم بلند دوستونه افقی
// برش می‌خورد و ترتیب خبرها بین صفحه‌ها به‌هم می‌ریخت). ۳) هر صفحه جدا با
// html2canvas رندر و به‌شکل JPEG (کیفیت ۰.۸۸) زیر هدر روی یه صفحه‌ی A4 گذاشته می‌شه.
async function buildNewsletterPdf(){
  buildNewsletterPrintHtml();
  const printView = document.getElementById('newsletter-print-view');
  const pageEl = printView.querySelector('.newsletter-page');
  const headerEl = pageEl.querySelector('.newsletter-masthead');

  const PDF_PX_WIDTH = 750;
  const marginLR = 14, headerTopMM = 10, marginBottom = 14;
  const contentWidthMM = 210 - marginLR * 2;
  const cssPxPerMM = PDF_PX_WIDTH / contentWidthMM;
  const scale = 2;

  const headerHolder = document.createElement('div');
  headerHolder.style.cssText = `position:fixed; top:0; left:0; width:${PDF_PX_WIDTH}px; background:#fff; z-index:-1;`;
  headerHolder.appendChild(headerEl.cloneNode(true));
  document.body.appendChild(headerHolder);
  const headerCanvas = await html2canvas(headerHolder, { scale, backgroundColor:'#ffffff' });
  const headerDataUrl = headerCanvas.toDataURL('image/png');
  const headerHeightMM = contentWidthMM * (headerCanvas.height / headerCanvas.width);
  document.body.removeChild(headerHolder);
  // ۵.۲۲.۱: شروع متن درست زیر سربرگ (قبلاً عدد ثابت ۳۴mm بود ولی سربرگ ~۴۲mm پایین می‌اومد و
  // تصویر سفید متن روی خط دوتایی زیر عنوان «خبرنامه مدارس» می‌افتاد و پنهانش می‌کرد)
  const marginTop = headerTopMM + headerHeightMM;
  const pageContentHeightCss = (297 - marginTop - marginBottom) * cssPxPerMM;

  // ۵.۲۲.۱ (بررسی خروجی PDF): قبلاً کل بدنه با CSS دوستونه یه بوم بلند می‌شد و افقی برش می‌خورد —
  // وقتی «مهمترین خبرها» بیشتر از یه صفحه بود، ستون راست (خبر ۱ تا ۱۰) و چپ (۱۱ تا ۱۹) هر کدوم
  // روی دو صفحه پخش می‌شدن (ترتیب خوندن ۱–۷، ۱۱–۱۶، بعد ۸–۱۰…) و خبرِ ستون دوم سر مرز صفحه
  // بریده می‌شد. حالا هر صفحه جدا چیده می‌شه: خبرها به ترتیب اول ستون راست، بعد چپ، بعد صفحه‌ی بعد.
  const colGap = 28, colW = (PDF_PX_WIDTH - colGap) / 2;
  const stage = document.createElement('div');
  stage.style.cssText = `position:fixed; top:0; left:0; width:${PDF_PX_WIDTH}px; background:#fff; direction:rtl; font-family:inherit; color:#222; z-index:-1;`;
  stage.className = 'newsletter-page';
  document.body.appendChild(stage);
  // ⚠️ html2canvas با white-space:pre-wrap + «\n» واقعی، حروف متصل با نیم‌فاصله رو به‌هم می‌ریزه —
  // خطوط با span بلوکی جدا می‌شن (نه \n داخل pre-wrap)
  const prepItem = el=>{
    el.querySelectorAll('.newsletter-item-text').forEach(t=>{
      t.innerHTML = t.innerHTML.split('\n').map(l => `<span class="nl-line" style="display:block;">${l}</span>`).join('');
      t.style.whiteSpace = 'normal';
    });
    return el;
  };
  // اندازه‌گیری: هر خبر در عرض یه ستون، عنوان بخش در عرض کامل
  const measure = (html, width)=>{
    const box = document.createElement('div'); box.style.width = width + 'px'; box.innerHTML = html;
    stage.appendChild(box);
    const el = prepItem(box);
    const h = box.getBoundingClientRect().height;
    stage.removeChild(box);
    return { html: el.innerHTML, h };
  };
  const sections = Array.from(pageEl.querySelectorAll('h3.newsletter-page-title')).map(t=>{
    const cols = t.nextElementSibling && t.nextElementSibling.classList.contains('newsletter-flow-columns')
      ? t.nextElementSibling : t.parentElement.querySelector('.newsletter-flow-columns');
    const items = Array.from(cols.children).map(c => measure(c.outerHTML, colW));
    // فاصله‌ی پایین هر خبر (margin) در اندازه نیست
    items.forEach(it => it.h += 16);
    const title = measure(t.outerHTML, PDF_PX_WIDTH); title.h += 16; // margin پایین عنوان
    return { title, items };
  });
  // چیدن خبرها در صفحه‌ها؛ هر بخش از صفحه‌ی تازه شروع می‌شه (صفحه‌ی اول فقط ادعاها — خواست کاربر)
  const pages = [];
  sections.forEach(sec=>{
    let page = { title: sec.title.html, cols: [[], []] }, used = [sec.title.h, sec.title.h], c = 0;
    pages.push(page);
    sec.items.forEach(it=>{
      while(true){
        if(used[c] + it.h <= pageContentHeightCss || !page.cols[c].length){ page.cols[c].push(it); used[c] += it.h; break; }
        if(c === 0){ c = 1; continue; }
        page = { title: '', cols: [[], []] }; used = [0, 0]; c = 0; pages.push(page);
      }
    });
    // صفحه‌ی آخر هر بخش مثل ستون‌بندی قبلی متوازن می‌شه (نه همه در ستون راست و ستون چپ خالی)
    const all = page.cols[0].concat(page.cols[1]);
    const total = all.reduce((t, it) => t + it.h, 0);
    let k = 0, acc = 0;
    while(k < all.length && acc + all[k].h / 2 <= total / 2){ acc += all[k].h; k++; }
    if(k === 0 && all.length) k = 1;
    page.cols = [all.slice(0, k), all.slice(k)];
  });

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'mm', format:'a4' });
  for(let i = 0; i < pages.length; i++){
    const pg = pages[i];
    stage.innerHTML = `${pg.title}<div style="display:flex; gap:${colGap}px; align-items:flex-start; position:relative;">
        <div style="width:${colW}px;">${pg.cols[0].map(it => it.html).join('')}</div>
        ${pg.cols[1].length ? `<div style="position:absolute; top:0; bottom:16px; left:${colW + colGap / 2}px; width:1px; background:#ccc;"></div>` : ''}
        <div style="width:${colW}px;">${pg.cols[1].map(it => it.html).join('')}</div>
      </div>`;
    // آخرین خبر هر ستون خط جداکننده‌ی پایین نمی‌گیره
    stage.querySelectorAll('.newsletter-item:last-child').forEach(el => { el.style.borderBottom = 'none'; });
    const canvas = await html2canvas(stage, { scale, backgroundColor:'#ffffff', windowWidth: PDF_PX_WIDTH });
    let wMM = contentWidthMM, hMM = canvas.height / scale / cssPxPerMM;
    const maxH = 297 - marginTop - marginBottom;
    // خبرِ تکیِ بلندتر از یه صفحه (خیلی نادر): کل صفحه کوچیک‌تر جا داده می‌شه، نه بریده
    if(hMM > maxH){ wMM = wMM * maxH / hMM; hMM = maxH; }
    if(i > 0) doc.addPage();
    doc.addImage(headerDataUrl, 'PNG', marginLR, headerTopMM, contentWidthMM, headerHeightMM);
    doc.addImage(canvas.toDataURL('image/jpeg', 0.88), 'JPEG', marginLR + (contentWidthMM - wMM) / 2, marginTop, wMM, hMM);
  }
  document.body.removeChild(stage);

  // نام فایل با ارقام لاتین (مثل پشتیبان و خروجی CSV) — بعضی مرورگرها/برنامه‌های ایمیل نام غیرلاتین رو به «download» برمی‌گردونن
  const jp = calParts(new Date(), 'persian');
  const fileDate = jp.year + '-' + String(jp.month).padStart(2, '0') + '-' + String(jp.day).padStart(2, '0');
  doc.save(`khabarnameh-madares-${fileDate}.pdf`);
}

// ---- کلیدواژه‌های هوش مصنوعی (posts.ai_keywords) — نمایش/ویرایش فقط
// برای مدیر، زیر پست‌های تب‌های «شبکه‌های اجتماعی»/«وب‌سایت‌ها» — برای
// بازبینی رندوم/اصلاح دستی کیفیت استخراج خودکار (نکاه به Edge Function
// extract-post-keywords). NULL یعنی هنوز بررسی نشده؛ آرایه‌ی خالی یعنی
// بررسی شد ولی کلیدواژه‌ی معناداری نداشت.
function keywordChipsHtml(keywords){
  if(keywords == null) return '<span class="news-kw-chip empty">هنوز بررسی نشده</span>';
  if(!keywords.length) return '<span class="news-kw-chip empty">بدون کلیدواژه</span>';
  return keywords.map(k=>`<span class="news-kw-chip">${escAttr(k)}</span>`).join('');
}

function editPostKeywords(id){
  const rowEl = document.getElementById('news-kw-row-'+id);
  const p = POSTS_CACHE.find(x=>x.id===id);
  if(!rowEl || !p) return;
  const current = (p.ai_keywords||[]).join('، ');
  rowEl.innerHTML = `
    <input type="text" id="news-kw-input-${id}" value="${escAttr(current)}" placeholder="کلیدواژه‌ها، جدا با ویرگول" style="flex:1;font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid var(--border-strong);background:var(--surface-2);color:var(--text);font-family:inherit;" />
    <button type="button" class="news-kw-edit-btn" onclick="savePostKeywords(${id})">ذخیره</button>
    <button type="button" class="news-kw-edit-btn" onclick="renderNewsFeed()">انصراف</button>
  `;
  document.getElementById('news-kw-input-'+id).focus();
}

async function savePostKeywords(id){
  const inputEl = document.getElementById('news-kw-input-'+id);
  if(!inputEl) return;
  const keywords = inputEl.value.split(/[,،]/).map(k=>k.trim()).filter(Boolean);
  const r = await api('/posts?id=eq.'+id, {method:'PATCH', headers:{Prefer:'return=minimal'}, body: JSON.stringify({ai_keywords: keywords, ai_keywords_extracted_at: new Date().toISOString()})});
  if(!r.ok){ showToast('انجام نشد؛ اتصال را بررسی کنید و دوباره امتحان کنید.'); return; }
  const p = POSTS_CACHE.find(x=>x.id===id);
  if(p) p.ai_keywords = keywords;
  renderNewsFeed();
}

function updateNewsMoreButtons(list){
  list.forEach(p=>{
    const textEl = document.getElementById('news-text-'+p.id);
    const moreBtn = document.getElementById('news-more-'+p.id);
    if(!textEl || !moreBtn) return;
    const overflowing = textEl.scrollHeight > textEl.clientHeight + 1;
    moreBtn.style.display = overflowing ? '' : 'none';
  });
}

// ترجمه‌ی اختیاری/به‌درخواست هر پست به فارسی — با هوش مصنوعی (لیارا AI
// Gateway، مدل openai/gpt-4o-mini) از طریق یه Supabase Edge Function
// (`supabase/functions/translate`) که کلید API لیارا رو سمت سرور نگه
// می‌داره؛ فرانت‌اند مستقیم به لیارا وصل نمی‌شه چون اون کلید (برخلاف anon
// key) پولیه و هیچ RLSای ازش محافظت نمی‌کنه. توکن ورود خودِ کاربر
// (`authToken`) برای Edge Function فرستاده می‌شه تا فقط کاربر واردشده
// (مدیر/بیننده) بتونه ازش استفاده کنه.
async function aiTranslate(postId){
  // فقط شناسه‌ی پست فرستاده می‌شه، نه خودِ متن — تابع سمت سرور خودش متن
  // واقعی رو با توکن همون کاربر از دیتابیس می‌خونه (نگاه کن به توضیح
  // بالای supabase/functions/translate/index.ts)
  const r = await fetch(SUPABASE_URL + '/functions/v1/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ postId }),
  });
  if(!r.ok) throw new Error('translate request failed');
  return await r.json(); // { title, text }
}

const NEWS_TRANSLATION_CACHE = {}; // id -> {title, text} — تا با toggle رفت‌وبرگشت دوباره درخواست نزنیم

function resetNewsTextExpand(id){
  const t = document.getElementById('news-text-'+id);
  const b = document.getElementById('news-more-'+id);
  if(!t || !b) return;
  t.classList.remove('expanded');
  b.classList.remove('open');
  b.firstChild.textContent = 'نمایش بیشتر ';
}

async function translatePost(id){
  const p = POSTS_CACHE.find(x=>x.id===id);
  const btn = document.getElementById('news-translate-btn-'+id);
  const textEl = document.getElementById('news-text-'+id);
  const titleEl = document.getElementById('news-title-'+id);
  if(!p || !btn || !textEl) return;

  // چون ترجمه به‌جای متن اصلی می‌شینه (نه زیرش)، طول کارت عوض نمی‌شه —
  // برای همینم بعد از هر جایگزینی باید هم حالت «نمایش بیشتر» ریست بشه هم
  // سرریز متن با اندازه‌ی جدید دوباره چک بشه
  if(textEl.classList.contains('is-translated')){
    textEl.innerHTML = claimsTextDisplay(p.text);
    textEl.classList.remove('is-translated');
    if(titleEl){ titleEl.textContent = p.title; titleEl.classList.remove('is-translated'); }
    btn.textContent = 'ترجمه به فارسی';
    resetNewsTextExpand(id);
    updateNewsMoreButtons([p]);
    return;
  }
  const cached = NEWS_TRANSLATION_CACHE[id];
  if(cached){
    textEl.innerHTML = escHtml(cached.text);
    textEl.classList.add('is-translated');
    if(titleEl && cached.title){ titleEl.textContent = cached.title; titleEl.classList.add('is-translated'); }
    btn.textContent = 'بازگشت به متن اصلی';
    resetNewsTextExpand(id);
    updateNewsMoreButtons([p]);
    return;
  }
  const originalLabel = btn.textContent;
  btn.textContent = 'در حال ترجمه…';
  btn.disabled = true;
  try{
    const { title: titleFa, text: textFa } = await aiTranslate(id);
    NEWS_TRANSLATION_CACHE[id] = { title: titleFa, text: textFa };
    textEl.innerHTML = escHtml(textFa);
    textEl.classList.add('is-translated');
    if(titleEl && titleFa){ titleEl.textContent = titleFa; titleEl.classList.add('is-translated'); }
    btn.textContent = 'بازگشت به متن اصلی';
    resetNewsTextExpand(id);
    updateNewsMoreButtons([p]);
  }catch(e){
    btn.textContent = originalLabel;
    showToast('ترجمه ناموفق بود، دوباره امتحان کنید');
  }finally{
    btn.disabled = false;
  }
}

function renderNewsPagination(totalPages){
  renderPagination('news-pagination', newsState.page, totalPages, goNewsPage);
}
// دکمه‌های صفحه‌بندی مشترک (اخبار و رویدادها، پست‌های کنشگری مجازی)
function renderPagination(wrapId, cur, totalPages, goFn){
  const wrap = document.getElementById(wrapId);
  if(!wrap) return;
  if(totalPages <= 1){ wrap.innerHTML = ''; return; }
  const pages = [...new Set([1, totalPages, cur-1, cur, cur+1].filter(p=>p>=1 && p<=totalPages))].sort((a,b)=>a-b);
  let html = `<button ${cur===1?'disabled':''} data-page="${cur-1}">قبلی</button>`;
  let prev = 0;
  pages.forEach(p=>{
    if(prev && p - prev > 1) html += `<span class="dots">…</span>`;
    html += `<button class="${p===cur?'active':''}" data-page="${p}">${toFaDigits(p)}</button>`;
    prev = p;
  });
  html += `<button ${cur===totalPages?'disabled':''} data-page="${cur+1}">بعدی</button>`;
  wrap.innerHTML = html;
  wrap.onclick = e=>{ const b = e.target.closest('button[data-page]'); if(b) goFn(Number(b.dataset.page)); };
}

function goNewsPage(p){
  newsState.page = p;
  renderNewsFeed();
  scrollToListTop(document.querySelector('#news-study-panel .news-filters'));
}

function toggleNewsText(postId){
  const t = document.getElementById('news-text-'+postId);
  const b = document.getElementById('news-more-'+postId);
  if(!t || !b) return;
  const isOpen = t.classList.toggle('expanded');
  b.classList.toggle('open', isOpen);
  b.firstChild.textContent = isOpen ? 'بستن ' : 'نمایش بیشتر ';
}

function setNewsView(mode){
  const feed = document.getElementById('news-feed');
  feed.classList.toggle('grid-view', mode === 'grid');
  document.getElementById('news-view-list-btn').classList.toggle('active', mode === 'list');
  document.getElementById('news-view-grid-btn').classList.toggle('active', mode === 'grid');
}

document.getElementById('news-search-input').addEventListener('input', e=>{
  newsState.query = e.target.value.trim();
  newsState.page = 1;
  document.querySelectorAll('.news-topic-chip').forEach(c=>c.classList.remove('active'));
  const allTopicChip = document.querySelector('.news-topic-chip[data-kw=""]');
  if(allTopicChip) allTopicChip.classList.add('active');
  renderNewsFeed();
});
function updateDateRangeSummary(){
  const summary = document.getElementById('news-daterange-summary');
  const details = document.getElementById('news-daterange-details');
  if(!summary) return;
  const hasValue = !!(newsState.dateFrom || newsState.dateTo);
  if(hasValue){
    const f = newsState.dateFrom ? new Date(newsState.dateFrom).toLocaleDateString('fa-IR') : '…';
    const t = newsState.dateTo ? new Date(newsState.dateTo).toLocaleDateString('fa-IR') : '…';
    summary.textContent = f + ' تا ' + t;
  }else{
    summary.textContent = 'بازه زمانی';
  }
  if(details) details.classList.toggle('has-value', hasValue);
}

function clearNewsDateRange(){
  newsState.dateFrom = ''; newsState.dateTo = '';
  document.querySelectorAll('#news-daterange-details .jdate select').forEach(sel=>{ sel.value = ''; });
  updateDateRangeSummary();
}

document.getElementById('news-time-seg').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b || !b.dataset.t) return;
  document.querySelectorAll('#news-time-seg > button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  newsState.time = b.dataset.t;
  newsState.page = 1;
  clearNewsDateRange();
  document.getElementById('news-daterange-details').removeAttribute('open');
  renderNewsFeed();
});
function applyNewsDateRange(){
  newsState.time = 'custom';
  document.querySelectorAll('#news-time-seg > button').forEach(x=>x.classList.remove('active'));
  newsState.page = 1;
  updateDateRangeSummary();
  renderNewsFeed();
}
// انتخاب‌گر شمسی بازه (به‌جای تقویم میلادی مرورگر): سه فهرست روز/ماه/سال برای هر سر بازه؛
// با انتخاب هر کدوم، بقیه از امروز پر می‌شن. newsState.dateFrom/dateTo همون رشته‌ی میلادی
// YYYY-MM-DD می‌مونه تا فیلتر دست نخوره.
function setupJalaliRange(details, onPick){
  const today = calParts(new Date(), 'persian');
  details.querySelectorAll('.jdate').forEach(box=>{
    const opt = (v, t)=>`<option value="${v}">${t}</option>`;
    let days = opt('', 'روز'), months = opt('', 'ماه'), years = opt('', 'سال');
    for(let d = 1; d <= 31; d++) days += opt(d, toFaDigits(d));
    JALALI_MONTHS.forEach((m, i)=>{ months += opt(i + 1, m); });
    for(let y = today.year; y >= today.year - 2; y--) years += opt(y, toFaDigits(y));
    box.innerHTML = `<select data-part="d" aria-label="روز">${days}</select><select data-part="m" aria-label="ماه">${months}</select><select data-part="y" aria-label="سال">${years}</select>`;
    box.addEventListener('change', ()=>{
      const get = k=>box.querySelector(`select[data-part="${k}"]`);
      // با اولین انتخاب، بخش‌های خالی از امروز پر می‌شن
      if(!get('y').value) get('y').value = today.year;
      if(!get('m').value) get('m').value = today.month;
      if(!get('d').value) get('d').value = today.day;
      const jy = +get('y').value, jm = +get('m').value;
      let jd = +get('d').value;
      const ml = jalaliMonthLength(jy, jm);
      if(jd > ml){ jd = ml; get('d').value = ml; }
      const g = jalaliToGregorian(jy, jm, jd);
      const iso = g[0] + '-' + String(g[1]).padStart(2, '0') + '-' + String(g[2]).padStart(2, '0');
      onPick(box.dataset.which, iso);
    });
  });
}
setupJalaliRange(document.getElementById('news-daterange-details'), (which, iso)=>{
  if(which === 'from') newsState.dateFrom = iso; else newsState.dateTo = iso;
  applyNewsDateRange();
});
document.getElementById('news-daterange-clear').addEventListener('click', (e)=>{
  e.stopPropagation();
  clearNewsDateRange();
  newsState.time = 'all';
  document.querySelectorAll('#news-time-seg > button').forEach(x=>x.classList.toggle('active', x.dataset.t==='all'));
  document.getElementById('news-daterange-details').removeAttribute('open');
  newsState.page = 1;
  renderNewsFeed();
});
document.getElementById('news-region-row').addEventListener('click', e=>{
  const chip = e.target.closest('.news-region-chip'); if(!chip) return;
  document.querySelectorAll('.news-region-chip').forEach(c=>c.classList.remove('active'));
  chip.classList.add('active');
  newsState.region = chip.dataset.r;
  newsState.page = 1;
  renderNewsFeed();
});
document.getElementById('news-topic-row').addEventListener('click', e=>{
  const chip = e.target.closest('.news-topic-chip'); if(!chip) return;
  document.querySelectorAll('.news-topic-chip').forEach(c=>c.classList.remove('active'));
  chip.classList.add('active');
  newsState.query = chip.dataset.kw;
  document.getElementById('news-search-input').value = chip.dataset.kw;
  newsState.page = 1;
  renderNewsFeed();
});
document.getElementById('newspaper-date-tabs').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b || !b.dataset.date) return;
  newspaperState.date = b.dataset.date;
  renderNewspapers();
});
// ---- فیلتر و سایدبار تب «پرونده‌های موضوعی» ----
document.getElementById('dossier-time-seg').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b || !b.dataset.t) return;
  document.querySelectorAll('#dossier-time-seg > button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  dossierState.time = b.dataset.t;
  renderDossierTab();
});
document.getElementById('dossier-sidebar').addEventListener('click', e=>{
  const btn = e.target.closest('.dossier-nav-item'); if(!btn) return;
  dossierState.topicId = Number(btn.dataset.topic);
  renderDossierTab();
});

async function loadChannels(){
  const r = await api('/channels?select=*&order=added_at.desc');
  CHANNELS = r.ok ? await r.json() : [];
}
async function loadCategories(){
  const r = await api('/categories?select=*&order=name.asc');
  CATEGORIES = r.ok ? await r.json() : [];
}
async function loadRegions(){
  const r = await api('/regions?select=*&order=id.asc');
  REGIONS = r.ok ? await r.json() : [];
}
async function loadProfileGroups(){
  const r = await api('/profile_groups?select=*&order=sort_order.asc,id.asc');
  PROFILE_GROUPS = r.ok ? await r.json() : [];
}
async function loadChannelProfileGroups(){
  const r = await api('/channel_profile_groups?select=id,channel_id,group_id');
  CHANNEL_PROFILE_GROUPS = r.ok ? await r.json() : [];
}
async function loadNewsTopics(){
  const r = await api('/news_topics?select=*&order=sort_order.asc');
  NEWS_TOPICS = r.ok ? await r.json() : [];
}
async function loadDossierTopics(){
  const r = await api('/dossier_topics?select=*&order=sort_order.asc');
  DOSSIER_TOPICS = r.ok ? await r.json() : [];
}
async function loadDossierTopicPosts(){
  const r = await api('/dossier_topic_posts?select=*&order=created_at.desc&limit=2000');
  DOSSIER_TOPIC_POSTS = r.ok ? await r.json() : [];
}
async function loadNewsletterPosts(){
  // select=*,posts(*) پست واقعی رو مستقیم embed می‌کنه به‌جای اینکه بعداً
  // از POSTS_CACHE (که سقف ۱۰۰۰تایی داره و پست‌های ادعا/شایعه زود ازش
  // بیرون می‌افتن) پیدا بشه — نگاه کن به buildNewsletterPrintHtml
  const r = await api('/newsletter_posts?select=*,posts(*)&order=section.asc,sort_order.asc');
  // پست پنهان‌شده: برای بیننده posts=null (RLS)، برای مدیر hidden_at پر
  NEWSLETTER_POSTS = (r.ok ? await r.json() : []).filter(np=>np.posts && !np.posts.hidden_at);
}
// هر سه کوئری (اصلی/حوزه/بله) دقیقاً هم‌زمان، از همون خط اول، ارسال
// می‌شن — نه اینکه hawza/claims منتظر تموم‌شدن کامل کوئری اصلی (که با
// ۱۰۰۰ ردیف کندترینه) بمونن. قبلاً hawza/claims داخل loadPosts() بعد از
// `await r.json()` کوئری اصلی صدا زده می‌شدن، یعنی اصلاً درخواستشون تا
// اون لحظه ارسال نمی‌شد — نتیجه‌ش یه زنجیره‌ی پشت‌سرهم واقعی بود (کوئری
// اصلی + کوئری حوزه، جمعاً حدود ۳ ثانیه) با اینکه ظاهراً «موازی» به‌نظر
// می‌رسید چون Promise.all دورشون بود. اینجا fetch هر سه با فراخوانی
// مستقیم api() (نه صبرکردن پشت await) بلافاصله شروع می‌شن؛ فقط ادغام
// نتیجه‌ها توی POSTS_CACHE منتظر هر سه جواب می‌مونه (بخش «سرعت ورود»
// CLAUDE.md رو ببین).
async function loadPosts(){
  const mainReq = api('/posts?select=*&order=scraped_at.desc&limit=1000');
  const hawzaReq = loadHawzaPosts();
  const claimsReq = loadClaimsPosts();
  const r = await mainReq;
  POSTS_CACHE = r.ok ? await r.json() : [];
  const [hawzaExtra, claimsExtra] = await Promise.all([hawzaReq, claimsReq]);
  const existingIds = new Set(POSTS_CACHE.map(p=>p.id));
  for(const p of [...hawzaExtra, ...claimsExtra]){
    if(!existingIds.has(p.id)){ POSTS_CACHE.push(p); existingIds.add(p.id); }
  }
  // پست‌های پنهان‌شده (migration_039): بیننده از خودِ دیتابیس نمی‌گیره، مدیر
  // می‌گیره ولی در هیچ فید/تحلیلی نشون داده نمی‌شن (فقط «گزارش فعالیت»)
  POSTS_CACHE = POSTS_CACHE.filter(p=>!p.hidden_at);
}

// تب «اخبار حوزه» روی همون POSTS_CACHE سوار می‌شه (بخش «تب «اخبار حوزه»»ی
// CLAUDE.md رو ببین)، ولی چون فرکانس پست‌های کانال‌های حوزه‌ای خیلی کمتر از
// بقیه‌ی سایته، جدیدترین پست hawza_relevant=true معمولاً خیلی زودتر از سقف
// ۱۰۰۰تاییِ loadPosts() (که کل سایت رو با هم می‌بینه) از کش بیرون می‌افته —
// یه‌بار واقعاً رخ داد: با این‌که ۵۴ پست واقعی مرتبط توی دیتابیس بود، تب
// کاملاً خالی به‌نظر می‌رسید چون هیچ‌کدوم توی همون ۱۰۰۰تای اخیر نبودن. این
// کوئری جدا و مستقل، مستقیم روی hawza_relevant=true فیلتر می‌کنه (بدون
// وابستگی به تازگیِ scraped_at نسبت به بقیه‌ی سایت). ⚠️ برخلاف قبل، دیگه
// مستقیم POSTS_CACHE رو تغییر نمی‌ده — فقط آرایه‌ی نتیجه رو برمی‌گردونه؛
// ادغام/حذف تکراری توی خودِ loadPosts() بعد از رسیدن هر سه جواب انجام
// می‌شه (برای اینکه بشه fetch رو زودتر و مستقل از کوئری اصلی فرستاد).
async function loadHawzaPosts(){
  const r = await api('/posts?select=*&hawza_relevant=eq.true&order=posted_at.desc&limit=300');
  return r.ok ? await r.json() : [];
}
// همون الگوی loadHawzaPosts بالا — تب «ادعاها و شایعات» فقط از کانال بله
// «رصد شایعات» تغذیه می‌شه که فرکانسش (چندبار در روز) به‌مراتب کمتر از
// بقیه‌ی سایته (ایتا/تلگرام/RSS هر ۲ ساعت، روی ده‌ها کانال)؛ پست‌های تازه‌ی
// بله معمولاً طی چند ساعت از سقف ۱۰۰۰تاییِ loadPosts() بیرون می‌افتادن و
// تب کاملاً خالی به‌نظر می‌رسید با اینکه کالکتور collect_bale.py هر بار
// موفق داده‌ی تازه پیدا می‌کرد.
async function loadClaimsPosts(){
  const r = await api('/posts?select=*&platform=eq.bale&order=posted_at.desc&limit=300');
  return r.ok ? await r.json() : [];
}
async function loadMagazines(){
  const r = await api('/magazines?select=*&order=sort_order.asc,uploaded_at.desc');
  MAGAZINES = r.ok ? await r.json() : [];
}
async function loadArchiveReports(){
  const r = await api('/archive_reports?select=*&order=sort_order.asc,uploaded_at.desc');
  ARCHIVE_REPORTS = r.ok ? await r.json() : [];
}
async function loadNewspapers(){
  // limit=1000: کیوسک جار حدود ۱۶۵ عنوان در روز داره و مدت نگهداری رسانه (۵.۲۵.۰) تا ۳ روز
  // می‌ره → تب «روزنامه‌ها» تا ۴ برگه‌ی تاریخ (~۶۶۰ ردیف). ۵۰۰ قبلی روز چهارم رو ناقص
  // می‌آورد. فیلتر تاریخ نذاشتیم چون جلدهای آخرین تاریخ (تعطیلی طولانی) هیچ‌وقت پاک نمی‌شن.
  const r = await api('/newspapers?select=*&order=edition_date.desc,title.asc&limit=1000');
  NEWSPAPERS = r.ok ? await r.json() : [];
}
async function loadNewsAiInsights(){
  const r = await api('/news_ai_insights?select=*&order=computed_at.desc&limit=1');
  const rows = r.ok ? await r.json() : [];
  NEWS_AI_INSIGHTS = rows.length ? rows[0] : null;
}
async function loadSchoolReports(){
  const r = await api('/school_reports?select=*&order=sort_order.asc,uploaded_at.desc');
  SCHOOL_REPORTS = r.ok ? await r.json() : [];
  await signSchoolReports(SCHOOL_REPORTS);
}
// bucket «school-reports» از مهر ۱۴۰۵ خصوصیه (migration_038) — عکس‌ها با signed URL چندساعته
// نمایش داده می‌شن و فایل‌های PDF/اکسل با signed URL شصت‌ثانیه‌ای باز می‌شن (مثل مجلات).
// تا وقتی migration اجرا نشده، امضا شکست می‌خوره و نشانی عمومی قبلی (image_url) استفاده می‌شه.
const SCHOOL_REPORT_IMG_TTL = 6 * 3600;
function schoolReportPath(r){
  if(r.media_storage_path) return r.media_storage_path;
  const m = /\/school-reports\/([^?]+)$/.exec(r.image_url || '');
  return m ? m[1] : null;
}
function schoolReportSrc(r){ return r.signed_url || r.image_url; }
async function signSchoolReports(rows){
  const paths = [...new Set(rows.map(schoolReportPath).filter(Boolean))];
  if(!paths.length) return;
  try{
    const res = await fetch(SUPABASE_URL + '/storage/v1/object/sign/school-reports', {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: SCHOOL_REPORT_IMG_TTL, paths }),
    });
    if(!res.ok) throw new Error('sign failed');
    const out = await res.json();
    const map = new Map((Array.isArray(out) ? out : []).filter(x => x && x.signedURL && !x.error).map(x => [x.path, SUPABASE_URL + '/storage/v1' + x.signedURL]));
    rows.forEach(r => { r.signed_url = map.get(schoolReportPath(r)) || null; });
  }catch(e){
    rows.forEach(r => { r.signed_url = null; });
  }
}



async function renderDashHeroStats(){
  const wrap = document.getElementById('dash-hero-stats');
  if(!wrap) return;

  // پنج کارت = مسیر کار سامانه از منبع تا تحلیل (۵.۳۰.۰، خواست کاربر: کارت‌ها «منطقی و به هم
  // مرتبط» باشن): از کجا (منبع رصد) ← چقدر (محتوای رصد شده) ← زنده بودن (رصد امروز) ← در چه
  // حوزه‌هایی (بخش رصد) ← حاصل کار (بسته تحلیلی). قبلاً «خبرگزاری»/«کنشگر مجازی» (دو زیرمجموعه‌ی
  // ناقص منابع) و «مدارس علمیه» (عدد دستی ۱۲۶) بود.
  // همه‌ی عددها با count=exact از خودِ جدول‌ها (نه از کش‌های محدود POSTS_CACHE/NEWSPAPERS).
  // «محتوای رصد شده»/«رصد امروز» = پست‌ها + روزنامه‌ها + یافته‌های خزنده‌ی «درباره حوزه» از سایت‌ها
  // (hawza_mentions با post_id خالی؛ یافته‌های شبکه‌های اجتماعی خودشون پست‌ان و دوباره شمرده نمی‌شن).
  // scraped_at فقط موقع درج اول پر می‌شه (کالکتورها روی upsert دوباره‌اش نمی‌نویسن)، پس پست
  // قدیمیِ دوباره‌اسکن‌شده در «رصد امروز» نمیاد.
  const todayIso = encodeURIComponent(new Date(iranTodayStartMs()).toISOString());
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Tehran', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
  const CRAWL_ONLY = '/hawza_mentions?post_id=is.null&hidden_at=is.null';
  const [postsTotal, newspapersTotal, crawlTotal, postsToday, newspapersToday, crawlToday, sources] = await Promise.all([
    fetchExactCount('/posts'),
    fetchExactCount('/newspapers'),
    fetchExactCount(CRAWL_ONLY),
    fetchExactCount('/posts?scraped_at=gte.' + todayIso),
    fetchExactCount('/newspapers?edition_date=eq.' + todayStr),
    fetchExactCount(CRAWL_ONLY + '&scraped_at=gte.' + todayIso),
    fetchMonitoredSourceCount(),
  ]);
  const trackedContentCount = postsTotal + newspapersTotal + crawlTotal;
  const todayCount = postsToday + newspapersToday + crawlToday;
  const sourceCount = sources;

  // «بخش رصد» — زیربخش‌های عرصه‌هایی که بیننده زیر همین هرو در «عرصه‌های رصد و پایش» می‌بینه
  // (خواست کاربر: ملاک تب‌ها باشن، نه خودِ عرصه‌ها): هر تب = یک بخش، عرصه‌ی بی‌تب = یک بخش؛
  // کارت‌های «به‌زودی»، بخش/تب‌های پنهان‌شده از «نمایش سایت» و تب‌های هنوز راه‌نیفتاده نه
  const DOMAIN_PLACEHOLDER_TABS = new Set(['public/trends']); // «در حال راه‌اندازی» — با راه‌افتادن از اینجا برداشته بشه
  const domainCount = [...document.querySelectorAll('.domain-card[data-vis]')]
    .filter(c=>!c.classList.contains('soon-item') && !visHidden(c.dataset.vis))
    .reduce((n, c)=>{
      const it = SITE_VIS_ITEMS.find(x=>x.key === c.dataset.vis);
      if(!it || !it.tabs.length) return n + 1;
      return n + it.tabs.filter(([t])=>!DOMAIN_PLACEHOLDER_TABS.has(it.key + '/' + t) && !visHidden(it.key + '/' + t)).length;
    }, 0);

  const magazinesCount = MAGAZINES.length; // «بسته تحلیلی» — مجلات خودِ جریان

  const ic = d => `<span class="dash-hero-stat-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg></span>`;
  const stat = (icon, value, label) => `<div class="dash-hero-stat">${ic(icon)}<span class="dash-hero-stat-t"><b data-value="${value}">۰</b><span class="dash-hero-stat-l">${label}</span></span></div>`;
  wrap.innerHTML =
    stat('<circle cx="12" cy="12" r="2"/><path d="M8.5 15.5a5 5 0 010-7M15.5 8.5a5 5 0 010 7M5.6 18.4a9 9 0 010-12.8M18.4 5.6a9 9 0 010 12.8"/>', sourceCount, 'منبع رصد') +
    stat('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>', trackedContentCount, 'محتوای رصد شده') +
    stat('<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>', todayCount, 'رصد امروز') +
    stat('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6.4-6.4"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>', domainCount, 'بخش رصد') +
    stat('<path d="M2 5.5c2.5-1 6-1 10 1.5 4-2.5 7.5-2.5 10-1.5V19c-2.5-1-6-1-10 1.5C8 18 4.5 18 2 19z"/><path d="M12 7v13.5"/>', magazinesCount, 'بسته تحلیلی');
  animateHeroStatCounters(wrap);
}

// «۳۷٬۹۶۶» — جداکننده‌ی هزارگان فارسی برای خوانایی عددهای بزرگ
function fmtHeroStat(n){ return toFaDigits(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '٬')); }
function animateHeroStatCounters(wrap){
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  wrap.querySelectorAll('.dash-hero-stat b').forEach((el, i) => {
    const target = Number(el.dataset.value) || 0;
    if(reduceMotion || typeof gsap === 'undefined' || !target){
      el.textContent = fmtHeroStat(target);
      return;
    }
    const counter = { val: 0 };
    gsap.to(counter, {
      val: target, duration: 1.1, delay: 0.15 + i * 0.05, ease: 'power2.out',
      onUpdate: () => { el.textContent = fmtHeroStat(Math.round(counter.val)); },
    });
  });
}

async function loadAll(){
  // loadPosts() قبلاً بعد از این Promise.all و پشت‌سرش می‌اومد (کاملاً
  // پشت‌سرهم با ۱۲ کوئری دیگه) — چون به هیچ‌کدوم از این ۱۲ تا وابسته
  // نیست، همینجا داخل همون دسته‌ی موازی اجرا می‌شه؛ با اضافه‌شدن دو
  // کوئری اضافه‌ی پشت‌سرهم داخل خودِ loadPosts (loadHawzaPosts/
  // loadClaimsPosts) این تأخیر برای زمان ورود به سایت محسوس شده بود
  // (بخش «سرعت ورود» CLAUDE.md رو ببین).
  await Promise.all([loadChannels(), loadCategories(), loadRegions(), loadNewsTopics(), loadDossierTopics(), loadDossierTopicPosts(), loadNewsletterPosts(), loadMagazines(), loadArchiveReports(), loadNewspapers(), loadSchoolReports(), loadNewsAiInsights(), loadProfileGroups(), loadChannelProfileGroups(), loadPosts(), loadAnnouncements(), loadHiddenPostIds(), loadSiteSettings(), loadNewsPickEdits()]);
  renderAnnBar();
  renderDashHeroStats();
  renderChannelCards();
  populatePostFilters();
  renderPosts();
  renderCyberPeopleGrid();
  populatePoliticalFiguresSourceOptions();
  renderPoliticalFigures();
  populateExportFilters();
  refreshCatOptions();
  renderCatGrid();
  refreshRegionOptions();
  renderRegionGrid();
  renderNewsRegionChips();
  renderNewsTopicRow();
  renderTopicGrid();
  renderProfileGroupAdmin();
  renderDossierTopicAdminList();
  renderChanList();
  renderMagazines();
  renderArchiveReports();
  renderNewspapers();
  populateNewsSourceOptions();
  renderNewsFeed();
  renderSchoolReports();
  applySiteVisibility();
}

// ---- schools page: گزارش‌های تحلیل Power BI — هر عکس تمام‌عرض، پشت‌سرهم ----

// ---- نمایش سایت: حالت تعمیر + روشن/خاموش کردن بخش‌ها (migration_042) ----
// جدول site_settings: key='maintenance' → {on, message, until}، key='hidden_sections' →
// آرایه‌ی «بخش» یا «بخش/تب» پنهان از بیننده‌ها. مدیر همه‌چیز رو با برچسب «پنهان» می‌بینه.
// این فقط پنهان‌کردن رابطه (داده‌ها با RLS همچنان خواندنی‌ان) — برای «در دست ساخت»/مشکل موقت.
// بخش/تب جدید → به SITE_VIS_ITEMS (و اگه تب‌بار تازه‌ست، به visTargets) اضافه بشه.
// var (نه const/let): switchSection و setNewsPageTab ممکنه پیش از رسیدن اجرا به این خط صدا زده بشن
var SITE_VIS_ITEMS = [
  { key:'overview', name:'اخبار و رویدادها', tabs:[['analytics','در یک نگاه'],['claims','ادعاها و شایعات'],['study','شبکه‌های اجتماعی'],['website','وب‌سایت‌ها'],['newspapers','روزنامه‌ها'],['dossier','پرونده‌های موضوعی'],['newsletter','خبرنامه مدارس']] },
  { key:'people', name:'یادداشت‌ها', tabs:[['orgs','تحلیل سازمان‌ها'],['figures','چهره‌ها و فعالان سیاسی'],['thinktanks','اندیشکده‌ها و پژوهشگاه‌ها'],['archive','بسته‌های تحلیلی']] },
  { key:'hawza', name:'درباره حوزه', tabs:[['news','اخبار حوزه'],['about','آنچه درباره حوزه گفته می‌شود']] },
  { key:'posts', name:'کنشگری مجازی', tabs:[['feed','پست‌های منتشر شده'],['people','افراد و مجموعه‌ها']] },
  { key:'schools', name:'برنامه مدارس', tabs:[] },
  { key:'positions', name:'مواضع مراجع و علماء', tabs:[['leader','رهبر انقلاب'],['maraji','مراجع و علماء'],['hawza','حوزه‌های علمیه'],['imams','ائمه جمعه'],['orgs','تشکل‌ها و نخبگان']] },
  { key:'public', name:'درباره مردم', tabs:[['trends','جست‌وجوهای داغ مردم']] },
  { key:'laws', name:'قوانین و مصوبات', tabs:[] },
  { key:'ask', name:'از جریان بپرس', tabs:[] },
  { key:'reports', name:'بسته تحلیلی جریان', tabs:[] },
];
const MAINT_DEFAULT_MSG = 'سامانه در حال به‌روزرسانی است و به‌زودی در دسترس خواهد بود.';
var SITE_SETTINGS = { maintenance:{ on:false, message:'', until:'' }, hidden_sections:[] };
var SITE_SETTINGS_MISSING = false;
var SITE_POLL_TIMER = null;
async function loadSiteSettings(){
  try{
    const r = await api('/site_settings?select=key,value');
    SITE_SETTINGS_MISSING = r.status === 404 || r.status === 400;
    if(!r.ok) return;
    (await r.json()).forEach(x=>{ SITE_SETTINGS[x.key] = x.value; });
  }catch(e){}
}
function maintOn(){ return !!(SITE_SETTINGS.maintenance && SITE_SETTINGS.maintenance.on); }
function siteHiddenSet(){ const h = SITE_SETTINGS.hidden_sections; return new Set(Array.isArray(h) ? h : []); }
// key = «بخش» یا «بخش/تب»؛ بخشی که همه‌ی تب‌هاش خاموشه هم پنهان حساب می‌شه
function visHidden(key){
  if(!key || key === 'dashboard') return false;
  const h = siteHiddenSet(), sec = key.split('/')[0];
  if(h.has(sec) || h.has(key)) return true;
  const it = SITE_VIS_ITEMS.find(x=>x.key === sec);
  return !key.includes('/') && !!it && it.tabs.length > 0 && it.tabs.every(([t])=>h.has(sec + '/' + t));
}
function viewerHidden(key){ return currentRole !== 'app_admin' && visHidden(key); }
function firstVisibleTab(sec){
  const it = SITE_VIS_ITEMS.find(x=>x.key === sec);
  const t = it && it.tabs.find(([t])=>!visHidden(sec + '/' + t));
  return t ? t[0] : null;
}
// کنشگری/یادداشت‌ها تب پیش‌فرض دارن که ممکنه پنهان باشه → اولین تب قابل‌مشاهده
function ensureVisibleTab(sec){
  if(currentRole === 'app_admin') return;
  const bar = sec === 'posts' ? ['#posts-page-tabs', 'posts-tab', 'postsTab'] : sec === 'people' ? ['#people-page-tabs', 'people-tab', 'peopleTab'] : null;
  if(!bar) return;
  const act = document.querySelector(bar[0] + ' button.active');
  if(act && viewerHidden(sec + '/' + act.dataset[bar[2]])){ const t = firstVisibleTab(sec); if(t) navClickTab(bar[0], bar[1], t); }
}
function visTargets(){
  const out = [];
  document.querySelectorAll('[data-nav], [data-vis]').forEach(el=>out.push([el, el.dataset.vis || el.dataset.nav]));
  document.querySelectorAll('#sec-overview .news-page-tabs button[id^="news-tab-"]').forEach(b=>out.push([b, 'overview/' + b.id.slice(9)]));
  document.querySelectorAll('#people-page-tabs button[data-people-tab]').forEach(b=>out.push([b, 'people/' + b.dataset.peopleTab]));
  document.querySelectorAll('#hawza-page-tabs button[id^="hawza-tab-"]').forEach(b=>out.push([b, 'hawza/' + b.id.slice(10)]));
  document.querySelectorAll('#posts-page-tabs button[data-posts-tab]').forEach(b=>out.push([b, 'posts/' + b.dataset.postsTab]));
  document.querySelectorAll('#positions-page-tabs button[data-pos-tab]').forEach(b=>out.push([b, 'positions/' + b.dataset.posTab]));
  document.querySelectorAll('#public-page-tabs button[data-public-tab]').forEach(b=>out.push([b, 'public/' + b.dataset.publicTab]));
  return out;
}
function applySiteVisibility(){
  const admin = currentRole === 'app_admin';
  visTargets().forEach(([el, key])=>{
    const off = visHidden(key);
    el.classList.toggle('vis-off', off);
    el.querySelectorAll(':scope > .vis-badge').forEach(b=>b.remove());
    if(off && admin){
      const b = document.createElement('span');
      b.className = 'vis-badge'; b.textContent = 'پنهان'; b.title = 'برای بیننده‌ها پنهان است (تنظیمات بخش‌ها ← نمایش سایت)';
      el.appendChild(b);
    }
  });
  // قوس «مدار» برای دقیقاً پنج کارت جای‌گذاری شده — با کارت پنهان کنار می‌ره
  const grid = document.querySelector('.domain-grid');
  if(grid) grid.classList.toggle('vis-partial', !admin && !!grid.querySelector('.domain-card.vis-off'));
  layoutOrbit2();
  document.getElementById('maint-admin-bar').hidden = !(admin && maintOn());
  requestAnimationFrame(()=>document.querySelectorAll('.section.active .news-page-tabs').forEach(bar=>updateTabInk(bar, true)));
}
function showMaintView(){
  const m = SITE_SETTINGS.maintenance || {};
  document.getElementById('maint-msg').textContent = String(m.message || '').trim() || MAINT_DEFAULT_MSG;
  const u = document.getElementById('maint-until'), until = String(m.until || '').trim();
  u.hidden = !until; u.textContent = 'زمان تقریبی بازگشت: ' + until;
  document.body.classList.remove('app-loading');
  document.documentElement.classList.remove('has-session');
  show('view-maint');
}
async function retryMaintenance(){
  const btn = document.getElementById('maint-retry-btn');
  btn.disabled = true; btn.textContent = 'در حال بررسی…';
  try{
    await loadSiteSettings();
    // نشست منقضی شده → loadAllAndEnter پیام «نشست منقضی شد» رو روی صفحه‌ی ورود نشون می‌ده
    if(SESSION_EXPIRED){ await loadAllAndEnter(); return; }
    if(maintOn()){ showMaintView(); showToast('سامانه هنوز در حال به‌روزرسانی است؛ کمی بعد دوباره امتحان کنید.'); }
    else await loadAllAndEnter();
  }finally{ btn.disabled = false; btn.textContent = 'بررسی دوباره'; }
}
// هر ۵ دقیقه (فقط با نشست باز): روشن شدن حالت تعمیر یا پنهان شدن بخشی که کاربر داخلشه
function startSitePoll(){
  clearInterval(SITE_POLL_TIMER);
  SITE_POLL_TIMER = setInterval(async ()=>{
    if(!authToken) return;
    await loadSiteSettings();
    if(SESSION_EXPIRED && document.getElementById('view-maint').classList.contains('active')){ loadAllAndEnter(); return; }
    const admin = currentRole === 'app_admin';
    const inDash = document.getElementById('view-dash').classList.contains('active');
    if(!admin && maintOn()){ if(inDash) showMaintView(); return; }
    if(document.getElementById('view-maint').classList.contains('active')){ loadAllAndEnter(); return; }
    applySiteVisibility();
    if(inDash && !admin){
      const st = navCurrentState();
      if(viewerHidden(st.s)) switchSection('dashboard');
      else if(st.t && viewerHidden(st.s + '/' + st.t)) navApply({ s: st.s, t: firstVisibleTab(st.s) });
    }
  }, 5*60000);
}
// پیام حالت تعمیر روی صفحه‌ی ورود (anon فقط همین ردیف رو می‌خونه)
async function loadLoginMaintNotice(){
  const el = document.getElementById('login-maint');
  try{
    // ۵.۳۱.۱: anon کلید «ورود اضطراری با رمز مشترک» را هم می‌خواند (migration_051) — پیوند فقط وقتی روشنه
    const r = await fetch(SUPABASE_URL + '/rest/v1/site_settings?select=key,value&key=in.(maintenance,viewer_password_login)', { headers:{ apikey: SUPABASE_ANON_KEY } });
    const rows = r.ok ? await r.json() : [];
    const emerg = rows.some(x=>x.key === 'viewer_password_login' && x.value === true);
    document.getElementById('login-mode-switch').hidden = !emerg;
    if(!emerg && LOGIN_MODE === 'password') setLoginMode('otp');
    const mr = rows.find(x=>x.key === 'maintenance');
    const m = mr && mr.value;
    if(!m || !m.on){ el.hidden = true; return; }
    const until = String(m.until || '').trim();
    el.innerHTML = '<b>سامانه در حال به‌روزرسانی است</b><span>' + escHtml(String(m.message || '').trim() || MAINT_DEFAULT_MSG) + (until ? ' زمان تقریبی بازگشت: ' + escHtml(until) : '') + '</span><span class="login-maint-admin">ورود مدیر امکان‌پذیر است.</span>';
    el.hidden = false;
  }catch(e){ el.hidden = true; }
}

// ---- بخش «نمایش سایت» در تنظیمات (فقط مدیر) ----
function openSiteSettingsPanel(which){
  switchSection('settings');
  const d = document.getElementById(which === 'maint' ? 'ss-maint-panel' : 'ss-vis-panel');
  d.open = true;
  setTimeout(()=>d.scrollIntoView({ behavior:'smooth', block:'start' }), 60);
}
function renderSiteSettingsAdmin(){
  document.getElementById('ss-missing').hidden = !SITE_SETTINGS_MISSING;
  ['ss-maint-save', 'ss-vis-save'].forEach(id=>{ document.getElementById(id).disabled = SITE_SETTINGS_MISSING; });
  const m = SITE_SETTINGS.maintenance || {};
  const on = document.getElementById('ss-maint-on');
  on.checked = !!m.on;
  document.getElementById('ss-maint-box').classList.toggle('on', !!m.on);
  document.getElementById('ss-maint-msg').value = m.message || '';
  document.getElementById('ss-maint-until').value = m.until || '';
  updateMaintCounter();
  document.getElementById('ss-maint-sum').textContent = m.on ? 'روشن است — سایت برای بیننده‌ها بسته است' : 'خاموش — سایت برای همه باز است';
  document.getElementById('ss-maint-sum').classList.toggle('ss-sum-on', !!m.on);
  const h = siteHiddenSet();
  document.getElementById('ss-vis-list').innerHTML = SITE_VIS_ITEMS.map(it=>{
    const secOn = !h.has(it.key);
    return `<div class="ce-section ${secOn ? 'on' : ''}" data-ss-sec="${it.key}">
      <label class="ce-section-toggle"><input type="checkbox" data-ss="${it.key}" ${secOn ? 'checked' : ''}/>
        <span><b>${escHtml(it.name)}</b><span>${it.tabs.length ? 'تیک تب‌هایی را که نباید دیده شوند بردارید.' : 'این بخش تب ندارد.'}</span></span></label>
      ${it.tabs.length ? `<div class="ce-section-extra">${it.tabs.map(([t, n])=>`<label class="ce-check"><input type="checkbox" data-ss="${it.key}/${t}" ${h.has(it.key + '/' + t) ? '' : 'checked'}/>${escHtml(n)}</label>`).join('')}</div>` : ''}
    </div>`;
  }).join('');
  const n = SITE_VIS_ITEMS.filter(it=>visHidden(it.key)).length + SITE_VIS_ITEMS.reduce((a, it)=>a + (visHidden(it.key) ? 0 : it.tabs.filter(([t])=>h.has(it.key + '/' + t)).length), 0);
  document.getElementById('ss-vis-sum').textContent = n ? faNum(n) + ' بخش یا تب برای بیننده‌ها پنهان است' : 'همه‌ی بخش‌ها برای بیننده‌ها نمایش داده می‌شوند';
  document.getElementById('ss-vis-sum').classList.toggle('ss-sum-on', n > 0);
}
function updateMaintCounter(){
  document.getElementById('ss-maint-counter').textContent = faNum(document.getElementById('ss-maint-msg').value.length) + ' / ۲۰۰';
}
document.getElementById('ss-maint-msg').addEventListener('input', updateMaintCounter);
document.getElementById('ss-maint-on').addEventListener('change', e=>document.getElementById('ss-maint-box').classList.toggle('on', e.target.checked));
document.getElementById('ss-vis-list').addEventListener('change', e=>{
  const inp = e.target.closest('input[data-ss]'); if(!inp || inp.dataset.ss.includes('/')) return;
  inp.closest('.ce-section').classList.toggle('on', inp.checked);
});
async function saveSiteSetting(key, value){
  const r = await api('/site_settings?key=eq.' + key, { method:'PATCH', headers:{ Prefer:'return=representation' }, body: JSON.stringify({ value, updated_at: new Date().toISOString() }) });
  if(!r.ok) throw new Error('site_settings ' + r.status);
  if(!(await r.json()).length){
    const r2 = await api('/site_settings', { method:'POST', body: JSON.stringify({ key, value }) });
    if(!r2.ok) throw new Error('site_settings insert ' + r2.status);
  }
  SITE_SETTINGS[key] = value;
}
async function saveMaintenance(){
  const value = {
    on: document.getElementById('ss-maint-on').checked,
    message: document.getElementById('ss-maint-msg').value.trim().slice(0, 200),
    until: document.getElementById('ss-maint-until').value.trim().slice(0, 60),
  };
  const was = maintOn();
  if(value.on && !was && !await uiConfirm('روشن کردن حالت تعمیر\nبیننده‌ها تا وقتی آن را خاموش کنید، به‌جای سایت فقط پیام به‌روزرسانی را می‌بینند. شما به‌عنوان مدیر همچنان وارد می‌شوید.')) return;
  const btn = document.getElementById('ss-maint-save');
  btn.disabled = true;
  try{
    await saveSiteSetting('maintenance', value);
    showToast(value.on ? (was ? 'پیام حالت تعمیر به‌روز شد.' : 'حالت تعمیر روشن شد؛ سایت برای بیننده‌ها بسته است.') : was ? 'حالت تعمیر خاموش شد؛ سایت برای همه باز است.' : 'ذخیره شد.');
  }catch(e){
    console.error(e);
    showToast('ذخیره نشد. اتصال اینترنت را بررسی کنید؛ اگر مشکل ماند، migration_042 را در SQL Editor اجرا کنید.');
    return; // ذخیره نشد: فرم دست نخوره تا متن/انتخاب مدیر از دست نره
  }finally{ btn.disabled = false; }
  renderSiteSettingsAdmin();
  applySiteVisibility();
}
async function saveHiddenSections(){
  const hidden = [];
  SITE_VIS_ITEMS.forEach(it=>{
    if(!document.querySelector(`#ss-vis-list input[data-ss="${it.key}"]`).checked){ hidden.push(it.key); return; }
    it.tabs.forEach(([t])=>{ if(!document.querySelector(`#ss-vis-list input[data-ss="${it.key}/${t}"]`).checked) hidden.push(it.key + '/' + t); });
  });
  const btn = document.getElementById('ss-vis-save');
  btn.disabled = true;
  try{
    await saveSiteSetting('hidden_sections', hidden);
    showToast(hidden.length ? 'ذخیره شد؛ ' + faNum(hidden.length) + ' مورد برای بیننده‌ها پنهان است.' : 'ذخیره شد؛ همه‌ی بخش‌ها برای بیننده‌ها نمایش داده می‌شوند.');
  }catch(e){
    console.error(e);
    showToast('ذخیره نشد. اتصال اینترنت را بررسی کنید؛ اگر مشکل ماند، migration_042 را در SQL Editor اجرا کنید.');
    return; // ذخیره نشد: فرم دست نخوره تا متن/انتخاب مدیر از دست نره
  }finally{ btn.disabled = false; }
  renderSiteSettingsAdmin();
  applySiteVisibility();
}

// ---- قفل ورود (migration_042): IPهای قفل‌شده در «وضعیت سامانه ← ورودها» ----
async function fetchLoginLocks(){
  const r = await api('/rpc/login_lock_status', { method:'POST', body:'{}' });
  if(!r.ok) return null; // migration اجرا نشده
  return await r.json();
}
async function unlockLogin(ip){
  const all = ip === null;
  if(!await uiConfirm(all ? 'باز کردن قفل همه‌ی اتصال‌ها\nورود از همه‌ی IPهای قفل‌شده دوباره ممکن می‌شود.' : 'باز کردن قفل ورود\nورود از IP ' + (ip || 'نامشخص') + ' دوباره ممکن می‌شود.')) return;
  try{
    const r = await api('/rpc/login_unlock', { method:'POST', body: JSON.stringify({ p_ip: ip }) });
    if(!r.ok) throw new Error('unlock ' + r.status);
    showToast('قفل باز شد.');
  }catch(e){ console.error(e); showToast('باز کردن قفل ناموفق بود؛ اتصال اینترنت را بررسی کنید.'); }
  renderSysLogins();
  refreshAdminAlerts();
}

// ---- «اطلاعیه برای کاربران» (migration_036) ----
// نوار بالای همه‌ی صفحه‌ها (#ann-bar). «عادی»: کاربر می‌بنده و دیگه نمی‌بینه
// (localStorage)؛ «مهم»: بستن فقط تا ورود بعدی (sessionStorage). بیننده با RLS فقط
// فعالِ منقضی‌نشده رو می‌گیره؛ مدیر همه رو (فهرست مدیریت) و فیلتر همین‌جا انجام می‌شه.
// جدول هنوز ساخته نشده (۴۰۴/۴۰۰) → بی‌صدا هیچی نشون نده؛ صفحه‌ی مدیر راهنمای migration.
let ANNOUNCEMENTS = [];
let ANN_TABLE_MISSING = false;
async function loadAnnouncements(){
  try{
    const r = await api('/announcements?select=*&order=created_at.desc&limit=50');
    ANN_TABLE_MISSING = r.status === 404 || r.status === 400;
    ANNOUNCEMENTS = r.ok ? await r.json() : [];
  }catch(e){ ANNOUNCEMENTS = []; }
}
const annIsLive = a => a.active && (!a.expires_at || new Date(a.expires_at).getTime() > Date.now());
const ANN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1zM15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13"/></svg>';
function annItemHtml(a, closable){
  const imp = a.level === 'important';
  return `<div class="ann-item ${imp ? 'important' : 'info'}" data-ann="${a.id || ''}" role="status"><span class="ann-ic">${ANN_ICON}</span><span class="ann-body"><b>${imp ? 'اطلاعیه‌ی مهم' : 'اطلاعیه'}</b><span class="ann-text">${escHtml(a.message)}</span></span>${closable ? '<button type="button" class="ann-close" aria-label="بستن اطلاعیه">✕</button>' : ''}</div>`;
}
function annDismissed(){
  let a = [], b = [];
  try{ a = JSON.parse(localStorage.getItem('jarian_ann_dismissed') || '[]'); }catch(e){}
  try{ b = JSON.parse(sessionStorage.getItem('jarian_ann_dismissed_s') || '[]'); }catch(e){}
  return new Set([...a, ...b]);
}
function renderAnnBar(){
  const bar = document.getElementById('ann-bar');
  if(!bar) return;
  const hidden = annDismissed();
  const list = ANNOUNCEMENTS.filter(a => annIsLive(a) && !hidden.has(a.id)).slice(0, 3);
  bar.innerHTML = list.map(a => annItemHtml(a, true)).join('');
  bar.querySelectorAll('.ann-close').forEach(btn => btn.addEventListener('click', () => {
    const item = btn.closest('.ann-item'); const id = Number(item.dataset.ann);
    const a = ANNOUNCEMENTS.find(x => x.id === id);
    const key = a && a.level === 'important' ? 'jarian_ann_dismissed_s' : 'jarian_ann_dismissed';
    const store = key.endsWith('_s') ? sessionStorage : localStorage;
    try{ const arr = JSON.parse(store.getItem(key) || '[]'); arr.push(id); store.setItem(key, JSON.stringify(arr.slice(-50))); }catch(e){}
    renderAnnBar();
  }));
  renderInstallCard();
  try{ updateToTop(); }catch(e){} // روی گوشی دکمه‌ی «بالای صفحه» بالای کارت‌ها می‌ره
}
// ---- دعوت «نصب جریان روی گوشی» (۵.۲۱.۰) ----
// سایت PWA است ولی هیچ‌جا گفته نمی‌شد. کارت کوچک در همون جای اطلاعیه‌ها (#ann-bar) تا چیدمان
// صفحه عوض نشه؛ فقط روی گوشی/تبلت، فقط وقتی نصب نشده، و با «بستن» برای همیشه (jarian_install_dismissed).
// اندروید/کروم: دکمه‌ی «نصب» (beforeinstallprompt)؛ آیفون: راهنمای «Add to Home Screen».
let DEFERRED_INSTALL = null;
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); DEFERRED_INSTALL = e; renderInstallCard(); });
window.addEventListener('appinstalled', ()=>{ DEFERRED_INSTALL = null; try{ localStorage.setItem('jarian_install_dismissed', '1'); }catch(e){} renderInstallCard(); });
function isIOSDevice(){ return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function renderInstallCard(){
  const bar = document.getElementById('ann-bar');
  if(!bar) return;
  const old = bar.querySelector('.install-item'); if(old) old.remove();
  let off = false;
  try{ off = !!localStorage.getItem('jarian_install_dismissed'); }catch(e){}
  const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  const touch = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
  const ios = isIOSDevice();
  if(off || standalone || !touch || !authToken || !(DEFERRED_INSTALL || ios)) return;
  const el = document.createElement('div');
  el.className = 'ann-item info install-item'; el.setAttribute('role', 'status');
  el.innerHTML = `<span class="ann-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 7.5v7m-3-3l3 3 3-3M10.5 18.5h3"/></svg></span>`
    + `<span class="ann-body"><b>نصب جریان روی گوشی</b><span class="ann-text">${ios ? 'در سافاری دکمه‌ی اشتراک‌گذاری (مربع با فلش رو به بالا) را بزنید و «Add to Home Screen» را انتخاب کنید؛ جریان مثل یک برنامه روی صفحه‌ی گوشی می‌نشیند.' : 'جریان را مثل یک برنامه روی صفحه‌ی گوشی داشته باشید تا با یک لمس باز شود.'}</span>${ios ? '' : '<button type="button" class="btn primary install-btn">نصب</button>'}</span>`
    + '<button type="button" class="ann-close" aria-label="بستن">✕</button>';
  el.querySelector('.ann-close').addEventListener('click', ()=>{ try{ localStorage.setItem('jarian_install_dismissed', '1'); }catch(e){} el.remove(); try{ updateToTop(); }catch(e){} });
  const btn = el.querySelector('.install-btn');
  if(btn) btn.addEventListener('click', async ()=>{
    if(!DEFERRED_INSTALL) return;
    DEFERRED_INSTALL.prompt();
    try{ const r = await DEFERRED_INSTALL.userChoice; if(r && r.outcome === 'accepted'){ try{ localStorage.setItem('jarian_install_dismissed', '1'); }catch(e){} } }catch(e){}
    DEFERRED_INSTALL = null; el.remove();
  });
  bar.appendChild(el);
}
function updateAnnPreview(){
  const msg = document.getElementById('ann-msg').value.trim();
  document.getElementById('ann-counter').textContent = toFaDigits(document.getElementById('ann-msg').value.length) + ' / ۳۰۰';
  document.getElementById('ann-preview').innerHTML = annItemHtml({ message: msg || 'متن اطلاعیه اینجا نمایش داده می‌شود.', level: document.getElementById('ann-level').value }, false);
}
function renderAnnAdmin(){
  document.getElementById('ann-missing').style.display = ANN_TABLE_MISSING ? '' : 'none';
  document.getElementById('ann-form').style.display = ANN_TABLE_MISSING ? 'none' : '';
  updateAnnPreview();
  const el = document.getElementById('ann-list');
  if(!ANNOUNCEMENTS.length){ el.innerHTML = '<div class="upl-empty">هنوز اطلاعیه‌ای منتشر نشده.</div>'; return; }
  const fmt = d => new Date(d).toLocaleDateString('fa-IR', { timeZone:'Asia/Tehran', day:'numeric', month:'long' });
  el.innerHTML = '';
  ANNOUNCEMENTS.forEach(a => {
    const live = annIsLive(a);
    const status = !a.active ? 'متوقف‌شده' : live ? (a.expires_at ? 'فعال تا ' + fmt(a.expires_at) : 'فعال، بدون انقضا') : 'منقضی‌شده';
    const row = document.createElement('div'); row.className = 'upl-item ann-row' + (live ? ' live' : '');
    row.innerHTML = `<span class="ann-dot"></span><span class="upl-meta"><b title="${escAttr(a.message)}">${escHtml(a.message)}</b><span>${a.level === 'important' ? 'مهم، ' : ''}${fmt(a.created_at)}، ${status}</span></span>
      ${live ? '<button type="button" class="upl-del ann-stop">توقف</button>' : ''}<button type="button" class="upl-del ann-del">حذف</button>`;
    const stop = row.querySelector('.ann-stop');
    if(stop) stop.addEventListener('click', () => updateAnnouncement(a.id, { active:false }, 'اطلاعیه متوقف شد'));
    row.querySelector('.ann-del').addEventListener('click', async () => { if(await uiConfirm('این اطلاعیه حذف شود؟')) updateAnnouncement(a.id, null, 'اطلاعیه حذف شد'); });
    el.appendChild(row);
  });
}
async function updateAnnouncement(id, patch, okMsg){
  try{
    const r = await api('/announcements?id=eq.' + id, patch ? { method:'PATCH', headers:{ Prefer:'return=minimal' }, body: JSON.stringify(patch) } : { method:'DELETE' });
    if(!r.ok) throw new Error('ann ' + r.status);
    await loadAnnouncements(); renderAnnAdmin(); renderAnnBar(); showToast(okMsg);
  }catch(e){ console.error(e); showToast('انجام نشد'); }
}
async function publishAnnouncement(){
  const msg = document.getElementById('ann-msg').value.trim();
  if(!msg){ showToast('متن اطلاعیه را بنویسید'); return; }
  const days = Number(document.getElementById('ann-exp').value);
  const btn = document.getElementById('ann-publish');
  btn.disabled = true; btn.textContent = 'در حال انتشار…';
  try{
    const body = { message: msg, level: document.getElementById('ann-level').value, expires_at: days ? new Date(Date.now() + days*86400000).toISOString() : null };
    const r = await api('/announcements', { method:'POST', headers:{ Prefer:'return=minimal' }, body: JSON.stringify(body) });
    if(!r.ok) throw new Error('ann ' + r.status);
    document.getElementById('ann-msg').value = '';
    await loadAnnouncements(); renderAnnAdmin(); renderAnnBar(); showToast('اطلاعیه منتشر شد');
  }catch(e){ console.error(e); showToast('انتشار ناموفق بود'); }
  finally{ btn.disabled = false; btn.textContent = 'انتشار اطلاعیه'; }
}
document.getElementById('ann-msg').addEventListener('input', updateAnnPreview);
document.getElementById('ann-level').addEventListener('change', updateAnnPreview);

// ---- «کاربران» (دفترچه‌ی کاربران migration_037 + مشترکین فرم + ارسال گروهی + نظرات) ----
// سطح دسترسی فعلاً فقط ثبت/نمایش؛ ارسال گروهی: فعلاً فقط انتخاب افراد + متن (ابزارهای دستی کپی/CSV به خواست کاربر حذف شدن) — پیامک
// و ایتا بعد از تهیه‌ی حساب/تصمیم کاربر اضافه می‌شن.
const USER_LEVELS = { plus:'پلاس', pro:'پرو', normal:'عادی', limited:'محدود' };
let APP_USERS = [];
let APP_USERS_MISSING = false;
let USR_FILTER = 'all';
const USR_SELECTED = new Set();
let USR_EDIT_ID = null;
let USR_NID_READY = false;   // migration_050 (ستون‌های national_id_last4 و is_admin) اجرا شده؟
async function loadAppUsers(){
  try{
    const [r, probe] = await Promise.all([
      api('/app_users?select=*&order=created_at.desc'),
      api('/app_users?select=national_id_last4,is_admin&limit=1'),
    ]);
    APP_USERS_MISSING = r.status === 404 || r.status === 400;
    USR_NID_READY = probe.ok;
    APP_USERS = r.ok ? await r.json() : [];
  }catch(e){ APP_USERS = []; }
}
// «••••••۲۴۱۹» — کد ملی هیچ‌وقت کامل به مرورگر نمی‌رسه، فقط ۴ رقم آخر
function usrNidMask(u){ return u && u.national_id_last4 ? '••••••' + toFaDigits(u.national_id_last4) : ''; }
function usrCanLogin(u){ return !!(u.active && u.phone && u.national_id_last4); }
// هر ردیف فهرست: کاربر ثبت‌شده، یا مشترک فرم که شماره‌ش هنوز در کاربران نیست
function usrRows(){
  const phones = new Set(APP_USERS.map(u=>u.phone).filter(Boolean));
  const users = APP_USERS.map(u=>({ key:'u:'+u.id, kind:'user', u, name:u.full_name, phone:u.phone||'', eitaa:u.eitaa_id||'', title:u.title||'', level:u.access_level, active:u.active }));
  const subs = (NOTIFY_SUBSCRIBERS||[]).filter(x=>!phones.has(x.phone)).map(x=>({ key:'s:'+x.id, kind:'sub', s:x, name:'', phone:x.phone, eitaa:'', title:'', level:'sub', active:true }));
  return [...users, ...subs];
}
function usrVisible(){
  // نرمال‌سازی مثل جست‌وجوی اخبار (ي/ك عربی، ارقام فارسی، نیم‌فاصله) — ۵.۲۱.۰
  const q = searchNorm(document.getElementById('usr-search').value);
  return usrRows().filter(r => (USR_FILTER === 'all' || r.level === USR_FILTER) &&
    (!q || searchNorm([r.name, r.title, r.phone, r.eitaa].join(' ')).includes(q)));
}
function openUsersSection(){
  switchSection('users');
  if(document.getElementById('am-feedback-badge').classList.contains('show'))
    setTimeout(()=>document.getElementById('usr-feedback-panel').scrollIntoView({ behavior:'smooth', block:'start' }), 400);
}
async function renderUsersSection(){
  await Promise.all([loadAppUsers(), loadNotifySubscribers(), loadFeedbackList()]);
  document.getElementById('usr-missing').style.display = APP_USERS_MISSING ? '' : 'none';
  document.getElementById('usr-nid-missing').style.display = !APP_USERS_MISSING && !USR_NID_READY ? '' : 'none';
  document.querySelectorAll('#usr-editor .usr-nid-field').forEach(el=>{ el.style.display = USR_NID_READY ? '' : 'none'; });
  document.querySelector('#usr-panel .usr-add').style.display = APP_USERS_MISSING ? 'none' : '';
  renderUsersTable();
  renderFeedbackList(); markFeedbackSeen();
  document.getElementById('users-count-feedback').textContent = FEEDBACK_LIST.length ? toFaDigits(FEEDBACK_LIST.length) : '';
}
function renderUsersTable(){
  const all = usrRows();
  const counts = { all: all.length };
  all.forEach(r=>{ counts[r.level] = (counts[r.level]||0) + 1; });
  const chips = [['all','همه'], ...Object.entries(USER_LEVELS), ['sub','مشترک فرم']];
  document.getElementById('usr-filters').innerHTML = chips.map(([k,l])=>`<button type="button" class="usr-chip ${USR_FILTER===k?'active':''}" data-f="${k}">${l}<span>${toFaDigits(counts[k]||0)}</span></button>`).join('');
  document.getElementById('usr-send-quick').innerHTML = '<span>انتخاب سریع:</span>' + chips.map(([k,l])=>`<button type="button" class="usr-quick" data-q="${k}">${k==='all'?'همه‌ی فعال‌ها':l}</button>`).join('') + '<button type="button" class="usr-quick" data-q="none">هیچ‌کس</button>';
  const rows = usrVisible();
  const t = document.getElementById('usr-table');
  const allSel = rows.length && rows.every(r=>USR_SELECTED.has(r.key));
  t.innerHTML = `<thead><tr><th><input type="checkbox" id="usr-sel-all" ${allSel?'checked':''} aria-label="انتخاب همه"></th><th>نام</th><th>موبایل</th>${USR_NID_READY ? '<th>کد ملی</th>' : ''}<th>ایتا</th><th>سمت</th><th>سطح دسترسی</th><th>وضعیت</th><th></th></tr></thead><tbody>` +
    (rows.length ? rows.map(r=>{
      const lvl = r.kind==='sub' ? '<span class="usr-lvl sub">مشترک فرم</span>' : `<span class="usr-lvl ${r.level}">${USER_LEVELS[r.level]||r.level}</span>`;
      const st = r.kind==='sub' ? (r.s.notified_at ? '<span class="usr-st done">اطلاع‌رسانی‌شده</span>' : '<span class="usr-st">در انتظار</span>') : (r.active ? '<span class="usr-st on">فعال</span>' : '<span class="usr-st off">غیرفعال</span>');
      const act = r.kind==='sub'
        ? (APP_USERS_MISSING ? '' : `<button type="button" class="usr-act" data-promote="${r.s.id}">افزودن به کاربران</button>`)
        : `<button type="button" class="usr-act" data-edit="${r.u.id}">ویرایش</button><button type="button" class="usr-act del" data-del="${r.u.id}">حذف</button>`;
      // کلاس هر خانه برای نمای کارتی گوشی (۵.۲۰.۰)؛ خانه‌ی خالی روی گوشی پنهان می‌شه
      const emp = v => v ? '' : ' is-empty';
      return `<tr class="${r.kind==='user' && !r.active ? 'inactive' : ''}"><td class="u-sel"><input type="checkbox" data-sel="${r.key}" ${USR_SELECTED.has(r.key)?'checked':''} aria-label="انتخاب"></td>
        <td class="u-name">${r.kind==='sub' ? '<span class="usr-dim">— (از فرم اطلاع‌رسانی)</span>' : `<b>${escHtml(r.name)}</b>${r.u.is_admin ? '<span class="usr-admin-tag">مدیر</span>' : ''}`}</td>
        <td class="u-phone mono${emp(r.phone)}" dir="ltr">${escHtml(r.phone)||'—'}</td>${USR_NID_READY ? `<td class="u-nid${r.kind==='sub' ? ' is-empty' : ''}">${r.kind==='sub' ? '—' : (usrNidMask(r.u) ? `<span class="mono" dir="ltr">${usrNidMask(r.u)}</span>` : '<span class="usr-nid-none">ثبت نشده</span>')}</td>` : ''}<td class="u-eitaa${emp(r.eitaa)}" dir="ltr">${escHtml(r.eitaa)||'—'}</td>
        <td class="u-title${emp(r.title)}">${escHtml(r.title)||'—'}</td><td class="u-lvl">${lvl}</td><td class="u-st">${st}</td><td class="u-act${act ? '' : ' is-empty'}"><div class="usr-acts">${act}</div></td></tr>`;
    }).join('') : `<tr><td colspan="${USR_NID_READY ? 9 : 8}" class="usr-empty">موردی نیست.</td></tr>`) + '</tbody>';
  // کاربر فعالی که با این وضع نمی‌تونه وارد بشه (کد ملی یا موبایل نداره)
  const stuck = USR_NID_READY ? APP_USERS.filter(u=>u.active && !usrCanLogin(u)) : [];
  const warn = document.getElementById('usr-nologin');
  warn.style.display = stuck.length ? '' : 'none';
  warn.textContent = stuck.length ? toFaDigits(stuck.length) + ' کاربر فعال کد ملی یا موبایل ثبت‌شده ندارد و نمی‌تواند وارد سامانه شود: ' + stuck.slice(0, 6).map(u=>u.full_name).join('، ') + (stuck.length > 6 ? '، …' : '') : '';
  updateUsrSelCount();
}
function updateUsrSelCount(){
  const valid = new Set(usrRows().map(r=>r.key));
  [...USR_SELECTED].forEach(k=>{ if(!valid.has(k)) USR_SELECTED.delete(k); });
  document.getElementById('usr-sel-count').textContent = toFaDigits(USR_SELECTED.size) + ' نفر انتخاب شده';
}
function usrSelectedRows(){ return usrRows().filter(r=>USR_SELECTED.has(r.key)); }
// خروجی CSV همون ردیف‌هایی که الان در جدول دیده می‌شن (فیلتر سطح + جست‌وجو)
function usrDownload(){
  const rows = usrVisible();
  if(!rows.length){ showToast('موردی برای خروجی نیست'); return; }
  // شماره با قالب ="09…" تا اکسل صفر اولش را حذف نکند
  const out = rows.map(r=>({
    'نام': r.name || '(مشترک فرم اطلاع‌رسانی)', 'موبایل': r.phone ? '="' + r.phone + '"' : '','ایتا': r.eitaa, 'سمت': r.title,
    'سطح دسترسی': r.kind === 'sub' ? 'مشترک فرم' : (USER_LEVELS[r.level] || r.level),
    'نقش': r.kind === 'sub' ? '' : (r.u.is_admin ? 'مدیر' : 'بیننده'),
    'وضعیت': r.kind === 'sub' ? (r.s.notified_at ? 'اطلاع‌رسانی‌شده' : 'در انتظار') : (r.active ? 'فعال' : 'غیرفعال'),
  }));
  // کد ملی عمداً در خروجی نیست (خواست کاربر: حفاظت از کد ملی)
  const cols = ['نام','موبایل','ایتا','سمت','سطح دسترسی','نقش','وضعیت'];
  const tag = USR_FILTER === 'all' ? '' : '-' + USR_FILTER;
  downloadBlob('jarian-users' + tag + '.csv', '\ufeff' + toCSV(out, cols), 'text/csv;charset=utf-8');
  showToast('فهرست ' + toFaDigits(rows.length) + ' نفر دانلود شد');
}
function openUserEditor(u){
  USR_EDIT_ID = u ? u.id : null;
  document.getElementById('usr-editor-title').textContent = u ? 'ویرایش کاربر' : 'افزودن کاربر';
  document.getElementById('usr-name').value = u ? u.full_name : '';
  document.getElementById('usr-title').value = u ? (u.title||'') : '';
  document.getElementById('usr-phone').value = u ? (u.phone||'') : '';
  document.getElementById('usr-eitaa').value = u ? (u.eitaa_id||'') : '';
  document.getElementById('usr-level').value = u ? u.access_level : 'normal';
  document.getElementById('usr-active').value = !u || u.active ? '1' : '0';
  document.getElementById('usr-notes').value = u ? (u.notes||'') : '';
  document.getElementById('usr-nid').value = '';
  document.getElementById('usr-nid-cur').innerHTML = u && u.national_id_last4 ? 'ثبت‌شده: <bdi dir="ltr">' + usrNidMask(u) + '</bdi> — فقط برای تغییر، کد ملی تازه را وارد کنید.' : 'برای ورود به سامانه لازم است.';
  document.getElementById('usr-role').value = u && u.is_admin ? '1' : '0';
  const ed = document.getElementById('usr-editor'); ed.style.display = '';
  ed.scrollIntoView({ behavior:'smooth', block:'center' });
  document.getElementById('usr-name').focus({ preventScroll:true });
}
function closeUserEditor(){ document.getElementById('usr-editor').style.display = 'none'; USR_EDIT_ID = null; }
async function saveUser(){
  const phone = normalizeIrMobile(document.getElementById('usr-phone').value);
  if(phone && !/^09\d{9}$/.test(phone)){ showToast('شماره‌ی موبایل باید ۱۱ رقم و با ۰۹ شروع شود'); return; }
  const body = {
    full_name: document.getElementById('usr-name').value.trim(),
    title: document.getElementById('usr-title').value.trim() || null,
    phone: phone || null,
    eitaa_id: document.getElementById('usr-eitaa').value.trim().replace(/^@?/, '@').replace(/^@$/, '') || null,
    access_level: document.getElementById('usr-level').value,
    active: document.getElementById('usr-active').value === '1',
    notes: document.getElementById('usr-notes').value.trim() || null,
  };
  if(!body.full_name){ showToast('نام را وارد کنید'); return; }
  const nid = USR_NID_READY ? faDigitsToLatin(document.getElementById('usr-nid').value) : '';
  if(nid && !nidValid(nid)){ showToast('کد ملی معتبر نیست؛ ۱۰ رقم را دوباره بررسی کنید'); return; }
  if(USR_NID_READY) body.is_admin = document.getElementById('usr-role').value === '1';
  const btn = document.getElementById('usr-save'); btn.disabled = true;
  try{
    const r = USR_EDIT_ID
      ? await api('/app_users?id=eq.' + USR_EDIT_ID, { method:'PATCH', headers:{ Prefer:'return=minimal' }, body: JSON.stringify(body) })
      : await api('/app_users?select=id', { method:'POST', headers:{ Prefer:'return=representation' }, body: JSON.stringify(body) });
    if(r.status === 409){ showToast('این شماره قبلاً برای کاربر دیگری ثبت شده'); return; }
    if(!r.ok) throw new Error('app_users ' + r.status);
    const id = USR_EDIT_ID || ((await r.json().catch(()=>[]))[0] || {}).id;
    // کد ملی جدا و فقط از تابع سمت سرور (HMAC؛ نه در ردیف کاربر، نه در دفتر تغییرات)
    if(nid && id){
      const rr = await api('/rpc/set_user_national_id', { method:'POST', body: JSON.stringify({ p_user_id: id, p_nid: nid }) });
      const d = rr.ok ? await rr.json() : {};
      if(!d.ok){
        await loadAppUsers(); renderUsersTable(); USR_EDIT_ID = id;
        showToast(d.error === 'duplicate' ? 'کاربر ذخیره شد، ولی این کد ملی قبلاً برای کاربر دیگری ثبت شده است' : 'کاربر ذخیره شد، ولی ثبت کد ملی انجام نشد');
        return;
      }
    }
    closeUserEditor(); await loadAppUsers(); renderUsersTable(); showToast('ذخیره شد');
  }catch(e){ console.error(e); showToast('ذخیره ناموفق بود'); }
  finally{ btn.disabled = false; document.getElementById('usr-nid').value = ''; }
}
async function deleteAppUser(id){
  const u = APP_USERS.find(x=>x.id === id);
  if(!u || !await uiConfirm('«' + u.full_name + '» از فهرست کاربران حذف شود؟')) return;
  const r = await api('/app_users?id=eq.' + id, { method:'DELETE' });
  if(!r.ok){ showToast('حذف ناموفق بود'); return; }
  await loadAppUsers(); renderUsersTable(); showToast('حذف شد');
}
document.getElementById('sec-users').addEventListener('click', e=>{
  const t = e.target.closest('button, input[type=checkbox]');
  if(!t) return;
  if(t.dataset.f){ USR_FILTER = t.dataset.f; renderUsersTable(); return; }
  if(t.dataset.q){
    const rows = usrRows();
    if(t.dataset.q === 'none') USR_SELECTED.clear();
    else rows.filter(r => (t.dataset.q === 'all' || r.level === t.dataset.q) && r.active).forEach(r=>USR_SELECTED.add(r.key));
    renderUsersTable(); return;
  }
  if(t.dataset.sel){ t.checked ? USR_SELECTED.add(t.dataset.sel) : USR_SELECTED.delete(t.dataset.sel); updateUsrSelCount(); return; }
  if(t.id === 'usr-sel-all'){ usrVisible().forEach(r => t.checked ? USR_SELECTED.add(r.key) : USR_SELECTED.delete(r.key)); renderUsersTable(); return; }
  if(t.dataset.edit){ openUserEditor(APP_USERS.find(x=>x.id === Number(t.dataset.edit))); return; }
  if(t.dataset.del){ deleteAppUser(Number(t.dataset.del)); return; }
  if(t.dataset.promote){
    const sub = NOTIFY_SUBSCRIBERS.find(x=>x.id === Number(t.dataset.promote));
    openUserEditor(null);
    document.getElementById('usr-phone').value = sub ? sub.phone : '';
    document.getElementById('usr-level').value = 'limited';
  }
});
document.getElementById('usr-search').addEventListener('input', renderUsersTable);

// ---- «بارگذاری محتوا» ----
let UPLOADS_TAB = 'magazines';
function setUploadsTab(tab){
  navMark();
  UPLOADS_TAB = tab;
  document.querySelectorAll('.upl-choice').forEach(b=>b.classList.toggle('active', b.dataset.uplTab === tab));
  ['magazines','archive','schools'].forEach(t=>{ document.getElementById('upl-pane-'+t).style.display = t === tab ? '' : 'none'; });
  setupUploadForms();
  renderUploadLists();
}
function goToUploadsTab(tab){ switchSection('uploads'); setUploadsTab(tab); }
// بهبودهای فرم (فقط داخل همین بخش): دکمه‌ی انتخاب فایل فارسی به‌جای «Choose Files»
// مرورگر (خودِ input پنهان ولی فعال می‌مونه تا هندلرهای موجود دست‌نخورده بمونن)،
// تشخیص خودکار «نوع فایل» از فایل‌های انتخاب‌شده، تاریخ پیش‌فرض امروز + معادل شمسی
// کنار انتخاب‌گر تاریخ میلادی مرورگر
let UPLOAD_FORMS_READY = false;
function setupUploadForms(){
  if(!UPLOAD_FORMS_READY){
    UPLOAD_FORMS_READY = true;
    document.querySelectorAll('#sec-uploads input[type=file]').forEach(inp=>{
      const wrap = document.createElement('label'); wrap.className = 'upl-file';
      inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
      wrap.insertAdjacentHTML('beforeend', `<span class="upl-file-btn">${inp.multiple ? 'انتخاب فایل‌ها' : 'انتخاب فایل'}</span><span class="upl-file-name"></span>`);
      inp.addEventListener('change', ()=>{ updateUploadFileLabel(inp); autoUploadFileType(inp); });
    });
    ['mag-date','arc-date'].forEach(id=>{
      const el = document.getElementById(id);
      el.insertAdjacentHTML('afterend', '<span class="upl-jdate"></span>');
      el.addEventListener('input', ()=>updateUploadJDate(el));
    });
  }
  ['mag-date','arc-date'].forEach(id=>{ const el = document.getElementById(id); if(!el.value) el.value = new Date().toLocaleDateString('en-CA', { timeZone:'Asia/Tehran' }); updateUploadJDate(el); });
  document.querySelectorAll('#sec-uploads input[type=file]').forEach(updateUploadFileLabel);
}
function updateUploadFileLabel(inp){
  const name = inp.closest('.upl-file') && inp.closest('.upl-file').querySelector('.upl-file-name');
  if(!name) return;
  const fs = Array.from(inp.files || []);
  name.textContent = !fs.length ? 'فایلی انتخاب نشده' : fs.length === 1 ? fs[0].name : toFaDigits(fs.length) + ' فایل انتخاب شد';
  name.classList.toggle('has', fs.length > 0);
}
function autoUploadFileType(inp){
  const sel = { 'mag-files':'mag-file-type', 'arc-files':'arc-file-type' }[inp.id];
  const fs = Array.from(inp.files || []);
  if(!sel || !fs.length) return;
  document.getElementById(sel).value = fs.every(f=>/^image\//.test(f.type)) ? 'images' : 'pdf';
}
function updateUploadJDate(el){
  const j = el.nextElementSibling;
  if(!j || !j.classList.contains('upl-jdate')) return;
  j.textContent = el.value ? new Date(el.value + 'T12:00:00Z').toLocaleDateString('fa-IR', { day:'numeric', month:'long', year:'numeric' }) : '';
}
function renderUploadLists(){
  if(UPLOAD_FORMS_READY) setupUploadForms();
  const lists = {
    magazines: { rows: MAGAZINES, del: deleteMagazine, meta: m => [m.issue_no ? 'شماره ' + toFaDigits(m.issue_no) : '', m.publish_date ? new Date(m.publish_date).toLocaleDateString('fa-IR') : '', m.file_type === 'images' ? 'چند عکس' : 'PDF'] },
    archive:   { rows: ARCHIVE_REPORTS, del: deleteArchiveReport, meta: m => [m.source_org || '', m.publish_date ? new Date(m.publish_date).toLocaleDateString('fa-IR') : '', m.file_type === 'images' ? 'چند عکس' : 'PDF'] },
    schools:   { rows: SCHOOL_REPORTS, del: deleteSchoolReport, meta: m => [m.uploaded_at ? new Date(m.uploaded_at).toLocaleDateString('fa-IR') : '', ({ image:'تصویر', pdf:'PDF', excel:'اکسل' })[m.file_type || 'image'] || ''] },
  };
  Object.entries(lists).forEach(([k, cfg])=>{
    const el = document.getElementById('upl-list-'+k);
    const cnt = document.getElementById('upl-count-'+k);
    if(cnt) cnt.textContent = cfg.rows.length ? toFaDigits(cfg.rows.length) : '';
    if(!el) return;
    if(!cfg.rows.length){ el.innerHTML = '<div class="upl-empty">هنوز موردی بارگذاری نشده.</div>'; return; }
    el.innerHTML = '';
    cfg.rows.forEach(m=>{
      const thumbSrc = k === 'schools' ? ((m.file_type || 'image') === 'image' ? schoolReportSrc(m) : '') : m.cover_url;
      const row = document.createElement('div'); row.className = 'upl-item';
      row.innerHTML = `<span class="upl-thumb">${thumbSrc ? `<img src="${escAttr(thumbSrc)}" alt="" loading="lazy">` : ICONS.doc}</span>
        <span class="upl-meta"><b>${escHtml(faTitle(m.title) || 'بدون عنوان')}</b><span>${cfg.meta(m).filter(Boolean).map(escHtml).join('، ')}</span></span>
        <button type="button" class="upl-del">حذف</button>`;
      row.querySelector('.upl-del').addEventListener('click', () => cfg.del(m));
      el.appendChild(row);
    });
  });
}

// «برنامه مدارس» (۵.۱۹.۰): گزارش‌ها زیر تیتر ماه (شمسی، از تاریخ بارگذاری) + چیپ‌های ماه برای
// پیدا کردن گزارش یه ماه خاص؛ تصویرها با کلیک در نمایشگر سند باز می‌شن (بزرگ‌نمایی + ورق زدن
// بین همه‌ی گزارش‌های تصویری)؛ PDF/اکسل کارت جدا با نوع فایل و «مشاهده/دانلود»
var SCHOOL_MONTH = '';
const SCH_TYPE = {
  pdf:   { label:'PDF',  action:'مشاهده', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>' },
  excel: { label:'اکسل', action:'دانلود', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/></svg>' },
};
function schoolMonthKey(r){
  if(!r.uploaded_at) return '';
  const p = calParts(new Date(r.uploaded_at), 'persian');
  return p.year + '-' + String(p.month).padStart(2, '0');
}
function schoolMonthLabel(key){
  const [y, m] = key.split('-').map(Number);
  return (JALALI_MONTHS[m - 1] || '') + ' ' + toFaDigits(y);
}
function openSchoolImage(r){
  const imgs = SCHOOL_REPORTS.filter(x => (x.file_type || 'image') === 'image');
  openDocViewer('گزارش‌های برنامه مدارس', ()=> imgs.map(x => ({ kind:'image', url: schoolReportSrc(x), label: x.title || '' })), Math.max(0, imgs.indexOf(r)));
}
function openSchoolReportFile(r){
  const path = schoolReportPath(r);
  const kind = (r.file_type === 'pdf') ? 'pdf' : 'file';
  openDocViewer(r.title || 'گزارش', async ()=>{
    let url = null;
    if(path){ try{ url = (await signStoragePaths('school-reports', [path]))[0]; }catch(e){} }
    return [{ kind, url: url || r.image_url, label: r.title || '' }];
  });
}
function renderSchoolReports(){
  renderUploadLists();
  const list = document.getElementById('school-report-list');
  const empty = document.getElementById('school-reports-empty');
  if(!list) return;
  const isAdmin = currentRole === 'app_admin';
  empty.style.display = SCHOOL_REPORTS.length ? 'none' : 'block';
  // چیپ‌های ماه (فقط وقتی بیش از یک ماه هست)
  const months = [...new Set(SCHOOL_REPORTS.map(schoolMonthKey).filter(Boolean))].sort().reverse();
  if(SCHOOL_MONTH && !months.includes(SCHOOL_MONTH)) SCHOOL_MONTH = '';
  const row = document.getElementById('sch-month-row');
  row.style.display = months.length > 1 ? '' : 'none';
  row.innerHTML = [`<button type="button" class="news-topic-chip${SCHOOL_MONTH ? '' : ' active'}" data-m="">همه</button>`]
    .concat(months.map(k => `<button type="button" class="news-topic-chip${SCHOOL_MONTH === k ? ' active' : ''}" data-m="${k}">${schoolMonthLabel(k)}</button>`)).join('');
  list.innerHTML = '';
  let lastMonth = null;
  SCHOOL_REPORTS.forEach(r => {
    const mk = schoolMonthKey(r);
    if(SCHOOL_MONTH && mk !== SCHOOL_MONTH) return;
    if(months.length > 1 && mk && mk !== lastMonth){
      lastMonth = mk;
      const h = document.createElement('h4'); h.className = 'pf-group-title sch-month-title';
      h.textContent = schoolMonthLabel(mk);
      list.appendChild(h);
    }
    const el = document.createElement('div'); el.className = 'school-report-block';
    const type = r.file_type || 'image';
    const dateStr = r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString('fa-IR') : '';
    const titleText = escHtml(faTitle(r.title) || 'گزارش بدون عنوان');
    if(type === 'image'){
      el.innerHTML = `<button type="button" class="school-report-img-btn" aria-label="بزرگ‌نمایی ${escAttr(r.title || 'گزارش')}"><img class="school-report-full-img" src="${escAttr(schoolReportSrc(r))}" alt="${escAttr(r.title||'')}" loading="lazy" /><span class="school-report-zoom"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/></svg>بزرگ‌نمایی</span></button>
        <div class="school-report-caption">
          <span class="school-report-title">${titleText}</span>
          <span class="school-report-date">${dateStr}</span>
        </div>`;
      el.querySelector('.school-report-img-btn').addEventListener('click', () => openSchoolImage(r));
    }else{
      const t = SCH_TYPE[type] || SCH_TYPE.pdf;
      el.innerHTML = `
        <button type="button" class="school-report-file-card">
          <span class="school-report-file-icon sch-${type}">${t.icon}</span>
          <span class="school-report-file-text"><span class="school-report-title">${titleText}</span><span class="school-report-date">${t.label}، ${dateStr}</span></span>
          <span class="school-report-file-action">${t.action}</span>
        </button>`;
      el.querySelector('.school-report-file-card').addEventListener('click', () => openSchoolReportFile(r));
    }
    if(isAdmin){
      const del = document.createElement('button'); del.className = 'del-btn'; del.textContent = '✕';
      del.title = 'حذف گزارش'; del.setAttribute('aria-label', 'حذف گزارش');
      del.style.cssText = 'position:absolute;top:8px;left:8px;background:rgba(20,27,36,0.6);color:#fff;z-index:2;';
      del.addEventListener('click', e => { e.stopPropagation(); deleteSchoolReport(r); });
      el.style.position = 'relative';
      el.appendChild(del);
    }
    list.appendChild(el);
  });
}
document.getElementById('sch-month-row').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b) return;
  SCHOOL_MONTH = b.dataset.m || '';
  renderSchoolReports();
});

function detectSchoolReportFileType(file){
  const name = (file.name || '').toLowerCase();
  if(/\.pdf$/.test(name)) return 'pdf';
  if(/\.(xlsx|xls|csv)$/.test(name)) return 'excel';
  return 'image';
}

async function deleteSchoolReport(r){
  if(!await uiConfirm('این گزارش حذف شود؟')) return;
  try{
    if(r.media_storage_path){
      await fetch(SUPABASE_URL + '/storage/v1/object/remove/school-reports', {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [r.media_storage_path] }),
      });
    }
    await api('/school_reports?id=eq.'+r.id, {method:'DELETE'});
    await loadSchoolReports(); renderSchoolReports();
    showToast('گزارش حذف شد');
  }catch(e){
    showToast('حذف ناموفق بود');
  }
}

// ---- کمک‌تابع‌های بارگذاری (۵.۲۰.۰): سقف حجم، ترتیب صفحه‌ها، پیام خطای قابل‌فهم و
// پاک‌کردن فایل‌های نیمه‌کاره (تا فضای ۱ گیگی سوپابیس با بارگذاری ناموفق پر نشه)
const UPLOAD_MAX_MB = 50; // سقف هر فایل در پلن رایگان سوپابیس
async function uploadHttpError(r, file){
  const err = new Error('upload failed: ' + (file && file.name));
  err.status = r.status;
  try{ err.body = await r.text(); }catch(e){}
  return err;
}
function uploadTooBig(files){
  const big = files.find(f=>f && f.size > UPLOAD_MAX_MB * 1048576);
  return big ? 'فایل «' + big.name + '» ' + faNum(+(big.size / 1048576).toFixed(1)) + ' مگابایت است؛ حداکثر حجم هر فایل ' + faNum(UPLOAD_MAX_MB) + ' مگابایت است. فایل را فشرده‌تر کنید یا به چند بخش تقسیم کنید.' : '';
}
// ترتیب عددی بر اساس نام (صفحه-۲ قبل از صفحه-۱۰) — مرورگرها ترتیب انتخاب رو تضمین نمی‌کنن
function sortFilesByName(files){
  return files.slice().sort((a,b)=>a.name.localeCompare(b.name, 'en', { numeric:true, sensitivity:'base' }));
}
function uploadErrorMsg(e){
  if(e && (e.status === 413 || /413|too large|exceeded the maximum/i.test(e.body || ''))) return 'حجم فایل بیش از حد مجاز سوپابیس است؛ فایل را فشرده‌تر کنید.';
  if(e instanceof TypeError) return 'اتصال اینترنت قطع شد؛ دوباره امتحان کنید.';
  if(e && (e.status === 401 || e.status === 403)) return 'نشست شما منقضی شده یا اجازه‌ی بارگذاری ندارید؛ یک‌بار خارج و دوباره وارد شوید.';
  return 'بارگذاری انجام نشد؛ دوباره امتحان کنید. اگر تکرار شد، صفحه‌ی «وضعیت سامانه» را ببینید.';
}
async function removeStoragePaths(bucket, paths){
  paths = (paths || []).filter(Boolean);
  if(!paths.length) return;
  try{
    await fetch(SUPABASE_URL + '/storage/v1/object/remove/' + bucket, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: paths }),
    });
  }catch(e){}
}
const publicPathOf = (url, bucket) => (url && url.includes('/' + bucket + '/')) ? url.split('/' + bucket + '/')[1] : null;
// بارگذاری چند فایل پشت‌سرهم با «فایل ۳ از ۸» روی دکمه؛ اگه یکی شکست بخوره، قبلی‌ها پاک می‌شن
async function uploadFilesWithProgress(files, uploadOne, bucket, btn){
  const paths = [];
  try{
    for(let i = 0; i < files.length; i++){
      btn.textContent = files.length > 1 ? 'در حال بارگذاری فایل ' + faNum(i + 1) + ' از ' + faNum(files.length) + '…' : 'در حال بارگذاری…';
      paths.push(await uploadOne(files[i]));
    }
    return paths;
  }catch(e){
    await removeStoragePaths(bucket, paths);
    throw e;
  }
}

async function uploadSchoolReportFile(file){
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = Date.now() + '-' + Math.random().toString(36).slice(2,8) + '-' + safeName;
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/school-reports/' + path, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if(!r.ok) throw await uploadHttpError(r, file);
  return { path, url: SUPABASE_URL + '/storage/v1/object/public/school-reports/' + path };
}

document.getElementById('school-report-upload-btn').addEventListener('click', async () => {
  const btn = document.getElementById('school-report-upload-btn');
  const titleEl = document.getElementById('school-report-title');
  const fileEl = document.getElementById('school-report-file');
  const file = fileEl.files[0];
  if(!file){ showToast('یک فایل انتخاب کنید'); return; }
  const tooBig = uploadTooBig([file]);
  if(tooBig){ showToast(tooBig); return; }
  btn.disabled = true; btn.textContent = 'در حال بارگذاری…';
  let path = null, saved = false;
  try{
    const up = await uploadSchoolReportFile(file);
    path = up.path; const url = up.url;
    const nextOrder = SCHOOL_REPORTS.length ? Math.max(...SCHOOL_REPORTS.map(r=>r.sort_order||0)) + 1 : 0;
    const body = { title: titleEl.value.trim() || null, image_url: url, media_storage_path: path, sort_order: nextOrder, file_type: detectSchoolReportFileType(file), file_name: file.name };
    const r = await api('/school_reports', {method:'POST', headers:{Prefer:'return=minimal'}, body: JSON.stringify(body)});
    if(!r.ok) throw new Error('insert failed');
    saved = true;
    titleEl.value=''; fileEl.value='';
    await loadSchoolReports(); renderSchoolReports();
    showToast('گزارش بارگذاری شد');
  }catch(e){
    console.error(e);
    if(!saved) await removeStoragePaths('school-reports', [path]);
    showToast(saved ? 'ذخیره شد، ولی فهرست به‌روز نشد؛ صفحه را تازه کنید.' : uploadErrorMsg(e));
  }finally{
    btn.disabled = false; btn.textContent = 'بارگذاری گزارش';
  }
});

// ---- channels & people page ----
function activityOf(channelId){
  // هفته‌ی اخیر rolling (نه ۲۴ساعته) — طبق درخواست صریح کاربر، آستانه‌ی
  // قبلی (۲۴ساعته، ≥۸/≥۳) برای کانال‌های کنشگری مجازی زیادی سخت‌گیرانه بود
  const weekAgo = Date.now() - 7*24*3600*1000;
  const n = POSTS_CACHE.filter(p=>p.channel_id===channelId && new Date(p.scraped_at).getTime()>=weekAgo).length;
  if(n === 0) return {level:'inactive', label:'غیرفعال', n};
  if(n > 20) return {level:'high', label:'زیاد', n};
  if(n >= 7) return {level:'mid', label:'متوسط', n};
  return {level:'low', label:'کم', n};
}

function renderChannelCards(){
  const wrap = document.getElementById('channel-cards');
  wrap.innerHTML = '';
  CHANNELS.forEach(ch=>{
    const act = activityOf(ch.id);
    const cat = CATEGORIES.find(c=>c.id===ch.category_id);
    const el=document.createElement('div'); el.className='channel-card';
    el.innerHTML = `<div class="cc-photo"><div class="cc-portrait">${ICONS.person}</div></div>
      <div class="cc-body">
        <div class="cc-name">${escHtml(ch.title || ch.username)}</div>
        <div class="cc-admin">${ch.platform==='telegram'?'تلگرام':'ایتا'} · <span class="mono">@${escHtml(ch.username)}</span></div>
        <div class="cc-activity ${act.level}"><span class="dot"></span>فعالیت ${act.label}</div>
        <div class="cc-cats">${cat?`<span>${escHtml(cat.name)}</span>`:''}<span>${ch.type==='news_agency'?'خبرگزاری':'شخصیت'}</span></div>
      </div>`;
    wrap.appendChild(el);
  });
}

// ---- «افراد و مجموعه‌ها»: زیرتب دوم «کنشگری مجازی»، گالری معرفی همون
// کانال‌هایی که پست‌هاشون توی زیرتب «پست‌های منتشر شده» جمع می‌شه ----
const postsPageTabsEl = document.getElementById('posts-page-tabs');
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

// زیرتب‌های «یادداشت‌ها»: چهره‌های سیاسی (پیش‌فرض) + دو تب منتقل‌شده از
// بخش قبلاً مستقل «ضمیمه جریان» (سایر بسته‌های تحلیلی/بسته‌های آموزشی)
const peoplePageTabsEl = document.getElementById('people-page-tabs');
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

// فیلتر «طلاب خراسان / سایر» جدول «افراد و مجموعه‌ها» — '' یعنی همه؛
// نگاه کن به matchesActivistGroup
let cyberPeopleGroupFilter = '';
const cyberPeopleGroupSegEl = document.getElementById('cyber-people-group-seg');
if(cyberPeopleGroupSegEl) cyberPeopleGroupSegEl.addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b || b.dataset.g===undefined) return;
  cyberPeopleGroupSegEl.querySelectorAll(':scope > button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  cyberPeopleGroupFilter = b.dataset.g;
  renderCyberPeopleGrid();
});

// مرتب‌سازی جدول «افراد و مجموعه‌ها» با کلیک روی سرستون‌ها — بدون سرور،
// کاملاً سمت کلاینت روی همون آرایه‌ی فیلترشده‌ی CHANNELS
let cyberPeopleSort = { field: null, dir: 'asc' };
// مرتب‌سازی جدول «افراد و مجموعه‌ها» روی گوشی (سربرگ جدول مخفیه)
document.getElementById('cyber-people-sort-m').addEventListener('change', e=>{
  const [f, d] = e.target.value.split(':');
  cyberPeopleSort = { field: f || null, dir: d || 'asc' };
  renderCyberPeopleGrid();
});
const CPT_NUMERIC_SORT = ['subscribers', 'activity'];
// روی گوشی سربرگ جدول مخفیه — مرتب‌سازی با این فهرست کشویی
function syncCyberPeopleSortSelect(){
  const sel = document.getElementById('cyber-people-sort-m');
  if(sel) sel.value = cyberPeopleSort.field ? cyberPeopleSort.field + ':' + cyberPeopleSort.dir : '';
}
function cyberPeopleSortValue(ch, field){
  switch(field){
    case 'name': return ch.title || ch.username || '';
    case 'platform': return ch.platform==='telegram' ? 'تلگرام' : 'ایتا';
    case 'owner': return ch.owner_name || '';
    case 'subscribers': return ch.subscriber_count == null ? null : ch.subscriber_count;
    case 'activity': return activityOf(ch.id).n;
    case 'category': { const c = CATEGORIES.find(x=>x.id===ch.category_id); return c ? c.name : ''; }
    case 'group': return ch.is_khorasan_talabeh ? 'طلاب خراسان' : 'سایر کنشگران';
    default: return '';
  }
}
const cyberPeopleHeadEl = document.getElementById('cyber-people-head');
if(cyberPeopleHeadEl) cyberPeopleHeadEl.addEventListener('click', e=>{
  const btn = e.target.closest('.cpt-sort-btn'); if(!btn) return;
  const field = btn.dataset.sort;
  if(cyberPeopleSort.field === field){ cyberPeopleSort.dir = cyberPeopleSort.dir==='asc' ? 'desc' : 'asc'; }
  // ستون‌های عددی (مخاطب، فعالیت) با کلیک اول از بیشترین شروع می‌شن
  else{ cyberPeopleSort.field = field; cyberPeopleSort.dir = CPT_NUMERIC_SORT.includes(field) ? 'desc' : 'asc'; }
  syncCyberPeopleSortSelect();
  renderCyberPeopleGrid();
});

function renderCyberPeopleGrid(){
  const wrap = document.getElementById('cyber-people-grid');
  const table = document.getElementById('cyber-people-table');
  const empty = document.getElementById('cyber-people-empty');
  if(!wrap) return;
  const channels = CHANNELS.filter(c=>c.show_in_cyberspace && matchesActivistGroup(c, cyberPeopleGroupFilter));
  if(empty) empty.textContent = (CHANNELS.some(c=>c.show_in_cyberspace) && cyberPeopleGroupFilter)
    ? 'کانالی با این فیلتر پیدا نشد.'
    : 'هنوز کانالی برای «کنشگری مجازی» تگ نشده.';
  if(cyberPeopleSort.field){
    const field = cyberPeopleSort.field;
    const dir = cyberPeopleSort.dir === 'desc' ? -1 : 1;
    channels.sort((a,b)=>{
      const va = cyberPeopleSortValue(a, field), vb = cyberPeopleSortValue(b, field);
      // بدون مقدار (مثلاً مخاطب ثبت‌نشده) همیشه ته فهرست، در هر دو جهت
      const ea = va === null || va === '', eb = vb === null || vb === '';
      if(ea || eb) return ea === eb ? 0 : (ea ? 1 : -1);
      if(typeof va === 'number' && typeof vb === 'number') return (va-vb)*dir;
      return String(va).localeCompare(String(vb), 'fa') * dir;
    });
  }
  if(cyberPeopleHeadEl) cyberPeopleHeadEl.querySelectorAll('.cpt-sort-btn').forEach(btn=>{
    const isActive = btn.dataset.sort === cyberPeopleSort.field;
    btn.classList.toggle('active', isActive);
    const ind = btn.querySelector('.cpt-sort-ind');
    if(ind) ind.textContent = isActive ? (cyberPeopleSort.dir==='asc' ? '▲' : '▼') : '⇅';
  });
  empty.style.display = channels.length ? 'none' : 'block';
  table.style.display = channels.length ? '' : 'none';
  const countEl = document.getElementById('cyber-people-count');
  if(countEl){
    const allCyber = CHANNELS.filter(c=>c.show_in_cyberspace);
    const khCount = allCyber.filter(c=>c.is_khorasan_talabeh).length;
    const otherCount = allCyber.length - khCount;
    countEl.innerHTML = `مجموع: <b>${toFaDigits(channels.length)}</b> کانال` +
      (cyberPeopleGroupFilter ? '' : ` (طلاب خراسان: <b>${toFaDigits(khCount)}</b> · سایر کنشگران: <b>${toFaDigits(otherCount)}</b>)`);
  }
  wrap.innerHTML = '';
  channels.forEach(ch=>{
    const act = activityOf(ch.id);
    const cat = CATEGORIES.find(c=>c.id===ch.category_id);
    const el=document.createElement('div'); el.className='cpt-row';
    el.title = 'مشاهده‌ی پست‌های ' + (ch.title || ch.username);
    const channelUrl = ch.platform==='telegram' ? `https://t.me/${encodeURIComponent(ch.username||'')}` : `https://eitaa.com/${encodeURIComponent(ch.username||'')}`;
    el.innerHTML = `<div class="cpt-who">
        <div class="cpt-avatar-wrap">
          <div class="cpt-avatar">${ch.avatar_url ? `<img src="${escAttr(ch.avatar_url)}" alt="" loading="lazy" />` : ICONS.person}</div>
          <span class="cpt-dot ${act.level}" title="${act.level==='inactive' ? act.label : 'فعالیت ' + act.label}"></span>
        </div>
        <div class="cpt-who-txt">
          <div class="cpt-name">${escHtml(ch.title || ch.username)}</div>
        </div>
      </div>
      <div class="cpt-platform">
        <span class="cpt-platform-name">${ch.platform==='telegram'?'تلگرام':'ایتا'}</span>
        <a class="cpt-platform-link mono" href="${escAttr(channelUrl)}" target="_blank" rel="noopener">${escHtml(channelUrl.replace('https://',''))}</a>
      </div>
      <div class="cpt-owner">${ch.owner_name ? ICONS.userLine + `<span>${escHtml(ch.owner_name)}</span>` : ''}</div>
      <div class="cpt-num">${ch.subscriber_count ? `<span class="cpt-num-val">${ICONS.users}${toFaDigits(ch.subscriber_count)}</span>` : ''}</div>
      <div class="cpt-activity-col"><span class="cpt-activity ${act.level}"><span class="dt"></span>${act.level==='inactive' ? act.label : 'فعالیت ' + act.label}</span></div>
      <div class="cpt-tagcol">${cat ? `<span class="cpt-tag">${escHtml(cat.name)}</span>` : ''}</div>
      <div class="cpt-groupcol"><span class="cpt-tag${ch.is_khorasan_talabeh ? ' cpt-tag-khorasan' : ''}">${ch.is_khorasan_talabeh ? 'طلاب خراسان' : 'سایر کنشگران'}</span></div>
      <span class="cpt-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg></span>`;
    el.querySelector('.cpt-platform-link').addEventListener('click', e => e.stopPropagation());
    el.addEventListener('click', ()=> openPersonFeed(ch.id));
    wrap.appendChild(el);
  });
}

// کانالی که از جدول «افراد و مجموعه‌ها» باز شده: بالای فید یه نوار «فقط پست‌های X» با
// «نمایش همه» نشون داده می‌شه، و با برگشتن به جدول انتخاب پاک می‌شه — قبلاً بی‌صدا
// روی فید می‌موند و کاربر فکر می‌کرد پست‌ها کمه
var POSTS_FOCUS_FROM_TABLE = false;
function clearPostsFocus(){
  POSTS_FOCUS_FROM_TABLE = false;
  postsSelectedChannels = [];
  populatePostSourceOptions();
  renderPosts();
}
function renderPostsFocusBar(){
  const bar = document.getElementById('posts-focus-bar');
  if(!bar) return;
  if(!POSTS_FOCUS_FROM_TABLE || postsSelectedChannels.length !== 1){ POSTS_FOCUS_FROM_TABLE = false; bar.style.display = 'none'; return; }
  const ch = chById(Number(postsSelectedChannels[0])) || {};
  bar.innerHTML = `<span>فقط پست‌های <b>${escHtml(ch.title || ch.username || '')}</b></span><button type="button" onclick="clearPostsFocus()">نمایش همه‌ی کانال‌ها</button>`;
  bar.style.display = '';
}
function openPersonFeed(channelId){
  POSTS_FOCUS_FROM_TABLE = true;
  postsSelectedChannels = [String(channelId)];
  populatePostSourceOptions();
  renderPosts();
  const tabBtn = document.querySelector('#posts-page-tabs button[data-posts-tab="feed"]');
  if(tabBtn) tabBtn.click();
}

// ---- posts page ----
const filterCatEl = document.getElementById('posts-filter-cat');
// زمان فید کنشگری: '' | today | yesterday | week | custom (بازه‌ی شمسی، postsDateFrom/To میلادی)
let postsTime = '', postsDateFrom = '', postsDateTo = '';
const searchEl = document.getElementById('posts-search');
const postsList = document.getElementById('posts-list');
const postsEmpty = document.getElementById('posts-empty');
// به‌جای یه select تک‌انتخابی، مثل «انتخاب رسانه‌ها…» تب شبکه‌های اجتماعی
// یه چندانتخابی چک‌باکسیه — بشه چندتا کانال رو هم‌زمان انتخاب کرد
let postsSelectedChannels = [];
// فیلتر «طلاب خراسان / سایر» — '' یعنی همه؛ نگاه کن به matchesActivistGroup
let postsGroupFilter = '';

function updatePostSourceSummary(){
  const summary = document.getElementById('posts-source-summary');
  if(!summary) return;
  const n = postsSelectedChannels.length;
  summary.textContent = n === 0 ? 'انتخاب کانال‌ها…' : toFaDigits(n) + ' کانال انتخاب‌شده';
}

function populatePostSourceOptions(){
  const list = document.getElementById('posts-source-list');
  if(!list) return;
  const cyberChannels = CHANNELS.filter(c=>c.show_in_cyberspace);
  const validIds = new Set(cyberChannels.map(c=>String(c.id)));
  postsSelectedChannels = postsSelectedChannels.filter(id=>validIds.has(id));
  list.innerHTML = cyberChannels.map(c=>{
    const id = String(c.id);
    const checked = postsSelectedChannels.includes(id) ? 'checked' : '';
    return `<label><input type="checkbox" value="${id}" ${checked}> ${escAttr(c.title||c.username)}</label>`;
  }).join('');
  list.querySelectorAll('input[type=checkbox]').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const id = chk.value;
      POSTS_FOCUS_FROM_TABLE = false;
      if(chk.checked){ if(!postsSelectedChannels.includes(id)) postsSelectedChannels.push(id); }
      else{ postsSelectedChannels = postsSelectedChannels.filter(x=>x!==id); }
      updatePostSourceSummary();
      renderPosts();
    });
  });
  updatePostSourceSummary();
}

function populatePostFilters(){
  populatePostSourceOptions();
  filterCatEl.innerHTML = '<option value="">همه‌ی دسته‌بندی‌ها</option>' +
    CATEGORIES.map(c=>`<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
}

function matchesTime(dateStr, val){
  if(!val) return true;
  if(!dateStr) return false;
  const diffDays = tehranDayDiff(dateStr);
  if(val==='today') return diffDays===0;
  if(val==='yesterday') return diffDays===1;
  if(val==='week') return diffDays>=0 && diffDays<=6;
  return true;
}

// فیلتر مشترک «طلاب خراسان / سایر» بخش «کنشگری مجازی» — هم توی فید
// «پست‌های منتشر شده» هم توی جدول «افراد و مجموعه‌ها» استفاده می‌شه
// (نگاه کن به postsGroupFilter/cyberPeopleGroupFilter)
function matchesActivistGroup(ch, group){
  if(!group) return true;
  if(group === 'khorasan') return !!(ch && ch.is_khorasan_talabeh);
  if(group === 'other') return !(ch && ch.is_khorasan_talabeh);
  return true;
}

function filteredPosts(){
  const catFilter = filterCatEl.value;
  const q = searchEl.value.trim();
  const fromMs = postsDateFrom ? new Date(postsDateFrom + 'T00:00:00').getTime() : null;
  const toMs = postsDateTo ? new Date(postsDateTo + 'T23:59:59').getTime() : null;
  return POSTS_CACHE.filter(p=>{
    const ownerCh = chById(p.channel_id);
    if(!ownerCh || !ownerCh.show_in_cyberspace) return false;
    if(!matchesActivistGroup(ownerCh, postsGroupFilter)) return false;
    if(postsSelectedChannels.length && !postsSelectedChannels.includes(String(p.channel_id))) return false;
    if(catFilter){
      const ch = chById(p.channel_id);
      if(!ch || String(ch.category_id) !== catFilter) return false;
    }
    if(postsTime === 'custom'){
      const ms = new Date(p.scraped_at).getTime();
      if(fromMs !== null && ms < fromMs) return false;
      if(toMs !== null && ms > toMs) return false;
    }else if(!matchesTime(p.scraped_at, postsTime)) return false;
    if(q && !searchHay(p).includes(searchNorm(q)) && !searchNorm(chName(p.channel_id)).includes(searchNorm(q))) return false;
    return true;
  });
}

// صفحه‌ی بعد/قبل فهرست: برگشت به ابتدای فهرست. ⚠️ scrollIntoView روی تب‌بار جواب نمی‌ده —
// تب‌بار sticky‌ه و مرورگر اون رو «همین الان دیده می‌شه» حساب می‌کرد، پس کاربر ته صفحه‌ی جدید می‌موند
function scrollToListTop(el){
  if(!el) return;
  const bar = document.querySelector('.section.active .news-page-tabs');
  const barH = bar ? bar.getBoundingClientRect().height : 0;
  const y = el.getBoundingClientRect().top + window.scrollY - barH - 12;
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
}
// روی گوشی فقط ۳ تب از ۷ تب دیده می‌شه — اولین بار در هر نشست، نوار تب‌ها یه تکون کوچیک
// به سمت تب‌های پنهان می‌خوره تا کاربر بفهمه بیشتر هست
function peekTabBar(key){
  const bar = document.querySelector('#sec-' + key + ' .news-page-tabs');
  if(!bar || bar.scrollWidth - bar.clientWidth < 8) return;
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try{ if(sessionStorage.getItem('jarian_tabpeek_' + key)) return; sessionStorage.setItem('jarian_tabpeek_' + key, '1'); }catch(e){ return; }
  setTimeout(()=>{
    const start = bar.scrollLeft;
    bar.scrollTo({ left: start - 90, behavior: 'smooth' });
    setTimeout(()=>bar.scrollTo({ left: start, behavior: 'smooth' }), 700);
  }, 900);
}
// لمس خودِ متن پست = «نمایش بیشتر» (دکمه‌ی کوچیکش روی گوشی سخت زده می‌شد)؛ اگه کاربر
// داره متن رو انتخاب می‌کنه یا متن کوتاهه (دکمه مخفیه)، کاری نمی‌کنه
document.addEventListener('click', e=>{
  const t = e.target.closest('.news-card .news-text');
  if(!t || e.target.closest('a')) return;
  const sel = window.getSelection && window.getSelection();
  if(sel && String(sel).trim()) return;
  const more = t.parentElement && t.parentElement.querySelector(':scope > .news-more');
  if(more && more.style.display !== 'none' && more.offsetParent) more.click();
});


function wireMediaViewerClicks(root){
  root.querySelectorAll('[data-viewer-kind]').forEach(node=>{
    node.addEventListener('click', (e)=>{
      e.stopPropagation();
      openMediaViewer(node.dataset.viewerKind, node.dataset.viewerSrc, node.dataset.viewerLink || null);
    });
  });
}

function openMediaViewer(kind, url, linkUrl){
  const body = document.getElementById('media-viewer-body');
  // ۵.۲۲.۱: آدرس از data-* (رمزگشایی‌شده) می‌آد و برای وب‌سایت‌ها از خودِ فید RSS — دوباره escape + فقط http(s)
  const src = safeUrl(url);
  body.innerHTML = kind==='video'
    ? `<video src="${src}" controls autoplay playsinline></video>`
    : `<img src="${src}" alt="">`;
  const linkEl = document.getElementById('media-viewer-link');
  if(linkUrl && /^https?:\/\//i.test(String(linkUrl).trim())){
    linkEl.href = linkUrl;
    linkEl.innerHTML = `${ICONS.external}مشاهده در مبدأ`;
    linkEl.style.display = 'flex';
  } else {
    linkEl.style.display = 'none';
  }
  document.getElementById('media-viewer').classList.add('active');
}
function closeMediaViewer(){
  document.getElementById('media-viewer').classList.remove('active');
  document.getElementById('media-viewer-body').innerHTML = '';
}

function postMediaBlock(p){
  const isMedia = p.media_type && p.media_type!=='none';
  if(!isMedia) return '';
  const mediaIcon = p.media_type==='video' ? ICONS.video : ICONS.photo;
  if(!p.media_path){
    return `<div class="pt-media">${mediaIcon}<b>${p.media_type==='video'?'فیلم':'عکس'}</b><span>پیش‌نمایش موجود نیست</span></div>`;
  }
  const path = p.media_path;
  if(p.media_type==='photo'){
    return `<div class="pt-media has-img"><img src="${escAttr(path)}" loading="lazy" alt="" data-viewer-kind="image" data-viewer-src="${escAttr(path)}"><span class="pt-media-badge">${ICONS.photo}</span></div>`;
  }
  if(p.media_type==='video'){
    const isRealVideo = /\.mp4($|\?)/i.test(path);
    if(isRealVideo){
      return `<div class="pt-media has-img"><video src="${escAttr(path)}" muted preload="metadata" data-viewer-kind="video" data-viewer-src="${escAttr(path)}"></video><span class="pt-media-badge">${ICONS.video}</span><a class="pt-media-link" href="${escAttr(path)}" target="_blank" rel="noopener" download onclick="event.stopPropagation()">${ICONS.download}دانلود فیلم</a></div>`;
    }
    // ایتا: فقط تصویر بندانگشتی دانلود شده، نه فایل کامل — کلیک روی تصویر
    // بزرگش می‌کنه، لینک جدا به منبع اصلی می‌ره
    const srcLink = p.link || path;
    return `<div class="pt-media has-img"><img src="${escAttr(path)}" loading="lazy" alt="" data-viewer-kind="image" data-viewer-src="${escAttr(path)}" data-viewer-link="${escAttr(srcLink)}"><span class="pt-media-badge">${ICONS.video}</span><a class="pt-media-link" href="${escAttr(srcLink)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${ICONS.external}مشاهده در مبدأ</a></div>`;
  }
  return `<div class="pt-media">${mediaIcon}<b>رسانه</b><span>پیش‌نمایش موجود نیست</span></div>`;
}

// ظاهر کارت‌های این صفحه دقیقاً همون کارت‌های تب «شبکه‌های اجتماعی» توی
// اخبار رسمی‌ه (همون کلاس‌های news-card/news-thumb/news-text و...) —
// فقط منبع داده و فیلترها فرق داره (filteredPosts به‌جای filteredNewsPosts)
// صفحه‌بندی فید پست‌ها (همون اندازه‌ی صفحه‌ی اخبار). با عوض شدن هر فیلتر
// (امضای postsFilterKey) به صفحه‌ی ۱ برمی‌گرده؛ رفرش داده صفحه رو نگه می‌داره
let postsPage = 1, postsFilterSig = '';
function postsFilterKey(){
  return JSON.stringify([filterCatEl.value, postsTime, postsDateFrom, postsDateTo, searchEl.value.trim(), postsGroupFilter, postsSelectedChannels]);
}
function goPostsPage(p){
  postsPage = p;
  renderPosts();
  scrollToListTop(document.getElementById('posts-tab-feed'));
}
function renderPosts(){
  updateMobileFilterBadges();
  renderPostsFocusBar();
  const filtered = filteredPosts();
  postsEmpty.style.display = filtered.length ? 'none' : 'block';
  const sig = postsFilterKey();
  if(sig !== postsFilterSig){ postsFilterSig = sig; postsPage = 1; }
  const totalPages = Math.max(1, Math.ceil(filtered.length / NEWS_PAGE_SIZE));
  postsPage = Math.min(Math.max(1, postsPage), totalPages);
  const list = filtered.slice((postsPage - 1) * NEWS_PAGE_SIZE, postsPage * NEWS_PAGE_SIZE);
  renderPagination('posts-pagination', postsPage, totalPages, goPostsPage);
  postsList.innerHTML = list.map(p=>{
    const ch = chById(p.channel_id) || {};
    const topic = catNameOf(p.channel_id);
    const isRealVideo = p.media_type === 'video' && p.media_path && /\.mp4($|\?)/i.test(p.media_path);
    const hasThumb = !!p.media_path && (p.media_type === 'photo' || (p.media_type === 'video' && !isRealVideo));
    const thumbBadge = p.media_type === 'video' ? `<span class="pt-media-badge">${ICONS.video}</span>` : '';
    const thumbHtml = hasThumb
      ? `<div class="news-thumb" style="position:relative">${thumbBadge}<img src="${escAttr(p.media_path)}" alt="" loading="lazy" data-viewer-kind="image" data-viewer-src="${escAttr(p.media_path)}"${p.media_type==='video' && p.link ? ` data-viewer-link="${escAttr(p.link)}"` : ''} /></div>`
      : ch.avatar_url
        ? `<div class="news-thumb"><img src="${escAttr(ch.avatar_url)}" alt="" loading="lazy" /></div>`
        : `<div class="news-thumb placeholder">${ICONS.doc}</div>`;
    return `
    <div class="news-card">
      ${thumbHtml}
      <div class="news-body">
        <div class="news-head">
          <span class="news-source">${escHtml(ch.title||ch.username||'؟')}</span>
          <span class="news-platform">${NEWS_PLATFORM_ICON[ch.platform]||''}${NEWS_PLATFORM_LABEL[ch.platform]||ch.platform}</span>
          ${ch.region_id ? `<span class="news-region">${escHtml(regionNameOf(ch.region_id))}</span>` : ''}
          <span class="news-time">${newsRelTime(p.posted_at||p.scraped_at)}</span>
        </div>
        <p class="news-text" id="post-text-${p.id}">${claimsTextDisplay(p.text)}</p>
        <button class="news-more" onclick="togglePostText(${p.id})" id="post-more-${p.id}">
          نمایش بیشتر
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="news-foot">
          <div>${topic ? `<span class="news-topic">${escHtml(topic)}</span>` : ''}</div>
          <div style="display:flex; gap:10px; align-items:center;">
            ${isRealVideo ? `<a class="news-link" href="${safeUrl(p.media_path)}" target="_blank" rel="noopener" download>دانلود فیلم ↓</a>` : ''}
            ${p.link ? `<a class="news-link" href="${safeUrl(p.link)}" target="_blank" rel="noopener">مشاهده‌ی منبع ↗</a>` : ''}
          </div>
        </div>
        ${currentRole === 'app_admin' ? `<div class="post-admin-row">${postHideBtnHtml(p)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  wireMediaViewerClicks(postsList);
  updatePostMoreButtons(list);
  if(document.fonts && document.fonts.status !== 'loaded'){
    document.fonts.ready.then(()=> updatePostMoreButtons(list));
  }
}

function updatePostMoreButtons(list){
  list.forEach(p=>{
    const textEl = document.getElementById('post-text-'+p.id);
    const moreBtn = document.getElementById('post-more-'+p.id);
    if(!textEl || !moreBtn) return;
    const overflowing = textEl.scrollHeight > textEl.clientHeight + 1;
    moreBtn.style.display = overflowing ? '' : 'none';
  });
}

function togglePostText(postId){
  const t = document.getElementById('post-text-'+postId);
  const b = document.getElementById('post-more-'+postId);
  if(!t || !b) return;
  const isOpen = t.classList.toggle('expanded');
  b.classList.toggle('open', isOpen);
  b.firstChild.textContent = isOpen ? 'بستن ' : 'نمایش بیشتر ';
}

filterCatEl.addEventListener('change', renderPosts);
function updatePostsRangeSummary(){
  const has = !!(postsDateFrom || postsDateTo);
  const f = postsDateFrom ? new Date(postsDateFrom).toLocaleDateString('fa-IR') : '…';
  const t = postsDateTo ? new Date(postsDateTo).toLocaleDateString('fa-IR') : '…';
  document.getElementById('posts-daterange-summary').textContent = has ? f + ' تا ' + t : 'بازه زمانی';
  document.getElementById('posts-daterange-details').classList.toggle('has-value', has);
}
function clearPostsRange(){
  postsDateFrom = ''; postsDateTo = '';
  document.querySelectorAll('#posts-daterange-details .jdate select').forEach(sel=>{ sel.value = ''; });
  updatePostsRangeSummary();
}
document.getElementById('posts-time-seg').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b || b.dataset.t === undefined) return;
  document.querySelectorAll('#posts-time-seg > button').forEach(x=>x.classList.toggle('active', x === b));
  postsTime = b.dataset.t;
  clearPostsRange();
  document.getElementById('posts-daterange-details').removeAttribute('open');
  renderPosts();
});
setupJalaliRange(document.getElementById('posts-daterange-details'), (which, iso)=>{
  if(which === 'from') postsDateFrom = iso; else postsDateTo = iso;
  postsTime = 'custom';
  document.querySelectorAll('#posts-time-seg > button').forEach(x=>x.classList.remove('active'));
  updatePostsRangeSummary();
  renderPosts();
});
document.getElementById('posts-daterange-clear').addEventListener('click', e=>{
  e.stopPropagation();
  clearPostsRange();
  postsTime = '';
  document.querySelectorAll('#posts-time-seg > button').forEach(x=>x.classList.toggle('active', x.dataset.t === ''));
  document.getElementById('posts-daterange-details').removeAttribute('open');
  renderPosts();
});
searchEl.addEventListener('input', renderPosts);
const postsGroupSegEl = document.getElementById('posts-group-seg');
if(postsGroupSegEl) postsGroupSegEl.addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b || b.dataset.g===undefined) return;
  postsGroupSegEl.querySelectorAll(':scope > button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  postsGroupFilter = b.dataset.g;
  renderPosts();
});

// ---- چهره‌های سیاسی (تنها محتوای بخش «یادداشت‌ها») ----
// عیناً هم‌الگو با فید «کنشگری مجازی» بالا (همون POSTS_CACHE، فقط فیلتر
// عضویت show_in_people به‌جای show_in_cyberspace)؛ چون یه
// پست ممکنه هم‌زمان توی هر دو فید ظاهر بشه (کانالش هر دو عضویت رو
// داشته باشه)، آی‌دی‌های DOM این فید با پیشوند pf- جدا شدن تا با
// آی‌دی‌های post-text-{id}/post-more-{id} فید کنشگری مجازی تصادم نکنن.
// دکمه‌های زمان؛ value مثل همون select قبلی خونده/نوشته می‌شه
const pfTimeSegEl = document.getElementById('political-figures-filter-time');
const pfFilterTimeEl = pfTimeSegEl ? {
  get value(){ const b = pfTimeSegEl.querySelector('button.active'); return b ? b.dataset.t : ''; },
  set value(v){ pfTimeSegEl.querySelectorAll('button').forEach(x=>x.classList.toggle('active', x.dataset.t === v)); }
} : null;
const pfSearchEl = document.getElementById('political-figures-search');
const pfList = document.getElementById('political-figures-list');
const pfEmpty = document.getElementById('political-figures-empty');
const pfGallerySearchEl = document.getElementById('pf-gallery-search');
// pfMode: 'figures' (ستون show_in_people) یا 'orgs' (ستون show_in_orgs)؛
// pfSelectedChannel: کانالی که از گالری انتخاب شده (null = نمایش گالری)
let pfMode = 'figures';
let pfSelectedChannel = null;

// حالت‌ها: figures/orgs/thinktanks («یادداشت‌ها») و pos-<تب> («مواضع مراجع و علماء»، ۵.۲۸.۰)
function pfDomainField(mode){
  mode = mode || pfMode;
  return mode === 'orgs' ? 'show_in_orgs' : mode === 'thinktanks' ? 'show_in_thinktanks'
    : mode.startsWith('pos-') ? 'show_in_positions' : 'show_in_people';
}
function pfModeMatch(ch, mode){
  if(!ch || !ch[pfDomainField(mode)]) return false;
  return !mode.startsWith('pos-') || ch.positions_tab === mode.slice(4);
}
function pfChannelMatch(ch){ return pfModeMatch(ch, pfMode); }

function politicalFigureChannels(){
  return CHANNELS.filter(pfChannelMatch);
}
// حالت‌های تازه منابع کم‌تکرار دارن (بیانیه‌ی مرجع، گزارش اندیشکده) — از سقف ۱۰۰۰تایی POSTS_CACHE
// زود بیرون می‌افتن؛ پس با باز شدن هر حالت، پست‌های همون منابع جدا گرفته و کنار کش نگه داشته می‌شن
var PF_EXTRA_POSTS = [], PF_EXTRA_AT = {}, PF_EXTRA_LOADING = {};
async function ensurePfExtra(mode){
  if(mode === 'figures' || mode === 'orgs') return;
  if(PF_EXTRA_AT[mode] && Date.now() - PF_EXTRA_AT[mode] < 600000) return;
  if(PF_EXTRA_LOADING[mode]) return;
  const ids = CHANNELS.filter(c=>pfModeMatch(c, mode)).map(c=>c.id);
  if(!ids.length){ PF_EXTRA_AT[mode] = Date.now(); return; }
  PF_EXTRA_LOADING[mode] = true;
  try{
    const r = await api('/posts?select=*&channel_id=in.(' + ids.join(',') + ')&order=scraped_at.desc&limit=600');
    if(r.ok){
      const have = new Set(PF_EXTRA_POSTS.map(p=>p.id));
      (await r.json()).forEach(p=>{ if(!p.hidden_at && !have.has(p.id)) PF_EXTRA_POSTS.push(p); });
      PF_EXTRA_AT[mode] = Date.now();
    }
  }catch(e){}
  finally{ PF_EXTRA_LOADING[mode] = false; }
  if(pfMode === mode) renderPoliticalFigures();
}
// ۵.۲۹.۰ (migration_048): در تب‌های «مواضع» فقط مطلبی نمایش داده می‌شود که
// هوش مصنوعی مرتبط تشخیص داده (section_relevant=true؛ NULL = هنوز بررسی نشده — خواست کاربر: پنهان)
// اندیشکده‌ها عمداً بدون فیلتر (خواست کاربر: «فعلاً نیاز به بررسی هوش مصنوعی ندارد»)
function pfModeFiltered(mode){ mode = mode || pfMode; return mode.startsWith('pos-'); }
function secRelevant(p){ return p.section_relevant === true; }
// متن «در انتظار بررسی» فقط برای مدیر
function secPendingNote(list){
  if(currentRole !== 'app_admin' || !list.length) return '';
  if(!('section_relevant' in list[0])) return 'برای فعال شدن فیلتر هوش مصنوعی، migration_048 باید در سوپابیس اجرا شود؛ تا آن موقع مطلبی نمایش داده نمی‌شود.';
  const n = list.filter(p=>p.section_relevant == null).length;
  return n ? faNum(n) + ' مطلب در انتظار بررسی هوش مصنوعی است (برای بیننده‌ها نمایش داده نمی‌شود).' : '';
}
function pfPostsAll(){
  if(!PF_EXTRA_POSTS.length) return POSTS_CACHE;
  const ids = new Set(POSTS_CACHE.map(p=>p.id));
  return POSTS_CACHE.concat(PF_EXTRA_POSTS.filter(p=>!ids.has(p.id) && !HIDDEN_POST_IDS.has(p.id)));
}

let pfGroupFilter = null; // id گروه انتخاب‌شده در ردیف چیپ‌ها (null = همه)

function pfGroupsOfKind(){ return PROFILE_GROUPS.filter(g=>g.kind === pfMode); }
function pfGroupIdsOf(channelId){
  return CHANNEL_PROFILE_GROUPS.filter(x=>x.channel_id === channelId).map(x=>x.group_id);
}

function setPfMode(mode){
  navMark();
  if(pfMode !== mode){ pfMode = mode; pfSelectedChannel = null; pfGroupFilter = null; }
  if(pfGallerySearchEl) pfGallerySearchEl.value = '';
  renderPoliticalFigures();
  ensurePfExtra(mode);
}

function pfLogoHtml(ch){
  if(ch.avatar_url) return `<span class="pf-logo"><img src="${escAttr(ch.avatar_url)}" alt="" loading="lazy" /></span>`;
  const initial = (ch.title || ch.username || '؟').trim().charAt(0);
  return `<span class="pf-logo">${escAttr(initial)}</span>`;
}

function pfChannelUrl(ch){
  if(ch.platform === 'telegram') return 'https://t.me/' + ch.username;
  if(ch.platform === 'eitaa') return 'https://eitaa.com/' + ch.username;
  return '';
}

// قبلاً دراپ‌داون چندانتخابی کانال‌ها رو پر می‌کرد؛ الان انتخاب کانال از
// گالری لوگوهاست — اسم تابع برای سازگاری با loadAll() حفظ شده
function populatePoliticalFiguresSourceOptions(){
  if(pfSelectedChannel && !politicalFigureChannels().some(c=>c.id===pfSelectedChannel)) pfSelectedChannel = null;
}

function renderPfGallery(){
  const grid = document.getElementById('pf-logo-grid');
  const empty = document.getElementById('pf-gallery-empty');
  if(!grid) return;
  const q = searchNorm(pfGallerySearchEl ? pfGallerySearchEl.value : '');
  const all = politicalFigureChannels();
  const stats = {};
  const filt = pfModeFiltered();
  pfPostsAll().forEach(p=>{
    if(filt && !secRelevant(p)) return;
    const st = stats[p.channel_id] || (stats[p.channel_id] = {n:0, last:''});
    st.n++;
    const t = p.posted_at || p.scraped_at || '';
    if(t > st.last) st.last = t;
  });
  const channels = all
    .filter(c=> !q || searchNorm(c.title).includes(q) || searchNorm(c.username).includes(q))
    .sort((a,b)=> ((stats[b.id]||{}).last||'').localeCompare((stats[a.id]||{}).last||''));
  if(!all.length){
    empty.textContent = pfMode === 'orgs' ? 'هنوز سازمانی به این بخش اضافه نشده است.'
      : pfMode === 'figures' ? 'هنوز چهره‌ای به این بخش اضافه نشده است.'
      : pfMode === 'thinktanks' ? 'هنوز اندیشکده‌ای به این بخش اضافه نشده است.'
      : 'هنوز منبعی به این تب اضافه نشده است.' + (currentRole === 'app_admin' ? ' منابع از «تنظیمات بخش‌ها ← مدیریت منابع»، بخش «مواضع مراجع و علماء» اضافه می‌شوند.' : '');
  }else{
    empty.textContent = 'موردی با این نام پیدا نشد.';
  }
  empty.style.display = channels.length ? 'none' : 'block';
  const unit = pfMode === 'figures' ? 'یادداشت' : 'مطلب';
  const cardHtml = (ch,i)=>{
    const st = stats[ch.id];
    const meta = st ? `${toFaDigits(st.n)} ${unit}<br>${newsRelTime(st.last)}` : `بدون ${unit} اخیر`;
    return `<button type="button" class="pf-logo-card" data-ch="${ch.id}" style="animation-delay:${Math.min(i,12)*30}ms" title="مشاهده‌ی مطالب ${escAttr(ch.title||ch.username)}">
        ${pfLogoHtml(ch)}
        <span class="pf-logo-name">${escAttr(ch.title||ch.username)}</span>
        <span class="pf-logo-meta">${meta}</span>
      </button>`;
  };
  // گروه‌ها: ردیف چیپ («همه» + گروه‌های همین تب)؛ در حالت «همه» لوگوها
  // زیر تیتر هر گروه بخش‌بخش می‌شن (کانال چندگروهه توی هر گروهش تکرار
  // می‌شه) + بخش «سایر» برای بدون‌گروه‌ها؛ با انتخاب یه گروه فقط همون
  const groups = pfGroupsOfKind();
  if(pfGroupFilter && !groups.some(g=>g.id===pfGroupFilter)) pfGroupFilter = null;
  const chipRow = document.getElementById('pf-group-row');
  chipRow.style.display = groups.length ? '' : 'none';
  chipRow.innerHTML = [`<button type="button" class="news-topic-chip${pfGroupFilter ? '' : ' active'}" data-group="">همه</button>`]
    .concat(groups.map(g=>`<button type="button" class="news-topic-chip${pfGroupFilter===g.id ? ' active' : ''}" data-group="${g.id}">${escAttr(g.name)}</button>`)).join('');
  const inGroup = (ch, gid)=> pfGroupIdsOf(ch.id).includes(gid);
  let visible = channels;
  if(pfGroupFilter) visible = channels.filter(ch=>inGroup(ch, pfGroupFilter));
  empty.style.display = visible.length ? 'none' : 'block';
  if(pfGroupFilter && channels.length && !visible.length) empty.textContent = 'موردی در این گروه نیست.';
  if(pfGroupFilter || !groups.length){
    grid.className = 'pf-logo-grid';
    grid.innerHTML = visible.map(cardHtml).join('');
    return;
  }
  grid.className = '';
  const sections = groups.map(g=>({title:g.name, items:channels.filter(ch=>inGroup(ch, g.id))}));
  const groupIds = new Set(groups.map(g=>g.id));
  sections.push({title:'سایر', items:channels.filter(ch=>!pfGroupIdsOf(ch.id).some(id=>groupIds.has(id)))});
  grid.innerHTML = sections.filter(sec=>sec.items.length).map(sec=>`
    <div class="pf-group-section">
      <h4 class="pf-group-title">${escAttr(sec.title)} <small>${toFaDigits(sec.items.length)}</small></h4>
      <div class="pf-logo-grid">${sec.items.map(cardHtml).join('')}</div>
    </div>`).join('');
}

function openPfChannel(id){
  navMark();
  pfSelectedChannel = id;
  if(pfSearchEl) pfSearchEl.value = '';
  if(pfFilterTimeEl) pfFilterTimeEl.value = '';
  renderPoliticalFigures();
  window.scrollTo(0,0);
}

function closePfChannel(){
  navMark();
  pfSelectedChannel = null;
  renderPoliticalFigures();
  window.scrollTo(0,0);
}

const pfLogoGridEl = document.getElementById('pf-logo-grid');
if(pfLogoGridEl) pfLogoGridEl.addEventListener('click', e=>{
  const card = e.target.closest('.pf-logo-card'); if(!card) return;
  openPfChannel(Number(card.dataset.ch));
});
const pfBackBtnEl = document.getElementById('pf-back-btn');
if(pfBackBtnEl) pfBackBtnEl.addEventListener('click', closePfChannel);
if(pfGallerySearchEl) pfGallerySearchEl.addEventListener('input', renderPfGallery);
const pfGroupRowEl = document.getElementById('pf-group-row');
if(pfGroupRowEl) pfGroupRowEl.addEventListener('click', e=>{
  const chip = e.target.closest('.news-topic-chip'); if(!chip) return;
  pfGroupFilter = chip.dataset.group ? Number(chip.dataset.group) : null;
  renderPfGallery();
});

var PF_PAGE = 1, PF_PAGE_KEY = ''; // var: renderPoliticalFigures ممکنه پیش از این خط صدا زده بشه
function goPfPage(p){
  PF_PAGE = p;
  renderPoliticalFigures();
  scrollToListTop(document.getElementById('pf-feed-view'));
}
function filteredPoliticalFigurePosts(){
  const timeFilter = pfFilterTimeEl ? pfFilterTimeEl.value : '';
  const q = searchNorm(pfSearchEl ? pfSearchEl.value : '');
  const filt = pfModeFiltered();
  return pfPostsAll().filter(p=>{
    if(p.channel_id !== pfSelectedChannel) return false;
    if(filt && !secRelevant(p)) return false;
    if(!matchesTime(p.scraped_at, timeFilter)) return false;
    if(q && !searchHay(p).includes(q)) return false;
    return true;
  }).sort((a,b)=>String(b.scraped_at || '').localeCompare(String(a.scraped_at || '')));
}

function renderPoliticalFigures(){
  if(!pfList) return;
  const galleryView = document.getElementById('pf-gallery-view');
  const feedView = document.getElementById('pf-feed-view');
  const selCh = pfSelectedChannel ? chById(pfSelectedChannel) : null;
  if(!selCh || !pfChannelMatch(selCh)){
    pfSelectedChannel = null;
    galleryView.style.display = '';
    feedView.style.display = 'none';
    renderPfGallery();
    return;
  }
  galleryView.style.display = 'none';
  feedView.style.display = '';
  const url = pfChannelUrl(selCh);
  document.getElementById('pf-feed-identity').innerHTML = `${pfLogoHtml(selCh)}
    <div><h3>${escAttr(selCh.title||selCh.username)}</h3>
    ${url ? `<a href="${escAttr(url)}" target="_blank" rel="noopener">${NEWS_PLATFORM_LABEL[selCh.platform]||selCh.platform} ↗</a>` : ''}
    ${(()=>{ const names = pfGroupsOfKind().filter(g=>pfGroupIdsOf(selCh.id).includes(g.id)).map(g=>`<span>${escAttr(g.name)}</span>`);
      return names.length ? `<div class="pf-feed-groups">${names.join('')}</div>` : ''; })()}</div>`;
  const filtered = filteredPoliticalFigurePosts();
  pfEmpty.style.display = filtered.length ? 'none' : 'block';
  if(pfModeFiltered()){
    const chPosts = pfPostsAll().filter(p=>p.channel_id === pfSelectedChannel);
    const note = secPendingNote(chPosts);
    pfEmpty.textContent = (chPosts.some(secRelevant) ? 'مطلبی با این فیلتر پیدا نشد.' : 'هنوز مطلب مرتبطی از این منبع ثبت نشده است.') + (note ? ' ' + note : '');
    const head = document.getElementById('pf-feed-identity');
    if(note && filtered.length) head.insertAdjacentHTML('beforeend', `<div class="sec-pending-note">${escHtml(note)}</div>`);
  }else pfEmpty.textContent = 'مطلبی با این فیلتر پیدا نشد.';
  // صفحه‌بندی ۱۲تایی مثل اخبار و کنشگری (۵.۲۱.۰؛ قبلاً تا ۱۵۰ مطلب یک‌جا)؛ با عوض شدن
  // کانال/فیلتر به صفحه‌ی ۱ برمی‌گرده
  const pfKey = [pfSelectedChannel, pfFilterTimeEl ? pfFilterTimeEl.value : '', pfSearchEl ? pfSearchEl.value : ''].join('|');
  if(pfKey !== PF_PAGE_KEY){ PF_PAGE_KEY = pfKey; PF_PAGE = 1; }
  const pfPages = Math.max(1, Math.ceil(filtered.length / NEWS_PAGE_SIZE));
  if(PF_PAGE > pfPages) PF_PAGE = pfPages;
  const list = filtered.slice((PF_PAGE - 1) * NEWS_PAGE_SIZE, PF_PAGE * NEWS_PAGE_SIZE);
  renderPagination('pf-pagination', PF_PAGE, pfPages, goPfPage);
  pfList.innerHTML = list.map(p=>{
    const ch = chById(p.channel_id) || {};
    const topic = catNameOf(p.channel_id);
    const isRealVideo = p.media_type === 'video' && p.media_path && /\.mp4($|\?)/i.test(p.media_path);
    const hasThumb = !!p.media_path && (p.media_type === 'photo' || (p.media_type === 'video' && !isRealVideo));
    const thumbBadge = p.media_type === 'video' ? `<span class="pt-media-badge">${ICONS.video}</span>` : '';
    const thumbHtml = hasThumb
      ? `<div class="news-thumb" style="position:relative">${thumbBadge}<img src="${escAttr(p.media_path)}" alt="" loading="lazy" data-viewer-kind="image" data-viewer-src="${escAttr(p.media_path)}"${p.media_type==='video' && p.link ? ` data-viewer-link="${escAttr(p.link)}"` : ''} /></div>`
      : '';
    return `
    <div class="news-card">
      ${thumbHtml}
      <div class="news-body">
        <div class="news-head">
          <span class="news-source">${escHtml(ch.title||ch.username||'؟')}</span>
          <span class="news-platform">${NEWS_PLATFORM_ICON[ch.platform]||''}${NEWS_PLATFORM_LABEL[ch.platform]||ch.platform}</span>
          ${ch.region_id ? `<span class="news-region">${escHtml(regionNameOf(ch.region_id))}</span>` : ''}
          <span class="news-time">${newsRelTime(p.posted_at||p.scraped_at)}</span>
        </div>
        ${p.title ? `<h4 class="news-title" dir="auto">${escHtml(p.title)}</h4>` : ''}
        <p class="news-text" id="pf-post-text-${p.id}">${claimsTextDisplay(p.text)}</p>
        <button class="news-more" onclick="togglePoliticalFigureText(${p.id})" id="pf-post-more-${p.id}">
          نمایش بیشتر
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="news-foot">
          <div>${topic ? `<span class="news-topic">${escHtml(topic)}</span>` : ''}</div>
          <div style="display:flex; gap:10px; align-items:center;">
            ${isRealVideo ? `<a class="news-link" href="${safeUrl(p.media_path)}" target="_blank" rel="noopener" download>دانلود فیلم ↓</a>` : ''}
            ${p.link ? `<a class="news-link" href="${safeUrl(p.link)}" target="_blank" rel="noopener">مشاهده‌ی منبع ↗</a>` : ''}
          </div>
        </div>
        ${currentRole === 'app_admin' ? `<div class="post-admin-row">${postHideBtnHtml(p)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  wireMediaViewerClicks(pfList);
  updatePoliticalFigureMoreButtons(list);
  if(document.fonts && document.fonts.status !== 'loaded'){
    document.fonts.ready.then(()=> updatePoliticalFigureMoreButtons(list));
  }
}

function updatePoliticalFigureMoreButtons(list){
  list.forEach(p=>{
    const textEl = document.getElementById('pf-post-text-'+p.id);
    const moreBtn = document.getElementById('pf-post-more-'+p.id);
    if(!textEl || !moreBtn) return;
    const overflowing = textEl.scrollHeight > textEl.clientHeight + 1;
    moreBtn.style.display = overflowing ? '' : 'none';
  });
}

function togglePoliticalFigureText(postId){
  const t = document.getElementById('pf-post-text-'+postId);
  const b = document.getElementById('pf-post-more-'+postId);
  if(!t || !b) return;
  const isOpen = t.classList.toggle('expanded');
  b.classList.toggle('open', isOpen);
  b.firstChild.textContent = isOpen ? 'بستن ' : 'نمایش بیشتر ';
}

if(pfTimeSegEl) pfTimeSegEl.addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b || !pfTimeSegEl.contains(b)) return;
  pfFilterTimeEl.value = b.dataset.t || '';
  renderPoliticalFigures();
});
if(pfSearchEl) pfSearchEl.addEventListener('input', renderPoliticalFigures);

// ---- analytics ----
const STOPWORDS = new Set(['و','در','به','از','که','این','را','با','است','می','یک','آن','هم','ها','های','برای','تا','هر','خود','ما','یا','او','وی','شد','شده','شود','کرد','کرده','کند','باید','اما','اگر','هست','نیست','بود','بودن','بوده','بودند','بر','مورد','چه','همه','همین','همان','چند','بین','پس','هنوز','حتی','نه','نیز','دیگر','بعد','قبل','دارد','دارند','داشت','روی','زیر','آنها','ولی','پیش','چون','چرا','کجا','کدام','مثل','مانند','شما','تو','من']);

function topChannelsByCount(list){
  const byChannel = {};
  list.forEach(p=>{ byChannel[p.channel_id] = (byChannel[p.channel_id]||0)+1; });
  return Object.entries(byChannel).sort((a,b)=>b[1]-a[1]);
}

function wordFrequency(list, limit){
  const counts = {};
  list.forEach(p=>{
    const text = (p.text||'').replace(/https?:\/\/\S+/g,'').replace(/[^؀-ۿ\s]/g,' ');
    text.split(/\s+/).forEach(w=>{
      w = w.trim();
      if(w.length>=3 && !STOPWORDS.has(w)) counts[w]=(counts[w]||0)+1;
    });
  });
  return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0, limit || 20);
}

// «آنالیز» تب «اخبار و رویدادها» فقط روی «شبکه‌های اجتماعی» + «وب‌سایت‌ها»
// تعریف شده — نه «روزنامه‌ها» (جدول جدایی داره، posts نیست) و نه «ادعاها
// و شایعات» (کانال بله، محتوایی متفاوته)
function newsAnalyticsChannels(){
  return CHANNELS.filter(c => c.show_in_news && c.platform !== 'bale');
}
// معیار محاسبات تب «آنالیز» ۲۴ ساعت اخیره — hours رو خالی بذار برای
// بدون محدودیت زمانی (فعلاً همه‌جا با hours=24 صدا زده می‌شه)
function newsAnalyticsPosts(hours){
  const ids = new Set(newsAnalyticsChannels().map(c=>c.id));
  const cutoff = hours ? Date.now() - hours*3600*1000 : 0;
  return POSTS_CACHE.filter(p=>{
    if(!ids.has(p.channel_id)) return false;
    if(!hours) return true;
    const t = new Date(p.posted_at || p.scraped_at).getTime();
    return t >= cutoff;
  });
}

let newsTrendChart, newsSourcesChart, newsTopicsChart;
let chartDefaultsApplied = false;
function applyChartDefaultsOnce(){
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
function horizontalBarGradient(from, to){
  return (context)=>{
    const { ctx, chartArea } = context.chart;
    if(!chartArea) return from;
    const g = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
    g.addColorStop(0, to); g.addColorStop(1, from);
    return g;
  };
}

// پالت ۶رنگه‌ی هم‌خانواده با برند برای نمودار دونات موضوعات پرتکرار
const TOPIC_DONUT_COLORS = ['#b5651d', '#EAB393', '#16202a', '#5b6472', '#d98a4f', '#3a4756'];

// ---- موج‌های خبری ----
// یه خبر که در کمتر از WAVE_WINDOW_H ساعت در WAVE_MIN_CHANNELS کانال مختلف یا
// بیشتر پخش شده (به انتخاب کاربر: ۵ کانال در ۱۲ ساعت، فقط نمایش در سایت).
// تشخیص سمت کلاینت: (۱) متن تقریباً یکسان — سه‌کلمه‌ای‌های مشترک (شینگل) با
// سهم ≥ ۵۰٪ از پست کوتاه‌تر (بازنشر/کپی، حتی با امضای متفاوت کانال)، (۲) ≥۳
// کلیدواژه‌ی مشترک هوش مصنوعی (روایت‌های با متن متفاوت؛ صف کلیدواژه عقبه پس
// این فقط مکمله). پست‌ها با union-find خوشه می‌شن. داده: POSTS_CACHE + (اگه
// کش ۱۰۰۰تایی کل ۱۲ ساعت رو نپوشونه) باقی پست‌های همون بازه با کوئری جدا.
const WAVE_MIN_CHANNELS = 5, WAVE_WINDOW_H = 12, WAVE_LIVE_H = 2;
const WAVE_STOP = new Set(('از به در که و را این با برای تا آن هم بر یک ها های می شد شده است بود کرد کند اند ای یا اما نیز پس چه همه دیگر '
  + 'وی او ما شما آنها خود هر اگر باید شود نمی کرده گفت داد دارد نیست بین روی پیش پی'). split(' '));
let WAVE_STATE = { forCache: null, extra: null, loading: false, result: null };
function waveNorm(s){
  return String(s||'')
    .replace(/https?:\/\/\S+/g, ' ').replace(/@[\w_]+/g, ' ')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه').replace(/[أإآ]/g, 'ا').replace(/ؤ/g, 'و')
    .replace(/[ً-ٰٟ]/g, '').replace(/‌/g, ' ')
    .toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
}
function waveShingles(p){
  const w = waveNorm((p.title || '') + ' ' + (p.text || '')).split(/\s+/).filter(t=>t.length > 1 && !WAVE_STOP.has(t)).slice(0, 150);
  const out = new Set();
  for(let i = 0; i + 2 < w.length; i++) out.add(w[i] + ' ' + w[i+1] + ' ' + w[i+2]);
  return out;
}
function waveTime(p){ return new Date(p.posted_at || p.scraped_at).getTime(); }
function computeNewsWaves(posts){
  const cutoff = Date.now() - WAVE_WINDOW_H * 3600 * 1000;
  const items = posts.filter(p=>p.platform !== 'bale' && waveTime(p) >= cutoff);
  const n = items.length;
  const parent = items.map((_, i)=>i);
  const find = i=>{ while(parent[i] !== i){ parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b)=>{ a = find(a); b = find(b); if(a !== b) parent[a] = b; };
  // (۱) متن مشابه
  const sh = items.map(waveShingles);
  const index = new Map();
  sh.forEach((set, i)=>{ if(set.size < 4) return; set.forEach(g=>{ let l = index.get(g); if(!l) index.set(g, l = []); l.push(i); }); });
  for(let i = 0; i < n; i++){
    if(sh[i].size < 4) continue;
    const shared = new Map();
    sh[i].forEach(g=>{ const l = index.get(g); if(!l || l.length > 400) return; for(const j of l) if(j > i) shared.set(j, (shared.get(j) || 0) + 1); });
    shared.forEach((c, j)=>{ if(c >= 3 && c / Math.min(sh[i].size, sh[j].size) >= 0.5) union(i, j); });
  }
  // (۲) کلیدواژه‌های مشترک هوش مصنوعی
  const kwOf = items.map(p=>Array.isArray(p.ai_keywords) ? [...new Set(p.ai_keywords.map(k=>waveNorm(k).replace(/\s+/g, ' ').trim()).filter(Boolean))] : []);
  const kwIndex = new Map();
  kwOf.forEach((ks, i)=>{ if(ks.length < 3) return; ks.forEach(k=>{ let l = kwIndex.get(k); if(!l) kwIndex.set(k, l = []); l.push(i); }); });
  // کلیدواژه‌ی خیلی عام (مثل «ایران») زنجیره‌ی بی‌معنی می‌سازه — کنار گذاشته می‌شه
  const kwPosts = kwOf.filter(ks=>ks.length >= 3).length;
  const kwMax = Math.max(15, Math.round(kwPosts * 0.05));
  for(let i = 0; i < n; i++){
    if(kwOf[i].length < 3) continue;
    const shared = new Map();
    kwOf[i].forEach(k=>{ const l = kwIndex.get(k) || []; if(l.length > kwMax) return; for(const j of l) if(j > i) shared.set(j, (shared.get(j) || 0) + 1); });
    shared.forEach((c, j)=>{ if(c >= 3) union(i, j); });
  }
  const groups = new Map();
  for(let i = 0; i < n; i++){ const r = find(i); let g = groups.get(r); if(!g) groups.set(r, g = []); g.push(i); }
  const waves = [];
  groups.forEach(idx=>{
    const chans = new Set(idx.map(i=>items[i].channel_id));
    if(chans.size < WAVE_MIN_CHANNELS) return;
    const ps = idx.map(i=>items[i]).sort((a, b)=>waveTime(a) - waveTime(b));
    // متن نماینده: پستی که بیشترین شینگل مشترک با بقیه‌ی خوشه رو داره
    const freq = new Map();
    idx.forEach(i=>sh[i].forEach(g=>freq.set(g, (freq.get(g) || 0) + 1)));
    let best = idx[0], bestScore = -1;
    idx.forEach(i=>{ let sc = 0; sh[i].forEach(g=>{ sc += freq.get(g) - 1; }); sc = sh[i].size ? sc / Math.sqrt(sh[i].size) : 0; if(sc > bestScore){ bestScore = sc; best = i; } });
    const kwFreq = new Map();
    idx.forEach(i=>kwOf[i].forEach(k=>kwFreq.set(k, (kwFreq.get(k) || 0) + 1)));
    const kws = [...kwFreq.entries()].filter(([, c])=>c >= 2).sort((a, b)=>b[1] - a[1]).slice(0, 4).map(([k])=>k);
    waves.push({ posts: ps, channels: chans.size, rep: items[best], first: ps[0], last: ps[ps.length - 1], kws });
  });
  waves.sort((a, b)=>(b.channels - a.channels) || (waveTime(b.last) - waveTime(a.last)));
  return waves;
}
// پست‌های ۱۲ ساعت اخیر که در کش ۱۰۰۰تایی جا نشدن (ستون‌های لازم فقط)
async function loadWaveExtraPosts(){
  const since = new Date(Date.now() - WAVE_WINDOW_H * 3600 * 1000).toISOString();
  let oldest = null;
  for(const p of POSTS_CACHE){ if(p.platform === 'bale' || !p.scraped_at) continue; if(!oldest || p.scraped_at < oldest) oldest = p.scraped_at; }
  if(!oldest || oldest <= since) return [];
  const out = [];
  for(let page = 0; page < 6; page++){
    const r = await api('/posts?select=id,channel_id,platform,title,text,link,ai_keywords,posted_at,scraped_at'
      + '&platform=neq.bale&scraped_at=gte.' + encodeURIComponent(since) + '&scraped_at=lt.' + encodeURIComponent(oldest)
      + '&order=scraped_at.desc&limit=1000&offset=' + (page * 1000));
    if(!r.ok) break;
    const rows = await r.json();
    out.push(...rows.filter(p=>!HIDDEN_POST_IDS.has(Number(p.id))));
    if(rows.length < 1000) break;
  }
  return out;
}
function renderNewsWaves(){
  const list = document.getElementById('news-waves-list');
  const empty = document.getElementById('news-waves-empty');
  if(!list) return;
  if(WAVE_STATE.forCache !== POSTS_CACHE){
    WAVE_STATE = { forCache: POSTS_CACHE, extra: null, loading: true, result: null };
    const st = WAVE_STATE;
    loadWaveExtraPosts().catch(()=>[]).then(extra=>{
      if(WAVE_STATE !== st) return;
      const ids = new Set(POSTS_CACHE.map(p=>p.id));
      st.extra = extra.filter(p=>!ids.has(p.id));
      st.result = computeNewsWaves(POSTS_CACHE.concat(st.extra));
      st.loading = false;
      renderNewsWaves();
      renderNgaKpis();
    });
  }
  if(WAVE_STATE.loading){
    list.innerHTML = '';
    empty.textContent = 'در حال بررسی پست‌های ۱۲ ساعت اخیر…';
    empty.style.display = '';
    return;
  }
  const waves = WAVE_STATE.result || [];
  empty.textContent = 'در ۱۲ ساعت اخیر خبری در ۵ کانال یا بیشتر پخش نشده است.';
  empty.style.display = waves.length ? 'none' : '';
  const fmtClock = t=>new Date(t).toLocaleTimeString('fa-IR', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Tehran' });
  list.innerHTML = waves.slice(0, 6).map(w=>{
    const live = Date.now() - waveTime(w.last) <= WAVE_LIVE_H * 3600 * 1000;
    const spanH = (waveTime(w.last) - waveTime(w.first)) / 3600000;
    const spanTxt = spanH < 1 ? 'در کمتر از یک ساعت' : ('طی ' + toFaDigits(Math.round(spanH)) + ' ساعت');
    // امضای کانال (@آیدی/لینک) از متن نماینده حذف می‌شه
    const repText = (w.rep.title || w.rep.text || '').replace(/https?:\/\/\S+/g, '').replace(/[🆔]?\s*@[\w_]+/gu, '').trim();
    const postsHtml = w.posts.slice().reverse().map(p=>{
      const url = safeUrl(p.link);
      return `<div class="wave-post"><div class="wp-main"><span class="wp-ch">${escHtml(chName(p.channel_id))}</span><span class="wp-time">${fmtClock(waveTime(p))}</span>
        <p class="wp-snip">${escHtml((p.title || p.text || '').slice(0, 220))}</p></div>
        ${url !== '#' ? `<a href="${url}" target="_blank" rel="noopener" title="مشاهده در مبدأ">↗</a>` : ''}</div>`;
    }).join('');
    return `<div class="wave-card${live ? ' is-live' : ''}">
      <div class="wave-top">
        <span class="wave-count"><b>${toFaDigits(w.channels)}</b> کانال</span>
        <span class="wave-span">${toFaDigits(w.posts.length)} پست، ${spanTxt}</span>
        ${live ? '<span class="wave-live">در حال گسترش</span>' : ''}
      </div>
      <p class="wave-text">${escHtml(repText.slice(0, 400))}</p>
      <div class="wave-meta">اولین انتشار: <b>${escHtml(chName(w.first.channel_id))}</b>، ساعت ${fmtClock(waveTime(w.first))}، آخرین: ${newsRelTime(w.last.posted_at || w.last.scraped_at)}</div>
      ${w.kws.length ? `<div class="wave-kws">${w.kws.map(k=>`<span>${escHtml(k)}</span>`).join('')}</div>` : ''}
      <details><summary>مشاهده‌ی ${toFaDigits(w.posts.length)} پست</summary><div class="wave-posts">${postsHtml}</div></details>
    </div>`;
  }).join('');
}

// ردیف شاخص‌های بالای «در یک نگاه» — امروز = از نیمه‌شب تهران؛ کارت موج‌ها بعد
// از رسیدن نتیجه‌ی موج‌ها (ناهمگام) دوباره پر می‌شه
function renderNgaKpis(){
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
    <button type="button" class="nga-kpi${live ? ' is-alert' : ''}" onclick="document.getElementById('news-waves-panel').scrollIntoView({behavior:'smooth'})">
      <span class="k-label">موج‌های خبری</span><span class="k-val">${waves ? toFaDigits(waves.length) : '…'}</span>
      <span class="k-sub">${!waves ? 'در حال بررسی…' : live ? toFaDigits(live) + ' موج در حال گسترش' : '۱۲ ساعت اخیر'}</span></button>
    <button type="button" class="nga-kpi" onclick="goToNewsTab('claims')"><span class="k-label">ادعا و شایعه امروز</span><span class="k-val">${toFaDigits(claimsToday)}</span><span class="k-sub">مشاهده‌ی همه ←</span></button>`;
}

// ---- «اخبار منتخب» (هوش مصنوعی + ویرایش دستی مدیر — ۵.۲۶.۰، migration_044) ----
// فهرست = سنجاق‌شده‌ها (news_pick_edits.action='pin'، به ترتیب sort_order، با مشخصات
// ذخیره‌شده در pick — پس بعد از اجرای بعدی هوش مصنوعی هم می‌مونن) + انتخاب‌های هوش
// مصنوعی به ترتیب امتیاز، بدون «حذف از منتخب»ها و پست‌های پنهان؛ جمعاً تا ۱۰ (سنجاق‌ها همیشه).
let NEWS_PICK_EDITS = [];
let NEWS_PICK_EDITS_MISSING = false;
// true = خونده شد؛ خطای موقت (نه جدول نبودن) فهرست قبلی رو نگه می‌داره
async function loadNewsPickEdits(){
  try{
    const r = await api('/news_pick_edits?select=*&order=sort_order.asc,id.asc');
    NEWS_PICK_EDITS_MISSING = r.status === 404 || r.status === 400;
    if(r.ok){ NEWS_PICK_EDITS = await r.json(); return true; }
    if(NEWS_PICK_EDITS_MISSING) NEWS_PICK_EDITS = [];
    return false;
  }catch(e){ return false; }
}
const PICK_MAX = 10;
// سنجاق‌هایی که واقعاً در فهرست دیده می‌شن (پست پنهان‌شده یا بی‌مشخصات نه)
const pickVisiblePin = x=>x.action === 'pin' && x.pick && !HIDDEN_POST_IDS.has(Number(x.post_id));
function newsPickItems(){
  const pins = NEWS_PICK_EDITS.filter(pickVisiblePin);
  const skip = new Set(NEWS_PICK_EDITS.map(x=>Number(x.post_id)));
  const ai = (NEWS_AI_INSIGHTS?.selected_posts || [])
    .filter(sp => !HIDDEN_POST_IDS.has(Number(sp.id)) && !skip.has(Number(sp.id)))
    .map(sp => ({ sp, post: POSTS_CACHE.find(p=>p.id===sp.id) }))
    .filter(x => x.post || x.sp.channel_id);
  return [
    ...pins.map(x=>({ sp: x.pick, post: POSTS_CACHE.find(p=>p.id===Number(x.post_id)), edit: x })),
    ...ai.slice(0, Math.max(0, PICK_MAX - pins.length)),
  ];
}
const PICK_IC = {
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>',
};
function renderNewsPicks(){
  const selectedList = document.getElementById('news-analytics-selected-list');
  const selectedEmpty = document.getElementById('news-analytics-selected-empty');
  const selectedUpdatedEl = document.getElementById('news-selected-updated');
  selectedUpdatedEl.textContent = NEWS_AI_INSIGHTS ? ('به‌روزرسانی: ' + newsRelTime(NEWS_AI_INSIGHTS.computed_at)) : '';
  // از مهر ۱۴۰۵ هر مورد خودش channel_id/time/link/sources رو هم داره (news-insights
  // خبرها رو خوشه‌بندی می‌کنه و sources = تعداد واقعی منابع همون خبره) — پس
  // اگه پست در کش ۱۰۰۰تایی نبود هم نمایش داده می‌شه؛ ردیف‌های قدیمی (فقط id)
  // مثل قبل از روی POSTS_CACHE
  const aiSelected = newsPickItems();
  const isAdmin = currentRole === 'app_admin';
  const pinCount = aiSelected.filter(x=>x.edit).length;
  selectedList.innerHTML = '';
  selectedEmpty.style.display = aiSelected.length ? 'none' : '';
  aiSelected.forEach(({sp, post:p, edit}, i)=>{
    const text = sp.headline || (p && (p.title || (p.text||'').slice(0,140))) || '';
    const chId = p ? p.channel_id : sp.channel_id;
    const when = sp.time || (p && (p.posted_at||p.scraped_at));
    // برچسب‌های معیار انتخاب (کاربر، مهر ۱۴۰۵: کوتاه، نه جمله‌ی توضیحی): «پرتکرار»
    // از تعداد واقعی منابع (≥۵، همون آستانه‌ی موج خبری) + ۱–۲ برچسب تحلیلی هوش
    // مصنوعی از فهرست ثابت TAGS در news-insights. ردیف‌های کمی قدیمی‌تر فقط
    // criterion (یک برچسب) دارن
    const tags = [];
    if(sp.sources >= 5) tags.push('<span class="sel-tag is-wide">پرتکرار</span>');
    const aiTags = Array.isArray(sp.tags) ? sp.tags : (sp.criterion ? [sp.criterion] : []);
    aiTags.forEach(t=>tags.push(`<span class="sel-tag is-crit">${escHtml(t)}</span>`));
    const srcTxt = sp.sources > 1 ? ` و ${toFaDigits(sp.sources - 1)} منبع دیگر` : '';
    if(edit && isAdmin) tags.unshift('<span class="sel-tag is-pin">سنجاق‌شده</span>');
    const pid = Number(edit ? edit.post_id : sp.id);
    const ctl = !isAdmin ? '' : edit
      ? `<div class="pick-ctl"><button type="button" data-pick="up" data-id="${edit.id}" ${i === 0 ? 'disabled' : ''} title="بالاتر" aria-label="بالاتر">${PICK_IC.up}</button><button type="button" data-pick="down" data-id="${edit.id}" ${i === pinCount - 1 ? 'disabled' : ''} title="پایین‌تر" aria-label="پایین‌تر">${PICK_IC.down}</button><button type="button" data-pick="unpin" data-id="${edit.id}">${PICK_IC.x}برداشتن سنجاق</button></div>`
      : `<div class="pick-ctl"><button type="button" data-pick="pin" data-post="${pid}">${PICK_IC.pin}سنجاق</button><button type="button" data-pick="hide" data-post="${pid}">${PICK_IC.x}حذف از منتخب</button></div>`;
    const el = document.createElement('div'); el.className = 'rank-item' + (edit && isAdmin ? ' is-pinned' : '');
    el.innerHTML = `<span class="rank-num">${toFaDigits(i+1)}</span>
      <div class="rc">${tags.length ? `<div class="sel-tags">${tags.join('')}</div>` : ''}<p>${escHtml(text)}</p>
      <div class="rmeta"><span>${escHtml(chName(chId))}${srcTxt}${when ? '،' : ''}</span><span>${when ? newsRelTime(when) : ''}</span></div>${ctl}</div>`;
    selectedList.appendChild(el);
  });

  if(isAdmin && NEWS_PICK_EDITS_MISSING) selectedList.insertAdjacentHTML('beforeend', '<p class="pick-missing">برای ویرایش این فهرست، فایل <b>db/migration_044_news_pick_edits.sql</b> باید یک‌بار در SQL Editor سوپابیس اجرا شود.</p>');
}
// مشخصات لازم برای نمایش یه خبر منتخب — از خودِ پست (برای «افزودن به منتخب»)
function pickFromPost(p){
  const head = (p.title || String(p.text || '').replace(/\s+/g, ' ')).trim().slice(0, 160);
  return { id: p.id, headline: head, sources: 1, posts: 1, channel_id: p.channel_id, time: p.posted_at || p.scraped_at, link: p.link || null, tags: [] };
}
async function upsertPickEdit(body){
  const r = await api('/news_pick_edits?on_conflict=post_id', { method:'POST', headers:{ Prefer:'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body) });
  if(!r.ok) throw new Error('news_pick_edits ' + r.status);
}
function pickNextOrder(){ return NEWS_PICK_EDITS.filter(x=>x.action === 'pin').reduce((m, x)=>Math.max(m, x.sort_order), 0) + 1; }
async function pickAfterChange(msg){
  const fresh = await loadNewsPickEdits();
  renderNewsPicks();
  try{ renderNewsFeed(); }catch(e){}
  if(!fresh) showToast((msg ? msg + ' ' : '') + 'فهرست تازه دریافت نشد؛ برای دیدن نتیجه صفحه را دوباره بارگذاری کنید.');
  else if(msg) showToast(msg);
}
function pickFailMsg(){ return NEWS_PICK_EDITS_MISSING ? 'انجام نشد؛ اول migration_044 را در SQL Editor سوپابیس اجرا کنید.' : 'انجام نشد؛ اتصال اینترنت را بررسی و دوباره تلاش کنید.'; }
document.getElementById('news-analytics-selected-list').addEventListener('click', async e=>{
  const b = e.target.closest('[data-pick]'); if(!b || currentRole !== 'app_admin') return;
  const act = b.dataset.pick;
  b.disabled = true;
  try{
    if(act === 'pin' || act === 'hide'){
      const sp = (NEWS_AI_INSIGHTS?.selected_posts || []).find(x=>Number(x.id) === Number(b.dataset.post));
      if(!sp) return;
      if(act === 'hide' && !await uiConfirm('حذف این خبر از «اخبار منتخب»\nخودِ پست در سایت می‌ماند؛ فقط از این فهرست برداشته می‌شود.')){ b.disabled = false; return; }
      await upsertPickEdit(act === 'pin'
        ? { post_id: Number(sp.id), action:'pin', title: sp.headline || null, pick: sp, sort_order: pickNextOrder() }
        : { post_id: Number(sp.id), action:'hide', title: sp.headline || null, pick: null, sort_order: 0 });
      await pickAfterChange(act === 'pin' ? 'سنجاق شد؛ در اجراهای بعدی هوش مصنوعی هم بالای فهرست می‌ماند.' : 'از «اخبار منتخب» برداشته شد.');
    }else if(act === 'unpin'){
      const r = await api('/news_pick_edits?id=eq.' + Number(b.dataset.id), { method:'DELETE' });
      if(!r.ok) throw new Error('unpin ' + r.status);
      await pickAfterChange('سنجاق برداشته شد.');
    }else if(act === 'up' || act === 'down'){
      // فقط سنجاق‌های دیده‌شده جابه‌جا می‌شن (هم‌سو با newsPickItems)؛ بقیه ته ترتیب
      const pins = NEWS_PICK_EDITS.filter(pickVisiblePin);
      const rest = NEWS_PICK_EDITS.filter(x=>x.action === 'pin' && !pickVisiblePin(x));
      const i = pins.findIndex(x=>x.id === Number(b.dataset.id)), j = act === 'up' ? i - 1 : i + 1;
      if(i < 0 || j < 0 || j >= pins.length) return;
      // ترتیب از نو شماره‌گذاری می‌شه (sort_orderهای برابر هم درست جابه‌جا بشن)
      [pins[i], pins[j]] = [pins[j], pins[i]];
      const res = await Promise.all([...pins, ...rest].map((x, k)=>x.sort_order === k + 1 ? { ok:true } : api('/news_pick_edits?id=eq.' + x.id, { method:'PATCH', body: JSON.stringify({ sort_order: k + 1 }) })));
      if(res.some(r=>!r.ok)) throw new Error('reorder');
      await pickAfterChange('');
    }
  }catch(err){
    console.error(err);
    showToast(pickFailMsg());
    b.disabled = false;
  }
});
// «افزودن به منتخب» از روی کارت خبر (فقط مدیر)
function pickAddBtnHtml(p){
  if(currentRole !== 'app_admin') return '';
  const on = NEWS_PICK_EDITS.some(x=>Number(x.post_id) === Number(p.id) && x.action === 'pin');
  return `<button type="button" class="post-hide-btn pick-add-btn" ${on ? 'disabled' : ''} onclick="addPostToPicks(${Number(p.id)})" title="این خبر بالای «اخبار منتخب» در تب «در یک نگاه» سنجاق می‌شود">${PICK_IC.pin}${on ? 'در اخبار منتخب' : 'افزودن به منتخب'}</button>`;
}
async function addPostToPicks(id){
  const p = POSTS_CACHE.find(x=>x.id === id);
  if(!p){ showToast('این خبر پیدا نشد؛ صفحه را دوباره بارگذاری کنید.'); return; }
  try{
    const sp = pickFromPost(p);
    await upsertPickEdit({ post_id: id, action:'pin', title: sp.headline, pick: sp, sort_order: pickNextOrder() });
    await pickAfterChange('به «اخبار منتخب» اضافه شد (بالای فهرست، در تب «در یک نگاه»).');
  }catch(e){ console.error(e); showToast(pickFailMsg()); }
}
function renderNewsAnalytics(){
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

// ---- settings: categories & channels (real CRUD against Postgres) ----
const catGridEl = document.getElementById('cat-grid');
const regionGridEl = document.getElementById('region-grid');
const topicGridEl = document.getElementById('topic-grid');
const chanListEl = document.getElementById('chan-list');

const chanSearchEl = document.getElementById('chan-search');
const chanFilterPlatformEl = document.getElementById('chan-filter-platform');
// فیلتر بخش با چیپ (نه select): '' = همه، '__none' = منابع بدون هیچ بخشی
let chanDomainFilter = '';
const chanFilterCountEl = document.getElementById('chan-filter-count');
function filteredChanList(){
  const q = searchNorm(chanSearchEl.value); // ۵.۲۱.۰: مثل جست‌وجوی اخبار
  const platform = chanFilterPlatformEl.value;
  const domain = chanDomainFilter;
  return CHANNELS.filter(ch=>{
    if(platform && ch.platform !== platform) return false;
    if(domain === '__none'){ if(chanSectionsOf(ch).length) return false; }
    else if(domain && !chanSecOn(ch, domain)) return false;
    if(q && !searchNorm((ch.title||'') + ' ' + (ch.username||'')).includes(q)) return false;
    return true;
  });
}
chanSearchEl.addEventListener('input', renderChanList);
chanFilterPlatformEl.addEventListener('change', renderChanList);
document.getElementById('chan-section-chips').addEventListener('click', e=>{
  const chip = e.target.closest('.news-topic-chip'); if(!chip) return;
  chanDomainFilter = chip.dataset.domain || '';
  renderChanList();
});

// گزینه‌های «موضوع»/«منطقه» حالا فقط توی پنجره‌ی ویرایش منبع هستن و موقع
// باز شدنش پر می‌شن — این دو تابع برای سازگاری با صداکننده‌های قدیمی موندن
function refreshCatOptions(){}
function refreshRegionOptions(){}

// تغییر نام درجا برای کارت‌های موضوع/منطقه/گروه: کلیک روی نام → کادر
// ویرایش؛ Enter یا خروج از کادر ذخیره می‌کند، Esc لغو
function makeRenamable(nameEl, current, save){
  nameEl.classList.add('renamable');
  nameEl.title = 'برای تغییر نام کلیک کنید';
  nameEl.addEventListener('click', ()=>{
    if(nameEl.querySelector('input')) return;
    const inp = document.createElement('input'); inp.type='text'; inp.value=current; inp.className='rename-input';
    nameEl.innerHTML=''; nameEl.appendChild(inp); inp.focus(); inp.select();
    let done = false;
    const finish = async commit=>{
      if(done) return; done = true;
      const val = inp.value.trim();
      if(commit && val && val !== current){
        try{ await save(val); showToast('نام تغییر کرد'); }
        catch(e){ showToast('تغییر نام ناموفق بود'); }
      }else{
        nameEl.textContent = current;
      }
    };
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter') finish(true); if(e.key==='Escape'){ e.stopPropagation(); finish(false); } });
    inp.addEventListener('blur', ()=> finish(true));
  });
}
async function patchOk(path, body){
  const r = await api(path, {method:'PATCH', body: JSON.stringify(body)});
  if(!r.ok) throw new Error('patch');
}

function renderRegionGrid(){
  regionGridEl.innerHTML = '';
  REGIONS.forEach(r=>{
    const count = CHANNELS.filter(ch=>ch.region_id===r.id).length;
    const el=document.createElement('div'); el.className='cat-card';
    el.innerHTML = `<span class="name">${escAttr(r.name)}</span><span class="cc-actions"><span class="count mono" title="تعداد منابع">${toFaDigits(count)} منبع</span></span>`;
    makeRenamable(el.querySelector('.name'), r.name, async val=>{
      await patchOk('/regions?id=eq.'+r.id, {name: val});
      await loadRegions(); renderRegionGrid(); renderNewsRegionChips(); renderNewsFeed();
    });
    const del=document.createElement('button'); del.className='del-btn'; del.textContent='✕'; del.title='حذف منطقه'; del.setAttribute('aria-label','حذف منطقه‌ی '+r.name);
    del.addEventListener('click', async ()=>{
      if(!await uiConfirm('منطقه‌ی «' + r.name + '» حذف شود؟' + (count ? '\n' + count + ' منبع بدون منطقه می‌شوند.' : ''))) return;
      await api('/regions?id=eq.'+r.id, {method:'DELETE'});
      await loadRegions(); await loadChannels();
      refreshRegionOptions(); renderRegionGrid(); renderNewsRegionChips(); renderChanList(); renderNewsFeed();
    });
    el.querySelector('.cc-actions').appendChild(del);
    regionGridEl.appendChild(el);
  });
}

function renderCatGrid(){
  catGridEl.innerHTML = '';
  CATEGORIES.forEach(c=>{
    const count = CHANNELS.filter(ch=>ch.category_id===c.id).length;
    const el=document.createElement('div'); el.className='cat-card';
    el.innerHTML = `<span class="name">${escAttr(c.name)}</span><span class="cc-actions"><span class="count mono" title="تعداد منابع">${toFaDigits(count)} منبع</span></span>`;
    makeRenamable(el.querySelector('.name'), c.name, async val=>{
      await patchOk('/categories?id=eq.'+c.id, {name: val});
      await loadCategories(); renderCatGrid(); renderChanList(); renderCyberPeopleGrid(); populatePostFilters(); populateExportFilters();
    });
    const del=document.createElement('button'); del.className='del-btn'; del.textContent='✕'; del.title='حذف موضوع'; del.setAttribute('aria-label','حذف موضوع '+c.name);
    del.addEventListener('click', async ()=>{
      if(!await uiConfirm('موضوع «' + c.name + '» حذف شود؟' + (count ? '\n' + count + ' منبع بدون موضوع می‌شوند.' : ''))) return;
      await api('/categories?id=eq.'+c.id, {method:'DELETE'});
      await loadCategories(); await loadChannels();
      refreshCatOptions(); renderCatGrid(); renderChanList(); renderChannelCards(); renderCyberPeopleGrid(); populatePostFilters(); populateExportFilters();
    });
    el.querySelector('.cc-actions').appendChild(del);
    catGridEl.appendChild(el);
  });
}

// هر بخش سایت که یه منبع می‌تونه توش نمایش داده بشه — منبع واحد برای
// برچسب‌های فهرست، چیپ‌های فیلتر و مرحله‌ی ۳ پنجره‌ی ویرایش
// ترتیب هم‌راستا با کارت‌های «عرصه‌های رصد» صفحه‌ی نخست (برنامه مدارس منبع نداره).
// «درباره حوزه» توی دیتابیس = show_in_hawza (+ show_in_news که برای کلیدواژه/
// تشخیص سیاسی‌اجتماعی لازمه)، فقط برای وب‌سایت؛ منبعِ حوزوی در «وب‌سایت‌ها»ی
// «اخبار و رویدادها» نمیاد، پس اینجا هم برچسب «اخبار» نمی‌گیره (chanSecOn)
const CHAN_SECTIONS = [
  { field:'show_in_news', label:'اخبار و رویدادها', short:'اخبار',
    hint:'پست‌ها در تب «شبکه‌های اجتماعی» (ایتا/تلگرام) یا «وب‌سایت‌ها» می‌آیند و در تحلیل «در یک نگاه» حساب می‌شوند.' },
  { field:'show_in_people', label:'چهره‌ها و فعالان سیاسی', short:'چهره‌ها',
    hint:'بخش «یادداشت‌ها»: لوگوی منبع در گالری چهره‌ها نمایش داده می‌شود.' },
  { field:'show_in_orgs', label:'تحلیل سازمان‌ها', short:'سازمان‌ها',
    hint:'بخش «یادداشت‌ها»: لوگوی منبع در گالری سازمان‌ها نمایش داده می‌شود.' },
  { field:'show_in_thinktanks', label:'اندیشکده‌ها و پژوهشگاه‌ها', short:'اندیشکده‌ها', needsMig:true,
    hint:'بخش «یادداشت‌ها»: لوگوی منبع در گالری اندیشکده‌ها نمایش داده می‌شود.' },
  { field:'show_in_hawza', label:'درباره حوزه', short:'درباره حوزه', webOnly:true,
    hint:'تب «اخبار حوزه»: فقط برای خبرگزاری‌های حوزوی (وب‌سایت)؛ اخبار سیاسی‌اجتماعی‌شان به تشخیص هوش مصنوعی نمایش داده می‌شود.' },
  { field:'show_in_cyberspace', label:'کنشگری مجازی', short:'کنشگری',
    hint:'پست‌ها در «پست‌های منتشر شده» می‌آیند و منبع در جدول «افراد و مجموعه‌ها» معرفی می‌شود.' },
  // ۵.۲۸.۰ — عرصه‌های مدار دوم (migration_047)
  { field:'show_in_positions', label:'مواضع مراجع و علماء', short:'مواضع', needsMig:true, noBulk:true,
    hint:'لوگوی منبع در گالری تبی که انتخاب می‌کنید نمایش داده می‌شود؛ فقط مواضع سیاسی‌اجتماعی (به تشخیص هوش مصنوعی) می‌آیند.' },
  { field:'show_in_laws', label:'قوانین و مصوبات', short:'قوانین', needsMig:true,
    hint:'فقط مصوبه‌ها و مواضع رسمی منبع (به تشخیص هوش مصنوعی) در فید «قوانین و مصوبات» با برچسب مرجع صادرکننده می‌آیند.' },
];
// ستون‌های migration_047 هنوز در پایگاه داده نیستند → این بخش‌ها غیرفعال (وگرنه ذخیره‌ی منبع خطا می‌دهد)
function newColsReady(){ return !CHANNELS.length || ('show_in_positions' in CHANNELS[0]); }
function chanSecUsable(sec){ return !sec.needsMig || newColsReady(); }
const CHAN_PLATFORM_LABEL = { eitaa:'ایتا', telegram:'تلگرام', website:'وب‌سایت', bale:'بله' };
function chanSecOn(ch, field){
  if(field === 'show_in_news') return !!ch.show_in_news && !ch.show_in_hawza;
  return !!ch[field];
}
function chanSectionsOf(ch){
  return CHAN_SECTIONS.filter(sec=>chanSecOn(ch, sec.field)).map(sec=>
    // کانال بله فقط تب «ادعاها و شایعات» رو تغذیه می‌کنه، نه فید عمومی اخبار
    sec.field === 'show_in_news' && ch.platform === 'bale' ? 'ادعاها و شایعات'
    : sec.field === 'show_in_positions' && POS_TAB_LABEL[ch.positions_tab] ? 'مواضع (' + POS_TAB_LABEL[ch.positions_tab] + ')'
    : sec.field === 'show_in_laws' ? 'قوانین (' + lawsSourceOf(ch) + ')'
    : sec.short);
}
function chanAvatarHtml(ch){
  if(ch.avatar_url) return `<img src="${escAttr(ch.avatar_url)}" alt="" />`;
  return escAttr((ch.title || ch.username || '؟').trim().charAt(0));
}

function renderChanSectionChips(){
  const wrap = document.getElementById('chan-section-chips');
  if(!wrap) return;
  const opts = [{key:'', label:'همه', n:CHANNELS.length}]
    .concat(CHAN_SECTIONS.map(sec=>({key:sec.field, label:sec.label, n:CHANNELS.filter(c=>chanSecOn(c, sec.field)).length})))
    .concat([{key:'__none', label:'بدون بخش', n:CHANNELS.filter(c=>!chanSectionsOf(c).length).length}]);
  wrap.innerHTML = opts.map(o=>`<button type="button" class="news-topic-chip${chanDomainFilter===o.key?' active':''}" data-domain="${o.key}">${o.label}<b>${toFaDigits(o.n)}</b></button>`).join('');
}

function renderChanList(){
  renderChanSectionChips();
  chanListEl.innerHTML = '';
  const list = filteredChanList();
  chanFilterCountEl.textContent = list.length===CHANNELS.length
    ? `${toFaDigits(CHANNELS.length)} منبع`
    : `${toFaDigits(list.length)} از ${toFaDigits(CHANNELS.length)} منبع`;
  if(!list.length){
    chanListEl.innerHTML = '<p style="font-size:12px;color:var(--text-faint);padding:14px 4px;">منبعی با این فیلتر پیدا نشد.</p>';
    return;
  }
  list.forEach(ch=>{
    const row=document.createElement('div'); row.className='chan-item';
    row.title = 'ویرایش ' + (ch.title || ch.username);
    const sections = chanSectionsOf(ch);
    const handleText = ch.platform==='website' ? ch.username : '@'+ch.username;
    const cat = CATEGORIES.find(c=>c.id===ch.category_id);
    row.innerHTML = `
      <span class="chan-item-avatar">${chanAvatarHtml(ch)}</span>
      <div class="chan-item-main">
        <div class="chan-item-name">${escAttr(ch.title||ch.username)}</div>
        <div class="chan-item-sub">${escAttr(handleText)} · ${CHAN_PLATFORM_LABEL[ch.platform]||ch.platform}${cat ? ' · '+escAttr(cat.name) : ''}</div>
      </div>
      <div class="chan-item-badges">${sections.length
        ? sections.map(t=>`<span class="chan-badge">${t}</span>`).join('')
        : '<span class="chan-badge none">در هیچ بخشی نمایش داده نمی‌شود</span>'}</div>
      <button type="button" class="chan-item-edit">ویرایش</button>`;
    row.addEventListener('click', ()=> openChanEditor(ch));
    const del=document.createElement('button'); del.className='del-btn'; del.textContent='✕'; del.title='حذف منبع'; del.setAttribute('aria-label','حذف منبع '+(ch.title||ch.username));
    del.addEventListener('click', e=>{ e.stopPropagation(); openDeleteChannelModal(ch); });
    row.appendChild(del);
    chanListEl.appendChild(row);
  });
}

// ---- پنجره‌ی ویرایش/افزودن منبع (سه مرحله: مشخصات، موضوع، بخش‌ها) ----
let CE_CHANNEL = null;      // null = افزودن منبع جدید
let CE_AVATAR_FILE = null;  // عکس انتخاب‌شده، تا کلیک «ذخیره» آپلود نمی‌شه
const ceEl = id => document.getElementById(id);

function ceUpdateHandleLabel(){
  const isWeb = ceEl('ce-platform').value === 'website';
  ceEl('ce-handle-label').textContent = isWeb ? 'آدرس فید RSS' : 'یوزرنیم کانال (بدون @)';
  ceEl('ce-handle').placeholder = isWeb ? 'https://example.com/rss' : 'channel_name';
  ceRenderSections();
}

function ceRenderSections(){
  const ch = CE_CHANNEL || {};
  const wrap = ceEl('ce-sections');
  // وضعیت فعلی تیک‌ها (اگه کاربر قبلاً توی همین پنجره عوض کرده) حفظ بشه
  const prev = {};
  wrap.querySelectorAll('[data-ce]').forEach(el=>{ prev[el.dataset.ce] = el.type==='checkbox' ? el.checked : el.value; });
  const val = (key, fallback)=> key in prev ? prev[key] : fallback;
  const isWeb = ceEl('ce-platform').value === 'website';
  const chGroups = ch.id ? CHANNEL_PROFILE_GROUPS.filter(x=>x.channel_id===ch.id).map(x=>x.group_id) : [];
  const groupsHtml = kind=>{
    const gs = PROFILE_GROUPS.filter(g=>g.kind===kind);
    if(!gs.length) return `<p class="ce-hint ce-full">هنوز گروهی برای این بخش تعریف نشده (تنظیمات ← گروه‌های «چهره‌ها» و «سازمان‌ها»).</p>`;
    return `<div class="ce-full"><label class="ce-sub-label">گروه‌ها (می‌توانید چند گروه انتخاب کنید)</label><div class="ce-groups">${gs.map(g=>
      `<label class="ce-check"><input type="checkbox" data-ce="group-${g.id}" ${val('group-'+g.id, chGroups.includes(g.id)) ? 'checked' : ''}/>${escAttr(g.name)}</label>`).join('')}</div></div>`;
  };
  const extras = {
    show_in_news: `
      <div class="field"><label>منطقه‌ی جغرافیایی</label><select data-ce="region_id">
        <option value="">بدون منطقه</option>${REGIONS.map(r=>`<option value="${r.id}" ${String(val('region_id', ch.region_id||''))===String(r.id)?'selected':''}>${escAttr(r.name)}</option>`).join('')}
      </select></div>`,
    show_in_hawza: `
      <div class="field"><label>منطقه‌ی جغرافیایی</label><select data-ce="hawza_region_id">
        <option value="">بدون منطقه</option>${REGIONS.map(r=>`<option value="${r.id}" ${String(val('hawza_region_id', ch.region_id||''))===String(r.id)?'selected':''}>${escAttr(r.name)}</option>`).join('')}
      </select></div>`,
    show_in_cyberspace: `
      <div class="field"><label>صاحب کانال</label><input type="text" data-ce="owner_name" value="${escAttr(val('owner_name', ch.owner_name||''))}" placeholder="نام صاحب کانال" /></div>
      <div class="field"><label>تعداد مخاطب</label><input type="number" min="0" data-ce="subscriber_count" value="${escAttr(val('subscriber_count', ch.subscriber_count==null?'':ch.subscriber_count))}" placeholder="مثلاً ۱۲۰۰۰" /></div>
      <label class="ce-check ce-full"><input type="checkbox" data-ce="is_khorasan_talabeh" ${val('is_khorasan_talabeh', !!ch.is_khorasan_talabeh)?'checked':''}/>صاحب کانال، طلبه‌ی حوزه‌ی خراسان است</label>`,
    show_in_people: groupsHtml('figures'),
    show_in_orgs: groupsHtml('orgs'),
    show_in_thinktanks: '',
    show_in_positions: `
      <div class="field"><label>تب</label><select data-ce="positions_tab">
        ${Object.keys(POS_TAB_LABEL).map(k=>`<option value="${k}" ${val('positions_tab', ch.positions_tab || 'maraji') === k ? 'selected' : ''}>${POS_TAB_LABEL[k]}</option>`).join('')}
      </select></div>`,
    show_in_laws: (()=>{
      const cur = String(val('laws_source', ch.laws_source || '') || '');
      const opts = LAWS_SOURCES.concat(cur && !LAWS_SOURCES.includes(cur) ? [cur] : []);
      return `<div class="field"><label>مرجع صادرکننده (فیلتر)</label><select data-ce="laws_source">
        ${opts.map(s=>`<option value="${escAttr(s === 'سایر' ? '' : s)}" ${(cur || '') === (s === 'سایر' ? '' : s) ? 'selected' : ''}>${escHtml(s)}</option>`).join('')}
      </select></div>`;
    })(),
  };
  wrap.innerHTML = CHAN_SECTIONS.map(sec=>{
    const noMig = !chanSecUsable(sec);
    const blocked = (sec.webOnly && !isWeb) || noMig;
    const on = !blocked && val(sec.field, chanSecOn(ch, sec.field));
    return `<div class="ce-section${on?' on':''}${blocked?' blocked':''}">
      <label class="ce-section-toggle"><input type="checkbox" data-ce="${sec.field}" ${on?'checked':''} ${blocked?'disabled':''}/>
        <div><b>${sec.label}</b><span>${noMig ? 'برای فعال شدن این بخش، ابتدا migration_047 باید در سوپابیس اجرا شود.' : blocked ? 'فقط برای منابع «وب‌سایت» (خبرگزاری‌های حوزوی) قابل انتخاب است.' : sec.hint}</span></div></label>
      <div class="ce-section-extra">${extras[sec.field]}</div>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.ce-section-toggle input').forEach(chk=>{
    chk.addEventListener('change', ()=> chk.closest('.ce-section').classList.toggle('on', chk.checked));
  });
}

function openChanEditor(ch){
  CE_CHANNEL = ch || null;
  CE_AVATAR_FILE = null;
  ceEl('ce-title').textContent = ch ? 'ویرایش «' + (ch.title || ch.username) + '»' : 'افزودن منبع جدید';
  ceEl('ce-name').value = ch ? (ch.title || '') : '';
  ceEl('ce-handle').value = ch ? (ch.username || '') : '';
  ceEl('ce-platform').value = ch ? ch.platform : 'eitaa';
  // بستر منبع ثبت‌شده عوض نمی‌شه (کالکتورها بر اساس همین پست جمع می‌کنن)
  ceEl('ce-platform').disabled = !!ch;
  ceEl('ce-avatar-preview').innerHTML = ch ? chanAvatarHtml(ch) : ICONS.photo;
  ceEl('ce-cat').innerHTML = '<option value="">بدون موضوع</option>' +
    CATEGORIES.map(c=>`<option value="${c.id}" ${ch && c.id===ch.category_id ? 'selected':''}>${escAttr(c.name)}</option>`).join('');
  ceEl('ce-sections').innerHTML = '';
  ceUpdateHandleLabel();
  ceEl('chan-editor-modal').classList.add('active');
  ceEl('chan-editor-modal').querySelector('.modal-card').scrollTop = 0;
}
function closeChanEditor(){
  ceEl('chan-editor-modal').classList.remove('active');
  CE_CHANNEL = null; CE_AVATAR_FILE = null;
}


// ---- افزودن گروهی منابع (۵.۲۶.۰) ----
// هر خط: «لینک [نام]». ایتا eitaa.com/x، تلگرام t.me/x (لینک دعوت خصوصی نه)، @x یا x
// = بستر پیش‌فرض انتخاب‌شده، http(s) دیگه = فید RSS وب‌سایت. بله نه — کالکتورش فقط
// قالب «رصد شایعات» رو می‌شناسه. تکراری = همون بستر + شناسه در منابع فعلی یا همین فهرست.
let BULK_ROWS = [];
const BULK_MAX = 300;
function openBulkChan(){
  BULK_ROWS = [];
  document.getElementById('bulk-chan-text').value = '';
  document.getElementById('bulk-chan-step1').hidden = false;
  document.getElementById('bulk-chan-step2').hidden = true;
  document.getElementById('bulk-chan-modal').classList.add('active');
  setTimeout(()=>document.getElementById('bulk-chan-text').focus(), 50);
}
function closeBulkChan(){ document.getElementById('bulk-chan-modal').classList.remove('active'); }
function bulkChanBack(){ document.getElementById('bulk-chan-step1').hidden = false; document.getElementById('bulk-chan-step2').hidden = true; }
document.getElementById('bulk-chan-file').addEventListener('change', async e=>{
  const f = e.target.files[0]; e.target.value = '';
  if(!f) return;
  if(f.size > 1048576){ showToast('فایل بزرگ‌تر از ۱ مگابایت است؛ فهرست را کوتاه‌تر کنید.'); return; }
  const txt = (await f.text()).replace(/^﻿/, '');
  const ta = document.getElementById('bulk-chan-text');
  ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + txt.split(/\r?\n/).map(l=>l.replace(/"/g, '').replace(/;/g, ',')).join('\n');
  showToast('فایل خوانده شد؛ «بررسی فهرست» را بزنید.');
});
function parseBulkLine(line, defPlat){
  // نیم‌فاصله‌ی نام منبع دست نمی‌خوره (فقط از خودِ لینک/شناسه حذف می‌شه)؛ گیومه‌های CSV چسبانده‌شده هم مثل فایل
  line = faDigitsToEn(line).replace(/"/g, '').trim();
  if(!line || line.startsWith('#')) return null;
  const m = line.match(/^(\S+?)(?:(?:\s*[,،;]\s*|\s+)(.*))?$/);
  const tok = m[1].replace(/[​-‏﻿]/g, '').replace(/[,،;]+$/, ''), title = (m[2] || '').replace(/^[,،;\s]+|[,،;\s]+$/g, '').slice(0, 120);
  const row = { raw: line, title, platform:null, username:null, error:null };
  let x;
  // لینک ایتا/تلگرام/بله: ?… و #… (مثل ?single) کنار؛ اگه با الگوی کانال عمومی نخونه خطاست، هرگز «وب‌سایت»
  const msg = tok.match(/^(?:https?:\/\/)?(?:www\.)?(t\.me|telegram\.me|eitaa\.com|web\.eitaa\.com|ble\.ir)(\/.*)?$/i);
  if(msg){
    const host = msg[1].toLowerCase(), rest = msg[2] || '';
    const webEitaa = host === 'web.eitaa.com' && rest.match(/#@?([A-Za-z0-9_]{3,})/);
    const path = rest.replace(/[?#].*$/, '');
    if(host === 'ble.ir'){ row.error = 'کانال بله پشتیبانی نمی‌شود (جمع‌آوری بله فقط برای «رصد شایعات» ساخته شده)'; return row; }
    if(/^\/(joinchat\/|\+|c\/)/i.test(path)){ row.error = 'لینک دعوت یا کانال خصوصی؛ فقط کانال عمومی قابل رصد است'; return row; }
    if(host === 't.me' || host === 'telegram.me'){
      if((x = path.match(/^\/(?:s\/)?([A-Za-z0-9_]{4,})\/?(?:\d+\/?)?$/))){ row.platform = 'telegram'; row.username = x[1]; return row; }
    }else if(webEitaa){ row.platform = 'eitaa'; row.username = webEitaa[1]; return row; }
    else if(host === 'eitaa.com'){
      if((x = path.match(/^\/([A-Za-z0-9_]{3,})\/?(?:\d+\/?)?$/))){ row.platform = 'eitaa'; row.username = x[1]; return row; }
    }
    row.error = 'لینک ' + (host.includes('eitaa') ? 'ایتا' : 'تلگرام') + ' قابل تشخیص نیست؛ نشانی کانال را به شکل ' + (host.includes('eitaa') ? 'eitaa.com/نام' : 't.me/نام') + ' وارد کنید';
    return row;
  }
  if((x = tok.match(/^@?([A-Za-z][A-Za-z0-9_]{2,})$/))){ row.platform = defPlat; row.username = x[1]; return row; }
  if(/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(tok)){ row.platform = 'website'; row.username = tok; return row; }
  row.error = 'لینک یا نام کاربری قابل تشخیص نیست';
  return row;
}
function bulkKey(platform, username){ return platform + '|' + (platform === 'website' ? username.replace(/\/+$/, '') : username.toLowerCase()); }
function bulkChanPreview(){
  const defPlat = document.getElementById('bulk-chan-default').value;
  const lines = document.getElementById('bulk-chan-text').value.split(/\r?\n/);
  const existing = new Map(CHANNELS.map(c=>[bulkKey(c.platform, String(c.username || '')), c]));
  const seen = new Set();
  const parsed = lines.map(l=>parseBulkLine(l, defPlat)).filter(Boolean);
  BULK_ROWS = parsed.slice(0, BULK_MAX);
  if(!BULK_ROWS.length){ showToast('فهرست خالی است؛ دست‌کم یک لینک وارد کنید.'); return; }
  const cut = parsed.length - BULK_ROWS.length;
  BULK_ROWS.forEach(r=>{
    if(r.error){ r.status = 'bad'; return; }
    const k = bulkKey(r.platform, r.username);
    const ex = existing.get(k);
    if(ex){ r.status = 'dup'; r.dupName = ex.title || ex.username; return; }
    if(seen.has(k)){ r.status = 'dup'; r.dupName = 'تکرار در همین فهرست'; return; }
    seen.add(k); r.status = 'new';
    if(!r.title) r.title = r.platform === 'website' ? (()=>{ try{ return new URL(r.username).hostname.replace(/^www\./, ''); }catch(e){ return r.username; } })() : r.username;
  });
  const n = BULK_ROWS.filter(r=>r.status === 'new').length, d = BULK_ROWS.filter(r=>r.status === 'dup').length, b = BULK_ROWS.filter(r=>r.status === 'bad').length;
  document.getElementById('bulk-chan-sum').innerHTML = `<b>${faNum(n)} منبع تازه</b>${d ? '، ' + faNum(d) + ' تکراری' : ''}${b ? '، ' + faNum(b) + ' نامعتبر' : ''}. تکراری‌ها و نامعتبرها اضافه نمی‌شوند؛ نام منابع تازه را اگر لازم است اصلاح کنید.${cut ? `<br><b class="bulk-cut">فقط ${faNum(BULK_MAX)} خط اول بررسی شد؛ ${faNum(cut)} خط باقی‌مانده را بعد از ذخیره در نوبت بعدی وارد کنید.</b>` : ''}`;
  const PL = { eitaa:'ایتا', telegram:'تلگرام', website:'وب‌سایت' };
  document.getElementById('bulk-chan-table').innerHTML = `<thead><tr><th>بستر</th><th>شناسه یا آدرس</th><th>نام</th><th>وضعیت</th></tr></thead><tbody>${BULK_ROWS.map((r, i)=>`<tr class="${r.status}">
    <td>${r.platform ? PL[r.platform] : '—'}</td>
    <td dir="ltr" class="bulk-handle">${escHtml(r.username || r.raw)}</td>
    <td>${r.status === 'new' ? `<input type="text" data-bulk-title="${i}" value="${escAttr(r.title)}" maxlength="120" aria-label="نام منبع">` : escHtml(r.title || '—')}</td>
    <td><span class="bulk-badge ${r.status}">${r.status === 'new' ? 'تازه' : r.status === 'dup' ? 'تکراری' : 'نامعتبر'}</span>${r.status === 'dup' ? `<small>${escHtml(r.dupName)}</small>` : r.error ? `<small>${escHtml(r.error)}</small>` : ''}</td>
  </tr>`).join('')}</tbody>`;
  // تنظیمات مشترک
  document.getElementById('bulk-chan-cat').innerHTML = '<option value="">بدون موضوع</option>' + CATEGORIES.map(c=>`<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
  document.getElementById('bulk-chan-region').innerHTML = '<option value="">بدون منطقه</option>' + REGIONS.map(r=>`<option value="${r.id}">${escHtml(r.name)}</option>`).join('');
  const hasWeb = BULK_ROWS.some(r=>r.status === 'new' && r.platform === 'website');
  document.getElementById('bulk-chan-secs').innerHTML = CHAN_SECTIONS.filter(sec=>!sec.noBulk && chanSecUsable(sec)).map(sec=>`<label class="ce-check"><input type="checkbox" data-bulk-sec="${sec.field}" ${sec.webOnly && !hasWeb ? 'disabled' : ''}/>${escHtml(sec.label)}${sec.webOnly ? '<small>(فقط وب‌سایت‌ها)</small>' : ''}</label>`).join('');
  const save = document.getElementById('bulk-chan-save');
  save.textContent = n ? 'افزودن ' + faNum(n) + ' منبع' : 'منبع تازه‌ای نیست';
  save.disabled = !n;
  document.getElementById('bulk-chan-step1').hidden = true;
  document.getElementById('bulk-chan-step2').hidden = false;
}
document.getElementById('bulk-chan-table').addEventListener('input', e=>{
  const inp = e.target.closest('[data-bulk-title]'); if(inp) BULK_ROWS[Number(inp.dataset.bulkTitle)].title = inp.value;
});
async function bulkChanSave(){
  const rows = BULK_ROWS.filter(r=>r.status === 'new');
  if(!rows.length) return;
  const secs = {};
  document.querySelectorAll('#bulk-chan-secs [data-bulk-sec]').forEach(el=>{ secs[el.dataset.bulkSec] = el.checked && !el.disabled; });
  if(!Object.values(secs).some(Boolean) && !await uiConfirm('هیچ بخشی انتخاب نشده است\nمنابع اضافه می‌شوند و جمع‌آوری می‌شوند، ولی تا وقتی بخشی برایشان تیک نزنید در سایت دیده نمی‌شوند. ادامه می‌دهید؟')) return;
  const cat = document.getElementById('bulk-chan-cat').value, reg = document.getElementById('bulk-chan-region').value;
  const body = rows.map(r=>{
    const b = { platform: r.platform, username: r.username, title: (r.title || '').trim() || r.username, category_id: cat ? Number(cat) : null };
    CHAN_SECTIONS.filter(sec=>!sec.noBulk && chanSecUsable(sec)).forEach(sec=>{ b[sec.field] = !!secs[sec.field]; });
    if(r.platform !== 'website') b.show_in_hawza = false;
    if(b.show_in_hawza) b.show_in_news = true; // مثل ویرایشگر تکی: کلیدواژه/تشخیص سیاسی فقط روی show_in_news
    b.region_id = (b.show_in_news && reg) ? Number(reg) : null;
    return b;
  });
  const btn = document.getElementById('bulk-chan-save');
  btn.disabled = true; btn.textContent = 'در حال افزودن…';
  try{
    const r = await api('/channels?on_conflict=platform,username', { method:'POST', headers:{ Prefer:'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(body) });
    if(!r.ok) throw new Error('channels bulk ' + r.status);
    const added = (await r.json()).length;
    closeBulkChan();
    await loadChannels();
    PF_EXTRA_AT = {}; LAWS_AT = 0;
    renderChanList(); renderCatGrid(); renderChannelCards(); populatePostFilters(); populateExportFilters();
    renderNewsFeed(); renderPosts(); renderCyberPeopleGrid(); populatePoliticalFiguresSourceOptions(); renderPoliticalFigures();
    loadCrawlSites();
    showToast(faNum(added) + ' منبع اضافه شد؛ از اجرای بعدی جمع‌آوری (حداکثر ۲ ساعت دیگر) مطالبشان می‌رسد.');
  }catch(e){
    console.error(e);
    showToast('افزودن ناموفق بود؛ اتصال اینترنت را بررسی کنید و دوباره امتحان کنید.');
    btn.disabled = false; btn.textContent = 'افزودن ' + faNum(rows.length) + ' منبع';
  }
}

ceEl('ce-platform').addEventListener('change', ceUpdateHandleLabel);
ceEl('ce-avatar-input').addEventListener('change', ()=>{
  const file = ceEl('ce-avatar-input').files[0];
  if(!file) return;
  CE_AVATAR_FILE = file;
  ceEl('ce-avatar-preview').innerHTML = `<img src="${URL.createObjectURL(file)}" alt="" />`;
});
ceEl('add-chan-btn').addEventListener('click', ()=> openChanEditor(null));
document.addEventListener('keydown', e=>{
  if(e.key === 'Escape' && ceEl('chan-editor-modal').classList.contains('active')) closeChanEditor();
});

ceEl('ce-save-btn').addEventListener('click', async ()=>{
  const btn = ceEl('ce-save-btn');
  const ch = CE_CHANNEL;
  const platform = ceEl('ce-platform').value;
  const name = ceEl('ce-name').value.trim();
  const rawHandle = ceEl('ce-handle').value.trim();
  const handle = platform === 'website' ? rawHandle : rawHandle.replace(/^@/,'');
  if(!name){ showToast('نام منبع را وارد کنید'); ceEl('ce-name').focus(); return; }
  if(!handle){ showToast(platform==='website' ? 'آدرس فید RSS را وارد کنید' : 'یوزرنیم کانال را وارد کنید'); ceEl('ce-handle').focus(); return; }
  const get = key=>{ const el = ceEl('ce-sections').querySelector(`[data-ce="${key}"]`); return el ? (el.type==='checkbox' ? el.checked : el.value) : undefined; };
  const catVal = ceEl('ce-cat').value;
  const body = { title:name, username:handle, category_id: catVal ? Number(catVal) : null };
  CHAN_SECTIONS.filter(chanSecUsable).forEach(sec=>{ body[sec.field] = !!get(sec.field); });
  if(newColsReady()){
    body.positions_tab = body.show_in_positions ? (get('positions_tab') || 'maraji') : null;
    body.laws_source = body.show_in_laws ? ((get('laws_source') || '').trim() || null) : null;
  }
  if(platform !== 'website') body.show_in_hawza = false;
  // «درباره حوزه» توی دیتابیس show_in_news رو هم لازم داره (کلیدواژه و تشخیص
  // سیاسی‌اجتماعی فقط روی منابع show_in_news اجرا می‌شن)
  const newsTicked = body.show_in_news;
  if(body.show_in_hawza) body.show_in_news = true;
  if(newsTicked || body.show_in_hawza){
    const reg = newsTicked ? get('region_id') : get('hawza_region_id');
    body.region_id = reg ? Number(reg) : null;
  }
  if(body.show_in_cyberspace){
    body.owner_name = (get('owner_name')||'').trim() || null;
    const sub = get('subscriber_count'); body.subscriber_count = sub==='' || sub==null ? null : Number(faDigitsToEn(String(sub)));
    body.is_khorasan_talabeh = !!get('is_khorasan_talabeh');
  }
  btn.disabled = true; btn.textContent = 'در حال ذخیره…';
  try{
    if(CE_AVATAR_FILE) body.avatar_url = await uploadChannelAvatarFile(CE_AVATAR_FILE);
    let id = ch && ch.id;
    if(ch){
      const r = await api('/channels?id=eq.'+ch.id, {method:'PATCH', body: JSON.stringify(body)});
      if(!r.ok) throw new Error('patch');
    }else{
      body.platform = platform;
      const r = await api('/channels', {method:'POST', headers:{Prefer:'return=representation'}, body: JSON.stringify(body)});
      if(!r.ok){ showToast('این منبع از قبل ثبت شده یا خطایی رخ داد'); return; }
      id = (await r.json())[0].id;
    }
    // گروه‌ها: فقط گروه‌های بخش‌هایی که تیکشون خورده؛ بقیه‌ی عضویت‌ها حذف می‌شن
    const kinds = [body.show_in_people && 'figures', body.show_in_orgs && 'orgs'].filter(Boolean);
    const wanted = new Set(PROFILE_GROUPS.filter(g=>kinds.includes(g.kind) && get('group-'+g.id)).map(g=>g.id));
    const current = new Set(CHANNEL_PROFILE_GROUPS.filter(x=>x.channel_id===id).map(x=>x.group_id));
    const ops = [];
    wanted.forEach(gid=>{ if(!current.has(gid)) ops.push(api('/channel_profile_groups', {method:'POST', headers:{Prefer:'return=minimal'}, body: JSON.stringify({channel_id:id, group_id:gid})})); });
    current.forEach(gid=>{ if(!wanted.has(gid)) ops.push(api('/channel_profile_groups?channel_id=eq.'+id+'&group_id=eq.'+gid, {method:'DELETE'})); });
    await Promise.all(ops);
    await Promise.all([loadChannels(), loadChannelProfileGroups()]);
    PF_EXTRA_AT = {}; LAWS_AT = 0; // عضویت بخش‌های تازه عوض شده باشه، داده‌ی جدا دوباره گرفته بشه
    closeChanEditor();
    renderChanList(); renderCatGrid(); renderChannelCards(); populatePostFilters(); populateExportFilters();
    renderNewsFeed(); renderPosts(); renderCyberPeopleGrid(); populatePoliticalFiguresSourceOptions(); renderPoliticalFigures(); renderProfileGroupAdmin();
    loadCrawlSites(); // سایت تازه‌ی مدیریت منابع → خودکار در فهرست خزنده‌ی «درباره حوزه»
    showToast(ch ? 'تغییرات ذخیره شد' : 'منبع جدید اضافه شد');
  }catch(e){
    showToast('ذخیره ناموفق بود؛ دوباره تلاش کنید');
  }finally{
    btn.disabled = false; btn.textContent = 'ذخیره';
  }
});


document.getElementById('add-cat-btn').addEventListener('click', async ()=>{
  const el = document.getElementById('new-cat-name');
  const v = el.value.trim();
  if(!v) return;
  const r = await api('/categories', {method:'POST', headers:{Prefer:'return=minimal'}, body: JSON.stringify({name:v})});
  if(r.ok){ el.value=''; await loadCategories(); refreshCatOptions(); renderCatGrid(); renderChanList(); }
  else showToast('این دسته‌بندی از قبل وجود دارد یا خطایی رخ داد.');
});

document.getElementById('add-region-btn').addEventListener('click', async ()=>{
  const el = document.getElementById('new-region-name');
  const v = el.value.trim();
  if(!v) return;
  const r = await api('/regions', {method:'POST', headers:{Prefer:'return=minimal'}, body: JSON.stringify({name:v})});
  if(r.ok){ el.value=''; await loadRegions(); refreshRegionOptions(); renderRegionGrid(); renderNewsRegionChips(); renderChanList(); }
  else showToast('این منطقه از قبل وجود دارد یا خطایی رخ داد.');
});

function renderTopicGrid(){
  topicGridEl.innerHTML = '';
  NEWS_TOPICS.forEach(t=>{
    const el=document.createElement('div'); el.className='cat-card';
    el.innerHTML = `<span class="name"><b>${escAttr(t.name)}</b><div style="font-size:11px;font-weight:500;color:var(--text-faint);margin-top:2px;">${escAttr(t.keywords)}</div></span><span class="cc-actions"></span>`;
    const del=document.createElement('button'); del.className='del-btn'; del.textContent='✕'; del.title='حذف موضوع'; del.setAttribute('aria-label','حذف موضوع‌ی '+t.name);
    del.addEventListener('click', async ()=>{
      if(!await uiConfirm('موضوع «' + t.name + '» حذف شود؟')) return;
      await api('/news_topics?id=eq.'+t.id, {method:'DELETE'});
      await loadNewsTopics();
      renderTopicGrid(); renderNewsTopicRow();
    });
    el.querySelector('.cc-actions').appendChild(del);
    topicGridEl.appendChild(el);
  });
}

document.getElementById('add-topic-btn').addEventListener('click', async ()=>{
  const nameEl = document.getElementById('new-topic-name');
  const kwEl = document.getElementById('new-topic-keywords');
  const name = nameEl.value.trim();
  const keywords = kwEl.value.trim();
  if(!name || !keywords) return;
  const r = await api('/news_topics', {method:'POST', headers:{Prefer:'return=minimal'}, body: JSON.stringify({name, keywords, sort_order: NEWS_TOPICS.length})});
  if(r.ok){
    nameEl.value=''; kwEl.value='';
    await loadNewsTopics();
    renderTopicGrid(); renderNewsTopicRow();
  }else{
    showToast('انجام نشد؛ اتصال را بررسی کنید و دوباره امتحان کنید.');
  }
});

// ---- منابع خزنده‌ی «درباره حوزه» (crawl_sites، migration_041 — ۵.۲۳.۰) ----
let CRAWL_SITES = null, CRAWL_SITES_ERR = '';
const CRAWL_VIA = { sitemap:'فهرست خبری (sitemap)', rss:'فید RSS', homepage:'صفحه‌ی اول' };
async function loadCrawlSites(sync = true){
  if(currentRole !== 'app_admin') return;
  try{
    const r = await api('/crawl_sites?select=*&order=name');
    CRAWL_SITES_ERR = r.ok ? '' : ((r.status === 404 || r.status === 400) ? 'missing' : 'error');
    CRAWL_SITES = r.ok ? await r.json() : [];
  }catch(e){ CRAWL_SITES_ERR = 'error'; CRAWL_SITES = []; }
  if(sync && !CRAWL_SITES_ERR && await syncCrawlSitesFromChannels()) return loadCrawlSites(false);
  renderCrawlSites();
}
// ---- سایت‌های «مدیریت منابع» → خزش کامل (خواست کاربر: بعضی سایت‌ها فقط با RSS یه بخش
// در مدیریت منابع‌ان، ولی برای «درباره حوزه» کل سایت باید گشته بشه) ----
// نشانی اصلی سایت از آدرس RSS: isna.ir/rss/tp/5 → https://www.isna.ir؛ زیردامنه‌ی فید
// (feeds./rss./moxie.) برداشته می‌شه و بخش زبانی (/persian، /farsi، /fa-ir) می‌مونه
function rssSiteRoot(rss){
  try{
    const u = new URL(rss);
    let h = u.hostname.toLowerCase(), stripped = false;
    const MAP = { 'feeds.bbci.co.uk':'bbc.com', 'feeds.a.dj.com':'wsj.com' };
    if(MAP[h]){ h = MAP[h]; stripped = true; }
    else if(/^(feeds?|rss|moxie)\./.test(h)){ h = h.replace(/^(feeds?|rss|moxie)\./, ''); stripped = true; }
    const seg = (u.pathname.split('/')[1] || '').toLowerCase();
    const prefix = ['persian','farsi','fa-ir','fa'].includes(seg) && !/\.ir$/.test(h) ? '/' + seg : '';
    const host = stripped && h.split('.').length === 2 ? 'www.' + h : h;
    return 'https://' + host + prefix;
  }catch(e){ return null; }
}
function crawlSiteKey(url){
  try{ const u = new URL(url); return u.hostname.toLowerCase().replace(/^www\./, '') + u.pathname.replace(/\/+$/, ''); }catch(e){ return ''; }
}
function channelCrawlRoots(){
  const out = {};
  CHANNELS.filter(c=>c.platform === 'website' && c.active !== false && !c.show_in_hawza).forEach(c=>{
    const root = rssSiteRoot(c.username);
    if(!root) return;
    const k = crawlSiteKey(root);
    if(!out[k]) out[k] = { root, channels: [] };
    out[k].channels.push(c);
  });
  return out;
}
async function syncCrawlSitesFromChannels(){
  const have = new Set((CRAWL_SITES || []).map(c=>crawlSiteKey(c.url)));
  const rows = [];
  Object.entries(channelCrawlRoots()).forEach(([k, v])=>{
    if(have.has(k)) return;
    // سایت غیرفارسی (CNN، گاردین…): خزش کاملش سنگینه و بعضی‌ها ربات رو می‌بندن —
    // متوقف اضافه می‌شه (فید RSSش همچنان بررسی می‌شه) و مدیر می‌تونه فعالش کنه
    const sample = POSTS_CACHE.filter(p=>v.channels.some(c=>c.id === p.channel_id)).slice(0, 10);
    const foreign = sample.length > 0 && sample.filter(needsTranslation).length > sample.length / 2;
    const name = (v.channels[0].title || k).split(/\s+[-–—|]\s+/)[0].trim() || k;
    rows.push({ name: name.slice(0, 80), url: v.root, active: !foreign, source: 'channel' });
  });
  if(!rows.length) return false;
  try{
    const r = await api('/crawl_sites?on_conflict=url', { method:'POST', headers:{ Prefer:'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(rows) });
    return r.ok;
  }catch(e){ return false; }
}
function crawlSiteStatus(c){
  if(!c.active) return { cls:'is-off', text:'متوقف' };
  if(!c.last_run_at) return { cls:'', text:'هنوز اجرا نشده است' };
  const when = newsRelTime(c.last_run_at);
  if(c.last_error) return { cls:'is-bad', text: when + '، ' + c.last_error };
  return { cls:'is-ok', text: when + '، ' + toFaDigits(c.last_pages || 0) + ' خبر تازه خوانده شد، ' + toFaDigits(c.last_found || 0) + ' خبر مرتبط' + (c.last_via ? '، از ' + (CRAWL_VIA[c.last_via] || c.last_via) : '') };
}
function renderCrawlSites(){
  const box = document.getElementById('crawl-site-list');
  if(!box) return;
  if(CRAWL_SITES_ERR === 'missing'){
    box.innerHTML = '<p class="settings-help">جدول این بخش هنوز ساخته نشده است؛ فایل db/migration_041_hawza_crawler.sql را در SQL Editor سوپابیس اجرا کنید.</p>';
    return;
  }
  if(CRAWL_SITES_ERR === 'error'){ box.innerHTML = '<p class="settings-help">دریافت فهرست انجام نشد؛ صفحه را دوباره باز کنید.</p>'; return; }
  const list = CRAWL_SITES || [];
  const active = list.filter(c=>c.active).length;
  const bad = list.filter(c=>c.active && c.last_error).length;
  document.getElementById('crawl-sites-sum').textContent = toFaDigits(active) + ' سایت فعال' + (bad ? '، ' + toFaDigits(bad) + ' سایت در آخرین اجرا خطا داشت' : '') + '؛ سایت‌هایی که خزنده هر ۳ ساعت برای پیدا کردن خبرهای مربوط به حوزه می‌گردد';
  const sorted = list.slice().sort((a,b)=>(b.active - a.active) || ((b.active && b.last_error ? 1 : 0) - (a.active && a.last_error ? 1 : 0)) || a.name.localeCompare(b.name, 'fa'));
  const fromChannels = channelCrawlRoots();
  box.innerHTML = sorted.map(c=>{
    const st = crawlSiteStatus(c);
    let host = c.url; try{ const u = new URL(c.url); host = u.host.replace(/^www\./, '') + u.pathname.replace(/\/+$/, ''); }catch(e){}
    const linked = fromChannels[crawlSiteKey(c.url)];
    if(CRAWL_EDIT_ID === c.id){
      return `<div class="crawl-site crawl-edit">
        <div class="add-row">
          <input type="text" id="crawl-edit-name" aria-label="نام سایت" value="${escAttr(c.name)}" />
          <input type="url" id="crawl-edit-sitemap" aria-label="نشانی فهرست خبری (اختیاری)" placeholder="sitemap (اختیاری؛ خالی = پیدا کردن خودکار)" dir="ltr" value="${escAttr(c.sitemap_url || '')}" />
          <button type="button" class="btn primary btn-sm" onclick="saveCrawlSite(${Number(c.id)})">ذخیره</button>
          <button type="button" class="btn btn-sm" data-crawl-edit="">انصراف</button>
        </div>
      </div>`;
    }
    return `<div class="crawl-site ${st.cls}">
      <div class="crawl-site-main">
        <div class="crawl-site-name">${escHtml(c.name)} <a class="crawl-site-host" href="${safeUrl(c.url)}" target="_blank" rel="noopener" dir="ltr">${escHtml(host)}</a>${linked ? '<span class="crawl-sug-kind is-chan" title="این سایت در «مدیریت منابع» هم هست و خودکار به این فهرست اضافه شده است">از مدیریت منابع</span>' : ''}</div>
        <div class="crawl-site-status">${escHtml(st.text)}</div>
      </div>
      <div class="crawl-site-acts">
        <button type="button" class="usr-act" onclick="toggleCrawlSite(${Number(c.id)})">${c.active ? 'توقف' : 'فعال‌سازی'}</button>
        <button type="button" class="usr-act" data-crawl-edit="${Number(c.id)}">ویرایش</button>
        ${linked ? '' : `<button type="button" class="usr-act is-del" onclick="deleteCrawlSite(${Number(c.id)})">حذف</button>`}
      </div>
    </div>`;
  }).join('') || '<p class="settings-help">هنوز سایتی اضافه نشده است.</p>';
}
let CRAWL_EDIT_ID = null;
document.getElementById('crawl-site-list').addEventListener('click', e=>{
  const b = e.target.closest('[data-crawl-edit]');
  if(b){ CRAWL_EDIT_ID = b.dataset.crawlEdit ? Number(b.dataset.crawlEdit) : null; renderCrawlSites(); }
});
async function saveCrawlSite(id){
  const name = document.getElementById('crawl-edit-name').value.trim();
  let sitemap = document.getElementById('crawl-edit-sitemap').value.trim();
  if(!name){ showToast('نام سایت را وارد کنید.'); return; }
  if(sitemap){
    try{ sitemap = new URL(/^https?:\/\//i.test(sitemap) ? sitemap : 'https://' + sitemap).href; }
    catch(e){ showToast('نشانی فهرست خبری درست نیست؛ می‌توانید آن را خالی بگذارید.'); return; }
  }
  const r = await api('/crawl_sites?id=eq.' + id, { method:'PATCH', headers:{ Prefer:'return=minimal' }, body: JSON.stringify({ name, sitemap_url: sitemap || null }) });
  if(!r.ok){ showToast('ذخیره انجام نشد؛ دوباره امتحان کنید.'); return; }
  const c = (CRAWL_SITES || []).find(x=>x.id === id);
  if(c){ c.name = name; c.sitemap_url = sitemap || null; }
  CRAWL_EDIT_ID = null;
  renderCrawlSites();
  showToast('ذخیره شد');
}
async function toggleCrawlSite(id){
  const c = (CRAWL_SITES || []).find(x=>x.id === id);
  if(!c) return;
  const r = await api('/crawl_sites?id=eq.' + id, { method:'PATCH', headers:{ Prefer:'return=minimal' }, body: JSON.stringify({ active: !c.active }) });
  if(!r.ok){ showToast('انجام نشد؛ اتصال را بررسی کنید و دوباره امتحان کنید.'); return; }
  c.active = !c.active;
  renderCrawlSites();
  showToast(c.active ? '«' + c.name + '» در اجرای بعدی خزنده جست‌وجو می‌شود' : '«' + c.name + '» دیگر جست‌وجو نمی‌شود');
}
async function deleteCrawlSite(id){
  const c = (CRAWL_SITES || []).find(x=>x.id === id);
  if(!c || !await uiConfirm('حذف «' + c.name + '» از منابع خزنده؟\nخبرهایی که تا الان از این سایت پیدا شده، باقی می‌مانند.')) return;
  const r = await api('/crawl_sites?id=eq.' + id, { method:'DELETE', headers:{ Prefer:'return=minimal' } });
  if(!r.ok){ showToast('حذف انجام نشد؛ دوباره امتحان کنید.'); return; }
  CRAWL_SITES = CRAWL_SITES.filter(x=>x.id !== id);
  renderCrawlSites();
}
let CRAWL_SUGGEST = [];
const CRAWL_SUG_KIND = { site:'سایت', eitaa:'ایتا', telegram:'تلگرام' };
async function loadCrawlSuggestions(){
  try{
    const r = await api('/crawl_suggestions?select=*&status=eq.new&order=found.desc,hits.desc,last_seen_at.desc&limit=40');
    CRAWL_SUGGEST = r.ok ? await r.json() : [];
  }catch(e){ CRAWL_SUGGEST = []; }
  renderCrawlSuggestions();
}
function crawlSugUrl(s){
  return s.kind === 'site' ? 'https://' + s.key : s.kind === 'telegram' ? 'https://t.me/' + s.key : 'https://eitaa.com/' + s.key;
}
function renderCrawlSuggestions(){
  const wrap = document.getElementById('crawl-sug-wrap');
  const box = document.getElementById('crawl-sug-list');
  if(!wrap || !box) return;
  wrap.hidden = !CRAWL_SUGGEST.length;
  box.innerHTML = CRAWL_SUGGEST.map(s=>{
    const stat = toFaDigits(s.hits) + ' مطلب مرتبط به آن لینک داده' + (s.found ? '، ' + toFaDigits(s.found) + ' صفحه‌ی آن درباره‌ی حوزه بود' : '');
    return `<div class="crawl-site crawl-sug">
      <div class="crawl-site-main">
        <div class="crawl-site-name"><span class="crawl-sug-kind">${escHtml(CRAWL_SUG_KIND[s.kind] || s.kind)}</span><a class="crawl-site-host" href="${safeUrl(crawlSugUrl(s))}" target="_blank" rel="noopener" dir="ltr">${escHtml(s.kind === 'site' ? s.key : '@' + s.key)}</a></div>
        <div class="crawl-site-status">${escHtml(stat)}${s.sample_url ? ` — <a href="${safeUrl(s.sample_url)}" target="_blank" rel="noopener">نمونه</a>` : ''}</div>
      </div>
      <div class="crawl-site-acts">
        <button type="button" class="usr-act" onclick="addCrawlSuggestion(${Number(s.id)})">افزودن</button>
        <button type="button" class="usr-act" onclick="ignoreCrawlSuggestion(${Number(s.id)})">نادیده گرفتن</button>
      </div>
    </div>`;
  }).join('');
}
async function setCrawlSuggestionStatus(id, status){
  const r = await api('/crawl_suggestions?id=eq.' + id, { method:'PATCH', headers:{ Prefer:'return=minimal' }, body: JSON.stringify({ status }) });
  if(r.ok){ CRAWL_SUGGEST = CRAWL_SUGGEST.filter(x=>x.id !== id); renderCrawlSuggestions(); }
  return r.ok;
}
async function ignoreCrawlSuggestion(id){
  if(!await setCrawlSuggestionStatus(id, 'ignored')) showToast('انجام نشد؛ دوباره امتحان کنید.');
}
async function addCrawlSuggestion(id){
  const s = CRAWL_SUGGEST.find(x=>x.id === id);
  if(!s) return;
  let r;
  if(s.kind === 'site'){
    r = await api('/crawl_sites', { method:'POST', headers:{ Prefer:'return=minimal' }, body: JSON.stringify({ name: s.name || s.key, url: 'https://' + s.key }) });
  }else{
    r = await api('/channels', { method:'POST', headers:{ Prefer:'return=minimal' }, body: JSON.stringify({ platform: s.kind, username: s.key, title: s.key, active: true }) });
  }
  if(!r.ok && r.status !== 409){ showToast('افزودن انجام نشد؛ اتصال را بررسی کنید و دوباره امتحان کنید.'); return; }
  await setCrawlSuggestionStatus(id, 'added');
  if(s.kind === 'site'){
    await loadCrawlSites();
    showToast('«' + s.key + '» به منابع خزنده اضافه شد و در اجرای بعدی جست‌وجو می‌شود. نام فارسی آن را می‌توانید بعداً با حذف و افزودن دوباره اصلاح کنید.');
  }else{
    try{ await loadChannels(); renderChanList(); loadCrawlSites(); }catch(e){}
    showToast('کانال @' + s.key + ' به «مدیریت منابع» اضافه شد؛ پست‌هایش از اجرای بعدی جمع و بررسی می‌شود. نام و بخش‌های نمایش آن را از همان‌جا تنظیم کنید.');
  }
}
document.getElementById('add-crawl-btn').addEventListener('click', async ()=>{
  const nameEl = document.getElementById('new-crawl-name');
  const urlEl = document.getElementById('new-crawl-url');
  const smEl = document.getElementById('new-crawl-sitemap');
  const name = nameEl.value.trim();
  const norm = v=>{ v = v.trim(); if(!v) return ''; if(!/^https?:\/\//i.test(v)) v = 'https://' + v; try{ const u = new URL(v); return u.origin + u.pathname.replace(/\/+$/, ''); }catch(e){ return null; } };
  const url = norm(urlEl.value);
  const sitemap = smEl.value.trim() ? (()=>{ try{ return new URL(/^https?:\/\//i.test(smEl.value.trim()) ? smEl.value.trim() : 'https://' + smEl.value.trim()).href; }catch(e){ return null; } })() : '';
  if(!name || !url){ showToast(url === null ? 'نشانی سایت درست نیست؛ مثلاً https://www.isna.ir' : 'نام و نشانی سایت را وارد کنید.'); return; }
  if(sitemap === null){ showToast('نشانی فهرست خبری درست نیست؛ می‌توانید آن را خالی بگذارید.'); return; }
  const r = await api('/crawl_sites', { method:'POST', headers:{ Prefer:'return=minimal' }, body: JSON.stringify({ name, url, sitemap_url: sitemap || null }) });
  if(!r.ok){ showToast(r.status === 409 ? 'این سایت قبلاً اضافه شده است.' : 'افزودن انجام نشد؛ اتصال را بررسی کنید و دوباره امتحان کنید.'); return; }
  nameEl.value = ''; urlEl.value = ''; smEl.value = '';
  await loadCrawlSites();
  showToast('«' + name + '» اضافه شد و در اجرای بعدی خزنده جست‌وجو می‌شود.');
});

// ---- گروه‌های گالری «یادداشت‌ها» (چهره‌ها / سازمان‌ها) ----
const PROFILE_GROUP_KIND_LABEL = { figures:'چهره‌ها', orgs:'سازمان‌ها' };
function renderProfileGroupAdmin(){
  const grid = document.getElementById('profile-group-grid');
  if(!grid) return;
  grid.innerHTML = '';
  PROFILE_GROUPS.forEach(g=>{
    const n = CHANNEL_PROFILE_GROUPS.filter(x=>x.group_id===g.id).length;
    const el=document.createElement('div'); el.className='cat-card';
    el.innerHTML = `<span class="name"><b class="pg-name">${escAttr(g.name)}</b><div style="font-size:11px;font-weight:500;color:var(--text-faint);margin-top:2px;">${PROFILE_GROUP_KIND_LABEL[g.kind]||g.kind} · ${toFaDigits(n)} منبع</div></span><span class="cc-actions"></span>`;
    makeRenamable(el.querySelector('.pg-name'), g.name, async val=>{
      await patchOk('/profile_groups?id=eq.'+g.id, {name: val});
      await loadProfileGroups(); renderProfileGroupAdmin(); renderPoliticalFigures();
    });
    const del=document.createElement('button'); del.className='del-btn'; del.textContent='✕'; del.title='حذف گروه'; del.setAttribute('aria-label','حذف گروه '+g.name);
    del.addEventListener('click', async ()=>{
      if(!await uiConfirm('گروه «' + g.name + '» حذف شود؟' + (n ? '\n' + n + ' منبع از این گروه خارج می‌شوند (خود منابع حذف نمی‌شوند).' : ''))) return;
      await api('/profile_groups?id=eq.'+g.id, {method:'DELETE'});
      await Promise.all([loadProfileGroups(), loadChannelProfileGroups()]);
      renderProfileGroupAdmin(); renderPoliticalFigures();
    });
    el.querySelector('.cc-actions').appendChild(del);
    grid.appendChild(el);
  });
}

document.getElementById('add-profile-group-btn').addEventListener('click', async ()=>{
  const nameEl = document.getElementById('new-profile-group-name');
  const kind = document.getElementById('new-profile-group-kind').value;
  const name = nameEl.value.trim();
  if(!name) return;
  const r = await api('/profile_groups', {method:'POST', headers:{Prefer:'return=minimal'}, body: JSON.stringify({name, kind, sort_order: PROFILE_GROUPS.length})});
  if(r.ok){
    nameEl.value='';
    await loadProfileGroups();
    renderProfileGroupAdmin(); renderPoliticalFigures();
  }else{
    showToast('انجام نشد؛ اتصال را بررسی کنید و دوباره امتحان کنید.');
  }
});

// ---- پنل مدیریت موضوعات «پرونده‌های موضوعی» ----
document.getElementById('add-dossier-topic-btn').addEventListener('click', async ()=>{
  const nameEl = document.getElementById('new-dossier-topic-name');
  const kwEl = document.getElementById('new-dossier-topic-keywords');
  const name = nameEl.value.trim();
  const keywords = kwEl.value.trim();
  if(!name || !keywords) return;
  // return=representation نه minimal: بلافاصله بعد از ساخت موضوع، به id تازه
  // نیاز داریم تا بررسی اولیه‌ی خودکار (autoMatchDossierTopic) رو روی همون
  // موضوع اجرا کنیم — بدون این، باید یه round-trip جدا برای پیداکردن id بزنیم
  const r = await api('/dossier_topics', {method:'POST', headers:{Prefer:'return=representation'}, body: JSON.stringify({name, keywords, active:true, sort_order: DOSSIER_TOPICS.length})});
  if(r.ok){
    const rows = await r.json();
    const created = Array.isArray(rows) ? rows[0] : null;
    nameEl.value=''; kwEl.value='';
    await loadDossierTopics();
    renderDossierTopicAdminList();
    if(created){
      const count = await autoMatchDossierTopic(created.id, {silent:true});
      showToast(count ? ('موضوع اضافه شد. ' + toFaDigits(count) + ' خبر مرتبط از پست‌های موجود پیدا و اضافه شد.') : 'موضوع اضافه شد. فعلاً خبری با این کلیدواژه‌ها در پست‌های موجود پیدا نشد — با ورود خبر تازه یا با دکمه‌ی «جست‌وجوی خودکار» دوباره بررسی می‌شود.');
    }
  }else{
    showToast('انجام نشد؛ اتصال را بررسی کنید و دوباره امتحان کنید.');
  }
});

// تطبیق متنی ساده‌ی کلیدواژه‌ها (همون منطق دوطرفه‌ی Edge Function
// extract-post-keywords) — برای بررسی اولیه‌ی خودکار موضوع تازه‌ساخته‌شده
// روی backlog پست‌های موجود، و برای دکمه‌ی «جست‌وجوی خودکار» دستی
function keywordListsMatch(topicKeywords, postKeywords){
  return topicKeywords.some(tk => postKeywords.some(pk => pk.includes(tk) || tk.includes(pk)));
}

// چرا این تابع لازمه، جدا از تطبیق خودکار داخل Edge Function: اون فقط
// همون دسته‌ی تازه‌پردازش‌شده‌ی هر اجرای extract-post-keywords رو با
// موضوعات فعال تطبیق می‌ده — یه موضوع تازه‌ساخته‌شده هیچ‌وقت روی
// backlog پست‌هایی که از قبل کلیدواژه گرفتن (posted_at قدیمی‌تر از
// آخرین batch) بررسی نمی‌شه. این تابع همون تطبیق رو مستقیم از فرانت‌اند
// (با توکن مدیر) روی همه‌ی پست‌های ai_keywords-دار موجود اجرا می‌کنه.
async function autoMatchDossierTopic(topicId, opts){
  opts = opts || {};
  const topic = DOSSIER_TOPICS.find(t=>t.id===topicId);
  if(!topic) return 0;
  const topicKeywords = (topic.keywords||'').split(',').map(k=>k.trim()).filter(Boolean);
  if(!topicKeywords.length) return 0;
  const r = await api('/posts?select=id,ai_keywords&ai_keywords=not.is.null&order=posted_at.desc&limit=3000');
  const posts = r.ok ? await r.json() : [];
  const already = new Set(DOSSIER_TOPIC_POSTS.filter(dp=>dp.topic_id===topicId).map(dp=>dp.post_id));
  const inserts = [];
  for(const p of posts){
    if(already.has(p.id)) continue;
    const postKeywords = Array.isArray(p.ai_keywords) ? p.ai_keywords : [];
    if(postKeywords.length && keywordListsMatch(topicKeywords, postKeywords)) inserts.push({topic_id: topicId, post_id: p.id, source:'auto'});
  }
  if(inserts.length){
    // on_conflict + ignore-duplicates: اگه مدیر قبلاً یه match رو دستی
    // حذف/پنهان کرده بود، این اجرای دوباره نباید دوباره‌ش اضافه کنه —
    // چون همون ردیف (topic_id,post_id) از قبل هست، insert نادیده گرفته می‌شه
    await api('/dossier_topic_posts?on_conflict=topic_id,post_id', {method:'POST', headers:{Prefer:'resolution=ignore-duplicates,return=minimal'}, body: JSON.stringify(inserts)});
    await loadDossierTopicPosts();
    renderDossierTopicAdminList();
  }
  if(!opts.silent) showToast(inserts.length ? (toFaDigits(inserts.length) + ' خبر با کلیدواژه‌های این موضوع پیدا و اضافه شد.') : 'با کلیدواژه‌های فعلی این موضوع، خبر جدیدی در پست‌های موجود پیدا نشد.');
  return inserts.length;
}

// ویرایش کلیدواژه‌های یه موضوع «پرونده‌های موضوعی» — جایگزینی درجا (inline) شبیه
// الگوی editPostKeywords/savePostKeywords، بدون مودال جدا
function editDossierTopicKeywords(id){
  const t = DOSSIER_TOPICS.find(x=>x.id===id);
  const kwEl = document.getElementById('dossier-topic-kw-'+id);
  if(!t || !kwEl) return;
  kwEl.innerHTML = `
    <input type="text" id="dossier-topic-kw-input-${id}" value="${escAttr(t.keywords)}" placeholder="کلیدواژه‌ها، جدا با ویرگول" style="width:100%;font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--border-strong);background:var(--surface-2);color:var(--text);font-family:inherit;box-sizing:border-box;" />
    <div style="display:flex;gap:6px;margin-top:6px;">
      <button type="button" class="btn btn-sm" onclick="saveDossierTopicKeywords(${id})">ذخیره</button>
      <button type="button" class="btn btn-sm" onclick="renderDossierTopicAdminList()">انصراف</button>
    </div>`;
  document.getElementById('dossier-topic-kw-input-'+id).focus();
}

// بعد از ذخیره، همون بررسی «جست‌وجوی خودکار» رو هم خودکار روی
// کلیدواژه‌های تازه اجرا می‌کنه — چون کلیدواژه عوض شده، ممکنه خبرهای
// تازه‌ای توی backlog match بشن که با کلیدواژه‌ی قبلی نمی‌شدن. match
// قبلی که با کلیدواژه‌ی جدید دیگه ربطی نداره خودکار حذف نمی‌شه — مدیر
// باید خودش دستی «پنهان»/حذفش کنه (تا هیچ رکوردی بی‌سروصدا از دست نره)
async function saveDossierTopicKeywords(id){
  const inputEl = document.getElementById('dossier-topic-kw-input-'+id);
  if(!inputEl) return;
  const keywords = inputEl.value.trim();
  if(!keywords) return;
  const r = await api('/dossier_topics?id=eq.'+id, {method:'PATCH', headers:{Prefer:'return=minimal'}, body: JSON.stringify({keywords})});
  if(!r.ok){ showToast('انجام نشد؛ اتصال را بررسی کنید و دوباره امتحان کنید.'); return; }
  await loadDossierTopics();
  renderDossierTopicAdminList();
  const count = await autoMatchDossierTopic(id, {silent:true});
  showToast(count ? ('کلیدواژه‌ها ذخیره شد. ' + toFaDigits(count) + ' خبر تازه با کلیدواژه‌های جدید پیدا و اضافه شد.') : 'کلیدواژه‌ها ذخیره شد. با کلیدواژه‌های تازه، خبر جدیدی در پست‌های موجود پیدا نشد.');
}

function renderDossierTopicAdminList(){
  const wrap = document.getElementById('dossier-topic-admin-list');
  if(!wrap) return;
  wrap.innerHTML = DOSSIER_TOPICS.map(t=>dossierTopicAdminCardHtml(t)).join('');
}

function dossierTopicAdminCardHtml(t){
  const posts = DOSSIER_TOPIC_POSTS.filter(dp=>dp.topic_id===t.id);
  const postsHtml = posts.length ? posts.map(dp=>{
    const p = POSTS_CACHE.find(x=>x.id===dp.post_id);
    const label = p ? (p.title || (p.text||'').slice(0,60) || ('پست #'+p.id)) : ('پست #'+dp.post_id+' (حذف‌شده)');
    return `
    <div class="dossier-topic-post-row${dp.excluded?' excluded':''}">
      <span class="txt">${escAttr(label)}</span>
      <span style="display:flex;gap:8px;flex-shrink:0;">
        <button class="btn btn-sm" onclick="toggleDossierTopicPostExcluded(${dp.id})">${dp.excluded?'نمایش':'پنهان'}</button>
        <button class="del-btn" style="min-width:24px;min-height:24px;font-size:11px;" title="حذف کامل" onclick="deleteDossierTopicPost(${dp.id})">✕</button>
      </span>
    </div>`;
  }).join('') : '<p class="dossier-topic-empty">هنوز خبری برای این موضوع ثبت نشده.</p>';

  return `
  <div class="dossier-topic-card${t.active?'':' inactive'}">
    <div class="dossier-topic-card-head">
      <span class="name"><b>${escAttr(t.name)}</b><div class="kw" id="dossier-topic-kw-${t.id}">${escAttr(t.keywords)}</div></span>
      <span class="dossier-topic-card-actions">
        <button class="btn btn-sm" onclick="editDossierTopicKeywords(${t.id})">ویرایش کلیدواژه</button>
        <button class="btn btn-sm" title="پست‌های موجود دوباره با کلیدواژه‌های این موضوع تطبیق داده شوند" onclick="autoMatchDossierTopic(${t.id})">جست‌وجوی خودکار</button>
        <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;">
          <input type="checkbox" ${t.active?'checked':''} onchange="toggleDossierTopicActive(${t.id}, this.checked)" />
          فعال
        </label>
        <button class="del-btn" title="حذف موضوع" onclick="deleteDossierTopic(${t.id})">✕</button>
      </span>
    </div>
    <div class="dossier-topic-posts">${postsHtml}</div>
    <div class="dossier-manual-add">
      <input type="text" placeholder="جست‌وجوی دستی پست برای افزودن به این موضوع…" oninput="searchDossierManualAdd(${t.id}, this.value)" />
      <div class="dossier-manual-results" id="dossier-manual-results-${t.id}"></div>
    </div>
  </div>`;
}

async function toggleDossierTopicActive(id, active){
  await api('/dossier_topics?id=eq.'+id, {method:'PATCH', headers:{Prefer:'return=minimal'}, body: JSON.stringify({active})});
  await loadDossierTopics();
  renderDossierTopicAdminList();
}

async function deleteDossierTopic(id){
  const t = DOSSIER_TOPICS.find(x=>x.id===id);
  if(!await uiConfirm('موضوع «' + (t?t.name:'') + '» حذف شود؟ (پست‌های منتسب به این موضوع هم حذف می‌شوند)')) return;
  await api('/dossier_topics?id=eq.'+id, {method:'DELETE'});
  await loadDossierTopics();
  await loadDossierTopicPosts();
  renderDossierTopicAdminList();
}

async function toggleDossierTopicPostExcluded(id){
  const dp = DOSSIER_TOPIC_POSTS.find(x=>x.id===id);
  if(!dp) return;
  await api('/dossier_topic_posts?id=eq.'+id, {method:'PATCH', headers:{Prefer:'return=minimal'}, body: JSON.stringify({excluded: !dp.excluded})});
  await loadDossierTopicPosts();
  renderDossierTopicAdminList();
}

async function deleteDossierTopicPost(id){
  await api('/dossier_topic_posts?id=eq.'+id, {method:'DELETE'});
  await loadDossierTopicPosts();
  renderDossierTopicAdminList();
}

function searchDossierManualAdd(topicId, query){
  const resultsEl = document.getElementById('dossier-manual-results-'+topicId);
  if(!resultsEl) return;
  query = (query||'').trim();
  if(query.length < 2){ resultsEl.innerHTML=''; return; }
  const already = new Set(DOSSIER_TOPIC_POSTS.filter(dp=>dp.topic_id===topicId).map(dp=>dp.post_id));
  const matches = POSTS_CACHE.filter(p=> !already.has(p.id) && ((p.title||'').includes(query) || (p.text||'').includes(query))).slice(0,8);
  resultsEl.innerHTML = matches.length ? matches.map(p=>{
    const label = p.title || (p.text||'').slice(0,60) || ('پست #'+p.id);
    return `<div class="dossier-manual-result-row"><span class="txt">${escAttr(label)}</span><button class="btn btn-sm" onclick="addDossierManualPost(${topicId}, ${p.id})">افزودن</button></div>`;
  }).join('') : '<p class="dossier-topic-empty">موردی پیدا نشد.</p>';
}

async function addDossierManualPost(topicId, postId){
  const r = await api('/dossier_topic_posts', {method:'POST', headers:{Prefer:'return=minimal'}, body: JSON.stringify({topic_id: topicId, post_id: postId, source:'manual', excluded:false})});
  if(!r.ok){ showToast('این پست از قبل در این موضوع ثبت شده یا ذخیره انجام نشد.'); return; }
  await loadDossierTopicPosts();
  renderDossierTopicAdminList();
}

// ---- magazines library (بخش تحلیلی) ----
const MAG_TYPE_LABEL = { pdf:'PDF', images:'چند عکس' };

function renderMagazines(){
  renderUploadLists();
  const grid = document.getElementById('magazine-grid');
  const empty = document.getElementById('magazines-empty');
  const isAdmin = currentRole === 'app_admin';
  grid.innerHTML = '';
  empty.style.display = MAGAZINES.length ? 'none' : 'block';
  MAGAZINES.forEach((m, i)=>{
    const files = Array.isArray(m.files) ? m.files : [];
    const meta = [
      m.issue_no ? ('شماره ' + toFaDigits(m.issue_no)) : '',
      m.publish_date ? new Date(m.publish_date).toLocaleDateString('fa-IR') : '',
      m.file_type === 'images' ? (toFaDigits(files.length) + ' صفحه') : 'PDF',
    ].filter(Boolean).map(escHtml).join('، ');
    // هم‌شکل کارت‌های «بسته‌های تحلیلی» یادداشت‌ها: جلد بلند + عنوان + یه دکمه‌ی «مطالعه» (قبلاً
    // آیکون کوچیک به‌جای جلد و برای هر صفحه‌ی شماره‌ی عکسی یه دکمه‌ی «مشاهده N» جدا)
    const el = document.createElement('div'); el.className = 'magazine-card archive-report-card mag-issue-card';
    el.innerHTML = `<div class="archive-report-poster">${m.cover_url ? `<img src="${escAttr(m.cover_url)}" alt="${escAttr(m.title)}" draggable="false" oncontextmenu="return false" />` : (m.file_type==='images' ? ICONS.photo : ICONS.doc)}</div>
      <div class="mag-title">${escHtml(faTitle(m.title))}</div>
      <div class="mag-meta">${meta}</div>
      <div class="mag-actions"></div>`;
    const actions = el.querySelector('.mag-actions');
    if(files.length){
      el.querySelector('.archive-report-poster').style.cursor = 'pointer';
      el.querySelector('.archive-report-poster').addEventListener('click', () => openMagazineViewer(m));
      const btn = document.createElement('button');
      btn.className = 'btn primary mag-read-btn'; btn.textContent = 'مطالعه';
      btn.addEventListener('click', () => openMagazineViewer(m));
      actions.appendChild(btn);
    }
    if(isAdmin) actions.appendChild(cardAdminControls(i, MAGAZINES.length, d => moveMagazine(m, d), () => deleteMagazine(m), 'مجله‌ی ' + m.title));
    grid.appendChild(el);
  });
  renderMagazineCarousel();
}

// «بسته تحلیلی جریان» صفحه‌ی نخست — جلد ۵ شماره‌ی اول (به ترتیب مدیر) روی قوس
// جلدهای بسته: ردیف بالا ۴ جلد (مدار کوچک‌تر) و ردیف پایین ۵ جلد (مدار بزرگ)
// هر ردیف مدار خودش را دارد؛ ردیف دوم با همان هندسه‌ی ردیف اول و ضریب ۰٫۷۵
// مدار هر ردیف عیناً مثل مدار عرصه‌های صفحه‌ی نخست: ردیف بزرگ (۵ جلد) = مدار اول،
// ردیف کوچک (۴ جلد) = مدار دوم با ضریب ۰٫۷۵. مرکز جلدها روی همان خط مرکز آیکون‌هاست.
function pkgOrbitSvg(ri, n){
  const big = ri === 1, id = 'pkg-orbit-' + ri;
  const d1 = big ? 'M -562 24 Q 0 184, 562 24' : 'M -421.5 36.5 Q 0 156.5, 421.5 36.5';
  const d2 = big ? 'M -512 2 Q 0 122, 512 2' : 'M -384 20 Q 0 110, 384 20';
  const ex = big ? 562 : 421.5, ey = big ? 24 : 36.5;
  const kt = big ? '0;.65;1' : '0;.51;1', v = big ? '-1159;130;130' : '-874;130;130';
  const holes = Array.from({length: n}, (_, i) => `<rect x="${(i - (n - 1) / 2) * 186 - 61}" y="-6" width="122" height="159" rx="8" fill="#000"/>`).join('');
  const streak = (w, o, d) => `<use href="#${id}-path" stroke-width="${w}" stroke-opacity="${o}" stroke-dasharray="${d} 2278"><animate attributeName="stroke-dashoffset" values="${v}" keyTimes="${kt}" dur="9s" repeatCount="indefinite"/></use>`;
  return `<svg class="pkg-orbit" viewBox="-600 -100 1200 360" aria-hidden="true"><defs>
      <mask id="${id}-mask" maskUnits="userSpaceOnUse" x="-600" y="-100" width="1200" height="360"><rect x="-600" y="-100" width="1200" height="360" fill="#fff"/>${holes}</mask>
      <path id="${id}-path" d="${d1}"/>
      <path id="${id}-path2" d="${d2}"/>
    </defs>
    <g mask="url(#${id}-mask)">
      <use href="#${id}-path" fill="none" stroke="#EAB393" stroke-opacity=".32" stroke-width="1.3"/>
      <use href="#${id}-path2" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="1"/>
      <g class="flow" fill="none" stroke="#EAB393" stroke-linecap="round">${streak(3, 1, 18)}${streak(2, 0.45, 55)}${streak(1.4, 0.18, 110)}</g>
    </g>
    <circle cx="${-ex}" cy="${ey}" r="5.7" fill="#EAB393" fill-opacity=".09"/><circle cx="${-ex}" cy="${ey}" r="2.2" fill="#EAB393" fill-opacity=".5"/>
    <circle cx="${ex}" cy="${ey}" r="5.7" fill="#EAB393" fill-opacity=".09"/><circle cx="${ex}" cy="${ey}" r="2.2" fill="#EAB393" fill-opacity=".5"/>
  </svg>`;
}
function pkgTile(m){
  const files = Array.isArray(m.files) ? m.files : [];
  const tile = document.createElement('div'); tile.className = 'pkg-tile';
  tile.setAttribute('role', 'button'); tile.tabIndex = 0;
  tile.innerHTML = `<div class="pkg-cover">${m.cover_url ? `<img src="${escAttr(m.cover_url)}" alt="${escAttr(m.title)}" draggable="false" oncontextmenu="return false" />` : (m.file_type==='images' ? ICONS.photo : ICONS.doc)}</div>
    <div class="pkg-title">${escHtml(m.issue_no ? 'شماره ' + toFaDigits(String(m.issue_no)) : faTitle(m.title))}</div>`;
  tile.addEventListener('click', () => { if(files.length) openMagazineViewer(m); });
  return tile;
}
function renderMagazineCarousel(){
  const wrap = document.getElementById('pkg-covers');
  if(!wrap) return;
  wrap.innerHTML = '';
  if(!MAGAZINES.length){
    wrap.innerHTML = '<div class="pkg-empty">هنوز شماره‌ای بارگذاری نشده.</div>';
    return;
  }
  const items = MAGAZINES.slice(0, 9);
  const rows = items.length > 4 ? [items.slice(0, 4), items.slice(4)] : [items];
  rows.forEach((list, ri)=>{
    const row = document.createElement('div'); row.className = 'pkg-row';
    row.innerHTML = pkgOrbitSvg(rows.length === 2 ? ri : 0, list.length);
    const covers = document.createElement('div'); covers.className = 'pkg-covers';
    list.forEach(m => covers.appendChild(pkgTile(m)));
    row.appendChild(covers);
    wrap.appendChild(row);
  });
}

// دکمه‌ی «بالای صفحه» (۵.۲۰.۰) — به‌روزرسانی فقط یک‌بار در هر فریم
const TO_TOP_EL = document.getElementById('to-top');
let TO_TOP_RAF = 0;
function updateToTop(){
  TO_TOP_RAF = 0;
  const show = window.scrollY > window.innerHeight * 1.5;
  TO_TOP_EL.classList.toggle('show', show);
  if(!show) return;
  const ann = document.getElementById('ann-bar');
  const lift = (window.innerWidth <= 640 && ann && ann.childElementCount) ? ann.offsetHeight + 26 : 0;
  TO_TOP_EL.style.bottom = lift ? lift + 'px' : '';
}
window.addEventListener('scroll', ()=>{ if(!TO_TOP_RAF) TO_TOP_RAF = requestAnimationFrame(updateToTop); }, { passive:true });
window.addEventListener('resize', ()=>{ if(!TO_TOP_RAF) TO_TOP_RAF = requestAnimationFrame(updateToTop); }, { passive:true });
// Enter/فاصله روی کارت‌ها و میان‌برهای صفحه‌ی نخست (div/a با role=button) = کلیک
document.addEventListener('keydown', e=>{
  if(e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target;
  if(el && el.matches && el.matches('.domain-card[role="button"], .pkg-tile[role="button"]')){ e.preventDefault(); el.click(); }
});
function scrollToPageTop(){
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top:0, behavior: reduce ? 'auto' : 'smooth' });
}

// سه کارت راهنمای سریع زیر هرو — فقط اسکرول توی همون صفحه‌ی نخست،
// نه switchSection (چون هر سه مقصد از قبل توی همین sec-dashboard هستن)
function scrollToDomainGrid(){
  const el = document.querySelector('.section-label');
  if(el) el.scrollIntoView({ behavior:'smooth', block:'start' });
}
function scrollToPackageCard(){
  const el = document.getElementById('pkg-flow');
  if(el) el.scrollIntoView({ behavior:'smooth', block:'start' });
}
// تب «روزنامه‌ها» — گرید صفحه‌ی اول روزنامه‌ها برای یه تاریخ انتخاب‌شده.
// پیش‌فرض جدیدترین تاریخ موجوده (معمولاً امروز)، ولی چون cleanup_media.py
// فقط عکس‌های قدیمی‌تر از ۳ روز رو پاک می‌کنه، تا وقتی پاک نشدن، تاریخ‌های
// قبلی هم توی newspaper-date-tabs قابل‌انتخاب می‌مونن.
function renderNewspapers(){
  const grid = document.getElementById('newspaper-grid');
  const empty = document.getElementById('newspapers-empty');
  if(!grid) return;
  const withImage = NEWSPAPERS.filter(n => n.image_url);
  NEWSPAPER_DATES = [...new Set(withImage.map(n => n.edition_date))].sort().reverse();
  empty.style.display = NEWSPAPER_DATES.length ? 'none' : 'block';
  if(!NEWSPAPER_DATES.length){
    grid.innerHTML = '';
    NEWSPAPER_TODAYS = [];
    renderNewspaperDateTabs();
    populateNewspaperSourceOptions();
    return;
  }
  if(!newspaperState.date || !NEWSPAPER_DATES.includes(newspaperState.date)) newspaperState.date = NEWSPAPER_DATES[0];
  renderNewspaperDateTabs();
  NEWSPAPER_TODAYS = withImage.filter(n => n.edition_date === newspaperState.date);
  populateNewspaperSourceOptions();
  renderNewspaperGrid();
}

// «امروز» اینجا صریح از تاریخ تقویمی تهران گرفته می‌شه (نه تایم‌زون محلی
// مرورگر بازدیدکننده) — بعد از گرفتن رشته‌ی YYYY-MM-DD تهران، بقیه‌ی
// محاسبات روی همون رشته با UTC انجام می‌شه (چون edition_date خودش فقط
// تاریخه، بدون ساعت؛ این‌جوری هیچ ابهام تایم‌زونی توی خودِ محاسبه نمی‌مونه)
function newspaperDateLabel(dateStr){
  const today = new Date().toLocaleDateString('en-CA', { timeZone:'Asia/Tehran' });
  const diffDays = Math.round((new Date(today+'T00:00:00Z') - new Date(dateStr+'T00:00:00Z')) / 86400000);
  if(diffDays === 0) return 'امروز';
  if(diffDays === 1) return 'دیروز';
  if(diffDays > 1) return toFaDigits(diffDays) + ' روز قبل';
  return new Date(dateStr).toLocaleDateString('fa-IR'); // حالت غیرمنتظره (تاریخ در آینده)
}

function renderNewspaperDateTabs(){
  const wrap = document.getElementById('newspaper-date-tabs');
  if(!wrap) return;
  // همیشه ۲ گزینه‌ی ثابت (امروز/دیروز) نشون داده می‌شه؛ چون RETENTION_DAYS
  // فعلاً ۱ روزه، «۲ روز قبل» همیشه خالیه و حذف شد. فقط اونی که واقعاً
  // توی NEWSPAPER_DATES داده داره کلیک‌پذیره، بقیه غیرفعالن
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone:'Asia/Tehran' });
  // تعداد روزها از مدت نگهداری رسانه (۱۲/۲۴ ساعت → ۲، ۲ روز → ۳، ۳ روز → ۴)
  const nSlots = Math.max(2, Math.ceil(mediaRetentionHours() / 24) + 1);
  const slots = Array.from({ length: nSlots }, (_, i) => i).map(offset => {
    const d = new Date(todayStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - offset);
    return d.toISOString().slice(0, 10);
  });
  wrap.style.display = '';
  wrap.innerHTML = slots.map(d => {
    const label = newspaperDateLabel(d);
    if(!NEWSPAPER_DATES.includes(d)) return `<button disabled>${label}</button>`;
    return `<button class="${d === newspaperState.date ? 'active' : ''}" data-date="${d}">${label}</button>`;
  }).join('');
}

// فقط خودِ گرید رو بازمی‌سازه (نه چک‌باکس‌های فیلتر) — تا با تغییر انتخاب
// کاربر توی dropdown، خودِ dropdown بسته/rebuild نشه
function renderNewspaperGrid(){
  const grid = document.getElementById('newspaper-grid');
  if(!grid) return;
  const list = newspaperState.selected.length
    ? NEWSPAPER_TODAYS.filter(n => newspaperState.selected.includes(n.slug))
    : NEWSPAPER_TODAYS;
  grid.innerHTML = list.map(n => `
    <div class="newspaper-card">
      <div class="newspaper-cover">
        <img src="${escAttr(n.image_url)}" alt="${escAttr(n.title)}" loading="lazy" draggable="false" oncontextmenu="return false"
             data-viewer-kind="image" data-viewer-src="${escAttr(n.image_url)}"${n.reader_url ? ` data-viewer-link="${escAttr(n.reader_url)}"` : ''} />
      </div>
      <div class="newspaper-title">${escAttr(n.title)}</div>
    </div>`).join('');
  wireMediaViewerClicks(grid);
}

function updateNewspaperSourceSummary(){
  const summary = document.getElementById('newspaper-source-summary');
  if(!summary) return;
  const n = newspaperState.selected.length;
  summary.textContent = n === 0 ? 'انتخاب روزنامه‌ها…' : toFaDigits(n) + ' روزنامه انتخاب‌شده';
}

function populateNewspaperSourceOptions(){
  const list = document.getElementById('newspaper-source-list');
  if(!list) return;
  const validSlugs = new Set(NEWSPAPER_TODAYS.map(n=>n.slug));
  newspaperState.selected = newspaperState.selected.filter(s=>validSlugs.has(s));
  list.innerHTML = NEWSPAPER_TODAYS.map(n=>{
    const checked = newspaperState.selected.includes(n.slug) ? 'checked' : '';
    return `<label><input type="checkbox" value="${escAttr(n.slug)}" ${checked}> ${escAttr(n.title)}</label>`;
  }).join('');
  list.querySelectorAll('input[type=checkbox]').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const slug = chk.value;
      if(chk.checked){ if(!newspaperState.selected.includes(slug)) newspaperState.selected.push(slug); }
      else{ newspaperState.selected = newspaperState.selected.filter(x=>x!==slug); }
      updateNewspaperSourceSummary();
      renderNewspaperGrid();
    });
  });
  updateNewspaperSourceSummary();
}

// فایل‌ها در bucket خصوصی Storage هستن — با یک signed URL کوتاه‌عمر در یک سربرگ جدید باز می‌شن
// (نه لینک مستقیم/دانلود دائمی — این جلوی دانلود عادی رو می‌گیره، ولی جلوی اسکرین‌شات یا کاربر فنی مصمم رو نه)
// ---- نمایشگر سند (۵.۱۹.۰) ----
// items: [{ kind:'image'|'pdf'|'file', url, name, label }] — پنجره همون لحظه‌ی کلیک باز می‌شه
// (قبل از گرفتن لینک امن)، پس مرورگر بلاکش نمی‌کنه؛ «باز کردن/دانلود» یه لینک واقعیه
var DV = { items: [], i: 0, zoom: false };
const DV_TTL = 600; // لینک امن ۱۰ دقیقه‌ای برای ورق زدن (قبلاً ۶۰ ثانیه برای باز کردن تک‌فایل)
async function signStoragePaths(bucket, paths){
  const res = await fetch(SUPABASE_URL + '/storage/v1/object/sign/' + bucket, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: DV_TTL, paths }),
  });
  if(!res.ok) throw new Error('sign failed');
  const out = await res.json();
  const map = new Map((Array.isArray(out) ? out : []).filter(x => x && x.signedURL && !x.error).map(x => [x.path, SUPABASE_URL + '/storage/v1' + x.signedURL]));
  return paths.map(p => map.get(p) || null);
}
function openDocViewer(title, loader, startIndex){
  DV = { items: [], i: startIndex || 0, zoom: false };
  document.getElementById('dv-title').textContent = faTitle(title);
  document.getElementById('dv-stage').innerHTML = '<div class="dv-msg">در حال آماده‌سازی…</div>';
  document.getElementById('dv-count').textContent = '';
  document.getElementById('dv-nav').hidden = true;
  document.getElementById('dv-zoom').hidden = true;
  document.getElementById('dv-open').hidden = true;
  document.getElementById('doc-viewer').classList.add('active');
  Promise.resolve().then(loader).then(items=>{
    DV.items = (items || []).filter(x => x && x.url);
    if(!DV.items.length) throw new Error('empty');
    DV.i = Math.min(Math.max(0, DV.i), DV.items.length - 1);
    dvRender();
  }).catch(()=>{
    document.getElementById('dv-stage').innerHTML = '<div class="dv-msg"><b>باز کردن فایل ممکن نشد</b>اتصال اینترنت را بررسی کنید و دوباره امتحان کنید.</div>';
  });
}
function closeDocViewer(){
  document.getElementById('doc-viewer').classList.remove('active');
  document.getElementById('dv-stage').innerHTML = '';
}
const DV_FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';
function dvRender(){
  const it = DV.items[DV.i];
  const stage = document.getElementById('dv-stage');
  const n = DV.items.length;
  stage.classList.toggle('zoomed', DV.zoom && it.kind === 'image');
  stage.scrollTop = 0; stage.scrollLeft = 0;
  const openEl = document.getElementById('dv-open');
  openEl.href = it.url; openEl.hidden = false;
  if(it.kind === 'image'){
    openEl.removeAttribute('download');
    stage.innerHTML = `<img src="${escAttr(it.url)}" alt="${escAttr(it.label || '')}" onclick="dvToggleZoom()">`;
  }else if(it.kind === 'pdf'){
    // نمایش PDF داخل صفحه فقط روی رایانه قابل‌اعتماده؛ گوشی‌ها (مخصوصاً اندروید) iframe‌ی PDF رو نشون نمی‌دن
    const inline = window.matchMedia('(min-width: 761px)').matches;
    stage.innerHTML = inline
      ? `<iframe src="${escAttr(it.url)}" title="${escAttr(it.label || 'PDF')}"></iframe>`
      : `<div class="dv-msg">${DV_FILE_ICON}<b>${escHtml(faTitle(it.label) || 'فایل PDF')}</b>برای خواندن، فایل را در نمایشگر PDF گوشی باز کنید.<br><a class="dv-action" href="${escAttr(it.url)}" target="_blank" rel="noopener">باز کردن PDF</a></div>`;
  }else{
    openEl.setAttribute('download', '');
    stage.innerHTML = `<div class="dv-msg">${DV_FILE_ICON}<b>${escHtml(faTitle(it.label) || 'فایل')}</b>پیش‌نمایش این نوع فایل در سایت ممکن نیست.<br><a class="dv-action" href="${escAttr(it.url)}" target="_blank" rel="noopener" download>دانلود فایل</a></div>`;
  }
  document.getElementById('dv-zoom').hidden = it.kind !== 'image';
  document.getElementById('dv-zoom').classList.toggle('on', DV.zoom && it.kind === 'image');
  const countTxt = n > 1 ? ('صفحه‌ی ' + toFaDigits(DV.i + 1) + ' از ' + toFaDigits(n)) : '';
  document.getElementById('dv-count').textContent = countTxt;
  const nav = document.getElementById('dv-nav');
  nav.hidden = n < 2;
  nav.dataset.count = countTxt;
  document.getElementById('dv-prev').disabled = DV.i === 0;
  document.getElementById('dv-next').disabled = DV.i === n - 1;
  const pages = document.getElementById('dv-pages');
  pages.innerHTML = n > 1 ? DV.items.map((_, k)=>`<button type="button" class="${k === DV.i ? 'on' : ''}" onclick="dvGo(${k - DV.i})" aria-label="صفحه‌ی ${toFaDigits(k + 1)}">${toFaDigits(k + 1)}</button>`).join('') : '';
  const cur = pages.querySelector('.on'); if(cur) cur.scrollIntoView({ block:'nearest', inline:'center' });
  // صفحه‌ی بعد پیش‌بارگذاری شه تا ورق زدن بی‌مکث باشه
  const nx = DV.items[DV.i + 1]; if(nx && nx.kind === 'image'){ const im = new Image(); im.src = nx.url; }
}
function dvGo(delta){
  const j = DV.i + delta;
  if(j < 0 || j >= DV.items.length) return;
  DV.i = j; DV.zoom = false; dvRender();
}
function dvToggleZoom(){
  const it = DV.items[DV.i]; if(!it || it.kind !== 'image') return;
  DV.zoom = !DV.zoom; dvRender();
}
document.addEventListener('keydown', e=>{
  if(!document.getElementById('doc-viewer').classList.contains('active')) return;
  // راست‌به‌چپ: صفحه‌ی بعد سمت چپه
  if(e.key === 'ArrowLeft'){ dvGo(1); e.preventDefault(); }
  else if(e.key === 'ArrowRight'){ dvGo(-1); e.preventDefault(); }
  else if(e.key === 'Escape'){ closeDocViewer(); }
});
(function(){
  const stage = document.getElementById('dv-stage');
  let x0 = null, y0 = null;
  stage.addEventListener('touchstart', e=>{ if(e.touches.length === 1 && !DV.zoom){ x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } else x0 = null; }, { passive:true });
  stage.addEventListener('touchend', e=>{
    if(x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if(Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) dvGo(dx > 0 ? 1 : -1); // کشیدن به راست = صفحه‌ی بعد (راست‌به‌چپ)
  }, { passive:true });
})();
function openMagazineViewer(m){
  const files = Array.isArray(m.files) ? m.files : [];
  openDocViewer(m.title, async ()=>{
    if(!files.length) return [];
    const urls = await signStoragePaths('magazines', files);
    const isPdf = m.file_type === 'pdf';
    return files.map((f, k)=>({ kind: isPdf ? 'pdf' : 'image', url: urls[k], label: m.title + (files.length > 1 ? ' — صفحه‌ی ' + toFaDigits(k + 1) : '') }));
  });
}

async function moveMagazine(m, direction){
  const idx = MAGAZINES.findIndex(x=>x.id===m.id);
  const swapIdx = idx + direction;
  if(swapIdx < 0 || swapIdx >= MAGAZINES.length) return;
  const other = MAGAZINES[swapIdx];
  const aOrder = m.sort_order || 0, bOrder = other.sort_order || 0;
  await Promise.all([
    api('/magazines?id=eq.'+m.id, {method:'PATCH', body: JSON.stringify({sort_order: bOrder})}),
    api('/magazines?id=eq.'+other.id, {method:'PATCH', body: JSON.stringify({sort_order: aOrder})}),
  ]);
  await loadMagazines(); renderMagazines();
}

async function deleteMagazine(m){
  if(!await uiConfirm('مجله‌ی «' + m.title + '» حذف شود؟ فایل‌های آن هم برای همیشه پاک می‌شوند.')) return;
  try{
    const files = Array.isArray(m.files) ? m.files : [];
    if(files.length){
      await fetch(SUPABASE_URL + '/storage/v1/object/remove/magazines', {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: files }),
      });
    }
    if(m.cover_url && m.cover_url.includes('/magazine-covers/')){
      const coverPath = m.cover_url.split('/magazine-covers/')[1];
      await fetch(SUPABASE_URL + '/storage/v1/object/remove/magazine-covers', {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [coverPath] }),
      });
    }
    await api('/magazines?id=eq.'+m.id, {method:'DELETE'});
    await loadMagazines(); renderMagazines();
    showToast('مجله حذف شد');
  }catch(e){
    showToast('حذف ناموفق بود');
  }
}

async function uploadMagazineFile(file){
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = Date.now() + '-' + Math.random().toString(36).slice(2,8) + '-' + safeName;
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/magazines/' + path, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if(!r.ok) throw await uploadHttpError(r, file);
  return path;
}

// جلدها توی یه bucket عمومی جداگانه‌ن (magazine-covers) تا بدون signed URL مستقیم نمایش داده بشن —
// خودِ فایل کامل مجله همچنان توی bucket خصوصی می‌مونه
async function uploadCoverFile(file){
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = Date.now() + '-' + Math.random().toString(36).slice(2,8) + '-' + safeName;
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/magazine-covers/' + path, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if(!r.ok) throw await uploadHttpError(r, file);
  return SUPABASE_URL + '/storage/v1/object/public/magazine-covers/' + path;
}

// عکس پیش‌فرض هر کانال، برای پست‌هایی که خودشون عکس ندارن — دقیقاً
// همون الگوی bucket عمومی jpg جلد مجلات (uploadCoverFile بالا)
async function uploadChannelAvatarFile(file){
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = Date.now() + '-' + Math.random().toString(36).slice(2,8) + '-' + safeName;
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/channel-avatars/' + path, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if(!r.ok) throw new Error('avatar upload failed');
  return SUPABASE_URL + '/storage/v1/object/public/channel-avatars/' + path;
}

document.getElementById('mag-upload-btn').addEventListener('click', async () => {
  const btn = document.getElementById('mag-upload-btn');
  const titleEl = document.getElementById('mag-title');
  const issueEl = document.getElementById('mag-issue');
  const dateEl = document.getElementById('mag-date');
  const typeEl = document.getElementById('mag-file-type');
  const filesEl = document.getElementById('mag-files');
  const coverEl = document.getElementById('mag-cover');
  const title = titleEl.value.trim();
  const files = Array.from(filesEl.files || []);
  if(!title || !files.length){ showToast('عنوان و حداقل یک فایل لازم است'); return; }
  const tooBig = uploadTooBig(files.concat(coverEl.files[0] || []));
  if(tooBig){ showToast(tooBig); return; }
  btn.disabled = true; btn.textContent = 'در حال بارگذاری…';
  let paths = [], coverUrl = null, saved = false;
  try{
    paths = await uploadFilesWithProgress(sortFilesByName(files), uploadMagazineFile, 'magazines', btn);
    const coverFile = coverEl.files[0];
    if(coverFile){ btn.textContent = 'در حال بارگذاری جلد…'; coverUrl = await uploadCoverFile(coverFile); }
    const nextOrder = MAGAZINES.length ? Math.max(...MAGAZINES.map(m=>m.sort_order||0)) + 1 : 0;
    const body = { title, issue_no: issueEl.value.trim() || null, publish_date: dateEl.value || null, file_type: typeEl.value, files: paths, cover_url: coverUrl, sort_order: nextOrder };
    const r = await api('/magazines', {method:'POST', headers:{Prefer:'return=minimal'}, body: JSON.stringify(body)});
    if(!r.ok) throw new Error('insert failed');
    saved = true;
    titleEl.value=''; issueEl.value=''; dateEl.value=''; filesEl.value=''; coverEl.value='';
    await loadMagazines(); renderMagazines();
    showToast('مجله بارگذاری شد');
  }catch(e){
    console.error(e);
    // فایل‌هایی که رفتن ولی ردیفشون ثبت نشد، پاک بشن
    if(!saved){
      await removeStoragePaths('magazines', paths);
      await removeStoragePaths('magazine-covers', [publicPathOf(coverUrl, 'magazine-covers')]);
    }
    showToast(saved ? 'ذخیره شد، ولی فهرست به‌روز نشد؛ صفحه را تازه کنید.' : uploadErrorMsg(e));
  }finally{
    btn.disabled = false; btn.textContent = 'بارگذاری مجله';
  }
});

// ---- زیرتب‌های «ضمیمه جریان» (بخش مستقل، نه زیرمجموعه‌ی بخش تحلیلی) ----
// «سایر بسته‌های تحلیلی»: برخلاف مجلات جریان، این‌ها تولیدات نهادهای دیگه‌ست
// که فقط بایگانی می‌کنیم — همون الگوی داده/Storage مجلات (bucket خصوصی برای
// فایل + bucket عمومی برای جلد)، فقط با یه ستون اضافه‌ی source_org.
function renderArchiveReports(){
  renderUploadLists();
  const grid = document.getElementById('archive-report-grid');
  const empty = document.getElementById('archive-reports-empty');
  if(!grid) return;
  const isAdmin = currentRole === 'app_admin';
  grid.innerHTML = '';
  empty.style.display = ARCHIVE_REPORTS.length ? 'none' : 'block';
  ARCHIVE_REPORTS.forEach((m, i)=>{
    const files = Array.isArray(m.files) ? m.files : [];
    // ۵.۲۲.۰: هم‌شکل کارت‌های «بسته تحلیلی جریان» — جلد + عنوان + متا با ارقام فارسی + «مطالعه»
    // (قبلاً فقط کلیک روی جلد، و فقط فایل اول در زبانه‌ی جدید باز می‌شد)
    const meta = [
      m.source_org || '',
      m.publish_date ? new Date(m.publish_date).toLocaleDateString('fa-IR') : '',
      m.file_type === 'images' ? (toFaDigits(files.length) + ' صفحه') : (files.length > 1 ? toFaDigits(files.length) + ' فایل PDF' : 'PDF'),
    ].filter(Boolean).map(escHtml).join('، ');
    const el = document.createElement('div'); el.className = 'magazine-card archive-report-card mag-issue-card';
    el.innerHTML = `<div class="archive-report-poster">${m.cover_url ? `<img src="${escAttr(m.cover_url)}" alt="${escAttr(m.title)}" draggable="false" oncontextmenu="return false" />` : (m.file_type==='images' ? ICONS.photo : ICONS.doc)}</div>
      <div class="mag-title">${escHtml(faTitle(m.title))}</div>
      <div class="mag-meta">${meta}</div>
      <div class="mag-actions"></div>`;
    const poster = el.querySelector('.archive-report-poster');
    const actions = el.querySelector('.mag-actions');
    if(files.length){
      poster.style.cursor = 'pointer';
      poster.addEventListener('click', () => openArchiveViewer(m));
      const btn = document.createElement('button');
      btn.className = 'btn primary mag-read-btn'; btn.textContent = 'مطالعه';
      btn.addEventListener('click', () => openArchiveViewer(m));
      actions.appendChild(btn);
    }
    if(isAdmin) actions.appendChild(cardAdminControls(i, ARCHIVE_REPORTS.length, d => moveArchiveReport(m, d), () => deleteArchiveReport(m), m.title));
    grid.appendChild(el);
  });
}

// نمایشگر سند (همون «بسته تحلیلی جریان»): همه‌ی فایل‌ها، ورق‌زدن، بدون window.open بعد از await
function openArchiveViewer(m){
  const files = Array.isArray(m.files) ? m.files : [];
  const title = faTitle(m.title || 'بسته‌ی تحلیلی');
  openDocViewer(title, async ()=>{
    if(!files.length) return [];
    const urls = await signStoragePaths('archive-reports', files);
    return files.map((f, k)=>{
      const isPdf = /\.pdf$/i.test(f) || (m.file_type === 'pdf' && !/\.(jpe?g|png|webp|gif)$/i.test(f));
      return { kind: isPdf ? 'pdf' : 'image', url: urls[k], label: title + (files.length > 1 ? ' — ' + (isPdf ? 'فایل ' : 'صفحه‌ی ') + toFaDigits(k + 1) : '') };
    });
  });
}

// کنترل‌های مدیر زیر جلدها (جابه‌جایی + حذف) — قبلاً پیکان‌های ۲۲×۱۸ و یه «✕» بی‌برچسب
function cardAdminControls(i, total, onMove, onDelete, label){
  const box = document.createElement('div'); box.className = 'card-admin';
  const mk = (cls, html, title, fn, disabled)=>{
    const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.innerHTML = html;
    b.title = title; b.setAttribute('aria-label', title); b.disabled = !!disabled;
    b.addEventListener('click', fn); box.appendChild(b); return b;
  };
  mk('card-move', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>', 'انتقال به قبل', () => onMove(-1), i === 0);
  mk('card-move', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>', 'انتقال به بعد', () => onMove(1), i === total - 1);
  mk('card-del', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg><span>حذف</span>', 'حذف ' + label, onDelete);
  return box;
}

async function moveArchiveReport(m, direction){
  const idx = ARCHIVE_REPORTS.findIndex(x=>x.id===m.id);
  const swapIdx = idx + direction;
  if(swapIdx < 0 || swapIdx >= ARCHIVE_REPORTS.length) return;
  const other = ARCHIVE_REPORTS[swapIdx];
  const aOrder = m.sort_order || 0, bOrder = other.sort_order || 0;
  await Promise.all([
    api('/archive_reports?id=eq.'+m.id, {method:'PATCH', body: JSON.stringify({sort_order: bOrder})}),
    api('/archive_reports?id=eq.'+other.id, {method:'PATCH', body: JSON.stringify({sort_order: aOrder})}),
  ]);
  await loadArchiveReports(); renderArchiveReports();
}

async function deleteArchiveReport(m){
  if(!await uiConfirm('«' + m.title + '» از آرشیو حذف شود؟ فایل‌های آن هم برای همیشه پاک می‌شوند.')) return;
  try{
    const files = Array.isArray(m.files) ? m.files : [];
    if(files.length){
      await fetch(SUPABASE_URL + '/storage/v1/object/remove/archive-reports', {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: files }),
      });
    }
    if(m.cover_url && m.cover_url.includes('/archive-report-covers/')){
      const coverPath = m.cover_url.split('/archive-report-covers/')[1];
      await fetch(SUPABASE_URL + '/storage/v1/object/remove/archive-report-covers', {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [coverPath] }),
      });
    }
    await api('/archive_reports?id=eq.'+m.id, {method:'DELETE'});
    await loadArchiveReports(); renderArchiveReports();
    showToast('از آرشیو حذف شد');
  }catch(e){
    showToast('حذف ناموفق بود');
  }
}

async function uploadArchiveReportFile(file){
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = Date.now() + '-' + Math.random().toString(36).slice(2,8) + '-' + safeName;
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/archive-reports/' + path, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if(!r.ok) throw await uploadHttpError(r, file);
  return path;
}

async function uploadArchiveCoverFile(file){
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = Date.now() + '-' + Math.random().toString(36).slice(2,8) + '-' + safeName;
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/archive-report-covers/' + path, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if(!r.ok) throw await uploadHttpError(r, file);
  return SUPABASE_URL + '/storage/v1/object/public/archive-report-covers/' + path;
}

document.getElementById('arc-upload-btn').addEventListener('click', async () => {
  const btn = document.getElementById('arc-upload-btn');
  const titleEl = document.getElementById('arc-title');
  const sourceOrgEl = document.getElementById('arc-source-org');
  const dateEl = document.getElementById('arc-date');
  const typeEl = document.getElementById('arc-file-type');
  const filesEl = document.getElementById('arc-files');
  const coverEl = document.getElementById('arc-cover');
  const title = titleEl.value.trim();
  const sourceOrg = sourceOrgEl.value.trim();
  const files = Array.from(filesEl.files || []);
  if(!title || !sourceOrg || !files.length){ showToast('عنوان، نهاد تولیدکننده و حداقل یک فایل لازم است'); return; }
  const tooBig = uploadTooBig(files.concat(coverEl.files[0] || []));
  if(tooBig){ showToast(tooBig); return; }
  btn.disabled = true; btn.textContent = 'در حال بارگذاری…';
  let paths = [], coverUrl = null, saved = false;
  try{
    paths = await uploadFilesWithProgress(sortFilesByName(files), uploadArchiveReportFile, 'archive-reports', btn);
    const coverFile = coverEl.files[0];
    if(coverFile){ btn.textContent = 'در حال بارگذاری جلد…'; coverUrl = await uploadArchiveCoverFile(coverFile); }
    const nextOrder = ARCHIVE_REPORTS.length ? Math.max(...ARCHIVE_REPORTS.map(m=>m.sort_order||0)) + 1 : 0;
    const body = { title, source_org: sourceOrg, publish_date: dateEl.value || null, file_type: typeEl.value, files: paths, cover_url: coverUrl, sort_order: nextOrder };
    const r = await api('/archive_reports', {method:'POST', headers:{Prefer:'return=minimal'}, body: JSON.stringify(body)});
    if(!r.ok) throw new Error('insert failed');
    saved = true;
    titleEl.value=''; sourceOrgEl.value=''; dateEl.value=''; filesEl.value=''; coverEl.value='';
    await loadArchiveReports(); renderArchiveReports();
    showToast('به آرشیو اضافه شد');
  }catch(e){
    console.error(e);
    if(!saved){
      await removeStoragePaths('archive-reports', paths);
      await removeStoragePaths('archive-report-covers', [publicPathOf(coverUrl, 'archive-report-covers')]);
    }
    showToast(saved ? 'ذخیره شد، ولی فهرست به‌روز نشد؛ صفحه را تازه کنید.' : uploadErrorMsg(e));
  }finally{
    btn.disabled = false; btn.textContent = 'بارگذاری';
  }
});

// کارت «ثبت نظر و پیشنهاد» ته صفحه‌ی نخست — هم مدیر هم بیننده اجازه‌ی
// insert روی جدول feedback دارن (تنها استثنای این پروژه برای بیننده)
async function submitFeedback(event){
  event.preventDefault();
  const nameEl = document.getElementById('feedback-name');
  const messageEl = document.getElementById('feedback-message');
  const btn = document.getElementById('feedback-submit-btn');
  const message = messageEl.value.trim();
  if(!message){ showToast('لطفاً متن نظر یا پیشنهاد را وارد کنید'); return; }
  btn.disabled = true; btn.textContent = 'در حال ارسال…';
  try{
    const body = { name: nameEl.value.trim() || null, message };
    const r = await api('/feedback', {method:'POST', headers:{Prefer:'return=minimal'}, body: JSON.stringify(body)});
    if(!r.ok) throw new Error('insert failed');
    nameEl.value = ''; messageEl.value = '';
    showToast('نظر شما با موفقیت ثبت شد، سپاسگزاریم');
  }catch(e){
    showToast('خطا در ثبت نظر — دوباره تلاش کنید');
  }finally{
    btn.disabled = false; btn.textContent = 'ارسال';
  }
}

// تب مدیریتی «نظرات کاربران» — فقط مدیر (RLS جدول feedback فقط سلکت
// مدیر رو اجازه می‌ده)؛ متن نظر همیشه با textContent (نه innerHTML)
// نشون داده می‌شه چون ورودی آزاد کاربره و نباید به‌عنوان HTML اجرا بشه
async function loadFeedbackList(){
  const r = await api('/feedback?order=created_at.desc');
  FEEDBACK_LIST = r.ok ? await r.json() : [];
}

function renderFeedbackList(){
  const wrap = document.getElementById('feedback-list');
  if(!wrap) return;
  wrap.innerHTML = '';
  if(!FEEDBACK_LIST.length){
    wrap.innerHTML = '<p style="color:var(--text-faint);font-size:13px;text-align:center;padding:20px 0;">هنوز نظری ثبت نشده.</p>';
    return;
  }
  FEEDBACK_LIST.forEach(f=>{
    const row = document.createElement('div'); row.className = 'feedback-row';
    const main = document.createElement('div'); main.className = 'feedback-row-main';
    const head = document.createElement('div'); head.className = 'feedback-row-head';
    const name = document.createElement('span'); name.className = 'feedback-row-name';
    name.textContent = f.name || 'ناشناس';
    const time = document.createElement('span'); time.className = 'feedback-row-time';
    time.textContent = newsRelTime(f.created_at);
    head.appendChild(name); head.appendChild(time);
    const msg = document.createElement('div'); msg.className = 'feedback-row-message';
    msg.textContent = f.message;
    main.appendChild(head); main.appendChild(msg);
    const del = document.createElement('button'); del.className = 'del-btn'; del.textContent = '✕';
    del.title = 'حذف'; del.setAttribute('aria-label', 'حذف این نظر');
    del.addEventListener('click', () => deleteFeedback(f));
    row.appendChild(main); row.appendChild(del);
    wrap.appendChild(row);
  });
}

async function deleteFeedback(f){
  if(!await uiConfirm('این نظر حذف شود؟')) return;
  try{
    const r = await api('/feedback?id=eq.'+f.id, {method:'DELETE'});
    if(!r.ok) throw new Error('delete failed');
    FEEDBACK_LIST = FEEDBACK_LIST.filter(x=>x.id!==f.id);
    renderFeedbackList();
  }catch(e){
    showToast('حذف نظر ناموفق بود');
  }
}

// ---- settings: password change ----
// تغییر رمز در پنجره‌ی اختصاصی (نه prompt مرورگر): رمز پنهان + تکرار برای
// جلوگیری از قفل‌شدن مدیر با یک غلط تایپی
let PW_ROLE = null;
const PW_MIN_LEN = 6;
function changePassword(role){
  PW_ROLE = role;
  const label = role==='admin' ? 'مدیر' : 'بیننده';
  document.getElementById('pw-modal-title').textContent = 'تغییر رمز ' + label;
  document.getElementById('pw-modal-warn').textContent = role==='admin'
    ? 'این رمز برای ورود خود شما به‌عنوان مدیر است؛ آن را جایی امن یادداشت کنید.'
    : 'همه‌ی کاربرانی که با نقش بیننده وارد می‌شوند باید از رمز جدید استفاده کنند.';
  ['pw-new','pw-new2'].forEach(id=>{ const el=document.getElementById(id); el.value=''; el.type='password'; });
  document.getElementById('pw-show').checked = false;
  document.getElementById('pw-modal-error').textContent = '';
  document.getElementById('pw-modal').classList.add('active');
  setTimeout(()=> document.getElementById('pw-new').focus(), 50);
}
function closePwModal(){
  document.getElementById('pw-modal').classList.remove('active');
  PW_ROLE = null;
}
document.getElementById('pw-show').addEventListener('change', e=>{
  ['pw-new','pw-new2'].forEach(id=> document.getElementById(id).type = e.target.checked ? 'text' : 'password');
});
document.getElementById('pw-save-btn').addEventListener('click', async ()=>{
  const pw = document.getElementById('pw-new').value;
  const pw2 = document.getElementById('pw-new2').value;
  const err = document.getElementById('pw-modal-error');
  if(pw.length < PW_MIN_LEN){ err.textContent = 'رمز باید دست‌کم ' + toFaDigits(PW_MIN_LEN) + ' نویسه باشد.'; return; }
  if(pw !== pw2){ err.textContent = 'رمز و تکرار آن یکسان نیستند.'; return; }
  const role = PW_ROLE, label = role==='admin' ? 'مدیر' : 'بیننده';
  const btn = document.getElementById('pw-save-btn');
  btn.disabled = true;
  try{
    const r = await api('/rpc/change_password', {method:'POST', body: JSON.stringify({target_role: role, new_password: pw})});
    if(r.ok){ closePwModal(); showToast('رمز ' + label + ' تغییر کرد'); }
    else err.textContent = 'تغییر رمز ناموفق بود؛ فقط مدیر می‌تواند رمز را تغییر دهد.';
  }finally{ btn.disabled = false; }
});
document.addEventListener('keydown', e=>{
  if(e.key === 'Escape' && document.getElementById('pw-modal').classList.contains('active')) closePwModal();
});

// ---- export ----
function populateExportFilters(){
  const chOpts = '<option value="">همه‌ی منابع</option>' + CHANNELS.map(c=>`<option value="${c.id}">${escHtml(c.title||c.username)}</option>`).join('');
  const catOpts = '<option value="">همه‌ی موضوع‌ها</option>' + CATEGORIES.map(c=>`<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
  document.getElementById('export-posts-channel').innerHTML = chOpts;
  document.getElementById('export-posts-cat').innerHTML = catOpts;
}

document.querySelectorAll('.fmt-row').forEach(row=>{
  row.addEventListener('click', e=>{
    const b = e.target.closest('.fmt'); if(!b) return;
    row.querySelectorAll('.fmt').forEach(x=>x.classList.remove('sel'));
    b.classList.add('sel');
  });
});

function selectedFormat(rowId){
  const sel = document.querySelector('#'+rowId+' .fmt.sel');
  return sel ? sel.dataset.f : 'csv';
}

// ---- پشتیبان تنظیمات («تنظیمات بخش‌ها» ← امنیت، فقط مدیر) ----
// خروجی = یک فایل SQL برای SQL Editor سوپابیس: برای هر جدول یه بلوک DO که اگه
// جدول وجود داشت، ردیف‌ها رو با jsonb_populate_recordset و on conflict do nothing
// درج می‌کنه (شناسه‌ها حفظ می‌شن تا ارتباط منبع↔موضوع/منطقه/گروه درست بمونه) و
// sequence رو جلو می‌بره. فقط ردیف‌های نبود اضافه می‌شن؛ اجرای چندباره بی‌خطره.
// ترتیب جدول‌ها = ترتیب وابستگی (کلید خارجی). جدول جدیدِ تنظیماتی → به این فهرست.
const BACKUP_TABLES = [
  ['categories', 'موضوع منابع'], ['regions', 'مناطق'], ['channels', 'منابع (با بخش‌ها، منطقه و مشخصات)'],
  ['profile_groups', 'گروه‌های چهره‌ها و سازمان‌ها'], ['channel_profile_groups', 'عضویت منابع در گروه‌ها'],
  ['news_topics', 'میان‌برهای جست‌وجوی وب‌سایت‌ها'], ['dossier_topics', 'پرونده‌های موضوعی'],
  ['app_users', 'فهرست کاربران'], ['notify_subscribers', 'مشترکین اطلاع از انتشار'],
  ['announcements', 'اطلاعیه‌ها'], ['feedback', 'نظرات کاربران'],
  ['crawl_sites', 'منابع خزنده‌ی «درباره حوزه»'],
  ['site_settings', 'نمایش سایت (حالت تعمیر، بخش‌های پنهان)'],
];
// ---- «ورود با پیامک» در تنظیمات (۵.۳۱.۰، migration_050) ----
const SMS_REPLY_HELP = [
  [/کلید کنسول معتبر نیست|invalid.*key/i, 'کلید کنسول معتبر نیست'],
  [/الگو|body/i, 'شماره‌ی الگو یا متن الگو درست نیست'],
  [/اعتبار|credit/i, 'اعتبار پنل پیامک کافی نیست'],
];
function smsReplyText(row){
  if(row.status_code == null) return row.reply ? 'خطا: ' + row.reply : 'در انتظار پاسخ';
  const ok = row.status_code >= 200 && row.status_code < 300 && !/false|error|خطا|نامعتبر|معتبر نیست/i.test(row.reply || '');
  if(ok) return 'ارسال شد';
  const hit = SMS_REPLY_HELP.find(([rx])=>rx.test(row.reply || ''));
  return 'ناموفق (' + toFaDigits(row.status_code) + ')' + (hit ? '، ' + hit[1] : '');
}
async function renderSmsPanel(){
  const missing = document.getElementById('sms-missing'), body = document.getElementById('sms-body');
  document.getElementById('sms-viewer-pw').checked = SITE_SETTINGS.viewer_password_login === true;
  let d = null;
  try{ const r = await api('/rpc/sms_status', { method:'POST', body:'{}' }); if(r.ok) d = await r.json(); }catch(e){}
  missing.style.display = d ? 'none' : '';
  body.style.display = d ? '' : 'none';
  if(!d){ document.getElementById('sms-sum').textContent = 'هنوز راه‌اندازی نشده'; return; }
  const ready = d.key_set && d.body_id;
  document.getElementById('sms-sum').textContent = ready ? 'فعال — الگوی ' + toFaDigits(d.body_id) : 'کلید یا شماره‌ی الگو ثبت نشده';
  document.getElementById('sms-status').innerHTML = ready
    ? '<span class="sms-dot ok"></span><span>کلید وب‌سرویس ثبت شده است؛ الگوی <b>' + escHtml(toFaDigits(d.body_id)) + '</b>.</span>'
    : '<span class="sms-dot bad"></span><span>' + (d.key_set ? 'شماره‌ی الگو ثبت نشده است.' : d.body_id ? 'کلید وب‌سرویس ثبت نشده است.' : 'کلید وب‌سرویس و شماره‌ی الگو ثبت نشده‌اند؛ تا ثبت نشوند، هیچ‌کس با پیامک وارد نمی‌شود.') + '</span>';
  document.getElementById('sms-body-id').value = d.body_id || '';
  renderSmsAdmins();
  const rec = Array.isArray(d.recent) ? d.recent : [];
  document.getElementById('sms-recent').innerHTML = rec.length
    ? '<b class="sms-recent-title">ده پیامک آخر ورود</b><table class="sms-recent-table"><tbody>' + rec.map(x=>`<tr><td>${escHtml(new Date(x.at).toLocaleString('fa-IR', { timeZone:'Asia/Tehran', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' }))}</td><td>${escHtml(x.name || '—')}</td><td class="${/^ارسال شد/.test(smsReplyText(x)) ? 'ok' : 'bad'}">${escHtml(smsReplyText(x))}</td></tr>`).join('') + '</tbody></table>'
    : '<p class="settings-help">هنوز پیامک ورودی فرستاده نشده است.</p>';
}
// ۵.۳۱.۱: مدیر هم با کد ملی وارد می‌شود (بعدش روش ورود را انتخاب می‌کند) — پس دست‌کم یک مدیر باید
// کد ملی ثبت‌شده داشته باشد، وگرنه بعد از این نشست هیچ مدیری نمی‌تواند وارد شود
async function renderSmsAdmins(){
  const el = document.getElementById('sms-admins');
  let rows = null;
  try{ const r = await api('/app_users?select=id&is_admin=eq.true&active=eq.true&national_id_last4=not.is.null&limit=1'); if(r.ok) rows = await r.json(); }catch(e){}
  el.className = 'sms-admins warn';
  el.innerHTML = rows && !rows.length
    ? '<span><b>هنوز هیچ مدیری کد ملی ثبت‌شده ندارد.</b> ورود مدیر هم با کد ملی است؛ پیش از خروج، در «کاربران» کد ملی خودتان را با نقش «مدیر» ثبت کنید.</span>' : '';
}
async function saveSmsConfig(){
  const key = document.getElementById('sms-key').value.trim();
  const bodyId = faDigitsToLatin(document.getElementById('sms-body-id').value);
  if(!key && !bodyId){ showToast('کلید یا شماره‌ی الگو را وارد کنید'); return; }
  const btn = document.getElementById('sms-save'); btn.disabled = true;
  try{
    const r = await api('/rpc/sms_config_set', { method:'POST', body: JSON.stringify({ p_api_key: key, p_body_id: bodyId }) });
    const d = r.ok ? await r.json() : {};
    if(!d.ok){ showToast(d.error === 'invalid_key' ? 'کلید وارد‌شده درست به نظر نمی‌رسد؛ کلید کنسول را دوباره از پنل ملی‌پیامک کپی کنید' : 'ذخیره ناموفق بود'); return; }
    document.getElementById('sms-key').value = '';
    showToast('ذخیره شد'); renderSmsPanel();
  }catch(e){ console.error(e); showToast('ذخیره ناموفق بود'); }
  finally{ btn.disabled = false; }
}
async function sendSmsTest(){
  const phone = normalizeIrMobile(document.getElementById('sms-test-phone').value);
  const out = document.getElementById('sms-test-result');
  if(!/^09\d{9}$/.test(phone)){ showToast('شماره‌ی موبایل باید ۱۱ رقم و با ۰۹ شروع شود'); return; }
  const btn = document.getElementById('sms-test-btn'); btn.disabled = true;
  out.hidden = false; out.className = 'sms-test-result'; out.textContent = 'در حال ارسال…';
  try{
    const r = await api('/rpc/sms_test', { method:'POST', body: JSON.stringify({ p_phone: phone }) });
    const d = r.ok ? await r.json() : {};
    if(!d.ok){ out.classList.add('bad'); out.textContent = d.error === 'sms_not_configured' ? 'اول کلید و شماره‌ی الگو را ذخیره کنید.' : 'ارسال انجام نشد.'; return; }
    // pg_net درخواست رو بعد از تراکنش می‌فرسته — چند ثانیه بعد نتیجه رو می‌خونیم
    for(let i = 0; i < 8; i++){
      await new Promise(res=>setTimeout(res, 1500));
      const rr = await api('/rpc/sms_test_result', { method:'POST', body: JSON.stringify({ p_req_id: d.req_id }) });
      const x = rr.ok ? await rr.json() : {};
      if(x.pending) continue;
      const txt = smsReplyText({ status_code: x.status_code, reply: x.reply });
      out.classList.add(/^ارسال شد/.test(txt) ? 'ok' : 'bad');
      out.textContent = /^ارسال شد/.test(txt) ? 'پیامک فرستاده شد؛ چند ثانیه‌ی دیگر روی گوشی بررسی کنید.' : txt + (x.reply ? ' — پاسخ ملی‌پیامک: ' + x.reply : '');
      return;
    }
    out.textContent = 'پاسخی از ملی‌پیامک نرسید؛ چند دقیقه‌ی دیگر نتیجه را در فهرست پایین ببینید.';
  }catch(e){ console.error(e); out.classList.add('bad'); out.textContent = 'ارسال انجام نشد.'; }
  finally{ btn.disabled = false; }
}
async function saveViewerPasswordLogin(on){
  if(on && !await uiConfirm('ورود با رمز مشترک بیننده دوباره باز شود؟\nهر کسی که رمز بیننده را بداند، بدون کد ملی وارد می‌شود. فقط وقتی ارسال پیامک از کار افتاده است روشن کنید.')){
    document.getElementById('sms-viewer-pw').checked = false; return;
  }
  try{ await saveSiteSetting('viewer_password_login', !!on); showToast(on ? 'ورود اضطراری با رمز مشترک روشن شد' : 'ورود با رمز مشترک بیننده بسته شد'); }
  catch(e){ console.error(e); showToast('ذخیره ناموفق بود'); document.getElementById('sms-viewer-pw').checked = !on; }
}

function renderBackupPanel(){
  const list = document.getElementById('backup-list');
  if(!list) return;
  list.innerHTML = BACKUP_TABLES.map(([, label])=>`<li>${escHtml(label)}</li>`).join('');
  const el = document.getElementById('backup-last');
  const last = lsGet('jarian_last_backup', null);
  const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
  el.className = 'bk-last' + (days === null || days > 30 ? ' warn' : '');
  const sum = document.getElementById('backup-sum');
  if(sum) sum.textContent = last
    ? 'آخرین پشتیبان: ' + (days === 0 ? 'امروز' : faNum(days) + ' روز پیش') + (days > 30 ? '، وقت پشتیبان تازه است' : '')
    : 'هنوز پشتیبانی گرفته نشده؛ پیشنهاد می‌شود یک فایل بگیرید';
  if(sum) sum.style.color = (days === null || days > 30) ? '#b7800f' : '';
  el.textContent = last
    ? 'آخرین پشتیبان روی این مرورگر: ' + new Date(last).toLocaleDateString('fa-IR', { timeZone:'Asia/Tehran', day:'numeric', month:'long', year:'numeric' }) + (days > 30 ? '، بیش از یک ماه پیش؛ پیشنهاد می‌شود دوباره بگیرید.' : '')
    : 'هنوز روی این مرورگر پشتیبانی گرفته نشده.';
}
async function backupFetchTable(t){
  const rows = [];
  for(let page = 0; page < 50; page++){
    const r = await api('/' + t + '?select=*&order=id.asc&limit=1000&offset=' + (page * 1000));
    if(r.status === 404 || (r.status === 400 && page === 0)) return null; // جدول هنوز ساخته نشده
    if(!r.ok) throw new Error(t + ' ' + r.status);
    const part = await r.json();
    rows.push(...part);
    if(part.length < 1000) break;
  }
  return rows;
}
function buildBackupSql(data, when){
  const all = JSON.stringify(data);
  let tag = 'jarian';
  while(all.includes('$' + tag + '$')) tag += 'x';
  const J = '$' + tag + '$';
  let dtag = 'do';
  while(all.includes('$' + dtag + '$') || dtag === tag) dtag += 'x';
  const D = '$' + dtag + '$';
  const dateFa = when.toLocaleString('fa-IR', { timeZone:'Asia/Tehran', day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const out = [
    '-- =====================================================================',
    '-- جریان — فایل پشتیبان تنظیمات',
    '-- ساخته‌شده: ' + dateFa,
    '-- استفاده: کل این متن را در Supabase ← SQL Editor ← New query بچسبانید و Run بزنید.',
    '-- فقط ردیف‌هایی که در دیتابیس نیستند اضافه می‌شوند؛ چیزی عوض یا پاک نمی‌شود',
    '-- و اجرای چندباره بی‌خطر است. روی پروژه‌ی تازه، اول schema.sql و migrationها.',
    '-- شامل نیست: پست‌ها، روزنامه‌ها، فایل‌های بسته‌ها/گزارش‌ها، رمزها.',
    '-- =====================================================================',
    '',
    'begin;',
    '',
  ];
  for(const [t, label] of BACKUP_TABLES){
    const rows = data[t];
    if(!rows){ out.push('-- ' + t + ' (' + label + '): در زمان پشتیبان‌گیری وجود نداشت', ''); continue; }
    out.push('-- ' + t + ' (' + label + '): ' + rows.length + ' ردیف');
    if(!rows.length){ out.push(''); continue; }
    const cols = Object.keys(rows[0]).map(c=>'"' + c.replace(/"/g, '""') + '"').join(', ');
    out.push(
      'do ' + D + ' begin',
      "  if to_regclass('public." + t + "') is not null then",
      '    insert into public.' + t + ' (' + cols + ')',
      '      select ' + cols + ' from jsonb_populate_recordset(null::public.' + t + ', ' + J + JSON.stringify(rows) + J + '::jsonb)',
      '      on conflict do nothing;',
      "    perform setval(pg_get_serial_sequence('public." + t + "', 'id'), greatest(coalesce((select max(id) from public." + t + "), 0), 1));",
      '  else',
      "    raise notice 'جدول " + t + " وجود ندارد و رد شد';",
      '  end if;',
      'end ' + D + ';',
      '');
  }
  out.push('commit;', '');
  return out.join('\n');
}
async function downloadBackup(){
  const btn = document.getElementById('backup-btn');
  btn.disabled = true; btn.textContent = 'در حال آماده‌سازی…';
  try{
    const results = await Promise.all(BACKUP_TABLES.map(([t])=>backupFetchTable(t)));
    const data = {};
    BACKUP_TABLES.forEach(([t], i)=>{ data[t] = results[i]; });
    if(!data.channels || !data.channels.length) throw new Error('no channels');
    const when = new Date();
    const p = calParts(when, 'persian');
    const name = 'jarian-backup-' + p.year + '-' + String(p.month).padStart(2, '0') + '-' + String(p.day).padStart(2, '0') + '.sql';
    downloadBlob(name, buildBackupSql(data, when), 'application/sql;charset=utf-8');
    lsSet('jarian_last_backup', when.toISOString());
    renderBackupPanel();
    const n = Object.values(data).reduce((a, r)=>a + (r ? r.length : 0), 0);
    showToast('فایل پشتیبان دانلود شد (' + faNum(n) + ' ردیف)');
  }catch(e){
    console.error(e);
    showToast('ساخت فایل پشتیبان انجام نشد؛ دوباره امتحان کنید');
  }finally{
    btn.disabled = false; btn.textContent = 'دانلود فایل پشتیبان';
  }
}

function downloadBlob(filename, content, mime){
  const blob = new Blob([content], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function toCSV(rows, columns){
  const esc = v => '"' + String(v==null?'':v).replace(/"/g,'""') + '"';
  const head = columns.map(c=>esc(c)).join(',');
  const body = rows.map(r => columns.map(c=>esc(r[c])).join(',')).join('\n');
  return head + '\n' + body;
}

// ---- «خروجی محتوا» (۵.۲۰.۰) ----
// داده‌ها برای کل بازه از سرور گرفته می‌شن (صفحه‌ای، ۱۰۰۰تایی) — قبلاً فقط از ۱۰۰۰ مطلب آخرِ
// POSTS_CACHE ساخته می‌شد و بازه‌ی طولانی بی‌صدا ناقص می‌اومد. بازه بر اساس scraped_at
// (پست‌های ایتا posted_at ندارن) و نیمه‌شب تهران؛ بدون تاریخ = ۳۰ روز اخیر.
const EXPORT_RANGE = { posts:{ from:'', to:'' }, report:{ from:'', to:'' } };
['posts','report'].forEach(k=>{
  const panel = document.getElementById('export-' + k + '-panel');
  setupJalaliRange(panel, (which, iso)=>{ EXPORT_RANGE[k][which] = iso; });
});
document.getElementById('sec-export').addEventListener('click', e=>{
  const b = e.target.closest('.exp-clear'); if(!b) return;
  const k = b.dataset.clear;
  EXPORT_RANGE[k] = { from:'', to:'' };
  document.querySelectorAll('#export-' + k + '-panel .jdate select').forEach(sel=>{ sel.value = ''; });
});
function exportBounds(k){
  const r = EXPORT_RANGE[k];
  const tehranIso = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone:'Asia/Tehran' });
  const to = r.to || tehranIso(Date.now());
  const from = r.from || tehranIso(Date.now() - 29*86400000);
  if(from > to) return null;
  const start = new Date(from + 'T00:00:00+03:30');
  const end = new Date(new Date(to + 'T00:00:00+03:30').getTime() + 86400000);
  const jl = iso => { const p = calParts(new Date(iso + 'T12:00:00+03:30'), 'persian'); return p.year + '-' + String(p.month).padStart(2,'0') + '-' + String(p.day).padStart(2,'0'); };
  return { start: start.toISOString(), end: end.toISOString(), tag: jl(from) + '_' + jl(to) };
}
// همه‌ی مطالب بازه، صفحه‌ای؛ onProgress(دریافت‌شده، کل). پست‌های پنهان‌شده حذف می‌شن.
async function fetchPostsInRange(b, filter, cols, onProgress){
  const base = '/posts?scraped_at=gte.' + encodeURIComponent(b.start) + '&scraped_at=lt.' + encodeURIComponent(b.end) + (filter || '');
  const total = await fetchExactCount(base);
  if(total > 30000 && !await uiConfirm(faNum(total) + ' مطلب در این بازه هست و دریافتش ممکن است چند دقیقه طول بکشد. ادامه می‌دهید؟')) return null;
  const out = [];
  for(let off = 0; off < Math.max(total, 1); off += 1000){
    onProgress(out.length, total);
    const r = await api(base + '&select=' + cols + '&order=scraped_at.asc,id.asc&limit=1000&offset=' + off);
    if(!r.ok) throw new Error('posts ' + r.status);
    const rows = await r.json();
    out.push(...rows);
    if(rows.length < 1000) break;
  }
  return out.filter(p=>!HIDDEN_POST_IDS.has(Number(p.id)));
}
function downloadCsv(filename, rows, columns){
  // BOM اول فایل: بدونش اکسل متن فارسی رو به‌هم‌ریخته نشون می‌ده
  downloadBlob(filename, '\ufeff' + toCSV(rows, columns), 'text/csv;charset=utf-8');
}
const EXPORT_PLAT = { eitaa:'ایتا', telegram:'تلگرام', website:'وب‌سایت', bale:'بله' };
async function runExport(btn, label, job){
  btn.disabled = true;
  try{ await job(t=>{ btn.textContent = t; }); }
  catch(e){ console.error(e); showToast('دریافت اطلاعات انجام نشد؛ اتصال را بررسی کنید و دوباره امتحان کنید'); }
  finally{ btn.disabled = false; btn.textContent = label; }
}
function exportPosts(){
  const b = exportBounds('posts');
  if(!b){ showToast('تاریخ «از» بعد از تاریخ «تا» است'); return; }
  const fmt = selectedFormat('export-posts-fmt');
  const chFilter = document.getElementById('export-posts-channel').value;
  const catFilter = document.getElementById('export-posts-cat').value;
  let filter = '';
  if(chFilter) filter = '&channel_id=eq.' + Number(chFilter);
  else if(catFilter){
    const ids = CHANNELS.filter(c=>String(c.category_id) === catFilter).map(c=>c.id);
    if(!ids.length){ showToast('هیچ منبعی با این موضوع نیست'); return; }
    filter = '&channel_id=in.(' + ids.join(',') + ')';
  }
  const btn = document.getElementById('export-posts-btn');
  runExport(btn, 'دانلود خروجی پست‌ها', async setLabel=>{
    setLabel('در حال شمارش…');
    const list = await fetchPostsInRange(b, filter, 'id,channel_id,platform,title,text,link,posted_at,scraped_at', (n, t)=>setLabel('در حال دریافت ' + faNum(n) + ' از ' + faNum(t) + '…'));
    if(!list) return;
    if(!list.length){ showToast('در این بازه مطلبی پیدا نشد'); return; }
    const dateF = new Intl.DateTimeFormat('fa-IR-u-nu-latn', { timeZone:'Asia/Tehran', year:'numeric', month:'2-digit', day:'2-digit' });
    const timeF = new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Tehran', hour:'2-digit', minute:'2-digit' });
    const plain = t => String(t || '').replace(/<[^>]+>/g, '');
    const name = 'jarian-posts-' + b.tag;
    if(fmt === 'json'){
      const rows = list.map(p=>({ channel: chName(p.channel_id), platform: p.platform, category: catNameOf(p.channel_id), title: p.title || null, text: plain(p.text), link: p.link, posted_at: p.posted_at, scraped_at: p.scraped_at }));
      downloadBlob(name + '.json', JSON.stringify(rows, null, 2), 'application/json');
    }else{
      const cols = ['منبع','بستر','موضوع منبع','عنوان','متن','لینک','تاریخ (شمسی)','ساعت'];
      const rows = list.map(p=>{ const d = new Date(p.posted_at || p.scraped_at); return { 'منبع': chName(p.channel_id), 'بستر': EXPORT_PLAT[p.platform] || p.platform, 'موضوع منبع': catNameOf(p.channel_id), 'عنوان': p.title || '', 'متن': plain(p.text), 'لینک': p.link || '', 'تاریخ (شمسی)': dateF.format(d), 'ساعت': timeF.format(d) }; });
      downloadCsv(name + '.csv', rows, cols);
    }
    showToast('خروجی ' + faNum(list.length) + ' مطلب آماده شد');
  });
}

function exportReport(){
  const b = exportBounds('report');
  if(!b){ showToast('تاریخ «از» بعد از تاریخ «تا» است'); return; }
  const fmt = selectedFormat('export-report-fmt');
  const type = document.getElementById('export-report-type').value;
  const btn = document.getElementById('export-report-btn');
  runExport(btn, 'دانلود گزارش آنالیز', async setLabel=>{
    setLabel('در حال شمارش…');
    const list = await fetchPostsInRange(b, '', type === 'words' ? 'id,channel_id,text' : 'id,channel_id', (n, t)=>setLabel('در حال دریافت ' + faNum(n) + ' از ' + faNum(t) + '…'));
    if(!list) return;
    if(!list.length){ showToast('در این بازه مطلبی پیدا نشد'); return; }
    let rows, cols, name;
    if(type === 'words'){
      rows = wordFrequency(list, 100).map(([w, n])=>({ 'واژه': w, 'تعداد': n }));
      cols = ['واژه','تعداد']; name = 'jarian-words-' + b.tag;
    }else{
      rows = topChannelsByCount(list).map(([id, n])=>{ const ch = chById(Number(id)); return { 'منبع': chName(Number(id)), 'بستر': ch ? (EXPORT_PLAT[ch.platform] || ch.platform) : '', 'تعداد مطلب': n }; });
      cols = ['منبع','بستر','تعداد مطلب']; name = 'jarian-sources-' + b.tag;
    }
    if(fmt === 'json') downloadBlob(name + '.json', JSON.stringify(rows, null, 2), 'application/json');
    else downloadCsv(name + '.csv', rows, cols);
    showToast('گزارش آماده شد (' + faNum(list.length) + ' مطلب بررسی شد)');
  });
}

// پیام کوتاه پایین صفحه — زمان نمایش به اندازه‌ی متن (پیام‌های بلندِ قبلاً alert هم اینجا میان)
let TOAST_TIMER = null;
function showToast(msg, ms){
  const t=document.getElementById('toast');
  if(msg) t.textContent = msg;
  t.classList.add('show');
  clearTimeout(TOAST_TIMER);
  TOAST_TIMER = setTimeout(()=>t.classList.remove('show'), ms || Math.min(7000, Math.max(2200, (t.textContent || '').length * 55)));
}
// پنجره‌ی تأیید یکسان سایت (۵.۲۱.۰) — Promise<boolean>. خط اول پیام = تیتر، بقیه = توضیح.
// دکمه‌ی تأیید برای «حذف»/«پنهان» قرمز و با همون فعل؛ «برگشت» گوشی/Esc = انصراف
let UI_CONFIRM_RESOLVE = null;
function uiConfirm(msg){
  return new Promise(res=>{
    if(UI_CONFIRM_RESOLVE) UI_CONFIRM_RESOLVE(false);
    UI_CONFIRM_RESOLVE = res;
    const [title, ...rest] = String(msg).split('\n');
    document.getElementById('ui-confirm-title').textContent = title;
    const txt = document.getElementById('ui-confirm-text');
    txt.textContent = rest.join(' ');
    txt.style.display = rest.length ? '' : 'none';
    const ok = document.getElementById('ui-confirm-ok');
    const del = /حذف/.test(title), hide = /پنهان/.test(title);
    ok.textContent = del ? 'حذف' : hide ? 'پنهان کن' : 'تأیید';
    ok.classList.toggle('danger', del || hide);
    ok.classList.toggle('primary', !(del || hide));
    document.getElementById('ui-confirm-modal').classList.add('active');
    setTimeout(()=>ok.focus(), 30);
  });
}
function uiConfirmClose(v){
  document.getElementById('ui-confirm-modal').classList.remove('active');
  const r = UI_CONFIRM_RESOLVE; UI_CONFIRM_RESOLVE = null;
  if(r) r(v);
}
document.addEventListener('keydown', e=>{ if(e.key === 'Escape' && UI_CONFIRM_RESOLVE) uiConfirmClose(false); });

async function loadNotifySubscribers(){
  const r = await api('/notify_subscribers?select=*&order=created_at.desc');
  NOTIFY_SUBSCRIBERS = r.ok ? await r.json() : [];
}

function renderNotifySubscribers(){
  const wrap = document.getElementById('notify-subs-list');
  const summary = document.getElementById('notify-subs-summary');
  if(!wrap || !summary) return;
  const total = NOTIFY_SUBSCRIBERS.length;
  const pending = NOTIFY_SUBSCRIBERS.filter(s=>!s.notified_at).length;
  summary.textContent = total
    ? `${toFaDigits(total)} مشترک ثبت‌نامی — ${toFaDigits(pending)} نفر در انتظار اطلاع‌رسانی`
    : 'هنوز کسی از صفحه‌ی ورود ثبت‌نام نکرده.';
  wrap.innerHTML = '';
  NOTIFY_SUBSCRIBERS.forEach(s=>{
    const row = document.createElement('div'); row.className = 'notify-sub-row';
    const phone = document.createElement('span'); phone.className = 'mono'; phone.textContent = s.phone;
    const time = document.createElement('span'); time.className = 'notify-sub-time'; time.textContent = newsRelTime(s.created_at);
    const status = document.createElement('span'); status.className = 'notify-sub-status' + (s.notified_at ? ' done' : '');
    status.textContent = s.notified_at ? 'اطلاع‌رسانی‌شده' : 'در انتظار';
    row.appendChild(phone); row.appendChild(time); row.appendChild(status);
    wrap.appendChild(row);
  });
}

function exportNotifySubscribers(){
  if(!NOTIFY_SUBSCRIBERS.length){ showToast('هنوز مشترکی ثبت نشده'); return; }
  const rows = NOTIFY_SUBSCRIBERS.map(s=>({ phone: s.phone, created_at: s.created_at, notified_at: s.notified_at||'' }));
  downloadCsv('notify-subscribers.csv', rows, ['phone','created_at','notified_at']);
  showToast('خروجی لیست شماره‌ها آماده شد');
}

async function markNotifySubscribersNotified(){
  const pending = NOTIFY_SUBSCRIBERS.filter(s=>!s.notified_at);
  if(!pending.length){ showToast('کسی در انتظار اطلاع‌رسانی نیست'); return; }
  if(!await uiConfirm(`${toFaDigits(pending.length)} مشترک به‌عنوان اطلاع‌رسانی‌شده علامت بخورند؟`)) return;
  try{
    const r = await api('/notify_subscribers?notified_at=is.null', {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ notified_at: new Date().toISOString() }),
    });
    if(!r.ok) throw new Error('update failed');
    await loadNotifySubscribers();
    renderNotifySubscribers();
    renderUsersTable();
    showToast('علامت‌گذاری انجام شد');
  }catch(e){
    showToast('علامت‌گذاری ناموفق بود');
  }
}

// ---- PWA: ثبت service worker (فقط روی https/localhost؛ خطاش سایت رو متوقف نمی‌کنه) ----
if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')){
  window.addEventListener('load', ()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); });
}

// ---- نوار تاریخ/ساعت/مناسبت (مهر ۱۴۰۵، خواست کاربر) ----
// تاریخ شمسی، قمری و میلادی + ساعت تهران + مناسبت امروز. قمری با تقویم نجومی
// umalqura مرورگره؛ تقویم رسمی ایران (رؤیت هلال) گاهی ±۱ روز فرق داره — اگه
// کاربر گفت قمری یه روز جلو/عقبه، فقط HIJRI_OFFSET رو عوض کن (+۱ یعنی یه روز
// جلوتر). مناسبت‌های قمری هم از همین تاریخ اصلاح‌شده حساب می‌شن.
const HIJRI_OFFSET = -1; // مهر ۱۴۰۵: کاربر تأیید کرد ۸ مهر = ۱۸ ربیع‌الثانی (umalqura یه روز جلو بود)
const HIJRI_MONTHS = ['محرم','صفر','ربیع‌الاول','ربیع‌الثانی','جمادی‌الاول','جمادی‌الثانی','رجب','شعبان','رمضان','شوال','ذی‌القعده','ذی‌الحجه'];
// کلید «ماه-روز»؛ «L-ماه» = روز آخر اون ماه قمری (۲۹ یا ۳۰)
// ملی + سیاسی‌اجتماعی + انقلاب اسلامی + دفاع مقدس و مقاومت (کاربر، مهر ۱۴۰۵)
const OCC_SOLAR = {
  '1-1':'عید نوروز', '1-2':'تعطیلات نوروز', '1-3':'تعطیلات نوروز', '1-4':'تعطیلات نوروز',
  '1-12':'روز جمهوری اسلامی', '1-13':'روز طبیعت', '1-20':'روز ملی فناوری هسته‌ای', '1-29':'روز ارتش',
  '2-1':'روز بزرگداشت سعدی', '2-10':'روز ملی خلیج فارس', '2-12':'روز معلم', '2-25':'روز بزرگداشت فردوسی',
  '2-30':'سالروز شهادت رئیس‌جمهور شهید رئیسی و همراهان',
  '3-3':'آزادسازی خرمشهر؛ روز مقاومت، ایثار و پیروزی', '3-14':'رحلت امام خمینی (ره)', '3-15':'قیام ۱۵ خرداد',
  '3-23':'سالروز تجاوز رژیم صهیونیستی به ایران و آغاز جنگ ۱۲ روزه',
  '4-3':'سالروز پایان جنگ ۱۲ روزه', '4-7':'شهادت آیت‌الله بهشتی و یاران امام؛ روز قوه قضاییه',
  '4-8':'بمباران شیمیایی سردشت؛ روز مبارزه با سلاح‌های شیمیایی', '4-12':'حمله‌ی ناو آمریکایی به هواپیمای مسافربری ایران',
  '4-14':'روز قلم', '4-27':'سالروز پذیرش قطعنامه‌ی ۵۹۸', '4-30':'قیام ۳۰ تیر ۱۳۳۱',
  '5-14':'سالروز صدور فرمان مشروطیت', '5-17':'روز خبرنگار', '5-26':'سالروز بازگشت آزادگان', '5-28':'کودتای ۲۸ مرداد ۱۳۳۲',
  '6-8':'شهادت رجایی و باهنر؛ روز مبارزه با تروریسم', '6-17':'قیام ۱۷ شهریور ۱۳۵۷', '6-31':'آغاز جنگ تحمیلی و هفته دفاع مقدس',
  '7-1':'آغاز سال تحصیلی', '7-5':'سالروز شکست حصر آبادان', '7-7':'شهادت فرماندهان دفاع مقدس؛ روز آتش‌نشانی و ایمنی',
  '7-8':'روز بزرگداشت مولوی', '7-13':'روز نیروی انتظامی', '7-20':'روز بزرگداشت حافظ',
  '8-13':'روز دانش‌آموز و مبارزه با استکبار جهانی', '9-5':'روز بسیج مستضعفان',
  '9-7':'سالروز شهادت دانشمند هسته‌ای محسن فخری‌زاده', '9-16':'روز دانشجو', '9-30':'شب یلدا',
  '10-9':'روز بصیرت و میثاق امت با ولایت', '10-13':'سالروز شهادت سردار سلیمانی و ابومهدی المهندس',
  '10-19':'قیام مردم قم (۱۳۵۶)', '10-26':'سالروز فرار شاه (۱۳۵۷)',
  '11-12':'بازگشت امام خمینی (ره) و آغاز دهه فجر', '11-22':'پیروزی انقلاب اسلامی', '11-29':'قیام مردم تبریز (۱۳۵۶)',
  '12-22':'روز بزرگداشت شهدا', '12-25':'بمباران شیمیایی حلبچه', '12-29':'روز ملی شدن صنعت نفت',
};
// مقاومت و فلسطین — تاریخ میلادی
const OCC_GREG = {
  '5-15':'روز نکبت (سالروز اشغال فلسطین)', '7-31':'سالروز شهادت اسماعیل هنیه', '9-27':'سالروز شهادت سید حسن نصرالله',
  '10-7':'سالروز عملیات طوفان الاقصی', '10-16':'سالروز شهادت یحیی سنوار', '11-29':'روز جهانی همبستگی با مردم فلسطین',
};
const OCC_LUNAR = {
  '1-1':'آغاز ماه محرم', '1-9':'تاسوعای حسینی', '1-10':'عاشورای حسینی', '1-25':'شهادت امام سجاد (ع)',
  '2-20':'اربعین حسینی', '2-28':'رحلت پیامبر اکرم (ص) و شهادت امام حسن مجتبی (ع)', 'L-2':'شهادت امام رضا (ع)',
  '3-8':'شهادت امام حسن عسکری (ع)', '3-12':'آغاز هفته وحدت', '3-17':'ولادت پیامبر اکرم (ص) و امام جعفر صادق (ع)',
  '4-10':'وفات حضرت معصومه (س)', '5-5':'ولادت حضرت زینب (س) و روز پرستار',
  '6-3':'شهادت حضرت فاطمه زهرا (س)', '6-20':'ولادت حضرت فاطمه زهرا (س) و روز زن',
  '7-1':'ولادت امام محمد باقر (ع)', '7-3':'شهادت امام علی النقی (ع)', '7-10':'ولادت امام محمد تقی (ع)',
  '7-13':'ولادت امام علی (ع) و روز پدر', '7-15':'وفات حضرت زینب (س)', '7-25':'شهادت امام موسی کاظم (ع)', '7-27':'عید مبعث',
  '8-3':'ولادت امام حسین (ع) و روز پاسدار', '8-4':'ولادت حضرت ابوالفضل (ع) و روز جانباز', '8-5':'ولادت امام سجاد (ع)',
  '8-11':'ولادت حضرت علی اکبر (ع) و روز جوان', '8-15':'ولادت حضرت قائم (عج)',
  '9-1':'آغاز ماه مبارک رمضان', '9-15':'ولادت امام حسن مجتبی (ع)', '9-19':'ضربت خوردن امام علی (ع)', '9-21':'شهادت امام علی (ع)',
  '10-1':'عید سعید فطر', '10-2':'تعطیل به مناسبت عید فطر', '10-25':'شهادت امام جعفر صادق (ع)',
  '11-1':'ولادت حضرت معصومه (س) و روز دختران', '11-11':'ولادت امام رضا (ع)', 'L-11':'شهادت امام محمد تقی (ع)',
  '12-1':'سالروز ازدواج حضرت علی (ع) و حضرت فاطمه (س)', '12-7':'شهادت امام محمد باقر (ع)', '12-9':'روز عرفه',
  '12-10':'عید سعید قربان', '12-15':'ولادت امام علی النقی (ع)', '12-18':'عید سعید غدیر خم', '12-24':'روز مباهله',
};
function hijriParts(date){ return calParts(new Date(date.getTime() + HIJRI_OFFSET * 864e5), 'islamic-umalqura'); }
function todayOccasions(now){
  const out = [];
  const sh = calParts(now, 'persian');
  if(OCC_SOLAR[sh.month + '-' + sh.day]) out.push(OCC_SOLAR[sh.month + '-' + sh.day]);
  const hj = hijriParts(now);
  if(OCC_LUNAR[hj.month + '-' + hj.day]) out.push(OCC_LUNAR[hj.month + '-' + hj.day]);
  if(hijriParts(new Date(now.getTime() + 864e5)).day === 1 && OCC_LUNAR['L-' + hj.month]) out.push(OCC_LUNAR['L-' + hj.month]);
  // روز جهانی قدس: آخرین جمعه‌ی ماه رمضان
  const wd = new Intl.DateTimeFormat('en-US', { weekday:'short', timeZone:'Asia/Tehran' }).format(now);
  if(hj.month === 9 && wd === 'Fri' && hijriParts(new Date(now.getTime() + 7 * 864e5)).month !== 9) out.push('روز جهانی قدس');
  const gr = calParts(now, 'gregory');
  if(OCC_GREG[gr.month + '-' + gr.day]) out.push(OCC_GREG[gr.month + '-' + gr.day]);
  return out;
}
let DATEBAR_KEY = '';
function renderDatebar(){
  const el = document.getElementById('datebar');
  if(!el) return;
  const now = new Date();
  const clock = now.toLocaleTimeString('fa-IR', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'Asia/Tehran' });
  const shp = calParts(now, 'persian');
  const dayKey = shp.year + '-' + shp.month + '-' + shp.day;
  if(DATEBAR_KEY === dayKey && el.firstChild){
    el.querySelector('.db-clock b').textContent = clock;
    return;
  }
  DATEBAR_KEY = dayKey;
  // ترکیب weekday با تاریخ در Chromium به‌هم‌ریخته درمیاد («۱۴۰۵ مهر ۷, سه‌شنبه») — دستی سرهم می‌شه
  const shamsi = now.toLocaleDateString('fa-IR', { weekday:'long', timeZone:'Asia/Tehran' }) + ' '
    + now.toLocaleDateString('fa-IR', { day:'numeric', month:'long', year:'numeric', timeZone:'Asia/Tehran' });
  const hj = hijriParts(now);
  const hijri = toFaDigits(hj.day) + ' ' + HIJRI_MONTHS[hj.month - 1] + ' ' + toFaDigits(hj.year);
  const greg = now.toLocaleDateString('fa-IR-u-ca-gregory', { day:'numeric', month:'long', year:'numeric', timeZone:'Asia/Tehran' });
  const occ = todayOccasions(now);
  const star = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>';
  el.innerHTML = `<div class="db-top"><b>${escHtml(shamsi)}</b><span>${escHtml(hijri)}</span><span class="db-hide-m">${escHtml(greg)}</span>
      <span class="db-clock"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><b>${clock}</b></span></div>
    ${occ.length ? `<div class="db-occ"><span class="ln"></span>${star}<span class="t">${escHtml(occ.join('، '))}</span>${star}<span class="ln"></span></div>` : ''}`;
}
renderDatebar();
setInterval(renderDatebar, 15000);

// ---- «گزارش فعالیت» (فقط مدیر، migration_039) ----
// سه قسمت: پنهان‌کردن پست (دکمه زیر هر پست برای مدیر + فهرست/بازگرداندن)،
// آمار بازدید (شمارنده‌ی روزانه‌ی هر بخش/تب — فقط عدد، بدون نام یا دستگاه) و
// دفتر تغییرات (admin_audit، پرشده با trigger دیتابیس — از فرانت‌اند قابل دور
// زدن نیست؛ کارهای خودکار گیت‌هاب/Edge Functionها ثبت نمی‌شن). تا وقتی
// migration_039 اجرا نشده، همه‌ی این‌ها بی‌صدا غیرفعال‌ان و بقیه‌ی سایت سالمه.
var ACT_TAB = 'views';
let HIDDEN_POST_IDS = new Set();
let ACT_HIDDEN = null, ACT_AUDIT = null, ACT_VIEWS = null;
let ACT_VIEWS_DAYS = 30, ACT_VIEWS_ROLE = 'app_viewer', ACT_AUDIT_FILTER = 'all', ACT_AUDIT_SHOW = 50;
const ACT_TAB_INFO = {
  views: 'هر بخش و تب سایت چند بار باز شده، به تفکیک روز. فقط عدد ثبت می‌شود، نه نام یا دستگاه افراد.',
  audit: 'تغییرهایی که از پنل مدیریت انجام شده: چه چیزی، کی و از کدام دستگاه. کارهای خودکار سامانه ثبت نمی‌شوند.',
  hidden: 'پست‌هایی که از دید بیننده‌ها پنهان شده‌اند؛ با «بازگرداندن» دوباره در همه‌ی بخش‌ها دیده می‌شوند.',
};
const ACT_MIGRATION_NOTE = 'برای این بخش، فایل <b>db/migration_039_admin_activity.sql</b> باید یک‌بار در SQL Editor سوپابیس اجرا شود.';

// شناسه‌ی پست‌های پنهان برای هر دو نقش (تابع security definer فقط شناسه می‌ده، نه متن) —
// لازمه چون «اخبار منتخب» هوش مصنوعی عنوان خبر رو جدا ذخیره کرده و بدون این فیلتر
// پست پنهان‌شده رو باز هم نشون می‌داد
async function loadHiddenPostIds(){
  try{
    const r = await api('/rpc/hidden_post_ids', { method:'POST', body:'{}' });
    if(!r.ok){ HIDDEN_POST_IDS = new Set(); return; }
    const rows = await r.json();
    HIDDEN_POST_IDS = new Set((Array.isArray(rows) ? rows : []).map(x=>Number(x && typeof x === 'object' ? Object.values(x)[0] : x)));
  }catch(e){ HIDDEN_POST_IDS = new Set(); }
}
function postHideBtnHtml(p){
  return currentRole === 'app_admin' ? `<button type="button" class="post-hide-btn" onclick="hidePost(${Number(p.id)})" title="این پست برای همه‌ی بیننده‌ها پنهان می‌شود"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c5 0 9 4.5 10 7a13.6 13.6 0 0 1-2.9 3.9M6.6 6.6C4.3 8 2.7 10.1 2 12c1 2.5 5 7 10 7 1.9 0 3.6-.6 5.1-1.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>پنهان کردن</button>` : '';
}
function rerenderPostViews(){
  [renderNewsFeed, renderPosts, renderPoliticalFigures, renderDossierTab, renderLaws].forEach(fn=>{ try{ fn(); }catch(e){ console.error(e); } });
  if(document.getElementById('sec-overview').classList.contains('active') && NEWS_CURRENT_TAB === 'analytics'){ try{ renderNewsAnalytics(); }catch(e){ console.error(e); } }
}
async function hidePost(id){
  if(!await uiConfirm('این پست برای همه‌ی بیننده‌ها پنهان شود؟\nبعداً از «مدیریت ← گزارش فعالیت ← پست‌های پنهان‌شده» قابل بازگرداندن است.')) return;
  const r = await api('/posts?id=eq.' + id, { method:'PATCH', headers:{ Prefer:'return=minimal' }, body: JSON.stringify({ hidden_at: new Date().toISOString() }) });
  if(!r.ok){ showToast(r.status === 400 ? 'اول باید migration_039 در سوپابیس اجرا شود' : 'پنهان کردن پست انجام نشد'); return; }
  HIDDEN_POST_IDS.add(id);
  POSTS_CACHE = POSTS_CACHE.filter(p=>p.id !== id);
  NEWSLETTER_POSTS = NEWSLETTER_POSTS.filter(np=>np.post_id !== id);
  ACT_HIDDEN = null;
  rerenderPostViews();
  showToast('پست پنهان شد');
}
async function unhidePost(id){
  const r = await api('/posts?id=eq.' + id, { method:'PATCH', headers:{ Prefer:'return=representation' }, body: JSON.stringify({ hidden_at: null }) });
  if(!r.ok){ showToast('بازگرداندن پست انجام نشد'); return; }
  const rows = await r.json().catch(()=>[]);
  HIDDEN_POST_IDS.delete(id);
  if(rows[0] && !POSTS_CACHE.some(p=>p.id === id)){
    POSTS_CACHE = POSTS_CACHE.concat(rows).sort((a,b)=>String(b.scraped_at||'').localeCompare(String(a.scraped_at||'')));
  }
  if(ACT_HIDDEN) ACT_HIDDEN = ACT_HIDDEN.filter(p=>p.id !== id);
  renderActHidden();
  rerenderPostViews();
  showToast('پست بازگردانده شد');
}

function setActTab(tab){
  navMark();
  ACT_TAB = ACT_TAB_INFO[tab] ? tab : 'views';
  document.querySelectorAll('#act-page-tabs button').forEach(b=>b.classList.toggle('active', b.dataset.actTab === ACT_TAB));
  document.querySelector('#act-tab-subtitle span').textContent = ACT_TAB_INFO[ACT_TAB];
  ['views','audit','hidden'].forEach(t=>{ document.getElementById('act-pane-' + t).style.display = t === ACT_TAB ? '' : 'none'; });
  // هر بار باز کردن تب = داده‌ی تازه (بدون اثر روی سرعت بقیه‌ی سایت)
  if(ACT_TAB === 'views'){ ACT_VIEWS = null; renderActViews(); }
  if(ACT_TAB === 'audit'){ ACT_AUDIT = null; ACT_AUDIT_SHOW = 50; renderActAudit(); }
  if(ACT_TAB === 'hidden'){ ACT_HIDDEN = null; renderActHidden(); }
}
document.getElementById('act-page-tabs').addEventListener('click', e=>{
  const b = e.target.closest('button');
  if(b && b.dataset.actTab && b.dataset.actTab !== ACT_TAB) setActTab(b.dataset.actTab);
});

// ---- آمار بازدید ----
// هر جابه‌جایی بخش/تب (از navFlush) یه شماره؛ باز کردن دوباره‌ی همون جا پشت‌سرهم
// شمرده نمی‌شه. «ورود به سایت» یک‌بار برای هر زبانه (section=session).
let PV_LAST = '', PV_OFF = false;
function logPageView(st){
  if(PV_OFF || !authToken || !st || !st.s) return;
  const calls = [];
  try{
    if(!sessionStorage.getItem('jarian_pv_session')){ sessionStorage.setItem('jarian_pv_session', '1'); calls.push(['session', '']); }
  }catch(e){}
  const key = st.s + '/' + (st.t || '');
  if(key !== PV_LAST){ PV_LAST = key; calls.push([st.s, st.t || '']); }
  calls.forEach(([sec, tab])=>{
    api('/rpc/log_page_view', { method:'POST', headers:{ Prefer:'return=minimal' }, body: JSON.stringify({ p_section: sec, p_tab: tab }) })
      .then(r=>{ if(r.status === 404) PV_OFF = true; }).catch(()=>{});
  });
}
const ACT_SECTION_NAMES = { dashboard:'صفحه نخست', overview:'اخبار و رویدادها', posts:'کنشگری مجازی', people:'یادداشت‌ها', hawza:'درباره حوزه', schools:'برنامه مدارس', reports:'بسته تحلیلی جریان' };
const ACT_TAB_NAMES = { magazines:'بسته تحلیلی جریان', archive:'بسته‌های سایر نهادها', schools:'گزارش‌های مدارس' };
function actSectionName(s){ return ACT_SECTION_NAMES[s] || TITLES[s] || s; }
function actTabName(s, t){
  if(!t) return 'بدون تب';
  for(const b of document.querySelectorAll('#sec-' + s + ' .news-page-tabs button')){
    if(!Object.values(b.dataset).includes(t)) continue;
    const c = b.cloneNode(true);
    c.querySelectorAll('.news-soon').forEach(x=>x.remove());
    return c.textContent.trim() || t;
  }
  return ACT_TAB_NAMES[t] || t;
}
function tehranDateStr(ms){ return new Date(ms).toLocaleDateString('en-CA', { timeZone:'Asia/Tehran' }); }
async function renderActViews(){
  const el = document.getElementById('act-views');
  document.getElementById('act-views-days').innerHTML = [[7,'۷ روز اخیر'],[30,'۳۰ روز اخیر'],[90,'۹۰ روز اخیر']].map(([d,l])=>`<button type="button" class="usr-chip ${ACT_VIEWS_DAYS===d?'active':''}" data-d="${d}">${l}</button>`).join('');
  document.getElementById('act-views-role').innerHTML = [['app_viewer','بیننده‌ها'],['app_admin','مدیر'],['all','همه']].map(([k,l])=>`<button type="button" class="usr-chip ${ACT_VIEWS_ROLE===k?'active':''}" data-r="${k}">${l}</button>`).join('');
  if(!ACT_VIEWS){
    el.innerHTML = '<div class="sys-note">در حال دریافت…</div>';
    try{
      const since = tehranDateStr(Date.now() - 89 * 86400000);
      const rows = [];
      for(let page = 0; page < 10; page++){
        const r = await api('/page_views?select=day,section,tab,role,views&day=gte.' + since + '&order=day.asc&limit=1000&offset=' + (page * 1000));
        if(r.status === 404 || r.status === 400){ el.innerHTML = '<div class="ann-missing">' + ACT_MIGRATION_NOTE + '</div>'; return; }
        if(!r.ok) throw new Error('page_views ' + r.status);
        const part = await r.json();
        rows.push(...part);
        if(part.length < 1000) break;
      }
      ACT_VIEWS = rows;
    }catch(e){ console.error(e); el.innerHTML = '<div class="sys-note">خطا در دریافت آمار بازدید.</div>'; return; }
  }
  const days = [];
  for(let i = ACT_VIEWS_DAYS - 1; i >= 0; i--) days.push(tehranDateStr(Date.now() - i * 86400000));
  const rows = ACT_VIEWS.filter(x=>x.day >= days[0] && (ACT_VIEWS_ROLE === 'all' || x.role === ACT_VIEWS_ROLE));
  const pages = rows.filter(x=>x.section !== 'session');
  const total = pages.reduce((a,x)=>a + x.views, 0);
  const sessions = rows.filter(x=>x.section === 'session').reduce((a,x)=>a + x.views, 0);
  if(!ACT_VIEWS.length){
    el.innerHTML = '<div class="sys-note">هنوز بازدیدی ثبت نشده. آمار از زمان اجرای migration_039 جمع می‌شود.</div>';
    return;
  }
  const perDay = {}; days.forEach(d=>perDay[d] = 0);
  pages.forEach(x=>{ if(x.day in perDay) perDay[x.day] += x.views; });
  const maxDay = Math.max(1, ...Object.values(perDay));
  const secs = {};
  pages.forEach(x=>{
    const s = secs[x.section] || (secs[x.section] = { n:0, tabs:{} });
    s.n += x.views;
    const tk = x.tab || ''; // ردیف بدون تب (مثل صفحه‌ی نخست) زیرردیف جدا نمی‌گیره
    s.tabs[tk] = (s.tabs[tk] || 0) + x.views;
  });
  const secList = Object.entries(secs).sort((a,b)=>b[1].n - a[1].n);
  const maxSec = secList.length ? secList[0][1].n : 1;
  const fmtDay = d=>new Date(d + 'T12:00:00Z').toLocaleDateString('fa-IR', { timeZone:'Asia/Tehran', day:'numeric', month:'long' });
  const top = secList[0];
  el.innerHTML = `<div class="sys-login-sum">
      <div class="sys-login-stat"><b>${faNum(total)}</b><span>بازدید بخش‌ها و تب‌ها</span></div>
      <div class="sys-login-stat"><b>${faNum(sessions)}</b><span>ورود به سایت (هر زبانه‌ی مرورگر یک‌بار)</span></div>
      <div class="sys-login-stat"><b>${faNum(Math.round(total / days.length))}</b><span>میانگین بازدید در روز</span></div>
      <div class="sys-login-stat"><b>${top ? escHtml(actSectionName(top[0])) : '—'}</b><span>پربازدیدترین بخش</span></div>
    </div>
    <div class="act-chart-title">بازدید روزانه</div>
    <div class="act-days">${days.map(d=>`<div class="act-day" title="${escAttr(fmtDay(d) + '، ' + faNum(perDay[d]) + ' بازدید')}"><i style="height:${(perDay[d] / maxDay * 100).toFixed(1)}%"></i></div>`).join('')}</div>
    <div class="act-days-axis"><span>${fmtDay(days[0])}</span><span>${fmtDay(days[days.length - 1])}</span></div>
    <div class="act-chart-title">بازدید به تفکیک بخش و تب</div>
    ${secList.length ? `<div class="act-secs">${secList.map(([s, v])=>{
      const tabs = Object.entries(v.tabs).filter(([t])=>t).sort((a,b)=>b[1] - a[1]);
      return `<div class="act-sec-row"><span><b>${escHtml(actSectionName(s))}</b></span><span class="act-bar"><i style="width:${(v.n / maxSec * 100).toFixed(1)}%"></i></span><span>${faNum(v.n)}</span></div>`
        + tabs.map(([t, n])=>`<div class="act-sec-row sub"><span>${escHtml(actTabName(s, t))}</span><span class="act-bar"><i style="width:${(n / maxSec * 100).toFixed(1)}%"></i></span><span>${faNum(n)}</span></div>`).join('');
    }).join('')}</div>` : '<div class="sys-note">در این بازه بازدیدی ثبت نشده.</div>'}`;
}
document.getElementById('act-views-days').addEventListener('click', e=>{ const b = e.target.closest('button'); if(b){ ACT_VIEWS_DAYS = Number(b.dataset.d); renderActViews(); } });
document.getElementById('act-views-role').addEventListener('click', e=>{ const b = e.target.closest('button'); if(b){ ACT_VIEWS_ROLE = b.dataset.r; renderActViews(); } });

// ---- دفتر تغییرات ----
const AUDIT_TBL = {
  channels:['منبع','sources'], categories:['موضوع منابع','sources'], regions:['منطقه','sources'], profile_groups:['گروه چهره/سازمان','sources'],
  channel_profile_groups:['عضویت منبع در گروه','sources'], news_topics:['میان‌بر جست‌وجو','content'], dossier_topics:['پرونده‌ی موضوعی','content'],
  dossier_topic_posts:['مطلب پرونده','content'], newsletter_posts:['خبرنامه مدارس','content'], magazines:['بسته تحلیلی جریان','content'],
  archive_reports:['بسته‌ی سایر نهادها','content'], school_reports:['گزارش برنامه مدارس','content'], announcements:['اطلاعیه','content'],
  app_users:['کاربر','users'], feedback:['نظر کاربر','users'], notify_subscribers:['مشترک اطلاع‌رسانی','users'],
  posts:['پست','posts'], app_config:['رمز عبور','security'],
  crawl_sites:['منبع خزنده','sources'], hawza_mentions:['خبر «درباره حوزه»','content'],
  site_settings:['نمایش سایت','content'], login_events:['قفل ورود','security'],
};
const AUDIT_GROUPS = [['all','همه'],['sources','منابع'],['content','محتوا'],['posts','پست‌ها'],['users','کاربران'],['security','امنیت']];
const AUDIT_OP = { insert:['افزودن','add'], update:['ویرایش',''], delete:['حذف','del'], hide:['پنهان کردن','del'], unhide:['بازگرداندن','add'], password:['تغییر رمز','sec'], publish:['انتشار','add'], unlock:['باز کردن قفل ورود','add'] };
const AUDIT_FIELD = {
  title:'عنوان', name:'نام', username:'آدرس / شناسه', platform:'بستر', active:'فعال', category_id:'موضوع', region_id:'منطقه', hawza_region_id:'منطقه‌ی حوزه',
  show_in_news:'بخش اخبار و رویدادها', show_in_cyberspace:'بخش کنشگری مجازی', show_in_people:'بخش چهره‌ها', show_in_orgs:'بخش سازمان‌ها', show_in_hawza:'بخش درباره حوزه',
  show_in_positions:'بخش مواضع مراجع و علماء', positions_tab:'تب مواضع', show_in_thinktanks:'بخش اندیشکده‌ها', show_in_laws:'بخش قوانین و مصوبات', laws_source:'مرجع صادرکننده',
  avatar_url:'عکس', owner_name:'صاحب کانال', subscriber_count:'مخاطب', is_khorasan_talabeh:'طلاب خراسان', keywords:'کلیدواژه‌ها', color:'رنگ', kind:'نوع',
  excluded:'پنهان در پرونده', message:'متن', level:'اهمیت', expires_at:'انقضا', full_name:'نام', phone:'موبایل', eitaa_id:'شناسه‌ی ایتا',
  access_level:'سطح دسترسی', national_id_last4:'کد ملی (۴ رقم آخر)', is_admin:'نقش مدیر', notes:'یادداشت', issue_no:'شماره', publish_date:'تاریخ انتشار', file_type:'نوع فایل', files:'فایل‌ها', cover_url:'جلد',
  source_org:'نهاد', image_url:'تصویر', media_storage_path:'فایل', notified_at:'زمان اطلاع‌رسانی', type:'نوع منبع', value:'مقدار',
};
const AUDIT_FILE_FIELDS = ['avatar_url','files','cover_url','image_url','media_storage_path'];
function auditVal(k, v){
  if(v === null || v === undefined || v === '') return '—';
  if(typeof v === 'boolean') return v ? 'بله' : 'خیر';
  if(k === 'category_id'){ const c = CATEGORIES.find(x=>x.id === v); return c ? escHtml(c.name) : faNum(v); }
  if(k === 'region_id' || k === 'hawza_region_id') return escHtml(regionNameOf(v) || String(v));
  if(k === 'access_level') return escHtml(USER_LEVELS[v] || v);
  if(k === 'level') return v === 'important' ? 'مهم' : 'عادی';
  if(k === 'positions_tab') return escHtml(POS_TAB_LABEL[v] || v);
  if(k === 'platform') return escHtml(NEWS_PLATFORM_LABEL[v] || v);
  if(typeof v === 'number') return faNum(v);
  if(typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v)) return new Date(v).toLocaleString('fa-IR', { timeZone:'Asia/Tehran', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
  const t = typeof v === 'string' ? v : JSON.stringify(v);
  return escHtml(t.length > 70 ? t.slice(0, 70) + '…' : t);
}
function auditChangesHtml(x){
  if(!x.changes || typeof x.changes !== 'object') return '';
  return Object.entries(x.changes).map(([k, pair])=>{
    const label = escHtml(AUDIT_FIELD[k] || k);
    if(AUDIT_FILE_FIELDS.includes(k)) return `<div><b>${label}</b>: عوض شد</div>`;
    const [a, b] = Array.isArray(pair) ? pair : [null, pair];
    return `<div><b>${label}</b>: ${auditVal(k, a)} ← ${auditVal(k, b)}</div>`;
  }).join('');
}
async function renderActAudit(){
  const el = document.getElementById('act-audit');
  if(!ACT_AUDIT){
    el.innerHTML = '<div class="sys-note">در حال دریافت…</div>';
    try{
      const r = await api('/admin_audit?select=*&order=created_at.desc&limit=1000');
      if(r.status === 404 || r.status === 400){ document.getElementById('act-audit-filters').innerHTML = ''; el.innerHTML = '<div class="ann-missing">' + ACT_MIGRATION_NOTE + '</div>'; return; }
      if(!r.ok) throw new Error('admin_audit ' + r.status);
      ACT_AUDIT = await r.json();
    }catch(e){ console.error(e); el.innerHTML = '<div class="sys-note">خطا در دریافت دفتر تغییرات.</div>'; return; }
  }
  const groupOf = x=>(AUDIT_TBL[x.tbl] || [x.tbl, 'content'])[1];
  const counts = { all: ACT_AUDIT.length };
  ACT_AUDIT.forEach(x=>{ const g = groupOf(x); counts[g] = (counts[g] || 0) + 1; });
  document.getElementById('act-audit-filters').innerHTML = AUDIT_GROUPS.map(([k,l])=>`<button type="button" class="usr-chip ${ACT_AUDIT_FILTER===k?'active':''}" data-f="${k}">${l}<span>${toFaDigits(counts[k] || 0)}</span></button>`).join('');
  // همون نرمال‌سازی جست‌وجوی اخبار (ي/ك عربی، نیم‌فاصله، ارقام فارسی) — ۵.۲۰.۰
  const q = searchNorm((document.getElementById('act-audit-search').value || '').trim());
  const list = ACT_AUDIT.filter(x=>(ACT_AUDIT_FILTER === 'all' || groupOf(x) === ACT_AUDIT_FILTER) && (!q || searchNorm((x.label || '') + ' ' + ((AUDIT_TBL[x.tbl] || [x.tbl])[0] || '')).includes(q)));
  if(!list.length){
    el.innerHTML = '<div class="sys-note">' + (ACT_AUDIT.length ? 'موردی با این فیلتر پیدا نشد.' : 'هنوز تغییری ثبت نشده. از این به بعد هر تغییر در پنل مدیریت اینجا دیده می‌شود.') + '</div>';
    return;
  }
  const shown = list.slice(0, ACT_AUDIT_SHOW);
  el.innerHTML = `<div class="sys-login-wrap"><table class="sys-login-table act-audit-table"><thead><tr><th>زمان</th><th>عملیات</th><th>بخش</th><th>مورد</th><th>جزئیات</th><th>دستگاه</th></tr></thead><tbody>${shown.map(x=>{
      const when = new Date(x.created_at).toLocaleString('fa-IR', { timeZone:'Asia/Tehran', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
      const op = AUDIT_OP[x.op] || [x.op, ''];
      const ua = sysDeviceLabel(x.user_agent);
      return `<tr><td>${escHtml(when)}</td><td><span class="act-op ${op[1]}">${escHtml(op[0])}</span></td><td>${escHtml((AUDIT_TBL[x.tbl] || [x.tbl])[0])}</td>`
        + `<td class="act-item">${escHtml(x.label || '—')}</td><td class="act-chg">${auditChangesHtml(x)}</td>`
        + `<td title="${escAttr((x.user_agent || '') + (x.ip ? ' — IP: ' + x.ip : ''))}">${escHtml(ua)}</td></tr>`;
    }).join('')}</tbody></table></div>${list.length > ACT_AUDIT_SHOW ? `<button type="button" class="btn sys-login-more" data-act="audit-more">نمایش بیشتر (${faNum(list.length - ACT_AUDIT_SHOW)} مورد دیگر)</button>` : ''}`;
}
document.getElementById('act-audit-filters').addEventListener('click', e=>{ const b = e.target.closest('button'); if(b){ ACT_AUDIT_FILTER = b.dataset.f; ACT_AUDIT_SHOW = 50; renderActAudit(); } });
document.getElementById('act-audit').addEventListener('click', e=>{
  if(e.target.closest('[data-act="audit-more"]')){ ACT_AUDIT_SHOW += 100; renderActAudit(); }
});
document.getElementById('act-audit-search').addEventListener('input', ()=>{ ACT_AUDIT_SHOW = 50; renderActAudit(); });

// ---- پست‌های پنهان‌شده ----
async function renderActHidden(){
  const el = document.getElementById('act-hidden');
  if(!ACT_HIDDEN){
    el.innerHTML = '<div class="sys-note">در حال دریافت…</div>';
    try{
      const r = await api('/posts?select=id,channel_id,platform,title,text,link,hidden_at,posted_at,scraped_at&hidden_at=not.is.null&order=hidden_at.desc&limit=300');
      if(r.status === 400){ el.innerHTML = '<div class="ann-missing">' + ACT_MIGRATION_NOTE + '</div>'; return; }
      if(!r.ok) throw new Error('posts ' + r.status);
      ACT_HIDDEN = await r.json();
    }catch(e){ console.error(e); el.innerHTML = '<div class="sys-note">خطا در دریافت پست‌های پنهان‌شده.</div>'; return; }
  }
  if(!ACT_HIDDEN.length){
    el.innerHTML = '<div class="sys-note">هیچ پستی پنهان نشده. برای پنهان کردن یک پست، روی «پنهان کردن پست» زیر همان پست بزنید.</div>';
    return;
  }
  el.innerHTML = ACT_HIDDEN.map(p=>{
    const ch = chById(p.channel_id) || {};
    const text = (p.title ? p.title + ' — ' : '') + (p.text || '');
    return `<div class="act-hid-item"><div>
        <div class="act-hid-meta"><b>${escHtml(ch.title || ch.username || '؟')}</b>، ${escHtml(NEWS_PLATFORM_LABEL[p.platform] || p.platform || '')}، انتشار ${escHtml(newsRelTime(p.posted_at || p.scraped_at))}، پنهان‌شده ${escHtml(newsRelTime(p.hidden_at))}</div>
        <div class="act-hid-text">${escHtml(text.slice(0, 400))}</div>
      </div><div class="act-hid-acts">
        <button type="button" class="btn" onclick="unhidePost(${Number(p.id)})">بازگرداندن</button>
        ${p.link ? `<a href="${safeUrl(p.link)}" target="_blank" rel="noopener">مشاهده‌ی منبع ↗</a>` : ''}
      </div></div>`;
  }).join('');
}

// ---- آدرس هر بخش (#بخش/تب/کانال) — سازوکار تاریخچه در core/router.js ----
function navCurrentState(){
  const secEl = document.querySelector('.section.active');
  const s = secEl ? secEl.id.slice(4) : 'dashboard';
  let t = null, ch = null;
  if(s === 'overview') t = NEWS_CURRENT_TAB;
  else if(s === 'posts'){ const b = document.querySelector('#posts-page-tabs button.active'); t = b ? b.dataset.postsTab : null; }
  else if(s === 'people'){
    const b = document.querySelector('#people-page-tabs button.active'); t = b ? b.dataset.peopleTab : null;
    if((t === 'figures' || t === 'orgs' || t === 'thinktanks') && pfSelectedChannel) ch = pfSelectedChannel;
  }
  else if(s === 'positions'){ t = POS_TAB; if(pfSelectedChannel) ch = pfSelectedChannel; }
  else if(s === 'public') t = 'trends';
  else if(s === 'uploads') t = UPLOADS_TAB;
  else if(s === 'activity') t = ACT_TAB;
  else if(s === 'hawza') t = HAWZA_TAB;
  const key = [s, t, ch].filter(x=>x !== null && x !== undefined && x !== '').join('/');
  return { jarian:1, key, s, t, ch };
}
function navParse(hash){
  const parts = String(hash || '').replace(/^#/, '').split('/').map(x=>{ try{ return decodeURIComponent(x); }catch(e){ return ''; } });
  const s = parts[0];
  if(!s || !/^[a-z]+$/.test(s) || !document.getElementById('sec-'+s)) return null;
  if(ADMIN_ONLY_SECTIONS.includes(s) && currentRole !== 'app_admin') return null;
  const ch = Number(parts[2]) || null;
  return { jarian:1, key:[s, parts[1], ch].filter(Boolean).join('/'), s, t: parts[1] || null, ch };
}
function navClickTab(barSel, dataKey, val){
  const b = document.querySelector(`${barSel} button[data-${dataKey}="${val}"]`);
  if(b && !b.disabled && !b.classList.contains('active')) b.click();
}
// اعمال یه حالت ذخیره‌شده — فقط چیزهایی که با حالت فعلی فرق دارن
function navApply(st){
  const cur = document.querySelector('.section.active');
  if(!cur || cur.id !== 'sec-'+st.s) switchSection(st.s);
  if(st.s === 'overview' && st.t && NEWS_TABS.includes(st.t) && st.t !== NEWS_CURRENT_TAB) setNewsPageTab(st.t);
  if(st.s === 'posts' && st.t) navClickTab('#posts-page-tabs', 'posts-tab', st.t);
  if(st.s === 'people'){
    if(st.t) navClickTab('#people-page-tabs', 'people-tab', st.t);
    if(st.ch && st.ch !== pfSelectedChannel) openPfChannel(st.ch);
    else if(!st.ch && pfSelectedChannel) closePfChannel();
  }
  if(st.s === 'uploads' && st.t && ['magazines','archive','schools'].includes(st.t) && st.t !== UPLOADS_TAB) setUploadsTab(st.t);
  if(st.s === 'activity' && st.t && ACT_TAB_INFO[st.t] && st.t !== ACT_TAB) setActTab(st.t);
  if(st.s === 'hawza' && st.t && HAWZA_TAB_INFO[st.t] && st.t !== HAWZA_TAB) setHawzaTab(st.t);
  if(st.s === 'positions'){
    if(st.t && POS_TAB_INFO[st.t] && st.t !== POS_TAB) setPosTab(st.t);
    if(st.ch && st.ch !== pfSelectedChannel) openPfChannel(st.ch);
    else if(!st.ch && pfSelectedChannel) closePfChannel();
  }
}
// «برگشت» مرورگر (بعد از بستن پنجره‌های باز، که خودِ router انجام می‌ده)
function onNavPop(state){
  if(!authToken || !document.getElementById('view-dash').classList.contains('active')) return;
  closeAdminMenu(); closeNavMenu();
  let st = (state && state.jarian) ? state : navParse(location.hash);
  if(!st || (ADMIN_ONLY_SECTIONS.includes(st.s) && currentRole !== 'app_admin')) st = { jarian:1, key:'dashboard', s:'dashboard' };
  if(st.key === navCurrentState().key) return; // مثلاً بعد از بستن پنجره با دکمه‌ی ×
  navRestoring();
  try{ navApply(st); }catch(err){ console.error(err); }
  if(typeof st.y === 'number') restoreScrollY(st.y);
  navMark();
}
startRouter({
  current: navCurrentState,
  isActive: ()=>document.getElementById('view-dash').classList.contains('active'),
  onEnter: logPageView,
  onPop: onNavPop,
});

document.querySelectorAll('.app-version').forEach(el=>{ el.textContent = toFaDigits(APP_VERSION); });

// ---- boot ----
// جای اسکرول برای برگشت بعد از رفرش (فقط همین زبانه)
window.addEventListener('pagehide', ()=>{
  try{ if(authToken && document.getElementById('view-dash').classList.contains('active')) sessionStorage.setItem('jarian_last_scroll', String(Math.round(window.scrollY))); }catch(e){}
});
if(authToken){
  // رفرش با نشست معتبر: بدون عبور از صفحه‌ی ورود، همون بخش فوراً نشون داده
  // می‌شه و داده‌ها پشت‌صحنه می‌رسن (loadAllAndEnter دوباره رندرش می‌کنه)
  document.body.classList.add('app-loading');
  applyRoleUI();
  navRestoring();
  // تب لینک مستقیم (مثلاً #people/orgs) همین‌جا اعمال می‌شه — وگرنه navFlush بعد از
  // switchSection آدرس رو با تب پیش‌فرض جایگزین می‌کرد و loadAllAndEnter دیگه تب لینک رو نمی‌دید
  const bootSt = navParse(location.hash);
  try{ show('view-dash'); switchSection(lastSectionKey()); if(bootSt) navApply(bootSt); }catch(e){ console.error(e); }
  document.documentElement.classList.remove('has-session');
  loadAllAndEnter();
}else{
  focusLoginPassword();
  loadLoginMaintNotice();
}
