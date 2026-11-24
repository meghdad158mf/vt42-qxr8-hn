// ترکیب عکس فوری داده‌ی واقعی (demo/build/real/data.json) با داده‌ی ساختگی:
// پایه = داده‌ی واقعی؛ هر بخش/تبی که داده‌ی واقعی ندارد یا خیلی کم دارد با همان بخش داده‌ی ساختگی پر می‌شود.
// ⚠️ تب «رهبر انقلاب» هرگز ساختگی نمی‌شود: داده‌ی واقعی دارد → دیده می‌شود، ندارد → پنهان.

const H = 3600e3;
const ISO_RX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const tehranDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

// زمان‌های داده‌ی ساختگی (نسبت به لحظه‌ی ساخت) هم‌تراز لحظه‌ی عکس فوری می‌شوند
function shift(obj, deltaMs, deltaDays) {
  const walk = (v) => {
    if (typeof v === 'string') {
      if (ISO_RX.test(v)) { const t = Date.parse(v); return isNaN(t) ? v : new Date(t + deltaMs).toISOString(); }
      if (DATE_RX.test(v)) return new Date(Date.parse(v + 'T12:00:00Z') + deltaDays * 864e5).toISOString().slice(0, 10);
      return v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') { for (const k of Object.keys(v)) v[k] = walk(v[k]); return v; }
    return v;
  };
  return walk(obj);
}

// هر رشته‌ای که به سامانه‌ی واقعی یا گیت‌هاب اشاره کند (مثلاً نشانی فایلی که دانلود نشد) پاک می‌شود
const LEAK = /supabase\.co|komqnapfqrtxxaytpcdt|github\.com|github\.io|meghdad158mf|vt42-qxr8-hn/i;
function scrub(rows, textCols) {
  return rows.filter((r) => !textCols.some((c) => typeof r[c] === 'string' && LEAK.test(r[c]))).map((r) => {
    for (const k of Object.keys(r)) if (typeof r[k] === 'string' && LEAK.test(r[k])) r[k] = null;
    return r;
  });
}

// ── خوشه‌بندی ساده‌ی خبرها (مثل «موج‌های خبری» سایت) برای اخبار منتخب/پرونده‌ها وقتی تحلیل هوش مصنوعی کهنه است ──
function norm(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/https?:\S+|@\w+/g, ' ').replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک')
    .replace(/[ً-ْـ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
// جمع‌بندی‌های روزانه («سرخط خبرها»…) خبر نیستند
const ROUNDUP = /سرخط|خلاصه[‌ ]?ی? (اخبار|خبر)|مهم[‌ ]?ترین (اخبار|خبرها)|تیتر (یک )?روزنامه|اخبار (مهم )?امروز|صفحه[‌ ]?ی? اول/;
const LATIN = /[A-Za-z]{4,}.*[A-Za-z]{4,}.*[A-Za-z]{4,}/;
const rank = (c) => ({ 1: 0, 2: 1, 3: 2 })[c && c.region_id] ?? 3;
const STOP = new Set(['و', 'در', 'به', 'از', 'که', 'این', 'با', 'را', 'برای', 'است', 'آن', 'یک', 'تا', 'بر', 'می', 'شد', 'های', 'ها']);
function shingles(s) {
  const w = norm(s).split(' ').filter((x) => x && !STOP.has(x));
  const out = new Set();
  for (let i = 0; i + 2 < w.length && i < 80; i++) out.add(w[i] + ' ' + w[i + 1] + ' ' + w[i + 2]);
  return out;
}
export function headlineOf(p) {
  if (p.title) return String(p.title).replace(/<[^>]+>/g, '').trim();
  const line = String(p.text || '').replace(/<[^>]+>/g, '').split('\n').map((l) => l.replace(/^[^\p{L}\p{N}«]+/u, '').trim()).find((l) => l.length > 15) || '';
  return line.length > 150 ? line.slice(0, 147) + '…' : line;
}
function clusters(posts, channels, sinceMs) {
  const ch = new Map(channels.map((c) => [c.id, c]));
  const list = posts.filter((p) => p.platform !== 'bale' && Date.parse(p.scraped_at) >= sinceMs && ch.get(p.channel_id)?.show_in_news && !ch.get(p.channel_id)?.show_in_hawza);
  const sh = list.map((p) => shingles((p.title || '') + ' ' + (p.text || '')));
  const parent = list.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const index = new Map();
  sh.forEach((s, i) => s.forEach((g) => { if (!index.has(g)) index.set(g, []); index.get(g).push(i); }));
  const pairs = new Map();
  for (const ids of index.values()) {
    if (ids.length > 40) continue;
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const k = ids[a] * 100000 + ids[b];
      pairs.set(k, (pairs.get(k) || 0) + 1);
    }
  }
  for (const [k, n] of pairs) {
    const a = Math.floor(k / 100000), b = k % 100000;
    if (n >= 3 && n >= 0.5 * Math.min(sh[a].size, sh[b].size)) parent[find(a)] = find(b);
  }
  const groups = new Map();
  list.forEach((p, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); });
  return [...groups.values()].map((ps) => {
    ps.sort((a, b) => (a.scraped_at < b.scraped_at ? -1 : 1));
    const rep = ps.find((p) => p.title) || ps[0];
    return { posts: ps, rep, sources: new Set(ps.map((p) => p.channel_id)).size, headline: headlineOf(rep) };
  }).filter((c) => c.headline.length > 20 && !ROUNDUP.test(c.headline) && !LATIN.test(c.headline))
    // تعداد منابع، بعد منطقه‌ی منبع به ترتیب برچسب‌های خودِ سامانه: داخلی، منطقه‌ای، بین‌المللی، بقیه
    .sort((a, b) => b.sources - a.sources || rank(ch.get(a.rep.channel_id)) - rank(ch.get(b.rep.channel_id)) || b.posts.length - a.posts.length);
}

// موضوعات پرتکرار بدون هوش مصنوعی: عبارت‌های دوکلمه‌ای که در بیشترین منابع متفاوت تکرار شده‌اند
const WEAK = new Set([...'ها های می نمی هم خود اما یا اگر هر چه چرا کرد کرده کند کنند شود شده بود باید دارد ایران امروز گفت گفته اعلام خبر سال روز ساعت درصد هزار میلیون پس پیش بین روی زیر بعد قبل نیز همه دیگر یکی وی او ما شما آنها گذشته ساعات ندارد وجود الله آیت جمهوری اسلامی'.split(' ')]);
function phraseTopics(posts) {
  const seen = new Map();
  for (const p of posts) {
    const w = norm(headlineOf(p) + ' ' + String(p.text || '').slice(0, 300)).split(' ');
    const mine = new Set();
    for (let i = 0; i + 1 < w.length; i++) {
      const a = w[i], b = w[i + 1];
      if (a.length < 3 || b.length < 3 || STOP.has(a) || STOP.has(b) || WEAK.has(a) || WEAK.has(b) || /\d/.test(a + b)) continue;
      mine.add(a + ' ' + b);
    }
    for (const g of mine) { if (!seen.has(g)) seen.set(g, new Set()); seen.get(g).add(p.channel_id); }
  }
  const out = [];
  for (const [g, chs] of [...seen].sort((x, y) => y[1].size - x[1].size)) {
    if (chs.size < 3 || out.some((o) => o.name.includes(g.split(' ')[0]) || o.name.includes(g.split(' ')[1]))) continue;
    out.push({ name: g, weight: chs.size });
    if (out.length === 8) break;
  }
  return out;
}

export function mergeReal(fake, real) {
  const R = real.tables;
  const cap = Date.parse(real.meta.capturedAt);
  const F = shift(structuredClone(fake.tables), cap - Date.parse(fake.meta.capturedAt),
    Math.round((Date.parse(tehranDay(cap)) - Date.parse(tehranDay(Date.parse(fake.meta.capturedAt)))) / 864e5));
  const filled = [];
  const out = { ...R };
  out.posts = scrub(R.posts || [], ['text', 'title']);
  out.channels = scrub(R.channels || [], []);
  out.hawza_mentions = scrub(R.hawza_mentions || [], ['title', 'excerpt']);

  // شناسه‌های ساختگی جدا از واقعی
  const CH = 1_000_000, PO = 100_000_000, GR = 1_000_000;
  const fakeCh = (c) => ({ ...c, id: c.id + CH });
  const fakePosts = (ids) => F.posts.filter((p) => ids.has(p.channel_id)).map((p) => ({ ...p, id: p.id + PO, channel_id: p.channel_id + CH }));
  function addFakeChannels(pred, label) {
    const chans = F.channels.filter(pred);
    out.channels.push(...chans.map(fakeCh));
    out.posts.push(...fakePosts(new Set(chans.map((c) => c.id))));
    filled.push(label);
    return chans;
  }
  const realCh = new Map(out.channels.map((c) => [c.id, c]));
  const postsOf = (pred, extra = () => true) => out.posts.filter((p) => { const c = realCh.get(p.channel_id); return c && pred(c) && extra(p); });

  // مواضع: فیلتر هوش مصنوعی (section_relevant) هنوز اجرا نشده → مطلب واقعی بررسی‌نشده نمایش داده می‌شود
  const posIds = new Set(out.channels.filter((c) => c.show_in_positions).map((c) => c.id));
  out.posts.forEach((p) => { if (posIds.has(p.channel_id) && p.section_relevant == null) p.section_relevant = true; });
  const posOk = (p) => p.section_relevant !== false;
  // اخبار حوزه: همین وضع برای hawza_relevant (بررسی‌نشده‌های سایت‌های حوزوی دیده شوند)
  const hawIds = new Set(out.channels.filter((c) => c.show_in_hawza).map((c) => c.id));
  out.posts.forEach((p) => { if (hawIds.has(p.channel_id) && p.hawza_relevant == null) p.hawza_relevant = true; });
  for (const tab of ['maraji', 'hawza', 'imams', 'orgs']) {
    if (postsOf((c) => c.show_in_positions && c.positions_tab === tab, posOk).length < 3) addFakeChannels((c) => c.show_in_positions && c.positions_tab === tab, 'مواضع/' + tab);
  }
  const leaderReal = postsOf((c) => c.show_in_positions && c.positions_tab === 'leader', posOk).length > 0;

  // یادداشت‌ها و کنشگری
  for (const [flag, min, label, kind] of [['show_in_people', 4, 'چهره‌ها', 'figures'], ['show_in_orgs', 4, 'سازمان‌ها', 'orgs'], ['show_in_thinktanks', 3, 'اندیشکده‌ها'], ['show_in_cyberspace', 10, 'کنشگری']]) {
    if (postsOf((c) => c[flag]).length >= min) continue;
    const chans = addFakeChannels((c) => c[flag] && !c.show_in_news, label);
    if (kind) {
      const gids = new Set();
      F.channel_profile_groups.filter((g) => chans.some((c) => c.id === g.channel_id)).forEach((g) => {
        out.channel_profile_groups.push({ ...g, id: g.id + GR, channel_id: g.channel_id + CH, group_id: g.group_id + GR });
        gids.add(g.group_id);
      });
      out.profile_groups.push(...F.profile_groups.filter((g) => gids.has(g.id)).map((g) => ({ ...g, id: g.id + GR })));
    }
  }
  // درباره حوزه، ادعاها
  if (postsOf((c) => c.show_in_hawza, (p) => p.hawza_relevant === true).length < 3) addFakeChannels((c) => c.show_in_hawza, 'اخبار حوزه');
  if ((out.hawza_mentions || []).length < 5) { out.hawza_mentions = [...(out.hawza_mentions || []), ...F.hawza_mentions.map((m) => ({ ...m, id: m.id + PO, post_id: null }))]; filled.push('آنچه درباره حوزه گفته می‌شود'); }
  if (out.posts.filter((p) => p.platform === 'bale').length < 3) addFakeChannels((c) => c.platform === 'bale', 'ادعاها و شایعات');

  // روزنامه‌ها، بسته‌ها، مدارس، میان‌برها
  for (const [tbl, label] of [['newspapers', 'روزنامه‌ها'], ['magazines', 'بسته تحلیلی جریان'], ['archive_reports', 'بسته‌های سایر نهادها'], ['school_reports', 'برنامه مدارس'], ['news_topics', 'میان‌برهای جست‌وجو']]) {
    if (!(out[tbl] || []).length) { out[tbl] = F[tbl]; filled.push(label); }
  }

  // اخبار منتخب، پرونده‌ها و خبرنامه — اگر تحلیل هوش مصنوعی کهنه است، از خوشه‌بندی خودِ داده‌ی واقعی
  const cl = clusters(out.posts, out.channels, cap - 12 * H);
  const ch = new Map(out.channels.map((c) => [c.id, c]));
  const ins = (out.news_ai_insights || [])[0];
  const postIds = new Set(out.posts.map((p) => p.id));
  const fresh = ins && cap - Date.parse(ins.computed_at) < 36 * H && (ins.selected_posts || []).some((s) => postIds.has(Number(s.id)));
  if (!fresh && cl.length) {
    // حداکثر دو مطلب از هر منبع تا فهرست متنوع باشد (مثل انتخاب ویراستار)
    const per = new Map();
    // منابعی که سامانه «معاند» یا بی‌منطقه برچسب زده در فید هستند، ولی «منتخب» نمی‌شوند
    const top = cl.filter((c) => rank(ch.get(c.rep.channel_id)) < 3).filter((c) => { const n = per.get(c.rep.channel_id) || 0; if (n >= 2) return false; per.set(c.rep.channel_id, n + 1); return true; }).slice(0, 8);
    const words = new Map();
    out.posts.filter((p) => Date.parse(p.scraped_at) >= cap - 12 * H).forEach((p) => (p.ai_keywords || []).forEach((k) => words.set(k, (words.get(k) || 0) + 1)));
    let topics = [...words].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, weight]) => ({ name, weight }));
    if (topics.length < 4) topics = phraseTopics(out.posts.filter((p) => Date.parse(p.scraped_at) >= cap - 12 * H));
    out.news_ai_insights = [{
      id: 1, computed_at: new Date(cap - 1.2 * H).toISOString(), window_hours: 6,
      selected_posts: top.map((c, i) => ({ id: c.rep.id, headline: c.headline, score: 10 - i * 0.6, tags: [], sources: c.sources, posts: c.posts.length,
        channel_id: c.rep.channel_id, time: c.rep.posted_at || c.rep.scraped_at, link: c.rep.link })),
      topics,
    }];
    out.news_pick_edits = (out.news_pick_edits || []).filter((e) => postIds.has(e.post_id));
    filled.push('اخبار منتخب (از خوشه‌بندی خبرهای واقعی)');
  }
  if (!(out.dossier_topic_posts || []).length && cl.length >= 3) {
    out.dossier_topics = cl.slice(0, 3).map((c, i) => ({ id: i + 1, name: c.headline.split(/\s+/).slice(0, 6).join(' '), keywords: '', active: true, sort_order: i, created_at: new Date(cap - 5 * 864e5).toISOString() }));
    out.dossier_topic_posts = cl.slice(0, 3).flatMap((c, i) => c.posts.map((p, k) => ({ id: i * 1000 + k + 1, topic_id: i + 1, post_id: p.id, source: 'auto', excluded: false, created_at: p.scraped_at })));
    filled.push('پرونده‌ها (از خبرهای واقعی)');
  }
  if (!(out.newsletter_posts || []).length) {
    const claims = out.posts.filter((p) => p.platform === 'bale').slice(0, 3);
    let id = 0;
    out.newsletter_posts = [
      ...claims.map((p, i) => ({ id: ++id, section: 'claims', post_id: p.id, sort_order: i, created_at: new Date(cap - 5 * H).toISOString() })),
      ...cl.slice(0, 4).map((c, i) => ({ id: ++id, section: 'news', post_id: c.rep.id, sort_order: i, created_at: new Date(cap - 5 * H).toISOString() })),
    ];
    filled.push('خبرنامه (از خبرهای واقعی)');
  }
  // پیوند خبرنامه با پست (newsletter_posts?select=*,posts(*))
  const hidden = new Set((real.meta.hidden_sections || []).filter((k) => k !== 'positions/leader'));
  if (!leaderReal) hidden.add('positions/leader');
  out.site_settings = [{ key: 'hidden_sections', value: [...hidden] }, { key: 'viewer_password_login', value: true }];
  out.announcements = [{ id: 1, message: 'به نسخه‌ی نمایشی سامانه‌ی جریان خوش آمدید. مطالب این نسخه نمونه‌ای از داده‌های واقعی سامانه است.', level: 'info', active: true, expires_at: null, created_at: new Date(cap - 2 * H).toISOString() }];

  // ۶.۱.۵ (دمو روی هاست کُند بود): فقط پست‌هایی که سایت واقعاً می‌خواند — ۵۰ ساعت اخیر (مقایسه با دیروز ۴۸ ساعت
  // را می‌خواند)، ۲۰۰ مطلب آخر هر منبع کم‌تکرار، ادعاها، اخبار حوزه و هر پستی که جای دیگر ارجاع شده
  {
    const since = cap - 50 * H;
    const rareIds = new Set(out.channels.filter((c) => !c.show_in_news || c.show_in_hawza || c.platform === 'bale').map((c) => c.id));
    const ref = new Set([...(out.newsletter_posts || []), ...(out.dossier_topic_posts || []), ...(out.news_pick_edits || [])].map((x) => x.post_id));
    (out.news_ai_insights || []).forEach((i) => (i.selected_posts || []).forEach((sp) => ref.add(Number(sp.id))));
    (out.hawza_mentions || []).forEach((m) => m.post_id && ref.add(m.post_id));
    const perCh = new Map();
    out.posts = out.posts.sort((a, b) => (a.scraped_at < b.scraped_at ? 1 : -1)).filter((p) => {
      if (ref.has(p.id) || Date.parse(p.scraped_at) >= since) return true;
      if (!rareIds.has(p.channel_id)) return false;
      const n = (perCh.get(p.channel_id) || 0) + 1; perCh.set(p.channel_id, n);
      return n <= 200;
    });
    // ستون‌هایی که سایت نشان نمی‌دهد
    out.posts.forEach((p) => { delete p.raw; delete p.platform_post_id; delete p.ai_keywords_extracted_at; });
  }
  const c = real.meta.counts || {};
  const historic = {};
  for (const [t, n] of Object.entries(c)) historic[t] = Math.max(0, n - (out[t] || []).length);
  return {
    filled,
    out: {
      meta: { capturedAt: real.meta.capturedAt, historic, sources: real.meta.sources && typeof real.meta.sources.channels === 'number' ? real.meta.sources : { channels: out.channels.length, newspapers: 38, crawl: 31 }, translations: {} },
      tables: out,
    },
  };
}
