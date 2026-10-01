// ترجمه‌ی تیتر و متن پست‌های تب «وب‌سایت‌ها» به فارسی، از طریق درگاه هوش
// مصنوعی لیارا (Liara AI Gateway، فرمت سازگار با OpenAI). کلید API لیارا
// فقط اینجا (سمت سرور، به‌صورت secret) نگه داشته می‌شه و هیچ‌وقت به
// فرانت‌اند فرستاده نمی‌شه.
//
// ورودی فقط `postId`ه، نه خودِ متن — چون اگه فرانت‌اند خودش متن دلخواه
// می‌فرستاد، هر کاربر واردشده می‌تونست از این تابع به‌عنوان یه دروازه‌ی
// آزاد به هوش مصنوعی (برای هر متنی، نه فقط ترجمه‌ی پست‌های واقعی) سوءاستفاده
// کنه. با گرفتن فقط شناسه، خودِ تابع متن رو مستقیم از دیتابیس (با توکن
// همون کاربر) می‌خونه — همین یه کوئری هم اعتبارسنجی ورود کاربر رو انجام
// می‌ده، هم متن واقعی و دست‌نخورده رو تضمین می‌کنه (fetchPostForUser در
// _shared/auth.ts، مشترک بین همه‌ی Edge Functionهای آینده‌ی این پروژه).
//
// دیپلوی خودکاره (نگاه کن به .github/workflows/deploy-edge-functions.yml)
// — نیازی به اجرای دستی نیست، فقط یه‌بار باید سکرت‌های زیر تنظیم بشن:
//   - LIARA_API_KEY (از Project Settings → Edge Functions → Secrets در سوپابیس)
//   - SUPABASE_ACCESS_TOKEN (به‌عنوان GitHub Secret، برای دیپلوی خودکار)

import { fetchPostForUser } from "../_shared/auth.ts";

const LIARA_BASE_URL = "https://ai.liara.ir/api/6a9271a1d6564b043acdefe1/v1";
const LIARA_MODEL = "openai/gpt-4o-mini";
const MAX_TEXT_CHARS = 6000;

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
    const { postId } = await req.json();
    // فقط عدد صحیح — چون مستقیم توی آدرس کوئری PostgREST می‌شینه
    if (!Number.isSafeInteger(postId) || postId <= 0) return jsonResponse({ error: "postId is required" }, 400);

    const post = await fetchPostForUser(req, postId);
    if (!post) return jsonResponse({ error: "unauthorized or post not found" }, 401);

    const { title, text } = post;
    if (!title && !text) return jsonResponse({ title: "", text: "" });

    const liaraKey = Deno.env.get("LIARA_API_KEY");
    const aiRes = await fetch(`${LIARA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${liaraKey}` },
      body: JSON.stringify({
        model: LIARA_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You translate news titles and bodies into fluent, natural Persian (Farsi). " +
              'Respond with ONLY a raw JSON object like {"title":"...","text":"..."} and nothing else ' +
              "— no markdown fences, no extra commentary. Keep the same meaning and tone; do not summarize.",
          },
          // سقف طول متن (هزینه‌ی هوش مصنوعی): مقاله‌ی خیلی بلند فید RSS
          { role: "user", content: JSON.stringify({ title: (title || "").slice(0, 500), text: (text || "").slice(0, MAX_TEXT_CHARS) }) },
        ],
      }),
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text();
      return jsonResponse({ error: "ai request failed", detail }, 502);
    }

    const aiData = await aiRes.json();
    let content: string = aiData?.choices?.[0]?.message?.content || "{}";
    content = content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");

    let parsed: { title?: string; text?: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { title: "", text: content };
    }

    return jsonResponse({ title: parsed.title || "", text: parsed.text || "" });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
