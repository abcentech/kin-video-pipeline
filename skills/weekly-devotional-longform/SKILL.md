---
name: weekly-devotional-longform
description: >-
  Produce the recurring KidsInspiring Nation WEEKLY devotional episode as a
  polished long-form video, end to end, from a raw talking-head shoot plus the
  assets the user supplies each week. This is the intake + orchestration wrapper
  around video-to-longform's scripts and the longform-studio LongForm component.
  Use whenever the user says "prepare this week's devotional", "edit the new
  week's video", "make the weekly episode", or hands over a new dated shoot
  (e.g. Jul14.MP4) with intros/outro to stitch. The FIRST thing this skill does
  is ASK for every input (body video, subtitles SRT, slide-deck PDF, instrumental,
  intro(s) + order, outro) and confirm the ones already on disk — never guess.
  Delivers one stitched MP4 (intro(s) → graded/animated body → outro) at
  1920x1080/30fps with karaoke captions, full-page scriptures, designed-slide
  cutaways, kinetic point cards, branding, and a ducked instrumental bed.
---

# weekly-devotional-longform

The weekly KidsInspiring Nation episode is the SAME build every time — only the
week's assets change. This skill front-loads an **inputs checklist** so nothing is
assumed, then runs the proven `video-to-longform` SRT + slide-deck path.

## STEP 0 — ASK for the inputs (do this FIRST, every time)

Before touching ffmpeg, confirm all SIX inputs. Check the week's folder
(`Videos/<Mon DD>/`) and present what's found; ASK the user to supply anything
missing. Do NOT proceed until each is resolved.

| # | Input | Used for | Notes |
|---|-------|----------|-------|
| 1 | **Body video** (raw shoot, e.g. `Jul14.MP4`) | the graded talking-head body | often 120fps → conform to 30fps |
| 2 | **Subtitles** — corrected `.srt` | word-for-word gold karaoke captions | **use the SRT, never whisper** — honors the corrected text |
| 3 | **Slide deck** — designed `.pdf` | full-screen `SlideKenBurns` cutaways | one page per beat; baked-in titles/scriptures |
| 4 | **Instrumental** — no-drums/vocals `.mp3` | looped, ducked ambient bed under the voice | `bedVolume≈0.12`, loops to cover the body |
| 5 | **Intro(s)** — one or more branded clips + **their ORDER** | prepended before the body | e.g. `Longevity_Intro.mp4` then `KIND Intro 1.mp4` |
| 6 | **Outro** — closing clip | appended after the body | e.g. `KIND Outro 1.mp4` |

Also confirm before building:
- **Episode title** (on-screen), **series name**, **handle** (`@KidsInspiringNation`).
- **Branding (locked brand rule):** real `kin_logo_full.png` logo **top-right**
  (`showWatermark:true`) + **"KIDSINSPIRING NATION" wordmark fill-gauge bottom-left**
  (`wordmarkFill:true`). Never generate a logo; real social icons only (never emoji
  for brand chips); website = KidsInspiringNation.org.
- **Slide→timestamp map + extra point lines** → present as **GATE 1** for a quick OK.
- **Which slides to omit** (typos/dupes) and whether any baked scripture should instead
  become a full-page/lower-third card.

## Pipeline (reuses `video-to-longform/scripts/` + `longform-studio/`)

Run all renders on **Node v24.14.1**
(`export PATH="$HOME/.nvm/versions/node/v24.14.1/bin:$PATH"`). Comps are
1920x1080 **30fps**.

1. **Grade the body** → `longform-studio/public/lf_<ep>.mp4`. Soft-warm filmic
   grade + bloom + vignette; **RNNoise-ALONE** vocal clean (never stack
   afftdn/anlmdn on it); `loudnorm=I=-14`. Force `-r 30 -g 30 -pix_fmt yuv420p`
   so Studio plays it and OffthreadVideo seeks fast (avoid 120fps/yuv444 traps).
   If the shoot is 120fps, this pass conforms it to 30. Copy the instrumental to
   `public/audio/<ep>_bed.mp3`. **HOUSE GRADE = Teal & Orange (locked Jul 11 2026 — use for
   EVERY KidsInspiring video; do not re-offer options).** Apply this `VF` after the
   scale/pad/setsar prefix (it carries its own halation — no separate bloom; `unsharp` matrix
   must be ODD):
   ```
   hqdn3d=3:2:3:3,eq=contrast=1.08:saturation=1.14:gamma=1.03,
   curves=all='0/0.02 0.25/0.20 0.5/0.5 0.75/0.80 1/0.98',
   colorbalance=rs=-0.06:gs=0.02:bs=0.06:rm=-0.02:bm=0.02:rh=0.07:gh=0.01:bh=-0.07,
   split=2[b][h];[h]curves=all='0/0 0.65/0 1/0.9',gblur=sigma=14[g];[b][g]blend=all_mode=screen:all_opacity=0.16,
   noise=alls=4:allf=t,vignette=PI/8,unsharp=5:5:0.5
   ```
   Teal-cooled shadows + warm-orange skin/highlights, punchy S-curve, restrained halation, light
   grain + vignette. (Supersedes the earlier "brighter soft-warm" default.) Check a still.

2. **Karaoke captions from the SRT** (NOT whisper):
   `node scripts/srt_to_words.mjs "<...>.srt" longform-studio/src/captions/<ep>.json [drops.json] build/<ep>_corrections.json <empCSV>`.
   Auto-strips the TurboScribe watermark; `corrections.json` maps mis-heard tokens
   → fixes (e.g. `{"sacred":"secret"}`). The `empCSV` flags theme words gold. The
   SRT is also the transcript you read to place scenes/points at the exact spoken second.

3. **Slides → PNGs** — `pdftoppm -png -r 150 -f N -l N "<deck>.pdf" pg`, copy to
   `longform-studio/public/<ep>_slideNN.png`. **Check the corner "watermark" before
   cropping** — the KidsInspiring deck carries `KidsInspiringNation.org` bottom-right,
   which is the brand URL and must be KEPT; only crop a true third-party watermark.
   Omit slides with baked typos.

4. **Author scenes** → `longform-studio/src/scenes/<ep>.json` (schema below). Place each
   slide `full:true` at the exact spoken second. Because designed slides carry their
   own text, DON'T also lower-third that text (anti-duplication). Add 2–3 ORIGINAL
   kinetic `point` cards (`noSplit:true`) in gaps with no slide + animated section
   titles. **Scriptures — RULE (Jul 24): EVERY scripture is `place:"full"`, always.** Never `"lower"`
   or `"center"`. The **FULL verse** (KJV) on a **semi-transparent veil** over the talking head
   (speaker faintly visible), gold chip + divider (captions auto-suppress). **Emphasize only the span
   the speaker quoted** by wrapping it in `**double asterisks**` in `text` — that span is big/bold/gold,
   the rest is smaller dimmed context (`**` markers parsed ONLY in `full` mode — in lower/center they
   render as literal asterisks, another reason full is now the only mode). **Scan the whole SRT so
   EVERY quoted verse gets a page** (Jul 14 nearly missed Psalm 92:14). A designed slide can co-exist
   with that verse's page — place the page at a DIFFERENT spoken instance so they don't collide. Add
   `openLoop`, `teasers`, and an end `recap` (drop the recap if closing slides already summarize).
   **REQUIRED for a series episode: an `outro` block** — the next-episode lower-third card that chains
   to the next title (`{at, day, total, next, label, url, prayer}`, rendered by `LongForm`'s
   `OutroCard`). WITHOUT it the episode ends on the stitched KIND Outro clip with NO next-episode
   pointer (this bit Jul 14 — it shipped with only a `recap`). Place `outro.at` on the body's closing
   tail (after the recap clears, ~15s before body end); the badge shows the NEXT episode's number
   ("N of 5"). Finale: set `label`/`next` to a series-close CTA. **RULE (Jul 24): EVERY episode's
   `outro.prayer` = `"Prayer Service · Saturdays 7:30pm · KidsInspiringNation.t.me"`** — a standing
   gold CTA ribbon above the outro card inviting viewers to the Saturday 7:30pm prayer service
   (t.me or KidsInspiringNation.org). **→ GATE 1: present the slide→time map + point lines.**
   **On-screen title = the EPISODE title, NEVER the series name** — set `title` AND the opening
   scene's `section` (e.g. "Sustaining Life in a Sound Body", not the series "Secrets of Longevity").

5. **Register comp** — add `import <ep>` + `import <ep>caps` and a `<Ep>Long`
   `<Composition>` (LongForm, 30fps, 1920x1080, `durationInFrames=round(videoSeconds*30)`,
   `defaultProps={{...<ep>, captions: <ep>caps.words}}`) in `longform-studio/src/Root.tsx`.

6. **Gate A stills** (`remotion still <Ep>Long out.png --frame=N`) — one each of: a
   caption on the pill, a section title, a kinetic point card, a full-page scripture, a
   designed-slide cutaway, the recap. Confirm captions sit on the slider, cards clear the
   pill, logo top-right + wordmark bottom-left present. Fix placements, then render.

7. **Render body** → `npx remotion render <Ep>Long ../out/<ep>_body.mp4 --concurrency=3 --timeout=120000`
   (kill orphan ffmpeg children first).

8. **Stitch** → `scripts/assemble.sh out/<EP>_FULL.mp4 <intro1> <intro2...> <ep>_body.mp4 <outro>`
   in the confirmed order. assemble.sh normalizes every segment to 1920x1080/30/yuv420p/48k
   AAC (handles mixed fps, 1440p sources, and yuvj420p full-range intros).

## Scene / immersion schema knobs
`source, title, handle, showWatermark:true, wordmarkFill:true, subscribeEvery, videoSeconds,`
`openLoop+openLoopAt, teasers[{at,text}], recap{at,title,items[]},`
`immersion{enabled, grade:false, particles:false, sfx:true, bed, bedVolume, voiceEnd,`
`  scriptures[{at, ref, text, place:"full"|"lower"|"center", hold}]},`
`scenes[{start,end,section,point,ref,emoji,image,motion,full,noSplit}]`.
- `full:true` + `image` + `motion` (no `depth3d`) → SlideKenBurns contain-fit (no mesh warp).
- `noSplit:true` (no image) → kinetic point lower-third + section title over the talking head.

## Critical gotchas (from memory / proven builds)
- **RNNoise alone** on voice — never stack afftdn+anlmdn (kills quiet speech).
- **Captions are continuous**; only full-screen takeovers (hook / recap / outro /
  **full-page scripture** / **full-slide cutaway**) suppress them. Layer order bottom→top:
  caption pill → point/scripture card → open-loop → teaser.
  (Full-slide suppression is now baked into `LongForm.tsx` via `fullSlideWins`/`inFullSlide`
  — a designed slide carries its OWN baked bottom caption, so the karaoke band MUST hide or
  the two collide at the bottom edge. Added Jul 24.)
- **`**emphasis**` markers are parsed ONLY in `place:"full"` scriptures.** In `lower`/`center`
  the asterisks render LITERALLY on screen. Never put `**` in a lower/center verse — keep those plain.
- **Full-slide scenes: set `section:""` and `point:""`.** The designed slide already has a baked
  title + caption; a non-empty section/point would double up over it. Only NON-slide kinetic
  `point` scenes carry text.
- **Grade to the SERIES, not the skill default.** This skill's default is Teal & Orange, but if
  the episode belongs to a run already graded another way (e.g. W4 body series = "Look A" bright-
  commercial normalized to Y≈167), grade the raw to MATCH its siblings. Measure a graded still's
  YAVG and nudge `brightness=` to hit the series target (W4E5 raw needed BR≈-0.03) before the full pass.
- **RAW episode → `showWatermark:true` + `wordmarkFill:true`** (raw has no branding; we ADD the
  kin_logo_full + wordmark gauge). Editor-cut episodes use `false` (already branded).
- **`pdftoppm -r 100`** for these ~1376pt decks (~1912px wide, ample for 1080p). `-r 150` TIMED OUT
  at the 2-min bash limit on a 20MB deck — run it in background or at r100.
- **Gate-A stills: run in background or in 2 batches.** The Remotion bundle re-caches ONCE on first
  still (~40s) then is fast; a 14-still loop overruns the 2-min foreground bash timeout.
- **Finale outro:** `{day:N,total:N,label:"Series finale · N of N",next:"The whole series is live now"}`.
- **Drop the standalone recap when the closing slides already summarize** (e.g. a "3-edged / fasting"
  summary slide + a closing-charge slide) — the outro card still carries the series framing. (EP2/EP5.)
- **zsh glob abort:** an unquoted glob that matches nothing (`*.rnnn`, `.env*`) is a
  FATAL "no matches found" that aborts the whole command line — use `find`/quoting.
- **Depth3D renderStill = black** — verify photographic 2.5D b-roll with `--frames=A-B`,
  never a single still. SlideKenBurns (designed slides) is fine on stills.
- **Kill orphan ffmpeg children** before re-running any render (a killed parent leaves a
  child at ~800% CPU corrupting the shared output).
- **Slide/PDF render contends for CPU** with a running grade — render slides after the
  grade frees cores, or expect `pdftoppm` timeouts.
- Verify the graded file with `ffprobe` (expect 1920x1080, yuv420p, 30/1, duration≈body).

## Series socials output (RULE, Jul 24)
Every episode gets its own `out/<EP>_socials.md` (title options, description, chapter timestamps,
pinned comment, thumbnail concept) + the shorts' titles/descriptions/pinned comments. **When ALL 5
episodes of a series are released, produce ONE consolidated `out/<SERIES>_ALL_socials.md`** — a single
publish-ready doc covering all 5 episodes AND every short, in upload order, with the common
description tail + hashtags and the standing Saturday-prayer-service CTA line. This consolidated file
is a required deliverable at series completion, not optional.

## Proven runs
- **Jul 3** — "Long Life: The Covenant of God's Blessing" (first slide-deck run).
- **Jul 14** — "Secrets of Longevity — A Sound Mind" (first full run of THIS skill;
  full-page scriptures added: Romans 12:2, Proverbs 23:7, Philippians 4:8, Psalm 91:16,
  plus Psalm 91:1 & 2 Timothy 1:7 carried by designed slides).
- **Jul 24** — "Cleanse the Body" (Secrets of Longevity FINALE, 5 of 5). Best run yet:
  raw 8:00 shoot → graded Look A (BR-0.03, RNNoise+loudnorm) → all 12 designed deck slides as
  full-screen SlideKenBurns cutaways mapped 1:1 to the SRT beats (section/point empty) → 2 full-page
  scriptures (2 Cor 7:1, Romans 12:2) + 3 lower-third (Psalm 1:1, 1 Pet 2:11, 1 Thess 5:22) → 3
  kinetic points in the gaps → hook + open-loop + 2 teasers → finale outro (no standalone recap,
  slides 11-12 carry it) → stitched Longevity intro + KIND intro + body + KIND outro = `out/W4E5_FULL.mp4`
  (9:59). Fixed two component bugs this run: full-slide caption suppression + `**` only-in-full. ~69 min end-to-end.
