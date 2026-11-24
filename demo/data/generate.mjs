// سازنده‌ی داده‌ی نسخه‌ی نمایشی: از محتوای ساختگی content-*.mjs جدول‌هایی با همان ساختار
// پایگاه داده‌ی واقعی می‌سازد → demo/build/data.json (+ فهرست تصویرهایی که media.mjs می‌سازد).
// زمان‌ها نسبت به «اکنونِ» ساخت‌اند؛ shim.js هنگام نمایش همه را جلو می‌برد تا همیشه تازه باشند.
//   node demo/data/generate.mjs
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STORIES, BRIEFS, FOREIGN, CLAIMS } from './content-news.mjs';
import * as C from './content-other.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../build');
const NOW = Date.now();
const H = 3600e3;

// تصادفی تکرارپذیر (هر بار ساخت، همان داده)
let seed = 1405;
function rnd() { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + rnd() * (b - a);
const iso = (ms) => new Date(ms).toISOString();
const tehranDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

// ساعت‌های شب کم‌خبرترند: زمان تصادفی در بازه‌ی [from, to] ساعت پیش، با ترجیح ساعات روز تهران
function newsTime(fromH, toH) {
  for (let i = 0; i < 20; i++) {
    const t = NOW - between(fromH, toH) * H;
    const hr = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', hour: 'numeric', hourCycle: 'h23' }).format(new Date(t)));
    if (hr >= 7 || rnd() < 0.15) return t;
  }
  return NOW - between(fromH, toH) * H;
}

const channels = [];
const posts = [];
const media = { posts: [], newspapers: [], magazines: [], archive: [], school: [], avatars: [] };
let chId = 0, postId = 1000;

function addChannel(o) {
  const id = ++chId;
  const ch = {
    id, platform: o.p, username: o.p === 'website' ? `https://${o.d}.example/rss` : o.u, title: o.t,
    category_id: o.cat || null, region_id: o.r === 'kh' ? 2 : o.r === 'int' ? 3 : 1, hawza_region_id: o.r === 'kh' ? 2 : 1,
    avatar_url: `media/avatars/${id}.svg`, owner_name: o.owner || null, subscriber_count: o.subs || Math.round(between(3, 180)) * 1000,
    is_khorasan_talabeh: !!o.kh, show_in_news: !!o.news, show_in_cyberspace: !!o.cyber, show_in_people: !!o.people,
    show_in_orgs: !!o.orgs, show_in_hawza: !!o.hawza, show_in_positions: !!o.pos, positions_tab: o.pos || null,
    show_in_thinktanks: !!o.think, active: true, type: 'news_agency', added_at: iso(NOW - between(30, 400) * 24 * H),
    _site: o.d || null,
  };
  channels.push(ch);
  media.avatars.push({ id, title: o.t, platform: o.p });
  return ch;
}

function addPost(ch, { title = null, text, t, kw = [], img = null, hawza = false, section = null }) {
  const id = ++postId;
  const link = ch.platform === 'website' ? `https://${ch._site}.example/news/${id}`
    : ch.platform === 'telegram' ? `https://t.me/${ch.username}/${id}`
    : ch.platform === 'bale' ? `https://ble.ir/${ch.username}/${id}` : `https://eitaa.com/${ch.username}/${id}`;
  const p = {
    id, channel_id: ch.id, platform: ch.platform, platform_post_id: String(id), title, text, link,
    media_type: img ? 'photo' : null, media_path: img, posted_at: iso(t), scraped_at: iso(t + between(2, 40) * 60e3),
    views: ch.platform === 'website' ? 0 : Math.round(between(0.3, 2.5) * ch.subscriber_count / 10), forwards: Math.round(between(0, 120)),
    ai_keywords: kw.length ? kw : null, ai_keywords_extracted_at: kw.length ? iso(t + 2 * H) : null,
    hawza_relevant: hawza, section_relevant: section, hidden_at: null,
  };
  posts.push(p);
  return p;
}

// ── منابع ──
const newsCh = C.NEWS_CHANNELS.map((o) => addChannel({ ...o, news: true }));
const newsSites = C.NEWS_SITES.map((o) => addChannel({ ...o, p: 'website', news: true }));
const foreignSites = Object.fromEntries(Object.entries(C.FOREIGN_SITES).map(([k, o]) => [k, addChannel({ ...o, p: 'website', news: true, r: 'int' })]));
const hawzaSites = C.HAWZA_SITES.map((o) => addChannel({ ...o, p: 'website', news: true, hawza: true, cat: 6 }));
const bale = addChannel({ ...C.BALE_CHANNEL, news: true, cat: 1 });
const posCh = {};
for (const [tab, list] of Object.entries(C.POSITIONS)) posCh[tab] = list.map((o) => ({ ch: addChannel({ ...o, pos: tab, cat: 6 }), items: o.items }));
const figures = C.FIGURES.map((o) => ({ ch: addChannel({ ...o, people: true, cat: 2 }), g: o.g }));
const orgs = C.ORGS.map((o) => ({ ch: addChannel({ ...o, orgs: true, cat: 2 }), g: o.g }));
const thinks = C.THINKTANKS.map((o) => addChannel({ ...o, think: true, cat: 2 }));
const activists = C.ACTIVISTS.map((o) => addChannel({ ...o, cyber: true, cat: 7 }));
// چند کانال خبری در «کنشگری» هم هستند (مثل سایت واقعی)
newsCh.slice(9, 12).forEach((c) => { c.show_in_cyberspace = true; c.owner_name = 'تحریریه‌ی ' + c.title; });

const socialText = (ch, title, body) => {
  const tag = (C.NEWS_CHANNELS.find((x) => x.u === ch.username) || {}).tag || '🔹';
  return `${tag} ${title}\n\n${body}\n\n🆔 @${ch.username}`;
};

// ── خبرهای اصلی و موج‌ها ──
const storyPosts = {};
for (const s of STORIES) {
  const pool = [...newsCh, ...newsSites].filter((c) => s.region !== 'kh' || true);
  const n = s.wave || Math.round(between(1, 3));
  const chosen = [];
  while (chosen.length < Math.min(n, pool.length)) { const c = pick(pool); if (!chosen.includes(c)) chosen.push(c); }
  if (s.region === 'kh' && !chosen.some((c) => c.region_id === 2)) chosen[0] = newsCh.find((c) => c.region_id === 2);
  const t0 = NOW - s.h * H;
  storyPosts[s.k] = [];
  chosen.forEach((ch, i) => {
    const t = t0 + i * between(4, 35) * 60e3;
    const tt = Math.min(t, NOW - between(1, 25) * 60e3);
    const img = s.img && (i === 0 || rnd() < 0.35) ? `media/posts/${s.k}.webp` : null;
    const p = ch.platform === 'website'
      ? addPost(ch, { title: s.title, text: s.body, t: tt, kw: s.kw, img, hawza: !!s.hawza })
      : addPost(ch, { text: socialText(ch, s.title, s.body), t: tt, kw: s.kw, img, hawza: !!s.hawza });
    storyPosts[s.k].push(p);
  });
  if (s.img) media.posts.push({ k: s.k, title: s.title, tags: s.tags });
}
// چند خبر اصلی دیروز و پریروز هم دوباره پوشش داده می‌شوند (پیگیری خبر)
for (const s of STORIES.filter((x) => x.h < 12).slice(0, 4)) {
  const ch = pick(newsSites);
  addPost(ch, { title: 'پیگیری | ' + s.title, text: s.body, t: newsTime(30, 60), kw: s.kw });
}

// ── خبرهای کوتاه ──
for (const ch of [...newsCh, ...newsSites]) {
  const src = [...newsCh, ...newsSites].indexOf(ch);
  const count = Math.min(BRIEFS.length, Math.round((C.NEWS_CHANNELS[src] || C.NEWS_SITES[src - newsCh.length] || { rate: 8 }).rate * 0.55 * 3));
  const order = BRIEFS.map((_, i) => i).sort(() => rnd() - 0.5).slice(0, count);
  for (const bi of order) {
    const [, kw, text] = BRIEFS[bi];
    const t = newsTime(0.2, 72);
    if (ch.platform === 'website') addPost(ch, { title: text.split(/[؛.]/)[0], text, t, kw: [kw] });
    else addPost(ch, { text: socialText(ch, text.split(/[؛]/)[0], text.includes('؛') ? text.split('؛').slice(1).join('؛').trim() : '').replace(/\n\n\n\n/, '\n\n'), t, kw: [kw] });
  }
}

// ── خبرهای غیرفارسی ──
const translations = {};
FOREIGN.forEach((f, i) => {
  const p = addPost(foreignSites[f.site], { title: f.title, text: f.text, t: newsTime(1 + i * 5, 3 + i * 6), kw: f.kw });
  translations['p' + p.id] = f.t;
});

// ── ادعاها (بله) ──
CLAIMS.forEach(([claim, verdict, by, level, pattern], i) => {
  addPost(bale, {
    title: claim,
    text: `<strong>انتشار توسط:</strong>\n${by}\n\n${level}\n\n${pattern}\n\n<strong>نتیجه‌ی بررسی:</strong> ${verdict}`,
    t: newsTime(0.5 + i * 7, 2 + i * 8), kw: [],
  });
});

// ── اخبار حوزه ──
C.HAWZA_NEWS.forEach(([title, text], i) => {
  addPost(hawzaSites[i % hawzaSites.length], { title, text, t: newsTime(0.5 + i * 5, 3 + i * 6), kw: ['حوزه علمیه', 'طلاب'], hawza: true, img: i === 0 ? 'media/posts/hawza-week.webp' : null });
});

// ── مواضع ──
for (const list of Object.values(posCh)) for (const { ch, items } of list) {
  items.forEach((text, i) => {
    const t = newsTime(2 + i * 40, 10 + i * 48);
    if (ch.platform === 'website') addPost(ch, { title: text.split(':')[0], text: text.includes(':') ? text.split(':').slice(1).join(':').trim() : text, t, section: true });
    else addPost(ch, { text, t, section: true });
  });
}

// ── یادداشت‌ها ──
figures.forEach(({ ch }, i) => {
  const n = 2 + (i % 3);
  for (let k = 0; k < n; k++) {
    const text = C.FIGURE_NOTES[(i * 3 + k) % C.FIGURE_NOTES.length];
    const t = newsTime(3 + k * 50 + i * 4, 20 + k * 60 + i * 6);
    if (ch.platform === 'website') addPost(ch, { title: text.split('|')[1].split(/[؛.]/)[0].trim(), text: text.split('|')[1].trim(), t });
    else addPost(ch, { text, t });
  }
});
orgs.forEach(({ ch }, i) => {
  for (let k = 0; k < 3; k++) {
    const text = C.ORG_NOTES[(i * 2 + k) % C.ORG_NOTES.length];
    const t = newsTime(4 + k * 60 + i * 5, 24 + k * 70 + i * 5);
    if (ch.platform === 'website') addPost(ch, { title: text.split(':')[0], text, t });
    else addPost(ch, { text, t });
  }
});
thinks.forEach((ch, i) => {
  for (let k = 0; k < 2; k++) {
    const [title, text] = C.THINK_NOTES[(i * 2 + k) % C.THINK_NOTES.length];
    const t = newsTime(10 + k * 90 + i * 12, 40 + k * 100 + i * 12);
    if (ch.platform === 'website') addPost(ch, { title, text, t });
    else addPost(ch, { text: `📘 ${title}\n\n${text}`, t });
  }
});

// ── کنشگری: تعداد پست‌های هفته متفاوت تا «فعالیت» زیاد/متوسط/کم/غیرفعال دیده شود ──
const ACT_COUNTS = [26, 14, 9, 5, 22, 18, 3, 11, 24, 0, 16, 6];
activists.forEach((ch, i) => {
  const n = ACT_COUNTS[i % ACT_COUNTS.length];
  for (let k = 0; k < n; k++) {
    const text = C.ACTIVIST_POSTS[(i + k) % C.ACTIVIST_POSTS.length];
    addPost(ch, { text, t: newsTime(0.3, 160), img: k === 0 && i % 3 === 0 ? `media/posts/act-${i}.webp` : null });
  }
  if (n === 0) addPost(ch, { text: C.ACTIVIST_POSTS[i % C.ACTIVIST_POSTS.length], t: NOW - between(12, 20) * 24 * H });
  if (i % 3 === 0 && n) media.posts.push({ k: `act-${i}`, title: C.ACTIVIST_POSTS[i % C.ACTIVIST_POSTS.length].split(/[:؛.]/)[0], tags: [ch.title], quote: true });
});

posts.sort((a, b) => (a.scraped_at < b.scraped_at ? 1 : -1));
const byStory = (k) => storyPosts[k] || [];

// ── «درباره حوزه» ──
const hawza_mentions = C.MENTIONS.map(([site, name, kind, title, excerpt, terms, inTitle], i) => {
  const t = newsTime(0.5 + i * 3.5, 3 + i * 4);
  const ch = kind === 'social' ? channels.find((c) => c.title === name) : null;
  const post = ch ? posts.find((p) => p.channel_id === ch.id) : null;
  return {
    id: 500 + i, url: kind === 'social' && ch ? `https://eitaa.com/${ch.username}/${9000 + i}` : `https://${site}/news/${7000 + i}`,
    site: kind === 'social' && ch ? (ch.platform + ':' + ch.username) : site, site_name: name, title, excerpt, kind,
    post_id: post ? post.id : null, matched_terms: terms, hits: inTitle ? 2 + (i % 3) : 2, in_title: inTitle,
    published_at: iso(t - 40 * 60e3), scraped_at: iso(t), hidden_at: null,
  };
});
hawza_mentions.forEach((m) => {
  const f = FOREIGN.find((x) => x.title === m.title);
  if (f) translations['m' + m.id] = { title: f.t.title, text: f.t.text };
});

// ── گروه‌ها ──
const profile_groups = [
  ...C.FIGURE_GROUPS.map((name, i) => ({ id: i + 1, name, kind: 'figures', sort_order: i, created_at: iso(NOW - 90 * 24 * H) })),
  ...C.ORG_GROUPS.map((name, i) => ({ id: i + 11, name, kind: 'orgs', sort_order: i, created_at: iso(NOW - 90 * 24 * H) })),
];
let cpgId = 0;
const channel_profile_groups = [
  ...figures.map(({ ch, g }) => ({ id: ++cpgId, channel_id: ch.id, group_id: g + 1, created_at: iso(NOW - 80 * 24 * H) })),
  ...orgs.map(({ ch, g }) => ({ id: ++cpgId, channel_id: ch.id, group_id: g + 11, created_at: iso(NOW - 80 * 24 * H) })),
];

// ── تحلیل هوش مصنوعی ──
const ranked = STORIES.filter((s) => s.h <= 14 && byStory(s.k).length).map((s) => {
  const ps = byStory(s.k);
  return { s, ps, sources: new Set(ps.map((p) => p.channel_id)).size };
}).sort((a, b) => b.sources - a.sources).slice(0, 8);
const news_ai_insights = [{
  id: 1, computed_at: iso(NOW - 1.3 * H), window_hours: 6,
  selected_posts: ranked.map(({ s, ps, sources }, i) => ({
    id: ps[0].id, headline: s.title, score: 10 - i * 0.7, tags: s.tags, sources, posts: ps.length,
    channel_id: ps[0].channel_id, time: ps[0].posted_at, link: ps[0].link,
  })),
  topics: C.AI_TOPICS.map(([name, weight]) => ({ name, weight })),
}];

// ── پرونده‌ها و خبرنامه ──
const dossier_topics = C.DOSSIERS.map((d, i) => ({ id: i + 1, name: d.name, keywords: d.keywords, active: true, sort_order: i, created_at: iso(NOW - 20 * 24 * H) }));
let dtpId = 0;
const dossier_topic_posts = [];
C.DOSSIERS.forEach((d, i) => {
  const kws = d.keywords.split(',').map((x) => x.trim());
  posts.filter((p) => (p.ai_keywords || []).some((k) => kws.includes(k))).slice(0, 18)
    .forEach((p) => dossier_topic_posts.push({ id: ++dtpId, topic_id: i + 1, post_id: p.id, source: 'auto', excluded: false, created_at: p.scraped_at }));
});
const claimPosts = posts.filter((p) => p.platform === 'bale');
let nlId = 0;
const newsletter_posts = [
  ...claimPosts.slice(0, 3).map((p, i) => ({ id: ++nlId, section: 'claims', post_id: p.id, sort_order: i, created_at: iso(NOW - 5 * H) })),
  ...ranked.slice(0, 4).map(({ ps }, i) => ({ id: ++nlId, section: 'news', post_id: ps[0].id, sort_order: i, created_at: iso(NOW - 5 * H) })),
  ...byStory('water').slice(0, 2).map((p, i) => ({ id: ++nlId, section: 'dossier', post_id: p.id, sort_order: i, created_at: iso(NOW - 5 * H) })),
];

// ── روزنامه‌ها (امروز و دیروز) ──
const newspapers = [];
[0, 1].forEach((d) => {
  const day = tehranDay(NOW - d * 24 * H);
  C.NEWSPAPERS.forEach(([slug, title, color], i) => {
    const s = STORIES[(i + d * 3) % STORIES.length];
    newspapers.push({ id: newspapers.length + 1, slug, title, edition_date: day, image_url: `media/newspapers/${slug}-${d}.webp`,
      media_storage_path: null, reader_url: null, scraped_at: iso(NOW - (d * 24 + 4) * H) });
    media.newspapers.push({ file: `${slug}-${d}`, title, color, headline: s.title, sub: s.body.split(/[.؛]/)[0], other: STORIES[(i + 5 + d) % STORIES.length].title, third: STORIES[(i + 9 + d) % STORIES.length].title, day });
  });
});

// ── بسته‌ها و گزارش‌ها ──
const WEEK = 7 * 24 * H;
const magazines = C.MAGAZINES.map((m, i) => {
  media.magazines.push({ file: `issue-${i + 1}`, no: m.no, title: m.title, theme: m.theme });
  return { id: i + 1, title: m.title, issue_no: m.no, publish_date: tehranDay(NOW - i * 2 * WEEK), file_type: 'pdf', files: [`issue-${i + 1}.pdf`],
    cover_url: `media/magazines/issue-${i + 1}.webp`, notes: null, sort_order: i, uploaded_at: iso(NOW - i * 2 * WEEK) };
});
const archive_reports = C.ARCHIVE.map((a, i) => {
  media.archive.push({ file: `archive-${i + 1}`, title: a.title, org: a.org, theme: a.theme });
  return { id: i + 1, title: a.title, source_org: a.org, publish_date: tehranDay(NOW - (i * 3 + 1) * WEEK), file_type: 'pdf',
    files: [`archive-${i + 1}.pdf`], cover_url: `media/archive/archive-${i + 1}.webp`, sort_order: i, uploaded_at: iso(NOW - (i * 3 + 1) * WEEK) };
});
const school_reports = C.SCHOOL_REPORTS.map((r, i) => {
  const file = `school-${i + 1}.${r.kind === 'pdf' ? 'pdf' : 'webp'}`;
  media.school.push({ file, title: r.title, kind: r.kind, variant: i });
  const t = NOW - (r.months * 31 + 2 + i) * 24 * H;
  return { id: i + 1, title: r.title, image_url: '', media_storage_path: file, sort_order: i, uploaded_at: iso(t),
    file_type: r.kind, file_name: file };
});

const db = {
  channels: channels.map(({ _site, ...c }) => c),
  posts,
  categories: C.CATEGORIES,
  regions: C.REGIONS,
  news_topics: C.NEWS_TOPICS.map((t, i) => ({ id: i + 1, ...t, sort_order: i, created_at: iso(NOW - 60 * 24 * H) })),
  dossier_topics, dossier_topic_posts, newsletter_posts,
  magazines, archive_reports, newspapers, school_reports, news_ai_insights,
  profile_groups, channel_profile_groups, hawza_mentions,
  announcements: [{ id: 1, message: 'به نسخه‌ی نمایشی سامانه‌ی جریان خوش آمدید. همه‌ی منابع و مطالب این نسخه نمونه و ساختگی‌اند.', level: 'info', active: true, expires_at: null, created_at: iso(NOW - 2 * H) }],
  site_settings: [{ key: 'hidden_sections', value: ['positions/leader'] }, { key: 'viewer_password_login', value: true }],
  news_pick_edits: [],
};

const out = {
  meta: {
    capturedAt: iso(NOW),
    historic: { posts: 184620, newspapers: 4380, hawza_mentions: 2140 },
    sources: { channels: channels.length, newspapers: 38, crawl: 31 },
    translations,
  },
  tables: db,
};
mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, 'media-manifest.json'), JSON.stringify(media, null, 1));
// با عکس فوری داده‌ی واقعی (npm run demo:fetch) پایه = داده‌ی واقعی؛ --fake = فقط ساختگی
const REAL = resolve(OUT, 'real/data.json');
if (existsSync(REAL) && !process.argv.includes('--fake')) {
  const { mergeReal } = await import('./merge-real.mjs');
  const { out: merged, filled } = mergeReal(out, JSON.parse(readFileSync(REAL, 'utf8')));
  writeFileSync(resolve(OUT, 'data.json'), JSON.stringify(merged));
  writeFileSync(resolve(OUT, 'mode.txt'), 'real');
  const t = merged.tables;
  console.log(`داده‌ی واقعی (${merged.meta.capturedAt}): ${t.channels.length} منبع، ${t.posts.length} مطلب، ${t.newspapers.length} جلد روزنامه`);
  console.log('تکمیل‌شده با داده‌ی ساختگی: ' + (filled.join('، ') || 'هیچ'));
} else {
  writeFileSync(resolve(OUT, 'data.json'), JSON.stringify(out));
  writeFileSync(resolve(OUT, 'mode.txt'), 'fake');
  console.log(`داده‌ی نمایشی ساختگی: ${channels.length} منبع، ${posts.length} مطلب، ${hawza_mentions.length} یافته‌ی حوزه، ${newspapers.length} جلد روزنامه`);
}
