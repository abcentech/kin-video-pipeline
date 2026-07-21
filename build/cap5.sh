#!/bin/zsh
cd "/Users/mac/Documents/video raw"
export PATH="/Users/mac/.nvm/versions/node/v24.14.1/bin:$PATH"
SRC="/Users/mac/Documents/video raw/Jun 22-26"
MODEL="models/ggml-large-v3-turbo-q5_0.bin"
for v in Jun22 Jun23 Jun24 Jun25 Jun26; do
  CAP="remotion-video-studio/src/captions/${v}.json"
  if [ -f "$CAP" ]; then echo "<<<< $v already done, skip"; continue; fi
  echo ">>>> $v START $(date +%H:%M:%S)"
  WAV="build/jun22-26/${v}.wav"
  if [ ! -s "$WAV" ]; then ffmpeg -y -i "$SRC/$v.mp4" -ar 16000 -ac 1 -c:a pcm_s16le "$WAV" 2>/dev/null; fi
  echo "   wav ready $(date +%H:%M:%S) size=$(stat -f%z "$WAV")"
  whisper-cli -m "$MODEL" -f "$WAV" -ml 1 -sow -oj -otxt -of "build/jun22-26/${v}" -l en -pp -t 8 >"build/jun22-26/${v}.whlog" 2>&1
  if [ -s "build/jun22-26/${v}.json" ]; then
    node .claude/skills/video-to-short/scripts/build_captions.mjs "build/jun22-26/${v}.json" "$CAP"
    rm -f "$WAV"
    echo "<<<< $v DONE $(date +%H:%M:%S)"
  else
    echo "!!!! $v whisper FAILED — see ${v}.whlog"
  fi
done
echo CAP5ALLDONE
