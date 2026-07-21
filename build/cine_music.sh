#!/bin/zsh
# Cinematic emotional bed with a climactic build.
# Usage: build/cine_music.sh <duration> <climaxStart> <out.mp3>
set -e
cd "$(dirname "$0")/.."
DUR="$1"; CMX="$2"; OUT="$3"
TMP="build/cmus_tmp"; rm -rf "$TMP"; mkdir -p "$TMP"

# Emotional minor progression (Am F C G ...), each chord crossfaded
chords=("220.00 261.63 329.63" "174.61 220.00 261.63" "261.63 329.63 392.00" "196.00 246.94 293.66")
CLEN=6.0; need=$(( ${DUR%.*} / 5 + 3 )); i=0; idx=0
while [ $i -lt $need ]; do
  set -- ${=chords[$((idx%4+1))]}; r=$1;t=$2;f=$3; sub=$(echo "$r/2"|bc -l); sh=$(echo "$r*2"|bc -l)
  ffmpeg -y -hide_banner -loglevel error \
    -f lavfi -i "sine=frequency=$r:duration=$CLEN" -f lavfi -i "sine=frequency=$t:duration=$CLEN" \
    -f lavfi -i "sine=frequency=$f:duration=$CLEN" -f lavfi -i "sine=frequency=$sub:duration=$CLEN" \
    -f lavfi -i "sine=frequency=$sh:duration=$CLEN" \
    -filter_complex "[0]volume=0.9[a];[1]volume=0.8[b];[2]volume=0.7[c];[3]volume=0.7[d];[4]volume=0.22[e];[a][b][c][d][e]amix=inputs=5:normalize=0,lowpass=f=1000,afade=t=in:st=0:d=1.4,afade=t=out:st=4.6:d=1.4[m]" \
    -map "[m]" -ar 44100 "$TMP/c$i.wav"
  i=$((i+1)); idx=$((idx+1))
done
prev="$TMP/c0.wav"
for j in $(seq 1 $((need-1))); do
  ffmpeg -y -hide_banner -loglevel error -i "$prev" -i "$TMP/c$j.wav" -filter_complex "[0][1]acrossfade=d=1.3:c1=tri:c2=tri" "$TMP/m$j.wav"; prev="$TMP/m$j.wav"
done

# riser swelling into climax + deep impact at climax
CE=$(echo "$CMX+3"|bc -l)
ffmpeg -y -hide_banner -loglevel error -f lavfi -i "anoisesrc=d=${DUR}:color=brown:amplitude=0.6" \
  -af "highpass=f=250,lowpass=f=5000,volume='if(between(t,$CMX-9,$CMX),(t-($CMX-9))/9*0.55,if(between(t,$CMX,$CE),0.55*($CE-t)/3,0))':eval=frame" "$TMP/riser.wav"
ffmpeg -y -hide_banner -loglevel error -f lavfi -i "sine=frequency=55:duration=2.2" \
  -af "afade=t=out:st=0.1:d=2,volume=1.6" "$TMP/boom.wav"

# master: bed swells toward climax; reverb; fades; limiter
ffmpeg -y -hide_banner -loglevel error \
  -i "$prev" -i "$TMP/riser.wav" -i "$TMP/boom.wav" \
  -filter_complex "\
   [0]aecho=0.8:0.85:90|180:0.4|0.3,volume='0.42+0.5*clip((t-($CMX-12))/12,0,1)':eval=frame[bed];\
   [1]aecho=0.7:0.7:60:0.3[rise];\
   [2]adelay=${CMX%.*}s|${CMX%.*}s[hit];\
   [bed][rise]amix=inputs=2:normalize=0[mix];\
   [mix][hit]amix=inputs=2:normalize=0,atrim=0:$DUR,afade=t=in:st=0:d=2,afade=t=out:st=$(echo "$DUR-2.5"|bc -l):d=2.5,alimiter=limit=0.95[out]" \
  -map "[out]" -ac 2 -ar 44100 -b:a 192k "$OUT" 2>&1 | tail -1
echo "wrote $OUT ($DUR s, climax $CMX)"
