#!/usr/bin/env bash
# بسته‌ی «خراب» برای آزمون برگشت خودکار: همان بسته‌ی سالم + یک migration تازه
# (جدول broken_marker) + activate که شکست می‌خورد. باید برگردد و جدول هم برود.
set -euo pipefail
GOOD="$1"; OUT="$2"
W=$(mktemp -d)
tar -xf "$GOOD" -C "$W" manifest.json payload.tar.gz
mkdir "$W/src"; tar -xzf "$W/payload.tar.gz" -C "$W/src"
echo "create table public.broken_marker (id int);" > "$W/src/db/migrations/migration_999_broken.sql"
printf '#!/bin/bash\necho "activate عمداً شکست می‌خورد"; exit 1\n' > "$W/src/hooks/activate"
python3 "$(dirname "$0")/../../server/tools/make_package.py" --src "$W/src" --version 1.0.1-broken \
  --note "آزمون برگشت" --health /rest/v1/ --out "$OUT"
rm -rf "$W"
