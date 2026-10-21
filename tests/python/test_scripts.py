"""
آزمون‌های پایتون کالکتورها و جاب‌ها (scripts/، مرحله‌ی ۹ ماژولار کردن) — بدون شبکه و بدون سوپابیس:
درخواست‌ها با unittest.mock جایگزین می‌شن. اجرا از ریشه‌ی ریپو:
    pip install -r scripts/requirements.txt
    python -m unittest discover -s tests/python -v
"""
import importlib
import io
import os
import sys
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest import mock

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
os.environ.update(SUPABASE_URL="https://example.supabase.co/", SUPABASE_ANON_KEY="anon-key", ADMIN_PASSWORD="pw",
                  TG_API_ID="1", TG_API_HASH="hash", TG_SESSION="session", CHANNEL_USERNAME="@chan")
sys.path.insert(0, str(SCRIPTS))
sys.argv = [sys.argv[0]]  # crawl_hawza گزینه‌های --dry-run/--only رو از sys.argv می‌خونه

import jarian_common as jc  # noqa: E402


def response(ok=True, status=200, body=None, text=""):
    r = mock.Mock(ok=ok, status_code=status, text=text)
    r.json.return_value = body if body is not None else {"token": "T"}
    r.raise_for_status.side_effect = None if ok else RuntimeError(status)
    return r


class JarianCommonTest(unittest.TestCase):
    def test_login(self):
        with mock.patch("jarian_common.requests.post", return_value=response()) as post:
            self.assertEqual(jc.login(20), "T")
        args, kw = post.call_args
        self.assertEqual(args[0], "https://example.supabase.co/rest/v1/rpc/login")
        self.assertEqual(kw["json"], {"password": "pw"})
        self.assertEqual(kw["headers"]["apikey"], "anon-key")
        self.assertEqual(kw["timeout"], 20)

    def test_auth_headers(self):
        self.assertEqual(jc.auth_headers("T"), {"apikey": "anon-key", "Authorization": "Bearer T", "Content-Type": "application/json"})

    def test_upsert_posts(self):
        with mock.patch("jarian_common.requests.post") as post:
            self.assertTrue(jc.upsert_posts("T", [], 20))  # خالی = بدون درخواست
            post.assert_not_called()
            post.return_value = response()
            self.assertTrue(jc.upsert_posts("T", [{"channel_id": 1}], 20))
            kw = post.call_args.kwargs
            self.assertEqual(kw["params"], {"on_conflict": "channel_id,platform_post_id"})
            self.assertIn("merge-duplicates", kw["headers"]["Prefer"])
            post.return_value = response(ok=False, status=409, text="conflict")
            with redirect_stderr(io.StringIO()) as err:
                self.assertFalse(jc.upsert_posts("T", [{"channel_id": 1}], 20))
            self.assertIn("upsert failed: 409", err.getvalue())

    def test_upload_object(self):
        with mock.patch("jarian_common.requests.post", return_value=response()) as post:
            url = jc.upload_object("T", "post-media", "1/2.jpg", b"x", "", 20)
        self.assertEqual(url, "https://example.supabase.co/storage/v1/object/public/post-media/1/2.jpg")
        h = post.call_args.kwargs["headers"]
        self.assertEqual(h["x-upsert"], "true")
        self.assertEqual(h["Content-Type"], "application/octet-stream")
        with mock.patch("jarian_common.requests.post", return_value=response()) as post:
            jc.upload_object("T", "newspaper-covers", "a.jpg", b"x", "", 20, "image/jpeg")
        self.assertEqual(post.call_args.kwargs["headers"]["Content-Type"], "image/jpeg")

    def test_clear_post_media(self):
        with mock.patch("jarian_common.requests.patch", return_value=response()) as patch:
            jc.clear_post_media("T", [], 30)
            patch.assert_not_called()
            jc.clear_post_media("T", [3, 4], 30)
        kw = patch.call_args.kwargs
        self.assertEqual(kw["params"], {"id": "in.(3,4)"})
        self.assertEqual(kw["json"], {"media_path": None, "media_storage_path": None, "media_fetched_at": None})

    def test_exit_if_all_failed(self):
        jc.exit_if_all_failed(1, 3)
        jc.exit_if_all_failed(0, 0)
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as e:
            jc.exit_if_all_failed(3, 3)
        self.assertEqual(e.exception.code, 1)

    def test_require_env(self):
        jc.require_env()
        with mock.patch.dict(os.environ, {"ADMIN_PASSWORD": ""}), self.assertRaises(KeyError):
            jc.require_env()


class ScriptsImportTest(unittest.TestCase):
    """هر اسکریپت بدون خطا import می‌شه و تابع‌های مشترک رو فقط از jarian_common می‌گیره (نسخه‌ی کپی‌شده نداره)."""
    NAMES = ["analyze_news_insights", "cleanup_media", "collect_bale", "collect_eitaa", "collect_newspapers", "collect_rss",
             "collect_telegram", "crawl_hawza", "extract_keywords", "purge_channel_backfill_media", "purge_orphaned_media"]

    def test_import_all(self):
        for name in self.NAMES:
            with self.subTest(name):
                mod = importlib.import_module(name)
                self.assertTrue(callable(mod.main))
                self.assertIs(mod.login, jc.login)
                for shared in ("auth_headers", "upsert_posts", "exit_if_all_failed", "clear_post_media"):
                    if hasattr(mod, shared):
                        self.assertIs(getattr(mod, shared), getattr(jc, shared))
                self.assertFalse(hasattr(mod, "upload_media"))


class CrawlHawzaTest(unittest.TestCase):
    """تشخیص «درباره حوزه» در خزنده (هم‌سو با HAB_HL_RX فرانت)."""
    @classmethod
    def setUpClass(cls):
        cls.ch = importlib.import_module("crawl_hawza")

    def test_title_hit(self):
        r = self.ch.classify("نشست اساتید حوزه علمیه قم", "متن خبر بدون اشاره‌ی دیگر.")
        self.assertIsNotNone(r)
        self.assertTrue(r["in_title"])

    def test_body_needs_two_hits(self):
        self.assertIsNone(self.ch.classify("خبر اقتصادی", "یک بار از طلاب نام برده شد."))
        r = self.ch.classify("خبر", "طلاب جوان در این برنامه شرکت کردند. روحانیت نقش مهمی دارد.")
        self.assertIsNotNone(r)
        self.assertFalse(r["in_title"])

    def test_place_name_is_not_a_hit(self):
        # «کوی طلاب» نام مکانه (اطلاعیه‌ی قطع برق اهواز اشتباهی پیدا شده بود)
        self.assertIsNone(self.ch.classify("قطعی برق در کوی طلاب", "خاموشی در کوی طلاب و خیابان طلاب."))

    def test_rouhani_is_not_a_term(self):
        self.assertIsNone(self.ch.classify("سخنرانی حسن روحانی", "روحانی درباره‌ی اقتصاد گفت. روحانی افزود."))


class CollectRssTest(unittest.TestCase):
    def test_strip_tags_keeps_paragraphs(self):
        rss = importlib.import_module("collect_rss")
        self.assertEqual(rss.strip_tags("<p>سطر اول</p><p>سطر&nbsp;دوم  <b>پررنگ</b></p>"), "سطر اول\nسطر دوم پررنگ")  # nbsp هم فاصله‌ی معمولی می‌شه


if __name__ == "__main__":
    unittest.main()
