#!/usr/bin/env python3
"""/etc/jaryan/server.json (نقش سرور، نشانی عمومی، پیوند) و پیکربندی‌های ساختنیِ nginx.

  serverconf.py init            نقش iran و نشانی عمومی https://<نخستین IP>
  serverconf.py nginx <نسخه>    bucketهای عمومی ← <نسخه>/nginx/41-storage-public.conf؛
                                 /etc/nginx/conf.d/jaryan-map.conf (تغییر مسیر http→https دامنه)
"""
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srvlib as S  # noqa: E402

CONF = S.ETC + "/server.json"
MAP = S.ROOT + "/etc/nginx/conf.d/jaryan-map.conf"


def load():
    try:
        with open(CONF, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save(data):
    tmp = CONF + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.chmod(tmp, 0o644)
    os.replace(tmp, CONF)


def first_ip():
    try:
        out = subprocess.run(["hostname", "-I"], capture_output=True, text=True).stdout.split()
    except OSError:
        out = []
    v4 = [x for x in out if re.fullmatch(r"[0-9.]+", x) and not x.startswith("127.")]
    return v4[0] if v4 else "127.0.0.1"


def init():
    c = load()
    c.setdefault("role", "iran")
    c.setdefault("public_url", "https://" + first_ip())
    save(c)


def nginx(rel):
    try:
        pub = [b for b in S.psql("select id from storage.buckets where public order by id").split() if b]
    except S.DbError:
        pub = []
    pub = [b for b in pub if re.fullmatch(r"[a-z0-9-]+", b)]
    out = os.path.join(rel, "nginx", "41-storage-public.conf")
    with open(out, "w", encoding="utf-8") as f:
        f.write("# ساخته‌ی serverconf.py از storage.buckets (public) — دستی ویرایش نکنید\n")
        if pub:
            f.write("location ~ ^/storage/v1/object/public/(" + "|".join(pub) + ")/(.+)$ {\n"
                    "    alias /var/lib/jaryan/files/$1/$2;\n"
                    "    add_header Cache-Control \"public, max-age=86400\";\n"
                    "    add_header Access-Control-Allow-Origin *;\n"
                    "}\n")
    domain = load().get("domain") or ""
    os.makedirs(os.path.dirname(MAP), exist_ok=True)
    with open(MAP, "w", encoding="utf-8") as f:
        f.write("# ساخته‌ی serverconf.py — http→https برای دامنه‌ی سرور (به‌جز گواهی Let's Encrypt)\n")
        f.write('map "$scheme://$host$uri" $jaryan_https_redirect {\n    default 0;\n')
        if re.fullmatch(r"[a-z0-9.-]+", domain):
            f.write(f'    "~^http://{re.escape(domain)}/(?!\\.well-known/acme-challenge/)" 1;\n')
        f.write("}\n")


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "init":
        init()
    elif len(sys.argv) >= 3 and sys.argv[1] == "nginx":
        nginx(sys.argv[2])
    else:
        print(__doc__)
        sys.exit(2)
