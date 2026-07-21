#!/bin/zsh
# Jul14 grade: soft-warm filmic + RNNoise-ALONE voice clean, conform 120->30fps.
# Footage is already well-lit (luma ~128) so keep default grade brightness.
set -e
SRC="/Users/mac/Documents/video raw/Videos/Jul 14/Jul14.MP4"
OUT="/Users/mac/Documents/video raw/longform-studio/public/lf_jul14.mp4"
RNN="/Users/mac/Documents/video raw/build/rnnoise/std.rnnn"

# KidsInspiringNation HOUSE GRADE — Teal & Orange (locked Jul 11 2026, use for ALL videos).
# Teal-cooled shadows + warm-orange skin/highlights, punchy S-curve, restrained halation,
# light grain + vignette. Contains its OWN halation (split/screen) — do NOT add a separate bloom.
LOOKB="hqdn3d=3:2:3:3,eq=contrast=1.08:saturation=1.14:gamma=1.03,\
curves=all='0/0.02 0.25/0.20 0.5/0.5 0.75/0.80 1/0.98',\
colorbalance=rs=-0.06:gs=0.02:bs=0.06:rm=-0.02:bm=0.02:rh=0.07:gh=0.01:bh=-0.07,\
split=2[b][h];[h]curves=all='0/0 0.65/0 1/0.9',gblur=sigma=14[g];[b][g]blend=all_mode=screen:all_opacity=0.16,\
noise=alls=4:allf=t,vignette=PI/8,unsharp=5:5:0.5"
VF="scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,\
${LOOKB}"

# RNNoise-ALONE denoise (never stack afftdn+anlmdn on top) then shape voice + -14 LUFS
AF="highpass=f=85,arnndn=m=${RNN},equalizer=f=200:t=q:w=1.0:g=-3,equalizer=f=3000:t=q:w=1.5:g=2,deesser,acompressor=threshold=-18dB:ratio=3:attack=8:release=180,loudnorm=I=-14:TP=-1.5:LRA=11"

# Trim head dead-air (start 1.0s in) + tail dead-air (475.7s duration → ends ~476.7s of source).
# -ss before -i resets PTS to 0; all caption/scene JSON times are shifted -1.0s to match.
ffmpeg -y -ss 1.0 -i "$SRC" -t 475.7 -filter_complex "$VF" -af "$AF" \
  -c:v libx264 -preset medium -crf 17 -r 30 -g 30 -keyint_min 30 -sc_threshold 0 \
  -pix_fmt yuv420p -profile:v high -level 4.2 -movflags +faststart \
  -c:a aac -b:a 192k "$OUT"
echo "=== GRADE DONE: $OUT ==="
