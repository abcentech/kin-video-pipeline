#!/bin/zsh
# Cinematic emotional pad bed for the short. Builds a chord progression that
# swells into the climax (~18-25s of the final video), then resolves.
set -e
cd "$(dirname "$0")"
OUT="../remotion-video-studio/public/music.mp3"
TMP="./music_tmp"
rm -rf "$TMP"; mkdir -p "$TMP"

# Emotional progression in A minor: Am - F - C - G (x2) + Am resolve
# each chord = root, third, fifth (+ octave-down sub + octave-up shimmer)
chords=(
  "220.00 261.63 329.63"   # Am
  "174.61 220.00 261.63"   # F
  "261.63 329.63 392.00"   # C
  "196.00 246.94 293.66"   # G
  "220.00 261.63 329.63"   # Am
  "174.61 220.00 261.63"   # F
  "261.63 329.63 392.00"   # C
  "196.00 246.94 293.66"   # G
  "220.00 261.63 329.63"   # Am
)
LEN=5.4
i=0
for c in "${chords[@]}"; do
  set -- ${=c}
  r=$1; t=$2; f=$3
  sub=$(echo "$r/2" | bc -l)
  shimmer=$(echo "$r*2" | bc -l)
  ffmpeg -y -hide_banner -loglevel error \
    -f lavfi -i "sine=frequency=$r:duration=$LEN" \
    -f lavfi -i "sine=frequency=$t:duration=$LEN" \
    -f lavfi -i "sine=frequency=$f:duration=$LEN" \
    -f lavfi -i "sine=frequency=$sub:duration=$LEN" \
    -f lavfi -i "sine=frequency=$shimmer:duration=$LEN" \
    -filter_complex "[0]volume=0.9[a];[1]volume=0.8[b];[2]volume=0.7[c];[3]volume=0.6[d];[4]volume=0.25[e];[a][b][c][d][e]amix=inputs=5:duration=longest:normalize=0,lowpass=f=1100,afade=t=in:st=0:d=1.3,afade=t=out:st=4.1:d=1.3[m]" \
    -map "[m]" -ar 44100 "$TMP/c$i.wav"
  i=$((i+1))
done

# crossfade-concat the chords
prev="$TMP/c0.wav"
for j in {1..8}; do
  ffmpeg -y -hide_banner -loglevel error -i "$prev" -i "$TMP/c$j.wav" \
    -filter_complex "[0][1]acrossfade=d=1.2:c1=tri:c2=tri" "$TMP/m$j.wav"
  prev="$TMP/m$j.wav"
done

# a noise "riser" that swells into the climax (~final 24s), and soft boom hits
ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "anoisesrc=d=39:color=brown:amplitude=0.5" \
  -af "highpass=f=300,lowpass=f=4000,volume='if(between(t,12,25), (t-12)/13*0.5, if(between(t,25,28),0.5*(28-t)/3,0))':eval=frame" \
  "$TMP/riser.wav"

# master: chord bed + riser, big reverb, gentle dynamic build, master fades
ffmpeg -y -hide_banner -loglevel error \
  -i "$prev" -i "$TMP/riser.wav" \
  -filter_complex "\
   [0]aecho=0.8:0.85:90|180:0.4|0.3,volume='0.55+0.35*sin(2*PI*(t-20)/52)':eval=frame[bed];\
   [1]aecho=0.7:0.7:60:0.3[rise];\
   [bed][rise]amix=inputs=2:duration=first:normalize=0,\
   atrim=0:39,afade=t=in:st=0:d=2,afade=t=out:st=36.5:d=2.5,\
   alimiter=limit=0.95,volume=1.0[out]" \
  -map "[out]" -ac 2 -ar 44100 -b:a 192k "$OUT"

echo "wrote $OUT"
ls -la "$OUT"
