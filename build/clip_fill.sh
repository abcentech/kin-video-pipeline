#!/bin/zsh
# Blurred-FILL vertical clip from an ALREADY-GRADED long-form source (lf_*.mp4).
# Keeps the WHOLE 16:9 frame (incl. the editor's burned-in scene text / scripture
# cards) — scales it to full width on a blurred background, NO crop loss, NO
# re-grade. For "showcase" shorts where the source scenes already carry captions.
# Usage: build/clip_fill.sh <src_abs.mp4> <ss> <dur> <outname>
# Writes remotion-video-studio/public/<outname>.mp4
set -e
SRC="$1"; SS="$2"; DUR="$3"; NAME="$4"
OUT="remotion-video-studio/public/${NAME}.mp4"

# full 16:9 frame -> 1080 wide (607 tall) centered on a 1080x1920 blurred fill
VF="[0:v]split=2[bg][fg];\
[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=28:2[bg2];\
[fg]scale=1080:-2:flags=lanczos[fg2];\
[bg2][fg2]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p"

# light voice cleanup (these sources carry VO only)
AF="highpass=f=85,afftdn=nf=-26:nt=w,adeclip,\
acompressor=threshold=-18dB:ratio=3:attack=8:release=180,\
loudnorm=I=-15:TP=-1.5:LRA=11"

ffmpeg -y -ss "$SS" -t "$DUR" -i "$SRC" \
  -filter_complex "$VF" -af "$AF" \
  -c:v libx264 -preset medium -crf 19 -r 30 \
  -pix_fmt yuv420p -profile:v high -level 4.0 -movflags +faststart \
  -c:a aac -b:a 192k "$OUT" 2>&1 | tail -2
echo "wrote $OUT"
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT"
