---
name: daily-devotional
description: >-
  Produce one day of the "THE FATHER SHOWED UP" daily devotional from a raw talking-head phone
  recording (Day_N.mp4) plus the Teacher's Edition guide: an edited 16:9 episode, a 16:9 + 9:16
  trailer, three 9:16 shorts, captions (SRT/VTT/transcript), a thumbnail and the social copy.
  Use whenever the user says "make Day 7", "edit the next devotional", "cut the daily devotional",
  "prep days 8 to 12", or hands over a new Day_N.mp4 for this series. The project lives in the
  daily-devotional/ folder of this repo. The FIRST thing this skill does is check the inputs and
  confirm them with the user; after each stage it shows the producer a picture or a short clip
  and waits for the go-ahead before anything long is rendered.
---

# daily-devotional

One presenter, one locked-off phone camera. The pipeline lives in `daily-devotional/` (a project
root: run every command from there). Read `daily-devotional/README.md` for install and the
per-day order; `december/PIPELINE.md` is the authoritative production order,
`december/STANDARD.md` is how to write the day's edit, `december/CHECKLIST.md` is the pass/fail sheet.

## STEP 0: inputs checklist (ask, never guess)

Confirm each item exists or ask the user for it:

- [ ] `Day_<N>.mp4` in the inbox folder (`CONFIG.inbox`). Which day number? (`Day_0` is the series opener.)
- [ ] The teaching guide HTML (`CONFIG.guide`) and `december/series.json` parsed from it
- [ ] The picture-film master (`CONFIG.filmMaster`) for the day's film clip
- [ ] `december-public/outro/LikeShare_16x9.mp4` and `LikeShare_9x16.mp4`
- [ ] whisper.cpp + `ggml-large-v3-turbo-q5_0.bin`, the matte model `tools/matte/models/rvm_mobilenetv3_fp32.onnx`,
      and the sample library `studio/samples/` (`scripts/viral/studio/fetch_samples.py`)
- [ ] `december/config.local.json` points at the above; `studio/.venv` exists (run `scripts/setup.ps1` or `scripts/setup.sh` otherwise)
- [ ] Illustrations: is the Codex CLI (`codex`) installed? If not, who supplies the plates for `december-public/dayNN/art/`?
- [ ] Anything the producer wants different for this day (grade warmth, hook, which truths to feature)

Never generate or substitute a logo: only `december-public/brand/kin_logo_full.png`.

## Staged workflow, with a producer checkpoint after each stage

Run from `daily-devotional/`. Do not move to the next stage until the producer has seen the result
and said go. Say plainly what is still open.

1. **Prep.** `node scripts/december/prep.mjs N` (ingest, transcribe, draft, re-hearing, film clip).
   Show: the draft worksheet summary (retakes, dead air, off-script phrases, scripture hits) and any
   words you could not resolve.
2. **Edit decisions.** Write `december/edits/dayNN.json` from the draft following `december/STANDARD.md`
   (reference: `edits/day01.json`; proof-read every phrase against the guide). Show: the keep list, the hook,
   the cards, the three shorts, and an `NOTES: check` list of uncertain words. Wait for corrections.
3. **Cut and grade.** `node scripts/december/cut.mjs N`. The measure gate must print ALL PASS; otherwise inspect
   the picture by eye and name the check with `--accept-grade=...`, with a note in `edits/dayNN.notes.md`.
   Show: a still of the graded frame next to the raw one.
4. **Plan.** Run `scripts/december/grade/headx.py` for the shorts' camera, then `node scripts/december/plan.mjs N`.
   Show: the running order with timecodes and any planner warnings.
5. **Cut-outs, then sound.** `matte.mjs N --force` ALWAYS before `sound.mjs N`.
6. **Picture checkpoint.** `layout-picture.mjs N`, plus every beat as stills (`dev-stills-episode.mjs --day=N --auto --proxy`,
   `dev-stills-promo.mjs N --auto`, `review-sheets.mjs`). Show the layout picture.
7. **Short clip checkpoint.** `render.mjs N --only=trailer16,short1` (and `--frames=a-b` for one episode minute).
   Show the clip, including the 9:16 trailer's film beats.
8. **Finals.** Only after the go: `render.mjs N`, `post.mjs N`, `qc.mjs N`, `phone-previews.mjs N`. Show the QC
   report and the contact sheets from the FINAL files.

Always send a watchable draft with an update, not text only: 16:9 and 9:16, and a version without voice when asked.

## Standing quality rules

- Never cut a speaker mid-sentence, and never trim a sentence to tidy its wording: ask the producer.
- Every in/out snaps to silence; no word clipped at a join; no retake, false start or slate chatter survives.
- Captions are proof-read against the guide; scripture is KJV, letter for letter, where he follows it.
- On-file logo only; real platform icons, never emoji; subscribe nudge once at 30-45%, share nudge once at 65-80%,
  neither over scripture, prayer or declaration.
- Endings are checked from the FINAL files, frame by frame at the last second, not from the plan: a short ends
  8-24 frames after his last word, a trailer `button` 12-26, never into another sound of the recording and never
  across a hard cut of the body.
- Run `headx.py` before `plan.mjs`; without it the 9:16 shorts cut into his face at the frame edge.
- Masters -14 +/-0.7 LUFS, true peak at most -1.0 dB; trailer 35-50 s; each short one complete thought, hook on
  screen at frame 0, readable with the sound off.
- One heavy job at a time (render lock). Check free disk before a render. After every render, scan and look at the
  final mp4: stills have been wrong before.
- Never `cd` into an output folder (Windows cannot delete a cwd).
- Nothing ships until every line of `december/CHECKLIST.md` passes on the final files. One polish round after
  the first full pass; whatever is open after that goes on the day's `NOTES` list in `DayNN_QC.md`.
