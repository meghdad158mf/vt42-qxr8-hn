// هشدار ایمیلی و گزارش روزانه‌ی سلامت سامانه (۵.۲۷.۰، migration_045).
//
// سه حالت (فقط مدیر — isAdminRequest؛ pg_cron با توکن مدیرِ ۵ دقیقه‌ای که داخل دیتابیس
// ساخته می‌شه صدا می‌زنه، مثل jarian_cron.dispatch):
//   { mode: "check" } — هر ۳۰ دقیقه: موارد «قرمز» (کار خودکاری که خروجی تازه نداره یا
//     آخرین اجرای گیت‌هابش ناموفق بوده، پاک‌سازی عقب‌افتاده، فضای فایل یا پایگاه داده
//     ≥۸۵٪، توکن رو به انقضا، تلاش ناموفق ورود زیاد). هر مورد تازه فوراً ایمیل می‌شه و
//     تا وقتی برقراره هر ۱۲ ساعت یادآوری؛ برطرف شدنش هم در ایمیل بعدی گفته می‌شه.
//     وضعیت در جدول alert_state.
//   { mode: "daily" } — هر روز ۰۷:۲۲ تهران: گزارش ۲۴ ساعت گذشته (حتی اگه همه‌چیز سالمه).
//   { mode: "test" }  — دکمه‌ی «ارسال ایمیل آزمایشی» صفحه‌ی وضعیت.
//
// ارسال با Resend (کلید RESEND_API_KEY در سوپابیس ← Edge Functions ← Secrets). بدون دامنه‌ی
// تأییدشده فرستنده onboarding@resend.dev‌ه و Resend فقط به ایمیل خودِ صاحب حساب می‌فرسته.
// گیرنده و روشن/خاموش بودن هر نوع از جدول alert_settings (فقط مدیر) خونده می‌شه.

import { isAdminRequest } from "../_shared/auth.ts";
import { GITHUB_REF, GITHUB_REPO, githubHeaders, JOB_FRESHNESS, JOBS } from "../_shared/jobs.ts";

const SITE_URL = "https://meghdad158mf.github.io/vt42-qxr8-hn/design/ita-monitoring-prototype.html";
const STORAGE_LIMIT = 1024 * 1048576;
const DB_LIMIT = 500 * 1048576;
const REMIND_HOURS = 12;
// ⚠️ هم‌سو با SYS_TOKENS فرانت‌اند — با ساخت توکن جدید هر دو جا به‌روز بشه
const TOKENS = [
  { name: "نصب خودکار تابع‌های سوپابیس (SUPABASE_ACCESS_TOKEN)", exp: "2026-12-04" },
  { name: "اجرای دستی کارها (GITHUB_DISPATCH_TOKEN)", exp: "2026-12-26" },
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type Issue = { key: string; text: string };
type Ctx = { rest: (path: string, init?: RequestInit) => Promise<Response>; gh: Record<string, string> | null };

const faNum = (n: number) => Number(n).toLocaleString("fa-IR");
const faMb = (b: number) => (b / 1048576).toLocaleString("fa-IR", { maximumFractionDigits: 1 });
const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
function relHours(iso: string | null) {
  if (!iso) return "هیچ‌وقت";
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  return h < 1 ? "کمتر از یک ساعت پیش" : h < 48 ? faNum(Math.floor(h)) + " ساعت پیش" : faNum(Math.floor(h / 24)) + " روز پیش";
}
function tehranTime(iso: string) {
  return new Date(iso).toLocaleString("fa-IR", { timeZone: "Asia/Tehran", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function count(ctx: Ctx, path: string): Promise<number | null> {
  const r = await ctx.rest(path, { headers: { Prefer: "count=exact", Range: "0-0" } });
  if (!r.ok) { await r.body?.cancel(); return null; }
  await r.body?.cancel();
  const m = (r.headers.get("content-range") || "").match(/\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

// null = گیت‌هاب جواب نداد (توکن منقضی، محدودیت سهمیه، قطعی) — یعنی «بررسی نشد»، نه «سالمه»
async function ghRuns(ctx: Ctx, file: string, perPage = 30): Promise<Record<string, string>[] | null> {
  if (!ctx.gh) return null;
  try {
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${file}/runs?per_page=${perPage}&branch=${GITHUB_REF}`, { headers: ctx.gh });
    if (!r.ok) { await r.body?.cancel(); return null; }
    return (await r.json())?.workflow_runs || [];
  } catch { return null; }
}
// هم‌سو با فرانت (کارت‌های «کارهای خودکار»): هر نتیجه‌ای جز این‌ها ناموفقه (failure، timed_out، startup_failure…)
const RUN_OK = new Set(["success", "cancelled", "skipped", "neutral"]);
const runFailed = (x: Record<string, string>) => !!x.conclusion && !RUN_OK.has(x.conclusion);

async function retentionHours(ctx: Ctx) {
  try {
    const r = await ctx.rest("/site_settings?key=eq.media_retention_hours&select=value");
    const rows = r.ok ? await r.json() : [];
    const h = Number(rows[0]?.value);
    return [12, 24, 48, 72].includes(h) ? h : 12;
  } catch { return 12; }
}

async function storageBytes(ctx: Ctx) {
  const r = await ctx.rest("/rpc/storage_usage", { method: "POST", body: "{}" });
  if (!r.ok) { await r.body?.cancel(); return null; }
  return (await r.json()).reduce((t: number, x: { size_bytes: number }) => t + Number(x.size_bytes || 0), 0);
}
async function dbBytes(ctx: Ctx) {
  try {
    const r = await ctx.rest("/capacity_snapshots?kind=eq.db&select=day,bytes&order=day.desc&limit=8");
    const rows = r.ok ? await r.json() : [];
    if (!rows.length) return null;
    const day = rows[0].day;
    return rows.filter((x: { day: string }) => x.day === day).reduce((t: number, x: { bytes: number }) => t + Number(x.bytes), 0);
  } catch { return null; }
}

// همه‌ی موارد «قرمز» فعلی + کلید بررسی‌هایی که واقعاً انجام شدن (checked). مورد قبلی فقط وقتی
// «برطرف شد» حساب می‌شه که بررسی‌اش این بار انجام شده باشه — وگرنه یه قطعی لحظه‌ای گیت‌هاب
// یا پایگاه داده ایمیل «برطرف شد» و نیم ساعت بعد «هشدار تازه» می‌فرستاد.
async function collectIssues(ctx: Ctx): Promise<{ issues: Issue[]; checked: Set<string> }> {
  const issues: Issue[] = [];
  const checked = new Set<string>();
  const add = (key: string, text: string) => issues.push({ key, text });
  const retention = await retentionHours(ctx);
  await Promise.all(JOB_FRESHNESS.map(async (j) => {
    try {
      if (j.job === "cleanup") {
        const cutoff = new Date(Date.now() - (retention + 18) * 3600000).toISOString();
        const n = await count(ctx, "/posts?select=id&media_storage_path=not.is.null&or=" + encodeURIComponent(`(media_fetched_at.lt.${cutoff},media_fetched_at.is.null)`));
        if (n !== null) checked.add("job:cleanup");
        if (n !== null && n > 50) add("job:cleanup", `${j.name}: ${faNum(n)} عکس/فیلم قدیمی پاک نشده است`);
      } else if (j.path) {
        const r = await ctx.rest(j.path);
        const rows = r.ok ? await r.json() : null;
        if (rows) {
          checked.add("job:" + j.job);
          const at = rows[0]?.[j.col as string] || null;
          if (!at || (Date.now() - new Date(at).getTime()) / 3600000 >= (j.bad as number)) {
            add("job:" + j.job, `${j.name}: آخرین خروجی ${relHours(at)}`);
          }
        }
      }
      const runs = await ghRuns(ctx, JOBS[j.job], 5);
      if (runs) checked.add("gh:" + j.job);
      const last = runs?.find((x) => x.status === "completed");
      if (last && runFailed(last)) {
        add("gh:" + j.job, `${j.name}: آخرین اجرا در گیت‌هاب ناموفق بود (${tehranTime(last.run_started_at || last.created_at)})`);
      }
    } catch { /* این یکی بررسی نشد؛ بقیه ادامه */ }
  }));
  const st = await storageBytes(ctx).catch(() => null);
  if (st !== null) checked.add("storage");
  if (st !== null && st / STORAGE_LIMIT >= 0.85) add("storage", `فضای فایل ${faNum(Math.round(st / STORAGE_LIMIT * 100))}٪ پر است (${faMb(st)} از ۱۰۲۴ مگ)`);
  const db = await dbBytes(ctx);
  if (db !== null) checked.add("db");
  if (db !== null && db / DB_LIMIT >= 0.85) add("db", `پایگاه داده ${faNum(Math.round(db / DB_LIMIT * 100))}٪ پر است (${faMb(db)} از ۵۰۰ مگ)`);
  for (const t of TOKENS) {
    const days = Math.ceil((new Date(t.exp + "T00:00:00Z").getTime() - Date.now()) / 86400000);
    checked.add("token:" + t.exp);
    if (days <= 7) add("token:" + t.exp, `توکن «${t.name}» ${days < 0 ? "منقضی شده است" : faNum(days) + " روز دیگر منقضی می‌شود"}`);
  }
  const since = new Date(Date.now() - 86400000).toISOString();
  // تلاش‌های حین قفل (blocked) شمرده نمی‌شن — هم‌سو با صفحه‌ی وضعیت
  const fails = await count(ctx, "/login_events?select=id&success=is.false&blocked=is.false&created_at=gt." + since);
  if (fails !== null) checked.add("logins");
  if (fails !== null && fails >= 20) add("logins", `${faNum(fails)} تلاش ناموفق ورود در ۲۴ ساعت اخیر`);
  return { issues: issues.sort((a, b) => a.key.localeCompare(b.key)), checked };
}

function emailHtml(title: string, sections: { head: string; items: string[]; tone?: string }[], note = "") {
  const color = (t?: string) => t === "bad" ? "#d9433c" : t === "ok" ? "#0e9968" : "#16202a";
  return `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;background:#eef1f5;font-family:Tahoma,Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;direction:rtl;text-align:right;">
<div style="background:#16202a;color:#EAB393;border-radius:12px 12px 0 0;padding:14px 18px;font-weight:bold;font-size:15px;">سامانه هوشمند جریان</div>
<div style="background:#fff;border-radius:0 0 12px 12px;padding:18px;color:#16202a;font-size:14px;line-height:1.9;">
<h2 style="margin:0 0 12px;font-size:17px;">${esc(title)}</h2>
${sections.filter((s) => s.items.length).map((s) => `<div style="margin:0 0 14px;"><div style="font-weight:bold;color:${color(s.tone)};margin-bottom:4px;">${esc(s.head)}</div><ul style="margin:0;padding:0 18px 0 0;">${s.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("")}
${note ? `<p style="margin:12px 0 0;color:#646f80;font-size:13px;">${esc(note)}</p>` : ""}
<p style="margin:16px 0 0;"><a href="${SITE_URL}#status" style="color:#b5651d;font-weight:bold;">باز کردن صفحه‌ی «وضعیت سامانه»</a></p>
</div></div></body></html>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, error: "RESEND_API_KEY تنظیم نشده است" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Jarian <onboarding@resend.dev>", to: [to], subject, html }),
  });
  if (r.ok) { await r.body?.cancel(); return { ok: true }; }
  return { ok: false, error: `Resend ${r.status}: ${(await r.text()).slice(0, 200)}` };
}

async function runCheck(ctx: Ctx, to: string) {
  const { issues, checked } = await collectIssues(ctx);
  const sr = await ctx.rest("/alert_state?select=*");
  // وضعیت قبلی خونده نشد → ادامه نده (وگرنه همه‌ی موارد باز دوباره «تازه» ایمیل می‌شدن)
  if (!sr.ok) { await sr.body?.cancel(); throw new Error("alert_state " + sr.status); }
  const state: { key: string; text: string; last_sent_at: string }[] = await sr.json();
  const byKey = new Map(state.map((s) => [s.key, s]));
  const now = Date.now();
  const fresh = issues.filter((i) => !byKey.has(i.key));
  const remind = issues.filter((i) => byKey.has(i.key) && now - new Date(byKey.get(i.key)!.last_sent_at).getTime() >= REMIND_HOURS * 3600000);
  const resolved = state.filter((s) => checked.has(s.key) && !issues.some((i) => i.key === s.key));
  let sent = null;
  if (fresh.length || remind.length || resolved.length) {
    const subject = fresh.length ? `جریان: ${faNum(fresh.length)} هشدار تازه` : remind.length ? `جریان: ${faNum(remind.length)} مورد هنوز برطرف نشده` : "جریان: موارد قبلی برطرف شد";
    sent = await sendEmail(to, subject, emailHtml(subject, [
      { head: "هشدار تازه", items: fresh.map((i) => i.text), tone: "bad" },
      { head: "هنوز برطرف نشده", items: remind.map((i) => i.text), tone: "bad" },
      { head: "برطرف شد", items: resolved.map((s) => s.text), tone: "ok" },
    ], "این ایمیل خودکار است. تا وقتی موردی برطرف نشود، هر " + faNum(REMIND_HOURS) + " ساعت یادآوری می‌شود."));
    if (sent.ok) {
      const nowIso = new Date().toISOString();
      const up = [...fresh, ...remind].map((i) => ({ key: i.key, text: i.text, last_sent_at: nowIso }));
      if (up.length) await ctx.rest("/alert_state?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(up) }).then((r) => r.body?.cancel());
      if (resolved.length) await ctx.rest("/alert_state?key=in.(" + resolved.map((s) => '"' + s.key.replace(/"/g, "") + '"').join(",") + ")", { method: "DELETE" }).then((r) => r.body?.cancel());
    }
  }
  return { issues: issues.length, fresh: fresh.length, remind: remind.length, resolved: resolved.length, sent };
}

async function dailyReport(ctx: Ctx) {
  const since = new Date(Date.now() - 86400000).toISOString();
  const { issues } = await collectIssues(ctx);
  // اجراهای ۲۴ ساعت گذشته از گیت‌هاب
  let ok = 0, fail = 0;
  const failed: string[] = [];
  await Promise.all(JOB_FRESHNESS.map(async (j) => {
    const runs = ((await ghRuns(ctx, JOBS[j.job], 30)) || []).filter((x) => x.status === "completed" && new Date(x.run_started_at || x.created_at).toISOString() >= since);
    const f = runs.filter(runFailed).length;
    ok += runs.filter((x) => x.conclusion === "success").length; fail += f;
    if (f) failed.push(`${j.name}: ${faNum(f)} اجرای ناموفق`);
  }));
  const [posts, queue, fails, st, db] = await Promise.all([
    count(ctx, "/posts?select=id&scraped_at=gt." + since),
    count(ctx, "/posts?select=id,channels!inner(show_in_news,platform)&ai_keywords=is.null&channels.show_in_news=eq.true&channels.platform=neq.bale"),
    count(ctx, "/login_events?select=id&success=is.false&blocked=is.false&created_at=gt." + since),
    storageBytes(ctx).catch(() => null),
    dbBytes(ctx),
  ]);
  let stale: number | null = null;
  try {
    const [lr, cr] = await Promise.all([ctx.rest("/rpc/channel_last_post", { method: "POST", body: "{}" }), ctx.rest("/channels?select=id&active=eq.true")]);
    if (lr.ok && cr.ok) {
      const last = new Map((await lr.json()).map((x: { channel_id: number; last_scraped_at: string }) => [x.channel_id, x.last_scraped_at]));
      stale = (await cr.json()).filter((c: { id: number }) => { const t = last.get(c.id) as string | undefined; return !t || Date.now() - new Date(t).getTime() > 3 * 86400000; }).length;
    }
  } catch { /* اختیاری */ }
  let errs: number | null = null;
  try {
    const er = await ctx.rest("/client_errors?select=sessions&last_at=gt." + since);
    if (er.ok) errs = (await er.json()).reduce((t: number, x: { sessions: number }) => t + x.sessions, 0);
  } catch { /* migration_043 ممکنه اجرا نشده باشه */ }
  const n = (v: number | null, unit = "") => v === null ? "نامعلوم" : faNum(v) + unit;
  const today = new Date().toLocaleDateString("fa-IR", { timeZone: "Asia/Tehran", weekday: "long", day: "numeric", month: "long" });
  const title = `گزارش روزانه‌ی جریان — ${today}`;
  const summary = [
    `اجرای کارهای خودکار در ۲۴ ساعت گذشته: ${faNum(ok)} موفق${fail ? "، " + faNum(fail) + " ناموفق" : ""}`,
    `پست‌های تازه: ${n(posts)}`,
    `فضای فایل: ${st === null ? "نامعلوم" : faNum(Math.round(st / STORAGE_LIMIT * 100)) + "٪ (" + faMb(st) + " مگ)"}`,
    `پایگاه داده: ${db === null ? "نامعلوم" : faNum(Math.round(db / DB_LIMIT * 100)) + "٪ (" + faMb(db) + " مگ)"}`,
    `صف کلیدواژه‌ی هوش مصنوعی: ${n(queue, " پست")}`,
    `منابع بی‌خبر (بیش از ۳ روز): ${n(stale)}`,
    `تلاش ناموفق ورود: ${n(fails)}`,
    `خطای مرورگر کاربران: ${errs === null ? "نامعلوم" : faNum(errs) + " بار"}`,
  ];
  return { title, html: emailHtml(title, [
    { head: issues.length ? `${faNum(issues.length)} مورد نیازمند توجه` : "همه‌چیز سالم است", items: issues.length ? issues.map((i) => i.text) : ["هیچ موردی نیاز به رسیدگی ندارد."], tone: issues.length ? "bad" : "ok" },
    { head: "خلاصه", items: summary },
    { head: "اجراهای ناموفق", items: failed, tone: "bad" },
  ], "این گزارش هر روز صبح فرستاده می‌شود؛ از صفحه‌ی «وضعیت سامانه» قابل خاموش کردن است.") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { mode } = await req.json();
    if (!["check", "daily", "test"].includes(mode)) return jsonResponse({ error: "unknown mode" }, 400);
    if (!(await isAdminRequest(req))) return jsonResponse({ error: "admin only" }, 403);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const auth = req.headers.get("Authorization") || "";
    const ghToken = Deno.env.get("GITHUB_DISPATCH_TOKEN");
    const ctx: Ctx = {
      rest: (path, init = {}) => fetch(`${supabaseUrl}/rest/v1${path}`, {
        ...init,
        headers: { apikey: anonKey, Authorization: auth, "Content-Type": "application/json", ...(init.headers || {}) },
      }),
      gh: ghToken ? githubHeaders(ghToken, "jarian-notify") : null,
    };
    const sr = await ctx.rest("/alert_settings?id=eq.1&select=*");
    if (!sr.ok) return jsonResponse({ error: "alert_settings " + sr.status }, 500);
    const settings = (await sr.json())[0];
    const to = settings?.email;
    const stamp = (body: Record<string, unknown>) => ctx.rest("/alert_settings?id=eq.1", { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(body) }).then((r) => r.body?.cancel());
    if (!to) {
      if (mode === "test") return jsonResponse({ ok: false, error: "نشانی ایمیل گیرنده هنوز ذخیره نشده است" }, 400);
      return jsonResponse({ skipped: "no email" });
    }

    if (mode === "test") {
      const r = await sendEmail(to, "جریان: ایمیل آزمایشی", emailHtml("ایمیل آزمایشی", [{ head: "ارسال ایمیل درست کار می‌کند", items: ["هشدارها و گزارش روزانه به همین نشانی فرستاده می‌شوند."], tone: "ok" }]));
      await stamp({ last_error: r.ok ? null : r.error });
      return jsonResponse(r, r.ok ? 200 : 502);
    }
    if (mode === "check") {
      if (!settings.alerts_on) return jsonResponse({ skipped: "alerts off" });
      const res = await runCheck(ctx, to);
      await stamp({ last_check_at: new Date().toISOString(), ...(res.sent ? (res.sent.ok ? { last_alert_at: new Date().toISOString(), last_error: null } : { last_error: res.sent.error }) : {}) });
      return jsonResponse(res);
    }
    if (!settings.daily_on) return jsonResponse({ skipped: "daily off" });
    const rep = await dailyReport(ctx);
    const r = await sendEmail(to, rep.title, rep.html);
    await stamp(r.ok ? { last_daily_at: new Date().toISOString(), last_error: null } : { last_error: r.error });
    return jsonResponse(r, r.ok ? 200 : 502);
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
