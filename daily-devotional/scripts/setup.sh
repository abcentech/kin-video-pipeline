#!/usr/bin/env bash
# One-time setup (macOS / Linux). Run from anywhere:  bash scripts/setup.sh
# It installs npm + python packages and creates december/config.local.json.
# It does NOT download whisper.cpp, the whisper model, the matte model or the sample library:
# it prints the steps for those at the end.
set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
bad=0

echo "==> Prerequisites"
if command -v node >/dev/null; then
  major=$(node -p "process.versions.node.split('.')[0]")
  [ "$major" -ge 20 ] && echo "  node $(node -v) ok" || { echo "  ! node 20+ needed (found $(node -v))"; bad=1; }
else echo "  ! node missing (need 20+)"; bad=1; fi
command -v ffmpeg >/dev/null && echo "  ffmpeg ok" || { echo "  ! ffmpeg missing (brew install ffmpeg / apt install ffmpeg)"; bad=1; }
command -v ffprobe >/dev/null || { echo "  ! ffprobe missing (ships with ffmpeg)"; bad=1; }
PYBIN=""
for c in python3.12 python3.11 python3; do
  if command -v "$c" >/dev/null; then
    v=$("$c" -c 'import sys; print("%d.%d" % sys.version_info[:2])')
    if [ "$v" = "3.11" ] || [ "$v" = "3.12" ]; then PYBIN="$c"; break; fi
  fi
done
[ -n "$PYBIN" ] && echo "  python $($PYBIN --version) ok" || { echo "  ! python 3.11 or 3.12 missing"; bad=1; }
[ "$bad" = 1 ] && { echo "Fix the items marked ! and run this again."; exit 1; }

echo "==> npm dependencies"
npm install
( cd tools/matte && npm install )

echo "==> Python environment (studio/.venv)"
[ -d studio/.venv ] || "$PYBIN" -m venv studio/.venv
studio/.venv/bin/python -m pip install --upgrade pip
studio/.venv/bin/python -m pip install -r requirements.txt

echo "==> Local config"
if [ ! -f december/config.local.json ]; then
  cp december/config.example.json december/config.local.json
  echo "  created december/config.local.json: edit the paths in it (recordings folder, guide, film master, whisper)."
else echo "  december/config.local.json already exists"; fi
mkdir -p inbox assets december-public/outro

cat <<MSG

==> Setup finished. Still to do by hand (nothing below was done for you):

1. whisper.cpp (speech to words)
   - Get a build of whisper.cpp: https://github.com/ggml-org/whisper.cpp
     (build it: cmake -B build && cmake --build build -j --config Release; the binary is build/bin/whisper-cli)
   - Model file ggml-large-v3-turbo-q5_0.bin from https://huggingface.co/ggerganov/whisper.cpp
   - Put them at tools/whisper/whisper-cli and tools/whisper/ggml-large-v3-turbo-q5_0.bin,
     or set "whisperExe" and "whisperModel" in december/config.local.json.

2. Presenter matte model (trailer cut-outs, tools/matte/rvm.mjs)
   - The file must be: tools/matte/models/rvm_mobilenetv3_fp32.onnx
     (Robust Video Matting, MobileNetV3, fp32 ONNX). The code documents no download address:
     supply it yourself.

3. Orchestral sample library for the sound stage (CC0, about 1.1 GB, downloaded from GitHub)
   - $ROOT/studio/.venv/bin/python -I scripts/viral/studio/fetch_samples.py
   - Files land in studio/samples/. Run it only when you are ready for the download.

4. Assets you supply (not in this repo)
   - Recordings: Day_<N>.mp4 in the "inbox" folder (or set "inbox").
   - The teaching guide HTML and the picture-film master (set "guide", "filmMaster").
   - december-public/outro/LikeShare_16x9.mp4 and LikeShare_9x16.mp4 (the like/share sign-off, about 21 MB).
   - Optional: the OpenAI Codex CLI ("codex") for generated illustrations; without it, put your own
     plates in december-public/dayNN/art/ (see README.md).

Then:  npm run selftest   (compiler self-test, needs no media)
MSG
