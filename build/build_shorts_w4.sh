#!/bin/zsh
# Build the 9 remaining FIH W4 shorts: music bed + crop cut + word transcribe + captions.
# (E5 hospital is already built.) Each row: name capname lf sourceSS dur hook-ignored
set -e
MODEL="models/ggml-large-v3-turbo-q5_0.bin"
# outname               capname         lf             ss      dur
ROWS=(
  "sh_e1_ask         e1_ask         lf_fih_jun22 182.5 32.5"
  "sh_e1_wanthealed  e1_wanthealed  lf_fih_jun22 213   29"
  "sh_e2_problems    e2_problems    lf_fih_jun23 177.7 27"
  "sh_e2_care        e2_care        lf_fih_jun23 243   30"
  "sh_e3_name        e3_name        lf_fih_jun24 150   28"
  "sh_e3_longprayers e3_longprayers lf_fih_jun24 255.4 38"
  "sh_e4_gradual     e4_gradual     lf_fih_jun25 279.5 33"
  "sh_e4_dontfear    e4_dontfear    lf_fih_jun25 438.3 33"
  "sh_e5_driver      e5_driver      lf_fih_jun26 451.7 40"
)
for row in "${ROWS[@]}"; do
  set -- ${=row}
  NAME=$1; CAP=$2; LF=$3; SS=$4; DUR=$5
  echo "########## $NAME  ($LF @ ${SS}s +${DUR}s) ##########"
  # music bed: climax ~62% through
  CMX=$(echo "$DUR*0.62"|bc -l)
  zsh build/cine_music.sh "$DUR" "$CMX" "remotion-video-studio/public/music_${CAP}.mp3" >/dev/null 2>&1
  echo "  bed ok"
  # crop cut (no re-grade)
  zsh build/clip_vert.sh "longform-studio/public/${LF}.mp4" "$SS" "$DUR" "$NAME" >/dev/null 2>&1
  echo "  clip ok"
  # word transcribe
  zsh .claude/skills/video-to-short/scripts/transcribe_words.sh "remotion-video-studio/public/${NAME}.mp4" "build/transcripts/${CAP}.whisper" "$MODEL" >/dev/null 2>&1
  echo "  transcribe ok"
  # captions
  node build/build_captions.mjs "$CAP" 2>&1 | sed 's/^/  /'
done
echo "ALL 9 SHORTS BUILT"
