#!/bin/zsh
# Build the 9 KIN W4 "Secrets of Longevity" shorts from the graded lf_w4e*.mp4.
# Per clip: crop-only 9:16 cut -> whisper word transcribe -> karaoke captions.
# Then: make_root from build/shorts_kin_w4.json + render all comps.
set -e
cd "/Users/mac/Documents/video raw"
export PATH="$HOME/.nvm/versions/node/v24.14.1/bin:$PATH"
MODEL="models/ggml-large-v3-turbo-q5_0.bin"
mkdir -p build/transcripts
#      id          lf        ss    dur
ROWS=(
  "KINW4E1S1 lf_w4e1 253 34"
  "KINW4E1S2 lf_w4e1 356 52"
  "KINW4E1S3 lf_w4e1 423 34"
  "KINW4E2S1 lf_w4e2 130 32"
  "KINW4E2S2 lf_w4e2 283 26"
  "KINW4E2S3 lf_w4e2 404 17"
  "KINW4E3S1 lf_w4e3 235 28"
  "KINW4E3S2 lf_w4e3 338 26"
  "KINW4E3S3 lf_w4e3 376 35"
)
for row in "${ROWS[@]}"; do
  set -- ${=row}
  ID=$1; LF=$2; SS=$3; DUR=$4
  echo "########## $ID  ($LF @ ${SS}s +${DUR}s) ##########"
  zsh build/clip_vert.sh "longform-studio/public/${LF}.mp4" "$SS" "$DUR" "sh_${ID}" >/dev/null 2>&1
  echo "  clip ok"
  zsh .claude/skills/video-to-short/scripts/transcribe_words.sh "remotion-video-studio/public/sh_${ID}.mp4" "build/transcripts/${ID}.whisper" "$MODEL" >/dev/null 2>&1
  echo "  transcribe ok"
  node build/build_captions.mjs "$ID" 2>&1 | sed 's/^/  /'
done
echo "=== make root + render ==="
node .claude/skills/video-to-short/scripts/make_root.mjs build/shorts_kin_w4.json remotion-video-studio/src/Root.tsx
cd remotion-video-studio
for row in "${ROWS[@]}"; do
  set -- ${=row}
  ID=$1
  echo "=== RENDER $ID ==="
  npx remotion render "$ID" "../out/${ID}.mp4" --concurrency=6 --timeout=120000 </dev/null
done
echo "=== ALL 9 W4 SHORTS DONE ==="
