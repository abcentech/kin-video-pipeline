#!/bin/zsh
# Music-video variant of cinematic.sh: center-crop 9:16 ONLY, keep the song.
# Use when the source is an ALREADY-GRADED music video (e.g. the video-music-3d output)
# that carries its own song + burned-in karaoke. Differs from cinematic.sh:
#   - NO re-grade (source is already color-graded; a second teal-orange grade muddies it).
#   - NO afftdn denoise (that damages a music bed); audio = loudnorm only, song preserved.
# Pair with shorts.json music:"silent.mp3" + empty captions so nothing fights the song
# or doubles the existing karaoke. See SKILL.md "Music-video source".
# Usage: cinematic_musicvideo.sh <src> <ss> <dur> <outname>   -> public/<outname>.mp4
set -e
SRC="$1"; SS="$2"; DUR="$3"; NAME="$4"
OUT="public/${NAME}.mp4"

ffmpeg -y -ss "$SS" -t "$DUR" -i "$SRC" \
  -vf "crop=608:1080:656:0,scale=1080:1920:flags=lanczos,setsar=1" \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11" \
  -c:v libx264 -preset medium -crf 19 -r 30 \
  -pix_fmt yuv420p -profile:v high -level 4.0 -movflags +faststart \
  -c:a aac -b:a 192k "$OUT" 2>&1 | tail -1
echo "wrote $OUT"
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT"
