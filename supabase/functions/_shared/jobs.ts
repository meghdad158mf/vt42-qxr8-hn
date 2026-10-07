// فهرست مشترک کارهای خودکار (ورک‌فلوهای گیت‌هاب) — run-job (اجرای دستی/وضعیت/گزارش)
// و notify (هشدار ایمیلی) هر دو از همین فهرست استفاده می‌کنن.
// ⚠️ کار جدید → اینجا + SYS_STATUS_JOBS فرانت‌اند + JOB_FRESHNESS پایین.

export const GITHUB_REPO = "meghdad158mf/vt42-qxr8-hn";
// کرون‌ها فقط از main اجرا می‌شن، اجرای دستی هم همونجا
export const GITHUB_REF = "main";

export const JOBS: Record<string, string> = {
  eitaa: "collect-eitaa.yml",
  telegram: "collect-telegram.yml",
  website: "collect-rss.yml",
  bale: "collect-bale.yml",
  newspapers: "collect-newspapers.yml",
  insights: "analyze-news-insights.yml",
  keywords: "extract-keywords.yml",
  cleanup: "cleanup-media.yml",
  hawza: "crawl-hawza.yml",
};

// نام فارسی و «تازگی خروجی» هر کار — هم‌سو با SYS_STATUS_JOBS فرانت‌اند (همون مسیرها و
// آستانه‌ی قرمز به ساعت). پاک‌سازی خروجی داده‌ای نداره و جدا بررسی می‌شه.
export const JOB_FRESHNESS: { job: string; name: string; path?: string; col?: string; bad?: number }[] = [
  { job: "eitaa", name: "جمع‌آوری ایتا", path: "/posts?platform=eq.eitaa&select=scraped_at&order=scraped_at.desc&limit=1", col: "scraped_at", bad: 12 },
  { job: "telegram", name: "جمع‌آوری تلگرام", path: "/posts?platform=eq.telegram&select=scraped_at&order=scraped_at.desc&limit=1", col: "scraped_at", bad: 12 },
  { job: "website", name: "جمع‌آوری وب‌سایت‌ها", path: "/posts?platform=eq.website&select=scraped_at&order=scraped_at.desc&limit=1", col: "scraped_at", bad: 12 },
  { job: "bale", name: "ادعاها و شایعات (بله)", path: "/posts?platform=eq.bale&select=scraped_at&order=scraped_at.desc&limit=1", col: "scraped_at", bad: 36 },
  { job: "newspapers", name: "روزنامه‌ها", path: "/newspapers?select=scraped_at&order=scraped_at.desc&limit=1", col: "scraped_at", bad: 54 },
  { job: "insights", name: "تحلیل «در یک نگاه»", path: "/news_ai_insights?select=computed_at&order=computed_at.desc&limit=1", col: "computed_at", bad: 24 },
  { job: "keywords", name: "کلیدواژه‌ی هوش مصنوعی", path: "/posts?ai_keywords_extracted_at=not.is.null&select=ai_keywords_extracted_at&order=ai_keywords_extracted_at.desc&limit=1", col: "ai_keywords_extracted_at", bad: 24 },
  { job: "cleanup", name: "پاک‌سازی رسانه‌های قدیمی" },
  { job: "hawza", name: "خزنده‌ی «درباره حوزه»", path: "/crawl_seen?select=seen_at&order=seen_at.desc&limit=1", col: "seen_at", bad: 14 },
];

export function githubHeaders(token: string, agent: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": agent,
  };
}
