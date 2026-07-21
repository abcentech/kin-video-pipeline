#!/bin/zsh
# Cinematic vertical base: center-crop 9:16, filmic grade, denoise + clean audio.
# Usage: build/cinematic.sh <src.mov> <ss> <dur> <outname>
set -e
cd "$(dirname "$0")/.."
SRC="$1"; SS="$2"; DUR="$3"; NAME="$4"
OUT="remotion-video-studio/public/${NAME}.mp4"

# Cinematic teal-orange filmic grade: crisp upscale, S-curve contrast, warm
# highlights / teal shadows, halation bloom, vignette, fine film grain.
VF="crop=608:1080:656:0,scale=1080:1920:flags=lanczos,setsar=1,\
eq=contrast=1.16:saturation=1.20:brightness=0.010:gamma=0.95,\
curves=r='0/0 0.25/0.20 0.5/0.56 0.75/0.86 1/1':g='0/0 0.5/0.49 1/0.98':b='0/0.06 0.35/0.37 0.7/0.60 1/0.90',\
split[base][glow];\
[glow]gblur=sigma=14,curves=all='0/0 0.6/0 0.75/0.5 1/1'[bloom];\
[base][bloom]blend=all_mode=screen:all_opacity=0.28,\
unsharp=5:5:0.7:5:5:0.0,\
vignette=PI/4.0,\
noise=alls=8:allf=t+u"

AF="highpass=f=85,afftdn=nf=-26:nt=w,afftdn=nf=-26,\
adeclip,acompressor=threshold=-18dB:ratio=3:attack=8:release=180,\
lowpass=f=12000,loudnorm=I=-15:TP=-1.5:LRA=11"

ffmpeg -y -ss "$SS" -t "$DUR" -i "$SRC" \
  -vf "$VF" -af "$AF" \
  -c:v libx264 -preset medium -crf 19 -r 30 \
  -pix_fmt yuv420p -profile:v high -level 4.0 -movflags +faststart \
  -c:a aac -b:a 192k "$OUT" 2>&1 | tail -2
echo "wrote $OUT"
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT"
