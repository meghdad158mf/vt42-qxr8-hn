#!/bin/bash
# بررسی‌های بسته‌ی ۱.۱.۲ روی سرور واقعی (بعد از e2e_client.py؛ با sudo):
# جایگزینی به‌روزرسان، تنظیم حافظه‌ی Postgres، فشرده‌سازی، پشتیبان فایل‌ها.
set -uo pipefail
FAIL=0
ok()  { echo "✔ $1"; }
bad() { echo "✘ $1"; FAIL=1; }

UP=/opt/jaryan/updater/jaryan_updater.py
if cmp -s "$UP" /opt/jaryan/current/updater/jaryan_updater.py && [ -f "$UP.prev" ]; then
  ok "به‌روزرسان /update با نسخه‌ی بسته جایگزین شد (نسخه‌ی قبلی: .prev)"
else
  bad "به‌روزرسان جایگزین نشد"
fi
if systemctl list-timers --all --no-pager | grep -q jaryan-updater-reload; then
  ok "بار شدن به‌روزرسان تازه برای شب زمان‌بندی شد"
else
  bad "زمان‌بندی بار شدن به‌روزرسان نیست"
fi
python3 "$UP" has-key && ok "به‌روزرسان تازه کلید را می‌شناسد" || bad "به‌روزرسان تازه کلید را نمی‌شناسد"

SB=$(runuser -u postgres -- psql -tAc "select setting::bigint * 8192 / 1048576 from pg_settings where name='shared_buffers'")
if [ "${SB:-0}" -gt 128 ]; then ok "shared_buffers = ${SB}MB (پیش‌فرض ۱۲۸)"; else bad "تنظیم حافظه‌ی Postgres اعمال نشد ($SB)"; fi

JS=$(ls /opt/jaryan/current/site/design/assets/*.js | head -1)
URL="https://127.0.0.1/design/assets/$(basename "$JS")"
if curl -sk -H 'Accept-Encoding: gzip' -D - -o /dev/null "$URL" | grep -qi '^content-encoding: gzip'; then
  ok "فایل‌های سایت فشرده فرستاده می‌شوند"
else
  bad "فشرده‌سازی کار نمی‌کند: $URL"
fi
ANON=$(python3 -c "import json;print(json.load(open('/etc/jaryan/secrets.json'))['anon_key'])")
if curl -sk -H 'Accept-Encoding: gzip' -H "apikey: $ANON" -D - -o /dev/null "https://127.0.0.1/rest/v1/site_settings?select=*" \
     | grep -qi '^content-encoding: gzip\|^content-length: [0-9]\{1,3\}\r\?$'; then
  ok "پاسخ رابط برنامه فشرده (یا آن‌قدر کوچک که لازم نیست)"
else
  bad "پاسخ رابط برنامه فشرده نیست"
fi

systemctl is-enabled jaryan-files-backup.timer >/dev/null && ok "زمان‌بند پشتیبان فایل‌ها روشن است" || bad "زمان‌بند پشتیبان فایل‌ها روشن نیست"
install -d -o jaryan -g jaryan /var/lib/jaryan/files/magazines
echo "آزمون پشتیبان" > /var/lib/jaryan/files/magazines/e2e-backup.pdf
systemctl start jaryan-files-backup.service
F=$(ls -t /var/lib/jaryan/backups/files-*.tar 2>/dev/null | head -1)
if [ -n "$F" ] && tar -tf "$F" | grep -q 'files/magazines/e2e-backup.pdf'; then
  ok "پشتیبان فایل‌ها ساخته شد: $(basename "$F")"
else
  bad "پشتیبان فایل‌ها ساخته نشد"
fi
N1=$(ls /var/lib/jaryan/backups/files-*.tar | wc -l)
systemctl start jaryan-files-backup.service
N2=$(ls /var/lib/jaryan/backups/files-*.tar | wc -l)
[ "$N1" = "$N2" ] && ok "بدون تغییر فایل، پشتیبان تکراری ساخته نشد" || bad "پشتیبان تکراری ساخته شد"
rm -f /var/lib/jaryan/files/magazines/e2e-backup.pdf
exit $FAIL
