"""
جمع‌آوری دوره‌ای پست‌های کانال «ادعاها و شایعات» (@rasadfakenews) از پیام‌رسان
بله و ذخیره در Supabase. با GitHub Actions طبق زمان‌بندی اجرا می‌شود.

نیاز به این متغیرهای محیطی دارد (به‌صورت GitHub Secrets تنظیم می‌شوند):
  SUPABASE_URL        مثل https://xxxxx.supabase.co
  SUPABASE_ANON_KEY    کلید anon پروژه (Project Settings → API)
  ADMIN_PASSWORD       همان رمز عبور «مدیر» که در schema.sql تنظیم شد

منطق پارس HTML: صفحه‌ی https://ble.ir/<username> یک اپ Next.js است که سمت
سرور رندر می‌شه — HTML اولیه (بدون اجرای جاوااسکریپت) شامل کل payload
پیام‌ها می‌شه، اما نه به‌شکل تگ‌های HTML معمولی، بلکه به‌شکل «React Flight»:
داخل چند <script>self.__next_f.push([1,"..."])</script> که هر کدوم بخشی از
یک استریم متنی رمزگذاری‌شده رو حمل می‌کنن. بعد از چسباندن و unescape کردن
همه‌ی این تکه‌ها، استریم نهایی از خط‌هایی به فرم «<id>:<محتوا>» تشکیل می‌شه:
  - خط‌های معمولی: JSON خام، با \n در انتها تموم می‌شن.
  - خط‌های متنی طولانی (مثل متن کامل هر پیام): فرمت «T<طول‌هگز>,<متن>» دارن
    — طول به‌شکل بایت UTF-8 دقیقه، نه تعداد کاراکتر، پس باید روی بایت
    برش بزنیم نه روی رشته‌ی پایتونی.
یکی از خط‌های JSON شامل کلید "messages" با آرایه‌ی پیام‌هاست؛ متن هر پیام
به‌جای این‌که مستقیم توی همون JSON باشه، یک ارجاع مثل "$15" داره که باید
از توی جدول خط‌های متنی («T...») با همون id resolve بشه.

این منطق با یه نسخه‌ی واقعی (کوتاه‌شده) از HTML صفحه تست و تأیید شده
(شامل حالت‌های لبه‌ای مثل ستاره‌های تنها/جفت‌نشده در متن پیام).

بازنویسی متن (parse_bale_message): هر پست این کانال ساختار ثابتی داره
(موضوع/اهداف/رسانه‌های منتشرکننده/سطح انتشار/الگوی انتشار). طبق درخواست
کاربر: «موضوع» جدا می‌شه و posts.title می‌شه (عکس ندارن، پس این تیتر
جای عکس/تصویر شاخص رو می‌گیره)؛ «اهداف» کلاً حذف می‌شه؛ «رسانه‌های
منتشرکننده» می‌مونه با عنوان جدید «انتشار توسط:»؛ برچسب‌های «سطح
انتشار:» و کلمه‌ی شدت («متوسط؛»/«بالا؛») حذف می‌شن ولی متن بعدشون
می‌مونه؛ «الگوی انتشار:» هم حذف می‌شه ولی متنش می‌مونه.
"""

import datetime
import html as html_lib
import json
import os
import re
import sys

import requests

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]

REQUEST_TIMEOUT = 20

PUSH_RE = re.compile(r'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)')
# با `*` نه `+`: صفحه‌ی واقعی خط‌های hint بدون شناسه هم داره، مثل
# `:HL["/_next/static/css/...","style",...]` — این‌ها راهنمای preload
# منابعن، نه ردیف پیام؛ اگه با `+` فقط شناسه‌ی غیرخالی قبول کنیم، parse
# دقیقاً همین‌جا با «هیچ match نشد» بی‌صدا متوقف می‌شه و هیچ‌وقت به ردیف‌های
# بعدی (شامل messages و متن پیام‌ها) نمی‌رسه — دقیقاً همون باگی که باعث
# می‌شد کالکتور همیشه ۰ پست ذخیره کنه با اینکه هیچ خطایی هم نمی‌داد
ROW_ID_RE = re.compile(r'([0-9a-zA-Z]*):')
# فقط *بولد*هایی که حداکثر یک خط جدید داخلشونه رو تبدیل می‌کنیم (مثل تیتر
# «موضوع:» + متن زیرش) — نه بولدهایی که از یک پاراگراف کامل رد می‌شن؛ چون
# این کانال گاهی ستاره‌های تنها/جفت‌نشده وسط متن داره (اشتباه تایپی ادمین)
# که اگه به بولدهای بعدی وصل بشن، یه تیکه‌ی غول‌پیکر و بی‌ربط بولد می‌شه.
BOLD_RE = re.compile(r"\*((?:[^*\n]|\n(?!\n))+)\*")
# هر پست این کانال ساختار ثابتی داره: موضوع/اهداف/رسانه‌های منتشرکننده/
# سطح انتشار/الگوی انتشار — هر بخش با یکی از این ۵ اموجی شروع می‌شه. طبق
# خواسته‌ی کاربر: «موضوع» → عنوان جدا؛ «اهداف» → کلاً حذف؛ «رسانه‌های
# منتشرکننده» → نگه داشته می‌شه با عنوان جدید «انتشار توسط:»؛ «سطح
# انتشار:» و کلمه‌ی شدت («متوسط؛»/«بالا؛») حذف می‌شن ولی ادامه‌ی متنش
# می‌مونه؛ «الگوی انتشار:» هم حذف می‌شه ولی متنش می‌مونه.
#
# ۵ شهریور ۱۴۰۵: ادمین کانال فرمت پیام‌ها رو عوض کرد — دیگه بخش‌های
# «رسانه‌های منتشرکننده/سطح انتشار/الگوی انتشار» نمی‌ذاره، فقط «موضوع» و
# یه بخش با همون اموجی 🎯 که قبلاً «اهداف» بود ولی الان برچسبش «توضیحات»ه
# و کل متن اصلی ادعا/شایعه رو حمل می‌کنه (نه چیزی که باید دور ریخته بشه).
# چون parse_bale_message برچسب متنی هر بخش رو نگه نمی‌داره (فقط اموجی)،
# تشخیص فرمت جدید به‌جای مقایسه‌ی برچسب، از روی نبودِ هر سه بخش قدیمی انجام
# می‌شه: اگه هیچ‌کدوم از 📰/📊/🧠 نبود، همون محتوای 🎯 به‌عنوان بدنه‌ی اصلی
# نشون داده می‌شه (به‌جای دور ریختن قدیمی‌اش).
SECTION_MARKERS_RE = re.compile(r"(📌|🎯|📰|📊|🧠)")
LEVEL_PREFIX_RE = re.compile(r"^\s*🔸\s*[^\n؛]+؛\*?\s*")
HASHTAG_RE = re.compile(r"^\s*#\S+\s*")
# اموجی هر بخش، وقتی خودش داخل یه بولد بود، یه ستاره‌ی بازکننده برای بخش
# بعدی به انتهای بخش فعلی می‌چسبونه (چون split دقیقاً سرِ خودِ اموجی برش
# می‌زنه، نه بعد از اون ستاره) — این آرتیفکت باید قبل از هر پردازش دیگه‌ای
# حذف بشه، وگرنه شمارش زوج/فرد ستاره‌های واقعی رو به‌هم می‌ریزه. فقط برای
# بخش‌های میانی صادقه: توی آخرین بخش پیام، یه «*» انتهایی می‌تونه بولد
# واقعیِ خودِ همون بخش باشه (نه نشتی از بخش بعدی که وجود نداره)، پس اونجا
# دست‌نخورده می‌مونه و fix_orphan_asterisk تشخیص درست‌ترش می‌ده.
TRAILING_ARTIFACT_RE = re.compile(r"\*\s*$")


def login() -> str:
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/login",
        headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
        json={"password": ADMIN_PASSWORD},
        timeout=REQUEST_TIMEOUT,
    )
    r.raise_for_status()
    return r.json()["token"]


def auth_headers(token: str) -> dict:
    return {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def fetch_bale_channels(token: str) -> list[dict]:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/channels",
        headers=auth_headers(token),
        params={"platform": "eq.bale", "active": "eq.true", "select": "id,username"},
        timeout=REQUEST_TIMEOUT,
    )
    r.raise_for_status()
    return r.json()


def unescape_js_string(escaped: str) -> str:
    return json.loads('"' + escaped + '"')


def build_flight_stream(html: str) -> str:
    return "".join(unescape_js_string(m) for m in PUSH_RE.findall(html))


def parse_flight_rows(stream: str) -> dict:
    """id -> ('raw', json_text) یا ('text', text)"""
    rows: dict[str, tuple[str, str]] = {}
    i = 0
    n = len(stream)
    while i < n:
        m = ROW_ID_RE.match(stream, i)
        if not m:
            break
        row_id = m.group(1)
        i = m.end()
        if i < n and stream[i] == "T":
            tm = re.match(r"T([0-9a-fA-F]+),", stream[i:])
            if not tm:
                break
            hex_len = int(tm.group(1), 16)
            i += tm.end()
            remaining_bytes = stream[i:].encode("utf-8")
            text_bytes = remaining_bytes[:hex_len]
            text = text_bytes.decode("utf-8", errors="replace")
            rows[row_id] = ("text", text)
            i += len(text)
        else:
            nl = stream.find("\n", i)
            if nl == -1:
                nl = n
            rows[row_id] = ("raw", stream[i:nl])
            i = nl + 1
    return rows


def _looks_like_channel_messages(items) -> bool:
    return bool(items) and all(
        isinstance(m, dict) and "rid" in m and "message" in m for m in items
    )


def find_messages(obj):
    # صفحه‌ی واقعی (برخلاف نمونه‌ی کوتاه‌شده‌ای که تست شد) کلی داده‌ی دیگه هم
    # توی همون قالب Flight داره — چون بله یه اپ پیام‌رسان کامله نه فقط ویوئر
    # کانال. ممکنه یه آرایه‌ی نامرتبط دیگه هم کلیدش "messages" باشه و زودتر
    # پیدا بشه؛ برای همین فقط آرایه‌ای که آیتم‌هاش واقعاً شکل پیام کانال
    # (rid + message) رو دارن قبول می‌کنیم، وگرنه جست‌وجو رو ادامه می‌دیم.
    if isinstance(obj, dict):
        val = obj.get("messages")
        if isinstance(val, list) and _looks_like_channel_messages(val):
            return val
        for v in obj.values():
            found = find_messages(v)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for v in obj:
            found = find_messages(v)
            if found is not None:
                return found
    return None


def fix_orphan_asterisk(s: str) -> str:
    # اگه سرتیتر یه بخش (که خودش داخل یه بولد بود) قطع بشه، یه ستاره‌ی
    # بسته‌کننده‌ی بی‌جفت وسط متن می‌مونه — با تعداد فرد ستاره تشخیص داده
    # می‌شه و همون اولی حذف می‌شه تا بولدهای واقعی بعدی درست جفت بشن
    if s.count("*") % 2 == 1:
        idx = s.find("*")
        s = s[:idx] + s[idx + 1 :]
    return s


def clean_section(raw: str) -> str:
    escaped = html_lib.escape(fix_orphan_asterisk(raw), quote=False)
    return BOLD_RE.sub(r"<strong>\1</strong>", escaped)


def parse_bale_message(raw_text: str, channel_username: str) -> dict:
    text = re.sub(r"\n+@" + re.escape(channel_username) + r"\s*$", "", raw_text.strip())
    text = HASHTAG_RE.sub("", text, count=1)

    parts = SECTION_MARKERS_RE.split(text)
    sections: dict[str, str] = {}
    for i in range(1, len(parts), 2):
        marker = parts[i]
        content = parts[i + 1] if i + 1 < len(parts) else ""
        # فقط بخش‌های میانی نشتیِ ستاره‌ی بخش بعدی رو می‌گیرن؛ آخرین بخش
        # پیام next-marker‌ای نداره که ازش نشتی بگیره، پس دست‌نخورده می‌مونه
        is_last_section = (i + 2) >= len(parts)
        if not is_last_section:
            content = TRAILING_ARTIFACT_RE.sub("", content)
        colon_idx = content.find(":")
        body = content[colon_idx + 1 :] if colon_idx != -1 else content
        sections.setdefault(marker, body.strip())

    title_raw = sections.get("📌", "").replace("*", "").strip()
    title = html_lib.escape(title_raw, quote=False)

    media_raw = sections.get("📰")
    level_raw = LEVEL_PREFIX_RE.sub("", sections.get("📊", "")).strip()
    pattern_raw = sections.get("🧠", "").strip()
    description_raw = sections.get("🎯", "").strip()
    # فرمت قدیمی: «اهداف» عمداً استفاده نمی‌شه — طبق خواسته‌ی کاربر کلاً حذف
    # می‌شه. فرمت جدید (بدون 📰/📊/🧠): همین بخش «توضیحات» تنها متن واقعی
    # پیامه، پس به‌جای دور ریختن، به‌عنوان بدنه‌ی اصلی نشون داده می‌شه.

    body_parts = []
    if media_raw:
        # lstrip: اگه فهرست رسانه‌ها با یه خط خالی شروع بشه (فرمت‌بندی خودِ
        # پیام اصلی)، بین تیتر «انتشار توسط:» و اولین رسانه یه شکاف اضافه
        # می‌مونه که لازم نیست
        body_parts.append("<strong>انتشار توسط:</strong>\n" + clean_section(media_raw).lstrip("\n"))
    if level_raw:
        body_parts.append(clean_section(level_raw))
    if pattern_raw:
        body_parts.append(clean_section(pattern_raw))
    if not media_raw and not level_raw and not pattern_raw and description_raw:
        body_parts.append(clean_section(description_raw).strip())

    return {"title": title, "text": "\n\n".join(body_parts)}


def extract_bale_messages(html: str, channel_username: str) -> list[dict]:
    stream = build_flight_stream(html)
    rows = parse_flight_rows(stream)
    text_lookup = {rid: payload for rid, (kind, payload) in rows.items() if kind == "text"}

    messages = None
    for rid, (kind, payload) in rows.items():
        if kind != "raw":
            continue
        try:
            obj = json.loads(payload)
        except (json.JSONDecodeError, ValueError):
            continue
        found = find_messages(obj)
        if found is not None:
            messages = found
            break

    if not messages:
        return []

    results = []
    for msg in messages:
        rid = msg.get("rid")
        date_ms = msg.get("date")
        text_ref = (msg.get("message") or {}).get("textMessage", {}).get("text")
        if not rid or not text_ref:
            continue
        if isinstance(text_ref, str) and text_ref.startswith("$"):
            raw_text = text_lookup.get(text_ref[1:], "")
        else:
            raw_text = text_ref or ""
        if not raw_text:
            continue
        parsed = parse_bale_message(raw_text, channel_username)
        results.append(
            {
                "platform_post_id": str(rid),
                "posted_at": (
                    datetime.datetime.fromtimestamp(date_ms / 1000, tz=datetime.timezone.utc).isoformat()
                    if date_ms
                    else None
                ),
                "views": msg.get("viewCount"),
                "title": parsed["title"],
                "text": parsed["text"],
                "link": f"https://ble.ir/{channel_username}/{rid}/{date_ms}",
            }
        )
    return results


def upsert_posts(token: str, posts: list[dict]) -> bool:
    if not posts:
        return True
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/posts",
        headers={**auth_headers(token), "Prefer": "resolution=merge-duplicates,return=minimal"},
        params={"on_conflict": "channel_id,platform_post_id"},
        json=posts,
        timeout=REQUEST_TIMEOUT,
    )
    if not r.ok:
        print(f"    [!] upsert failed: {r.status_code} {r.text[:300]}", file=sys.stderr)
        return False
    return True


def exit_if_all_failed(failed: int, total: int) -> None:
    # اگه همه‌ی منابع خطا دادن، اجرا «ناموفق» ثبت بشه تا کارت «وضعیت سامانه» قرمز
    # بشه (قبلاً هر خطایی فقط چاپ می‌شد و اجرا همیشه سبز می‌موند)
    if total and failed == total:
        print(f"[!] all {total} source(s) failed", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    token = login()
    channels = fetch_bale_channels(token)
    print(f"[*] {len(channels)} active bale channel(s) to scan")

    total_saved = 0
    failed = 0
    for ch in channels:
        username = ch["username"]
        channel_id = ch["id"]
        try:
            # ble.ir/{username} صفحه‌ی «باز کردن در اپ»‌ه (بدون پیام‌ها)؛ نسخه‌ی
            # وب قابل‌اسکرپ (با HTML شامل React Flight پیام‌ها) زیر مسیر s/ هست.
            # UA واقعی مرورگر: با UA مینیمال قبلی، سرور صفحه‌ای ۳ برابر بزرگ‌تر
            # از چیزی که یه مرورگر واقعی می‌گیره برمی‌گردوند (احتمالاً چون
            # UA ناقص رو bot/crawler تشخیص می‌ده و نسخه‌ی متفاوتی می‌فرسته)
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7",
            }
            resp = requests.get(f"https://ble.ir/s/{username}", timeout=REQUEST_TIMEOUT, headers=headers)
            resp.raise_for_status()
            # همون درسی که از mojibake سایت جار گرفتیم: هدر Content-Type این
            # سایت هم charset رو مشخص نمی‌کنه، پس صریح utf-8 دیکد می‌کنیم
            html = resp.content.decode("utf-8", errors="replace")
            messages = extract_bale_messages(html, username)
            rows = [
                {
                    "channel_id": channel_id,
                    "platform": "bale",
                    "platform_post_id": m["platform_post_id"],
                    "title": m["title"],
                    "text": m["text"],
                    "link": m["link"],
                    "posted_at": m["posted_at"],
                    "views": m["views"],
                    "media_type": None,
                    "media_path": None,
                    "media_storage_path": None,
                    "media_fetched_at": None,
                    "media_source_url": None,
                }
                for m in messages
            ]
            if not upsert_posts(token, rows):
                failed += 1
            total_saved += len(rows)
            print(f"[+] @{username}: {len(rows)} post(s)")
        except Exception as e:
            failed += 1
            print(f"[!] @{username}: {e}", file=sys.stderr)

    print(f"[done] total posts processed: {total_saved}")
    exit_if_all_failed(failed, len(channels))


if __name__ == "__main__":
    main()
