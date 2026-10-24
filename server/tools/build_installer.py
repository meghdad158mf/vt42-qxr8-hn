#!/usr/bin/env python3
"""ساخت یک فایل تکی jarian-install.sh (install.sh + به‌روزرسان درون آن) برای بردن با فلش.

  python3 server/tools/build_installer.py [--out jarian-install.sh]
"""
import argparse
import hashlib
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.dirname(HERE)
MARK = "JARIAN_UPDATER_PY_EOF"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="jarian-install.sh")
    a = ap.parse_args()
    install = open(os.path.join(SERVER, "install.sh"), encoding="utf-8").read()
    updater = open(os.path.join(SERVER, "updater", "jarian_updater.py"), encoding="utf-8").read()
    assert MARK not in updater
    head, sep, body = install.partition("set -Eeuo pipefail\n")
    assert sep, "install.sh ساختار مورد انتظار را ندارد"
    func = f"embedded_updater() {{\ncat <<'{MARK}'\n{updater}{MARK}\n}}\n"
    out = head + sep + func + body
    with open(a.out, "w", encoding="utf-8", newline="\n") as f:
        f.write(out)
    os.chmod(a.out, 0o755)
    print(a.out, len(out.encode()), "بایت، sha256:", hashlib.sha256(out.encode()).hexdigest()[:16])


if __name__ == "__main__":
    main()
