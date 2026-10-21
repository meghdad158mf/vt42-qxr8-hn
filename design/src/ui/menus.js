// منوی «بخش‌ها» و منوی «مدیریت» نوار بالا
// هر دکمه‌ی منوی بخش‌ها data-nav="بخش" یا "بخش/تب" داره (برای پررنگ کردن جای فعلی و رفتن)،
// هر دکمه‌ی منوی مدیریت data-admin-go="بخش". رفتن واقعی با hookهای setupMenus (app.js).

const HOOKS = { current: ()=>({}), navigate: ()=>{}, adminGo: ()=>{} };
const adminLinks = document.getElementById('admin-menu');
const adminMenuBtn = document.getElementById('admin-menu-btn');
function toggleAdminMenu(){
  const open = adminLinks.classList.toggle('open');
  adminMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
}
export function closeAdminMenu(){
  adminLinks.classList.remove('open');
  adminMenuBtn.setAttribute('aria-expanded', 'false');
}
const navMenuEl = document.getElementById('nav-menu');
const navMenuBtn = document.getElementById('nav-menu-btn');
// پررنگ‌کردن جای فعلی کاربر در منو — فقط موقع باز شدن منو حساب می‌شه
function updateNavMenuCurrent(){
  const st = HOOKS.current();
  const t = st.t || (st.s === 'hawza' ? 'news' : null);
  const exact = t ? st.s + '/' + t : null;
  let hasExact = false;
  navMenuEl.querySelectorAll('button[data-nav]').forEach(b=>{
    const isExact = b.dataset.nav === exact;
    if(isExact) hasExact = true;
    b.classList.toggle('is-current', isExact);
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
export function closeNavMenu(){
  navMenuEl.classList.remove('open');
  navMenuBtn.setAttribute('aria-expanded', 'false');
}
// current() → حالت فعلی { s, t }؛ navigate(کلید data-nav)؛ adminGo(کلید data-admin-go)
export function setupMenus(hooks){
  Object.assign(HOOKS, hooks);
  navMenuBtn.addEventListener('click', toggleNavMenu);
  adminMenuBtn.addEventListener('click', toggleAdminMenu);
  navMenuEl.addEventListener('click', e=>{
    e.stopPropagation();   // کلیک داخل منو، کلیک «بیرون» حساب نشه
    const b = e.target.closest('button[data-nav]');
    if(b){ HOOKS.navigate(b.dataset.nav); closeNavMenu(); }
  });
  adminLinks.addEventListener('click', e=>{
    const b = e.target.closest('button[data-admin-go]');
    if(b){ HOOKS.adminGo(b.dataset.adminGo); closeAdminMenu(); }
  });
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
}

