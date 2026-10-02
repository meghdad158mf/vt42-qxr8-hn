"""پروب موقت: کدام سایت‌های خبری از سرور گیت‌هاب در دسترس‌اند و sitemap دارند (حذف می‌شود)."""
import re, time, sys
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, quote
import requests

UA = "Mozilla/5.0 (compatible; JarianBot/1.0)"
SITES = """isna.ir irna.ir mehrnews.com tasnimnews.com farsnews.ir khabaronline.ir entekhab.ir asriran.com
tabnak.ir yjc.ir hamshahrionline.ir iribnews.ir ilna.ir ana.ir borna.news jamaran.news etemadonline.com
sharghdaily.com hammihanonline.ir donya-e-eqtesad.com kayhan.ir javanonline.ir rajanews.com mashreghnews.ir
nournews.ir alef.ir fararu.com didbaniran.ir khorasannews.com qudsonline.ir shahraranews.ir khabarfoori.com
rokna.net pana.ir khamenei.ir bbc.com/persian iranintl.com radiofarda.com independentpersian.com
per.euronews.com dw.com/fa-ir iranwire.com zeitoons.com ensafnews.com hawzahnews.com rasanews.ir""".split()

def get(url, timeout=20):
    t = time.time()
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=timeout)
        return r, time.time() - t
    except Exception as e:
        return e, time.time() - t

def probe(site):
    host = site.split("/")[0]
    base = f"https://{site}" if "/" in site else f"https://www.{site}" if site.count(".") == 1 else f"https://{site}"
    out = [site]
    r, dt = get(base)
    if isinstance(r, Exception):
        r, dt = get(f"https://{site}")
    if isinstance(r, Exception):
        return f"{site:28} HOME-ERR {type(r).__name__} {str(r)[:80]}"
    home = r.url
    out.append(f"home={r.status_code}/{dt:.1f}s/{len(r.content)//1024}k")
    root = re.match(r"https?://[^/]+", home).group(0)
    rr, _ = get(root + "/robots.txt")
    sm = []
    if not isinstance(rr, Exception) and rr.ok:
        sm = re.findall(r"(?im)^\s*sitemap:\s*(\S+)", rr.text)
    cands = sm[:4] + [root + p for p in ("/sitemap.xml", "/news-sitemap.xml", "/sitemap_news.xml") if root + p not in sm]
    best = None
    for c in cands[:6]:
        s, _ = get(c)
        if isinstance(s, Exception) or not s.ok:
            continue
        x = s.text
        nurl, nsm = x.count("<url>"), x.count("<sitemap>")
        news = "news:title" in x
        lm = sorted(re.findall(r"<(?:lastmod|news:publication_date)>([^<]+)<", x))[-1:] or ["-"]
        info = f"{c.replace(root,'')} url={nurl} sm={nsm} news={int(news)} last={lm[0][:16]}"
        if best is None or news or nurl > 0:
            best = info
            if news:
                break
    out.append("SM:" + (best or "none") + f" robots_sm={len(sm)}")
    rs, _ = get(root + "/rss")
    out.append("rss=" + ("ok" if not isinstance(rs, Exception) and rs.ok and "<item" in rs.text else "no"))
    return "  ".join(out)

with ThreadPoolExecutor(12) as ex:
    for line in ex.map(probe, SITES):
        print(line, flush=True)

print("\n== aggregators ==")
q = "حوزه علمیه"
for name, url in [("google-news", f"https://news.google.com/rss/search?q={quote(q)}&hl=fa&gl=IR&ceid=IR:fa"),
                  ("bing-news", f"https://www.bing.com/news/search?q={quote(q)}&format=rss&setlang=fa")]:
    r, dt = get(url)
    if isinstance(r, Exception):
        print(name, "ERR", r); continue
    items = re.findall(r"<item>(.*?)</item>", r.text, re.S)
    print(name, r.status_code, f"{dt:.1f}s", "items=", len(items))
    for it in items[:6]:
        t = re.search(r"<title>(.*?)</title>", it, re.S); l = re.search(r"<link>(.*?)</link>", it, re.S)
        d = re.search(r"<pubDate>(.*?)</pubDate>", it, re.S)
        print("   ", (t.group(1) if t else "")[:90], "|", (d.group(1) if d else ""), "|", (l.group(1) if l else "")[:100])

print("\n== trafilatura sample ==")
try:
    import trafilatura
    for u in ["https://www.isna.ir/", "https://www.khabaronline.ir/"]:
        r, _ = get(u)
        if isinstance(r, Exception): print(u, "ERR"); continue
        links = re.findall(r'href="(/news/\d+/[^"]+)"', r.text)[:1]
        for l in links:
            a, _ = get(urljoin(u, l))
            if isinstance(a, Exception): continue
            d = trafilatura.bare_extraction(a.text, url=a.url, with_metadata=True)
            d = d if isinstance(d, dict) else (d.as_dict() if d else {})
            print(urljoin(u, l)[:90], "| title:", (d.get("title") or "")[:60], "| date:", d.get("date"), "| len:", len(d.get("text") or ""))
            print("   ", (d.get("text") or "")[:200].replace("\n", " "))
except Exception as e:
    print("trafilatura error", e)
