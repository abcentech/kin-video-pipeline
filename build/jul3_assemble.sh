#!/bin/zsh
# Assemble the final video: intro -> body -> outro, uniform re-encode so the
# 30fps animated intro, the 30fps graded body, and the 30fps July-2 outro join
# seamlessly. Usage: zsh build/jul3_assemble.sh
set -e
ROOT="/Users/mac/Documents/video raw"
cd "$ROOT"
export PATH=/usr/local/bin:$PATH
PUB="longform-studio/public"
INTRO="$PUB/jul3_intro.mp4"
BODY="out/jul3_body.mp4"
OUTRO="$PUB/jul3_outro.mp4"
OUT="out/jul3_long.mp4"

for f in "$INTRO" "$BODY" "$OUTRO"; do
  [ -f "$f" ] || { echo "MISSING: $f"; exit 1; }
done

# Normalise each segment to the same spec, then concat (concat demuxer needs identical params).
TMP=$(mktemp -d)
norm() { ffmpeg -y -i "$1" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p" -af "aresample=48000" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -profile:v high -level 4.2 -c:a aac -b:a 192k -ar 48000 -ac 2 "$2" >/dev/null 2>&1; }
echo "normalising intro…"; norm "$INTRO" "$TMP/1.mp4"
echo "normalising body…";  norm "$BODY"  "$TMP/2.mp4"
echo "normalising outro…"; norm "$OUTRO" "$TMP/3.mp4"

printf "file '%s'\n" "$TMP/1.mp4" "$TMP/2.mp4" "$TMP/3.mp4" > "$TMP/list.txt"
ffmpeg -y -f concat -safe 0 -i "$TMP/list.txt" -c copy "$OUT" >/dev/null 2>&1
rm -rf "$TMP"
echo "wrote $OUT"
ffprobe -v error -show_entries format=duration:stream=codec_type,width,height,r_frame_rate -of default=noprint_wrappers=1 "$OUT"
