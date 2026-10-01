// استخراج یک‌باره‌ی کلیدواژه‌ی هوش مصنوعی برای هر پست (پایه‌ی بخش «پرونده‌های موضوعی»)
//
// چرا: تب «پرونده‌های موضوعی» اخبار مرتبط با موضوعات موقت/چرخشی (مدیر
// تعیین می‌کنه، ممکنه هر چند روز عوض بشه) رو جدا نشون می‌ده. اگه بخوایم
// هر بار موضوعی تعریف/تغییر می‌کنه هوش مصنوعی کل تاریخچه‌ی پست‌ها رو
// دوباره بخونه، هزینه‌ی توکن زیاد می‌شه. به‌جاش هر پست فقط یک‌بار (وقتی
// posts.ai_keywords هنوز NULLه) با هوش مصنوعی به چندتا کلیدواژه‌ی
// فارسی/دقیق/بدون‌ابهام برچسب می‌خوره؛ تطبیق موضوع بعدش فقط یه
// مقایسه‌ی متنی سادهٔ رایگانه (نه هوش مصنوعی).
//
// از همین پاس، یه کار دوم و مستقل هم انجام می‌شه — تشخیص سیاسی/اجتماعی‌
// بودن پست‌های تب «اخبار حوزه» (migration_027/029): فیدهای RSS دو تا از
// سه کانال «اخبار حوزه» عمومی‌ان (همه‌ی موضوعات رو می‌گیرن)، پس از هوش
// مصنوعی برای **همه‌ی** پست‌های دسته (بدون قید شرط، برای قابل‌اعتمادتر
// بودن پاسخ) یه فیلد اضافه (hawza_relevant) هم خواسته می‌شه؛ فقط توی کد،
// این مقدار صرفاً برای پست‌های کانال‌های show_in_hawza=true واقعاً نوشته
// می‌شه (برای بقیه نادیده گرفته می‌شه) — posts.hawza_relevant=true تنها
// پست‌هاییه که توی تب «اخبار حوزه» نشون داده می‌شن.
//
// هر ۲ ساعت، **مستقل** از news-insights (نه هم‌زمان با اون، نه هم‌زمان
// با کالکتورها) از GitHub Actions (scripts/extract_keywords.py، با توکن
// مدیر) صدا زده می‌شه.
//
// resumable + اولویت با تازه‌ها: fetchPostsMissingKeywords همیشه
// جدیدترین پست‌های ai_keywords IS NULL رو می‌گیره (ORDER BY posted_at
// DESC، چون این فیچر روی موضوعات موقت/جاری کار می‌کنه) — اگه یه اجرا
// fail بشه یا نصفه بمونه، اجرای بعدی خودکار همون‌ها رو دوباره امتحان
// می‌کنه؛ backlog قدیمی هم بالأخره (وقتی دیگه پست تازه‌ی بی‌کلیدواژه‌ای
// نمونده) توی اجراهای بعدی پردازش می‌شه.
//
// مثل translate/news-insights: ورودی فقط limit (اختیاری) هست، نه خودِ
// متن — خودِ تابع پست‌های واقعی رو از دیتابیس (با توکن کاربر) می‌خونه، تا
// نتونه دروازه‌ی آزاد هوش مصنوعی برای متن دلخواه بشه.
//
// دیپلوی خودکاره (.github/workflows/deploy-edge-functions.yml) — سکرت‌های
// لازم (LIARA_API_KEY, SUPABASE_ACCESS_TOKEN) از قبل برای translate/
// news-insights تنظیم شدن، نیازی به تنظیم دوباره نیست.

import { fetchPostsMissingKeywords, isAdminRequest } from "../_shared/auth.ts";
import { AiTimeoutError, liaraChat, mapLimit } from "../_shared/liara.ts";

const DEFAULT_LIMIT = 80; // هم‌راستا با BATCH_LIMIT در scripts/extract_keywords.py — کالر همیشه صریح limit می‌فرسته، این فقط fallbacke
const TEXT_TRUNCATE = 400;

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
    let limit = DEFAULT_LIMIT;
    try {
      const body = await req.json();
      if (body?.limit) limit = Number(body.limit) || DEFAULT_LIMIT;
    } catch {
      // بدنه‌ی خالی هم مجازه — همون پیش‌فرض استفاده می‌شه
    }
    limit = Math.min(200, Math.max(1, Math.floor(limit)));

    // فقط مدیر (کالر واقعی extract_keywords.py با توکن مدیره) — همون دلیل news-insights
    if (!(await isAdminRequest(req))) return jsonResponse({ error: "admin only" }, 403);

    const result = await fetchPostsMissingKeywords(req, limit);
    if (result === null) return jsonResponse({ error: "unauthorized" }, 401);
    const { posts, hawzaChannelIds } = result;
    if (!posts.length) {
      return jsonResponse({ processed: 0, matched: 0, note: "no posts pending" });
    }

    // ⚠️ hawza_relevant عمداً بدون هیچ پرچم شرطی («فقط برای این پست‌ها»)
    // از هوش مصنوعی خواسته می‌شه — یه نسخه‌ی قبلی این کد یه فیلد
    // اختیاری (needsHawzaCheck) می‌فرستاد و فقط برای اون‌ها hawza_relevant
    // می‌خواست؛ در عمل مدل این فیلد شرطی رو برای همه‌ی پست‌های لازم برنمی‌گردوند
    // (احتمالاً چون وسط یه batch مختلط، رعایت یه قانون شرطی برای زیرمجموعه‌ای
    // از آیتم‌ها قابل‌اعتماد نیست) و کد هم غیبت رو با false پر می‌کرد — نتیجه:
    // حتی خبرهای قطعاً سیاسی (فید اختصاصی سیاسی رسا) هم همه false ثبت شدن.
    // رفعش: مثل keywords، از مدل خواسته می‌شه این فیلد رو **برای همه‌ی پست‌ها
    // بدون استثنا** برگردونه (همون الگوی «هیچ‌کدوم رو جا نندار» که برای
    // keywords قبلاً ثابت‌شده قابل‌اعتماده) — فقط توی کد، مقدارش صرفاً برای
    // پست‌های hawzaChannelIds.has(channel_id) واقعاً نوشته می‌شه.
    const compact = posts.map((p) => ({
      id: p.id,
      title: p.title || null,
      text: (p.text || "").slice(0, TEXT_TRUNCATE),
    }));

    const SYSTEM_PROMPT =
              "You extract keywords from a batch of Persian/English news posts (each with an id, title, text). " +
              "For EVERY post in the batch, without exception, return exactly one entry — never skip a post, " +
              "even if it has no meaningful content (in that case return an empty keywords array for it).\n" +
              "Each entry: {\"id\": <one of the given post ids, exactly>, \"keywords\": [<Persian keyword " +
              "strings>], \"hawza_relevant\": true or false}.\n" +
              "Rules for keywords:\n" +
              "- Always write keywords in Persian, regardless of the post's original language (translate " +
              "entity/topic names, do not leave them in the source language).\n" +
              "- Cover every important topic, person, and organization mentioned in the post. Do NOT force a " +
              "fixed count — use as many as truly needed to fully capture the post (could be 3, could be 9).\n" +
              "- Each keyword must be self-contained and unambiguous on its own. A bare generic term like " +
              "\"وزارت خارجه\" or \"رئیس‌جمهور\" is NOT acceptable if it could belong to more than one country " +
              "or organization — always specify which one, e.g. \"وزارت خارجه ایران\" vs \"وزارت خارجه آمریکا\", " +
              "\"رئیس‌جمهور ایران\" vs \"رئیس‌جمهور آمریکا\".\n" +
              "\n" +
              "Rules for hawza_relevant — for EVERY post, without exception (this field is mandatory on every " +
              "entry, exactly like keywords), classify whether the post is genuinely POLITICAL or SOCIAL news:\n" +
              "- true = POLITICAL news (government, elections, foreign policy, international relations, " +
              "sanctions/diplomacy, statements by political or religious authorities specifically about " +
              "political matters, protests, political institutions/parties) OR SOCIAL news (social issues, " +
              "family, education, public welfare, the economy as it affects society, social pathologies, " +
              "social critique or commentary).\n" +
              "- false = purely religious/theological content (fiqh rulings, sermons, religious rituals or " +
              "ceremonies, spiritual/moral lessons with no political or social angle), seminary/hawza internal " +
              "or administrative announcements (class schedules, exam notices, seminary management news), " +
              "cultural or literary content, sports, obituary or condolence notices, or anything else that is " +
              "not clearly political or social.\n" +
              'Respond with ONLY a raw JSON object like {"results":[{"id":1,"keywords":["..."]}, ...]} and ' +
              "nothing else — no markdown fences, no extra commentary. The results array MUST have exactly one " +
              "entry per input post id, using only ids from the given list.";

    type KwResult = { id: number; keywords?: string[]; hawza_relevant?: boolean };
    // یه فراخوانی هوش مصنوعی برای یه تیکه از دسته — در صورت خطا throw می‌کنه
    async function callAi(items: typeof compact, timeoutMs: number): Promise<KwResult[]> {
      const content = await liaraChat(SYSTEM_PROMPT, JSON.stringify(items), 0.1, timeoutMs);
      try {
        return JSON.parse(content).results || [];
      } catch {
        throw new Error(`ai returned invalid json: ${content.slice(0, 200)}`);
      }
    }

    // ⚠️ مهر ۱۴۰۵: لیارا درخواست‌های چندپستی رو بعد از ~۱۸ ثانیه با ۵۰۰ رد
    // می‌کرد (ترجمه‌ی تک‌پستی سالم بود) — حتی تیکه‌های ۲۰تایی. حالا جواب
    // stream می‌شه (_shared/liara.ts)، تیکه‌ها ۵تایی‌ان و حداکثر CONCURRENCY
    // تا هم‌زمان می‌رن. تیکه‌ی ناموفق به تک‌پست شکسته می‌شه تا اگه مشکل از
    // یه پست خاص باشه، فقط همون جدا بشه.
    // بعد از اون جواب‌ها کُند شدن و کل تابع از سقف ۱۲۰ ثانیه‌ای اسکریپت رد شد و
    // هیچی ذخیره نشد — برای همین بودجه‌ی زمانی داره: بعد از TIME_BUDGET_MS
    // درخواست جدیدی شروع نمی‌شه، هر چی تموم شده ذخیره می‌شه و پست‌های
    // نرسیده/timeout‌شده NULL می‌مونن تا اجرای بعدی.
    // ⚠️ به درخواست کاربر: پستی که تنها فرستاده بشه و با فرصت کامل (≥ FULL_TIMEOUT_MS)
    // هم جواب نگیره، «یک خطا» می‌خوره (فقط ai_keywords_extracted_at پر می‌شه و
    // ai_keywords همون NULL می‌مونه)؛ دفعه‌ی دوم که همین اتفاق بیفته، با {} کنار
    // گذاشته می‌شه تا یه پست کُند برای همیشه توی صف نچرخه.
    const CHUNK_SIZE = 5;
    const CONCURRENCY = 4;
    const TIME_BUDGET_MS = 75_000; // + زمان PATCHهای پایین، باید زیر ۱۲۰ ثانیه‌ی اسکریپت بمونه
    const CALL_TIMEOUT_MS = 45_000;
    const FULL_TIMEOUT_MS = 20_000; // timeout کمتر از این = تقصیر ته‌مونده‌ی بودجه‌ست، نه پست
    const deadline = Date.now() + TIME_BUDGET_MS;
    const failedIds: number[] = [];
    // پست‌هایی که واقعاً جواب گرفتن یا به‌تنهایی خطای غیرزمانی دادن — فقط این‌ها علامت می‌خورن
    const doneIds = new Set<number>();
    let aiSuccesses = 0;
    let lastError = "";
    // null = خطا (قابل تکرار تک‌پستی)؛ "timeout" = با فرصت کامل جواب نیومد؛
    // "skipped" = وقت کافی نبود، پست‌ها دست‌نخورده می‌مونن
    type ChunkOutcome = KwResult[] | null | "timeout" | "skipped";
    async function tryChunk(items: typeof compact): Promise<ChunkOutcome> {
      const allotted = Math.min(CALL_TIMEOUT_MS, deadline - Date.now());
      if (allotted <= 0) return "skipped";
      try {
        const r = await callAi(items, allotted);
        aiSuccesses++;
        items.forEach((p) => doneIds.add(p.id));
        return r;
      } catch (e) {
        lastError = String(e);
        if (e instanceof AiTimeoutError) return allotted >= FULL_TIMEOUT_MS ? "timeout" : "skipped";
        return null;
      }
    }
    const prevStrike = new Set(posts.filter((p) => p.ai_keywords === null && p.ai_keywords_extracted_at).map((p) => p.id));
    const strikeIds: number[] = [];
    const chunks: Array<typeof compact> = [];
    for (let i = 0; i < compact.length; i += CHUNK_SIZE) chunks.push(compact.slice(i, i + CHUNK_SIZE));
    // موج اول: CONCURRENCY تیکه‌ی اول. اگه هیچ‌کدوم موفق نشد، سرویس کلاً از
    // دسترس خارجه — ادامه بی‌فایده‌ست، مستقیم ۵۰۲
    const firstWave = await Promise.all(chunks.slice(0, CONCURRENCY).map(tryChunk));
    const firstRound: ChunkOutcome[] = [...firstWave];
    if (aiSuccesses > 0) {
      firstRound.push(...(await mapLimit(chunks.slice(CONCURRENCY), CONCURRENCY, tryChunk)));
    }
    const parsedResults: KwResult[] = [];
    if (aiSuccesses > 0) {
      // تیکه‌های خطادار یا timeout‌شده: هر پست تنها یه‌بار دیگه امتحان می‌شه
      const retryPosts: typeof compact = [];
      firstRound.forEach((r, i) => {
        if (Array.isArray(r)) parsedResults.push(...r);
        else if (r === null || r === "timeout") retryPosts.push(...chunks[i]);
      });
      const singles = await mapLimit(retryPosts, CONCURRENCY, (p) => tryChunk([p]));
      singles.forEach((r, i) => {
        const id = retryPosts[i].id;
        if (Array.isArray(r)) parsedResults.push(...r);
        else if (r === null || (r === "timeout" && prevStrike.has(id))) {
          failedIds.push(id);
          doneIds.add(id);
        } else if (r === "timeout") {
          strikeIds.push(id);
        }
      });
    }

    // اگه هیچ فراخوانی موفق نشد، مشکل از خودِ سرویسه نه یه پست خاص — هیچ
    // پستی علامت نخوره (NULL بمونه) تا اجرای بعدی دوباره امتحان کنه
    if (aiSuccesses === 0) {
      return jsonResponse({ error: "ai request failed", detail: lastError }, 502);
    }
    // پست‌هایی که حتی تنها هم خطا دادن (failedIds) توی نتایج نیستن، پس پایین‌تر
    // مثل پست‌های جاافتاده صریح با [] علامت می‌خورن — تا یه پست مشکل‌دار صف رو
    // برای همیشه گیر نندازه (هر بار جدیدترین‌ها اول انتخاب می‌شن)
    const parsed = { results: parsedResults };

    // اعتبارسنجی: idهای هذیان‌گفته‌شده حذف می‌شن؛ هر id فقط یک‌بار اعمال می‌شه
    const validIds = new Set(posts.map((p) => p.id));
    const channelById = new Map(posts.map((p) => [p.id, p.channel_id]));
    const results = new Map<number, string[]>();
    const hawzaResults = new Map<number, boolean>();
    for (const r of parsed.results || []) {
      const id = Number(r.id);
      if (!validIds.has(id) || !doneIds.has(id) || results.has(id)) continue;
      const keywords = Array.isArray(r.keywords)
        ? r.keywords.map((k) => String(k).slice(0, 80)).filter(Boolean).slice(0, 20)
        : [];
      results.set(id, keywords);
      // فقط برای کانال‌های واقعاً «اخبار حوزه» ذخیره می‌شه — هوش مصنوعی این
      // فیلد رو برای همه‌ی پست‌ها برمی‌گردونه (طبق طراحی، بدون قید شرط)،
      // ولی مقدارش برای بقیه‌ی کانال‌ها هیچ‌وقت خونده/نوشته نمی‌شه
      if (hawzaChannelIds.has(channelById.get(id)!)) {
        hawzaResults.set(id, r.hawza_relevant === true);
      }
    }

    // پست‌هایی که هوش مصنوعی جا انداخته (پاسخ ناقص) رو هم صریح با آرایه‌ی
    // خالی علامت می‌زنیم — طبق طراحی، هیچ پستی نباید بدون رد بمونه، وگرنه
    // NULL می‌مونه و هر اجرا دوباره براش فرستاده می‌شه
    // فقط پست‌هایی که واقعاً پردازش شدن (doneIds) — پست‌هایی که وقت بهشون
    // نرسید NULL می‌مونن تا اجرای بعدی
    for (const p of posts) {
      if (!doneIds.has(p.id)) continue;
      if (!results.has(p.id)) results.set(p.id, []);
      // همین‌طور hawza_relevant — اگه جا افتاده باشه، false (نه NULL) تا
      // دوباره پردازش نشه؛ امن‌تره که پست نامشخص از تب مخفی بمونه تا اینکه اشتباهی نشون داده بشه
      if (hawzaChannelIds.has(p.channel_id) && !hawzaResults.has(p.id)) {
        hawzaResults.set(p.id, false);
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const authHeader = req.headers.get("Authorization") || "";
    const writeHeaders = {
      apikey: anonKey ?? "",
      Authorization: authHeader,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    };

    const nowIso = new Date().toISOString();
    let updated = 0;
    for (const [id, keywords] of results) {
      const patchBody: Record<string, unknown> = { ai_keywords: keywords, ai_keywords_extracted_at: nowIso };
      // فقط پست‌های کانال‌های «اخبار حوزه» این ستون رو دارن؛ برای بقیه
      // اصلاً توی patch نمی‌فرستیمش (NULL دائمی، بی‌ضرر، هیچ‌جا خونده نمی‌شه)
      if (hawzaResults.has(id)) patchBody.hawza_relevant = hawzaResults.get(id);
      const patchRes = await fetch(`${supabaseUrl}/rest/v1/posts?id=eq.${id}`, {
        method: "PATCH",
        headers: writeHeaders,
        body: JSON.stringify(patchBody),
      });
      if (patchRes.ok) updated++;
    }
    // «خطای اول» پست‌هایی که تنها هم جواب نگرفتن: فقط زمان ثبت می‌شه، ai_keywords همون NULL
    if (strikeIds.length) {
      await fetch(`${supabaseUrl}/rest/v1/posts?id=in.(${strikeIds.join(",")})&ai_keywords=is.null`, {
        method: "PATCH",
        headers: writeHeaders,
        body: JSON.stringify({ ai_keywords_extracted_at: nowIso }),
      });
    }

    // تطبیق خودکار موضوعات فعال «پرونده‌های موضوعی» با کلیدواژه‌های تازه —
    // مقایسه‌ی متنی ساده (نه هوش مصنوعی)، برای همین دسته‌ی تازه‌پردازش‌شده
    const topicsRes = await fetch(
      `${supabaseUrl}/rest/v1/dossier_topics?select=id,keywords&active=eq.true`,
      { headers: { apikey: anonKey ?? "", Authorization: authHeader } },
    );
    let matched = 0;
    if (topicsRes.ok) {
      const topics: Array<{ id: number; keywords: string }> = await topicsRes.json();
      const inserts: Array<{ topic_id: number; post_id: number; source: string }> = [];
      for (const topic of topics) {
        const topicKeywords = topic.keywords.split(",").map((k) => k.trim()).filter(Boolean);
        if (!topicKeywords.length) continue;
        for (const [postId, postKeywords] of results) {
          if (!postKeywords.length) continue;
          const hasMatch = topicKeywords.some((tk) =>
            postKeywords.some((pk) => pk.includes(tk) || tk.includes(pk))
          );
          if (hasMatch) inserts.push({ topic_id: topic.id, post_id: postId, source: "auto" });
        }
      }
      if (inserts.length) {
        // on_conflict + resolution=ignore-duplicates: چون همین پست ممکنه
        // قبلاً دستی هم به همین موضوع اضافه شده باشه (unique(topic_id,post_id))
        const insertRes = await fetch(
          `${supabaseUrl}/rest/v1/dossier_topic_posts?on_conflict=topic_id,post_id`,
          {
            method: "POST",
            headers: { ...writeHeaders, Prefer: "resolution=ignore-duplicates,return=minimal" },
            body: JSON.stringify(inserts),
          },
        );
        if (insertRes.ok) matched = inserts.length;
      }
    }

    return jsonResponse({
      processed: updated,
      matched,
      ai_calls_ok: aiSuccesses,
      skipped_post_ids: failedIds,
      left_for_next_run: posts.length - doneIds.size,
      timeout_strikes: strikeIds,
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
