// اجرای دستی کارهای خودکار GitHub Actions از کارت «وضعیت سامانه» (تنظیمات).
//
// توکن گیت‌هاب نمی‌تونه توی فرانت‌اند باشه (ریپو و کد صفحه عمومی‌ان)، پس
// فقط اینجا به‌صورت secret نگه داشته می‌شه: GITHUB_DISPATCH_TOKEN — یه
// fine-grained token که فقط به همین ریپو و فقط دسترسی «Actions: Read and
// write» داره (نه کد، نه تنظیمات).
//
// دو حالت: { job } → اجرای دستی یه ورک‌فلو؛ { action: "status" } → نتیجه‌ی
// آخرین اجرای واقعی هر ورک‌فلوی JOBS از خودِ گیت‌هاب (موفق/ناموفق) برای
// صفحه‌ی «وضعیت سامانه»؛ { action: "health" } → دسترس‌پذیری سرویس‌های بیرونی
// که سایت و کارهای خودکارش بهشون وابسته‌ان (بخش «سرویس‌های مرتبط»).
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
  cleanup: "cleanup-media.yml",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

// بررسی سرویس‌های بیرونی از سمت سرور. سایت‌های منبع (ایتا/بله/جار/تلگرام)
// اینجا از سرور سوپابیس چک می‌شن، نه از رانر گیت‌هاب که کالکتورها واقعاً
// روش اجرا می‌شن — پس فقط نشونه‌ی کلیِ «بالا بودن» سایته.
const HEALTH_TIMEOUT_MS = 12_000;
const LIARA_BASE_URL = "https://ai.liara.ir/api/6a9271a1d6564b043acdefe1/v1";

async function timedCheck(fn: (signal: AbortSignal) => Promise<Response>, okStatus: (s: number) => boolean) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const r = await fn(ctrl.signal);
    const ms = Date.now() - t0;
    let detail = "";
    if (!okStatus(r.status)) detail = (await r.text()).slice(0, 160);
    else await r.body?.cancel();
    return { ok: okStatus(r.status), status: r.status, ms, detail };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, detail: ctrl.signal.aborted ? "timeout" : String(e).slice(0, 160) };
  } finally {
    clearTimeout(timer);
  }
}

async function healthChecks(ghHeaders: Record<string, string>) {
  const page = (url: string) => timedCheck(
    (signal) => fetch(url, { signal, headers: { "User-Agent": "Mozilla/5.0 (jarian-health)" } }),
    (s) => s < 500,
  );
  const [liara, github, eitaa, bale, jaaar, telegram] = await Promise.all([
    // کوچیک‌ترین درخواست ممکن (۱ توکن خروجی) — هزینه‌اش ناچیزه و فقط با باز کردن صفحه‌ی وضعیت
    timedCheck((signal) => fetch(`${LIARA_BASE_URL}/chat/completions`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("LIARA_API_KEY")}` },
      body: JSON.stringify({ model: "openai/gpt-4o-mini", max_tokens: 1, messages: [{ role: "user", content: "ok" }] }),
    }), (s) => s >= 200 && s < 300),
    (async () => {
      const res = await timedCheck((signal) => fetch("https://api.github.com/rate_limit", { signal, headers: ghHeaders }), (s) => s === 200);
      // سهمیه‌ی باقی‌مونده‌ی API گیت‌هاب برای همین توکن
      let remaining: number | null = null;
      if (res.ok) {
        try {
          const r = await fetch("https://api.github.com/rate_limit", { headers: ghHeaders });
          remaining = (await r.json())?.resources?.core?.remaining ?? null;
        } catch { /* فقط اطلاعات جانبیه */ }
      }
      return { ...res, remaining };
    })(),
    page("https://eitaa.com/"),
    page("https://ble.ir/"),
    page("https://www.jaaar.com/kiosk"),
    page("https://t.me/"),
  ]);
  return { liara, github, eitaa, bale, jaaar, telegram };
}

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
    const { job, action } = await req.json();
    if (action !== "status" && action !== "health" && !JOBS[job]) return jsonResponse({ error: "unknown job" }, 400);

    if (!(await isAdmin(req))) return jsonResponse({ error: "admin only" }, 403);

    const ghToken = Deno.env.get("GITHUB_DISPATCH_TOKEN");
    if (!ghToken) return jsonResponse({ error: "GITHUB_DISPATCH_TOKEN is not set" }, 500);
    const ghHeaders = {
      Authorization: `Bearer ${ghToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "jarian-run-job",
    };

    if (action === "health") {
      return jsonResponse({ services: await healthChecks(ghHeaders) });
    }

    if (action === "status") {
      const entries = await Promise.all(Object.entries(JOBS).map(async ([key, file]) => {
        try {
          const r = await fetch(
            `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${file}/runs?per_page=1&branch=${GITHUB_REF}`,
            { headers: ghHeaders },
          );
          if (!r.ok) return [key, null];
          const run = (await r.json())?.workflow_runs?.[0];
          if (!run) return [key, null];
          return [key, {
            status: run.status,
            conclusion: run.conclusion,
            event: run.event,
            created_at: run.run_started_at || run.created_at,
            updated_at: run.updated_at,
          }];
        } catch {
          return [key, null];
        }
      }));
      return jsonResponse({ runs: Object.fromEntries(entries) });
    }

    const workflow = JOBS[job];

    const ghRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: ghHeaders,
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
