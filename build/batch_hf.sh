#!/bin/zsh
export PATH="/Users/mac/.nvm/versions/node/v24.14.1/bin:$PATH"
cd "/Users/mac/Documents/video raw"
declare -a JOBS=("s2:cine_s2.json:cine_s2.mp4:voice_s2.m4a:music_s2.mp3:75:FIHT2_hf" \
                 "s3:cine_s3.json:cine_s3.mp4:voice_s3.m4a:music_s3.mp3:78:FIHT3_hf" \
                 "s4:cine_s4.json:cine_s4.mp4:voice_s4.m4a:music_s4.mp3:78:FIHT4_hf")
for j in "${JOBS[@]}"; do
  IFS=: read tag wj vid voice mus dur out <<< "$j"
  echo ">>>> BUILD $tag"
  node build/make_hf.mjs "build/transcripts/$wj" "$vid" "$voice" "$mus" "$dur"
  cd hf; rm -rf renders
  npx --yes hyperframes@0.6.115 render >/tmp/hf_$tag.log 2>&1
  cd ..
  newest=$(ls -t hf/renders/*.mp4 2>/dev/null | head -1)
  cp "$newest" "shorts/$out.mp4" && echo ">>>> DONE $out $(ls -la shorts/$out.mp4 | awk '{print $5}')"
done
echo "BATCHALLDONE"
