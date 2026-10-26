#!/usr/bin/env bash
# بررسی سرور پیش از نصب «جریان» — فقط‌خواندنی؛ هیچ چیزی نصب یا تغییر نمی‌دهد.
# خروجی عمداً IP، نام سرور و رمز ندارد؛ کل متن را برای بررسی بفرستید.
# اجرا:  sudo bash check.sh
set -u
export LC_ALL=C
line(){ echo "------------------------------------------------------------"; }
echo "JARYAN SERVER CHECK v1   $(date -u '+%Y-%m-%d %H:%M UTC')"
line
echo "[system]"
. /etc/os-release 2>/dev/null; echo "os: ${PRETTY_NAME:-?}"
echo "kernel: $(uname -r)   arch: $(uname -m)   virt: $(systemd-detect-virt 2>/dev/null || echo ?)"
echo "root: $([ "$(id -u)" = 0 ] && echo yes || echo 'no (run with sudo)')   systemd: $(pidof systemd >/dev/null || [ -d /run/systemd/system ] && echo yes || echo no)"
echo "cpu: $(nproc) cores — $(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | sed 's/^ *//')"
free -h | awk '/^Mem/{print "ram: total "$2", available "$7} /^Swap/{print "swap: "$2}'
echo "time: $(timedatectl show -p NTPSynchronized --value 2>/dev/null | sed 's/^/ntp-synced=/') tz=$(timedatectl show -p Timezone --value 2>/dev/null)"
line
echo "[disk]"
lsblk -d -e7,11 -o NAME,ROTA,SIZE,TYPE,MODEL 2>/dev/null
echo "(ROTA 0 = SSD, 1 = HDD)"
df -h / | awk 'NR==2{print "root fs: size "$2", used "$3", free "$4}'
T=$(mktemp -p /var/tmp jaryan-dd.XXXX) && {
  W=$(dd if=/dev/zero of="$T" bs=1M count=512 oflag=direct 2>&1 | tail -1 | awk -F, '{print $NF}')
  echo "write speed (512MB direct):${W}"; rm -f "$T"; }
line
echo "[software]"
for c in python3 openssl nginx psql docker curl ufw tar gzip; do
  v=$(command -v "$c" >/dev/null 2>&1 && { "$c" --version 2>/dev/null || "$c" version 2>/dev/null || "$c" -v 2>&1; } | head -1)
  printf '%-8s %s\n' "$c" "${v:--}"
done
echo "listening tcp ports: $(ss -tlnH 2>/dev/null | awk '{print $4}' | sed 's/.*://' | sort -un | tr '\n' ' ')"
echo "ufw: $(ufw status 2>/dev/null | head -1 || echo -)"
echo "ssh port(s): $(ss -tlnpH 2>/dev/null | grep -w sshd | awk '{print $4}' | sed 's/.*://' | sort -u | tr '\n' ' ')"
line
echo "[apt]"
grep -rhoE '^(deb|URIs:)[^#]*https?://[^ /]+' /etc/apt/sources.list /etc/apt/sources.list.d/ 2>/dev/null | grep -oE 'https?://[^ /]+' | sort -u | while read -r m; do
  r=$(curl -sS -o /dev/null -m 10 -w '%{http_code}' "$m/" 2>/dev/null); echo "mirror $m -> ${r:-000}"; done
line
echo "[network]  code = HTTP status, 000 = blocked/timeout"
chk(){ r=$(curl -sS -o /dev/null -m 10 -w '%{http_code} %{time_total}s' "$2" 2>/dev/null); printf '%-18s %s\n' "$1" "${r:-000}"; }
chk ubuntu-archive  http://archive.ubuntu.com/ubuntu/
chk pypi            https://pypi.org/simple/
chk npm             https://registry.npmjs.org/
chk github          https://github.com
chk github-objects  https://objects.githubusercontent.com
chk docker-hub      https://registry-1.docker.io/v2/
chk supabase-now    https://komqnapfqrtxxaytpcdt.supabase.co/rest/v1/
chk telegram-api    https://api.telegram.org
chk liara-ai        https://ai.liara.ir
chk melipayamak     https://console.melipayamak.com
chk eitaa           https://eitaa.com
chk bale            https://ble.ir
chk jaaar           https://jaaar.com
chk tasnim          https://www.tasnimnews.com
chk khamenei-ir     https://www.khamenei.ir
chk resend          https://api.resend.com
chk google          https://www.google.com
chk bbc-persian     https://www.bbc.com/persian
line
echo "END — copy everything from 'JARYAN SERVER CHECK' to here."
