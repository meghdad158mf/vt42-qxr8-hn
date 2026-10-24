#!/usr/bin/env python3
"""ساخت بسته‌ی سرور جریان (.jaryan) از server/core + db/ مخزن + PostgREST.

  python3 server/tools/build_core.py [--out پوشه] [--postgrest فایل-tar.xz]

نسخه و فهرست تغییرات از server/core/VERSION و server/core/NOTES (هر خط یک تغییر).
PostgREST (باینری ایستا، در apt نیست) یک‌بار از گیت‌هاب گرفته و با sha256 ثابت
بررسی می‌شود؛ روی خود سرور هیچ چیزی دانلود نمی‌شود.
"""
import argparse
import hashlib
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
CORE = os.path.join(REPO, "server", "core")

POSTGREST_VERSION = "v12.2.12"
POSTGREST_URL = (f"https://github.com/PostgREST/postgrest/releases/download/{POSTGREST_VERSION}/"
                 f"postgrest-{POSTGREST_VERSION}-linux-static-x86-64.tar.xz")
POSTGREST_SHA256 = "5de4092f1719da3353c40bf96c8dec6913f2254a7cd0b61cc05f233153b557d5"
CACHE = os.path.expanduser("~/.cache/jaryan")
HEALTH = ["/rest/v1/", "/setup/health"]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def postgrest_archive(given):
    path = given or os.path.join(CACHE, os.path.basename(POSTGREST_URL))
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        print("دریافت", POSTGREST_URL)
        with urllib.request.urlopen(POSTGREST_URL, timeout=120) as r, open(path + ".part", "wb") as f:
            shutil.copyfileobj(r, f)
        os.replace(path + ".part", path)
    got = sha256(path)
    if got != POSTGREST_SHA256:
        raise SystemExit(f"sha256 فایل PostgREST درست نیست: {got}")
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=".")
    ap.add_argument("--postgrest")
    a = ap.parse_args()

    version = open(os.path.join(CORE, "VERSION"), encoding="utf-8").read().strip()
    notes = [n.strip() for n in open(os.path.join(CORE, "NOTES"), encoding="utf-8") if n.strip()]
    ignore = shutil.ignore_patterns("__pycache__", "*.pyc", "VERSION", "NOTES")
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "release")
        shutil.copytree(CORE, src, ignore=ignore)
        mig = os.path.join(src, "db", "migrations")
        os.makedirs(mig)
        for name in sorted(os.listdir(os.path.join(REPO, "db"))):
            if name == "schema.sql" or (name.startswith("migration_") and name.endswith(".sql")):
                shutil.copy2(os.path.join(REPO, "db", name), mig)
        os.makedirs(os.path.join(src, "bin"))
        with tarfile.open(postgrest_archive(a.postgrest), "r:xz") as tf:
            member = tf.getmember("postgrest")
            with tf.extractfile(member) as s, open(os.path.join(src, "bin", "postgrest"), "wb") as d:
                shutil.copyfileobj(s, d)
        os.chmod(os.path.join(src, "bin", "postgrest"), 0o755)
        for root, _, files in os.walk(os.path.join(src, "hooks")):
            for f in files:
                os.chmod(os.path.join(root, f), 0o755)
        out = os.path.join(a.out, f"jaryan-server-{version}.jaryan")
        cmd = [sys.executable, os.path.join(HERE, "make_package.py"), "--src", src, "--version", version, "--out", out]
        for n in notes:
            cmd += ["--note", n]
        for h in HEALTH:
            cmd += ["--health", h]
        subprocess.run(cmd, check=True)
    print("sha256:", sha256(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
