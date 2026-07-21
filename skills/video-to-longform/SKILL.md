---
name: video-to-longform
description: >-
  Turn a long talking-head video (sermon, devotional, lecture, podcast) into a
  polished, edited LONG-FORM video: a cinematic color grade, the talk broken
  into scenes with transitions, animated section titles and on-screen teaching
  "points" (kinetic lower-thirds + scripture chips), and per-scene images that
  drive home the point (Gemini-generated, with animated motion-graphic cards as
  a fallback) Ken-Burns-animated as insets. Use whenever the user wants to
  "edit the main video", "edit a full video", "break it into scenes", "animate
  the points on screen", "add transitions", or "generate images that drive home
  the point" for a long video (as opposed to short vertical clips — for those use
  video-to-short). Also handles a RAW shoot end-to-end: trim+grade+vocal-clean,
  burned-in word-for-word karaoke captions from an edited SRT, a slide deck (PDF) as
  full-screen 2.5D-depth b-roll cutaways, scripture verse reveals, and intro/outro
  stitching. Produces an editable scenes JSON + a Remotion Studio.
---

# video-to-longform

Edit a full-length landscape (16:9) talk into a watchable, animated long-form video.
The pipeline is split into re-runnable steps so a human can fix any stage (scene
text/timing, captions, images) without redoing everything.

## RAW source → full edit (the BEAST pipeline)
When the source is a **raw shoot** (no grade, no burned-in captions, no cards) and the
user supplies an edited **SRT** + a **slide deck (PDF)** of designed visuals, build it
end-to-end like a cinematographer/producer/director. Proven on "Long Life: The Covenant
of God's Blessing" (Jul 3). Steps:

1. **Trim + grade + BEAST audio in one pass.** Prefer **`scripts/trim_smooth.py <src> <out/lf_x.mp4>
   <drops.json> [rnnoise.rnnn]`** (the human-cut path) over the older `scripts/grade_trim.sh`.
   `drops.json` lists `[start,end]` second ranges of **verbatim repeats + dead air** to cut
   (speakers often repeat whole lines; keep the FIRST utterance). `trim_smooth.py`:
   - **snaps every cut to real silence** (`silencedetect`) so cuts land between sentences, and
   - **joins segments with a soft cross-dissolve** (`xfade=fade`, ~0.28 s) instead of a hard
     jump-cut, so the talking head never "skips" — while **preserving the timeline** (each segment
     starts D earlier and xfades over D, so the caption remap stays valid). It writes
     `<drops>.snapped.json` — **feed THAT** to `srt_to_words.mjs` and your scene retime.
   - bakes the grade. **HOUSE GRADE = Teal & Orange (locked Jul 11 2026 — use for EVERY
     KidsInspiring video; don't re-offer options).** Swap the grade `VF` for this chain (carries
     its own halation, no separate bloom; `unsharp` matrix must be ODD):
     `hqdn3d=3:2:3:3,eq=contrast=1.08:saturation=1.14:gamma=1.03,curves=all='0/0.02 0.25/0.20 0.5/0.5 0.75/0.80 1/0.98',colorbalance=rs=-0.06:gs=0.02:bs=0.06:rm=-0.02:bm=0.02:rh=0.07:gh=0.01:bh=-0.07,split=2[b][h];[h]curves=all='0/0 0.65/0 1/0.9',gblur=sigma=14[g];[b][g]blend=all_mode=screen:all_opacity=0.16,noise=alls=4:allf=t,vignette=PI/8,unsharp=5:5:0.5`
     — teal-cooled shadows, warm-orange skin/highlights (supersedes the old soft-warm bright grade).
     Plus a **gentle voice-isolation chain**: highpass 85 → **AI RNNoise
     (`arnndn`, needs a small `.rnnn` model)** → de-mud 200 Hz → +2 dB @3 kHz → de-ess → light
     compress → −14 LUFS. **RNNoise alone does the denoise — do NOT stack `afftdn nf=-30` + `anlmdn`
     on top**: that gates quiet speech AS noise and destroys the voice (RMS drops −13→−40 dB, and
     loudnorm then can't reach target). If no RNNoise model, fall back to a MILD `afftdn nf=-25:nr=12`.
   - dense keyframes (`-g 30`) so Remotion's `OffthreadVideo` seeks fast (sparse keyframes time out).
   Grab a model once: `curl -sL -o rnnoise/std.rnnn https://raw.githubusercontent.com/GregorR/rnnoise-models/master/somnolent-hogwash-2018-09-01/sh.rnnn`.
2. **Karaoke captions from the SRT** (NOT whisper — honor the edited text):
   `node scripts/srt_to_words.mjs <in.srt> <project>/src/captions/<name>.json [drops.json] [corrections.json] [empCSV]`.
   Distributes each cue's time across its words, **remaps onto the trimmed timeline** using the
   same `drops.json`, flags theme words gold, and applies a `corrections.json` for transcription
   mis-hears (e.g. `{"Kittin's":"Kids","Paranasians":"Inspiring Nation"}`). These become the
   `captions` prop → a burned-in **`BodyCaptions`** band: small text on a **transparent-black pill**
   (`rgba(0,0,0,0.55)`, hugs the text, `bottom:12` — sits directly on the progress slider), white
   words with **gold** for the active/emphasis word. Captions are **always on** — `captionHidden`
   only suppresses them for true full-screen takeovers (opening hook / recap / outro); they stay
   visible under point cards, scripture cards, teasers and slide cutaways because those all render
   in the lower-third ABOVE the pill (`bottom:180`+), never on top of it. A user complaint
   ("captions aren't showing when another text is on it") came from the old auto-hide-under-cards
   logic — don't reintroduce it.
3. **Slide deck → full-screen b-roll cutaways** — `pdftoppm -png -r 130 deck.pdf <project>/public/<name>_slide`
   (needs poppler). The user's designed slides are the PRIMARY b-roll. Each gets a scene with
   `"image","full":true` → **`SlideKenBurns`** shows the WHOLE slide `objectFit:"contain"` (nothing
   cropped, no baked text lost) over a blurred, darkened cover-copy filling the letterbox, with a
   subtle non-distorting scale+drift. **Do NOT put a displacement-mesh 3D on designed slides — it
   warps the baked text and crops the edges** (a real user complaint). Reserve the mesh `Depth3D`
   for photographic b-roll only, opted in per scene with `"depth3d":true` + a `depth` map.
4. **Depth maps (photographic b-roll only)** — `skills/video-pixar-teaching/.venv/bin/python scripts/gen_depth.py <publicDir> [oneFile]`
   then `node scripts/link_depth.mjs <scenes.json> <publicDir>`. Only for scenes flagged
   `"depth3d":true`. NOTE: depth meshes render BLACK in `renderStill` (R3F single-frame quirk) but
   are correct in the real `remotion render` — verify with a short `--frames=A-B` segment, not a still.
5. **Scriptures on screen** — verses that have a designed slide become full-screen cutaways with
   a gold ref chip; verses without a slide use **`Scripture`** with `place:"lower"` (default) — a
   **lower-third card** (navy gradient + gold border, matches the point "market text" card,
   `bottom:188`, gold ref chip on top, serif verse ~46px) that sits above the caption pill without
   colliding. `place:"center"` keeps the old full-frame floating serif reveal for the rare
   full-screen-only verse. Set via `immersion.scriptures` (`immersion.enabled:true`,
   `grade/particles/sfx:false` so only the verse reveals mount — no double-grade).
6. **Re-hook teasers ("still ahead")** — add a top-level `teasers: [{at, text, label?}]` array so a
   "Still ahead: …" pill can appear in a talking-head GAP between scenes, not just inside one scene
   (`scene.teaser` still works for scene-bound teasing). Each renders as its own `<Sequence>` (same
   pattern as `keywords`), ~4.5–5s hold, top-center pill, gold eyebrow ("Still ahead" / override via
   `label`) + white tease text. A missing/invisible teaser usually means it was only wired to
   `scene.teaser` with no scene actually setting it — use the standalone array instead for gaps.
7. **"Stay to the end" (`OpenLoop`)** — compact single-line lower-third pill (solid navy `rgba(12,19,48,0.92)`
   + gold border, `bottom:250`, clear of any slide's baked title), fires once early in the body after
   the scene-split intro. Never park it at `top:*` — it will clash with a full-slide's centered baked title.
8. **Intro + outro** — render the branded animated intro (e.g. `PixarIntroShort16x9`, 30 fps) and
   reuse/​cut an outro clip; stitch with `scripts/assemble.sh <out.mp4> <intro|-> <body> <outro|->`
   (uniform re-encode so mixed fps/codecs join cleanly).

Schema additions used by this path (in `templates/LongForm.tsx`): `captions[]`, `scene.full`,
`scene.depth`, `immersion.scriptures[]`, `teasers[]`. Components: `BodyCaptions.tsx`, `Depth3D.tsx`,
`Scripture.tsx` (all in `templates/`). Layering bottom-to-top so nothing collides: caption pill
(`bottom:12`) → point/scripture lower-third cards (`bottom:180`/`188`) → OpenLoop pill (`bottom:250`)
→ teaser pill (`top:44`) → slide art.

## What the output contains
1. **Soft-warm-filmic landscape grade** of the full talk — gentle warmth, lifted soft
   blacks, natural skin (no orange), soft highlight bloom, fine grain, vignette +
   denoised/normalized audio. Fixed, repeatable look — `scripts/longform_grade.sh`.
2. **Scene structure**: the talk broken into ~8–14 topical scenes. Each scene has a
   `section` title, a teaching `point` (the ONE key takeaway — not a transcript), an
   optional scripture `ref`, an `emoji`, and an `imagePrompt`. Lives in
   `<project>/src/scenes/<name>.json` — fully editable.
3. **Key points only on screen** (NOT word-for-word captions/lyrics): a bold
   **section title** that sweeps in, and a **kinetic point lower-third** — the
   takeaway, words popping in one-by-one with a looping gold "scan" highlight +
   pulsing scripture chip. Capture & animate the important points, nothing more.
4. **Split-screen reveal per scene**: ~1s in, the video squeezes into the LEFT half
   (face reframed via `objectPosition` so it stays in view) while the scene visual
   fills the RIGHT half; holds ~2.6s, then animates back to full frame. The point
   lower-third shows after the split returns (they never overlap).
5. **Viral retention layers**: an animated **title hook** over the first ~3.4s;
   **punch-in zoom** at every scene start (pattern interrupt); **transition flash** +
   **whoosh** at each boundary.
6. Watermark + progress bar.

The whole on-screen system is one file — copy `templates/LongForm.tsx` into the
project's `src/` to reproduce all of the above (it reads `source`, `title`,
`handle`, `scenes` props). No captions/words file needed — points come from scenes.

## Prerequisites
- **ffmpeg** on PATH.
- **Node 20+**, a Remotion project (scaffold `longform-studio/` — copy package.json,
  tsconfig, remotion.config.ts from an existing Remotion project and symlink or
  install node_modules; share Remotion version).
- (Optional) a **Gemini API key** for scene images. Image generation needs quota /
  billing — the free tier 429s quickly. Without it, scenes fall back to motion-graphic
  cards automatically, so the video still renders fully.

## Workflow
1. **Grade the talk** (landscape, once):
   ```
   scripts/longform_grade.sh <src.mp4> <project>/public/lf_<name>.mp4
   ```
2. **Transcribe** for scene-picking only (reuse `transcribe_words.sh` +
   `build_captions.mjs`, or an existing master caption JSON with word-level
   `{w,start,end}`). Read it with timestamps to find topic shifts and pick scene
   boundaries + the one key `point` per scene. The transcript is NOT shown on screen.
3. **Author scenes** → `<project>/src/scenes/<name>.json`:
   ```json
   { "source":"lf_<name>.mp4", "title":"…", "handle":"@Channel",
     "scenes":[ {"start":0,"end":39,"section":"…","point":"…","ref":"Matthew 8:2",
                 "emoji":"🙏","imagePrompt":"Cinematic painterly illustration: …, no text, 16:9"} ] }
   ```
   Pick scene boundaries on topic shifts / pauses; keep scenes ~25–70s. The `point` is
   the one-line takeaway shown on screen. Write vivid, literal `imagePrompt`s ("no text").
4. **Generate scene images** (optional, needs Gemini quota):
   ```
   GKEY=<key> node scripts/gen_scene_images.mjs <project>/src/scenes/<name>.json
   ```
   Resumable; writes `image` into each scene. On 429/error the scene falls back to a
   motion-graphic card. Models tried: gemini-2.5-flash-image → gemini-3.1-flash-image.
5. **Drop in the renderer**: copy `templates/LongForm.tsx` → `<project>/src/`. In
   `Root.tsx` import the scenes JSON and pass `defaultProps={{ ...scenes }}` to one
   `<Composition>` (1920×1080, duration = last scene `end` × fps). Preview in Studio
   (`npm run studio`), then `npx remotion render <id> ../out/<name>_long.mp4`
   (use Node 24+ on PATH; run in background — a 7–8 min talk is ~14k frames).

## Editing (the human-in-the-loop part)
- **Scene timing / titles / points / refs**: edit `src/scenes/<name>.json` (Studio
  live-reloads). The `point` is the one key takeaway shown — keep it short.
- **Swap an image**: drop a file in `public/` and set the scene's `image`.
- **Tunables in `LongForm.tsx`**: `SP_IN`/`SP_HOLD`/`SP_OUT` (split-screen timing),
  `objX` in `Stage` (how far the face is pushed right to stay in the left panel).

## Notes & gotchas
- **Word spacing**: per-word animated spans must use `marginRight` for spacing —
  flex `gap` with `em` units renders as zero in the Remotion compositor, jamming
  words together ("someneed"). The template already does this.
- **Points, not lyrics**: show only the curated key takeaway per scene — never a
  word-for-word transcript on screen.
- The heavy grade is baked into the source by `longform_grade.sh`; `LongForm.tsx`
  only adds a light vignette. Don't double-grade.
- Always force `-pix_fmt yuv420p` in the grade (Chrome/Studio can't decode yuv444p).
- Long renders: a 7–8 min talk is a big render; run it in the background.
- Gemini image-gen free tier 429s fast — enable billing for full image coverage, or
  rely on the motion-graphic fallback (looks consistent and on-brand).

## Brand assets (MUST follow)
- **Logo:** always the full PNG on file — `kin_logo_full.png` (gold emblem + "KIDS INSPIRING
  NATION" wordmark, transparent). NEVER the emblem-only mark, and never generate/redraw a logo
  unless explicitly told to. The `Watermark` renders this PNG sized by `height` (width auto).
- **Website label:** `KidsInspiringNation.org`. **Handle:** `@KidsInspiringNation`.
- Social icons (if used) are real platform SVGs, never emoji.

## Approval gates (the human-in-the-loop)
Two hard gates, both requested by the user:
- **Gate A — before the full render:** show the **graded look + a caption still + the scene/slide/
  scripture map** (and validate depth cutaways via a short `--frames` segment, since stills render
  R3F black). Get sign-off before the ~14k-frame body render.
- **Gate B — before shorts:** after the longform is approved, do NOT cut shorts without a separate
  explicit go-ahead (hand to `video-to-short`).

## Runtime target
"Under N minutes" usually means the **teaching body**; the animated intro (~60–90 s) and outro
(~30 s) sit on top. Confirm whether the cap applies to the body or the final assembled file, then
size `drops.json` accordingly (e.g. cut verbatim repeats + dead air to bring a 9-min shoot under 8).
