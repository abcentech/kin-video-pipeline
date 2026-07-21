#!/bin/zsh
# Render the 9 remaining upgraded shorts (FIHE1S1 already done), then extract a
# cover PNG (the hook-first frame ~1.1s) for all 10 → out/covers/<ID>.png
set -e
export PATH=/Users/mac/.nvm/versions/node/v20.20.2/bin:$PATH
IDS=(FIHE1S2 FIHE2S1 FIHE2S2 FIHE3S1 FIHE3S2 FIHE4S1 FIHE4S2 FIHE5S1 FIHE5S2)
cd remotion-video-studio
for ID in "${IDS[@]}"; do
  npx remotion render "$ID" "../out/${ID}.mp4" 2>&1 | tail -1
done
cd ..
echo "=== COVERS ==="
mkdir -p out/covers
for ID in FIHE1S1 FIHE1S2 FIHE2S1 FIHE2S2 FIHE3S1 FIHE3S2 FIHE4S1 FIHE4S2 FIHE5S1 FIHE5S2; do
  ffmpeg -y -ss 1.1 -i "out/${ID}.mp4" -frames:v 1 "out/covers/${ID}.png" 2>/dev/null
  echo "  cover ${ID}.png"
done
echo "ALL DONE"
