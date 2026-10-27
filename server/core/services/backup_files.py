#!/usr/bin/env python3
"""پشتیبان شبانه‌ی فایل‌های دائمی (۱.۱.۲) — کنار پشتیبان پایگاه داده‌ی به‌روزرسان.

پشتیبان شبانه‌ی /update فقط پایگاه داده است؛ فایل‌های بارگذاری‌شده (بسته‌ی تحلیلی، بسته‌های
سایر نهادها، گزارش‌های مدارس و جلدها) فقط روی دیسک‌اند. این برنامه هر شب از همه‌ی bucketها
به‌جز رسانه‌های موقت (post-media، newspaper-covers که خودکار پاک می‌شوند) یک فایل
/var/lib/jaryan/backups/files-<زمان>.tar می‌سازد؛ اگر از دیشب چیزی عوض نشده باشد فایل تازه
ساخته نمی‌شود. ۱۴ فایل آخر نگه داشته می‌شود؛ دانلود از صفحه‌ی /update.

  backup_files.py run
"""
import hashlib
import io
import json
import os
import sys
import tarfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srvlib as S  # noqa: E402

FILES = os.environ.get("JARYAN_FILES", S.ROOT + "/var/lib/jaryan/files")
BACKUPS = os.environ.get("JARYAN_BACKUPS", S.ROOT + "/var/lib/jaryan/backups")
SKIP_BUCKETS = {"post-media", "newspaper-covers"}
KEEP = 14
LAST = os.path.join(BACKUPS, ".files-last.json")


def inventory():
    """[(مسیر نسبی، اندازه، زمان)] همه‌ی فایل‌های دائمی."""
    out = []
    if not os.path.isdir(FILES):
        return out
    for bucket in sorted(os.listdir(FILES)):
        if bucket in SKIP_BUCKETS or bucket.startswith("."):
            continue
        root = os.path.join(FILES, bucket)
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames.sort()
            for fn in sorted(filenames):
                if ".part-" in fn:
                    continue
                fp = os.path.join(dirpath, fn)
                try:
                    st = os.stat(fp)
                except OSError:
                    continue
                out.append((os.path.relpath(fp, FILES), st.st_size, int(st.st_mtime)))
    return out


def prune():
    names = sorted((f for f in os.listdir(BACKUPS) if f.startswith("files-") and f.endswith(".tar")), reverse=True)
    for f in names[KEEP:]:
        try:
            os.remove(os.path.join(BACKUPS, f))
        except OSError:
            pass


def run():
    os.makedirs(BACKUPS, mode=0o700, exist_ok=True)
    inv = inventory()
    digest = hashlib.sha256(json.dumps(inv).encode()).hexdigest()
    try:
        with open(LAST, encoding="utf-8") as f:
            last = json.load(f)
    except (OSError, ValueError):
        last = {}
    if last.get("digest") == digest and os.path.isfile(os.path.join(BACKUPS, last.get("name", ""))):
        print(f"پشتیبان فایل‌ها: از دیشب تغییری نبود ({len(inv)} فایل؛ آخرین: {last['name']})")
        return 0
    name = "files-" + time.strftime("%Y%m%d-%H%M%S", time.gmtime()) + ".tar"
    path = os.path.join(BACKUPS, name)
    tmp = path + ".tmp"
    total = 0
    with tarfile.open(tmp, "w") as tf:
        man = json.dumps({"kind": "jaryan-files-backup", "created": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()),
                          "count": len(inv), "skip": sorted(SKIP_BUCKETS)}, ensure_ascii=False).encode()
        info = tarfile.TarInfo("MANIFEST.json")
        info.size = len(man)
        info.mtime = int(time.time())
        tf.addfile(info, io.BytesIO(man))
        for rel, size, _ in inv:
            try:
                tf.add(os.path.join(FILES, rel), arcname="files/" + rel, recursive=False)
                total += size
            except OSError as e:
                print(f"  ⚠ {rel}: {e}", file=sys.stderr)
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)
    with open(LAST + ".tmp", "w", encoding="utf-8") as f:
        json.dump({"digest": digest, "name": name, "at": time.time()}, f)
    os.replace(LAST + ".tmp", LAST)
    prune()
    print(f"پشتیبان فایل‌ها: {name} — {len(inv)} فایل، {total // (1024 * 1024)} مگابایت")
    return 0


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "run":
        sys.exit(run())
    print(__doc__)
    sys.exit(2)
