# Compiling an Edit into a Plan (`scripts/december/plan.mjs`)

Inputs: `december/edits/dayNN.json` (Edit), `december/series.json` (the day + the next day),
`december-public/dayNN/body.json` (segments, words in BODY frames, face), `film.mp4` length.
Output: `december-public/dayNN/plan.json` (Plan). Types: `src/December/types.ts`. All numbers are
frames at 30 fps. The picture, the sound and the matte job read only this file, so every timing that
two of them must agree on is fixed HERE, as a constant, not chosen twice.

## Anchors

`"w123"` → the BODY frame where word 123 starts (via `body.json` words, which keep their source id `i`).
`"end:w123"` → where it ends. `±seconds` offsets apply after. An anchor on a word that was cut is a
compile ERROR naming the cue. A `Span` must lie inside one or more consecutive kept segments.

## Shared timing constants (picture and sound both use these — exported from `scripts/december/lib.mjs` as `T` and mirrored in `src/December/timing.ts`)

| Name | Frames | Meaning |
|---|---|---|
| `DOOR_IN` | 16 | door of light opening (content readable from frame 10) |
| `DOOR_OUT` | 10 | door closing |
| `TITLE_DUR` | 165 | episode title sting; black breath 0–10, door at 10, title lands at 26 |
| `TITLE_DUR_TRAILER` | 84 | trailer sting; door at 4, title lands at 16 |
| `SLATE` | 60 | `FROM THE FILM` slate chip at the head of a film section |
| `IDENT_DUR` | 135 | |
| `CHAPTER_DUR` | 84 | numeral lands at +12 |
| `SUB_DUR` | 135 | button press at +40, bell at +52 |
| `TEASER_DUR` | 120 | |
| `KEYWORD_DUR` | 54 | lands at +0 (on the word) |
| `RECAP_DUR` | 200 | lines at +30, +70, +110 |
| `NEXT_DUR` | 270 | end card; theme music full |
| `END_DUR_TRAILER` | 102 | title lands at +10 |
| `END_DUR_SHORT` | 75 | |
| `OUTRO_DUR` | 219 | the on-file sign-off clip `outro/LikeShare_16x9.mp4` |
| `LEAD` | 2 | frames of picture before a line's first word |

## Episode

Sections, in order: one `cold` per hook line → `title` → `film` (if `edit.film.play`) → `body` → `outro`.

- **cold**: `bodyFrom` = the line's first word − `LEAD`; `dur` = speech + hold (default 4 frames);
  `words` relative to the section; `big[]` from the line's `big` (frame = its `on` word, default the
  first `*stressed*` word; side = the wider free side of the wall: right when `face.x < 0.5`);
  `cam`: tight on the face, 1.25 → 1.30 over the section. The same footage also plays later in the body.
- **body**: `dur = body.frames + NEXT_DUR − 20`. The body video ends at `bodyFrames`; the `next` cue
  (`from = bodyFrames − 20`, `dur = NEXT_DUR`) is an opaque takeover that covers the frames after the
  video runs out. `bodyAt` = the body section's `from`.
- **outro**: `OUTRO_DUR`.

### Camera over the body (`cam`, `cuts`)

- `cuts` = every `"cut"` join. `"soft"` joins keep the framing.
- Framing per stretch between cuts: start `medium`; then cycle so neighbours differ by ≥ 11%:
  a stretch under 6 s → `tight`, over 20 s → `wide`, otherwise alternate `medium`/`wide`; never the
  same framing twice running (if the rule repeats one, take the next in wide→medium→tight→medium).
- View: `x = face.x`, `y` chosen so the eyes (`face.y − 0.02`) sit on the upper-third line; clamp both
  so no edge shows (`x, y ∈ [0.5/s, 1 − 0.5/s]`).
- **Follow**: he sways (head x 0.26–0.62 on Day 1), so `face` is not a constant: `body.json` carries
  `track: [[bodyFrame, x, y], …]` (every 15 frames). Low-pass it (≈ 1.5 s, zero-phase) and give it a
  dead-zone of 0.02 so the camera does not twitch; the view follows the smoothed head at `medium` and
  `tight` (and in cold/promo lines), emitted as `ease: "linear"` keys every 15 frames; at `wide` (s = 1)
  there is nothing to follow. Never restart the follow smoothing across a `cut` (the first key after a
  cut is already on the head). `plan.face` stays the median, for layout decisions (free side).
- Stretches over 8 s creep +2.5% (ease in-out). `snap` cues: +6% in 5 frames, back over 20.
- Side cues (`point`, `keyword`, `art` side): ease 14 frames to `s = 1.25` with the face on the third
  opposite the cue's side (clamped), hold for the cue, ease back 14 frames (or cut back if a `cut` falls inside).
- Emit keys only where something changes; `ease: "cut"` on cuts.

### Cues (body frames)

| Kind | `from` | `dur` |
|---|---|---|
| ident | at | `IDENT_DUR` |
| chapter | at | `CHAPTER_DUR`; `chipTo` = the next chapter's `from` (or body end) |
| scripture page | `read` start − `DOOR_IN` (or `at`) | to `read` end + 36 hold + `DOOR_OUT`; no `read`: 20 + words/2.6 s + 36 + `DOOR_OUT` (or `dur`) |
| scripture card | at | 150 (or `dur`) |
| point | at | to `to`, else `dur`, else max(90, 12·words + 60) |
| keyword | at | `KEYWORD_DUR` (or `dur`) |
| art | at | to `to`, else `dur`, else 180 |
| film | at | to `to`, else `dur`, else 120; `srcFrom = from·30` |
| subscribe | at | `SUB_DUR` |
| teaser | at | `TEASER_DUR` |
| response / prayer | at | to `to` + 20 |
| declare | at − `DOOR_IN` | to last lit + 45 + `DOOR_OUT` (or `to`) |
| recap | at | `RECAP_DUR` (or `dur`) |
| next | `bodyFrames − 20` | `NEXT_DUR` (automatic, always present) |

`lit[]` (scripture, point, declare): one frame per word of the text with the `*`/`**`/`|` markers
removed. With a `read`/`sync` span: align the text's words to the spoken words (normalise case,
punctuation, thee/thou spellings; longest-common-subsequence), take each matched word's start,
interpolate unmatched ones between neighbours. Without: start + 20, then 2.6 words/s. `hit` = `lit`
of the first word inside `**…**`. Response/prayer line windows come from their `sync` spans (no
`sync`: split the cue evenly).

Default `side` for side cues = the wider free side (right when `face.x < 0.5`).

### Validation (errors unless marked warn)

- lower-third class (`ident`, `scripture` card, `subscribe`, `teaser`) never overlap each other or a takeover;
  takeovers (`chapter`, `scripture` page, `art` full, `film`, `response`, `prayer`, `declare`, `recap`, `next`)
  never overlap each other; side cues (`point`, `keyword`, `art` side) never overlap each other or a takeover.
- ≥ 18 frames between consecutive cues of the same class; no cue in the first 36 frames of the body.
- `subscribe` never within 60 frames of a scripture, prayer or declare.
- takeover coverage ≤ 45% of the body (warn).
- a stretch > 18 s with no cue and no camera change (warn, with the timecode).
- every `art.plate` exists in `edit.art`; every scripture `text` contains at most one `**…**`.

### Captions

From `body.json` words. Pages of ≤ 2 lines × 38 characters; break at sentence punctuation, at pauses
≥ 0.45 s, and never leave a single word alone on a line if it can be avoided. `from` = first word − 4
(not before the previous page's `to`), `to` = last word + 8, stretched to the next page when the gap
is under 20 frames. The picture decides when captions hide.

### Music and sound (episode timeline frames)

Music: cold → `cold`; title → `theme`; film section → `story` (the film's own sound carries; bed out);
body → `teach`, with `word` under scripture pages, `pray` under prayers, `lift` under the declaration,
`theme` from the recap (or the `next` cue) to the end of the body; outro → `out` (the clip has its own sound).

Sound cues: `tick` every 30 frames through the cold open, `tickStop` at its last frame, `hit` (2) on each
`big` word; title: `door` at +10, `hit` (3) at +26; every takeover: `door` at `from`, `doorClose` at
`from + dur − DOOR_OUT`; scripture page: `paper` at +6, `swell` over the 45 frames before `hit`, `hit` (2)
at `hit`; chapter: `hit` (1) at +12; keyword: `hit` (1) at `from`; subscribe: `click` at +40, `bell` at +52;
declare: `drum` at the first lit word, `hit` (3) on the last; next: `hit` (2) at +26.

Audio file: `dayNN/audio/episode.wav`.

Where the voice comes from (the sound stage needs no other knowledge): cold sections → body audio
`[bodyFrom, bodyFrom + dur)`; film section → `film.mp4` audio from `srcFrom`; body section → body
audio from 0 at `bodyAt`; outro → the outro clip's audio. `film` CUES (b-roll) are silent.

## Trailer (`plan.trailer["16x9"]` and `["9x16"]` — same timeline, same audio `dayNN/audio/trailer.wav`)

Beats in the edit's order.
- **line**: from the body. `dur` = `LEAD` + speech + hold (default 8 frames; `cold` 4; `button` 20).
  `matte: true`, `clip = dayNN/matte/t<k>.mp4`, `clipFrom = 15`; and a `mattes[]` job
  `{ out, bodyFrom: lineStart − LEAD − 15, frames: dur + 30 }` (matte clips carry the range's audio).
  `words` relative to the beat, `stress` from `*word*` in `say` (the `say` text replaces the word text
  when the word counts match; otherwise keep the body words and warn). `cam` from the line's framings
  (default by mood: cold tight→tight, tension medium→tight, turn wide→medium, button tight→tight) as
  Views centred on the face — in 9:16 `s = 1` means the source height fills the frame.
  `big.from` = its `on` word (default the first stressed word). `snaps` = the last stressed word of a `cold` line.
- **title** `TITLE_DUR_TRAILER` · **film** `{ src: dayNN/film.mp4, srcFrom: from·30, dur, focusX (default 50) }`
  · **verse**: with `read` → `dur = DOOR_IN + speech + 30`, `read = { clip: dayNN/body.mp4, clipFrom, frames, at: DOOR_IN }`;
  without → 126 · **end** `END_DUR_TRAILER`.
- Captions: 16:9 ≤ 2 lines × 30 characters; 9:16 ≤ 2 lines × 18 characters, 2–4 words a page.
- Music: cold → `cold`; title → `theme`; tension → `story`; verse → `word`; turn → `lift`;
  button → a `silence` sound cue over the beat; end → `theme`. Sound cues as for the episode
  (`door` on title/verse/end, `hit` on big words and the title, `tick` through the cold line).
- Target 35–50 s: print the total and error outside 30–58 s.

## Shorts (`plan.shorts[]`, 9:16, audio `dayNN/audio/short-<id>.wav`)

Beats: the edit's `lines` in order (`matte: false`, `clip = dayNN/body.mp4`, `clipFrom` = line start −
`LEAD`), the `verse` beat placed in source order among them when it has a `read` (after the last line
otherwise), then `end` (`END_DUR_SHORT`). Consecutive lines that are also consecutive in the body merge
into one beat. `cam`: lines alternate medium→medium / tight→tight with a 2% creep. `title`, `post` copied.
Captions 9:16 rule. Music: lines → `teach`, verse → `word`, end → `theme`. Error outside 15–58 s.

## Printed report

The running order with timecodes for each piece (sections, cues, beats), the totals, coverage of
takeovers, every warning. The editor reads this before anything is rendered.
