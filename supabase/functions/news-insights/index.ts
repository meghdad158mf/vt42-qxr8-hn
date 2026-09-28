// تحلیل هوش مصنوعی دو ویجت تب «آنالیز» بخش «اخبار و رویدادها»:
//   ۱) «اخبار منتخب» — ۱۰ خبر مهم‌تر (نه صرفاً جدیدترین)، بر اساس تکرار
//      زیاد بین منابع یا حساسیت موضوع، به تشخیص هوش مصنوعی — برای هرکدوم
//      هوش مصنوعی یه «headline» فارسی و جمله‌واره‌ی کامل (نه نصفه‌رهاشده)
//      تولید می‌کنه؛ اگه پست اصلی انگلیسی باشه همین headline ترجمه‌شه‌ست
//   ۲) «موضوعات پرتکرار» — موضوعات پرتکرار واقعی متن پست‌ها
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

import { fetchRecentNewsPostsForUser } from "../_shared/auth.ts";

const LIARA_BASE_URL = "https://ai.liara.ir/api/6a9271a1d6564b043acdefe1/v1";
const LIARA_MODEL = "openai/gpt-4o-mini";
const DEFAULT_WINDOW_HOURS = 6;
const MAX_POSTS_TO_MODEL = 150;
const TEXT_TRUNCATE = 220;

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
      // بدنه‌ی خالی هم مجازه — همون پیش‌فرض ۱۲ ساعت استفاده می‌شه
    }

    const posts = await fetchRecentNewsPostsForUser(req, windowHours, MAX_POSTS_TO_MODEL);
    if (posts === null) return jsonResponse({ error: "unauthorized" }, 401);
    if (!posts.length) {
      return jsonResponse({ selected_posts: [], topics: [], window_hours: windowHours, note: "no posts in window" });
    }

    const compact = posts.map((p) => ({
      id: p.id,
      source: p.channels?.title || null,
      title: p.title || null,
      text: (p.text || "").slice(0, TEXT_TRUNCATE),
    }));

    const liaraKey = Deno.env.get("LIARA_API_KEY");
    const SYSTEM_PROMPT =
              "You analyze a batch of Persian/English news posts (each with an id, source, title, text) from the " +
              `last ${windowHours} hours and produce two things:\n` +
              "1) selected_posts: up to 10 of the MOST IMPORTANT posts (importance = the same story repeated " +
              "across multiple sources, OR a sensitive/high-impact political-social topic) — NOT simply the most " +
              "recent. Each item is {\"id\": <one of the given post ids, exactly>, \"headline\": \"<a single " +
              "complete Persian sentence summarizing this specific post — never cut off mid-sentence/mid-word. " +
              "If the post's original title/text is in English or any non-Persian language, this headline MUST " +
              "be its Persian translation, not the original language>\"}.\n" +
              "2) topics: up to 6 real recurring topics/themes across the batch, each {\"name\": \"<short Persian " +
              "topic label, 1-3 words>\", \"weight\": <integer count of posts about it>}. Do NOT include dates, " +
              "weekday/month names, or generic website boilerplate as topics.\n" +
              'Respond with ONLY a raw JSON object like {"selected_posts":[...],"topics":[...]} and nothing else ' +
              "— no markdown fences, no extra commentary. ids in selected_posts MUST be from the given list only.";
    type Insight = { selected_posts?: Array<{ id: number; headline?: string }>; topics?: Array<{ name: string; weight?: number }> };

    async function callAi(items: typeof compact): Promise<Insight> {
      const aiRes = await fetch(`${LIARA_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${liaraKey}` },
        body: JSON.stringify({
          model: LIARA_MODEL,
          temperature: 0.2,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(items) },
          ],
        }),
      });
      if (!aiRes.ok) throw new Error(`ai ${aiRes.status}: ${(await aiRes.text()).slice(0, 300)}`);
      const aiData = await aiRes.json();
      let content: string = aiData?.choices?.[0]?.message?.content || "{}";
      content = content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");
      try {
        return JSON.parse(content);
      } catch {
        return {};
      }
    }

    // ⚠️ مهر ۱۴۰۵: لیارا روی دسته‌ی کامل با خطای ۵۰۰ جواب می‌داد (درخواست
    // تک‌پستی ترجمه سالم بود). اول کل دسته امتحان می‌شه؛ اگه خطا داد، دسته
    // به تکه‌های CHUNK_SIZE تایی (موازی) تقسیم می‌شه؛ اگه هیچ تکه‌ای موفق
    // نشد یعنی مشکل از خودِ لیاراست و ۵۰۲ برمی‌گرده؛ وگرنه تکه‌های ناموفق
    // نصف‌نصف می‌شن (تا MIN_SPLIT) تا پست مشکل‌دار کنار بره و نتیجه‌ها ادغام می‌شن.
    const CHUNK_SIZE = 20;
    const MIN_SPLIT = 5;
    let aiSuccesses = 0;
    let lastError = "";
    async function tryAi(items: typeof compact): Promise<Insight | null> {
      try {
        const r = await callAi(items);
        aiSuccesses++;
        return r;
      } catch (e) {
        lastError = String(e);
        return null;
      }
    }
    async function bisect(items: typeof compact): Promise<Insight[]> {
      if (items.length <= MIN_SPLIT) return [];
      const mid = Math.ceil(items.length / 2);
      const halves = [items.slice(0, mid), items.slice(mid)];
      const res = await Promise.all(halves.map(tryAi));
      const out: Insight[] = [];
      for (let i = 0; i < 2; i++) out.push(...(res[i] ? [res[i] as Insight] : await bisect(halves[i])));
      return out;
    }
    let parts: Insight[] = [];
    const full = await tryAi(compact);
    if (full) {
      parts = [full];
    } else if (compact.length > CHUNK_SIZE) {
      const chunks: (typeof compact)[] = [];
      for (let i = 0; i < compact.length; i += CHUNK_SIZE) chunks.push(compact.slice(i, i + CHUNK_SIZE));
      const res = await Promise.all(chunks.map(tryAi));
      if (aiSuccesses > 0) {
        for (let i = 0; i < chunks.length; i++) parts.push(...(res[i] ? [res[i] as Insight] : await bisect(chunks[i])));
      }
    } else {
      parts = await bisect(compact);
    }
    if (aiSuccesses === 0) {
      return jsonResponse({ error: "ai request failed", detail: lastError }, 502);
    }
    // ادغام: اخبار منتخب به ترتیب از همه‌ی بخش‌ها، موضوعات هم‌نام با جمع وزن
    const topicMap = new Map<string, number>();
    for (const part of parts) {
      for (const t of part.topics || []) {
        if (!t || !t.name) continue;
        const k = String(t.name).trim();
        topicMap.set(k, (topicMap.get(k) || 0) + Math.max(1, Number(t.weight) || 1));
      }
    }
    const parsed: Insight = {
      selected_posts: parts.flatMap((p) => p.selected_posts || []),
      topics: [...topicMap.entries()].sort((a, b) => b[1] - a[1]).map(([name, weight]) => ({ name, weight })),
    };

    // اعتبارسنجی: idهای هذیان‌گفته‌شده (که توی دسته‌ی واقعی نبودن) رو حذف کن
    const validIds = new Set(posts.map((p) => p.id));
    const selectedPosts = (parsed.selected_posts || [])
      .filter((sp) => validIds.has(Number(sp.id)))
      .slice(0, 10)
      .map((sp) => ({ id: Number(sp.id), headline: String(sp.headline || "").slice(0, 300) }));
    const topics = (parsed.topics || [])
      .filter((t) => t && t.name)
      .slice(0, 6)
      .map((t) => ({ name: String(t.name).slice(0, 60), weight: Math.max(1, Number(t.weight) || 1) }));

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

    return jsonResponse({ selected_posts: selectedPosts, topics, window_hours: windowHours });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
