#!/bin/zsh
# Full segment-level transcript for clip selection.
# Usage: build/whisper_full.sh <audio.mp3> <outname>
set -e
cd "$(dirname "$0")/.."
SRC="$1"; NAME="${2:-full}"
MODEL="${WHISPER_MODEL:-models/ggml-large-v3-turbo-q5_0.bin}"
WAV="build/audio/${NAME}_16k.wav"
ffmpeg -y -i "$SRC" -ar 16000 -ac 1 -c:a pcm_s16le "$WAV" 2>/dev/null
# segment-level json + plain text with timestamps
whisper-cli -m "$MODEL" -f "$WAV" -oj -otxt -of "build/transcripts/${NAME}" -l en -pp -t 8 2>&1 | tail -5
echo "wrote build/transcripts/${NAME}.json / .txt"
