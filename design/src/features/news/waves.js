// «موج‌های خبری»: یه خبر در ≥۵ کانال مختلف در ۱۲ ساعت اخیر (سمت کلاینت؛ هم‌سو با supabase/functions/_shared/cluster.ts)
import { api } from '../../core/api.js';
import { escHtml, safeUrl, toFaDigits } from '../../core/text.js';
import { newsRelTime } from '../../core/date.js';
import { POSTS_CACHE, chName, HIDDEN_POST_IDS } from '../../data/store.js';

// ---- موج‌های خبری ----
// یه خبر که در کمتر از WAVE_WINDOW_H ساعت در WAVE_MIN_CHANNELS کانال مختلف یا
// بیشتر پخش شده (به انتخاب کاربر: ۵ کانال در ۱۲ ساعت، فقط نمایش در سایت).
// تشخیص سمت کلاینت: (۱) متن تقریباً یکسان — سه‌کلمه‌ای‌های مشترک (شینگل) با
// سهم ≥ ۵۰٪ از پست کوتاه‌تر (بازنشر/کپی، حتی با امضای متفاوت کانال)، (۲) ≥۳
// کلیدواژه‌ی مشترک هوش مصنوعی (روایت‌های با متن متفاوت؛ صف کلیدواژه عقبه پس
// این فقط مکمله). پست‌ها با union-find خوشه می‌شن. داده: POSTS_CACHE + (اگه
// کش ۱۰۰۰تایی کل ۱۲ ساعت رو نپوشونه) باقی پست‌های همون بازه با کوئری جدا.
export const WAVE_MIN_CHANNELS = 5, WAVE_WINDOW_H = 12, WAVE_LIVE_H = 2;
const WAVE_STOP = new Set(('از به در که و را این با برای تا آن هم بر یک ها های می شد شده است بود کرد کند اند ای یا اما نیز پس چه همه دیگر '
  + 'وی او ما شما آنها خود هر اگر باید شود نمی کرده گفت داد دارد نیست بین روی پیش پی'). split(' '));
export let WAVE_STATE = { forCache: null, extra: null, loading: false, result: null };
export function waveNorm(s){
  return String(s||'')
    .replace(/https?:\/\/\S+/g, ' ').replace(/@[\w_]+/g, ' ')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه').replace(/[أإآ]/g, 'ا').replace(/ؤ/g, 'و')
    .replace(/[ً-ٰٟ]/g, '').replace(/‌/g, ' ')
    .toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
}
export function waveShingles(p){
  const w = waveNorm((p.title || '') + ' ' + (p.text || '')).split(/\s+/).filter(t=>t.length > 1 && !WAVE_STOP.has(t)).slice(0, 150);
  const out = new Set();
  for(let i = 0; i + 2 < w.length; i++) out.add(w[i] + ' ' + w[i+1] + ' ' + w[i+2]);
  return out;
}
export function waveTime(p){ return new Date(p.posted_at || p.scraped_at).getTime(); }
export function computeNewsWaves(posts){
  const cutoff = Date.now() - WAVE_WINDOW_H * 3600 * 1000;
  const items = posts.filter(p=>p.platform !== 'bale' && waveTime(p) >= cutoff);
  const n = items.length;
  const parent = items.map((_, i)=>i);
  const find = i=>{ while(parent[i] !== i){ parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b)=>{ a = find(a); b = find(b); if(a !== b) parent[a] = b; };
  // (۱) متن مشابه
  const sh = items.map(waveShingles);
  const index = new Map();
  sh.forEach((set, i)=>{ if(set.size < 4) return; set.forEach(g=>{ let l = index.get(g); if(!l) index.set(g, l = []); l.push(i); }); });
  for(let i = 0; i < n; i++){
    if(sh[i].size < 4) continue;
    const shared = new Map();
    sh[i].forEach(g=>{ const l = index.get(g); if(!l || l.length > 400) return; for(const j of l) if(j > i) shared.set(j, (shared.get(j) || 0) + 1); });
    shared.forEach((c, j)=>{ if(c >= 3 && c / Math.min(sh[i].size, sh[j].size) >= 0.5) union(i, j); });
  }
  // (۲) کلیدواژه‌های مشترک هوش مصنوعی
  const kwOf = items.map(p=>Array.isArray(p.ai_keywords) ? [...new Set(p.ai_keywords.map(k=>waveNorm(k).replace(/\s+/g, ' ').trim()).filter(Boolean))] : []);
  const kwIndex = new Map();
  kwOf.forEach((ks, i)=>{ if(ks.length < 3) return; ks.forEach(k=>{ let l = kwIndex.get(k); if(!l) kwIndex.set(k, l = []); l.push(i); }); });
  // کلیدواژه‌ی خیلی عام (مثل «ایران») زنجیره‌ی بی‌معنی می‌سازه — کنار گذاشته می‌شه
  const kwPosts = kwOf.filter(ks=>ks.length >= 3).length;
  const kwMax = Math.max(15, Math.round(kwPosts * 0.05));
  for(let i = 0; i < n; i++){
    if(kwOf[i].length < 3) continue;
    const shared = new Map();
    kwOf[i].forEach(k=>{ const l = kwIndex.get(k) || []; if(l.length > kwMax) return; for(const j of l) if(j > i) shared.set(j, (shared.get(j) || 0) + 1); });
    shared.forEach((c, j)=>{ if(c >= 3) union(i, j); });
  }
  const groups = new Map();
  for(let i = 0; i < n; i++){ const r = find(i); let g = groups.get(r); if(!g) groups.set(r, g = []); g.push(i); }
  const waves = [];
  groups.forEach(idx=>{
    const chans = new Set(idx.map(i=>items[i].channel_id));
    if(chans.size < WAVE_MIN_CHANNELS) return;
    const ps = idx.map(i=>items[i]).sort((a, b)=>waveTime(a) - waveTime(b));
    // متن نماینده: پستی که بیشترین شینگل مشترک با بقیه‌ی خوشه رو داره
    const freq = new Map();
    idx.forEach(i=>sh[i].forEach(g=>freq.set(g, (freq.get(g) || 0) + 1)));
    let best = idx[0], bestScore = -1;
    idx.forEach(i=>{ let sc = 0; sh[i].forEach(g=>{ sc += freq.get(g) - 1; }); sc = sh[i].size ? sc / Math.sqrt(sh[i].size) : 0; if(sc > bestScore){ bestScore = sc; best = i; } });
    const kwFreq = new Map();
    idx.forEach(i=>kwOf[i].forEach(k=>kwFreq.set(k, (kwFreq.get(k) || 0) + 1)));
    const kws = [...kwFreq.entries()].filter(([, c])=>c >= 2).sort((a, b)=>b[1] - a[1]).slice(0, 4).map(([k])=>k);
    waves.push({ posts: ps, channels: chans.size, rep: items[best], first: ps[0], last: ps[ps.length - 1], kws });
  });
  waves.sort((a, b)=>(b.channels - a.channels) || (waveTime(b.last) - waveTime(a.last)));
  return waves;
}
// پست‌های ۱۲ ساعت اخیر که در کش ۱۰۰۰تایی جا نشدن (ستون‌های لازم فقط)
async function loadWaveExtraPosts(){
  const since = new Date(Date.now() - WAVE_WINDOW_H * 3600 * 1000).toISOString();
  let oldest = null;
  for(const p of POSTS_CACHE){ if(p.platform === 'bale' || !p.scraped_at) continue; if(!oldest || p.scraped_at < oldest) oldest = p.scraped_at; }
  if(!oldest || oldest <= since) return [];
  const out = [];
  for(let page = 0; page < 6; page++){
    const r = await api('/posts?select=id,channel_id,platform,title,text,link,ai_keywords,posted_at,scraped_at'
      + '&platform=neq.bale&scraped_at=gte.' + encodeURIComponent(since) + '&scraped_at=lt.' + encodeURIComponent(oldest)
      + '&order=scraped_at.desc&limit=1000&offset=' + (page * 1000));
    if(!r.ok) break;
    const rows = await r.json();
    out.push(...rows.filter(p=>!HIDDEN_POST_IDS.has(Number(p.id))));
    if(rows.length < 1000) break;
  }
  return out;
}
export function renderNewsWaves(){
  const list = document.getElementById('news-waves-list');
  const empty = document.getElementById('news-waves-empty');
  if(!list) return;
  if(WAVE_STATE.forCache !== POSTS_CACHE){
    WAVE_STATE = { forCache: POSTS_CACHE, extra: null, loading: true, result: null };
    const st = WAVE_STATE;
    loadWaveExtraPosts().catch(()=>[]).then(extra=>{
      if(WAVE_STATE !== st) return;
      const ids = new Set(POSTS_CACHE.map(p=>p.id));
      st.extra = extra.filter(p=>!ids.has(p.id));
      st.result = computeNewsWaves(POSTS_CACHE.concat(st.extra));
      st.loading = false;
      renderNewsWaves();
      WAVES_COMPUTED();
    });
  }
  if(WAVE_STATE.loading){
    list.innerHTML = '';
    empty.textContent = 'در حال بررسی پست‌های ۱۲ ساعت اخیر…';
    empty.style.display = '';
    return;
  }
  const waves = WAVE_STATE.result || [];
  empty.textContent = 'در ۱۲ ساعت اخیر خبری در ۵ کانال یا بیشتر پخش نشده است.';
  empty.style.display = waves.length ? 'none' : '';
  const fmtClock = t=>new Date(t).toLocaleTimeString('fa-IR', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Tehran' });
  list.innerHTML = waves.slice(0, 6).map(w=>{
    const live = Date.now() - waveTime(w.last) <= WAVE_LIVE_H * 3600 * 1000;
    const spanH = (waveTime(w.last) - waveTime(w.first)) / 3600000;
    const spanTxt = spanH < 1 ? 'در کمتر از یک ساعت' : ('طی ' + toFaDigits(Math.round(spanH)) + ' ساعت');
    // امضای کانال (@آیدی/لینک) از متن نماینده حذف می‌شه
    const repText = (w.rep.title || w.rep.text || '').replace(/https?:\/\/\S+/g, '').replace(/[🆔]?\s*@[\w_]+/gu, '').trim();
    const postsHtml = w.posts.slice().reverse().map(p=>{
      const url = safeUrl(p.link);
      return `<div class="wave-post"><div class="wp-main"><span class="wp-ch">${escHtml(chName(p.channel_id))}</span><span class="wp-time">${fmtClock(waveTime(p))}</span>
        <p class="wp-snip">${escHtml((p.title || p.text || '').slice(0, 220))}</p></div>
        ${url !== '#' ? `<a href="${url}" target="_blank" rel="noopener" title="مشاهده در مبدأ">↗</a>` : ''}</div>`;
    }).join('');
    return `<div class="wave-card${live ? ' is-live' : ''}">
      <div class="wave-top">
        <span class="wave-count"><b>${toFaDigits(w.channels)}</b> کانال</span>
        <span class="wave-span">${toFaDigits(w.posts.length)} پست، ${spanTxt}</span>
        ${live ? '<span class="wave-live">در حال گسترش</span>' : ''}
      </div>
      <p class="wave-text">${escHtml(repText.slice(0, 400))}</p>
      <div class="wave-meta">اولین انتشار: <b>${escHtml(chName(w.first.channel_id))}</b>، ساعت ${fmtClock(waveTime(w.first))}، آخرین: ${newsRelTime(w.last.posted_at || w.last.scraped_at)}</div>
      ${w.kws.length ? `<div class="wave-kws">${w.kws.map(k=>`<span>${escHtml(k)}</span>`).join('')}</div>` : ''}
      <details><summary>مشاهده‌ی ${toFaDigits(w.posts.length)} پست</summary><div class="wave-posts">${postsHtml}</div></details>
    </div>`;
  }).join('');
}

// بعد از رسیدن نتیجه‌ی موج‌ها (ردیف شاخص‌های «در یک نگاه» دوباره رندر می‌شه — analytics.js)
let WAVES_COMPUTED = ()=>{};
export function onWavesComputed(fn){ WAVES_COMPUTED = fn; }
