// تغییر نام درجا (موضوع، منطقه، گروه) و بررسی موفقیت PATCH
import { api } from '../../core/api.js';
import { showToast } from '../../ui/toast.js';

// تغییر نام درجا برای کارت‌های موضوع/منطقه/گروه: کلیک روی نام → کادر
// ویرایش؛ Enter یا خروج از کادر ذخیره می‌کند، Esc لغو
export function makeRenamable(nameEl, current, save){
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
export async function patchOk(path, body){
  const r = await api(path, {method:'PATCH', body: JSON.stringify(body)});
  if(!r.ok) throw new Error('patch');
}

