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

import { fetchPostsMissingKeywords } from "../_shared/auth.ts";

const LIARA_BASE_URL = "https://ai.liara.ir/api/6a9271a1d6564b043acdefe1/v1";
const LIARA_MODEL = "openai/gpt-4o-mini";
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

    const liaraKey = Deno.env.get("LIARA_API_KEY");
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

    // یه فراخوانی هوش مصنوعی برای یه تیکه از دسته — در صورت خطا throw می‌کنه
    async function callAi(items: typeof compact): Promise<Array<{ id: number; keywords?: string[]; hawza_relevant?: boolean }>> {
      const aiRes = await fetch(`${LIARA_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${liaraKey}` },
        body: JSON.stringify({
          model: LIARA_MODEL,
          temperature: 0.1,
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
        return JSON.parse(content).results || [];
      } catch {
        return [];
      }
    }

    // ⚠️ مهر ۱۴۰۵: لیارا روی دسته‌ی کامل ۸۰تایی با خطای ۵۰۰ جواب می‌داد
    // (درخواست تک‌پستی ترجمه همون موقع سالم بود). برای همین دسته به
    // تیکه‌های CHUNK_SIZE تایی موازی شکسته می‌شه و هر تیکه‌ی ناموفق دوباره
    // نصف می‌شه تا به تک‌پست برسه — اگه مشکل از یه پست خاص باشه، فقط همون
    // جدا می‌شه و بقیه‌ی صف جلو می‌ره.
    const CHUNK_SIZE = 20;
    const failedIds: number[] = [];
    let aiSuccesses = 0;
    let lastError = "";
    // هر تیکه‌ی ناموفق به ۴ قسمت شکسته می‌شه (۲۰ → ۵ → ۱)، موازی — تا زمان کل
    // از سقف Edge Function (~۱۵۰ ثانیه) رد نشه
    async function processChunk(items: typeof compact): Promise<Array<{ id: number; keywords?: string[]; hawza_relevant?: boolean }>> {
      try {
        const r = await callAi(items);
        aiSuccesses++;
        return r;
      } catch (e) {
        lastError = String(e);
        if (items.length === 1) {
          failedIds.push(items[0].id);
          return [];
        }
        const size = Math.ceil(items.length / 4);
        const parts: Array<typeof compact> = [];
        for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
        return (await Promise.all(parts.map(processChunk))).flat();
      }
    }
    const chunks: Array<typeof compact> = [];
    for (let i = 0; i < compact.length; i += CHUNK_SIZE) chunks.push(compact.slice(i, i + CHUNK_SIZE));
    // دور اول: همه‌ی تیکه‌ها یه‌بار. اگه هیچ‌کدوم موفق نشد، سرویس کلاً از دسترس
    // خارجه — دیگه شکستن فایده نداره، مستقیم ۵۰۲
    const firstRound = await Promise.all(chunks.map(async (c) => {
      try {
        const r = await callAi(c);
        aiSuccesses++;
        return { ok: true, r, c };
      } catch (e) {
        lastError = String(e);
        return { ok: false, r: [] as Array<{ id: number; keywords?: string[]; hawza_relevant?: boolean }>, c };
      }
    }));
    let parsedResults: Array<{ id: number; keywords?: string[]; hawza_relevant?: boolean }> = [];
    if (aiSuccesses > 0) {
      const retried = await Promise.all(firstRound.map((f) => (f.ok ? Promise.resolve(f.r) : processChunk(f.c))));
      parsedResults = retried.flat();
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
      if (!validIds.has(id) || results.has(id)) continue;
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
    for (const p of posts) {
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

    return jsonResponse({ processed: updated, matched, ai_calls_ok: aiSuccesses, skipped_post_ids: failedIds });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
