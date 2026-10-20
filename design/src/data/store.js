// داده‌ی مشترک همه‌ی بخش‌ها: منابع، موضوع‌ها، مناطق و کش پست‌ها (پر شدن در loadAll)
// binding زنده‌ی ES module: همه می‌خونن، فقط با setX عوض می‌شن
import { api } from '../core/api.js';

export let CHANNELS = [];    // {id, platform, username, title, type, category_id, active}
export let CATEGORIES = [];  // {id, name, color}
export let REGIONS = [];     // {id, name}
export let POSTS_CACHE = []; // {id, channel_id, platform, platform_post_id, text, media_type, posted_at, scraped_at, views, forwards, link}
export function chById(id){ return CHANNELS.find(c=>c.id===id); }
export function chName(id){ const c=chById(id); return c ? (c.title || c.username) : '؟'; }
export function chInitials(id){
  const n = chName(id).replace(/^[«»"'”“'`\s]+/,'').trim();
  return n.slice(0,2) || '؟؟';
}
export function catNameOf(channelId){
  const ch = chById(channelId);
  const cat = ch && CATEGORIES.find(c=>c.id===ch.category_id);
  return cat ? cat.name : '';
}
export function regionNameOf(id){
  const r = REGIONS.find(x=>x.id===id);
  return r ? r.name : '';
}


export function setChannels(v){ CHANNELS = v; }
export function setCategories(v){ CATEGORIES = v; }
export function setRegions(v){ REGIONS = v; }
export function setPostsCache(v){ POSTS_CACHE = v; }

export let HIDDEN_POST_IDS = new Set();
// شناسه‌ی پست‌های پنهان برای هر دو نقش (تابع security definer فقط شناسه می‌ده، نه متن) —
// لازمه چون «اخبار منتخب» هوش مصنوعی عنوان خبر رو جدا ذخیره کرده و بدون این فیلتر
// پست پنهان‌شده رو باز هم نشون می‌داد
export async function loadHiddenPostIds(){
  try{
    const r = await api('/rpc/hidden_post_ids', { method:'POST', body:'{}' });
    if(!r.ok){ HIDDEN_POST_IDS = new Set(); return; }
    const rows = await r.json();
    HIDDEN_POST_IDS = new Set((Array.isArray(rows) ? rows : []).map(x=>Number(x && typeof x === 'object' ? Object.values(x)[0] : x)));
  }catch(e){ HIDDEN_POST_IDS = new Set(); }
}
