// تب‌بارها (.news-page-tabs در همه‌ی بخش‌ها): آیکون، خط هلویی لغزان، سایه‌ی لبه و فلش‌های گوشی، چسبان بودن
import { TAB_ICONS } from './icons.js';
import { lsGet } from '../core/local-store.js';

export function updateTabInk(bar, noAnim){
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
export function setupTabBars(){
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
export function restoreLastTab(barId, dataKey, storeKey){
  const want = lsGet(storeKey, null);
  const bar = document.getElementById(barId);
  if(!want || !bar) return;
  const btn = bar.querySelector(`button[data-${dataKey}="${want}"]`);
  if(btn && !btn.disabled && !btn.classList.contains('active')) btn.click();
}
// روی گوشی فقط ۳ تب از ۷ تب دیده می‌شه — اولین بار در هر نشست، نوار تب‌ها یه تکون کوچیک
// به سمت تب‌های پنهان می‌خوره تا کاربر بفهمه بیشتر هست
export function peekTabBar(key){
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

