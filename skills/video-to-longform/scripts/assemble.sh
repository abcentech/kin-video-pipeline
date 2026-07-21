#!/bin/zsh
# Assemble the final longform: intro -> body -> outro, uniform re-encode so segments
# at different fps/codecs join seamlessly. Any segment may be omitted with "-".
#   assemble.sh <out.mp4> <intro|-> <body> <outro|->
set -e
OUT="$1"; shift
SEGS=("$@")
[ -z "$OUT" ] && { echo "usage: assemble.sh <out.mp4> <intro|-> <body> <outro|->"; exit 1; }
TMP=$(mktemp -d); LIST="$TMP/list.txt"; : > "$LIST"; i=0
norm() { ffmpeg -y -i "$1" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p" -af "aresample=48000" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -profile:v high -level 4.2 -c:a aac -b:a 192k -ar 48000 -ac 2 "$2" >/dev/null 2>&1; }
for s in "${SEGS[@]}"; do
  [ "$s" = "-" ] && continue
  [ -f "$s" ] || { echo "MISSING: $s"; exit 1; }
  i=$((i+1)); echo "normalising $s"; norm "$s" "$TMP/$i.mp4"; printf "file '%s'\n" "$TMP/$i.mp4" >> "$LIST"
done
ffmpeg -y -f concat -safe 0 -i "$LIST" -c copy "$OUT" >/dev/null 2>&1
rm -rf "$TMP"; echo "wrote $OUT"
ffprobe -v error -show_entries format=duration:stream=codec_type,width,height,r_frame_rate -of default=noprint_wrappers=1 "$OUT"
