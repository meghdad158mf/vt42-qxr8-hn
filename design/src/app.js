// بدنه‌ی برنامه — کل اسکریپت قبلی صفحه، حالا یه ES module. جدا شده تا الان: هسته در core/
// (مرحله‌ی ۳، ۵.۳۲.۲) و اجزای رابط در ui/ (مرحله‌ی ۴، ۵.۳۲.۳: پنجره‌ها، پیام/تأیید، منوها، تب‌بارها،
// نمایشگر سند/عکس، صفحه‌بندی…)، داده‌ی مشترک در data/، و عرصه‌ها در features/: اخبار و رویدادها (مرحله‌ی ۵،
// ۵.۳۲.۴–۵)، کنشگری مجازی، یادداشت‌ها و مواضع مراجع و علماء (مرحله‌ی ۶، ۵.۳۲.۶)، درباره حوزه،
// برنامه مدارس، بسته تحلیلی، اطلاعیه‌ها و صفحه‌ی نخست (مرحله‌ی ۷، ۵.۳۲.۷)، و بخش‌های مدیریت در admin/
// (مرحله‌ی ۸، ۵.۳۲.۸–۹) که بسته‌ی جدایی‌ه و فقط برای مدیر با loadAdmin() بار می‌شه. اینجا مونده: ورود،
// ناوبری و بارگذاری داده — CLAUDE.md، «ماژولار کردن».
import { SUPABASE_URL, SUPABASE_ANON_KEY, APP_VERSION } from './core/config.js';
import { authToken, currentRole, saveSession, clearSession } from './core/session.js';
import { api, SESSION_EXPIRED, resetSessionExpired } from './core/api.js';
import { setErrorContext } from './core/error-reporting.js';
import { escHtml, toFaDigits, faNum, faDigitsToLatin } from './core/text.js';
import { nidValid } from './core/validate.js';
import { navMark, navRestoring, startRouter, restoreScrollY } from './core/router.js';
import { setupAmbient } from './ui/ambient.js';
import { showToast } from './ui/toast.js';
import { setupConfirm } from './ui/confirm.js';
import { setupMenus, closeNavMenu, closeAdminMenu } from './ui/menus.js';
import { setupTabBars, updateTabInk, restoreLastTab, peekTabBar } from './ui/tabs.js';
import { setupToTop } from './ui/scroll.js';
import { setupKeyboardButtons } from './ui/keyboard.js';
import { setupMediaViewer } from './ui/media-viewer.js';
import { setupDocViewer } from './ui/doc-viewer.js';
import { setMobileFilterCount, setupMobileFilters } from './ui/mobile-filters.js';
import { POSTS_CACHE, chInitials, setCategories, setChannels, setPostsCache, setRegions, loadHiddenPostIds, setChannelProfileGroups, setProfileGroups } from './data/store.js';
import { setupPostTools } from './features/news/post-tools.js';
import { NEWS_CURRENT_TAB, NEWS_TABS, goToNewsTab, setNewsPageTab, setupNewsTabs } from './features/news/news-tabs.js';
import { loadNewsTopics, newsState, populateNewsSourceOptions, renderNewsFeed, renderNewsRegionChips, renderNewsTopicRow, setupNewsFeed } from './features/news/news-feed.js';
import { loadNewsPickEdits, setupNewsPicks } from './features/news/picks.js';
import { loadDossierTopicPosts, loadDossierTopics, renderDossierTab, setupDossierTab } from './features/news/dossier.js';
import { loadNewsAiInsights } from './features/news/insights.js';
import { loadNewsletterPosts, setupNewsletter } from './features/news/newsletter.js';
import { loadNewspapers, renderNewspapers, setupNewspapers } from './features/news/newspapers.js';
import { renderNewsAnalytics, setupNewsAnalytics } from './features/news/analytics.js';
import { loadArchiveReports, renderArchiveReports } from './features/people/archive.js';
import { populatePostFilters, postsGroupFilter, postsSelectedChannels, postsTime, renderPosts, setupPostsFeed } from './features/cyberspace/posts-feed.js';
import { goToPeopleTab, setupPeopleTabs, syncPeopleTab } from './features/people/people-tabs.js';
import { closePfChannel, openPfChannel, pfSelectedChannel, placePfPanel, populatePoliticalFiguresSourceOptions, renderPoliticalFigures, setupProfileGallery } from './features/people/profile-gallery.js';
import { POS_TAB, POS_TAB_INFO, goToPosTab, setPosTab, setupPositionsTabs } from './features/positions/positions.js';
import { renderChannelCards, renderCyberPeopleGrid, setupCyberPeople } from './features/cyberspace/cyber-people.js';
import { setupCardTextTap } from './ui/card-text-tap.js';
import { setupCyberTabs } from './features/cyberspace/cyber-tabs.js';
import { loadAnnouncements, renderAnnBar, setupInstallPrompt } from './features/announcements/ann-bar.js';
import { HAWZA_TAB, HAWZA_TAB_INFO, goToHawzaTab, setHawzaTab, setupHawzaTabs } from './features/hawza/hawza-tabs.js';
import { setupHawzaAbout } from './features/hawza/hawza-about.js';
import { maybeShowIntro, setupIntro } from './features/home/intro.js';
import { setupHome } from './features/home/home.js';
import { loadMagazines, renderMagazines } from './features/reports/magazines.js';
import { renderDashHeroStats } from './features/home/hero-stats.js';
import { loadSchoolReports, renderSchoolReports, setupSchoolReports } from './features/schools/school-reports.js';
import { setupDatebar } from './features/home/datebar.js';
import { SITE_VIS_ITEMS } from './data/site-sections.js';
import { MAINT_DEFAULT_MSG, SITE_SETTINGS, loadSiteSettings, maintOn, siteHiddenSet } from './data/site-settings.js';
import { sysDeviceLabel } from './core/device.js';
import { TITLES } from './data/section-titles.js';
import { admin, setAdmin } from './core/admin-hooks.js';
import { setupNoContextMenu } from './ui/no-context-menu.js';


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
// بسته‌ی جدای مدیریت (admin/admin.js، مرحله‌ی ۸ب): فقط برای مدیر و فقط یک‌بار در هر زبانه بار می‌شه
let ADMIN_LOADING = null;
function loadAdmin(){
  if(!ADMIN_LOADING){
    ADMIN_LOADING = import('./admin/admin.js').then(m=>{ setAdmin(m); return m; }, e=>{
      ADMIN_LOADING = null;
      console.error('admin bundle failed', e);
      showToast('بخش مدیریت بارگذاری نشد؛ اتصال را بررسی و صفحه را دوباره باز کنید.');
    });
  }
  return ADMIN_LOADING;
}
// بارگذاری اطلاعات بعد از ورود؛ اگه شکست خورد، به‌جای ماندن بی‌صدا روی صفحه‌ی
// ورود، علتش (نشست منقضی / قطع اتصال) رو می‌گه
async function loadAllAndEnter(){
  resetSessionExpired();
  try{
    if(currentRole === 'app_admin') await loadAdmin();
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
    admin()?.startAlerts();
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
document.getElementById('login-retry-btn').addEventListener('click', ()=>retryLoadAll());


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
  admin()?.stopAlerts();
  clearInterval(SITE_POLL_TIMER);
  try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){}
  goLogin();
  loadLoginMaintNotice();
}
document.querySelectorAll('[data-logout]').forEach(b=>b.addEventListener('click', ()=>logout()));


setupHome();
// کارت‌های عرصه‌ی صفحه‌ی نخست و «مشاهده‌ی همه‌ی شماره‌ها»: data-go = بخش مقصد
document.querySelectorAll('[data-go]').forEach(el=>el.addEventListener('click', ()=>switchSection(el.dataset.go)));
// نام سامانه در نوار بالا = صفحه‌ی نخست
const topbarBrand = document.querySelector('.topbar-brand-text');
topbarBrand.addEventListener('click', ()=>switchSection('dashboard'));
topbarBrand.addEventListener('keydown', e=>{ if(e.key === 'Enter') switchSection('dashboard'); });

// منوها: رفتن از دکمه‌های data-nav (منوی بخش‌ها) و data-admin-go (منوی مدیریت)
function navMenuGo(key){
  const [s, t] = key.split('/');
  if(s === 'overview') return goToNewsTab(t || 'analytics');
  if(s === 'people') return goToPeopleTab(t || 'figures');
  if(s === 'hawza') return goToHawzaTab(t || 'news');
  if(s === 'positions' && t) return goToPosTab(t);
  switchSection(s);   // posts/feed هم: خودِ بخش (با تب آخر/پیش‌فرض)
}
function adminMenuGo(key){
  const a = admin();
  if(key === 'users' && a) a.openUsersSection();
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
document.getElementById('otp-form').addEventListener('submit', e=>{ e.preventDefault(); otpSubmit(); });
document.getElementById('otp-choose-sms').addEventListener('click', ()=>otpChooseSms());
document.getElementById('otp-to-pass').addEventListener('click', ()=>otpShow('pass'));
document.querySelectorAll('[data-otp-back]').forEach(b=>b.addEventListener('click', ()=>otpBack()));
document.getElementById('otp-resend').addEventListener('click', ()=>otpResend());
document.getElementById('login-form').addEventListener('submit', e=>{ e.preventDefault(); handleLogin(); });

function togglePasswordVisibility(){
  const pwEl = document.getElementById('login-password');
  const btn = document.getElementById('login-pw-toggle');
  const show = pwEl.type === 'password';
  pwEl.type = show ? 'text' : 'password';
  btn.setAttribute('aria-label', show ? 'پنهان‌کردن رمز عبور' : 'نمایش رمز عبور');
}
document.getElementById('login-pw-toggle').addEventListener('click', ()=>togglePasswordVisibility());

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


function show(id){ document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); document.getElementById(id).classList.add('active'); }
function goLogin(){ document.documentElement.classList.remove('has-session'); show('view-login'); focusLoginPassword(); }
function enterDash(sectionKey){
  if(!authToken){ goLogin(); return; }
  show('view-dash'); document.getElementById('view-dash').classList.add('active'); switchSection(sectionKey);
}

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
  admin()?.enterSection(key); // بخش‌های مدیریت (admin/admin.js — فقط وقتی بسته‌ی مدیر بار شده)
  if(key === 'posts') restoreLastTab('posts-page-tabs', 'posts-tab', 'jarian_last_posts_tab');
  if(key === 'people') placePfPanel('people'); // ظرف گالری ممکنه الان توی «مواضع مراجع و علماء» باشه
  if(key === 'people') restoreLastTab('people-page-tabs', 'people-tab', 'jarian_last_people_tab');
  if(key === 'people') syncPeopleTab();
  if(key === 'positions') setPosTab(POS_TAB);
  if(key === 'posts' || key === 'people') ensureVisibleTab(key);
  // بخش تازه دیده‌شده — خط هلویی تب‌هاش بدون انیمیشن سر جاش قرار بگیره
  requestAnimationFrame(()=>document.querySelectorAll('#sec-'+key+' .news-page-tabs').forEach(bar=>updateTabInk(bar, true)));
  peekTabBar(key);
}

setupTabBars();

setupHawzaTabs();

setupPositionsTabs();

setupHawzaAbout();

function chAvatar(id){ return `<span class="avatar">${escHtml(chInitials(id))}</span>`; }









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

export async function loadChannels(){
  const r = await api('/channels?select=*&order=added_at.desc');
  setChannels(r.ok ? await r.json() : []);
}
export async function loadCategories(){
  const r = await api('/categories?select=*&order=name.asc');
  setCategories(r.ok ? await r.json() : []);
}
export async function loadRegions(){
  const r = await api('/regions?select=*&order=id.asc');
  setRegions(r.ok ? await r.json() : []);
}
export async function loadProfileGroups(){
  const r = await api('/profile_groups?select=*&order=sort_order.asc,id.asc');
  setProfileGroups(r.ok ? await r.json() : []);
}
export async function loadChannelProfileGroups(){
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
export async function loadPosts(){
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
  admin()?.renderAfterLoad();
  renderNewsRegionChips();
  renderNewsTopicRow();
  renderMagazines();
  renderArchiveReports();
  renderNewspapers();
  populateNewsSourceOptions();
  renderNewsFeed();
  renderSchoolReports();
  applySiteVisibility();
}

var SITE_POLL_TIMER = null;
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
  return out;
}
export function applySiteVisibility(){
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
  // قوس «مدار» برای دقیقاً شش کارت جای‌گذاری شده — با کارت پنهان کنار می‌ره
  const grid = document.querySelector('.domain-grid');
  if(grid) grid.classList.toggle('vis-partial', !admin && !!grid.querySelector('.domain-card.vis-off'));
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
document.getElementById('maint-retry-btn').addEventListener('click', ()=>retryMaintenance());
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


setupInstallPrompt();


setupSchoolReports();


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

export function wordFrequency(list, limit){
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








setupToTop();
setupKeyboardButtons();

setupDocViewer();
setupMediaViewer();
setupNoContextMenu();
setupMobileFilters();

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
document.querySelector('.feedback-form').addEventListener('submit', e=>submitFeedback(e));



setupConfirm();

// ---- PWA: ثبت service worker (فقط روی https/localhost؛ خطاش سایت رو متوقف نمی‌کنه) ----
if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')){
  window.addEventListener('load', ()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); });
}

setupDatebar();

export function postHideBtnHtml(p){
  return currentRole === 'app_admin' ? `<button type="button" class="post-hide-btn" data-hide-post="${Number(p.id)}" title="این پست برای همه‌ی بیننده‌ها پنهان می‌شود"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c5 0 9 4.5 10 7a13.6 13.6 0 0 1-2.9 3.9M6.6 6.6C4.3 8 2.7 10.1 2 12c1 2.5 5 7 10 7 1.9 0 3.6-.6 5.1-1.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>پنهان کردن</button>` : '';
}
export function rerenderPostViews(){
  [renderNewsFeed, renderPosts, renderPoliticalFigures, renderDossierTab].forEach(fn=>{ try{ fn(); }catch(e){ console.error(e); } });
  if(document.getElementById('sec-overview').classList.contains('active') && NEWS_CURRENT_TAB === 'analytics'){ try{ renderNewsAnalytics(); }catch(e){ console.error(e); } }
}


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
  else if(s === 'uploads' || s === 'activity') t = admin()?.navTab(s) ?? null;
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
  if(st.s === 'uploads' || st.s === 'activity') admin()?.applyNav(st);
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
  const enterNow = ()=>{
    navRestoring();
    // تب لینک مستقیم (مثلاً #people/orgs) همین‌جا اعمال می‌شه — وگرنه navFlush بعد از
    // switchSection آدرس رو با تب پیش‌فرض جایگزین می‌کرد و loadAllAndEnter دیگه تب لینک رو نمی‌دید
    const bootSt = navParse(location.hash);
    try{ show('view-dash'); switchSection(lastSectionKey()); if(bootSt) navApply(bootSt); }catch(e){ console.error(e); }
    document.documentElement.classList.remove('has-session');
    loadAllAndEnter();
  };
  // مدیر: اول بسته‌ی مدیریت (تا بخش مدیریتیِ لینک/رفرش، مثل #uploads/archive، با تب خودش باز بشه)
  if(currentRole === 'app_admin') loadAdmin().then(enterNow, enterNow);
  else enterNow();
}else{
  focusLoginPassword();
  loadLoginMaintNotice();
}
