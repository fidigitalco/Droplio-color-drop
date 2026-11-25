#!/bin/bash
# App Store screenshots from the real game renderer (headless Chrome + WebGL).
# Output: store/screenshots/<size>/0N.jpg  (JPEG, no alpha — App Store safe)
# Usage: tools/screenshots/render.sh            (all sizes, all shots)
#        tools/screenshots/render.sh 1320x2868 3 (one size, one shot)
set -e
cd "$(dirname "$0")"
ROOT=../..
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

npx --yes esbuild@0.24.0 entry.ts --bundle --format=iife --outfile=.build/bundle.js --log-level=error

declare -a SIZES=("iPhone-6.9in_1320x2868" "iPhone-6.5in_1284x2778" "iPhone-6.3in_1206x2622" "iPhone-6.1in_1179x2556" "GooglePlay-phone_1080x1920")
ONLY_SIZE=$1; shift || true
SHOTS=${*:-1 2 3 4 5 6}

for name in "${SIZES[@]}"; do
  dims=${name##*_}; W=${dims%x*}; H=${dims#*x}
  [ -n "$ONLY_SIZE" ] && [ "$ONLY_SIZE" != "$dims" ] && continue
  out="$ROOT/store/screenshots/$name"; mkdir -p "$out" .build/png
  for n in $SHOTS; do
    "$CHROME" --headless=new --user-data-dir="$(mktemp -d)" --use-angle=swiftshader --enable-unsafe-swiftshader \
      --allow-file-access-from-files --hide-scrollbars --force-device-scale-factor=1 --window-size=$W,$H \
      --virtual-time-budget=15000 --screenshot="$PWD/.build/png/$dims-$n.png" "file://$PWD/shot.html?n=$n&w=$W&h=$H" >/dev/null 2>&1 &
  done
  wait
  for n in $SHOTS; do
    sips -s format jpeg -s formatOptions 95 ".build/png/$dims-$n.png" --out "$out/0$n.jpg" >/dev/null
  done
  echo "$name: done"
done
