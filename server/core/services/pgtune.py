#!/usr/bin/env python3
"""تنظیم PostgreSQL به اندازه‌ی حافظه‌ی همین سرور (۱.۱.۲).

پیش‌فرض اوبونتو فقط ۱۲۸ مگ از حافظه را به پایگاه داده می‌دهد. این فایل
/etc/postgresql/<نسخه>/main/conf.d/90-jaryan.conf را از روی حافظه‌ی سرور می‌سازد.
خروجی ۱۰ یعنی تنظیم عوض شد و Postgres باید دوباره راه بیفتد (hooks/activate همین کار را می‌کند).

  pgtune.py apply        ساختن/به‌روزرسانی فایل تنظیم
  pgtune.py show         فقط نشان دادن مقدارها
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srvlib as S  # noqa: E402

NAME = "90-jaryan.conf"
MB = 1024 * 1024


def mem_total():
    with open("/proc/meminfo", encoding="ascii") as f:
        for line in f:
            if line.startswith("MemTotal:"):
                return int(line.split()[1]) * 1024
    raise RuntimeError("MemTotal not found")


def mb(n):
    return f"{max(1, int(n // MB))}MB"


def settings(ram):
    """مقدارها برای سرور اختصاصی (فقط جریان روی آن است) با حدود ۵۰۰ کاربر."""
    return {
        "shared_buffers": mb(min(ram // 4, 4096 * MB)),
        "effective_cache_size": mb(ram * 6 // 10),
        "maintenance_work_mem": mb(min(ram // 16, 1024 * MB)),
        "work_mem": "16MB" if ram >= 8 * 1024 * MB else "8MB",
        "wal_buffers": "16MB",
        "checkpoint_completion_target": "0.9",
        "max_wal_size": "2GB",
        "min_wal_size": "512MB",
        "random_page_cost": "1.1",
        "effective_io_concurrency": "100",
        "default_statistics_target": "100",
    }


def render(values):
    lines = ["# ساخته‌ی pgtune.py جریان (به اندازه‌ی حافظه‌ی سرور) — دستی ویرایش نکنید؛ با هر نصب بسته دوباره ساخته می‌شود"]
    lines += [f"{k} = '{v}'" for k, v in values.items()]
    return "\n".join(lines) + "\n"


def conf_dir():
    cfg = S.q1("show config_file")
    main = os.path.dirname(cfg)
    try:
        with open(cfg, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return None
    if not any(line.strip().startswith("include_dir") and "conf.d" in line for line in text.splitlines()):
        return None
    return os.path.join(main, "conf.d")


def apply():
    d = conf_dir()
    if not d:
        print("pgtune: postgresql.conf پوشه‌ی conf.d را نمی‌خواند؛ تنظیم انجام نشد")
        return 0
    text = render(settings(mem_total()))
    path = os.path.join(d, NAME)
    try:
        with open(path, encoding="utf-8") as f:
            if f.read() == text:
                print("pgtune: تنظیم پایگاه داده از قبل درست است")
                return 0
    except OSError:
        pass
    os.makedirs(d, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)
    print("pgtune: تنظیم تازه نوشته شد:", ", ".join(f"{k}={v}" for k, v in settings(mem_total()).items()))
    return 10


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "apply":
        sys.exit(apply())
    if len(sys.argv) >= 2 and sys.argv[1] == "show":
        print(render(settings(mem_total())), end="")
        sys.exit(0)
    print(__doc__)
    sys.exit(2)
