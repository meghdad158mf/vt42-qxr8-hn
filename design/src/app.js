// بدنه‌ی برنامه — کل اسکریپت قبلی صفحه، حالا یه ES module. جدا شده تا الان: هسته در core/
// (مرحله‌ی ۳، ۵.۳۲.۲) و اجزای رابط در ui/ (مرحله‌ی ۴، ۵.۳۲.۳: پنجره‌ها، پیام/تأیید، منوها، تب‌بارها،
// نمایشگر سند/عکس، صفحه‌بندی…)، داده‌ی مشترک در data/، و عرصه‌ها در features/: اخبار و رویدادها (مرحله‌ی ۵،
// ۵.۳۲.۴–۵)، کنشگری مجازی، یادداشت‌ها و مواضع مراجع و علماء (مرحله‌ی ۶، ۵.۳۲.۶)، درباره حوزه، قوانین،
// برنامه مدارس، بسته تحلیلی، اطلاعیه‌ها و صفحه‌ی نخست (مرحله‌ی ۷، ۵.۳۲.۷). اینجا مونده: ورود، ناوبری و
// بارگذاری داده، و بخش‌های مدیریت (مرحله‌ی ۸ به admin/) — CLAUDE.md، «ماژولار کردن».
import { SUPABASE_URL, SUPABASE_ANON_KEY, APP_VERSION } from './core/config.js';
import { authToken, currentRole, saveSession, clearSession } from './core/session.js';
import { api, SESSION_EXPIRED, resetSessionExpired, fetchExactCount } from './core/api.js';
import { setErrorContext } from './core/error-reporting.js';
import { escAttr, escHtml, safeUrl, toFaDigits, faTitle, faNum, faDigitsToEn, faDigitsToLatin, needsTranslation } from './core/text.js';
import { searchNorm } from './core/search.js';
import { calParts, jalaliMonthStarts, newsRelTime } from './core/date.js';
import { nidValid, normalizeIrMobile } from './core/validate.js';
import { navMark, navRestoring, startRouter, restoreScrollY } from './core/router.js';
import { lsGet, lsSet } from './core/local-store.js';
import { ICONS } from './ui/icons.js';
import { setupAmbient } from './ui/ambient.js';
import { showToast } from './ui/toast.js';
import { uiConfirm, setupConfirm } from './ui/confirm.js';
import { bindModal } from './ui/modal.js';
import { setupMenus, closeNavMenu, closeAdminMenu } from './ui/menus.js';
import { setupTabBars, updateTabInk, restoreLastTab, peekTabBar } from './ui/tabs.js';
import { setupToTop } from './ui/scroll.js';
import { setupKeyboardButtons } from './ui/keyboard.js';
import { setupMediaViewer } from './ui/media-viewer.js';
import { setupDocViewer } from './ui/doc-viewer.js';
import { setupJalaliRange } from './ui/jalali-range.js';
import { setMobileFilterCount, setupMobileFilters } from './ui/mobile-filters.js';
import { CATEGORIES, CHANNELS, POSTS_CACHE, REGIONS, catNameOf, chById, chInitials, chName, regionNameOf, setCategories, setChannels, setPostsCache, setRegions, HIDDEN_POST_IDS, loadHiddenPostIds, CHANNEL_PROFILE_GROUPS, PROFILE_GROUPS, setChannelProfileGroups, setProfileGroups } from './data/store.js';
import { setupPostTools } from './features/news/post-tools.js';
import { NEWS_CURRENT_TAB, NEWS_TABS, goToNewsTab, setNewsPageTab, setupNewsTabs } from './features/news/news-tabs.js';
import { NEWS_PLATFORM_LABEL } from './ui/platforms.js';
import { NEWS_TOPICS, loadNewsTopics, newsState, populateNewsSourceOptions, renderNewsFeed, renderNewsRegionChips, renderNewsTopicRow, setupNewsFeed } from './features/news/news-feed.js';
import { loadNewsPickEdits, setupNewsPicks } from './features/news/picks.js';
import { DOSSIER_TOPICS, DOSSIER_TOPIC_POSTS, loadDossierTopicPosts, loadDossierTopics, renderDossierTab, setupDossierTab } from './features/news/dossier.js';
import { loadNewsAiInsights } from './features/news/insights.js';
import { NEWSLETTER_POSTS, loadNewsletterPosts, setNewsletterPosts, setupNewsletter } from './features/news/newsletter.js';
import { loadNewspapers, renderNewspaperDateTabs, renderNewspapers, setupNewspapers } from './features/news/newspapers.js';
import { renderNewsAnalytics, setupNewsAnalytics } from './features/news/analytics.js';
import { ARCHIVE_REPORTS, deleteArchiveReport, loadArchiveReports, renderArchiveReports } from './features/people/archive.js';
import { populatePostFilters, postsGroupFilter, postsSelectedChannels, postsTime, renderPosts, setupPostsFeed } from './features/cyberspace/posts-feed.js';
import { goToPeopleTab, setupPeopleTabs, syncPeopleTab } from './features/people/people-tabs.js';
import { closePfChannel, openPfChannel, pfSelectedChannel, placePfPanel, populatePoliticalFiguresSourceOptions, renderPoliticalFigures, setupProfileGallery, resetPfExtraCache } from './features/people/profile-gallery.js';
import { POS_TAB, POS_TAB_INFO, POS_TAB_LABEL, goToPosTab, setPosTab, setupPositionsTabs } from './features/positions/positions.js';
import { renderChannelCards, renderCyberPeopleGrid, setupCyberPeople } from './features/cyberspace/cyber-people.js';
import { setupCardTextTap } from './ui/card-text-tap.js';
import { setupCyberTabs } from './features/cyberspace/cyber-tabs.js';
import { ANNOUNCEMENTS, ANN_TABLE_MISSING, annIsLive, annItemHtml, loadAnnouncements, renderAnnBar, setupInstallPrompt } from './features/announcements/ann-bar.js';
import { HAWZA_TAB, HAWZA_TAB_INFO, goToHawzaTab, setHawzaTab, setupHawzaTabs } from './features/hawza/hawza-tabs.js';
import { setupHawzaAbout } from './features/hawza/hawza-about.js';
import { maybeShowIntro, setupIntro } from './features/home/intro.js';
import { LAWS_SOURCES, lawsSourceOf, openLaws, renderLaws, resetLawsCache, setupLaws } from './features/laws/laws.js';
import { layoutOrbit2, setupHome } from './features/home/home.js';
import { MAGAZINES, deleteMagazine, loadMagazines, renderMagazines } from './features/reports/magazines.js';
import { renderDashHeroStats } from './features/home/hero-stats.js';
import { SCHOOL_REPORTS, deleteSchoolReport, loadSchoolReports, renderSchoolReports, schoolReportSrc, setupSchoolReports } from './features/schools/school-reports.js';
import { setupDatebar } from './features/home/datebar.js';
import { SITE_VIS_ITEMS } from './data/site-sections.js';

// ⚠️ پل موقت: دستگیره‌های درون HTML (onclick="…" در صفحه و در HTMLهایی که همین فایل می‌سازه)
// فقط تابع سراسری رو می‌بینن، ولی تابع‌های یه module سراسری نیستن. این فهرست تا جایگزینی همه‌ی
// onclickها با event delegation (مرحله‌های ۴ تا ۷) می‌مونه و هر بار کوچیک‌تر می‌شه؛ تابع تازه
// اینجا اضافه نکن — به‌جاش addEventListener. tests/unit/inline-handlers.test.js هم‌خوانیش رو می‌سنجه.
Object.assign(window, {
  addCrawlSuggestion, addDossierManualPost, autoMatchDossierTopic, bulkChanBack, bulkChanPreview,
  bulkChanSave, changePassword, closeUserEditor, copyJobLog, deleteCrawlSite, deleteDossierTopic,
  deleteDossierTopicPost, downloadBackup, editDossierTopicKeywords, exportPosts, exportReport,
  goToUploadsTab, handleLogin, hidePost, ignoreCrawlSuggestion, logout, openBulkChan,
  openSiteSettingsPanel, openUserEditor, otpBack, otpChooseSms, otpResend, otpShow, otpSubmit,
  publishAnnouncement, renderDossierTopicAdminList, renderSystemStatus, retryLoadAll, retryMaintenance,
  saveAlertSettings, saveCrawlSite, saveDossierTopicKeywords, saveHiddenSections, saveMaintenance,
  saveMediaRetention, saveSmsConfig, saveUser, saveViewerPasswordLogin, searchDossierManualAdd,
  sendSmsTest, setUploadsTab, submitFeedback, switchSection, testAlertEmail, toggleCrawlSite,
  toggleDossierTopicActive, toggleDossierTopicPostExcluded, togglePasswordVisibility, unhidePost,
  unlockLogin, usrDownload
});

// خطاهای مرورگر: جای فعلی کاربر و دستگاه برای گزارش (core/error-reporting.js)
setErrorContext({ place: ()=>navCurrentState().key, device: ()=>sysDeviceLabel(navigator.userAgent) });

setupAmbient();

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


setupHome();

// منوها: رفتن از دکمه‌های data-nav (منوی بخش‌ها) و data-admin-go (منوی مدیریت)
function navMenuGo(key){
  const [s, t] = key.split('/');
  if(s === 'overview') return goToNewsTab(t || 'analytics');
  if(s === 'people') return goToPeopleTab(t || 'figures');
  if(s === 'hawza') return goToHawzaTab(t || 'news');
  if(s === 'positions' && t) return goToPosTab(t);
  switchSection(s);   // posts/feed و public/trends هم: خودِ بخش (با تب آخر/پیش‌فرض)
}
function adminMenuGo(key){
  if(key === 'users') openUsersSection();
  else switchSection(key);
}
setupMenus({ current: navCurrentState, navigate: navMenuGo, adminGo: adminMenuGo });

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

setupIntro();

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
bindModal('delete-channel-modal', closeDeleteChannelModal);
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

export function switchSection(key){
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

setupTabBars();

setupHawzaTabs();

setupPositionsTabs();

setupLaws();

setupHawzaAbout();

let FEEDBACK_LIST = [];     // {id, name, message, created_at} — فقط با ورود مدیر به تب «نظرات کاربران» لود می‌شه
let NOTIFY_SUBSCRIBERS = []; // {id, phone, created_at, notified_at} — فقط با ورود مدیر به تب «خروجی‌گیری» لود می‌شه

function chAvatar(id){ return `<span class="avatar">${escHtml(chInitials(id))}</span>`; }

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
export function mediaRetentionHours(){
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
bindModal('job-log-modal', closeJobLog);
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


export function updateMobileFilterBadges(){
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

setupNewsFeed();
setupPostTools();
setupNewsTabs();

setupNewspapers();
setupDossierTab();

async function loadChannels(){
  const r = await api('/channels?select=*&order=added_at.desc');
  setChannels(r.ok ? await r.json() : []);
}
async function loadCategories(){
  const r = await api('/categories?select=*&order=name.asc');
  setCategories(r.ok ? await r.json() : []);
}
async function loadRegions(){
  const r = await api('/regions?select=*&order=id.asc');
  setRegions(r.ok ? await r.json() : []);
}
async function loadProfileGroups(){
  const r = await api('/profile_groups?select=*&order=sort_order.asc,id.asc');
  setProfileGroups(r.ok ? await r.json() : []);
}
async function loadChannelProfileGroups(){
  const r = await api('/channel_profile_groups?select=id,channel_id,group_id');
  setChannelProfileGroups(r.ok ? await r.json() : []);
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
  setPostsCache(r.ok ? await r.json() : []);
  const [hawzaExtra, claimsExtra] = await Promise.all([hawzaReq, claimsReq]);
  const existingIds = new Set(POSTS_CACHE.map(p=>p.id));
  for(const p of [...hawzaExtra, ...claimsExtra]){
    if(!existingIds.has(p.id)){ POSTS_CACHE.push(p); existingIds.add(p.id); }
  }
  // پست‌های پنهان‌شده (migration_039): بیننده از خودِ دیتابیس نمی‌گیره، مدیر
  // می‌گیره ولی در هیچ فید/تحلیلی نشون داده نمی‌شن (فقط «گزارش فعالیت»)
  setPostsCache(POSTS_CACHE.filter(p=>!p.hidden_at));
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

// ---- نمایش سایت: حالت تعمیر + روشن/خاموش کردن بخش‌ها (migration_042) ----
// جدول site_settings: key='maintenance' → {on, message, until}، key='hidden_sections' →
// آرایه‌ی «بخش» یا «بخش/تب» پنهان از بیننده‌ها. مدیر همه‌چیز رو با برچسب «پنهان» می‌بینه.
// این فقط پنهان‌کردن رابطه (داده‌ها با RLS همچنان خواندنی‌ان) — برای «در دست ساخت»/مشکل موقت.
// فهرست بخش‌ها و تب‌ها: SITE_VIS_ITEMS در data/site-sections.js
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
export function visHidden(key){
  if(!key || key === 'dashboard') return false;
  const h = siteHiddenSet(), sec = key.split('/')[0];
  if(h.has(sec) || h.has(key)) return true;
  const it = SITE_VIS_ITEMS.find(x=>x.key === sec);
  return !key.includes('/') && !!it && it.tabs.length > 0 && it.tabs.every(([t])=>h.has(sec + '/' + t));
}
export function viewerHidden(key){ return currentRole !== 'app_admin' && visHidden(key); }
export function firstVisibleTab(sec){
  const it = SITE_VIS_ITEMS.find(x=>x.key === sec);
  const t = it && it.tabs.find(([t])=>!visHidden(sec + '/' + t));
  return t ? t[0] : null;
}
// کنشگری/یادداشت‌ها تب پیش‌فرض دارن که ممکنه پنهان باشه → اولین تب قابل‌مشاهده
export function ensureVisibleTab(sec){
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

setupInstallPrompt();
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
export function renderUploadLists(){
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

setupSchoolReports();

function detectSchoolReportFileType(file){
  const name = (file.name || '').toLowerCase();
  if(/\.pdf$/.test(name)) return 'pdf';
  if(/\.(xlsx|xls|csv)$/.test(name)) return 'excel';
  return 'image';
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

setupCyberTabs();

setupPeopleTabs();

setupCyberPeople();

setupCardTextTap();


setupPostsFeed();

setupProfileGallery();

// ---- analytics ----
const STOPWORDS = new Set(['و','در','به','از','که','این','را','با','است','می','یک','آن','هم','ها','های','برای','تا','هر','خود','ما','یا','او','وی','شد','شده','شود','کرد','کرده','کند','باید','اما','اگر','هست','نیست','بود','بودن','بوده','بودند','بر','مورد','چه','همه','همین','همان','چند','بین','پس','هنوز','حتی','نه','نیز','دیگر','بعد','قبل','دارد','دارند','داشت','روی','زیر','آنها','ولی','پیش','چون','چرا','کجا','کدام','مثل','مانند','شما','تو','من']);

export function topChannelsByCount(list){
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

setupNewsPicks();
setupNewsAnalytics();
setupNewsletter();

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
bindModal('chan-editor-modal', closeChanEditor);


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
bindModal('bulk-chan-modal', closeBulkChan);
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
    resetPfExtraCache(); resetLawsCache();
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
    resetPfExtraCache(); resetLawsCache(); // عضویت بخش‌های تازه عوض شده باشه، داده‌ی جدا دوباره گرفته بشه
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

setupToTop();
setupKeyboardButtons();

setupDocViewer();
setupMediaViewer();
setupMobileFilters();

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
bindModal('pw-modal', closePwModal);
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

setupConfirm();

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

setupDatebar();

// ---- «گزارش فعالیت» (فقط مدیر، migration_039) ----
// سه قسمت: پنهان‌کردن پست (دکمه زیر هر پست برای مدیر + فهرست/بازگرداندن)،
// آمار بازدید (شمارنده‌ی روزانه‌ی هر بخش/تب — فقط عدد، بدون نام یا دستگاه) و
// دفتر تغییرات (admin_audit، پرشده با trigger دیتابیس — از فرانت‌اند قابل دور
// زدن نیست؛ کارهای خودکار گیت‌هاب/Edge Functionها ثبت نمی‌شن). تا وقتی
// migration_039 اجرا نشده، همه‌ی این‌ها بی‌صدا غیرفعال‌ان و بقیه‌ی سایت سالمه.
var ACT_TAB = 'views';
let ACT_HIDDEN = null, ACT_AUDIT = null, ACT_VIEWS = null;
let ACT_VIEWS_DAYS = 30, ACT_VIEWS_ROLE = 'app_viewer', ACT_AUDIT_FILTER = 'all', ACT_AUDIT_SHOW = 50;
const ACT_TAB_INFO = {
  views: 'هر بخش و تب سایت چند بار باز شده، به تفکیک روز. فقط عدد ثبت می‌شود، نه نام یا دستگاه افراد.',
  audit: 'تغییرهایی که از پنل مدیریت انجام شده: چه چیزی، کی و از کدام دستگاه. کارهای خودکار سامانه ثبت نمی‌شوند.',
  hidden: 'پست‌هایی که از دید بیننده‌ها پنهان شده‌اند؛ با «بازگرداندن» دوباره در همه‌ی بخش‌ها دیده می‌شوند.',
};
const ACT_MIGRATION_NOTE = 'برای این بخش، فایل <b>db/migration_039_admin_activity.sql</b> باید یک‌بار در SQL Editor سوپابیس اجرا شود.';

export function postHideBtnHtml(p){
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
  setPostsCache(POSTS_CACHE.filter(p=>p.id !== id));
  setNewsletterPosts(NEWSLETTER_POSTS.filter(np=>np.post_id !== id));
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
    setPostsCache(POSTS_CACHE.concat(rows).sort((a,b)=>String(b.scraped_at||'').localeCompare(String(a.scraped_at||''))));
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
