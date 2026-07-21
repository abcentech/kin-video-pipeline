#!/bin/zsh
# Download the ML models the pipeline needs (kept out of git — too large).
# Run once after cloning:  zsh scripts/fetch_models.sh
set -e
cd "$(dirname "$0")/.."
mkdir -p models

WHISPER="models/ggml-large-v3-turbo-q5_0.bin"
if [ ! -f "$WHISPER" ]; then
  echo "==> Downloading whisper large-v3-turbo (q5_0, ~574MB)..."
  curl -L --fail -o "$WHISPER" \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin"
else
  echo "==> whisper model already present."
fi

DEPTH="models/depth_anything_v2_small_q.onnx"
if [ ! -f "$DEPTH" ]; then
  echo "==> Depth Anything V2 (small, quantized ONNX, ~27MB) needed for photographic 2.5D b-roll."
  echo "    Only required for the video-pixar-teaching / Depth3D path (designed-slide episodes don't need it)."
  echo "    Download depth_anything_v2_small_q.onnx from a Depth-Anything-V2 ONNX release and place it in models/."
else
  echo "==> depth model already present."
fi
echo "==> Models ready."
