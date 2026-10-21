// کارت‌های شناور اطلاعیه (#ann-bar، announcements — migration_036) + دعوت به نصب روی گوشی؛ درج اطلاعیه‌ی مدیر در app.js
import { api } from '../../core/api.js';
import { authToken } from '../../core/session.js';
import { escHtml } from '../../core/text.js';
import { updateToTop } from '../../ui/scroll.js';

// ---- «اطلاعیه برای کاربران» (migration_036) ----
// نوار بالای همه‌ی صفحه‌ها (#ann-bar). «عادی»: کاربر می‌بنده و دیگه نمی‌بینه
// (localStorage)؛ «مهم»: بستن فقط تا ورود بعدی (sessionStorage). بیننده با RLS فقط
// فعالِ منقضی‌نشده رو می‌گیره؛ مدیر همه رو (فهرست مدیریت) و فیلتر همین‌جا انجام می‌شه.
// جدول هنوز ساخته نشده (۴۰۴/۴۰۰) → بی‌صدا هیچی نشون نده؛ صفحه‌ی مدیر راهنمای migration.
export let ANNOUNCEMENTS = [];
export let ANN_TABLE_MISSING = false;
export async function loadAnnouncements(){
  try{
    const r = await api('/announcements?select=*&order=created_at.desc&limit=50');
    ANN_TABLE_MISSING = r.status === 404 || r.status === 400;
    ANNOUNCEMENTS = r.ok ? await r.json() : [];
  }catch(e){ ANNOUNCEMENTS = []; }
}
export const annIsLive = a => a.active && (!a.expires_at || new Date(a.expires_at).getTime() > Date.now());
export const ANN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1zM15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13"/></svg>';
export function annItemHtml(a, closable){
  const imp = a.level === 'important';
  return `<div class="ann-item ${imp ? 'important' : 'info'}" data-ann="${a.id || ''}" role="status"><span class="ann-ic">${ANN_ICON}</span><span class="ann-body"><b>${imp ? 'اطلاعیه‌ی مهم' : 'اطلاعیه'}</b><span class="ann-text">${escHtml(a.message)}</span></span>${closable ? '<button type="button" class="ann-close" aria-label="بستن اطلاعیه">✕</button>' : ''}</div>`;
}
export function annDismissed(){
  let a = [], b = [];
  try{ a = JSON.parse(localStorage.getItem('jarian_ann_dismissed') || '[]'); }catch(e){}
  try{ b = JSON.parse(sessionStorage.getItem('jarian_ann_dismissed_s') || '[]'); }catch(e){}
  return new Set([...a, ...b]);
}
export function renderAnnBar(){
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
export let DEFERRED_INSTALL = null;
export function isIOSDevice(){ return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
export function renderInstallCard(){
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
export function setupInstallPrompt(){
  window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); DEFERRED_INSTALL = e; renderInstallCard(); });
  window.addEventListener('appinstalled', ()=>{ DEFERRED_INSTALL = null; try{ localStorage.setItem('jarian_install_dismissed', '1'); }catch(e){} renderInstallCard(); });
}

