---
name: video-edited-overlay
description: >-
  Layer kinetic text "pointers" and split-screen reveals onto an ALREADY-EDITED
  long video — one that already has its own captions, scripture cards, AI b-roll,
  speech bubbles and channel logo. Unlike video-to-longform (which builds graphics
  from scratch for raw talking-head footage), this skill ADDS only what the editor
  couldn't: animated kinetic teaching points, emoji split-screens, an open-loop
  hook and "still ahead" re-hooks — dropped ONLY into the plain talking-head gaps
  so they never collide with the existing graphics. Re-grades (soft warm filmic),
  removes its own watermark (the video is already branded), no title hook, NO zoom
  on the speaker, full-length progress bar. Use when the user says "layer the skill
  onto my edited video", "add the text pointers to this finished edit", "it already
  has animation/captions but I need the kinetic text", or "make a skill for edited
  videos".
---

# video-edited-overlay

Add the kinetic-text layer to a **finished, richly-produced** video without fighting
what's already on screen. This is the companion to `video-to-longform`:

- **video-to-longform** → RAW talking-head footage. Builds everything (titles,
  points, scripture chips, b-roll insets, watermark, hook) from scratch.
- **video-edited-overlay** (this) → an EDITED video that already has captions,
  scripture cards, AI animation, speech bubbles and a logo. Adds ONLY kinetic
  points + emoji split-screens + open-loop/re-hooks, dropped into clean gaps.

## What it adds (and deliberately omits)
ADDS: soft-warm grade; **kinetic teaching points** (lower-third, words pop in + gold
scan); **emoji split-screen reveals** (face left at NATURAL size, card right, then
back); an **open-loop** promise early; **"still ahead" re-hook** teasers; transition
flash + whoosh; full-length progress bar.
OMITS (because the edit already has them): watermark (`showWatermark:false`), title
hook (`showHook:false`), any section graphics that would duplicate the editor's
scripture cards.

## Schema knobs (LongForm props)
- `hookAt` (sec) + `hookText` — drop a curiosity TITLE-HOOK card just AFTER a locked
  intro (e.g. 99 for a 1:39 intro). Keeps `showHook:false` so scene timing is untouched.
- `subscribeEvery` (sec) — animated 🔔 SUBSCRIBE bug fires every N sec across the WHOLE
  video (e.g. 180). Bottom-left, raised (`bottom:230`) ABOVE the burned-in captions; may
  overlay the editor's animation (that's fine/expected).
- `outro:{at,next,day?,total?}` — series-connected end card over the closing tail.
  Omit `day/total` for just "Tomorrow · same time" + the next title. Drives return-viewers.
- Teaser ("Still ahead…") holds ~5s (was 3s — too fast). Chain across scenes.

## Retention playbook (what top faceless channels do — bake this into every cut)
Goal: every second watched, push AVD up. Research-backed numbers:
- **A payoff/teaser every 60–90s.** Chain `teaser` ("Still ahead…") across scenes so
  every beat promises the next. Forward-promise roughly every 90s of body.
- **Retention trap at the ~50% mark** (the body's second-biggest drop-off). Place a
  curiosity beat at the midpoint of `[bodyStart,bodyEnd]` — a surprising reveal or a
  question they want answered. (FIH: the "WHY JESUS ASKED" beat at ~5:20.)
- **5–8 text beats total**: 1 open-loop hook, 2–4 main points, a contrast/warning, a
  closing takeaway. Fewer than 5 = under-using the gaps; more than 8 = distracting.
- **Bold, big, mobile-first text.** Sans-serif heavy weight (900), key words anchored
  in colour (gold scan). Strong pop entrance, not constant motion — motion as
  punctuation. Big enough to read on a phone.
- **One complete idea per ~60–90s, each with a micro-payoff.** Don't let a beat just
  state — make it reveal.
- **No >4s visual freeze.** The editor's b-roll handles base pace; our beats are the
  re-engagement anchors dropped on the plain talking-head stretches.

## Hard rules (learned the hard way)
0. **NEVER trust the user's/raw SRT timestamps for overlay timing.** A provided SRT is
   transcribed from the RAW audio; the EDITED video prepends an intro (~1:39) and inserts
   AI scenes/cards, so every spoken line lands LATER and the drift is non-constant (it can
   even shrink later where the editor trimmed pauses). Using SRT times directly puts every
   overlay seconds off (a quote telegraphed before it's said). ALWAYS transcribe the GRADED
   EDITED file for true timing: `ffmpeg -i graded.mp4 -ar 16000 -ac 1 out.wav` then
   `whisper-cli -m <model> -f out.wav -osrt -l en` (model:
   /Users/mac/Documents/video raw/models/ggml-large-v3-turbo-q5_0.bin). Use the user's SRT
   only for clean WORDING; use the edited-file transcript for WHEN. Run whisper unattended —
   don't let a `pkill` in another step kill it.
1. **Overlays go ONLY in clean talking-head gaps.** The editor's scripture cards /
   AI scenes / speech bubbles are sacred — never overlay them. Mis-detecting a gap
   = your title landing on their animation.
2. **NO zoom on the speaker.** No Ken-Burns, no punch-in, no overscan. The face
   stays its natural size and centered; during a split only the far edges are
   cropped to make room for the side panel (`vidW = 100 - 36*split`, `objectPosition
   "50% 50%"`). Users notice and dislike zoom on a face.
3. **Keep the face almost fully visible** — panel takes ≤36% width.
4. **Text only in the lower third or top-left**, and **raised above the editor's
   burned-in captions** (point sits at `bottom:150`, not the very bottom).
5. **No watermark** — the channel logo is already on every frame. (If a build ever DOES need
   a logo/branding, use the logo ON FILE — `logoIcon.svg`/`logo.png` — never generate or
   redraw one unless the user explicitly asks to generate a logo.)
6. **APPROVE BEFORE RENDER.** After the file is regraded and you've authored the overlay plan,
   STOP and present it for approval (thumbnail concept(s) + caption/overlay plan + scripture
   callouts). Never kick off the full render until the user approves (Step 3.5 below).
7. **APPROVE BEFORE SHORTS.** Once the long-form is approved/rendered, do NOT start cutting
   shorts off it without a separate explicit go-ahead. Hand off to the `video-to-short` skill,
   which has its own final-approval gate before its renders.

## Workflow
1. **Grade** the whole edited file (keeps the look consistent across their AI scenes
   and talking-head): `scripts/grade.sh <edited.mov> <project>/public/lf_<name>.mp4`.
   (Optional — skip if the user wants their exact colors.) **KIN HOUSE GRADE = Teal & Orange
   (locked Jul 11 2026) — see memory [[kin-house-grade]] for the filterchain; use it, not the
   old soft-warm look, on any KidsInspiring re-grade.**
2. **Find the clean gaps**: `node scripts/detect_gaps.mjs <graded.mp4> <bodyStart>
   <bodyEnd>` → contact sheets. Classify each cell as talking-head vs
   card/animation. **Re-verify every finalist window at 1s resolution** — cards
   flash in/out between 4s samples (this bit us). Pick clean runs ≥~10s.
3. **Author scenes** in `<project>/src/scenes/<name>.json` — one `point` per clean
   gap, with `start`/`end` inside the verified window. Set `showHook:false`,
   `showWatermark:false`, `videoSeconds:<full length>`, an `openLoop`, and `teaser`
   on a couple of scenes. Use `noSplit:true` for short gaps (<~10s) to show the
   point immediately with no split. Drop any beat the editor already animated.
3.5 **APPROVAL CHECKPOINT (gate — do not skip).** Before rendering, present the full plan and
   wait for an explicit "go":
   - **Thumbnail concept(s)** — big face + 3–4 word punch, brand gold-on-dark (1–2 options).
   - **Caption / overlay plan** — the `hookText`, every kinetic beat with its timestamp +
     section title, the teasers, recap items, and outro card text.
   - **Scripture callouts** — any verse you'll add (and confirmation the editor didn't already card it).
   Render ONLY after the user approves. If they change wording/timing, revise and re-show.
4. **Render**: copy `templates/LongForm.tsx` → `src/`, register a composition with
   `durationInFrames = videoSeconds*fps` (the WHOLE video; overlays self-gate to the
   body). `npx remotion render <id> ../out/<name>_edited.mp4` (Node 24+, background).
5. **Validate stills first** at each gap's split + point frame, confirm no collision
   with the editor's graphics/captions, then commit to the full render.
6. **Shorts (separate gate)**: after delivering the long-form, ask whether to cut shorts. Only
   on an explicit yes, hand the finished/graded file to the `video-to-short` skill — which runs
   its OWN final-approval gate before rendering any short.

## Notes & gotchas
- Per-word animated spans must space with `marginRight` (flex `gap` em = 0 in the
  Remotion compositor).
- Force `-pix_fmt yuv420p` in the grade (Chrome can't decode yuv444p).
- Kill orphan ffmpeg/render children before re-running — a killed parent can leave
  an ffmpeg child burning 800% CPU against the same output file, corrupting it.

## Standing rules (Jul 24 — apply to EVERY episode, both skills)
- **`outro.prayer` on every episode** = `"Prayer Service · Saturdays 7:30pm · KidsInspiringNation.t.me"`
  — a gold CTA ribbon above the outro card (rendered by `LongForm`'s `OutroCard`). Invites viewers to
  the Saturday 7:30pm prayer service (t.me or KidsInspiringNation.org).
- **Any scripture we add is `place:"full"`** (never lower/center). `**emphasis**` parses only in full mode.
- **Series socials:** each episode + its shorts get an `out/<EP>_socials.md`; when ALL 5 episodes are
  released, produce ONE consolidated `out/<SERIES>_ALL_socials.md` (all episodes + all shorts, upload
  order, common tail + hashtags + the prayer-service CTA) — required deliverable at series completion.
