// «تنظیمات بخش‌ها ← نمایش سایت»: حالت تعمیر و بخش‌های پنهان (نوشتن site_settings)
import { api } from '../core/api.js';
import { escHtml, faNum } from '../core/text.js';
import { showToast } from '../ui/toast.js';
import { SITE_SETTINGS, SITE_SETTINGS_MISSING, maintOn, siteHiddenSet } from '../data/site-settings.js';
import { SITE_VIS_ITEMS } from '../data/site-sections.js';
import { uiConfirm } from '../ui/confirm.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { applySiteVisibility, switchSection, visHidden } from '../app.js';

// ---- بخش «نمایش سایت» در تنظیمات (فقط مدیر) ----
export function openSiteSettingsPanel(which){
  switchSection('settings');
  const d = document.getElementById(which === 'maint' ? 'ss-maint-panel' : 'ss-vis-panel');
  d.open = true;
  setTimeout(()=>d.scrollIntoView({ behavior:'smooth', block:'start' }), 60);
}
export function renderSiteSettingsAdmin(){
  document.getElementById('ss-missing').hidden = !SITE_SETTINGS_MISSING;
  ['ss-maint-save', 'ss-vis-save'].forEach(id=>{ document.getElementById(id).disabled = SITE_SETTINGS_MISSING; });
  const m = SITE_SETTINGS.maintenance || {};
  const on = document.getElementById('ss-maint-on');
  on.checked = !!m.on;
  document.getElementById('ss-maint-box').classList.toggle('on', !!m.on);
  document.getElementById('ss-maint-msg').value = m.message || '';
  document.getElementById('ss-maint-until').value = m.until || '';
  updateMaintCounter();
  document.getElementById('ss-maint-sum').textContent = m.on ? 'روشن است — سایت برای بیننده‌ها بسته است' : 'خاموش — سایت برای همه باز است';
  document.getElementById('ss-maint-sum').classList.toggle('ss-sum-on', !!m.on);
  const h = siteHiddenSet();
  document.getElementById('ss-vis-list').innerHTML = SITE_VIS_ITEMS.map(it=>{
    const secOn = !h.has(it.key);
    return `<div class="ce-section ${secOn ? 'on' : ''}" data-ss-sec="${it.key}">
      <label class="ce-section-toggle"><input type="checkbox" data-ss="${it.key}" ${secOn ? 'checked' : ''}/>
        <span><b>${escHtml(it.name)}</b><span>${it.tabs.length ? 'تیک تب‌هایی را که نباید دیده شوند بردارید.' : 'این بخش تب ندارد.'}</span></span></label>
      ${it.tabs.length ? `<div class="ce-section-extra">${it.tabs.map(([t, n])=>`<label class="ce-check"><input type="checkbox" data-ss="${it.key}/${t}" ${h.has(it.key + '/' + t) ? '' : 'checked'}/>${escHtml(n)}</label>`).join('')}</div>` : ''}
    </div>`;
  }).join('');
  const n = SITE_VIS_ITEMS.filter(it=>visHidden(it.key)).length + SITE_VIS_ITEMS.reduce((a, it)=>a + (visHidden(it.key) ? 0 : it.tabs.filter(([t])=>h.has(it.key + '/' + t)).length), 0);
  document.getElementById('ss-vis-sum').textContent = n ? faNum(n) + ' بخش یا تب برای بیننده‌ها پنهان است' : 'همه‌ی بخش‌ها برای بیننده‌ها نمایش داده می‌شوند';
  document.getElementById('ss-vis-sum').classList.toggle('ss-sum-on', n > 0);
}
export function updateMaintCounter(){
  document.getElementById('ss-maint-counter').textContent = faNum(document.getElementById('ss-maint-msg').value.length) + ' / ۲۰۰';
}
export async function saveSiteSetting(key, value){
  const r = await api('/site_settings?key=eq.' + key, { method:'PATCH', headers:{ Prefer:'return=representation' }, body: JSON.stringify({ value, updated_at: new Date().toISOString() }) });
  if(!r.ok) throw new Error('site_settings ' + r.status);
  if(!(await r.json()).length){
    const r2 = await api('/site_settings', { method:'POST', body: JSON.stringify({ key, value }) });
    if(!r2.ok) throw new Error('site_settings insert ' + r2.status);
  }
  SITE_SETTINGS[key] = value;
}
export async function saveMaintenance(){
  const value = {
    on: document.getElementById('ss-maint-on').checked,
    message: document.getElementById('ss-maint-msg').value.trim().slice(0, 200),
    until: document.getElementById('ss-maint-until').value.trim().slice(0, 60),
  };
  const was = maintOn();
  if(value.on && !was && !await uiConfirm('روشن کردن حالت تعمیر\nبیننده‌ها تا وقتی آن را خاموش کنید، به‌جای سایت فقط پیام به‌روزرسانی را می‌بینند. شما به‌عنوان مدیر همچنان وارد می‌شوید.')) return;
  const btn = document.getElementById('ss-maint-save');
  btn.disabled = true;
  try{
    await saveSiteSetting('maintenance', value);
    showToast(value.on ? (was ? 'پیام حالت تعمیر به‌روز شد.' : 'حالت تعمیر روشن شد؛ سایت برای بیننده‌ها بسته است.') : was ? 'حالت تعمیر خاموش شد؛ سایت برای همه باز است.' : 'ذخیره شد.');
  }catch(e){
    console.error(e);
    showToast('ذخیره نشد. اتصال اینترنت را بررسی کنید؛ اگر مشکل ماند، migration_042 را در SQL Editor اجرا کنید.');
    return; // ذخیره نشد: فرم دست نخوره تا متن/انتخاب مدیر از دست نره
  }finally{ btn.disabled = false; }
  renderSiteSettingsAdmin();
  applySiteVisibility();
}
export async function saveHiddenSections(){
  const hidden = [];
  SITE_VIS_ITEMS.forEach(it=>{
    if(!document.querySelector(`#ss-vis-list input[data-ss="${it.key}"]`).checked){ hidden.push(it.key); return; }
    it.tabs.forEach(([t])=>{ if(!document.querySelector(`#ss-vis-list input[data-ss="${it.key}/${t}"]`).checked) hidden.push(it.key + '/' + t); });
  });
  const btn = document.getElementById('ss-vis-save');
  btn.disabled = true;
  try{
    await saveSiteSetting('hidden_sections', hidden);
    showToast(hidden.length ? 'ذخیره شد؛ ' + faNum(hidden.length) + ' مورد برای بیننده‌ها پنهان است.' : 'ذخیره شد؛ همه‌ی بخش‌ها برای بیننده‌ها نمایش داده می‌شوند.');
  }catch(e){
    console.error(e);
    showToast('ذخیره نشد. اتصال اینترنت را بررسی کنید؛ اگر مشکل ماند، migration_042 را در SQL Editor اجرا کنید.');
    return; // ذخیره نشد: فرم دست نخوره تا متن/انتخاب مدیر از دست نره
  }finally{ btn.disabled = false; }
  renderSiteSettingsAdmin();
  applySiteVisibility();
}
export function setupSiteSettingsAdmin(){
  document.getElementById('maint-admin-open').addEventListener('click', ()=>openSiteSettingsPanel('maint'));
  document.getElementById('ss-maint-save').addEventListener('click', ()=>saveMaintenance());
  document.getElementById('ss-vis-save').addEventListener('click', ()=>saveHiddenSections());
  document.getElementById('ss-maint-msg').addEventListener('input', updateMaintCounter);
  document.getElementById('ss-maint-on').addEventListener('change', e=>document.getElementById('ss-maint-box').classList.toggle('on', e.target.checked));
  document.getElementById('ss-vis-list').addEventListener('change', e=>{
    const inp = e.target.closest('input[data-ss]'); if(!inp || inp.dataset.ss.includes('/')) return;
    inp.closest('.ce-section').classList.toggle('on', inp.checked);
  });
}

