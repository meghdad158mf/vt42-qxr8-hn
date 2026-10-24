#!/usr/bin/env python3
"""ساخت بسته‌ی به‌روزرسانی سرور (.jarian) از یک پوشه.

  python3 server/tools/make_package.py --src <پوشه> --version 5.40.0 \
      --note "تغییر ۱" --note "تغییر ۲" [--health / --health /api/] [--sign private.pem] --out <فایل>

پوشه‌ی src همان چیزی است که روی سرور در /opt/jarian/releases/<نسخه> می‌نشیند؛
اگر hooks/preinstall یا hooks/activate داشته باشد، به‌روزرسان اجرایشان می‌کند.
بسته = tar ساده با manifest.json + payload.tar.gz + payload.sig (اگر --sign داده شود).
"""
import argparse
import hashlib
import io
import json
import os
import subprocess
import sys
import tarfile
import tempfile
import time


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument("--note", action="append", default=[])
    ap.add_argument("--health", action="append", default=[])
    ap.add_argument("--sign")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        payload = os.path.join(tmp, "payload.tar.gz")
        with tarfile.open(payload, "w:gz") as tf:
            for name in sorted(os.listdir(a.src)):
                tf.add(os.path.join(a.src, name), arcname=name)
        digest = hashlib.sha256(open(payload, "rb").read()).hexdigest()
        manifest = {"version": a.version, "created": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()),
                    "notes": a.note, "health": a.health or ["/"], "sha256": digest, "format": 1}
        members = [("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=1).encode()),
                   ("payload.tar.gz", open(payload, "rb").read())]
        if a.sign:
            sig = os.path.join(tmp, "payload.sig")
            subprocess.run(["openssl", "pkeyutl", "-sign", "-inkey", a.sign, "-rawin",
                            "-in", payload, "-out", sig], check=True)
            members.append(("payload.sig", open(sig, "rb").read()))
        with tarfile.open(a.out, "w:") as out:
            for name, data in members:
                info = tarfile.TarInfo(name)
                info.size = len(data)
                info.mtime = int(time.time())
                out.addfile(info, io.BytesIO(data))
    print(f"{a.out}: نسخه‌ی {a.version}، {os.path.getsize(a.out)} بایت، امضا: {'دارد' if a.sign else 'ندارد'}")


if __name__ == "__main__":
    sys.exit(main())
