#!/usr/bin/env python3
"""نصب اجزای بزرگ نسخه (PostgREST، Deno، کتابخانه‌های پایتون) در preinstall.

  components.py install <پوشه‌ی نسخه> [<پوشه‌ی نسخه‌ی فعال>]

هر جزء در components.json با sha256. اگر tar.xz جزء در بسته هست (بسته‌ی کامل) بررسی و باز می‌شود؛
وگرنه (بسته‌ی سبک) همان جزء با همان sha از نسخه‌ی فعال کپی می‌شود (پیوند سخت، بدون فضای اضافه).
نبودِ هر دو = خطا با پیام روشن (بسته‌ی کامل لازم است).
"""
import hashlib
import json
import lzma
import os
import shutil
import subprocess
import sys
import tarfile


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def install(rel, cur):
    comps = json.load(open(os.path.join(rel, "components.json"), encoding="utf-8"))
    mark = os.path.join(rel, ".components")
    os.makedirs(mark, exist_ok=True)
    for name, c in comps.items():
        arc = os.path.join(rel, "components", f"{name}.tar.xz")
        if os.path.exists(arc):
            if sha256(arc) != c["sha256"]:
                raise SystemExit(f"جزء {name} خراب است (sha یکی نیست).")
            with lzma.open(arc) as xz, tarfile.open(fileobj=xz, mode="r:") as tf:
                tf.extractall(rel, filter="data") if hasattr(tarfile, "data_filter") else tf.extractall(rel)
            os.remove(arc)
            print(f"جزء {name}: از بسته باز شد")
        else:
            old = open(os.path.join(cur, ".components", name), encoding="utf-8").read().strip() \
                if cur and os.path.exists(os.path.join(cur, ".components", name)) else ""
            if old != c["sha256"]:
                raise SystemExit(f"این بسته‌ی سبک است و جزء «{name}» را ندارد، نسخه‌ی فعال سرور هم همان را ندارد؛ "
                                 "بسته‌ی کامل (بدون -lite) را نصب کنید.")
            for p in c["paths"]:
                src, dst = os.path.join(cur, p), os.path.join(rel, p)
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                if os.path.isdir(src):
                    subprocess.run(["cp", "-al", src, dst], check=True)
                else:
                    subprocess.run(["cp", "-l", src, dst], check=True)
            print(f"جزء {name}: از نسخه‌ی فعال (بدون تغییر)")
        with open(os.path.join(mark, name), "w", encoding="utf-8") as f:
            f.write(c["sha256"])
    shutil.rmtree(os.path.join(rel, "components"), ignore_errors=True)


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "install":
        cur = os.path.realpath(sys.argv[3]) if len(sys.argv) > 3 and os.path.exists(sys.argv[3]) else None
        install(sys.argv[2], cur)
    else:
        print(__doc__)
        sys.exit(2)
