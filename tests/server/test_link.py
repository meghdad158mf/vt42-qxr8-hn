"""پیوند دو سرور (۱.۱.۲): صفحه‌بندی بدون جا افتادن پست‌های هم‌زمان، و رسانه‌ای که کنار گذاشته نشود."""
import os
import re
import sys
import tempfile
import unittest
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "server", "core", "services"))
import link  # noqa: E402

COND = re.compile(r'\(scraped_at\.gt\."([^"]+)",and\(scraped_at\.eq\."([^"]+)",id\.gt\.(\d+)\)\)')


class FakeApi:
    """نیمه‌ی لازم PostgREST برای build_batch: شرط or نشانگر، ترتیب (scraped_at، id) و limit."""

    def __init__(self, posts, mentions=()):
        self.posts, self.mentions = posts, list(mentions)

    def __call__(self, method, path, body=None, prefer=None):
        table, _, query = path.lstrip("/").partition("?")
        qs = urllib.parse.parse_qs(query)
        m = COND.fullmatch(qs["or"][0])
        t, i = m.group(1), int(m.group(3))
        rows = self.posts if table == "posts" else self.mentions
        out = sorted((r for r in rows if (r["scraped_at"], r["id"]) > (t, i)), key=lambda r: (r["scraped_at"], r["id"]))
        out = out[:int(qs["limit"][0])]
        if table == "posts":
            return [dict(r, channels={"platform": "telegram", "username": "c%d" % (r["id"] % 3)}) for r in out]
        return [dict(r) for r in out]


class LinkBatchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self._files, self._rest, self._conf = link.FILES, link.rest, link.conf
        link.FILES = self.tmp
        link.conf = lambda: {}

    def tearDown(self):
        link.FILES, link.rest, link.conf = self._files, self._rest, self._conf

    def drain(self, api, limit):
        link.rest = api
        seen, cur = [], None
        for _ in range(1000):
            b = link.build_batch(cur, limit=limit)
            seen += [p["id"] for p in b["posts"]]
            if not b["more"]:
                break
            self.assertNotEqual(b["upto"], cur, "نشانگر باید جلو برود")
            cur = b["upto"]
        return seen, b

    def test_same_timestamp_groups_not_skipped(self):
        # هر «اجرای جمع‌آوری» ۷۰ پست با یک scraped_at؛ مرز دسته‌ی ۴۰۰تایی وسط گروه می‌افتد
        posts = [{"id": n + 1, "scraped_at": f"2026-10-27T{8 + n // 70:02d}:00:00+00:00", "media_storage_path": None}
                 for n in range(7 * 70)]
        seen, _ = self.drain(FakeApi(posts), 400)
        self.assertEqual(sorted(seen), [p["id"] for p in posts])
        self.assertEqual(len(seen), len(set(seen)))

    def test_media_not_dropped_batch_cut_instead(self):
        os.makedirs(os.path.join(self.tmp, "post-media", "t"))
        posts = []
        for n in range(5):
            name = f"t/{n}.bin"
            with open(os.path.join(self.tmp, "post-media", name), "wb") as f:
                f.write(b"x" * (10 * 1024 * 1024))           # ۱۰ مگ؛ سقف دسته ۲۴ مگ → دو تا در هر دسته
            posts.append({"id": n + 1, "scraped_at": "2026-10-27T08:00:00+00:00", "media_storage_path": name})
        link.rest = FakeApi(posts)
        b = link.build_batch(None)
        self.assertEqual([p["id"] for p in b["posts"]], [1, 2])
        self.assertTrue(b["more"])
        self.assertEqual(set(b["media"]), {"t/0.bin", "t/1.bin"})
        seen, _ = self.drain(FakeApi(posts), 400)
        self.assertEqual(seen, [1, 2, 3, 4, 5])

    def test_mentions_cursor_advances_without_posts(self):
        ments = [{"id": n + 1, "scraped_at": "2026-10-27T08:00:00+00:00", "url": f"https://x/{n}"} for n in range(3)]
        link.rest = FakeApi([], ments)
        b = link.build_batch(None)
        self.assertEqual(len(b["mentions"]), 3)
        b2 = link.build_batch(b["upto"])
        self.assertEqual(b2["mentions"], [], "یافته‌های فرستاده‌شده نباید دوباره بیایند")

    def test_old_cursor_format_accepted(self):
        self.assertEqual(link.parse_cursor("2026-10-24T10:00:00Z"),
                         ("2026-10-24T10:00:00Z", 0, "2026-10-24T10:00:00Z", 0))
        self.assertEqual(link.parse_cursor(None), (link.EPOCH, 0, link.EPOCH, 0))
        c = link.fmt_cursor("a", 5, "b", 7)
        self.assertEqual(link.parse_cursor(c), ("a", 5, "b", 7))


class ReachTests(unittest.TestCase):
    def test_snapshot_only_unreachable_websites(self):
        saved = link.rest, link.state
        try:
            chans = [{"platform": "telegram", "username": "t1"}, {"platform": "website", "username": "https://a/rss"},
                     {"platform": "website", "username": "https://b/rss"}]
            sites = [{"url": "https://a/"}, {"url": "https://c/"}]
            link.rest = lambda m, p, *a, **k: chans if p.startswith("/channels") else sites
            link.state = lambda: {}
            snap = link.channels_snapshot()
            self.assertEqual(len(snap["channels"]), 3, "پیش از نخستین سنجش همه فرستاده می‌شوند")
            link.state = lambda: {"reach": {"at": 1, "channels": ["https://b/rss"], "sites": ["https://c/"]}}
            snap = link.channels_snapshot()
            self.assertEqual([c["username"] for c in snap["channels"]], ["t1", "https://b/rss"])
            self.assertEqual(snap["crawl_sites"], [{"url": "https://c/"}])
            self.assertTrue(snap["reach_known"])
        finally:
            link.rest, link.state = saved


if __name__ == "__main__":
    unittest.main()
