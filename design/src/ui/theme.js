// نمای روشن/تیره (۵.۳۴.۰) + «خودکار» (۵.۳۵.۰): دکمه‌ی نوار بالا فهرست کوچکی با سه گزینه باز می‌کند؛
// انتخاب در همین مرورگر می‌ماند (jarian_theme = light | dark | auto). «خودکار» از تنظیم دستگاه
// (prefers-color-scheme) پیروی می‌کند و با عوض شدن آن هم‌زمان عوض می‌شود. اعمال اولیه پیش از رسم
// صفحه با اسکریپت کوچک <head> انجام می‌شود تا رنگ صفحه یک لحظه هم نپرد.

const KEY = 'jarian_theme';
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;

function storedPref(){
  // ۵.۳۹.۰: پیش‌فرض روشن (زمینه‌ی مریم‌گلی)؛ تیره فقط با انتخاب کاربر
  try{ const v = localStorage.getItem(KEY); return v === 'dark' || v === 'auto' ? v : 'light'; }catch(e){ return 'light'; }
}
export function currentTheme(){
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}
function resolve(pref){ return pref === 'auto' ? (mq && mq.matches ? 'light' : 'dark') : pref; }

function applyPref(pref){
  const t = resolve(pref);
  if (t === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  const btn = document.getElementById('theme-btn');
  if (btn){
    const label = 'نمای سایت: ' + (pref === 'auto' ? 'خودکار' : pref === 'light' ? 'روشن' : 'تیره');
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.setAttribute('aria-pressed', t === 'light' ? 'true' : 'false');
    btn.classList.toggle('is-auto', pref === 'auto');
  }
  document.querySelectorAll('#theme-menu [data-theme-set]').forEach(b => b.setAttribute('aria-checked', b.dataset.themeSet === pref ? 'true' : 'false'));
}

export function setupThemeToggle(){
  const btn = document.getElementById('theme-btn');
  const menu = document.getElementById('theme-menu');
  applyPref(storedPref());
  const close = () => { if(menu){ menu.hidden = true; btn?.setAttribute('aria-expanded', 'false'); } };
  btn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if(!menu) return;
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
  });
  menu?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-set]'); if(!b) return;
    const pref = b.dataset.themeSet;
    try{ localStorage.setItem(KEY, pref); }catch(err){ /* storage در دسترس نیست */ }
    applyPref(pref);
    close();
  });
  document.addEventListener('click', (e) => { if(menu && !menu.hidden && !menu.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if(e.key === 'Escape') close(); });
  // «خودکار»: دستگاه شب/روز را عوض کرد → سایت هم
  mq?.addEventListener?.('change', () => { if(storedPref() === 'auto') applyPref('auto'); });
}
