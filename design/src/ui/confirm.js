// پنجره‌ی تأیید یکسان سایت (#ui-confirm-modal، ۵.۲۱.۰) به‌جای confirm() مرورگر — Promise<boolean>. خط اول پیام = تیتر، بقیه = توضیح.
// دکمه‌ی تأیید برای «حذف»/«پنهان» قرمز و با همون فعل؛ «برگشت» گوشی/Esc = انصراف
import { bindModal } from './modal.js';

let UI_CONFIRM_RESOLVE = null;
export function uiConfirm(msg){
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
export function uiConfirmClose(v){
  document.getElementById('ui-confirm-modal').classList.remove('active');
  const r = UI_CONFIRM_RESOLVE; UI_CONFIRM_RESOLVE = null;
  if(r) r(v);
}
export function setupConfirm(){
  bindModal('ui-confirm-modal', ()=>uiConfirmClose(false));
  document.getElementById('ui-confirm-ok').addEventListener('click', ()=>uiConfirmClose(true));
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape' && UI_CONFIRM_RESOLVE) uiConfirmClose(false); });
}

