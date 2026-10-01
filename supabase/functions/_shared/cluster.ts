// خوشه‌بندی پست‌هایی که یه خبر واحد رو روایت می‌کنن — همون الگوریتم کادر
// «موج‌های خبری» فرانت‌اند (computeNewsWaves)، برای news-insights تا «اخبار
// منتخب» بر اساس تعداد واقعی منابع هر خبر انتخاب بشه، نه حدس مدل.
// پیوند دو پست: (۱) ≥۳ سه‌کلمه‌ای مشترک با سهم ≥۵۰٪ پست کوتاه‌تر (کپی/بازنشر
// حتی با امضای متفاوت)، یا (۲) ≥۳ کلیدواژه‌ی هوش مصنوعی مشترک (کلیدواژه‌ی
// خیلی عام کنار گذاشته می‌شه). ⚠️ با تغییر این منطق، نسخه‌ی فرانت رو هم هم‌سو کن.

export type ClusterPost = {
  id: number;
  channel_id: number;
  title?: string | null;
  text?: string | null;
  ai_keywords?: string[] | null;
  posted_at?: string | null;
  scraped_at?: string | null;
};

export type Cluster<P extends ClusterPost> = {
  posts: P[]; // به ترتیب زمان (قدیمی‌ترین اول)
  channels: number; // تعداد کانال‌های متمایز
  rep: P; // پست نماینده (بیشترین همپوشانی با بقیه)
};

const STOP = new Set(
  ("از به در که و را این با برای تا آن هم بر یک ها های می شد شده است بود کرد کند اند ای یا اما نیز پس چه همه دیگر " +
    "وی او ما شما آنها خود هر اگر باید شود نمی کرده گفت داد دارد نیست بین روی پیش پی").split(" "),
);

export function normText(s: string | null | undefined): string {
  return String(s || "")
    .replace(/https?:\/\/\S+/g, " ").replace(/@[\w_]+/g, " ")
    .replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[ۀة]/g, "ه").replace(/[أإآ]/g, "ا").replace(/ؤ/g, "و")
    .replace(/[ً-ٰٟ]/g, "").replace(/‌/g, " ")
    .toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ");
}

function shingles(p: ClusterPost): Set<string> {
  const w = normText((p.title || "") + " " + (p.text || "")).split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t)).slice(0, 150);
  const out = new Set<string>();
  for (let i = 0; i + 2 < w.length; i++) out.add(w[i] + " " + w[i + 1] + " " + w[i + 2]);
  return out;
}

export function postTime(p: ClusterPost): number {
  return new Date(p.posted_at || p.scraped_at || 0).getTime();
}

export function clusterPosts<P extends ClusterPost>(items: P[]): Cluster<P>[] {
  const n = items.length;
  const parent = items.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const union = (a: number, b: number) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };

  const sh = items.map(shingles);
  const index = new Map<string, number[]>();
  sh.forEach((set, i) => {
    if (set.size < 4) return;
    set.forEach((g) => { let l = index.get(g); if (!l) index.set(g, l = []); l.push(i); });
  });
  for (let i = 0; i < n; i++) {
    if (sh[i].size < 4) continue;
    const shared = new Map<number, number>();
    sh[i].forEach((g) => {
      const l = index.get(g);
      if (!l || l.length > 400) return;
      for (const j of l) if (j > i) shared.set(j, (shared.get(j) || 0) + 1);
    });
    shared.forEach((c, j) => { if (c >= 3 && c / Math.min(sh[i].size, sh[j].size) >= 0.5) union(i, j); });
  }

  const kwOf = items.map((p) =>
    Array.isArray(p.ai_keywords)
      ? [...new Set(p.ai_keywords.map((k) => normText(k).replace(/\s+/g, " ").trim()).filter(Boolean))]
      : []
  );
  const kwIndex = new Map<string, number[]>();
  kwOf.forEach((ks, i) => {
    if (ks.length < 3) return;
    ks.forEach((k) => { let l = kwIndex.get(k); if (!l) kwIndex.set(k, l = []); l.push(i); });
  });
  const kwPosts = kwOf.filter((ks) => ks.length >= 3).length;
  const kwMax = Math.max(15, Math.round(kwPosts * 0.05));
  for (let i = 0; i < n; i++) {
    if (kwOf[i].length < 3) continue;
    const shared = new Map<number, number>();
    kwOf[i].forEach((k) => {
      const l = kwIndex.get(k) || [];
      if (l.length > kwMax) return;
      for (const j of l) if (j > i) shared.set(j, (shared.get(j) || 0) + 1);
    });
    shared.forEach((c, j) => { if (c >= 3) union(i, j); });
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let g = groups.get(r);
    if (!g) groups.set(r, g = []);
    g.push(i);
  }
  const out: Cluster<P>[] = [];
  groups.forEach((idx) => {
    const freq = new Map<string, number>();
    idx.forEach((i) => sh[i].forEach((g) => freq.set(g, (freq.get(g) || 0) + 1)));
    let best = idx[0], bestScore = -1;
    idx.forEach((i) => {
      let sc = 0;
      sh[i].forEach((g) => { sc += (freq.get(g) || 1) - 1; });
      sc = sh[i].size ? sc / Math.sqrt(sh[i].size) : 0;
      if (sc > bestScore) { bestScore = sc; best = i; }
    });
    out.push({
      posts: idx.map((i) => items[i]).sort((a, b) => postTime(a) - postTime(b)),
      channels: new Set(idx.map((i) => items[i].channel_id)).size,
      rep: items[best],
    });
  });
  return out;
}
