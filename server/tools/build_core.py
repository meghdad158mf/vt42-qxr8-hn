#!/usr/bin/env python3
"""ساخت بسته‌ی سرور جریان (.jaryan): server/core + db/ + scripts/ + سایت + تابع‌ها + اجزای بزرگ.

  python3 server/tools/build_core.py [--out پوشه] [--lite] [--no-site]

نسخه و فهرست تغییرات از server/core/VERSION و server/core/NOTES. اجزای بزرگ (PostgREST، Deno،
کتابخانه‌های پایتون کالکتورها) یک‌بار از اینترنت گرفته و با sha256 ثابت بررسی می‌شوند؛ روی خود سرور
هیچ چیزی دانلود نمی‌شود. هر جزء یک tar.xz با sha در components.json است:
  بسته‌ی کامل  = همه‌ی اجزا داخلش (بار اول، یا وقتی جزئی عوض شده)
  --lite       = بدون اجزا؛ preinstall همان جزء را با همان sha از نسخه‌ی فعال سرور برمی‌دارد
سایت = خروجی Vite از همین مخزن، با نشانی Supabase جایگزین‌شده با «همین سرور» (location.origin) و
کلید عمومی که activate می‌گذارد — بدون هیچ تغییری در سایت فعلی روی GitHub Pages.
"""
import argparse
import hashlib
import io
import json
import lzma
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
CORE = os.path.join(REPO, "server", "core")
CACHE = os.path.expanduser("~/.cache/jaryan")

POSTGREST = ("https://github.com/PostgREST/postgrest/releases/download/v12.2.12/postgrest-v12.2.12-linux-static-x86-64.tar.xz",
             "5de4092f1719da3353c40bf96c8dec6913f2254a7cd0b61cc05f233153b557d5")
DENO = ("https://github.com/denoland/deno/releases/download/v2.5.6/deno-x86_64-unknown-linux-gnu.zip",
        "fd4f6abc1b6a134fa9a4dba56519f1631f44c88e04e4e3e9a8ff5975dfa66e1a")
ACME = ("https://raw.githubusercontent.com/acmesh-official/acme.sh/3.1.1/acme.sh",
        "e80e3e6d66ab02f7b448c55129c70ec57089a286d7df95282a68d607b4df7ed7")
PY_VERSIONS = ["3.12", "3.13", "3.14"]          # Ubuntu 24.04 = 3.12؛ 26.04 احتمالاً 3.14
HEALTH = ["/rest/v1/", "/setup/health", "/storage/v1/health", "/functions/v1/health", "/design/ita-monitoring-prototype.html"]
SUPABASE_URL = "https://komqnapfqrtxxaytpcdt.supabase.co"


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(url, want):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, want[:16] + "-" + os.path.basename(url))
    if not os.path.exists(path):
        print("دریافت", url, flush=True)
        with urllib.request.urlopen(url, timeout=300) as r, open(path + ".part", "wb") as f:
            shutil.copyfileobj(r, f)
        os.replace(path + ".part", path)
    got = sha256(path)
    if got != want:
        os.remove(path)
        raise SystemExit(f"sha256 درست نیست: {url} ({got})")
    return path


def xz_dir(src_root, members, out):
    """tar.xz قطعی (ترتیب ثابت، زمان صفر) تا sha یک جزء بدون تغییر ثابت بماند."""
    def norm(ti):
        ti.mtime, ti.uid, ti.gid, ti.uname, ti.gname = 0, 0, 0, "", ""
        return ti
    with lzma.open(out, "wb", preset=6) as xz, tarfile.open(fileobj=xz, mode="w", format=tarfile.PAX_FORMAT) as tf:
        for m in members:
            base = os.path.join(src_root, m)
            paths = [base]
            if os.path.isdir(base):
                paths = []
                for r, ds, fs in os.walk(base):
                    ds.sort()
                    paths.append(r)
                    paths += [os.path.join(r, f) for f in sorted(fs)]
            for p in paths:
                tf.add(p, arcname=os.path.relpath(p, src_root), recursive=False, filter=norm)


# ---------------------------------------------------------------- اجزا

def comp_postgrest(tmp):
    root = os.path.join(tmp, "c-postgrest")
    os.makedirs(os.path.join(root, "bin"))
    with tarfile.open(fetch(*POSTGREST), "r:xz") as tf, tf.extractfile("postgrest") as s, \
            open(os.path.join(root, "bin", "postgrest"), "wb") as d:
        shutil.copyfileobj(s, d)
    os.chmod(os.path.join(root, "bin", "postgrest"), 0o755)
    return root, ["bin/postgrest"]


def comp_deno(tmp):
    root = os.path.join(tmp, "c-deno")
    os.makedirs(os.path.join(root, "bin"))
    with zipfile.ZipFile(fetch(*DENO)) as z, z.open("deno") as s, open(os.path.join(root, "bin", "deno"), "wb") as d:
        shutil.copyfileobj(s, d)
    os.chmod(os.path.join(root, "bin", "deno"), 0o755)
    return root, ["bin/deno"]


def sdist_wheels(dest):
    """بسته‌ای که wheel ندارد (پایتون خالص): pyaes (وابستگی telethon)."""
    os.makedirs(dest, exist_ok=True)
    subprocess.run([sys.executable, "-m", "pip", "wheel", "-q", "--no-deps", "--no-build-isolation", "pyaes==1.6.1",
                    "-w", dest], check=True)


def comp_pylib(tmp):
    root = os.path.join(tmp, "c-pylib")
    wh = os.path.join(tmp, "wheels")
    sdist_wheels(wh)
    # نسخه‌های دقیق (server/core/pylib.lock) تا sha جزء بی‌دلیل عوض نشود؛ تازه کردن: از requirements.txt بساز
    req = os.path.join(CORE, "pylib.lock")
    per = {}
    for v in PY_VERSIONS:
        t = os.path.join(tmp, "py-" + v)
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--target", t, "--no-compile",
                        "--platform", "manylinux2014_x86_64", "--platform", "manylinux_2_17_x86_64",
                        "--platform", "manylinux_2_28_x86_64", "--python-version", v, "--implementation", "cp",
                        "--only-binary=:all:", "--no-deps", "--find-links", wh, "-r", req], check=True)
        shutil.rmtree(os.path.join(t, "bin"), ignore_errors=True)
        per[v] = t
    # آنچه بین نسخه‌ها یکی است در common، بقیه (lxml، regex، …) در cpXY
    first = per[PY_VERSIONS[0]]
    common = os.path.join(root, "pylib", "common")
    os.makedirs(common)

    def digest(p):
        h = hashlib.sha256()
        if os.path.isfile(p):
            h.update(open(p, "rb").read())
            return h.hexdigest()
        for r, ds, fs in sorted(os.walk(p)):
            ds.sort()
            for f in sorted(fs):
                fp = os.path.join(r, f)
                h.update(os.path.relpath(fp, p).encode() + open(fp, "rb").read())
        return h.hexdigest()

    names = sorted(set().union(*(os.listdir(t) for t in per.values())))
    for n in names:
        ds = {v: digest(os.path.join(t, n)) if os.path.exists(os.path.join(t, n)) else None for v, t in per.items()}
        if len(set(ds.values())) == 1:
            shutil.move(os.path.join(first, n), os.path.join(common, n))
        else:
            for v, t in per.items():
                if ds[v]:
                    dst = os.path.join(root, "pylib", "cp" + v.replace(".", ""))
                    os.makedirs(dst, exist_ok=True)
                    shutil.move(os.path.join(t, n), os.path.join(dst, n))
    return root, ["pylib"]


COMPONENTS = {"postgrest": comp_postgrest, "deno": comp_deno, "pylib": comp_pylib}


# ---------------------------------------------------------------- سایت

def build_site(tmp, dest):
    """خروجی Vite از نسخه‌ی موقت مخزن با config.js مخصوص سرور (سایت روی GitHub Pages دست نمی‌خورد)."""
    w = os.path.join(tmp, "site-src")
    os.makedirs(w)
    for f in ("package.json", "package-lock.json", "vite.config.js", ".nojekyll"):
        if os.path.exists(os.path.join(REPO, f)):
            shutil.copy2(os.path.join(REPO, f), w)
    shutil.copytree(os.path.join(REPO, "design"), os.path.join(w, "design"))
    for k in ("brand-kit", "feature-kit"):                  # بسته‌های دانلودی روی سرور لازم نیستند
        os.makedirs(os.path.join(w, k))
    os.symlink(os.path.join(REPO, "node_modules"), os.path.join(w, "node_modules"))
    cfg = os.path.join(w, "design", "src", "core", "config.js")
    src = open(cfg, encoding="utf-8").read()
    import re
    src, n1 = re.subn(r"export const SUPABASE_URL = '[^']*';", "export const SUPABASE_URL = location.origin;", src)
    src, n2 = re.subn(r"export const SUPABASE_ANON_KEY = '[^']*';", "export const SUPABASE_ANON_KEY = '__JARYAN_ANON_KEY__';", src)
    if n1 != 1 or n2 != 1:
        raise SystemExit("config.js سایت شکل مورد انتظار را ندارد (SUPABASE_URL/ANON_KEY).")
    src, n3 = re.subn(r"export const SERVER_MODE = false;", "export const SERVER_MODE = true;", src)
    if n3 != 1:
        src += "\n// سرور خودمان (server/tools/build_core.py)\nexport const SERVER_MODE = true;\n"
    open(cfg, "w", encoding="utf-8").write(src)
    subprocess.run(["npx", "vite", "build", "--logLevel", "warn"], cwd=w, check=True)
    shutil.copytree(os.path.join(w, "dist", "design"), os.path.join(dest, "design"))
    leftovers = subprocess.run(["grep", "-rl", SUPABASE_URL, os.path.join(dest, "design")], capture_output=True, text=True)
    if leftovers.stdout.strip():
        raise SystemExit("نشانی Supabase هنوز در خروجی سایت هست: " + leftovers.stdout[:300])


# ---------------------------------------------------------------- اصلی

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=".")
    ap.add_argument("--lite", action="store_true", help="بدون اجزای بزرگ (از نسخه‌ی فعال سرور)")
    ap.add_argument("--no-site", action="store_true")
    a = ap.parse_args()

    version = open(os.path.join(CORE, "VERSION"), encoding="utf-8").read().strip()
    notes = [n.strip() for n in open(os.path.join(CORE, "NOTES"), encoding="utf-8") if n.strip()]
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "release")
        shutil.copytree(CORE, src, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "VERSION", "NOTES", "pylib.lock"))
        mig = os.path.join(src, "db", "migrations")
        os.makedirs(mig)
        for name in sorted(os.listdir(os.path.join(REPO, "db"))):
            if name == "schema.sql" or (name.startswith("migration_") and name.endswith(".sql")):
                shutil.copy2(os.path.join(REPO, "db", name), mig)
        shutil.copytree(os.path.join(REPO, "scripts"), os.path.join(src, "scripts"),
                        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "telegram_session_to_string.py"))
        fn = os.path.join(src, "functions")
        for name in ("translate", "news-insights", "extract-post-keywords", "_shared"):
            shutil.copytree(os.path.join(REPO, "supabase", "functions", name), os.path.join(fn, name))
        os.makedirs(os.path.join(src, "vendor"), exist_ok=True)
        shutil.copy2(fetch(*ACME), os.path.join(src, "vendor", "acme.sh"))
        os.chmod(os.path.join(src, "vendor", "acme.sh"), 0o755)
        site = os.path.join(src, "site")
        if not a.no_site:
            build_site(tmp, site)

        comps = {}
        os.makedirs(os.path.join(src, "components"))
        for name, make in COMPONENTS.items():
            root, members = make(tmp)
            out = os.path.join(tmp, f"{name}.tar.xz")
            xz_dir(root, members, out)
            comps[name] = {"sha256": sha256(out), "paths": members, "size": os.path.getsize(out)}
            if not a.lite:
                shutil.move(out, os.path.join(src, "components", f"{name}.tar.xz"))
            print(f"جزء {name}: {comps[name]['size'] // 1024} کیلوبایت، sha {comps[name]['sha256'][:12]}", flush=True)
        json.dump(comps, open(os.path.join(src, "components.json"), "w"), indent=1)
        for root, _, files in os.walk(os.path.join(src, "hooks")):
            for f in files:
                os.chmod(os.path.join(root, f), 0o755)
        suffix = "-lite" if a.lite else ""
        out = os.path.join(a.out, f"jaryan-server-{version}{suffix}.jaryan")
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
