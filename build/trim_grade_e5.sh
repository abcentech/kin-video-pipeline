#!/bin/zsh
# E5: drop 18 long pauses (~19.9s) + apply the series grade, in one pass.
# Output -> longform-studio/public/lf_fih_jun26.mp4  (final ~598.9s = 9:59)
set -e
SRC="/Users/mac/Documents/video raw/Jun 22-26/FIH_W4E5_Jun26.mov"
OUT="/Users/mac/Documents/video raw/longform-studio/public/lf_fih_jun26.mp4"

# pauses to drop: "start end" (keep 0.65s residual already baked into these)
DROPS=(
 "136.74 137.93" "154.90 155.64" "161.11 162.56" "167.83 168.39"
 "227.67 229.13" "232.90 234.04" "239.86 242.35" "248.25 250.32"
 "269.12 270.19" "274.39 275.19" "289.98 290.74" "337.82 338.51"
 "356.84 358.34" "388.10 388.95" "483.58 484.43" "513.26 513.95"
 "531.88 532.62" "566.06 566.95"
)
TERMS=""
for d in "${DROPS[@]}"; do
  a=${d% *}; b=${d#* }
  TERMS="${TERMS}+between(t,${a},${b})"
done
TERMS="${TERMS#+}"           # strip leading +
SEL="not(${TERMS})"

GRADE="eq=contrast=0.97:saturation=1.06:brightness=0.015:gamma=1.04,curves=r='0/0.04 0.5/0.53 1/0.97':g='0/0.03 0.5/0.50 1/0.98':b='0/0.07 0.5/0.48 1/0.90'"

FC="[0:v]select='${SEL}',setpts=N/FRAME_RATE/TB,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,${GRADE},split[base][glow];[glow]gblur=sigma=10,curves=all='0/0 0.6/0 1/0.7'[g];[base][g]blend=all_mode=screen:all_opacity=0.18,noise=alls=3:allf=t,vignette=PI/6.2[v];[0:a]aselect='${SEL}',asetpts=N/SR/TB,highpass=f=80,afftdn=nf=-25,adeclip,acompressor=threshold=-18dB:ratio=3:attack=8:release=180,loudnorm=I=-14:TP=-1.5:LRA=11[a]"

ffmpeg -y -i "$SRC" -filter_complex "$FC" -map "[v]" -map "[a]" \
  -c:v libx264 -preset medium -crf 17 -r 30 -pix_fmt yuv420p -profile:v high -level 4.2 -movflags +faststart \
  -c:a aac -b:a 192k "$OUT"
echo "wrote $OUT"
