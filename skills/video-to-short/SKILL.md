---
name: video-to-short
description: >-
  Turn any long video (talking-head, sermon, podcast, lecture, interview) into one or more
  vertical 9:16 viral Shorts with a cinematic look, clean denoised audio, a climactic music
  bed, big kinetic captions, a branded animated intro, and a closing animation. Use this
  whenever the user wants to "make shorts", "cut clips", "turn this video into reels/TikToks/
  YouTube Shorts", "make viral clips from a video", add animated captions/subtitles to a
  vertical clip, or repurpose long-form footage into short social videos — even if they don't
  say the word "short". Produces editable caption JSON so the user can fix mis-heard words
  themselves, and a Remotion Studio they can open to preview/edit.
---

# video-to-short

Convert a long source video into polished vertical Shorts. The pipeline is deliberately split
into small, re-runnable steps so a person can fix any stage (especially the captions) without
redoing everything.

## Standard recipe (apply to EVERY short — not optional)
These four are the baseline quality bar; bake them into every cut:
1. **Sharp hook + 1–2 B-roll insert cards.** The `hook` is the single most curiosity-provoking
   line of the clip in **2–5 punchy words**. Add 1–2 full-screen `inserts` (scripture ref / key
   phrase, 4–6s each) on the emotional beats. (See `inserts` schema in step 5.)
2. **Hand-corrected per-clip captions.** Always transcribe the CUT clip word-level (never reuse
   the full-file transcript) and read through `w` to fix mis-hears; set `emp:true` on the
   theme/emotional words so they pop gold. (`build_captions.mjs` auto-flags common ones.)
3. **Motion + cinematic finish.** The renderer already does a slow push-in + emphasis/rhythmic/
   payoff punch-zooms + camera shake; set `payoffSec` to the punchline frame so the zoom hit and
   music duck land on it. Add a climactic music bed (`cine_music.sh`, climax = the payoff).
   When the source is an **already-graded long-form** (`lf_*.mp4`), cut with `build/clip_vert.sh`
   (crop-only 9:16, drops the baked caption band, cleans audio) — NOT `cinematic.sh` (would
   double-grade).
4. **Strong end-loop CTA.** `EndCardLoop` rides the last ~2.3s: it echoes the opening `hook` for
   rewatches + animated Subscribe + channel chips. Keep `intro:0/closing:0` so it isn't pushed
   past the clip (see gotchas).

## Brand assets (mandatory — do not improvise)
- **Use the wordmark logo ON FILE — `kin_logo_full.png` — and NOTHING else.** Every logo on the
  short (top-corner watermark, the Subscribe lower-third, and the end-card) renders
  `public/kin_logo_full.png` (the gold emblem + "KIDS INSPIRING NATION" wordmark, transparent;
  same logo as the long-form). Size it by `height` with `width:"auto"` (≈2.35:1 aspect) so the
  text stays legible — never the emblem-only `logoIcon.svg`/`logoLight.svg`. NEVER generate,
  redraw, or substitute a logo unless the user *explicitly* says to generate one. If the project
  lacks it, copy `assets/kin_logo_full.png` into `public/` first.
- **End-card channel chips use REAL platform icons, NEVER emoji.** Each `channel` carries an
  `icon` (path under `public/`) shown white inside a brand-colored circle — not a `glyph`.
  The icons are bundled in `assets/icons/` (`youtube/instagram/telegram/facebook/web.svg`,
  white fills from simple-icons + a globe); copy them into `public/icons/`. To add a platform,
  download its white SVG (`curl -sL https://cdn.simpleicons.org/<slug>/white -o public/icons/<slug>.svg`)
  and reference it as `icon`. `glyph` (emoji) is only a legacy fallback.
- **Website chip label = `KidsInspiringNation.org`** (the `web.svg` globe icon), handle = `@KidsInspiringNation`.

## FINAL-APPROVAL GATE (hard rule — do not skip)
After clips are cut + captioned and hook/inserts/music/payoff are set, **STOP and present a
per-short summary** (id, hook line, in/out timestamps + duration, the gold emphasis words, insert
cards, music-climax second) and **wait for an explicit "go"** before running ANY
`npx remotion render`. If the user changes a hook/word/timestamp, revise and re-show. Validate
stills (hook frame, an insert frame, end-loop frame) before the full renders.

## What each short contains
1. **Branded hook intro** (~3.4s): logo + a per-short **HOOK headline** (e.g. "GROWTH
   DISAPPEARED", "THE FRAGRANCE OF JESUS' TOUCH") + a **"SUBSCRIBE ON ALL CHANNELS"** row of
   emoji chips (YouTube ▶️, Instagram 📸, Telegram ✈️, Facebook 👍, Website 🌐) + @handle,
   with animated rays. The hook is set per short; it should be the single most curiosity-
   provoking line of that clip, in 2-5 punchy words.
2. **Cinematic clip**: center-cropped 9:16, filmic color grade, denoised/normalized audio,
   slow push-in + emphasis punch-zooms, a climactic music bed, big kinetic captions
   (gold emphasis words, active-word highlight + underline), watermark, progress bar, and a
   pulsing Subscribe lower-third.
3. **Closing animation**: a branded outro clip (`assets/closing_9x16.mp4`).

## Prerequisites (check once)
- **ffmpeg** on PATH (`ffmpeg -version`).
- **whisper-cli** (whisper.cpp) on PATH (`which whisper-cli`; `brew install whisper-cpp`).
- **Whisper model** `ggml-large-v3-turbo-q5_0.bin`. Default location `~/whisper-models/`.
  Download (use `--http1.1`; the HF CDN stalls on HTTP/2):
  `curl -L --http1.1 -o ~/whisper-models/ggml-large-v3-turbo-q5_0.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin`
- **Node 20+** for Remotion (Node 22+ only if you also use HyperFrames).
- A **Remotion project**. Reuse an existing one if present, else scaffold from `templates/`
  (see "Set up the Remotion project").

This skill bundles: `scripts/` (the pipeline), `templates/` (Remotion `Short.tsx`, configs),
and `assets/` (logos + default closing). Reference them by absolute path from the skill dir.

## Workflow

Work in a project folder containing the source video. Create a `build/` scratch dir.

### 1. Pick the viral moments
Get a transcript to choose clips. For a quick read, transcribe the whole audio once
(extract `ffmpeg -i SRC -ar 16000 -ac 1 audio.wav`, then `whisper-cli -m MODEL -f audio.wav
-otxt -oj -of build/full`). Read `build/full.txt` with timestamps and choose 1–4
self-contained moments with a hook + payoff. Aim for **≥60s each** if the user wants longer
shorts. Note each clip's `start` (seconds) and `duration`.

Strong clips = a curiosity hook, a vivid story/testimony, a punchy quotable line, or an
emotional/prophetic close. Avoid rambling or filler.

### 2. Build the cinematic base (per clip)
```
scripts/cinematic.sh <SRC> <start> <dur> <name>   # -> <remotion>/public/<name>.mp4
```
Center-crops to 1080×1920, applies the filmic grade, and denoises + normalizes audio
(removes background noise, fixes clipping). Output goes straight into the Remotion
`public/` folder.

### 3. Caption it (per clip) — this is the editable part
```
scripts/transcribe_words.sh <remotion>/public/<name>.mp4 build/<name>      # whisper word-level
node scripts/build_captions.mjs build/<name>.json <remotion>/src/captions/<short>.json [emphasisCSV]
```
`build_captions.mjs` writes pretty-printed JSON: `{ "words":[{ "w","start","end","emp" }] }`.
**The user edits `w` to fix mis-heard words** (whisper turbo sometimes errs, e.g. "touch"→
"torch"); set `emp:true` to make a word a big gold emphasis word. Timings stay intact.
Pass an emphasis CSV to tune which words pop for this video's theme.

### 4. Build the music bed (per clip)
```
scripts/cine_music.sh <dur> <climaxSeconds> <remotion>/public/<music>.mp3
```
A cinematic minor-key progression that swells into `climaxSeconds` (set it to the clip's
emotional peak). Replace with a licensed track by dropping your own mp3 in `public/`.

### 5. Wire up Remotion and render
Create `build/shorts.json` describing the shorts (note `hook` per short, and optional
`channels`), then generate the root:
```json
{ "handle": "@YourChannel", "intro": 3.4, "closing": 4.43,
  "channels": [ {"icon":"icons/youtube.svg","label":"YouTube","color":"#FF0033"},
                {"icon":"icons/instagram.svg","label":"Instagram","color":"#E1306C"},
                {"icon":"icons/telegram.svg","label":"Telegram","color":"#229ED9"},
                {"icon":"icons/facebook.svg","label":"Facebook","color":"#1877F2"},
                {"icon":"icons/web.svg","label":"KidsInspiringNation.org","color":"#FFC500"} ],
  "shorts": [ { "id":"Short1","video":"cine_s1.mp4","music":"music_s1.mp3","clip":69,
                "captions":"short1.json","hook":"GROWTH DISAPPEARED",
                "inserts":[ {"start":22,"end":28,"title":"MATTHEW 8:3","sub":"“Be thou clean”","emoji":"📖"} ] } ] }
```
`channels` is optional (sensible default provided). Pick each `hook` from the clip's strongest
line. Long hooks auto-shrink to fit.

**B-roll insert cards** (`inserts`, optional): full-screen animated cutaway cards (scripture
ref, key phrase) that drop in over the clip at `start`–`end` (clip-relative seconds) to drive
home the point — use these when the source is a single talking-head shot with no footage
variety to Ken-Burns over. Each: `{ start, end, title, sub?, emoji? }`. Keep them 4–6s, 1–2 per
short, placed on the emotional beats. Title auto-shrinks for long lines.
```
node scripts/make_root.mjs build/shorts.json <remotion>/src/Root.tsx
cd <remotion> && npx remotion render Short1 ../out/Short1.mp4   # repeat per id
```
`clip` is the cinematic clip's duration in seconds (from `ffprobe`). Total short length =
intro + clip + closing.

### 6. Let the user edit (important)
Start Studio so they can preview and tweak:
```
cd <remotion> && npm run studio    # http://localhost:3000
```
Captions live in `<remotion>/src/captions/*.json` — Studio live-reloads on save. Tell the
user that's where they fix the lyrics/wording. Re-render after edits.

## Set up the Remotion project (only if none exists)
```
mkdir my-shorts && cd my-shorts
cp <skill>/templates/package.json <skill>/templates/tsconfig.json <skill>/templates/remotion.config.ts .
mkdir -p src/captions public
cp <skill>/templates/src/Short.tsx <skill>/templates/src/index.ts src/
cp <skill>/assets/logoIcon.svg <skill>/assets/logoLight.svg <skill>/assets/closing_9x16.mp4 public/
npm install
```
`Short.tsx` is the renderer (intro + captions + clip + closing); `make_root.mjs` writes
`src/Root.tsx`. Swap `assets/` logos + closing to re-brand for a different channel.

## Music-video source (e.g. a `video-music-3d` movie)

### ONE COMMAND
```
node scripts/make_music_shorts.mjs <spec.json>        # add --no-render to build clips only
```
Does the whole music-video shorts pipeline: silent bed → crop/fill each short (single beat OR
multi-beat teaser concat) → empty captions → config with `intro/closing:0` → `make_root` →
optional `ensureRoot` hook → render each id to `out/`. Spec (paths relative to CWD):
```json
{ "src":"out/he_stood_up_16x9.mp4", "remotion":"remotion-video-studio",
  "ensureRoot":"skills/video-music-3d/scripts/ensure_root.mjs", "handle":"@KidsInspiringNation",
  "framing":"crop",
  "shorts":[
    {"id":"HsuMiracle","hook":"HE STOOD UP","beats":[{"ss":128,"dur":50}]},
    {"id":"HsuTeaser","hook":"WATCH HIM WALK","cuts":"hard",
     "beats":[{"ss":24,"dur":6},{"ss":78,"dur":7},{"ss":150,"dur":7},{"ss":166,"dur":6},{"ss":186,"dur":7}]} ] }
```
`framing`: `crop` (default) | `fill`, per-short override. `cuts`: `hard` (default) | `fade`.
1+ `beats` per short (one = single clip, many = montage). `ensureRoot`/`channels` optional. `id`s:
letters/digits/hyphen only. Reference run: `build/music_shorts_hsu.json`. The manual breakdown
below is what this script automates:

When the source is an **already-graded music video** that carries its own song + burned-in
karaoke (not raw talking-head footage), adapt the pipeline so nothing fights the song or
doubles the captions:
1. **Crop with `scripts/cinematic_musicvideo.sh`**, not `cinematic.sh` — center-crop + scale
   ONLY (no second grade, no `afftdn` denoise; audio = `loudnorm`, song preserved).
2. **Empty captions** — write `{ "words": [] }` per short so the kinetic captions don't collide
   with the existing burned-in karaoke (`Captions`/`buildPages` render nothing on `[]`).
3. **Silent music bed** — set each short's `music` to a `silent.mp3`
   (`ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 60 public/silent.mp3`) so the clip's own
   song audio leads and the 0.16 music layer adds nothing.
4. **Condensed teaser** — to montage several beats into one short, crop each beat then `concat`
   them into one clip file; hard cuts read as punchy/trailer, short cross-fades as cinematic.
5. **Framing trade-off** — center-crop (608-wide of 1920) is immersive but drops the left/right
   edges; for wide crowd beats use full-frame-on-blurred-fill instead:
   `[0:v]split=2[bg][fg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=40[bg2];[fg]scale=1080:-1[fg2];[bg2][fg2]overlay=(W-w)/2:(H-h)/2`.
6. **Watermark**: the source's own bottom-center wordmark survives a center crop (faint, fine);
   the source's top-right logo is cropped out and replaced by the short's own watermark.

First real run: 3 shorts off `out/he_stood_up_16x9.mp4` ("He Stood Up") — `HsuMiracle`,
`HsuMinistry`, `HsuTeaser` — config `build/shorts_hsu.json`.

## Notes & gotchas
- **`intro`/`closing` MUST be 0 for the hook-first `Short.tsx`.** The shipped renderer has NO
  pre-roll intro and NO appended closing clip — `HookBanner` rides frame 1 and `EndCardLoop`
  (Subscribe + channels + hook echo) overlays the last ~2.3s of the clip itself.
  `durationInFrames = (intro + clip + closing)*fps`, so leaving the old `intro:3.4`/`closing:4.43`
  in `shorts.json` pads the comp ~7.8s **beyond** the clip → the video **freezes on its last
  frame** for those seconds before the end-card shows. Set `"intro":0,"closing":0` so the
  timeline equals the clip. (`closing_9x16.mp4` + the `introSeconds`/`closingSeconds` schema
  fields are legacy/unused by this renderer.)
- **Already-captioned/branded source?** Burned-in captions can't be removed by overlay. The
  grade darkens a bottom mask, but for a clean caption override you need a caption-free export
  of the source. Flag this to the user. (For a music video, embrace the existing karaoke and use
  empty captions — see "Music-video source" above.)
- **Whisper accuracy**: always offer the editable caption JSON; niche/proper nouns get mis-heard.
- **Flaky CDN/DNS**: model download stalls on HTTP/2 — always use `curl --http1.1 -C -`.
- **Re-branding**: replace the three files in `public/` (logos + closing) and set `handle`.
