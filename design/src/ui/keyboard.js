// صفحه‌کلید: کارت‌هایی که دکمه‌ی واقعی نیستن (div با role=button)

export function setupKeyboardButtons(){
  // Enter/فاصله روی کارت‌ها و میان‌برهای صفحه‌ی نخست (div/a با role=button) = کلیک
  document.addEventListener('keydown', e=>{
    if(e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target;
    if(el && el.matches && el.matches('.domain-card[role="button"], .pkg-tile[role="button"]')){ e.preventDefault(); el.click(); }
  });
}

