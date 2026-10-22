// نمای روشن/تیره (۵.۳۴.۰): دکمه‌ی نوار بالا؛ انتخاب در همین مرورگر می‌ماند (jarian_theme).
// اعمال اولیه پیش از رسم صفحه با اسکریپت کوچک <head> انجام می‌شود تا رنگ صفحه یک لحظه هم نپرد.

const KEY = 'jarian_theme';

export function currentTheme(){
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function applyTheme(t){
  if (t === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  const btn = document.getElementById('theme-btn');
  if (btn){
    const label = t === 'light' ? 'نمای تیره' : 'نمای روشن';
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.setAttribute('aria-pressed', t === 'light' ? 'true' : 'false');
  }
}

export function setupThemeToggle(){
  applyTheme(currentTheme());
  document.getElementById('theme-btn')?.addEventListener('click', () => {
    const t = currentTheme() === 'light' ? 'dark' : 'light';
    applyTheme(t);
    try{ localStorage.setItem(KEY, t); }catch(e){ /* storage در دسترس نیست */ }
  });
}
