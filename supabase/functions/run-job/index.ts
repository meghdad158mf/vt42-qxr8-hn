// اجرای دستی کارهای خودکار GitHub Actions از کارت «وضعیت سامانه» (تنظیمات).
//
// توکن گیت‌هاب نمی‌تونه توی فرانت‌اند باشه (ریپو و کد صفحه عمومی‌ان)، پس
// فقط اینجا به‌صورت secret نگه داشته می‌شه: GITHUB_DISPATCH_TOKEN — یه
// fine-grained token که فقط به همین ریپو و فقط دسترسی «Actions: Read and
// write» داره (نه کد، نه تنظیمات).
//
// ورودی فقط یه کلید از فهرست ثابت JOBS‌ه، نه اسم دلخواه ورک‌فلو — پس حتی با
// یه توکن مدیر هم نمی‌شه هر ورک‌فلویی (مثلاً پاک‌سازی/purge) رو اجرا کرد.
//
// فقط مدیر: با توکن کالر یه select روی جدول feedback زده می‌شه — این جدول
// برای app_viewer فقط insert داره (migration_018)، پس select فقط برای
// app_admin موفقه. همون الگوی «اعتبارسنجی با کوئری واقعی PostgREST» بقیه‌ی
// Edge Functionهای این پروژه (_shared/auth.ts).

const GITHUB_REPO = "meghdad158mf/vt42-qxr8-hn";
// کرون‌ها فقط از main اجرا می‌شن (نکته‌ی عملیاتی ۶ CLAUDE.md)، اجرای دستی هم همونجا
const GITHUB_REF = "main";

const JOBS: Record<string, string> = {
  eitaa: "collect-eitaa.yml",
  telegram: "collect-telegram.yml",
  website: "collect-rss.yml",
  bale: "collect-bale.yml",
  newspapers: "collect-newspapers.yml",
  insights: "analyze-news-insights.yml",
  keywords: "extract-keywords.yml",
};

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

async function isAdmin(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const res = await fetch(`${supabaseUrl}/rest/v1/feedback?select=id&limit=1`, {
    headers: { apikey: anonKey ?? "", Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { job } = await req.json();
    const workflow = JOBS[job];
    if (!workflow) return jsonResponse({ error: "unknown job" }, 400);

    if (!(await isAdmin(req))) return jsonResponse({ error: "admin only" }, 403);

    const ghToken = Deno.env.get("GITHUB_DISPATCH_TOKEN");
    if (!ghToken) return jsonResponse({ error: "GITHUB_DISPATCH_TOKEN is not set" }, 500);

    const ghRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "jarian-run-job",
        },
        body: JSON.stringify({ ref: GITHUB_REF }),
      },
    );
    if (!ghRes.ok) {
      const detail = await ghRes.text();
      return jsonResponse({ error: "github dispatch failed", status: ghRes.status, detail }, 502);
    }
    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
