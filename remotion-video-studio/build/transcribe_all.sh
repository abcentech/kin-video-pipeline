#!/bin/zsh
set -e

cd "/Users/mac/Documents/video raw/remotion-video-studio"

echo "Transcribing j22_s4..."
../.claude/skills/video-to-short/scripts/transcribe_words.sh public/cine_j22_s4.mp4 build/j22_s4 "/Users/mac/Documents/video raw/models/ggml-large-v3-turbo-q5_0.bin"
node ../.claude/skills/video-to-short/scripts/build_captions.mjs build/j22_s4.json src/captions/j22_s4.json

echo "Transcribing j22_s5..."
../.claude/skills/video-to-short/scripts/transcribe_words.sh public/cine_j22_s5.mp4 build/j22_s5 "/Users/mac/Documents/video raw/models/ggml-large-v3-turbo-q5_0.bin"
node ../.claude/skills/video-to-short/scripts/build_captions.mjs build/j22_s5.json src/captions/j22_s5.json

echo "Transcribing j22_s6..."
../.claude/skills/video-to-short/scripts/transcribe_words.sh public/cine_j22_s6.mp4 build/j22_s6 "/Users/mac/Documents/video raw/models/ggml-large-v3-turbo-q5_0.bin"
node ../.claude/skills/video-to-short/scripts/build_captions.mjs build/j22_s6.json src/captions/j22_s6.json

echo "Wiring up remotion..."
node ../.claude/skills/video-to-short/scripts/make_root.mjs build/shorts.json src/Root.tsx
