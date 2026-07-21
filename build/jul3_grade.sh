#!/bin/zsh
# Jul3 "Long Life: The Covenant of God's Blessing" — RAW -> graded body in ONE pass:
#   • drop verbatim-repeat sentences (build/jul3_drops.json) so the teaching is <8:00
#   • soft-warm filmic grade (same fixed look as longform_grade.sh — series-consistent)
#   • BEAST audio: denoise + de-mud + 3kHz vocal presence + de-ess + de-harsh + compress + -14 LUFS
# Usage: zsh build/jul3_grade.sh
set -e
ROOT="/Users/mac/Documents/video raw"
cd "$ROOT"
export PATH=/usr/local/bin:$PATH
SRC="$ROOT/Videos/July 3/Jul3_Unedited.mp4"
OUT="$ROOT/longform-studio/public/lf_jul3.mp4"

# build the select expression from the shared drop list
SEL=$(python3 - <<'PY'
import json
d=json.load(open("build/jul3_drops.json"))
terms="+".join(f"between(t,{a},{b})" for a,b in d["drops"])
print(f"not({terms})")
PY
)

# --- soft warm filmic grade (identical to longform_grade.sh) ---------------
GRADE="eq=contrast=0.97:saturation=1.06:brightness=0.015:gamma=1.04,curves=r='0/0.04 0.5/0.53 1/0.97':g='0/0.03 0.5/0.50 1/0.98':b='0/0.07 0.5/0.48 1/0.90'"

# --- video: trim -> fit 1080p -> grade -> soft bloom -> grain -> vignette ---
VF="[0:v]select='${SEL}',setpts=N/FRAME_RATE/TB,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,${GRADE},split[base][glow];[glow]gblur=sigma=10,curves=all='0/0 0.6/0 1/0.7'[g];[base][g]blend=all_mode=screen:all_opacity=0.18,noise=alls=3:allf=t,vignette=PI/6.2[v]"

# --- audio: trim -> clean -> shape the voice -> normalise -------------------
# highpass rumble; afftdn denoise; adeclip; de-mud 200Hz; +2.5dB presence @3kHz;
# de-ess; gently tame harsh 7.5kHz; compress; broadcast loudness.
AF="[0:a]aselect='${SEL}',asetpts=N/SR/TB,highpass=f=80,afftdn=nf=-25,adeclip,equalizer=f=200:t=q:w=1.2:g=-1.5,equalizer=f=3000:t=q:w=1.4:g=2.5,deesser=i=0.4,equalizer=f=7500:t=q:w=2:g=-2,acompressor=threshold=-18dB:ratio=3:attack=8:release=180,loudnorm=I=-14:TP=-1.5:LRA=11[a]"

ffmpeg -y -i "$SRC" -filter_complex "${VF};${AF}" -map "[v]" -map "[a]" \
  -c:v libx264 -preset medium -crf 17 -r 30 -pix_fmt yuv420p -profile:v high -level 4.2 -movflags +faststart \
  -c:a aac -b:a 192k "$OUT"
echo "wrote $OUT"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT"
