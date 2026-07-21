#!/bin/zsh
# Re-cut all 10 W4 shorts with the tighter (caption-free) crop, then render all.
set -e
export PATH=/Users/mac/.nvm/versions/node/v20.20.2/bin:$PATH
ROWS=(
  "sh_e1_ask         lf_fih_jun22 182.5 31.2 FIHE1S1"
  "sh_e1_wanthealed  lf_fih_jun22 214.8 27.5 FIHE1S2"
  "sh_e2_problems    lf_fih_jun23 177.7 25.5 FIHE2S1"
  "sh_e2_care        lf_fih_jun23 243   30   FIHE2S2"
  "sh_e3_name        lf_fih_jun24 150   29.7 FIHE3S1"
  "sh_e3_longprayers lf_fih_jun24 255.4 38   FIHE3S2"
  "sh_e4_gradual     lf_fih_jun25 279.5 33   FIHE4S1"
  "sh_e4_dontfear    lf_fih_jun25 438.3 33   FIHE4S2"
  "sh_e5_hospital    lf_fih_jun26 1.45  38.5 FIHE5S1"
  "sh_e5_driver      lf_fih_jun26 451.7 47.5 FIHE5S2"
)
echo "=== RE-CUT (tighter crop) ==="
for row in "${ROWS[@]}"; do
  set -- ${=row}
  NAME=$1; LF=$2; SS=$3; DUR=$4
  zsh build/clip_vert.sh "longform-studio/public/${LF}.mp4" "$SS" "$DUR" "$NAME" >/dev/null 2>&1
  echo "  recut $NAME"
done
echo "=== RENDER ==="
cd remotion-video-studio
for row in "${ROWS[@]}"; do
  set -- ${=row}
  ID=$5
  npx remotion render "$ID" "../out/${ID}.mp4" 2>&1 | tail -1
done
echo "ALL DONE"
