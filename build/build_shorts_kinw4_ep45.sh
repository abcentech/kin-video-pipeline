#!/bin/zsh
set -e
cd "/Users/mac/Documents/video raw"
export PATH="$HOME/.nvm/versions/node/v24.14.1/bin:$PATH"
MODEL="models/ggml-large-v3-turbo-q5_0.bin"
mkdir -p build/transcripts
ROWS=(
  "KINW4E4S1 lf_w4e4 206 30"
  "KINW4E4S2 lf_w4e4 185 26"
  "KINW4E4S3 lf_w4e4 481 36"
  "KINW4E5S1 lf_w4e5 145 30"
  "KINW4E5S2 lf_w4e5 166 26"
  "KINW4E5S3 lf_w4e5 411 32"
)
for row in "${ROWS[@]}"; do
  set -- ${=row}; ID=$1; LF=$2; SS=$3; DUR=$4
  echo "########## $ID  ($LF @ ${SS}s +${DUR}s) ##########"
  zsh build/clip_vert.sh "longform-studio/public/${LF}.mp4" "$SS" "$DUR" "sh_${ID}" >/dev/null 2>&1
  echo "  clip ok"
  zsh .claude/skills/video-to-short/scripts/transcribe_words.sh "remotion-video-studio/public/sh_${ID}.mp4" "build/transcripts/${ID}.whisper" "$MODEL" >/dev/null 2>&1
  echo "  transcribe ok"
  node build/build_captions.mjs "$ID" 2>&1 | sed 's/^/  /'
done
echo "=== make root + render ==="
node .claude/skills/video-to-short/scripts/make_root.mjs build/shorts_kin_w4_ep45.json remotion-video-studio/src/Root.tsx
cd remotion-video-studio
for row in "${ROWS[@]}"; do
  set -- ${=row}; ID=$1
  echo "=== RENDER $ID ==="
  npx remotion render "$ID" "../out/${ID}.mp4" --concurrency=4 --timeout=120000 </dev/null
done
echo "=== ALL 6 EP4/EP5 SHORTS DONE ==="
