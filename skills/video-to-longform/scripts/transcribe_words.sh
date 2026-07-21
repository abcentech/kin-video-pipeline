#!/bin/zsh
# Word-level transcription of a clip with whisper.cpp large-v3-turbo.
# Usage: transcribe_words.sh <clip.mp4> <outBasename> [model]
# Produces <outBasename>.json (whisper.cpp -oj format) next to where you point it.
set -e
SRC="$1"; OUT="$2"
MODEL="${3:-$HOME/whisper-models/ggml-large-v3-turbo-q5_0.bin}"
[ -f "$MODEL" ] || { echo "Whisper model not found at $MODEL"; echo "Download: curl -L --http1.1 -o '$MODEL' https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin"; exit 1; }
WAV="${OUT}_16k.wav"
ffmpeg -y -i "$SRC" -ar 16000 -ac 1 -c:a pcm_s16le "$WAV" 2>/dev/null
whisper-cli -m "$MODEL" -f "$WAV" -ml 1 -sow -oj -of "$OUT" -l en -pp -t 8 2>&1 | tail -2
rm -f "$WAV"
echo "wrote ${OUT}.json"
