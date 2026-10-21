// «تنظیمات بخش‌ها ← گروه‌های چهره/سازمان» (profile_groups، migration_033)
import { api } from '../../core/api.js';
import { CHANNEL_PROFILE_GROUPS, PROFILE_GROUPS } from '../../data/store.js';
import { escAttr, toFaDigits } from '../../core/text.js';
import { makeRenamable, patchOk } from './inline-rename.js';
import { renderPoliticalFigures } from '../../features/people/profile-gallery.js';
import { showToast } from '../../ui/toast.js';
import { uiConfirm } from '../../ui/confirm.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { loadChannelProfileGroups, loadProfileGroups } from '../../app.js';

// ---- گروه‌های گالری «یادداشت‌ها» (چهره‌ها / سازمان‌ها) ----
export const PROFILE_GROUP_KIND_LABEL = { figures:'چهره‌ها', orgs:'سازمان‌ها' };
export function renderProfileGroupAdmin(){
  const grid = document.getElementById('profile-group-grid');
  if(!grid) return;
  grid.innerHTML = '';
  PROFILE_GROUPS.forEach(g=>{
    const n = CHANNEL_PROFILE_GROUPS.filter(x=>x.group_id===g.id).length;
    const el=document.createElement('div'); el.className='cat-card';
    el.innerHTML = `<span class="name"><b class="pg-name">${escAttr(g.name)}</b><div style="font-size:11px;font-weight:500;color:var(--text-faint);margin-top:2px;">${PROFILE_GROUP_KIND_LABEL[g.kind]||g.kind} · ${toFaDigits(n)} منبع</div></span><span class="cc-actions"></span>`;
    makeRenamable(el.querySelector('.pg-name'), g.name, async val=>{
      await patchOk('/profile_groups?id=eq.'+g.id, {name: val});
      await loadProfileGroups(); renderProfileGroupAdmin(); renderPoliticalFigures();
    });
    const del=document.createElement('button'); del.className='del-btn'; del.textContent='✕'; del.title='حذف گروه'; del.setAttribute('aria-label','حذف گروه '+g.name);
    del.addEventListener('click', async ()=>{
      if(!await uiConfirm('گروه «' + g.name + '» حذف شود؟' + (n ? '\n' + n + ' منبع از این گروه خارج می‌شوند (خود منابع حذف نمی‌شوند).' : ''))) return;
      await api('/profile_groups?id=eq.'+g.id, {method:'DELETE'});
      await Promise.all([loadProfileGroups(), loadChannelProfileGroups()]);
      renderProfileGroupAdmin(); renderPoliticalFigures();
    });
    el.querySelector('.cc-actions').appendChild(del);
    grid.appendChild(el);
  });
}
export function setupProfileGroupsAdmin(){
  document.getElementById('add-profile-group-btn').addEventListener('click', async ()=>{
    const nameEl = document.getElementById('new-profile-group-name');
    const kind = document.getElementById('new-profile-group-kind').value;
    const name = nameEl.value.trim();
    if(!name) return;
    const r = await api('/profile_groups', {method:'POST', headers:{Prefer:'return=minimal'}, body: JSON.stringify({name, kind, sort_order: PROFILE_GROUPS.length})});
    if(r.ok){
      nameEl.value='';
      await loadProfileGroups();
      renderProfileGroupAdmin(); renderPoliticalFigures();
    }else{
      showToast('انجام نشد؛ اتصال را بررسی کنید و دوباره امتحان کنید.');
    }
  });
}

