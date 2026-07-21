#!/bin/zsh
# Usage: build/whisper_words.sh <clip.mp4-in-public>  e.g. clipC
# Produces build/transcripts/<name>.whisper.json (word-level via whisper.cpp large-v3)
set -e
cd "$(dirname "$0")/.."
NAME="${1:-clipC}"
MODEL="${WHISPER_MODEL:-models/ggml-large-v3-turbo-q5_0.bin}"
SRC="remotion-video-studio/public/${NAME}.mp4"
WAV="build/audio/${NAME}.wav"
OUT="build/transcripts/${NAME}.whisper"

[ -f "$MODEL" ] || { echo "model missing: $MODEL"; exit 1; }
ffmpeg -y -i "$SRC" -ar 16000 -ac 1 -c:a pcm_s16le "$WAV" 2>/dev/null

# -ml 1 => one token per segment (word-level); -oj => json with ms offsets
whisper-cli -m "$MODEL" -f "$WAV" -ml 1 -sow -oj -of "$OUT" -l en -pp 2>&1 | tail -4
echo "wrote ${OUT}.json"
