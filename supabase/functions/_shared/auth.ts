// اعتبارسنجی مشترک برای همه‌ی Edge Functionهای این پروژه که نیاز به «کاربر
// واردشده» دارن. چون این پروژه از سیستم لاگین سفارشی خودش (public.login(),
// JWT با pgjwt) استفاده می‌کنه، نه Auth استاندارد سوپابیس، به‌جای پیاده‌سازی
// جدای اعتبارسنجی JWT، توکن ورودی رو با یه کوئری سبک و واقعی به PostgREST
// چک می‌کنیم — اگه PostgREST قبولش کنه (یعنی نقش app_admin/app_viewer
// داره)، توکن معتبره.

// فقط مدیر (۵.۲۲.۱، بررسی امنیتی): توکن با یه کوئری سبک PostgREST اعتبارسنجی می‌شه
// (امضا رو خودِ PostgREST چک می‌کنه) و بعد نقش از claim همون توکن خونده می‌شه —
// به‌جای «select روی جدولی که بیننده دسترسی نداره» که با یه GRANT اشتباه در آینده
// بی‌صدا به روی بیننده باز می‌شد.
export async function isAdminRequest(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  let role = "";
  try {
    const part = token.split(".")[1] || "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    role = JSON.parse(atob(b64))?.role || "";
  } catch {
    return false;
  }
  if (role !== "app_admin") return false;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const res = await fetch(`${supabaseUrl}/rest/v1/categories?select=id&limit=1`, {
    headers: { apikey: anonKey ?? "", Authorization: `Bearer ${token}` },
  });
  await res.body?.cancel();
  return res.ok;
}

export async function fetchPostForUser(
  req: Request,
  postId: number,
): Promise<{ title: string | null; text: string | null } | null> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const res = await fetch(`${supabaseUrl}/rest/v1/posts?id=eq.${postId}&select=title,text`, {
    headers: { apikey: anonKey ?? "", Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// یه کوئری واقعی به PostgREST با توکن خودِ کاربر — هم اعتبارسنجی ورود
// رو انجام می‌ده (چون RLS جدول posts فقط به app_admin/app_viewer اجازه‌ی
// select می‌ده) هم پست‌های واقعی رو برمی‌گردونه؛ برای news-insights.
// ⚠️ مهر ۱۴۰۵: قبلاً فیلتر و ترتیب روی posted_at بود — ولی کالکتور ایتا
// posted_at رو پر نمی‌کنه (NULL)، پس همه‌ی پست‌های ایتا از «اخبار منتخب» جا
// می‌موندن؛ و limit=150 فقط ۱۵۰ پست آخر (نه کل ۶ ساعت) رو می‌دید. حالا بازه
// با scraped_at (زمان اولین دیده‌شدن، برای همه‌ی پلتفرم‌ها پره) گرفته می‌شه،
// صفحه‌ای تا maxPosts، و پستی که posted_at داره ولی قدیمی‌تر از بازه‌ست (مثلاً
// مقاله‌ی قدیمی فید RSS که تازه دیده شده) کنار گذاشته می‌شه.
export type WindowPost = {
  id: number;
  channel_id: number;
  title: string | null;
  text: string | null;
  link: string | null;
  posted_at: string | null;
  scraped_at: string | null;
  ai_keywords: string[] | null;
  channels: { title: string | null } | null;
};
export async function fetchRecentNewsPostsForUser(
  req: Request,
  hours: number,
  maxPosts = 2000,
): Promise<WindowPost[] | null> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const headers = { apikey: anonKey ?? "", Authorization: `Bearer ${token}` };

  // فقط کانال‌های «شبکه‌های اجتماعی» + «وب‌سایت‌ها» (show_in_news، غیر از بله)؛
  // پست‌هایی که مدیر پنهان کرده (hidden_at، migration_039) در «اخبار منتخب» نمیان
  const chRes = await fetch(
    `${supabaseUrl}/rest/v1/channels?select=id&show_in_news=eq.true&platform=neq.bale`,
    { headers },
  );
  if (!chRes.ok) return null;
  const channels: Array<{ id: number }> = await chRes.json();
  if (!channels.length) return [];
  const ids = channels.map((c) => c.id).join(",");

  const cutoffMs = Date.now() - hours * 3600 * 1000;
  const cutoff = new Date(cutoffMs).toISOString();
  const out: WindowPost[] = [];
  // سقف هر پاسخ سوپابیس ۱۰۰۰ ردیفه — صفحه‌ای
  for (let offset = 0; offset < maxPosts; offset += 1000) {
    const postsRes = await fetch(
      `${supabaseUrl}/rest/v1/posts?select=id,channel_id,title,text,link,posted_at,scraped_at,ai_keywords,channels(title)` +
        `&channel_id=in.(${ids})&hidden_at=is.null&scraped_at=gte.${cutoff}&order=scraped_at.desc&limit=${Math.min(1000, maxPosts - offset)}&offset=${offset}`,
      { headers },
    );
    if (!postsRes.ok) return offset ? out : null;
    const rows: WindowPost[] = await postsRes.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out.filter((p) => !p.posted_at || new Date(p.posted_at).getTime() >= cutoffMs);
}

// برای extract-post-keywords («پرونده ویژه») — جدیدترین پست‌هایی که
// هنوز posts.ai_keywords ندارن (NULL، نه آرایه‌ی خالی). ORDER BY
// posted_at DESC عمداست: «پرونده ویژه» روی موضوعات موقت/جاری کار
// می‌کنه، پس پست‌های تازه اولویت دارن — اگه از قدیمی‌ترین شروع می‌شد
// (نسخه‌ی قبلی این تابع)، با وجود backlog پست‌های قدیمی (که موقع
// اضافه‌شدن این ستون همه NULL شدن)، ممکن بود روزها طول بکشه تا
// پردازش به پست‌های واقعاً تازه/مرتبط برسه. resumability همچنان
// برقراره چون معیار «پردازش‌شده» ai_keywords IS NULL هست، نه ترتیب —
// backlog قدیمی هم بالأخره توی اجراهای بعدی (وقتی دیگه پست تازه‌ی
// بی‌کلیدواژه‌ای نمونده) پردازش می‌شه، فقط اولویت با تازه‌هاست.
//
// ⚠️ مهر ۱۴۰۵: ترتیب از posted_at به scraped_at عوض شد — ORDER BY posted_at DESC
// در Postgres مقدارهای NULL رو اول میاره و posted_at همه‌ی پست‌های ایتا NULLه؛
// یعنی کل backlog ایتا (حتی خیلی قدیمی) با ترتیب نامعلوم جلوی پست‌های تازه‌ی
// تلگرام/وب‌سایت‌ها صف می‌بست. scraped_at برای همه پره و ایندکس هم داره (031).
//
// ⚠️ به‌روزرسانی — سهمیه‌ی جدا برای کانال‌های «اخبار حوزه»: با backlog
// چندهزارتایی کل سایت، صرفِ «جدیدترین‌ها اولویت دارن» کافی نبود — چون
// کانال‌های پرحجم‌تر (تلگرام/ایتا) همیشه از این سه فید RSS کم‌تکرار
// تازه‌تری دارن، پست‌های حوزه توی رقابت «جدیدترین در کل سایت» همیشه
// می‌باختن و عملاً هیچ‌وقت پردازش نمی‌شدن (starvation؛ واقعاً دیده شد).
// الان اول تا hawzaReserve پست حوزه‌ای پردازش‌نشده جدا و تضمینی گرفته
// می‌شه، بعد باقی سهمیه با همون منطق قبلی (جدیدترین کل سایت) پر می‌شه.
export async function fetchPostsMissingKeywords(
  req: Request,
  limit = 30,
): Promise<{
  posts: Array<{ id: number; channel_id: number; title: string | null; text: string | null; ai_keywords: string[] | null; ai_keywords_extracted_at: string | null }>;
  hawzaChannelIds: Set<number>;
} | null> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const headers = { apikey: anonKey ?? "", Authorization: `Bearer ${token}` };

  // همون منبع خبری news-insights: کانال‌های «شبکه‌های اجتماعی» + «وب‌سایت‌ها» (show_in_news، غیر از بله)
  // show_in_hawza هم همین‌جا می‌خونیم تا بدونیم کدوم پست‌ها (تب «اخبار
  // حوزه») علاوه بر کلیدواژه، نیاز به تشخیص سیاسی/اجتماعی‌بودن هم دارن
  const chRes = await fetch(
    `${supabaseUrl}/rest/v1/channels?select=id,show_in_hawza&show_in_news=eq.true&platform=neq.bale`,
    { headers },
  );
  if (!chRes.ok) return null;
  const channels: Array<{ id: number; show_in_hawza: boolean }> = await chRes.json();
  if (!channels.length) return { posts: [], hawzaChannelIds: new Set() };
  const ids = channels.map((c) => c.id).join(",");
  const hawzaChannelIds = new Set(channels.filter((c) => c.show_in_hawza).map((c) => c.id));
  const hawzaIds = [...hawzaChannelIds].join(",");

  // ⚠️ سهمیه‌ی جدا و تضمین‌شده برای کانال‌های «اخبار حوزه» — بدون این، چون
  // انتخاب کلی «جدیدترین پست‌های کل سایت» (posted_at DESC) هست و کانال‌های
  // پرحجم‌تر (تلگرام/ایتا) همیشه تازه‌تر از این سه فید RSS کم‌تکرارن، پست‌های
  // حوزه توی رقابت «جدیدترین بودن در کل سایت» تقریباً همیشه می‌بازن و عملاً
  // هیچ‌وقت پردازش نمی‌شن (starvation واقعی — با backlog چندهزارتایی کل
  // سایت، دیده شد که پست‌های امروز هر سه کانال حوزه بعد از چندین اجرای
  // متوالی همچنان NULL مونده بودن). راه‌حل: اول تا hawzaReserve پست حوزه‌ای
  // پردازش‌نشده رو جدا و تضمینی می‌گیریم، بعد باقی‌مونده‌ی سهمیه رو مثل قبل
  // با جدیدترین‌های کل سایت پر می‌کنیم (با حذف idهای قبلاً انتخاب‌شده تا
  // تکراری نشه).
  const hawzaReserve = Math.min(10, limit);
  let hawzaPosts: Array<{ id: number; channel_id: number; title: string | null; text: string | null; ai_keywords: string[] | null; ai_keywords_extracted_at: string | null }> = [];
  if (hawzaIds) {
    const hawzaRes = await fetch(
      `${supabaseUrl}/rest/v1/posts?select=id,channel_id,title,text,ai_keywords,ai_keywords_extracted_at&channel_id=in.(${hawzaIds})` +
        `&or=(ai_keywords.is.null,hawza_relevant.is.null)&order=scraped_at.desc&limit=${hawzaReserve}`,
      { headers },
    );
    if (hawzaRes.ok) hawzaPosts = await hawzaRes.json();
  }

  const remaining = limit - hawzaPosts.length;
  let generalPosts: Array<{ id: number; channel_id: number; title: string | null; text: string | null; ai_keywords: string[] | null; ai_keywords_extracted_at: string | null }> = [];
  if (remaining > 0) {
    const excludeIds = hawzaPosts.map((p) => p.id);
    const notInFilter = excludeIds.length ? `&id=not.in.(${excludeIds.join(",")})` : "";
    const generalRes = await fetch(
      `${supabaseUrl}/rest/v1/posts?select=id,channel_id,title,text,ai_keywords,ai_keywords_extracted_at&channel_id=in.(${ids})&ai_keywords=is.null` +
        `${notInFilter}&order=scraped_at.desc&limit=${remaining}`,
      { headers },
    );
    if (generalRes.ok) generalPosts = await generalRes.json();
  }

  const posts = [...hawzaPosts, ...generalPosts];
  return { posts, hawzaChannelIds };
}
