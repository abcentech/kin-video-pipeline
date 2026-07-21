#!/bin/zsh
# Re-cut 5 shorts with cleaner sentence boundaries (and capture e5_driver's payoff).
set -e
MODEL="models/ggml-large-v3-turbo-q5_0.bin"
ROWS=(
  "sh_e1_ask         e1_ask         lf_fih_jun22 182.5 31.2"
  "sh_e1_wanthealed  e1_wanthealed  lf_fih_jun22 214.8 27.5"
  "sh_e2_problems    e2_problems    lf_fih_jun23 177.7 25.5"
  "sh_e3_name        e3_name        lf_fih_jun24 150   29.7"
  "sh_e5_driver      e5_driver      lf_fih_jun26 451.7 47.5"
)
for row in "${ROWS[@]}"; do
  set -- ${=row}
  NAME=$1; CAP=$2; LF=$3; SS=$4; DUR=$5
  echo "########## $NAME  ($LF @ ${SS}s +${DUR}s) ##########"
  CMX=$(echo "$DUR*0.62"|bc -l)
  zsh build/cine_music.sh "$DUR" "$CMX" "remotion-video-studio/public/music_${CAP}.mp3" >/dev/null 2>&1
  zsh build/clip_vert.sh "longform-studio/public/${LF}.mp4" "$SS" "$DUR" "$NAME" >/dev/null 2>&1
  zsh .claude/skills/video-to-short/scripts/transcribe_words.sh "remotion-video-studio/public/${NAME}.mp4" "build/transcripts/${CAP}.whisper" "$MODEL" >/dev/null 2>&1
  node build/build_captions.mjs "$CAP" 2>&1 | sed 's/^/  /'
done
echo "REFINE DONE"
