# THE FATHER SHOWED UP — December 2026 daily devotional: the edit pipeline

One presenter, one locked-off phone camera, a painted wall. A raw file is dropped in the inbox
and a finished package comes out the other side with no human editor in between:

| Deliverable (per day, in `out/december/DayNN/`) | Spec |
|---|---|
| `DayNN_<Title>_16x9.mp4` — the full episode | 1920x1080, 30 fps, −14 LUFS |
| `DayNN_Trailer_16x9.mp4`, `DayNN_Trailer_9x16.mp4` | 35–50 s |
| `DayNN_Short1..3_9x16.mp4` — shareable moments | 20–55 s each, 1080x1920 |
| `DayNN.srt`, `DayNN.vtt`, `DayNN_transcript.txt` | proof-read against the Teacher's Edition |
| `DayNN_thumbnail.png`, `DayNN_socials.md` | titles, description, chapters, pinned comment, per-short captions |
| `DayNN_QC.md` + `qc/` contact sheets | loudness, black-frame scan, checklist result |

Inbox: `Day_<N>.mp4` in the folder set by `CONFIG.inbox` (`december/config.local.json`; default `inbox/`) (`Day_0` = the series opener "To Every Child").
Guide: the teaching-guide HTML at `CONFIG.guide` (default `assets/teachers_guide.html`) → `december/series.json`.
Film: the master at `CONFIG.filmMaster` (default `assets/film_master_16x9.mp4`) (the motion-picture version, chosen by the producer; 30 fps, burned-in
subtitles). The guide gives each day its clip (`film 0:04–0:54` for Day 1). It opens with a "not for young children"
card until ~4.8 s (Day 1 starts after it), so every day's range is looked through on a contact sheet before use.
Working files live in `december/work/dayNN/` (the paths below that say `.tmp/dec/dayNN/` are that folder: `.tmp`
was wiped once by something outside this pipeline).

Before the edit, for several days at once: `node scripts/december/prep.mjs 3 4 5 6` (ingest → transcribe → draft →
`rehear.mjs`, the second and third hearings → film). After the finals: `node scripts/december/phone-previews.mjs N`.

## Who does what

Deterministic scripts do everything mechanical. ONE editorial file per day, `december/edits/dayNN.json`,
holds every creative decision (what to cut, the hook, which words become cards, the illustrations, the
shorts). It is written by the lead model from the draft, following `december/STANDARD.md`.

```
ingest ─ transcribe ─ draft ──► [EDIT: december/edits/dayNN.json] ──► cut ─ plan ─ art ─ sound ─ stills ─ render ─ qc ─ post
```

`node scripts/december/make.mjs <N> [--until=<stage>] [--from=<stage>] [--only=episode,trailer16,trailer9,short1,short2,short3]`

## Timebases — never mix them

- **SOURCE seconds** — time in the raw `Day_N.mp4`. Words in `words.json` and every anchor in the edit.
- **BODY seconds** — time on the cut, graded mezzanine `december-public/dayNN/body.mp4` (30 fps CFR).
- **FRAMES** — 30 fps, on the timeline of the piece being rendered (episode, trailer, short). Everything
  in `plan.json` is frames. Picture and sound read ONLY `plan.json`, so they can never drift.

## Files

```
december/
  PIPELINE.md  STANDARD.md  DESIGN.md  CHECKLIST.md
  series.json                      guide parsed: 30 days + opener (scripts/december/guide.mjs)
  edits/dayNN.json                 the editorial decisions (Edit in src/December/types.ts)
scripts/december/                  the stages (below) + lib.mjs
src/December/                      Remotion: types.ts theme.ts fonts.ts (lead) · episode/ (kit) · promo/ (trailer+shorts)
src/december-entry.tsx             registerRoot; compositions Dec-Episode, Dec-Trailer-16x9, Dec-Trailer-9x16, Dec-Short
december-public/                   the ONLY public dir these renders use
  brand/ fonts/ audio/ outro/      shared, committed-size assets
  dayNN/body.mp4 body.json plan.json face.json film.mp4 art/*.jpg audio/*.wav matte/…
.tmp/dec/dayNN/                    scratch: wavs, whisper json, draft, logs (never read by Remotion)
out/december/DayNN/                deliverables
```

## Stages (`scripts/december/<stage>.mjs <N>`), each resumable and idempotent

1. **ingest** — find the raw file; `ffprobe`; write `.tmp/dec/dayNN/source.json` (path, duration, fps, size);
   `audio48k.wav` (mono, untouched) and `audio16k.wav`.
2. **transcribe** — whisper.cpp (`.tmp/whisper/Release/whisper-cli.exe`, `ggml-large-v3-turbo-q5_0.bin`,
   `-ml 1 -sow`, in windows of 12–28 s cut on silence, one at a time, `-t 3`, NO `-dtw` — it stalls on this
   build — and no render lock: whisper is the critical path) → `words.json`:
   `{ words: [{ i, text, start, end }] }` in SOURCE seconds. Then refine every word edge against the
   voiced runs (`silencedetect` at −38 dB / 0.12 s on the cleaned track): a word may not start in silence
   before its run or end after it; `silences.json` keeps the gaps. Whisper never runs twice for a day
   (cache on the wav's size + mtime).
3. **draft** — the editor's worksheet, `.tmp/dec/dayNN/draft.md` + `draft.json`:
   phrases split at pauses ≥ 0.35 s (`p001 [w0–w11] 0.42–4.10 (gap 0.8) "…"`), each matched to the guide
   sentence it is closest to (with the guide's wording alongside, so mis-hearings are obvious); flags:
   `RETAKE?` (a phrase whose first 3+ words repeat within the next 20 s), `FILLER` (um/uh/you know),
   `DEAD AIR` (gap > 0.9 s), `OFF-SCRIPT`, `SCRIPTURE` (matches a KJV verse quoted in the guide);
   loudness strip per phrase; a face box (`face.json`, median of ~40 sampled frames).
4. **cut** — edit `keep` ranges → `body.mp4` + `body.json`. Every in/out snaps to the nearest silence
   (in: 0.08 s before the first voiced sample, out: 0.14 s after the last). Picture: hard cuts (the plan
   hides them with a reframe). Audio: 25 ms equal-power crossfade at each join, never a click.
   Grade and voice chain baked here (see DESIGN.md §Grade, §Voice). `-r 30 -g 15 -pix_fmt yuv420p`,
   CRF 16. `body.json`: `{ duration, segments: [{ src: [a,b], body: [a,b] }], words: [...BODY seconds, fixed text] }`.
5. **plan** — edit + series + body → `december-public/dayNN/plan.json` (Plan in types.ts): anchors resolved
   to frames, captions paged, camera keys, cue list validated against the collision rules, trailer and
   shorts timelines, music cue sheet. Fails loudly on a rule break (overlapping takeovers, a cue outside
   its segment, a caption line > 34 characters in 9:16…). Prints the running order with timecodes.
6. **art** — generated illustrations named in the edit (`art[].prompt`) through the Codex CLI
   (`codex exec` + its image tool, one image per call) into `december-public/dayNN/art/`, plus the day's
   film clip (`film.mp4`) cut from the film master. Resumable; never regenerates an existing image.
7. **sound** — score + SFX + voice for every piece, mastered (`december-public/dayNN/audio/`).
8. **stills** — review frames for every cue (in + hold) of every piece → `out/december/DayNN/qc/`.
9. **render** — one piece at a time through `scripts/with-render-lock.mjs`, `--concurrency=3`,
   `--timeout=420000`, hard-linked minimal public dir.
10. **qc** — ffprobe, EBU R128, per-frame luma scan for black/white runs, contact sheets, `DayNN_QC.md`.
11. **post** — SRT/VTT/TXT, thumbnail, `DayNN_socials.md`.

## Production order per day (settled 26 Nov 2026, after the producer's correction round)

The producer sees a PICTURE after each step and says what to correct before anything long is rendered:

1. `cut.mjs N` — grade N3-C from `december/grade.json` (`skinY` 0.44, `maxLift` 1.5: the face is never
   lifted above 1.5× its recorded median luma, or the darkest recordings read as a spotlight; per-day
   `days.N.warm` 1–8 turns skin a touch toward orange). The measure gate must print ALL PASS, or the failing
   checks are inspected by eye and named with `--accept-grade=<check,…>` and noted in `edits/dayNN.notes.md`.
   `full.mp4` can be deleted once the body is cut.
   **Studio grade (from 26 Nov 2026, Days 3 and 4 onward where `days.N.grade` = `"studio"`):** the producer
   reopened the grade ("as if shot with a very good sony camera … natural … not heavily edited") and chose
   look B. `scripts/december/grade/studio.py` — `measure` (the scopes as numbers: black level, face / wall
   luma, skin hue and chroma on the vectorscope, clipping), `prepare` (24 moments of the recording → the fit:
   true black, face to ~0.43 but never over 1.5× its recorded median, wall held, highlights eased, skin turned
   toward the skin-tone line, white balance left alone because the white print measures neutral) → ONE
   `work/dayNN/studio/grade.cube` over the whole picture, and `check` (the same moments of the graded master
   against the fit; PASS / FAIL gate like N3's). Options for a new day: `studio.py look <raw.png> <out.png>
   --look A|B|C` on a few frames, or the 12 s A|B|C clip (scratch `studio/clip.mjs` idea).
2. `plan.mjs N` — camera v2 is the default (locked-off frame per shot; side captions move him aside at an
   edit point, with one fixed framing per caption set by his nearest lean toward the words). `"camera": "v1"`
   in an edit keeps the old follow-and-slide. Point lines over 26 characters warn: break them with `|`.
   The last line of a short holds 8–24 frames after his last word; the trailer's `button` 12–26 — and never
   into ANY other sound of the recording (`silences.json` voiced runs, mapped to body frames): he makes little
   sounds the transcript has no word for, and a hold that reached one ended the piece on a clipped syllable
   (Day 1 short 3, Day 2 short 3). A short sound within 6 frames of the word is the word's own tail and is kept.
   Check with the frame-by-frame level of the last second of each FINAL file, not only the plan.
   A promo line also never leaves its TAKE: no lead-in, hold or ending crosses a hard cut of the body (past it
   he is in another pose: Day 2's trailer jumped to it for its last eight frames before the end card). If
   that leaves under 8 frames after the last word the planner warns: end the short on another line.
   **Shorts camera v2:** the 9:16 window is narrow and he sways. `scripts/december/grade/headx.py
   <work/dayNN/n3/cap.mkv> <work/dayNN/headx.json>` (10 s) measures his head on every frame; the planner then
   gives each short line ONE steady frame sized to hold his whole sway, or — when he moves too far for any
   steady frame — a patient frame that moves only when he pushes past a dead zone. Without headx.json the
   planner falls back to the old two keys, which cut into his face at the frame edge on every day: run
   headx.py before `plan.mjs`.
3. `matte.mjs N --force` — trailer cut-outs. ALWAYS before the sound: the sound step refuses a cut-out
   shorter than its line (a stale one silences the end of the sentence).
4. `sound.mjs N` (or `promo-sound.mjs N` for trailer + shorts only).
5. `layout-picture.mjs N` → `out/december/DayNN/preview/DayNN_layout_01.jpg` — **checkpoint picture**.
6. `render.mjs N --only=trailer16,short1` (+ `--frames=a-b` for an episode minute; the stretch's sound now
   starts at the stretch) — **checkpoint video**.
7. After the producer's word: `render.mjs N` (all six) → `post.mjs N` → `qc.mjs N` → `phone-previews.mjs N`.

Before step 6, review EVERY beat as stills (`dev-stills-episode.mjs --day=N --auto --proxy`,
`dev-stills-promo.mjs N --auto`, `review-sheets.mjs`), not only the layout picture's 20. Look at the 9:16
trailer's film beats in particular: a face close-up does not survive the side crop — give that beat a
vertical-only moment (`"from9": <seconds>, "focusX": <0–100>`; the 16:9 cut keeps `from`).

`matte.mjs` queues for the machine lock by itself: beside a long render it waits for hours. Run prep steps
in `chain.mjs --locked …` when they must not wait.

Never trim a speaker's sentence to tidy its wording — ask the producer instead.

## Machine rules (learned the hard way on this laptop: i5-8350U, 16 GB, ~18 GB free)

- ONE heavy job at a time: every Remotion still/render and every whisper run goes through
  `node scripts/with-render-lock.mjs …`. Never two renders, never whisper beside a render.
- ffmpeg via node `spawn` with an args array (Git Bash mangles filter strings; PowerShell quoting too).
- Long jobs run detached with a log in `.tmp/dec/`; Bash background tasks die at 10 minutes.
- Remotion copies the whole public dir per bundle: build a hard-linked minimal public dir per job
  (see `scripts/episode/make-public-min.mjs`) and delete the bundle afterwards. Check free disk first.
- `.tmp/.gitignore` must contain `*` (Tailwind's scanner chokes on binaries there).
- Fonts are self-hosted (`december-public/fonts`, upright full TTFs); gstatic times out mid-render.
- After every render: luma scan + contact sheet of the FINAL mp4 (stills have lied before).
- Never `cd` into an output folder (Windows cannot delete a cwd).
