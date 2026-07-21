#!/bin/zsh
# Build 16 shorts = 8 moments × {crop, letterbox(fill)} from already-graded lf_*.mp4.
# Spec: build/shorts16_spec.json (array "moments"): each
#   { base, lf, ss, dur, hook, payoff, emph(CSV), capYfill }
# Per moment: cut crop (<base>C) + fill (<base>F), transcribe the CROP clip word-level
# once (shared captions), build captions/<base>.json with emphasis, make one music bed.
# Then emit build/shorts16.json (16 entries) and (unless --no-render) make_root + render.
set -e
ROOT="/Users/mac/Documents/video raw"
cd "$ROOT"
export PATH=/usr/local/bin:/Users/mac/.nvm/versions/node/v24.14.1/bin:$PATH
SPEC="build/shorts16_spec.json"
PUB="remotion-video-studio/public"
CAP="remotion-video-studio/src/captions"
M="models/ggml-large-v3-turbo-q5_0.bin"
SKILL=".claude/skills/video-to-short/scripts"

STAGE="${1:-all}"   # all | cut | render

python3 - "$SPEC" <<'PY' > /tmp/_moments.tsv
import json,sys
d=json.load(open(sys.argv[1]))
for m in d["moments"]:
    print("\t".join(str(m.get(k,"")) for k in ("base","lf","ss","dur","hook","payoff","emph","capYfill")))
PY

if [ "$STAGE" = "all" ] || [ "$STAGE" = "cut" ]; then
  while IFS=$'\t' read -r base lf ss dur hook payoff emph capy <&3; do
    [ -z "$base" ] && continue
    echo "── $base  ($lf  ss=$ss dur=$dur) ──"
    SRC="$ROOT/longform-studio/public/${lf}.mp4"
    # 1) generous cut (target+7s) just to transcribe & find the sentence boundary
    GEN=$((dur + 7))
    zsh build/clip_vert.sh "$SRC" "$ss" "$GEN" "${base}C" >/dev/null
    ffmpeg -i "$PUB/${base}C.mp4" -ar 16000 -ac 1 "build/${base}.wav" -y >/dev/null 2>&1
    whisper-cli -m "$M" -f "build/${base}.wav" -oj -of "build/${base}" -ml 1 -sow >/dev/null 2>&1
    # 2) final dur = end of the last sentence-ending word at/under the target (+0.4s tail)
    FINAL=$(python3 - "build/${base}.json" "$dur" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); target=float(sys.argv[2])
end=None
for seg in d.get("transcription",[]):
    w=seg.get("text","").strip()
    e=seg["offsets"]["to"]/1000.0
    if e<=target+2.5 and w and w[-1] in ".!?":
        end=e
if end is None:  # fallback: last word at/under target
    for seg in d.get("transcription",[]):
        e=seg["offsets"]["to"]/1000.0
        if e<=target: end=e
print(round((end if end else target)+0.4,2))
PY
)
    echo "   $base: target ${dur}s -> sentence-complete ${FINAL}s"
    # 3) re-cut crop + fill to the exact sentence-complete length, re-transcribe, caption, music
    zsh build/clip_vert.sh "$SRC" "$ss" "$FINAL" "${base}C" >/dev/null
    zsh build/clip_fill.sh "$SRC" "$ss" "$FINAL" "${base}F" >/dev/null
    ffmpeg -i "$PUB/${base}C.mp4" -ar 16000 -ac 1 "build/${base}.wav" -y >/dev/null 2>&1
    whisper-cli -m "$M" -f "build/${base}.wav" -oj -of "build/${base}" -ml 1 -sow >/dev/null 2>&1
    node "$SKILL/build_captions.mjs" "build/${base}.json" "$CAP/${base}.json" "$emph" >/dev/null
    zsh build/cine_music.sh "$FINAL" "$payoff" "$PUB/music_${base}.mp3" >/dev/null 2>&1
    echo "$base\t$FINAL" >> /tmp/_finaldurs.tsv
    echo "   cut+caption+music done for $base (${FINAL}s)"
  done 3< /tmp/_moments.tsv
fi

# emit 16-entry config (using the sentence-snapped final durations)
python3 - "$SPEC" <<'PY'
import json,sys,os
d=json.load(open(sys.argv[1]))
fin={}
if os.path.exists("/tmp/_finaldurs.tsv"):
    for line in open("/tmp/_finaldurs.tsv"):
        if "\t" in line:
            b,v=line.strip().split("\t"); fin[b]=float(v)
chan=[{"icon":"icons/youtube.svg","label":"YouTube","color":"#FF0033"},
      {"icon":"icons/instagram.svg","label":"Instagram","color":"#E1306C"},
      {"icon":"icons/telegram.svg","label":"Telegram","color":"#229ED9"},
      {"icon":"icons/facebook.svg","label":"Facebook","color":"#1877F2"},
      {"icon":"icons/web.svg","label":"KidsInspiringNation.org","color":"#FFC500"}]
shorts=[]
for m in d["moments"]:
    b=m["base"]; dur=fin.get(b, m["dur"])
    common=dict(music=f"music_{b}.mp3", clip=dur, captions=f"{b}.json",
                hook=m["hook"], payoffSec=m.get("payoff"))
    shorts.append(dict(id=f"{b}C", video=f"{b}C.mp4", **common))                       # crop
    shorts.append(dict(id=f"{b}F", video=f"{b}F.mp4", capY=m.get("capYfill","70%"), **common))  # letterbox
out=dict(handle="@KidsInspiringNation", intro=0, closing=0, channels=chan, shorts=shorts)
json.dump(out, open("build/shorts16.json","w"), indent=2, ensure_ascii=False)
print(f"wrote build/shorts16.json with {len(shorts)} shorts")
PY

echo "spec -> 16-entry config ready."
