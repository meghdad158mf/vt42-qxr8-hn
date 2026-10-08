# موقت: پیدا کردن خوراک‌های بخشی (پیام/بیانیه/مصوبه) سایت‌های منابع (پاک می‌شود)
import re, requests, feedparser
from urllib.parse import urljoin
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36'}
PAGES = ['https://www.sistani.org/persian/', 'https://www.sistani.org/persian/rss/', 'https://www.leader.ir/fa', 'https://www.leader.ir/fa/rss',
 'https://ismc.ir/', 'https://www.icana.ir/', 'https://www.icana.ir/rss', 'https://www.shora-gc.ir/fa/rss', 'https://maslahat.ir/fa/rss', 'https://www.mizanonline.ir/fa/rss',
 'https://iict.ac.ir/', 'https://isca.ac.ir/']
def get(u): return requests.get(u, headers=UA, timeout=20)
seen=set()
for page in PAGES:
    try:
        r = get(page)
    except Exception as e:
        print('PAGE', page, 'ERR', type(e).__name__); continue
    links = set(urljoin(r.url, h) for h in re.findall(r'href=["\']([^"\']*(?:rss|feed)[^"\']*)["\']', r.text, re.I))
    # ووردپرس: خوراک دسته‌ها
    links |= set(urljoin(r.url, h.rstrip('/') + '/feed/') for h in re.findall(r'href=["\']([^"\']*/category/[^"\'#?]+)["\']', r.text, re.I))
    print('PAGE', page, r.status_code, len(links))
    for u in sorted(links)[:60]:
        if u in seen: continue
        seen.add(u)
        try:
            f = feedparser.parse(get(u).content)
            if f.entries:
                print('FEED', u, '|', (f.feed.get('title') or '')[:50], '|', len(f.entries), '|', ' ;; '.join((e.get('title') or '')[:45] for e in f.entries[:4]))
        except Exception as e:
            pass
