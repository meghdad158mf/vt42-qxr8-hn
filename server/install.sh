#!/usr/bin/env bash
# نصب پایه‌ی سرور «جریان» — یک‌بار، روی Ubuntu 24.04 (یا 26.04)، با دسترسی root.
#
#   sudo bash jaryan-install.sh             نصب (اجرای دوباره هم بی‌خطر است)
#   sudo bash jaryan-install.sh --reset-key ساختن کلید اضطراری تازه
#
# فقط پایه را نصب می‌کند: Postgres، nginx، دیوار آتش، پشتیبان شبانه و به‌روزرسان
# (صفحه‌ی /update). خودِ سایت، جدول‌ها و کالکتورها بعداً با «بسته‌ی به‌روزرسانی»
# از همان صفحه می‌آیند — بدون نیاز به مراجعه‌ی دوباره به سرور.
# هیچ چیزی از گیت‌هاب یا Supabase دانلود نمی‌شود؛ فقط بسته‌های رسمی اوبونتو از apt.
set -Eeuo pipefail
export LC_ALL=C.UTF-8 DEBIAN_FRONTEND=noninteractive

RESET_KEY=0
for a in "$@"; do [ "$a" = "--reset-key" ] && RESET_KEY=1; done

LOG=/var/log/jaryan-install.log
say()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✔\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[1;31m✘ %s\033[0m\n' "$*"; echo "گزارش کامل: $LOG"; exit 1; }
trap 'die "نصب در خط $LINENO متوقف شد. متن بالا را برای Claude بفرستید."' ERR

[ "$(id -u)" = 0 ] || { echo "این دستور را با sudo اجرا کنید:  sudo bash $0"; exit 1; }
touch "$LOG"; chmod 600 "$LOG"
exec > >(tee -a "$LOG") 2>&1
echo "==== نصب جریان $(date -u '+%Y-%m-%d %H:%M UTC') ===="

SELF_DIR=$(cd "$(dirname "$0")" && pwd)
BASE=/opt/jaryan
TLS=/etc/jaryan/tls

# ------------------------------------------------------------------ ۱. بررسی‌ها
say "۱ از ۸ — بررسی سرور"
. /etc/os-release
case "${VERSION_ID:-}" in
  24.04|26.04) ok "سیستم‌عامل: $PRETTY_NAME" ;;
  *) [ "${ID:-}" = ubuntu ] || die "این نصب فقط برای Ubuntu است (اینجا: ${PRETTY_NAME:-نامعلوم})."
     warn "نسخه‌ی $VERSION_ID آزموده نشده؛ نصب ادامه پیدا می‌کند." ;;
esac
[ -d /run/systemd/system ] || [ -n "${JARYAN_TEST_NO_SYSTEMD:-}" ] || die "systemd فعال نیست."
FREE_GB=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
[ "$FREE_GB" -ge 20 ] || die "فضای خالی دیسک کمتر از ۲۰ گیگابایت است ($FREE_GB)."
ok "فضای خالی: ${FREE_GB}G"
ROTA=$(lsblk -dno ROTA "$(findmnt -no SOURCE / | sed 's/[0-9]*$//;s/p$//')" 2>/dev/null | head -1 || true)
[ "$ROTA" = 1 ] && warn "دیسک از نوع HDD به نظر می‌رسد؛ پایگاه داده روی آن کُند خواهد بود." || true

# ------------------------------------------------------------------ ۲. بسته‌های اوبونتو
say "۲ از ۸ — نصب بسته‌های اوبونتو (چند دقیقه)"
apt-get update -q || die "دسترسی به مخزن بسته‌های اوبونتو ممکن نشد. اگر سرور به اینترنت بین‌الملل راه ندارد، از شرکت میزبان نشانی «آینه‌ی داخلی اوبونتو» را بپرسید."
apt-get install -y -q --no-install-recommends postgresql nginx python3 openssl ufw ca-certificates curl tar gzip \
  || die "نصب بسته‌ها ناموفق بود."
ok "postgresql $(psql --version | awk '{print $3}')، nginx، python $(python3 -V | awk '{print $2}')"

# ------------------------------------------------------------------ ۳. پوشه‌ها و کاربر
say "۳ از ۸ — پوشه‌ها"
# گروه jaryan ممکن است از نصب قبلی مانده باشد (userdel گروهی را که عضو دارد پاک نمی‌کند)
id jaryan >/dev/null 2>&1 || useradd --system --home-dir "$BASE" --shell /usr/sbin/nologin \
  $(getent group jaryan >/dev/null && echo "-g jaryan") jaryan
install -d -m 755 "$BASE" "$BASE/releases" "$BASE/updater"
install -d -m 750 -o jaryan -g jaryan /var/lib/jaryan /var/lib/jaryan/files
install -d -m 700 /var/lib/jaryan/updater /var/lib/jaryan/backups /etc/jaryan "$TLS"
if [ ! -e "$BASE/current" ]; then
  install -d "$BASE/releases/0.0.0-base/site"
  cat > "$BASE/releases/0.0.0-base/site/index.html" <<'HTML'
<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>جریان</title>
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Tahoma,sans-serif;background:#16202a;color:#eef2f6;display:grid;place-items:center;min-height:90vh">
<div style="text-align:center"><h1>سرور جریان نصب شد</h1><p>منتظر نخستین بسته‌ی به‌روزرسانی است.</p></div></body></html>
HTML
  echo '{"version":"0.0.0-base","notes":["نصب پایه"]}' > "$BASE/releases/0.0.0-base/manifest.json"
  ln -s "$BASE/releases/0.0.0-base" "$BASE/current"
fi
ok "نسخه‌ی فعال: $(basename "$(readlink "$BASE/current")")"

# ------------------------------------------------------------------ ۴. به‌روزرسان
say "۴ از ۸ — به‌روزرسان (صفحه‌ی /update)"
if declare -F embedded_updater >/dev/null; then
  embedded_updater > "$BASE/updater/jaryan_updater.py"
elif [ -f "$SELF_DIR/updater/jaryan_updater.py" ]; then
  cp "$SELF_DIR/updater/jaryan_updater.py" "$BASE/updater/jaryan_updater.py"
else
  die "فایل به‌روزرسان پیدا نشد."
fi
chmod 755 "$BASE/updater/jaryan_updater.py"
python3 -m py_compile "$BASE/updater/jaryan_updater.py"
NEW_KEY=""
KEY_SHOWN=/var/lib/jaryan/updater/key-shown   # کلیدی که هرگز نشان داده نشده (نصب نیمه‌کاره) دوباره ساخته می‌شود
if [ "$RESET_KEY" = 1 ] || [ ! -e "$KEY_SHOWN" ] || ! python3 "$BASE/updater/jaryan_updater.py" has-key; then
  NEW_KEY=$(python3 "$BASE/updater/jaryan_updater.py" new-key)
  printf '%s\n' "$NEW_KEY" | python3 "$BASE/updater/jaryan_updater.py" set-key
  ok "کلید اضطراری ساخته شد (آخر نصب نشان داده می‌شود)"
else
  ok "کلید اضطراری از قبل هست (برای کلید تازه: --reset-key)"
fi

# ------------------------------------------------------------------ ۵. گواهی https موقت
say "۵ از ۸ — گواهی https موقت (تا وقتی دامنه وصل شود)"
IPS=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9.]+$' | grep -v '^127\.' || true)
if [ ! -s "$TLS/cert.pem" ]; then
  SAN="DNS:localhost,IP:127.0.0.1"
  for ip in $IPS; do SAN="$SAN,IP:$ip"; done
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 3650 \
    -subj "/CN=jaryan" -addext "subjectAltName=$SAN" -keyout "$TLS/key.pem" -out "$TLS/cert.pem" 2>/dev/null
  chmod 600 "$TLS/key.pem"
fi
FPR=$(openssl x509 -in "$TLS/cert.pem" -noout -fingerprint -sha256 | cut -d= -f2)
ok "گواهی ساخته شد"

# ------------------------------------------------------------------ ۶. nginx
say "۶ از ۸ — وب‌سرور"
cat > /etc/nginx/sites-available/jaryan <<'NGINX'
# پیکربندی پایه‌ی جریان (ساخته‌ی install.sh). بسته‌ها location خودشان را در
# /opt/jaryan/current/nginx/*.conf می‌گذارند؛ /update همیشه همین‌جا و ثابت است.
server_tokens off;
map $http_upgrade $connection_upgrade { default upgrade; '' close; }

server {
    listen 80 default_server;
    #V6 listen [::]:80 default_server;
    server_name _;
    root /opt/jaryan/current/site;
    location ^~ /update { return 301 https://$host$request_uri; }
    include /opt/jaryan/current/nginx/*.conf;
    location / { try_files $uri $uri/ /index.html; }
}

server {
    listen 443 ssl default_server;
    #V6 listen [::]:443 ssl default_server;
    server_name _;
    ssl_certificate     /etc/jaryan/tls/cert.pem;
    ssl_certificate_key /etc/jaryan/tls/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    root /opt/jaryan/current/site;

    location = /update { return 301 /update/; }
    location ^~ /update/ {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        client_max_body_size 1100m;
        proxy_request_buffering off;
        proxy_read_timeout 900s;
        proxy_send_timeout 900s;
    }
    include /opt/jaryan/current/nginx/*.conf;
    location / { try_files $uri $uri/ /index.html; }
}
NGINX
# IPv6 فقط اگر سرور داشته باشد؛ وگرنه nginx اصلاً بالا نمی‌آید
if [ -s /proc/net/if_inet6 ]; then sed -i 's/^    #V6 /    /' /etc/nginx/sites-available/jaryan; fi
# Ubuntu 26.04 خودش server_tokens را در nginx.conf دارد و تکرارش nginx را از کار می‌اندازد
NGX_OTHER="/etc/nginx/nginx.conf /etc/nginx/conf.d"
if grep -rqsE '^[[:space:]]*server_tokens[[:space:]]' $NGX_OTHER; then sed -i '/^server_tokens /d' /etc/nginx/sites-available/jaryan; fi
if grep -rqsE '\$connection_upgrade[[:space:]]*\{' $NGX_OTHER; then sed -i '/^map \$http_upgrade /d' /etc/nginx/sites-available/jaryan; fi
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/jaryan /etc/nginx/sites-enabled/jaryan
nginx -t
ok "nginx پیکربندی شد"

# ------------------------------------------------------------------ ۷. سرویس‌ها و پشتیبان شبانه
say "۷ از ۸ — سرویس‌ها، پایگاه داده و پشتیبان شبانه"
cat > /etc/systemd/system/jaryan-updater.service <<'UNIT'
[Unit]
Description=Jaryan updater (/update)
After=network.target

[Service]
ExecStart=/usr/bin/python3 /opt/jaryan/updater/jaryan_updater.py serve
Environment=JARYAN_UPDATER_TLS_LISTEN=0.0.0.0:8443
Environment=JARYAN_TLS_CERT=/etc/jaryan/tls/cert.pem
Environment=JARYAN_TLS_KEY=/etc/jaryan/tls/key.pem
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/jaryan-backup.service <<'UNIT'
[Unit]
Description=Jaryan nightly database backup

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /opt/jaryan/updater/jaryan_updater.py backup
UNIT
cat > /etc/systemd/system/jaryan-backup.timer <<'UNIT'
[Unit]
Description=Jaryan nightly database backup

[Timer]
OnCalendar=*-*-* 02:30:00 Asia/Tehran
Persistent=true

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now postgresql
systemctl enable --now jaryan-updater.service jaryan-backup.timer
systemctl restart jaryan-updater.service
systemctl enable nginx
systemctl reload-or-restart nginx
if ! runuser -u postgres -- psql -tAc "select 1 from pg_database where datname='jaryan'" | grep -q 1; then
  runuser -u postgres -- createdb jaryan
fi
timedatectl set-ntp true 2>/dev/null || true
ok "سرویس‌ها روشن شدند؛ پایگاه داده‌ی jaryan ساخته شد"

# ------------------------------------------------------------------ ۸. دیوار آتش
say "۸ از ۸ — دیوار آتش"
SSH_PORTS=$(ss -tlnpH 2>/dev/null | grep -w sshd | awk '{print $4}' | sed 's/.*://' | sort -u || true)
if { for p in ${SSH_PORTS:-22}; do ufw allow "$p/tcp"; done
     ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 8443/tcp
     [ -n "${JARYAN_TEST_NO_SYSTEMD:-}" ] || ufw --force enable; } >/dev/null; then
  ok "باز: ssh (${SSH_PORTS:-22})، 80، 443، 8443"
else
  warn "دیوار آتش روشن نشد؛ نصب ادامه پیدا می‌کند (بعداً بررسی می‌شود)."
fi

# ------------------------------------------------------------------ آزمون نهایی
say "آزمون نهایی"
sleep 2
PASS=1
curl -fsS -o /dev/null http://127.0.0.1/ && ok "سایت پاسخ می‌دهد (http)" || { warn "سایت روی http پاسخ نداد"; PASS=0; }
curl -fsSk -o /dev/null https://127.0.0.1/update/ && ok "صفحه‌ی /update پاسخ می‌دهد (از راه nginx)" || { warn "/update از راه nginx پاسخ نداد"; PASS=0; }
curl -fsSk -o /dev/null https://127.0.0.1:8443/update/ && ok "صفحه‌ی /update مستقیم روی درگاه 8443 پاسخ می‌دهد" || { warn "/update روی 8443 پاسخ نداد"; PASS=0; }
trap - ERR
KEY_FILE_NOTE=""
if [ -n "$NEW_KEY" ] && ! { true >/dev/tty; } 2>/dev/null; then
  # بدون ترمینال (مثلاً کنسول وب) کلید در گزارش نوشته نشود: فقط در فایلی که فقط root می‌خواند
  ( umask 077; printf '%s\n' "$NEW_KEY" > /root/jaryan-emergency-key.txt )
  KEY_FILE_NOTE="/root/jaryan-emergency-key.txt"; NEW_KEY=""
fi
{ true >/dev/tty; } 2>/dev/null && exec >/dev/tty 2>&1   # از اینجا به بعد (کلید) در گزارش نوشته نمی‌شود

echo
echo "================================================================"
[ "$PASS" = 1 ] && echo "  نصب پایه با موفقیت تمام شد." || echo "  نصب تمام شد ولی بعضی آزمون‌ها رد شدند — متن بالا را برای Claude بفرستید."
echo "================================================================"
echo "  نشانی صفحه‌ی به‌روزرسانی (در مرورگر رایانه‌ای در همان شبکه):"
for ip in $IPS; do echo "     https://$ip/update/        (اگر nginx خراب شد: https://$ip:8443/update/)"; done
echo
echo "  مرورگر هشدار «اتصال امن نیست» می‌دهد (گواهی موقت است، تا دامنه وصل شود)."
echo "  مطمئن شوید اثر انگشت گواهی در مرورگر همین است:"
echo "     $FPR"
if [ -n "$NEW_KEY" ]; then
  echo
  echo "  ┌──────────────────────────────────────────────┐"
  echo "  │  کلید اضطراری (فقط همین یک‌بار نشان داده می‌شود): │"
  echo "  │                                              │"
  printf '  │      %s      │\n' "$NEW_KEY"
  echo "  └──────────────────────────────────────────────┘"
  echo "  روی کاغذ بنویسید یا در مدیر رمز نگه دارید. در چت یا پیام‌رسان نفرستید."
  echo "  بعد از نوشتن، دستور  clear  را بزنید تا از روی صفحه پاک شود."
fi
[ -n "$NEW_KEY$KEY_FILE_NOTE" ] && touch "$KEY_SHOWN"
[ -n "$KEY_FILE_NOTE" ] && echo "  کلید اضطراری در $KEY_FILE_NOTE است؛ آن را بخوانید، روی کاغذ بنویسید و فایل را پاک کنید (rm)."
echo
echo "  برای Claude فقط این را بفرستید: «نصب پایه تمام شد» + متن‌های بالای این کادر."
echo "================================================================"
