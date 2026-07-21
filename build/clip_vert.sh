#!/bin/zsh
# Crop-only vertical clip from an ALREADY-GRADED source (e.g. longform-studio
# public/lf_fih_jun2X.mp4). Center-crops 9:16 + scales to 1080x1920 and cleans
# the audio — NO re-grade (the longform source already carries the series grade).
# Usage: build/clip_vert.sh <src_abs.mp4> <ss> <dur> <outname>
# Writes remotion-video-studio/public/<outname>.mp4
set -e
SRC="$1"; SS="$2"; DUR="$3"; NAME="$4"
OUT="remotion-video-studio/public/${NAME}.mp4"

# Tighter 9:16 crop that excludes the long-form's baked bottom-caption band
# (drops the bottom ~120px of the 1080-tall source) so our karaoke captions
# don't collide with the source subtitles. 540:960 == exact 9:16.
VF="crop=540:960:690:0,scale=1080:1920:flags=lanczos,setsar=1"

AF="highpass=f=85,afftdn=nf=-26:nt=w,adeclip,\
acompressor=threshold=-18dB:ratio=3:attack=8:release=180,\
loudnorm=I=-15:TP=-1.5:LRA=11"

ffmpeg -y -ss "$SS" -t "$DUR" -i "$SRC" \
  -vf "$VF" -af "$AF" \
  -c:v libx264 -preset medium -crf 19 -r 30 \
  -pix_fmt yuv420p -profile:v high -level 4.0 -movflags +faststart \
  -c:a aac -b:a 192k "$OUT" 2>&1 | tail -2
echo "wrote $OUT"
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT"
