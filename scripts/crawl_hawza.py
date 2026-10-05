"""
خزنده‌ی «آنچه درباره حوزه گفته می‌شود» (بخش «درباره حوزه»، تب دوم).

هر ۳ ساعت سایت‌های خبری جدول crawl_sites رو می‌گرده، خبرهای تازه‌ی هر سایت رو
پیدا می‌کنه (کراولینگ)، متن کامل هر خبر رو بیرون می‌کشه (اسکرپینگ) و خبرهایی
که درباره‌ی حوزه/روحانیت/مراجع/طلاب هستن رو در جدول hawza_mentions ذخیره می‌کنه.

پیدا کردن خبرهای تازه‌ی هر سایت، به ترتیب:
  ۱. sitemap خبری سایت (آدرس ثبت‌شده در crawl_sites یا پیدا شده از robots.txt /
     آدرس‌های رایج) — فهرست آماده‌ی خبرهای تازه با تاریخ، بدون فشار به سایت
  ۲. فید RSS (/rss، /feed)
  ۳. لینک‌های صفحه‌ی اول سایت (خزیدن یک‌سطحی)
هر خبر فقط یک‌بار خوانده می‌شه (هش آدرس در crawl_seen، ۲ روز نگه داشته می‌شه).

دو منبع دیگه (۵.۲۳.۰، خواست کاربر — «شبکه‌های اجتماعی را هم می‌خواهم»):
  - پست‌های ۴ ساعت اخیر کانال‌های ایتا/تلگرام/بله‌ای که سامانه همین الان جمع
    می‌کنه (جدول posts) با همین قاعده بررسی می‌شن (kind=social).
  - دنبال کردن یک‌مرحله‌ای لینک‌های داخل خبرها/پست‌های مرتبط: صفحه‌ی لینک‌شده
    خونده و بررسی می‌شه (kind=link اگه سایتش در فهرست نیست)، و سایت‌ها/کانال‌های
    ایتا و تلگرامی که در فهرست نیستن در crawl_suggestions («پیشنهاد منبع» در
    تنظیمات) با تعداد تکرار ثبت می‌شن تا مدیر با یه کلیک اضافه کنه.
فقط تیتر و گزیده‌ی متن ذخیره می‌شه، نه متن کامل (سقف ۵۰۰ مگ پایگاه داده‌ی رایگان).

تشخیص «درباره حوزه»: فهرست عبارت‌های TERMS (بعد از یکدست‌سازی حروف). خبری
مرتبطه که دست‌کم یکی از عبارت‌ها در تیترش باشه، یا در متنش دست‌کم ۲ بار بیاد
(یه اشاره‌ی گذرا در متن کافی نیست).

ادب خزیدن: احترام به robots.txt، یک درخواست در هر لحظه برای هر سایت با
DELAY_SECONDS مکث، و نام مشخص ربات در User-Agent.

اجرای آزمایشی بدون پایگاه داده (فهرست DEFAULT_SITES، فقط چاپ نتیجه):
  python scripts/crawl_hawza.py --dry-run

متغیرهای محیطی (GitHub Secrets، مثل بقیه‌ی کالکتورها): SUPABASE_URL،
SUPABASE_ANON_KEY، ADMIN_PASSWORD.
"""

import hashlib
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from html import unescape
from urllib import robotparser
from urllib.parse import unquote, urljoin, urlparse, urlunparse

import feedparser
import requests
import trafilatura

DRY_RUN = "--dry-run" in sys.argv
# فقط برای آزمایش: --only=نام۱,نام۲ (با --dry-run) و --debug (چاپ جزئیات کشف خبرها)
ONLY = next((a.split("=", 1)[1].split(",") for a in sys.argv if a.startswith("--only=")), None)
DEBUG = "--debug" in sys.argv

USER_AGENT = "Mozilla/5.0 (compatible; JarianBot/1.0; +https://meghdad158mf.github.io/vt42-qxr8-hn/)"
REQUEST_TIMEOUT = 20
DELAY_SECONDS = 1.0          # مکث بین دو درخواست به یک سایت
WINDOW_HOURS = 30            # خبرهای قدیمی‌تر (اگه تاریخ معلومه) کنار گذاشته می‌شن
MAX_PER_SITE = 40 if DRY_RUN else 100   # سقف خبرهای تازه‌ی هر سایت در هر اجرا
MAX_WORKERS = 8              # چند سایت هم‌زمان (هر سایت فقط یک درخواست در لحظه)
TIME_BUDGET_SECONDS = 18 * 60   # خزیدن سایت‌ها؛ بعدش پست‌ها و لینک‌ها
TOTAL_BUDGET_SECONDS = 25 * 60  # ورک‌فلو ۳۰ دقیقه وقت داره
SEEN_KEEP_DAYS = 2              # پنجره‌ی خبر تازه ۳۰ ساعته، پس ۲ روز کافیه
SOCIAL_LOOKBACK_HOURS = 4       # اجرا هر ۳ ساعته؛ هم‌پوشانی با url یکتا بی‌خطره
LINK_MAX_PER_RUN = 60           # سقف صفحه‌های لینک‌شده‌ای که در هر اجرا خونده می‌شن
LINK_MAX_PER_ITEM = 5
# دامنه‌هایی که لینکشون نه خبره نه منبع پیشنهادی (شبکه‌های اجتماعی، ویدئو، فروشگاه اپ...)
SKIP_LINK_DOMAINS = (
    "instagram.com", "twitter.com", "x.com", "youtube.com", "youtu.be", "facebook.com", "wa.me", "whatsapp.com",
    "linkedin.com", "aparat.com", "google.com", "goo.gl", "bit.ly", "telegram.org", "apple.com", "cafebazaar.ir",
    "myket.ir", "rubika.ir", "splus.ir", "igap.net", "ble.ir", "bale.ai", "virasty.com", "wikipedia.org",
    "t.co", "tiktok.com", "soroush-app.ir", "gap.im", "shad.ir", "eitaa.ir",
)
# سایت‌های خودِ حوزه (تب «اخبار حوزه») — نه خزیده می‌شن نه پیشنهاد
OWN_HAWZA_DOMAINS = ("hawzahnews.com", "rasanews.ir", "hawzah.net", "howzeh-khorasan.ir", "ismc.ir")
TEHRAN = timezone(timedelta(hours=3, minutes=30))

# همون فهرستی که migration_041 در crawl_sites می‌ذاره (فقط برای --dry-run)؛
# فهرست واقعی از پنل «تنظیمات بخش‌ها» مدیریت می‌شه.
DEFAULT_SITES = [
    ("ایرنا", "https://www.irna.ir", "https://www.irna.ir/sitemap/news/sitemap.xml"),
    ("ایسنا", "https://www.isna.ir", None),
    ("مهر", "https://www.mehrnews.com", "https://www.mehrnews.com/sitemap/news/sitemap.xml"),
    ("فارس", "https://www.farsnews.ir", None),
    ("خبرآنلاین", "https://www.khabaronline.ir", "https://www.khabaronline.ir/sitemap/news/sitemap.xml"),
    ("همشهری آنلاین", "https://www.hamshahrionline.ir", "https://www.hamshahrionline.ir/sitemap/news/sitemap.xml"),
    ("مشرق", "https://www.mashreghnews.ir", "https://www.mashreghnews.ir/sitemap/news/sitemap.xml"),
    ("قدس آنلاین", "https://www.qudsonline.ir", "https://www.qudsonline.ir/sitemap/news/sitemap.xml"),
    ("انتخاب", "https://www.entekhab.ir", "https://www.entekhab.ir/fa-sitemap-news"),
    ("عصر ایران", "https://www.asriran.com", "https://www.asriran.com/fa-sitemap-news"),
    ("تابناک", "https://www.tabnak.ir", "https://www.tabnak.ir/fa-sitemap-news"),
    ("آنا", "https://www.ana.ir", "https://www.ana.ir/fa-sitemap-news"),
    ("برنا", "https://www.borna.news", "https://www.borna.news/fa-sitemap-news"),
    ("کیهان", "https://www.kayhan.ir", "https://www.kayhan.ir/fa-sitemap-news"),
    ("جوان آنلاین", "https://www.javanonline.ir", "https://www.javanonline.ir/fa-sitemap-news"),
    ("شهرآرانیوز", "https://www.shahraranews.ir", "https://www.shahraranews.ir/fa-sitemap-news"),
    ("باشگاه خبرنگاران جوان", "https://www.yjc.ir", None),
    ("خبرگزاری صداوسیما", "https://www.iribnews.ir", None),
    ("ایلنا", "https://www.ilna.ir", None),
    ("جماران", "https://www.jamaran.news", None),
    ("اعتماد آنلاین", "https://www.etemadonline.com", None),
    ("شرق", "https://www.sharghdaily.com", None),
    ("هم‌میهن", "https://www.hammihanonline.ir", None),
    ("دنیای اقتصاد", "https://www.donya-e-eqtesad.com", None),
    ("نورنیوز", "https://www.nournews.ir", None),
    ("فرارو", "https://www.fararu.com", None),
    ("دیدبان ایران", "https://www.didbaniran.ir", None),
    ("خبر فوری", "https://www.khabarfoori.com", None),
    ("رکنا", "https://www.rokna.net", None),
    ("پانا", "https://www.pana.ir", None),
    ("الف", "https://www.alef.ir", None),
    ("بی‌بی‌سی فارسی", "https://www.bbc.com/persian", None),
    ("ایران اینترنشنال", "https://www.iranintl.com", None),
    ("رادیو فردا", "https://www.radiofarda.com", None),
    ("ایندیپندنت فارسی", "https://www.independentpersian.com", None),
    ("یورونیوز فارسی", "https://per.euronews.com", None),
    ("دویچه وله فارسی", "https://www.dw.com/fa-ir", None),
    ("ایران‌وایر", "https://iranwire.com/fa", None),
    ("زیتون", "https://www.zeitoons.com", None),
]

# عبارت‌های «درباره حوزه» — روی متن یکدست‌شده (norm) تطبیق داده می‌شن: نیم‌فاصله
# = فاصله، ي/ك عربی = ی/ک، بدون اعراب. (برچسب، الگو)؛ «روحانی» عمداً نیست
# (حسن روحانی)، «آیت‌الله» هم نه (تقریباً هر خبر رسمی).
TERMS = [
    ("حوزه علمیه", r"حوزه(?: ی| های| ها)? علمیه"),
    ("حوزویان", r"حوزوی(?:ان|ها)?"),
    ("طلاب", r"طلاب"),
    ("طلبه", r"طلبه(?: ها| ای)?"),
    ("روحانیت", r"روحانیت"),
    ("روحانیون", r"روحانیون"),
    ("مراجع تقلید", r"مراجع(?: عظام)?(?: تقلید)|مراجع عظام"),
    ("مرجع تقلید", r"مرجع تقلید"),
    ("جامعه مدرسین", r"جامعه مدرسین"),
    ("شورای عالی حوزه", r"شورای عالی حوزه(?: های| ها)?"),
    ("مدیر حوزه‌ها", r"مدیر(?:یت)? حوزه(?: های| ها)?(?: علمیه)?"),
    ("مدرسه علمیه", r"مدرسه(?: ی)? علمیه|مدارس علمیه"),
    ("معممین", r"معممین|عمامه"),
]
# منابع خارجی (انگلیسی و عربی) — برچسب‌ها فارسی تا چیپ‌ها یکدست بمونن. الگوهای عربی
# به شکل یکدست‌شده (ي→ی، ة→ه، أ/إ→ا)؛ انگلیسی بی‌حساسیت به بزرگی حروف. «seminary»
# تنها نیست (مدارس دینی مسیحی در خبرهای جهان)، فقط با قم/نجف/شیعه.
TERMS += [
    ("حوزه علمیه", r"(?i:hawza|howzeh|(?:qom|najaf|shiite|shia|islamic|religious) seminar(?:y|ies)|seminar(?:y|ies) (?:in|of) (?:qom|najaf))"),
    ("روحانیت*", r"(?i:clerics?|clergy(?:men)?|clerical establishment|mullahs?)"),
    ("مراجع تقلید", r"(?i:grand ayatollahs?|marja(?:'|’)?(?:iyya|iyat)?|sources? of emulation)"),
    ("طلاب", r"(?i:seminar(?:y|ian) students|seminarians)"),
    ("جامعه مدرسین", r"(?i:society of (?:seminary|qom seminary) teachers)"),
    ("حوزه علمیه", r"الحوزه(?: العلمیه)?|الحوزات العلمیه"),
    ("مراجع تقلید", r"المرجعیه(?: الدینیه)?|مراجع التقلید|المراجع العظام"),
    ("روحانیت*", r"رجال الدین|علماء الدین"),
    ("طلاب", r"طلبه العلوم الدینیه|طلاب الحوزه"),
]
TERM_RES = [(label, re.compile(r"(?<!\w)(?:" + pat + r")(?!\w)")) for label, pat in TERMS]

_CHAR_MAP = str.maketrans({
    "ي": "ی", "ى": "ی", "ئ": "ی", "ك": "ک", "ة": "ه", "ۀ": "ه", "أ": "ا", "إ": "ا", "ٱ": "ا",
    "‌": " ", "‍": " ", "‏": " ", "‎": " ", " ": " ", "ـ": "",
})
_DIACRITICS = re.compile(r"[ً-ٰٟ]")


def norm_with_map(text: str) -> tuple[str, list[int]]:
    """متن یکدست‌شده + نگاشت هر نویسه‌ی آن به جایش در متن اصلی (برای برش گزیده)."""
    out, idx = [], []
    prev_space = True
    for i, ch in enumerate(text):
        if _DIACRITICS.match(ch):
            continue
        c = ch.translate(_CHAR_MAP)
        if not c:
            continue
        if c.isspace():
            if prev_space:
                continue
            c, prev_space = " ", True
        else:
            prev_space = False
        out.append(c)
        idx.append(i)
    return "".join(out), idx


# «کوی طلاب»، «خیابان طلاب»… نام محله/خیابان‌ان (مشهد و اهواز) — نه طلبه‌ها (آزمایش ۱۰ مهر:
# اطلاعیه‌ی قطع برق اهواز اشتباهی «درباره حوزه» شده بود)
PLACE_BEFORE_RE = re.compile(r"(?:کوی|کوچه|خیابان|میدان|بلوار|محله|منطقه|پل|چهارراه|سه راه|فلکه|ایستگاه|بازار|شهرک|بزرگراه|پایانه)\s*$")


def find_terms(text: str) -> tuple[list[tuple[str, int, int]], list[int]]:
    n, idx = norm_with_map(text or "")
    hits = []
    for label, rx in TERM_RES:
        for m in rx.finditer(n):
            if label in ("طلاب", "طلبه") and PLACE_BEFORE_RE.search(n[max(0, m.start() - 20):m.start()]):
                continue
            hits.append((label, idx[m.start()], idx[m.end() - 1] + 1))
    # عبارت‌های هم‌پوشان («مدیر حوزه‌های علمیه» = «مدیر حوزه‌ها» + «حوزه علمیه») یک اشاره‌ان
    hits.sort(key=lambda h: (h[1], -(h[2] - h[1])))
    kept, last_end = [], -1
    for h in hits:
        if h[1] >= last_end:
            kept.append(h)
            last_end = h[2]
    return kept, idx


def make_excerpt(text: str, start: int, end: int) -> str:
    """جمله(های) دور اولین اشاره، حداکثر حدود ۴۰۰ نویسه."""
    left = max(0, start - 220)
    right = min(len(text), end + 260)
    seg_start = max(text.rfind(c, left, start) for c in ".؟!\n")
    seg_start = seg_start + 1 if seg_start >= left else left
    seg_end_candidates = [p for p in (text.find(c, end, right) for c in ".؟!\n") if p != -1]
    seg_end = min(seg_end_candidates) + 1 if seg_end_candidates else right
    ex = text[seg_start:seg_end].strip()
    if seg_start > 0 and seg_start == left:
        ex = "… " + ex
    if seg_end < len(text) and not seg_end_candidates:
        ex = ex + " …"
    return re.sub(r"\s+", " ", ex)


# ---------- شبکه ----------

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "fa,en;q=0.5"})


def http_get(url: str):
    return SESSION.get(url, timeout=REQUEST_TIMEOUT)


def canon_url(u: str) -> str:
    p = urlparse(u.strip())
    path = unquote(p.path).rstrip("/") or "/"
    return urlunparse((p.scheme.lower() or "https", p.netloc.lower().removeprefix("www."), path, "", p.query, ""))


def url_hash(u: str) -> str:
    return hashlib.md5(canon_url(u).encode("utf-8")).hexdigest()


def parse_date(s: str | None) -> datetime | None:
    if not s:
        return None
    s = s.strip()
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        try:
            d = datetime.strptime(s[:10], "%Y-%m-%d")
        except ValueError:
            return None
    if len(s) <= 10:
        d = d.replace(hour=23, minute=59)  # فقط تاریخ (مثل ایران‌وایر): آخر همون روز، وگرنه خبرهای دیروز بیرون می‌افتن
    if d.tzinfo is None:
        d = d.replace(tzinfo=TEHRAN)  # سایت‌های داخلی ساعت تهران رو بدون منطقه می‌نویسن
    return d


def jalali_today() -> tuple[int, int, int]:
    """تاریخ شمسی امروزِ تهران (برای پیدا کردن sitemap روزانه‌ی سایت‌هایی مثل خبرآنلاین)."""
    g = datetime.now(TEHRAN).date()
    gy, gm, gd = g.year, g.month, g.day
    g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    gy2 = gy + 1 if gm > 2 else gy
    days = 355666 + 365 * gy + (gy2 + 3) // 4 - (gy2 + 99) // 100 + (gy2 + 399) // 400 + gd + g_d_m[gm - 1]
    jy = -1595 + 33 * (days // 12053)
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        jy += (days - 1) // 365
        days = (days - 1) % 365
    jm = 1 + days // 31 if days < 186 else 7 + (days - 186) // 30
    jd = 1 + (days % 31 if days < 186 else (days - 186) % 30)
    return jy, jm, jd


def tag(block: str, name: str) -> str | None:
    m = re.search(r"<(?:\w+:)?" + name + r"\b[^>]*>(.*?)</(?:\w+:)?" + name + r">", block, re.S)
    if not m:
        return None
    v = m.group(1).strip()
    if v.startswith("<![CDATA["):
        v = v[9:-3]
    return unescape(v).strip()


def parse_sitemap(xml: str) -> tuple[list[dict], list[dict]]:
    """(urls, child_sitemaps) — هر کدوم {loc, date, title}."""
    urls, children = [], []
    for b in re.findall(r"<url>(.*?)</url>", xml, re.S):
        loc = tag(b, "loc")
        if loc:
            urls.append({"loc": loc, "date": parse_date(tag(b, "publication_date") or tag(b, "lastmod")), "title": tag(b, "title")})
    for b in re.findall(r"<sitemap>(.*?)</sitemap>", xml, re.S):
        loc = tag(b, "loc")
        if loc:
            children.append({"loc": loc, "date": parse_date(tag(b, "lastmod"))})
    return urls, children


def pick_children(children: list[dict]) -> list[dict]:
    """از فهرست sitemapهای یک index، تازه‌ترین‌ها (حداکثر ۲) — با امتیاز: تاریخ
    امروز/این ماه (شمسی یا میلادی) در نام، lastmod تازه‌تر، و واژه‌ی news/article."""
    jy, jm, jd = jalali_today()
    g = datetime.now(TEHRAN)
    day_keys = [f"{jy}/{jm:02d}/{jd:02d}", f"{jy}{jm:02d}{jd:02d}", f"{jy}-{jm}-{jd}", g.strftime("%Y-%m-%d"), g.strftime("%Y/%m/%d")]
    month_keys = [f"{jy}/{jm:02d}", f"{jy}-{jm}-", f"{jy}{jm:02d}", f"{jy}-{jm:02d}", g.strftime("%Y-%m"), g.strftime("%Y/%m")]

    def score(c: dict) -> float:
        loc, sc = c["loc"], 0.0
        if any(k in loc for k in day_keys):
            sc += 8
        elif any(k in loc for k in month_keys):
            sc += 3
        if re.search(r"news|article|post|خبر", loc, re.I) and not re.search(r"video|image|tag|author|categor", loc, re.I):
            sc += 3
        if c["date"]:
            age_h = (g - c["date"]).total_seconds() / 3600
            sc += 4 if age_h < 48 else (1 if age_h < 24 * 30 else 0)
        return sc

    scored = [(score(c), -i, c) for i, c in enumerate(children)]
    if not any(sc for sc, _, _ in scored):
        # هیچ نشانه‌ای نیست: بیشتر CMSها به ترتیب زمان (جدید→قدیم یا برعکس) فهرست می‌کنن
        return [children[0], children[-1]] if len(children) > 1 else children
    scored.sort(key=lambda t: (t[0], t[1]), reverse=True)
    return [c for _, _, c in scored[:2]]


class Site:
    def __init__(self, row: dict):
        self.row = row
        self.id = row.get("id")
        self.name = row["name"]
        self.url = row["url"].rstrip("/")
        p = urlparse(self.url)
        self.root = f"{p.scheme}://{p.netloc}"
        self.host = p.netloc.lower().removeprefix("www.")
        # بخش زبانی سایت (bbc.com/persian، alarabiya.net/farsi، dw.com/fa-ir): sitemap کل
        # سایت رو می‌ده، ولی فقط خبرهای همین بخش خونده می‌شن
        self.prefix = p.path.rstrip("/").lower()
        self.rp = None
        self.via = None

    def wait(self):
        time.sleep(DELAY_SECONDS)

    def allowed(self, url: str) -> bool:
        if self.rp is None:
            rp = robotparser.RobotFileParser()
            try:
                r = http_get(self.root + "/robots.txt")
                rp.parse(r.text.splitlines() if r.ok else [])
                self.robots_txt = r.text if r.ok else ""
            except requests.RequestException:
                rp.parse([])
                self.robots_txt = ""
            self.rp = rp
        return self.rp.can_fetch(USER_AGENT, url)

    def in_section(self, u: str) -> bool:
        if not self.prefix:
            return True
        path = unquote(urlparse(u).path).lower()
        return path == self.prefix or path.startswith(self.prefix + "/")

    def same_site(self, u: str, also: str | None = None) -> bool:
        h = urlparse(u).netloc.lower().removeprefix("www.")
        # also: میزبان خودِ فایل sitemap — بعضی سایت‌ها (صداوسیما: iribnews.ir →
        # irib-news.ir) فهرست خبرهاشون رو روی دامنه‌ی خواهر منتشر می‌کنن
        return h == self.host or (also is not None and h == urlparse(also).netloc.lower().removeprefix("www."))

    # --- کشف خبرهای تازه ---
    def from_sitemap(self, url: str, depth: int = 0) -> list[dict]:
        r = http_get(url)
        self.wait()
        if DEBUG:
            print(f"    [{self.name}] sitemap {url} -> {r.status_code} {r.headers.get('content-type','')} {len(r.content)}b start={r.text[:80]!r}")
        if not r.ok or "<" not in r.text[:500]:
            return []
        urls, children = parse_sitemap(r.text)
        for u in urls:
            u["src"] = r.url
        if DEBUG:
            print(f"    [{self.name}]   urls={len(urls)} children={len(children)} sample={[(u['loc'][-60:], str(u['date'])) for u in urls[:3]]} child_sample={[c['loc'] for c in children[:3]]} last={[c['loc'] for c in children[-2:]]}")
        if urls:
            return urls
        if children and depth == 0:
            out = []
            for c in pick_children(children):
                out += self.from_sitemap(c["loc"], depth + 1)
            return out
        return []

    def sitemap_candidates(self) -> list[str]:
        self.allowed(self.root + "/")  # robots.txt رو می‌خونه
        listed = re.findall(r"(?im)^\s*sitemap:\s*(\S+)", getattr(self, "robots_txt", ""))
        # خبری‌ها اول، ویدئو/عکس/آرشیو آخر
        listed.sort(key=lambda u: (0 if re.search(r"news", u, re.I) else 1) + (2 if re.search(r"video|image|archive", u, re.I) else 0))
        own = [u for u in listed if self.same_site(u)]
        other = [u for u in listed if not self.same_site(u) and not re.match(r"https?://(english|arabic|en|ar)\.", u)]
        common = [self.root + p for p in ("/sitemap/news/sitemap.xml", "/fa-sitemap-news", "/news-sitemap.xml", "/sitemap_news.xml", "/sitemap.xml", "/sitemap_index.xml")]
        out = []
        for u in own[:4] + common + other[:2]:
            if u not in out:
                out.append(u)
        return out

    def from_rss(self) -> list[dict]:
        for path in ("/rss", "/feed", "/rss.xml"):
            try:
                r = http_get(self.url + path)
            except requests.RequestException:
                continue
            self.wait()
            if r.ok and ("<item" in r.text or "<entry" in r.text):
                feed = feedparser.parse(r.content)
                out = []
                for e in feed.entries:
                    parsed = e.get("published_parsed") or e.get("updated_parsed")
                    d = datetime(*parsed[:6], tzinfo=timezone.utc) if parsed else None
                    if e.get("link"):
                        out.append({"loc": e["link"], "date": d, "title": e.get("title")})
                if out:
                    return out
        return []

    def from_homepage(self) -> list[dict]:
        r = http_get(self.url)
        self.wait()
        if not r.ok:
            return []
        out, seen = [], set()
        for href in re.findall(r'href="([^"#]+)"', r.text):
            u = urljoin(r.url, unescape(href))
            path = urlparse(u).path
            # آدرس خبر معمولاً شناسه‌ی عددی (۴ رقم به بالا) یا مسیر بلند داره
            if not self.same_site(u) or not self.in_section(u) or not re.search(r"\d{4,}", path) or len(path) < 12:
                continue
            if re.search(r"\.(jpg|jpeg|png|gif|webp|pdf|mp4|mp3|css|js)$", path, re.I):
                continue
            if u not in seen:
                seen.add(u)
                out.append({"loc": u, "date": None, "title": None})
        return out

    def discover(self) -> list[dict]:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=WINDOW_HOURS)
        cands = []
        if self.row.get("sitemap_url"):
            cands.append(self.row["sitemap_url"])
        cands += [u for u in self.sitemap_candidates() if u not in cands]
        undated = None
        for u in cands[:8]:
            try:
                items = self.from_sitemap(u)
            except requests.RequestException:
                continue
            items = [i for i in items if self.same_site(i["loc"], i.get("src")) and self.in_section(i["loc"])]
            dated = [i for i in items if i["date"]]
            # sitemapی قبوله که خبر تازه داشته باشه (رکنا: sitemap ویدئوی قدیمی؛
            # فارس: فقط صفحه‌های بخش‌ها، بدون تاریخ)
            if any(i["date"] >= cutoff for i in dated):
                self.via = "sitemap"
                return items
            if items and not dated and len(items) >= 20 and undated is None:
                undated = items
        items = self.from_rss()
        if items:
            self.via = "rss"
            return items
        if undated:
            self.via = "sitemap"
            return undated
        items = self.from_homepage()
        self.via = "homepage" if items else None
        return items

    # --- خواندن یک خبر ---
    def read_article(self, item: dict) -> dict | None:
        r = http_get(item["loc"])
        if "html" not in r.headers.get("content-type", "html"):
            return {"permanent": True}
        if r.status_code >= 400:
            return {"permanent": 400 <= r.status_code < 500}
        raw = trafilatura.extract(r.content, url=r.url, output_format="json", with_metadata=True,
                                  include_comments=False, include_tables=False, favor_precision=True)
        data = json.loads(raw) if raw else {}
        title = (item.get("title") or data.get("title") or "").strip()
        if not title:
            m = re.search(r"<title[^>]*>(.*?)</title>", r.text, re.S | re.I)
            title = unescape(m.group(1)).strip() if m else ""
        return {"title": title, "text": (data.get("text") or "").strip(), "date": item.get("date") or parse_date(data.get("date")),
                "html": r.content, "final_url": r.url}


def extract_links(html: bytes, base: str) -> list[str]:
    """لینک‌های داخل متن اصلی خبر (نه منو/ستون کناری) — trafilatura با include_links."""
    try:
        xml = trafilatura.extract(html, url=base, output_format="xml", include_links=True,
                                  include_comments=False, favor_precision=True) or ""
    except Exception:
        return []
    out = []
    for t in re.findall(r'target="([^"]+)"', xml):
        u = urljoin(base, unescape(t))
        if u.startswith("http") and u not in out:
            out.append(u)
    return out


URL_RE = re.compile(r"https?://[^\s<>\"'«»()\[\]،]+")
BARE_SOCIAL_RE = re.compile(r"(?<![\w./])(?:t\.me|telegram\.me|eitaa\.com)/[A-Za-z0-9_]{4,40}")
HANDLE_RE = re.compile(r"(?<![\w@])@([A-Za-z][A-Za-z0-9_]{3,39})")
SOCIAL_HOSTS = {"t.me": "telegram", "telegram.me": "telegram", "eitaa.com": "eitaa"}


def host_of(u: str) -> str:
    return urlparse(u).netloc.lower().split(":")[0].removeprefix("www.")


def domain_in(host: str, domains) -> bool:
    return any(host == d or host.endswith("." + d) for d in domains)


def link_target(u: str):
    """(نوع، کلید، آدرس): ('telegram'|'eitaa', نام کانال، None) یا ('site', دامنه، آدرس) یا None."""
    p = urlparse(u)
    host = host_of(u)
    if host in SOCIAL_HOSTS:
        seg = p.path.strip("/").split("/")
        h = seg[0] if seg else ""
        if h.lower() in ("joinchat", "s", "c", "share", "addstickers", "proxy", "iv") or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{3,39}", h):
            return None
        return (SOCIAL_HOSTS[host], h.lower(), None)
    if not host or "." not in host or domain_in(host, SKIP_LINK_DOMAINS):
        return None
    if re.search(r"\.(jpg|jpeg|png|gif|webp|svg|pdf|mp4|mp3|zip|rar|apk)$", p.path, re.I):
        return None
    return ("site", host, u)


def social_links(text: str, platform: str) -> list[str | tuple]:
    out = URL_RE.findall(text or "")
    out += ["https://" + m for m in BARE_SOCIAL_RE.findall(text or "")]
    # @نام در پست ایتا/تلگرام = کانالی در همون پیام‌رسان
    if platform in ("eitaa", "telegram"):
        out += [(platform, h.lower(), None) for h in HANDLE_RE.findall(text or "")]
    return out


# برچسب‌های «*»دار عام‌ان (cleric، رجال الدین — هر کشوری)؛ فقط وقتی شمرده می‌شن که
# خودِ مطلب به ایران/شیعه/قم/نجف ربط داشته باشه
IRAN_CONTEXT_RE = re.compile(r"(?i:iran|tehran|qom|mashhad|najaf|shia|shiite|khamenei|sistani)|ایران|قم|مشهد|النجف|نجف|الشیعه|شیعه|خامنه|السیستانی")


def classify(title: str, text: str) -> dict | None:
    t_hits, _ = find_terms(title)
    b_hits, _ = find_terms(text)
    if any(h[0].endswith("*") for h in t_hits + b_hits):
        ctx = bool(IRAN_CONTEXT_RE.search(title or "") or IRAN_CONTEXT_RE.search(text or ""))
        t_hits = [(l.rstrip("*"), a, b) for l, a, b in t_hits if ctx or not l.endswith("*")]
        b_hits = [(l.rstrip("*"), a, b) for l, a, b in b_hits if ctx or not l.endswith("*")]
    if not t_hits and len(b_hits) < 2:
        return None
    labels = []
    for h in t_hits + b_hits:
        if h[0] not in labels:
            labels.append(h[0])
    excerpt = make_excerpt(text, b_hits[0][1], b_hits[0][2]) if b_hits else (text[:300] + ("…" if len(text) > 300 else ""))
    return {"matched_terms": labels, "hits": len(t_hits) + len(b_hits), "in_title": bool(t_hits), "excerpt": excerpt}


# ---------- پایگاه داده ----------

if not DRY_RUN:
    SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
    SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
    ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]


def login() -> str:
    r = requests.post(f"{SUPABASE_URL}/rest/v1/rpc/login",
                      headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
                      json={"password": ADMIN_PASSWORD}, timeout=REQUEST_TIMEOUT)
    r.raise_for_status()
    return r.json()["token"]


def db(token: str, method: str, path: str, **kw):
    headers = {"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    headers.update(kw.pop("headers", {}))
    return requests.request(method, f"{SUPABASE_URL}/rest/v1/{path}", headers=headers, timeout=REQUEST_TIMEOUT, **kw)


def already_seen(token: str | None, hashes: list[str]) -> set[str]:
    if DRY_RUN or not hashes:
        return set()
    seen = set()
    for i in range(0, len(hashes), 150):
        chunk = hashes[i:i + 150]
        r = db(token, "GET", "crawl_seen", params={"select": "url_hash", "url_hash": "in.(" + ",".join(chunk) + ")"})
        r.raise_for_status()
        seen |= {x["url_hash"] for x in r.json()}
    return seen


# ---------- اجرای هر سایت ----------

def crawl_site(site: Site, token: str | None, deadline: float) -> dict:
    res = {"site": site, "pages": 0, "found": [], "seen": [], "error": None, "discovered": 0}
    try:
        items = site.discover()
    except requests.RequestException as e:
        res["error"] = f"دسترسی به سایت ممکن نشد ({type(e).__name__})"
        return res
    if not items:
        res["error"] = "فهرست خبرهای تازه پیدا نشد (sitemap، RSS و صفحه‌ی اول)"
        return res
    cutoff = datetime.now(timezone.utc) - timedelta(hours=WINDOW_HOURS)
    uniq, keys = [], set()
    for it in items:
        if it["date"] and it["date"] < cutoff:
            continue
        h = url_hash(it["loc"])
        if h not in keys:
            keys.add(h)
            it["hash"] = h
            uniq.append(it)
    uniq.sort(key=lambda i: i["date"] or datetime.now(timezone.utc), reverse=True)
    res["discovered"] = len(uniq)
    if DEBUG:
        print(f"    [{site.name}] via={site.via} items={len(items)} in-window={len(uniq)} dates={sorted(str(i['date'])[:16] for i in items if i['date'])[-3:]}")
    seen = already_seen(token, [i["hash"] for i in uniq])
    todo = [i for i in uniq if i["hash"] not in seen][:MAX_PER_SITE]
    for it in todo:
        if time.time() > deadline:
            break
        if not site.allowed(it["loc"]):
            res["seen"].append(it["hash"])
            continue
        try:
            art = site.read_article(it)
        except requests.RequestException:
            site.wait()
            continue  # خطای موقت: دفعه‌ی بعد دوباره امتحان می‌شه
        except Exception as e:  # خرابی تجزیه‌ی یه صفحه نباید کل سایت رو بخوابونه
            print(f"    [!] {it['loc'][:90]}: {type(e).__name__}: {e}", file=sys.stderr)
            art = {"permanent": True}
        site.wait()
        res["pages"] += 1
        if art.get("permanent") is not None:
            if art["permanent"]:
                res["seen"].append(it["hash"])
            continue
        res["seen"].append(it["hash"])
        if not art["title"] and not art["text"]:
            continue
        c = classify(art["title"], art["text"])
        if c:
            res["found"].append({
                "url": it["loc"], "site": site.host, "site_name": site.name, "kind": "site",
                "title": art["title"][:500] or "(بدون عنوان)",
                "published_at": art["date"].isoformat() if art["date"] else None, **c,
                "_links": extract_links(art["html"], art["final_url"])[:30],
            })
    return res


# ---------- پست‌های شبکه‌های اجتماعی (کانال‌هایی که سامانه جمع می‌کنه) ----------

def social_title(post: dict) -> str:
    if post.get("title"):
        return post["title"].strip()
    first = next((ln.strip() for ln in (post.get("text") or "").split("\n") if ln.strip()), "")
    return first if len(first) <= 150 else first[:150].rsplit(" ", 1)[0] + "…"


def scan_social(token: str) -> tuple[list[dict], list[tuple[str, list]]]:
    since = (datetime.now(timezone.utc) - timedelta(hours=SOCIAL_LOOKBACK_HOURS)).isoformat()
    # وب‌سایت‌ها هم: کانال‌های RSS خارجی (CNN، گاردین…) در فهرست خزنده نیستن؛ سایت‌های
    # خودِ حوزه (show_in_hawza) نه
    r = db(token, "GET", "channels", params={"select": "id,title,username,platform,show_in_hawza", "platform": "in.(eitaa,telegram,bale,website)"})
    r.raise_for_status()
    chans = {c["id"]: c for c in r.json() if not (c["platform"] == "website" and c.get("show_in_hawza"))}
    found, links = [], []
    for page in range(6):
        r = db(token, "GET", "posts", params={
            "select": "id,channel_id,platform,title,text,link,posted_at,scraped_at",
            "platform": "in.(eitaa,telegram,bale,website)", "scraped_at": f"gte.{since}", "hidden_at": "is.null",
            "order": "id", "limit": "1000", "offset": str(page * 1000)})
        r.raise_for_status()
        rows = r.json()
        for p in rows:
            if p["channel_id"] not in chans:
                continue
            title = social_title(p)
            text = p.get("text") or ""
            # تیتر ساختگی = خط اول متن؛ برای اینکه یه اشاره دوبار شمرده نشه، از متن کم می‌شه
            body = text if p.get("title") else (text.strip().split("\n", 1) + [""])[1]
            c = classify(title, body)
            if not c or not p.get("link"):
                continue
            ch = chans.get(p["channel_id"], {})
            web = p["platform"] == "website"
            found.append({
                "url": p["link"], "site": host_of(p["link"]) if web else p["platform"],
                "site_name": ch.get("title") or ch.get("username") or p["platform"],
                "kind": "site" if web else "social", "post_id": p["id"], "title": title or "(بدون عنوان)",
                "published_at": p.get("posted_at") or p.get("scraped_at"), **c,
            })
            links.append((p["link"], social_links(p.get("text") or "", p["platform"])))
        if len(rows) < 1000:
            break
    return found, links


# ---------- دنبال کردن لینک‌ها و پیشنهاد منبع ----------

def follow_links(sources: list[tuple[str, list]], token: str | None, site_names: dict, known_channels: set,
                 deadline: float) -> tuple[list[dict], list[str], dict]:
    """sources: (آدرس مطلب مرتبط، لینک‌های داخلش). خروجی: (خبرهای مرتبط تازه، هش‌های خونده‌شده، پیشنهادها)."""
    suggest: dict[tuple, dict] = {}
    to_fetch: dict[str, str] = {}  # url -> host
    for src, raw_links in sources:
        targets = {}
        for l in raw_links[:200]:
            t = l if isinstance(l, tuple) else link_target(l)
            if t and (t[0], t[1]) not in targets:
                targets[(t[0], t[1])] = t
        n = 0
        for (kind, key), t in targets.items():
            if kind in ("telegram", "eitaa"):
                if (kind, key) not in known_channels:
                    s = suggest.setdefault((kind, key), {"kind": kind, "key": key, "name": "@" + key, "sample_url": src, "hits": 0, "found": 0})
                    s["hits"] += 1
                continue
            if domain_in(key, OWN_HAWZA_DOMAINS) or host_of(src) == key:
                continue  # سایت حوزوی، یا لینک داخلی همون خبر (منو/خبرهای مرتبط)
            if key not in site_names:
                s = suggest.setdefault(("site", key), {"kind": "site", "key": key, "name": key, "sample_url": t[2], "hits": 0, "found": 0})
                s["hits"] += 1
            path = urlparse(t[2]).path
            if len(path) >= 8 and n < LINK_MAX_PER_ITEM and len(to_fetch) < LINK_MAX_PER_RUN:
                to_fetch.setdefault(t[2], key)
                n += 1
    hashes = {u: url_hash(u) for u in to_fetch}
    seen = already_seen(token, list(hashes.values()))
    found, read = [], []
    by_host: dict[str, list[str]] = {}
    for u, h in to_fetch.items():
        if hashes[u] not in seen:
            by_host.setdefault(h, []).append(u)
    for host, urls in by_host.items():
        if time.time() > deadline:
            break
        p = urlparse(urls[0])
        site = Site({"id": None, "name": site_names.get(host, host), "url": f"{p.scheme}://{p.netloc}"})
        for u in urls:
            if time.time() > deadline:
                break
            try:
                if not site.allowed(u):
                    continue
                art = site.read_article({"loc": u, "date": None, "title": None})
            except requests.RequestException:
                continue
            except Exception as e:
                print(f"    [!] link {u[:90]}: {type(e).__name__}: {e}", file=sys.stderr)
                continue
            finally:
                site.wait()
            if art.get("permanent") is not None:
                continue
            read.append(hashes[u])
            c = classify(art["title"], art["text"]) if (art["title"] or art["text"]) else None
            if not c:
                continue
            known = host in site_names
            found.append({
                "url": u, "site": host, "site_name": site_names.get(host, host), "kind": "site" if known else "link",
                "title": art["title"][:500] or "(بدون عنوان)",
                "published_at": art["date"].isoformat() if art["date"] else None, **c,
            })
            if not known and ("site", host) in suggest:
                suggest[("site", host)]["found"] += 1
    return found, read, suggest


def main() -> None:
    started = time.time()
    deadline = started + TIME_BUDGET_SECONDS
    total_deadline = started + TOTAL_BUDGET_SECONDS
    token = None
    known_channels: set = set()
    if DRY_RUN:
        rows = [{"id": None, "name": n, "url": u, "sitemap_url": s} for n, u, s in DEFAULT_SITES if not ONLY or n in ONLY]
    else:
        token = login()
        r = db(token, "GET", "crawl_sites", params={"select": "id,name,url,sitemap_url,active", "order": "id"})
        r.raise_for_status()
        all_sites = r.json()
        rows = [x for x in all_sites if x.get("active")]
        r = db(token, "GET", "channels", params={"select": "platform,username", "platform": "in.(eitaa,telegram)"})
        r.raise_for_status()
        known_channels = {(c["platform"], (c["username"] or "").lower().lstrip("@")) for c in r.json()}
    # همه‌ی سایت‌های فهرست (حتی متوقف‌ها) «شناخته‌شده»ان — دوباره پیشنهاد نشن
    site_names = {host_of(x["url"]): x["name"] for x in (rows if DRY_RUN else all_sites)}
    print(f"[*] {len(rows)} site(s) to crawl")

    with ThreadPoolExecutor(MAX_WORKERS) as ex:
        results = list(ex.map(lambda row: crawl_site(Site(row), token, deadline), rows))

    found, seen, failed = [], [], 0
    for res in results:
        s = res["site"]
        if res["error"]:
            failed += 1
        found += res["found"]
        seen += res["seen"]
        print(f"  {s.name:24} via={s.via or '-':8} new={res['discovered']:4} read={res['pages']:4} "
              f"found={len(res['found']):3}" + (f"  ERR: {res['error']}" if res["error"] else ""))
        if not DRY_RUN and s.id is not None:
            db(token, "PATCH", f"crawl_sites?id=eq.{s.id}", headers={"Prefer": "return=minimal"}, json={
                "last_run_at": datetime.now(timezone.utc).isoformat(), "last_pages": res["pages"],
                "last_found": len(res["found"]), "last_error": res["error"], "last_via": s.via,
            })

    # پست‌های شبکه‌های اجتماعی
    social, social_src = ([], [])
    if not DRY_RUN:
        try:
            social, social_src = scan_social(token)
        except requests.RequestException as e:
            print(f"[!] social scan failed: {e}", file=sys.stderr)
    print(f"[*] social/RSS posts about hawza: {len(social)}")

    # لینک‌های مطالب مرتبط (یک مرحله) + پیشنهاد منبع
    sources = [(f["url"], f.pop("_links", [])) for f in found] + social_src
    linked, link_seen, suggest = follow_links(sources, token, site_names, known_channels, total_deadline)
    print(f"[*] followed links: {len(linked)} about hawza, {len(link_seen)} page(s) read, {len(suggest)} suggestion(s)")
    seen += link_seen
    # یه خبر ممکنه هم از sitemap، هم از RSS (پست‌ها) و هم از لینک برسه — آدرس یکسان یکی می‌شه
    merged, keys = [], set()
    for f in found + social + linked:
        k = url_hash(f["url"])
        if k not in keys:
            keys.add(k)
            merged.append(f)
    found = merged
    # PostgREST درج گروهی با کلیدهای ناهمسان رو کامل رد می‌کنه (PGRST102) — پست‌های
    # شبکه‌ی اجتماعی post_id دارن و خبر سایت/لینک نه؛ همه یه مجموعه کلید بگیرن
    for f in found:
        f.setdefault("post_id", None)

    print(f"[*] read {sum(r['pages'] for r in results) + len(link_seen)} page(s), {len(found)} about hawza, "
          f"{failed}/{len(rows)} site(s) failed, {time.time() - started:.0f}s")
    if DRY_RUN:
        for f in sorted(found, key=lambda f: -f["hits"]):
            print(f"\n- [{f['site_name']}] ({f['kind']}) {f['title']}\n  {f['url']}\n  terms={'، '.join(f['matched_terms'])} hits={f['hits']} title={f['in_title']} date={f['published_at']}\n  {f['excerpt'][:300]}")
        for s in sorted(suggest.values(), key=lambda s: (-s["found"], -s["hits"]))[:30]:
            print(f"  suggest {s['kind']:8} {s['key']:40} hits={s['hits']} found={s['found']}")
        return

    ok = True
    if found:
        r = db(token, "POST", "hawza_mentions", params={"on_conflict": "url"},
               headers={"Prefer": "resolution=ignore-duplicates,return=minimal"}, json=found)
        if not r.ok:
            print(f"[!] insert hawza_mentions failed: {r.status_code} {r.text[:300]}", file=sys.stderr)
            ok = False
    if suggest:
        r = db(token, "POST", "rpc/crawl_suggest", json={"items": list(suggest.values())})
        if not r.ok:
            print(f"[!] crawl_suggest failed: {r.status_code} {r.text[:300]}", file=sys.stderr)
    # اگه ذخیره‌ی خبرها شکست خورد، «دیده‌شده» علامت نخورن تا اجرای بعدی دوباره امتحانشون کنه
    for i in range(0, len(seen) if ok else 0, 500):
        r = db(token, "POST", "crawl_seen", params={"on_conflict": "url_hash"},
               headers={"Prefer": "resolution=ignore-duplicates,return=minimal"},
               json=[{"url_hash": h} for h in seen[i:i + 500]])
        if not r.ok:
            print(f"[!] insert crawl_seen failed: {r.status_code} {r.text[:300]}", file=sys.stderr)
            ok = False
            break
    old = (datetime.now(timezone.utc) - timedelta(days=SEEN_KEEP_DAYS)).isoformat()
    db(token, "DELETE", "crawl_seen", params={"seen_at": f"lt.{old}"}, headers={"Prefer": "return=minimal"})

    if not ok:
        sys.exit(1)
    if rows and failed == len(rows):
        print(f"[!] all {failed} site(s) failed", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
