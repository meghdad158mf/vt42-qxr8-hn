// معرفی بار اول (۵.۲۱.۰، #intro-modal): سه مرحله، فقط بیننده و یک‌بار در هر مرورگر؛ پیوند «آشنایی با سامانه» در فوتر
import { bindModal } from '../../ui/modal.js';
import { currentRole } from '../../core/session.js';
import { goToNewsTab } from '../news/news-tabs.js';

export let INTRO_STEP = 0;
export function introRender(){
  document.querySelectorAll('#intro-modal .intro-step').forEach(el=>{ el.hidden = Number(el.dataset.step) !== INTRO_STEP; });
  document.querySelectorAll('#intro-modal .intro-dots span').forEach((d, i)=>d.classList.toggle('on', i === INTRO_STEP));
  document.getElementById('intro-prev').style.visibility = INTRO_STEP ? 'visible' : 'hidden';
  document.getElementById('intro-next').textContent = INTRO_STEP === 2 ? 'رفتن به «در یک نگاه»' : 'بعدی';
}
export function introGo(d){
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
export function openIntro(){ INTRO_STEP = 0; introRender(); document.getElementById('intro-modal').classList.add('active'); }
export function closeIntro(){
  document.getElementById('intro-modal').classList.remove('active');
  try{ localStorage.setItem('jarian_intro_seen', '1'); }catch(e){}
}
// بار اول بیننده در این مرورگر (مدیر سایت رو می‌شناسه) — نه وقتی پنجره‌ی دیگری بازه
export function maybeShowIntro(){
  if(currentRole === 'app_admin') return;
  try{ if(localStorage.getItem('jarian_intro_seen')) return; }catch(e){ return; }
  setTimeout(()=>{ if(!document.querySelector('.modal-overlay.active') && document.getElementById('view-dash').classList.contains('active')) openIntro(); }, 900);
}
export function setupIntro(){
  bindModal('intro-modal', closeIntro);
  document.getElementById('intro-prev').addEventListener('click', ()=>introGo(-1));
  document.getElementById('intro-next').addEventListener('click', ()=>introGo(1));
  document.querySelectorAll('.app-footer-intro').forEach(b=>b.addEventListener('click', openIntro));
}

