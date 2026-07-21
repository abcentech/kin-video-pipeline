#!/bin/zsh
# Scout candidate short windows: cut audio-only from the graded lf, whisper word-level,
# write build/scout/<tag>.json so we can pick the tight ~30s payoff cut.
# Usage: build/scout_windows.sh   (windows hardcoded below)
set -e
MODEL="models/ggml-large-v3-turbo-q5_0.bin"
mkdir -p build/scout
# tag  srcfile  ss  dur
WINDOWS=(
  "e1a lf_fih_jun22 175 60"
  "e1b lf_fih_jun22 206 60"
  "e2a lf_fih_jun23 159 62"
  "e2b lf_fih_jun23 243 62"
  "e3a lf_fih_jun24 138 60"
  "e3b lf_fih_jun24 250 60"
  "e4a lf_fih_jun25 279 62"
  "e4b lf_fih_jun25 432 62"
  "e5b lf_fih_jun26 440 62"
)
for row in "${WINDOWS[@]}"; do
  set -- ${=row}
  TAG=$1; SRC=$2; SS=$3; DUR=$4
  WAV="build/scout/${TAG}_16k.wav"
  echo "=== $TAG  ($SRC @ ${SS}s +${DUR}s) ==="
  ffmpeg -y -ss "$SS" -t "$DUR" -i "longform-studio/public/${SRC}.mp4" -ar 16000 -ac 1 -c:a pcm_s16le "$WAV" 2>/dev/null
  whisper-cli -m "$MODEL" -f "$WAV" -ml 1 -sow -oj -of "build/scout/${TAG}" -l en -pp -t 8 >/dev/null 2>&1
  rm -f "$WAV"
  echo "wrote build/scout/${TAG}.json"
done
echo "ALL SCOUT WINDOWS DONE"
