#!/bin/zsh
# RAW -> graded longform body in ONE pass: optional verbatim-repeat/dead-air trim
# + soft-warm filmic grade + BEAST vocal-clean audio. Series-consistent fixed look.
#   grade_trim.sh <src> <out.mp4> [drops.json]
# drops.json: { "drops": [[startSec,endSec], ...] }  (sentence-aligned removals; omit to keep full length)
set -e
SRC="$1"; OUT="$2"; DROPS="${3:-}"
[ -z "$SRC" ] || [ -z "$OUT" ] && { echo "usage: grade_trim.sh <src> <out.mp4> [drops.json]"; exit 1; }

# build the keep-selection from the drop list (empty -> keep everything)
if [ -n "$DROPS" ] && [ -f "$DROPS" ]; then
  SEL=$(python3 - "$DROPS" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
ds=d.get("drops",[])
print("not(" + "+".join(f"between(t,{a},{b})" for a,b in ds) + ")" if ds else "1")
PY
)
  VSEL="select='${SEL}',setpts=N/FRAME_RATE/TB,"
  ASEL="aselect='${SEL}',asetpts=N/SR/TB,"
else
  VSEL=""; ASEL=""
fi

# fixed soft-warm filmic grade (matches longform_grade.sh — every episode matches)
GRADE="eq=contrast=0.97:saturation=1.06:brightness=0.015:gamma=1.04,curves=r='0/0.04 0.5/0.53 1/0.97':g='0/0.03 0.5/0.50 1/0.98':b='0/0.07 0.5/0.48 1/0.90'"
VF="[0:v]${VSEL}scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,${GRADE},split[base][glow];[glow]gblur=sigma=10,curves=all='0/0 0.6/0 1/0.7'[g];[base][g]blend=all_mode=screen:all_opacity=0.18,noise=alls=3:allf=t,vignette=PI/6.2[v]"
# BEAST audio: denoise + de-mud + 3kHz presence + de-ess + de-harsh + compress + -14 LUFS
AF="[0:a]${ASEL}highpass=f=80,afftdn=nf=-25,adeclip,equalizer=f=200:t=q:w=1.2:g=-1.5,equalizer=f=3000:t=q:w=1.4:g=2.5,deesser=i=0.4,equalizer=f=7500:t=q:w=2:g=-2,acompressor=threshold=-18dB:ratio=3:attack=8:release=180,loudnorm=I=-14:TP=-1.5:LRA=11[a]"

ffmpeg -y -i "$SRC" -filter_complex "${VF};${AF}" -map "[v]" -map "[a]" \
  -c:v libx264 -preset medium -crf 19 -g 30 -keyint_min 30 -sc_threshold 0 -pix_fmt yuv420p -profile:v high -level 4.2 -movflags +faststart \
  -c:a aac -b:a 192k "$OUT"
echo "wrote $OUT"; ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT"
