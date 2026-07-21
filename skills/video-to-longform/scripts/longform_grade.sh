#!/bin/zsh
# ============================================================================
# SOFT WARM FILMIC — repeatable top-quality cinematic grade for a LANDSCAPE
# long-form talk. Gentle, faith-friendly warmth; lifted soft blacks; low
# contrast; natural skin (no orange cast); soft highlight bloom; fine grain;
# clean, broadcast-loudness audio.   Usage: longform_grade.sh <src> <out.mp4>
# ----------------------------------------------------------------------------
# Look is fixed (no per-clip tweaking) so every video in the series matches.
# ============================================================================
set -e
SRC="$1"; OUT="$2"

# --- colour grade -----------------------------------------------------------
# curves: lift blacks slightly (soft film toe), warm the lows/mids (more red,
#   less blue), roll off highlights a touch. eq: low contrast, gentle warmth.
GRADE="eq=contrast=0.97:saturation=1.06:brightness=0.015:gamma=1.04,\
curves=r='0/0.04 0.5/0.53 1/0.97':g='0/0.03 0.5/0.50 1/0.98':b='0/0.07 0.5/0.48 1/0.90'"

# --- soft highlight bloom (split → blur one copy → screen back over) ---------
# gives the dreamy, glowy filmic quality without crushing detail.
BLOOM="split[base][glow];[glow]gblur=sigma=10,curves=all='0/0 0.6/0 1/0.7'[g];[base][g]blend=all_mode=screen:all_opacity=0.18"

# --- fit to 1080p, grade, bloom, fine grain, soft vignette ------------------
VF="scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,\
${GRADE},${BLOOM},noise=alls=3:allf=t,vignette=PI/6.2"

# --- audio: clean up, even out, normalise to YouTube loudness ---------------
AF="highpass=f=80,afftdn=nf=-25,adeclip,acompressor=threshold=-18dB:ratio=3:attack=8:release=180,loudnorm=I=-14:TP=-1.5:LRA=11"

ffmpeg -y -i "$SRC" -filter_complex "$VF" -af "$AF" \
  -c:v libx264 -preset medium -crf 17 -r 30 -pix_fmt yuv420p -profile:v high -level 4.2 -movflags +faststart \
  -c:a aac -b:a 192k "$OUT"
echo "wrote $OUT"
