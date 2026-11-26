# Daily devotional pipeline ("THE FATHER SHOWED UP")

A self-contained project that turns one raw phone recording per day (`Day_N.mp4`) plus the
teaching guide into a finished package:

- the full episode, 16:9 (1920x1080, 30 fps)
- a trailer in 16:9 and 9:16
- three 9:16 shorts
- captions (SRT, VTT, transcript), a thumbnail and the social copy (titles, description, chapters, per-short captions)
- a QC report with loudness, black-frame scan and contact sheets

Scripts do everything mechanical. The creative decisions for each day live in one file,
`december/edits/dayNN.json`, written by a person (or an assistant following `december/STANDARD.md`)
from the draft the pipeline produces. Six finished example edits (Days 1-6) are included.

This folder is a project root: the code finds its root from its own location, so keep the
directory layout as it is and run every command from this folder.

## Prerequisites

- Node.js 20 or newer
- ffmpeg and ffprobe on the PATH
- Python 3.11 or 3.12
- whisper.cpp with the `ggml-large-v3-turbo-q5_0.bin` model (speech to words)
- the presenter-matte model for the trailer cut-outs (see below)
- a machine with a few GB of free disk: renders and temporary bundles are large

Optional: the OpenAI Codex CLI (`codex exec`) generates the day's illustrations. If it is not
installed, `art.mjs` cannot make them: draw or generate the plates yourself and save them as
`december-public/dayNN/art/<id>.png` (or .jpg), using the ids named in the day's edit. The
rest of the pipeline does not care how a plate was made.

## Install

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

macOS / Linux:

```bash
bash scripts/setup.sh
```

Setup checks the prerequisites, runs `npm install` (here and in `tools/matte`), creates
`studio/.venv` from `requirements.txt`, and copies `december/config.example.json` to
`december/config.local.json`. It then prints, and does not perform, the downloads you do by hand:
whisper.cpp and its model, the matte model, and the CC0 orchestral sample library for the sound
stage (about 1.1 GB, `scripts/viral/studio/fetch_samples.py`).

Check the install without any media: `npm run selftest` runs the plan compiler's self-test.

## Configuration

Every external path is in `CONFIG` in `scripts/december/lib.mjs`. Each value comes from, in order:
an environment variable (`DEC_INBOX`, `DEC_GUIDE`, `DEC_FILM_MASTER`, `DEC_WHISPER_EXE`,
`DEC_WHISPER_MODEL`, `DEC_RNNOISE`, `DEC_PYTHON`, `DEC_FACE_MODEL`), then
`december/config.local.json` (git-ignored), then a default under this folder. Use forward
slashes, also on Windows. `rnnoise` must stay a path relative to this folder.

## What you supply

| Item | Default location | Notes |
|---|---|---|
| Recordings `Day_<N>.mp4` | `inbox/` (`inbox` key) | `Day_0` is the series opener |
| Teaching guide HTML | `assets/teachers_guide.html` (`guide` key) | parsed into `december/series.json`; a parsed copy is already included |
| Picture-film master | `assets/film_master_16x9.mp4` (`filmMaster` key) | each day's clip is cut from it |
| Like/share sign-off | `december-public/outro/LikeShare_16x9.mp4`, `LikeShare_9x16.mp4` | about 21 MB, not in the repo |
| whisper.cpp + model | `tools/whisper/` (`whisperExe`, `whisperModel` keys) | |
| Matte model | `tools/matte/models/rvm_mobilenetv3_fp32.onnx` | Robust Video Matting, MobileNetV3 fp32 ONNX; the code documents no download address |
| Sample library | `studio/samples/` | `fetch_samples.py` downloads it |

Included: the fonts and the brand logo/icons in `december-public/`, the face-detector model
`studio/models/blaze_face_short_range.tflite`, and the RNNoise model.

## Production order per day

Run from this folder. `N` is the day number. Every step prints what it did; most are resumable.
The producer sees a picture after the early steps and says what to correct before anything long
is rendered. The authoritative text is `december/PIPELINE.md`, section "Production order per day".

Before the edit (several days at once is fine): `node scripts/december/prep.mjs 3 4 5 6`
(ingest, transcribe, draft, re-hearing, film clip). The result for each day is the worksheet
`december/work/dayNN/draft.md`.

Then write `december/edits/dayNN.json` from the draft, following `december/STANDARD.md`
(types in `src/December/types.ts`, compile rules in `december/COMPILE.md`).

1. **Cut and grade.** `node scripts/december/cut.mjs N`
   - Grade comes from `december/grade.json`. Days marked `"grade": "studio"` use the studio grade,
     look B, built by `scripts/december/grade/studio.py` (measure, prepare, check). Otherwise N3-C.
   - The measure gate must print ALL PASS. If a check fails, look at the picture, name the check with
     `--accept-grade=<check,...>` and note why in `edits/dayNN.notes.md`.
   - The face is never lifted above 1.5x its recorded median luma; `days.N.warm` (1-8) turns skin
     slightly toward orange.
   - `full.mp4` can be deleted once the body is cut.
2. **Plan.** First measure his head for the 9:16 shorts (about 10 s):
   `<python> -I scripts/december/grade/headx.py december/work/dayNN/n3/cap.mkv december/work/dayNN/headx.json`
   (`<python>` is `studio/.venv/Scripts/python.exe` on Windows, `studio/.venv/bin/python` elsewhere),
   then `node scripts/december/plan.mjs N`.
   - Camera v2 is the default (one locked frame per shot). `"camera": "v1"` in an edit keeps the old follow-and-slide.
   - Endings: the last line of a short holds 8-24 frames after his last word, the trailer's `button` 12-26
     frames, and never into any other sound of the recording (`silences.json`). A promo line never crosses
     a hard cut of the body. If fewer than 8 frames remain after the last word, end the short on another line.
   - Point lines over 26 characters warn: break them with `|`.
   - Without `headx.json` the planner falls back to the old two-key camera, which cuts into his face.
3. **Trailer cut-outs.** `node scripts/december/matte.mjs N --force`
   - Always before the sound: the sound stage refuses a cut-out shorter than its line.
   - It queues for the machine-wide lock, so beside a long render it can wait for hours.
4. **Sound.** `node scripts/december/sound.mjs N` (or `promo-sound.mjs N` for trailer and shorts only).
5. **Layout picture (checkpoint).** `node scripts/december/layout-picture.mjs N` writes
   `out/december/DayNN/preview/DayNN_layout_01.jpg`. Show it to the producer.
6. **Checkpoint video.** `node scripts/december/render.mjs N --only=trailer16,short1`
   (add `--frames=a-b` for one minute of the episode). Before this, review every beat as stills:
   `dev-stills-episode.mjs --day=N --auto --proxy`, `dev-stills-promo.mjs N --auto`, `review-sheets.mjs`.
   Check the 9:16 trailer's film beats: a face close-up does not survive the side crop, so give that beat
   `"from9": <seconds>, "focusX": <0-100>`.
7. **Finals, after the producer's word.** `node scripts/december/render.mjs N` (all six pieces), then
   `node scripts/december/post.mjs N` (captions, thumbnail, socials), `node scripts/december/qc.mjs N`,
   `node scripts/december/phone-previews.mjs N`. Check the endings and the loudness on the final files,
   not on stills.

`node scripts/december/make.mjs N [--from=<stage>] [--until=<stage>]` chains the stages and stops at
`draft` for the edit. `node scripts/december/watch.mjs` lists the days in the inbox and the next step for each.
`npm run <stage> -- N` wraps each script (`plan`, `cut`, `render`, `qc`, ...).

Outputs land in `out/december/DayNN/`; per-day working files in `december/work/dayNN/` and
`december-public/dayNN/` (both git-ignored).

## Rules that always apply

- One heavy job at a time: renders and whisper go through `scripts/with-render-lock.mjs`
  (the stages do this themselves). Never two renders at once.
- Never cut a speaker mid-sentence or trim a sentence to tidy its wording: ask the producer.
- Only the on-file logo (`december-public/brand/kin_logo_full.png`); never draw or generate one.
- Fonts are self-hosted in `december-public/fonts`.
- After every render, look at the FINAL mp4 (luma scan and contact sheet): stills have been wrong before.
- Full pass/fail list: `december/CHECKLIST.md`.

## Layout

```
daily-devotional/
  scripts/december/      the stages (node) + grade/ (python) + sound/ (python) + lib.mjs (CONFIG)
  scripts/grade-n2/      the N2 colour grade the N3 grade builds on (imported, not edited)
  scripts/viral/studio/  the sampled-orchestra sound studio (only the modules the sound stage imports)
  scripts/lib/           run-temp.mjs (keeps Remotion's temp files out of the system temp)
  tools/matte/           rvm.mjs, the presenter matte (code only)
  src/December/          Remotion compositions; entries src/december-entry.tsx, src/december-promo-entry.tsx
  december/              docs, series.json, grade.json, edits/ (per-day decisions and notes)
  december-public/       Remotion's public dir: fonts/ brand/ (included), outro/ dayNN/ (yours / generated)
```

`npm run studio` opens Remotion Studio on the episode entry, `npm run studio:promo` on the trailer and shorts.

## Known limits

- `scripts/grade-n2/n2.py` and `proof.py` draw review labels with Windows fonts (`C:/Windows/Fonts/arial*.ttf`)
  in their proof/review commands; on macOS/Linux those commands fail on the font. The grade itself does not use them.
- `scripts/december/sound/make_fixture.py` (a developer fixture) needs `DEC_RAW_DAY1` or `inbox/Day_1.mp4`.
- The code was written and run on Windows 11. The macOS/Linux defaults are handled in `lib.mjs` but untested.
