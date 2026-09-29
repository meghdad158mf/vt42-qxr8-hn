// تحلیل هوش مصنوعی دو ویجت تب «آنالیز» بخش «اخبار و رویدادها»:
//   ۱) «اخبار منتخب» — ۱۰ خبر مهم‌تر (نه صرفاً جدیدترین)، بر اساس تکرار
//      زیاد بین منابع یا حساسیت موضوع، به تشخیص هوش مصنوعی — برای هرکدوم
//      هوش مصنوعی یه «headline» فارسی و جمله‌واره‌ی کامل (نه نصفه‌رهاشده)
//      تولید می‌کنه؛ اگه پست اصلی انگلیسی باشه همین headline ترجمه‌شه‌ست
//   ۲) «موضوعات پرتکرار» — موضوعات پرتکرار واقعی متن پست‌ها
//
// ⚠️ بازطراحی مهر ۱۴۰۵ (کاربر: «واقعی‌تر بشه») — سه اشکال نسخه‌ی قبل:
//   • فقط ۱۵۰ پست آخر رو می‌دید (نه کل ۶ ساعت) و پست‌های ایتا (posted_at=NULL)
//     اصلاً وارد نمی‌شدن؛
//   • «تکرار بین منابع» رو مدل باید از روی ۱۵۰ متن بریده حدس می‌زد؛
//   • وقتی لیارا دسته‌ی بزرگ رو رد می‌کرد (معمول)، هر تکه‌ی ۲۰تایی ۱۰ انتخاب
//     برمی‌گردوند و slice(0,10) عملاً انتخاب‌های تکه‌ی اول (= ۲۰ پست آخر) رو
//     نگه می‌داشت — «منتخب» ≈ «جدیدترین».
// حالا: کل پست‌های بازه (تا ۲۰۰۰) خوشه‌بندی می‌شن (_shared/cluster.ts، هر خوشه
// = یه خبر با تعداد واقعی منابع)، ۶۰ خبر پرمنبع‌تر با «تعداد منابع» به مدل
// داده می‌شه، مدل برای هر انتخاب امتیاز ۱–۱۰ می‌ده و ادغام تکه‌ها بر اساس
// امتیاز (نه ترتیب تکه) انجام می‌شه. وزن موضوعات = مجموع پست‌های خبرهای
// همون موضوع (شمارش واقعی، نه عدد حدسی مدل).
//
// روزی چهار بار (هر ۶ ساعت) از GitHub Actions (scripts/analyze_news_insights.py،
// با توکن مدیر) صدا زده می‌شه، نه با هر بار بازکردن تب توسط کاربر — چون
// هر درخواست هزینه‌ی هوش مصنوعی داره. نتیجه توی جدول news_ai_insights کش
// می‌شه؛ فرانت‌اند فقط آخرین ردیف رو می‌خونه (هیچ‌وقت مستقیم این تابع رو
// صدا نمی‌زنه).
//
// مثل translate/index.ts: ورودی فقط windowHours (اختیاری) هست، نه خودِ
// متن — خودِ تابع پست‌های واقعی رو از دیتابیس (با توکن کاربر) می‌خونه، تا
// نتونه به‌عنوان دروازه‌ی آزاد هوش مصنوعی برای متن دلخواه سوءاستفاده بشه.
//
// دیپلوی خودکاره (.github/workflows/deploy-edge-functions.yml) — سکرت‌های
// لازم (LIARA_API_KEY, SUPABASE_ACCESS_TOKEN) از قبل برای translate تنظیم
// شدن، نیازی به تنظیم دوباره نیست.

import { fetchRecentNewsPostsForUser, type WindowPost } from "../_shared/auth.ts";
import { liaraChat, mapLimit } from "../_shared/liara.ts";
import { clusterPosts, postTime, type Cluster } from "../_shared/cluster.ts";

const DEFAULT_WINDOW_HOURS = 6;
const MAX_POSTS_FETCH = 2000;
const MAX_CANDIDATES = 60;
const TEXT_TRUNCATE = 260;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// معیار انتخاب هر خبر منتخب — فهرست ثابت تا برچسب‌ها بین اجراها یکدست بمونن
// (کاربر، مهر ۱۴۰۵: «روی هر خبر منتخب یه لیبل بزنه و معیار منتخب‌شدنش رو بنویسه»)
const CRITERIA = [
  "تصمیم حاکمیتی", // دولت، مجلس، قوه قضاییه، نهادهای حاکمیتی
  "امنیتی و دفاعی",
  "سیاست خارجی",
  "اقتصاد و معیشت",
  "اجتماعی و فرهنگی",
  "حوزه و روحانیت",
  "خراسان و مشهد",
  "حادثه و بحران",
];

const SYSTEM_PROMPT =
  "You are a senior news editor for the political-social monitoring office of the Khorasan Islamic Seminary (Mashhad, Iran). " +
  "You receive candidate news STORIES from the last hours, collected from Iranian news channels (Eitaa/Telegram) and news websites. " +
  "Each candidate = {id, sources, outlets, text}: `sources` is the real number of DISTINCT channels/sites that published this same story " +
  "(computed by us, trust it), `outlets` are some of their names, `text` is one representative post (may be cut).\n" +
  "Produce two things:\n" +
  "1) selected: up to 10 of the MOST IMPORTANT stories. Judge importance by (a) coverage — a higher `sources` is a strong signal; and " +
  "(b) political/social significance for Iran: national politics, government and parliament decisions, security and foreign policy, " +
  "major economic decisions affecting people, social tensions, religious institutions, seminaries and clergy, Khorasan/Mashhad. " +
  "A single-source story may be chosen only if it is clearly highly significant. NEVER select: advertisements, channel promotions, " +
  "greetings/occasion messages, poems or quotes, routine weather, sports results (unless politically significant), or two candidates that " +
  "are the same story. Each item: {\"id\": <a given id, exactly>, \"headline\": \"<ONE complete, factual Persian sentence (max ~25 words) " +
  "stating the news itself — never cut off; if the text is not Persian, translate>\", \"score\": <integer 1-10 importance>, " +
  `\"criterion\": <exactly one of: ${CRITERIA.map((c) => `\"${c}\"`).join(", ")} — the main reason it matters>, ` +
  "\"reason\": \"<a short Persian phrase (max 12 words) saying concretely WHY this story is important for the office; do not repeat the headline>\"}. " +
  "Order by importance.\n" +
  "2) topics: up to 6 real recurring themes across ALL candidates, each {\"name\": \"<short Persian label, 1-3 words>\", " +
  "\"ids\": [<ids of the candidates about this theme>]}. No dates, weekday/month names, or boilerplate as topics.\n" +
  'Respond with ONLY a raw JSON object {"selected":[...],"topics":[...]} — no markdown fences, no commentary. Use only the given ids.';

type AiSelected = { id: number; headline?: string; score?: number; criterion?: string; reason?: string };
type AiTopic = { name: string; ids?: number[] };
type Insight = { selected?: AiSelected[]; topics?: AiTopic[] };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let windowHours = DEFAULT_WINDOW_HOURS;
    try {
      const body = await req.json();
      if (body?.windowHours) windowHours = Number(body.windowHours) || DEFAULT_WINDOW_HOURS;
    } catch {
      // بدنه‌ی خالی هم مجازه — همون پیش‌فرض استفاده می‌شه
    }

    const posts = await fetchRecentNewsPostsForUser(req, windowHours, MAX_POSTS_FETCH);
    if (posts === null) return jsonResponse({ error: "unauthorized" }, 401);
    if (!posts.length) {
      return jsonResponse({ selected_posts: [], topics: [], window_hours: windowHours, note: "no posts in window" });
    }

    // هر خوشه = یه خبر؛ پرمنبع‌ترها (و در تساوی تازه‌ترها) به مدل می‌رن
    const clusters = clusterPosts(posts)
      .sort((a, b) => (b.channels - a.channels) || (postTime(b.posts[b.posts.length - 1]) - postTime(a.posts[a.posts.length - 1])));
    const candidates = clusters.slice(0, MAX_CANDIDATES);
    const byRepId = new Map<number, Cluster<WindowPost>>(candidates.map((c) => [c.rep.id, c]));
    const compact = candidates.map((c) => {
      const outlets = [...new Set(c.posts.map((p) => p.channels?.title).filter(Boolean))].slice(0, 4);
      const t = c.rep.title ? `${c.rep.title} — ${c.rep.text || ""}` : (c.rep.text || "");
      return { id: c.rep.id, sources: c.channels, outlets, text: t.replace(/\s+/g, " ").trim().slice(0, TEXT_TRUNCATE) };
    });

    // ⚠️ لیارا درخواست‌های طولانی رو گاهی بعد از ~۱۸ ثانیه با ۵۰۰ رد می‌کنه —
    // جواب stream می‌شه (_shared/liara.ts) و اگه کل دسته خطا داد، دسته پله‌پله
    // کوچیک‌تر می‌شه (۲۰تایی، بعد ۱۰تایی؛ حداکثر ۴ درخواست هم‌زمان). چون هر
    // تکه امتیاز می‌ده، ادغام بر اساس امتیازه نه ترتیب تکه‌ها. بودجه‌ی زمانی:
    // هر درخواست حداکثر CALL_TIMEOUT_MS و کل کار تا TIME_BUDGET_MS (کالر ۱۲۰ ثانیه صبر می‌کنه).
    const CONCURRENCY = 4;
    const TIME_BUDGET_MS = 90_000;
    const CALL_TIMEOUT_MS = 40_000;
    const deadline = Date.now() + TIME_BUDGET_MS;
    let aiSuccesses = 0;
    let lastError = "";
    async function tryAi(items: typeof compact): Promise<Insight | null> {
      if (Date.now() >= deadline) return null;
      try {
        const content = await liaraChat(SYSTEM_PROMPT, JSON.stringify(items), 0.2, Math.min(CALL_TIMEOUT_MS, deadline - Date.now()));
        const parsed = JSON.parse(content);
        aiSuccesses++;
        return parsed;
      } catch (e) {
        lastError = String(e);
        return null;
      }
    }
    let parts: Insight[] = [];
    for (const size of [...new Set([compact.length, 20, 10])].filter((n) => n <= compact.length)) {
      const chunks: (typeof compact)[] = [];
      for (let i = 0; i < compact.length; i += size) chunks.push(compact.slice(i, i + size));
      const wave = await Promise.all(chunks.slice(0, CONCURRENCY).map(tryAi));
      if (!wave.some(Boolean)) continue;
      const rest = await mapLimit(chunks.slice(CONCURRENCY), CONCURRENCY, tryAi);
      parts = [...wave, ...rest].filter((r): r is Insight => r !== null);
      break;
    }
    if (aiSuccesses === 0) {
      return jsonResponse({ error: "ai request failed", detail: lastError }, 502);
    }

    // اخبار منتخب: فقط idهای واقعاً فرستاده‌شده، بدون تکرار، مرتب با امتیاز مدل
    // و بعد تعداد منابع واقعی
    const seen = new Set<number>();
    const picked: Array<{ c: Cluster<WindowPost>; headline: string; score: number; criterion: string | null; reason: string }> = [];
    for (const part of parts) {
      for (const sp of part.selected || []) {
        const id = Number(sp?.id);
        const c = byRepId.get(id);
        if (!c || seen.has(id)) continue;
        seen.add(id);
        const score = Math.min(10, Math.max(1, Math.round(Number(sp.score) || 5)));
        const criterion = CRITERIA.includes(String(sp.criterion || "").trim()) ? String(sp.criterion).trim() : null;
        picked.push({ c, headline: String(sp.headline || "").trim().slice(0, 300), score, criterion, reason: String(sp.reason || "").trim().slice(0, 120) });
      }
    }
    picked.sort((a, b) => (b.score - a.score) || (b.c.channels - a.c.channels));
    const selectedPosts = picked.slice(0, 10).map(({ c, headline, score, criterion, reason }) => {
      const last = c.posts[c.posts.length - 1];
      return {
        id: c.rep.id,
        headline,
        score,
        criterion,
        reason,
        sources: c.channels,
        posts: c.posts.length,
        channel_id: c.rep.channel_id,
        time: last.posted_at || last.scraped_at,
        link: c.rep.link,
      };
    });

    // موضوعات: وزن = مجموع پست‌های خبرهای همون موضوع (شمارش واقعی)
    const topicMap = new Map<string, Set<number>>();
    for (const part of parts) {
      for (const t of part.topics || []) {
        const name = String(t?.name || "").trim().slice(0, 60);
        if (!name) continue;
        let set = topicMap.get(name);
        if (!set) topicMap.set(name, set = new Set());
        for (const id of t.ids || []) if (byRepId.has(Number(id))) set.add(Number(id));
      }
    }
    const topics = [...topicMap.entries()]
      .map(([name, ids]) => ({ name, weight: [...ids].reduce((s, id) => s + (byRepId.get(id)?.posts.length || 0), 0) }))
      .filter((t) => t.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6);

    // ذخیره‌ی نتیجه با همون توکن کاربر (باید app_admin باشه، طبق RLS جدول)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const authHeader = req.headers.get("Authorization") || "";
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/news_ai_insights`, {
      method: "POST",
      headers: {
        apikey: anonKey ?? "",
        Authorization: authHeader,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ window_hours: windowHours, selected_posts: selectedPosts, topics }),
    });
    if (!insertRes.ok) {
      const detail = await insertRes.text();
      return jsonResponse({ error: "failed to store insights", detail }, 502);
    }

    return jsonResponse({
      selected_posts: selectedPosts,
      topics,
      window_hours: windowHours,
      stats: { posts: posts.length, stories: clusters.length, candidates: candidates.length, ai_calls_ok: aiSuccesses },
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
