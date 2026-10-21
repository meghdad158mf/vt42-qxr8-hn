// پنجره‌ی تأیید حذف منبع (#delete-channel-modal)
import { api } from '../../core/api.js';
import { bindModal } from '../../ui/modal.js';
import { populateExportFilters } from '../export.js';
import { populatePostFilters, renderPosts } from '../../features/cyberspace/posts-feed.js';
import { renderCatGrid } from './taxonomy.js';
import { refreshChanList } from './chan-list-hook.js';
import { renderChannelCards, renderCyberPeopleGrid } from '../../features/cyberspace/cyber-people.js';
import { renderNewsFeed } from '../../features/news/news-feed.js';
// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)
import { loadChannels, loadPosts } from '../../app.js';

export let PENDING_DELETE_CHANNEL = null;
export function openDeleteChannelModal(ch){
  PENDING_DELETE_CHANNEL = ch;
  document.getElementById('delete-channel-name').textContent = ch.title || ch.username;
  document.getElementById('delete-channel-modal').classList.add('active');
}
export function closeDeleteChannelModal(){
  PENDING_DELETE_CHANNEL = null;
  document.getElementById('delete-channel-modal').classList.remove('active');
}
export function setupDeleteChannel(){
  bindModal('delete-channel-modal', closeDeleteChannelModal);
  document.getElementById('confirm-delete-channel-btn').addEventListener('click', async ()=>{
    if(!PENDING_DELETE_CHANNEL) return;
    const ch = PENDING_DELETE_CHANNEL;
    closeDeleteChannelModal();
    await api('/channels?id=eq.'+ch.id, {method:'DELETE'});
    await loadChannels(); await loadPosts();
    refreshChanList(); renderCatGrid(); renderChannelCards(); populatePostFilters(); populateExportFilters(); renderNewsFeed(); renderPosts(); renderCyberPeopleGrid();
  });
}

