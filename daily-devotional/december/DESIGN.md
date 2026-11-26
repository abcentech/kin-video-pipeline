# THE FATHER SHOWED UP — design bible (picture + sound)

One designer's eye over thirty episodes. Every piece (episode, trailer, shorts) is built from this
page. If something here is silent, ask: *does it serve a child who is waiting at a door?*

Audience: families — children 6–14 with a parent, and fathers. Tender subject (absent fathers).
Never loud for its own sake, never cute, never a template. Warm, cinematic, quiet confidence.
The presenter is the anchor: graphics serve what he is saying at that second, then get out of the way.

## The world: candle and clock

The series film *Eight O'Clock* gives us the world: a room with deep-teal walls lit by one candle,
a boy at a door, a steel watch stopped at eight. Everything we draw lives in that room's light.

| Token | Hex | Use |
|---|---|---|
| `ink` | `#05060D` | base black |
| `night` | `#07242A` | page/veil colour (deep teal-black) |
| `wall` | `#12505A` | teal accents, panels |
| `candle` | `#F2A33A` | light, rules, numerals, glow |
| `gold` | `#FFC500` | KIN gold — EMPHASIS ONLY (hero word, active caption word, wordmark) |
| `cream` | `#FFF4DE` | all body lettering (never pure white) |
| `ember` | `#E0392B` | YouTube/subscribe only |

Type: **Poppins 900** (titles, hero words; uppercase, tracking −1%), **Poppins 800** (captions, labels;
labels uppercase with +14% tracking), **Fraunces** (scripture, prayers, quiet lines). Self-hosted
(`december-public/fonts`). Minimum sizes at 1080p: 34 px body, 26 px labels. Word spacing in animated
spans uses `marginRight`, never flex `gap` in em.

### Three motifs — use them, don't invent a fourth

1. **The door of light.** Every takeover arrives the way the Father does: a vertical seam of warm
   light appears at centre and two dark panels swing/slide apart (14–18 frames, ease-out), light
   spilling first, content after. It closes the same way (10 frames). Hard cuts are for the cold open only.
2. **The dial.** A fine watch face: ring, twelve ticks, two hands. The hour hand rests on **eight**.
   It is the day badge (thirty minute-marks, day N lit, "DAY 1 · 30"), the bullet in lists (a tick
   that lights), the "fulness of time" device on scripture, and the loader on the end card.
   It ticks (sound) only when it is the subject.
3. **Candle light.** Takeover pages are never flat: a soft amber glow breathes (±6%, 3.2 s period,
   noise-driven, deterministic from the frame), 30–50 dust motes drift upward through it, edges fall
   to `night`. Nothing on screen is ever perfectly still for more than 12 frames.

## Layout (1920×1080; 9:16 rules at the end)

- Title-safe: 96 px left/right, 60 px top. Caption band: bottom **150 px**; caption block bottom at 56 px.
- Brand layer, always on over the body: KIN lockup (`brand/kin_logo_full.png`, 62 px high, 90% opacity)
  top-right; day dial + `DAY N · 30` top-left; wordmark gauge `KIDSINSPIRINGNATION` bottom-left at
  18 px (letters turn gold with episode progress). Brand layer fades to 0 under full takeovers except the logo.
- The presenter stands centre (face ≈ 0.47, 0.36 of frame; `face.json` has the day's truth). Free wall:
  left of x 0.27 and right of x 0.72 at 1.0. Side content goes on the side the camera opens (below).
- Lower-third class sits with its bottom edge ≥ 170 px. Nothing ever covers the eyes or mouth.

## Camera (virtual, on a locked 1080p shot — applied in Remotion, never baked)

- Framings: `wide` 1.00 · `medium` 1.12 · `tight` 1.25 (never above 1.30). Eyes on the upper-third line.
- Every cut flips framing by ≥ 12% so no join ever reads as a jump cut; never the same framing twice running.
- Any segment over 8 s creeps (+2.5% over its length, ease-in-out). On a `snap` word: +6% in 5 frames,
  back over 20. For a side card: 14-frame ease that puts him on the opposite third (zoom ≥ 1.16 so no
  edge shows).
- **Nothing tonal is ever laid over the recorded picture**: no vignette, no scrim, no veil, no floor of shade
  (the producer: "leave our background as it is from the raw video"). A graphic that needs contrast carries its
  own plate or edge: the logo and day badge sit on small `night` plates, prayer lines ride a plate like the
  captions, side text has a tight dark edge. Full-screen cards and art plates are their own picture and may be
  graded freely. Check: a frame decoded from the final mp4 must measure the same wall and shirt as the same
  frame of `body.mp4`.

## Captions (burned in — the house "golden frame")

Poppins 800, 36 px, cream on a `rgba(0,0,0,0.55)` rounded box hugging the text, max two lines of 38
characters, bottom-centre in the band; the spoken word turns `gold` with a 2 px lift and soft glow.
Pages break at punctuation and pauses, never mid-phrase; a page never shows a word more than 0.25 s
before it is spoken. Text = proof-read words (guide wording, KJV for scripture), never raw whisper.
Captions hide only under takeovers that carry the same words themselves (scripture page, prayer,
declaration, recap, end card, film playing with its own sound).

## The running order (episode)

1. **Cold open** (5–12 s). His most arresting line, `tight`, hard in on the first syllable (no logo, no
   fade). Its key words land as giant Poppins 900 lettering in the free wall beside him (2–4 words,
   one gold), on the syllable. Music: one held low note + the watch ticking. Ends on the stressed word:
   hard cut to black, tick stops.
2. **Title sting** (≈5.5 s). Black, one breath of silence. The door seam opens: series name in gold
   small-caps (`THE FATHER SHOWED UP`), the day title large in cream, the dial winding to day N,
   `TUE 1 DEC · GALATIANS 4:4–5`. Music theme enters on the door.
3. **Film** (when the edit asks; 30–80 s). Slate chip `FROM THE FILM · EIGHT O'CLOCK` 2 s, then the day's
   clip full-frame with its own sound, a quiet corner tag throughout. Door closes on it into the body.
4. **Body** — presenter + cues (below). Speaker ident within the first 8 s.
5. **Close** — recap → declaration → end card → the on-file Like/Share/Subscribe sign-off (7.3 s).

## Cues — what each one is

Layer order, bottom to top: video → look → side content → lower-third class → takeovers → captions → brand.
One lower-third-class cue at a time, one takeover at a time, never both. ≥ 0.6 s between cues. Something
changes (cue or camera) at least every 18 s. Takeovers cover ≤ 45% of the body.

| Cue | Class | What it is |
|---|---|---|
| `ident` | lower third | Name in cream 900, role line in candle caps; a thin candle rule draws left→right; 4.5 s. |
| `chapter` | takeover (short) | Door seam wipe; giant outline numeral (candle, 420 px) lower-left, `TRUTH 1 OF 3`, the truth's title in cream 900 (max 2 lines); 2.8 s; then it collapses to a chip under the day dial that stays for the chapter. For non-numbered sections (`THE WORD`, `RESPONSE`, `LET'S PRAY`) the numeral is replaced by the dial. |
| `scripture` (page) | takeover | See "Scripture" below. |
| `scripture` (card) | lower third | A passing reference: ref chip + ≤ 14 words in Fraunces on a `night` plate with a candle hairline; 4–6 s. |
| `point` | side | The takeaway of the moment, ≤ 12 words in 2–3 lines, Poppins 900 54–64 px cream directly on the wall (no scrim, no box: a tight dark edge on the letters); words arrive on his syllables when anchored to speech; `*one*` gold word; a candle rule draws under it. |
| `keyword` | side | 1–3 giant words (Poppins 900, up to 190 px) hitting on the spoken word; 1.2–2.2 s. Rare: ≤ 4 per episode. |
| `art` | takeover or side | A generated painting that breathes (see "Illustration"). |
| `film` | takeover | A silent cutaway to a film shot while he keeps talking (b-roll), door in/out, corner tag. |
| `subscribe` | lower third | See "Subscribe". |
| `teaser` | top pill | `STILL AHEAD` in candle caps + ≤ 8 words; top-centre; 4 s. Once, early. |
| `response` | takeover | Two leaves of paper, `FOR A CHILD` / `FOR A FATHER`; each sentence writes on (left→right mask) as he says it. One leaf if he gives only one. |
| `prayer` | takeover (veil) | The frame darkens to candlelight (veil 60%, he stays visible), `LET'S PRAY` chip; each prayer line in Fraunces 52 px (upright; the face has no italic), centred low-middle, fading in phrase by phrase with his voice — no bounce, no gold flashing. |
| `declare` | takeover | `SAY IT WITH US` chip → the day's declaration lands word-by-word, Poppins 900, full frame, the door bursts fully open behind it in light; the key phrase gold. Holds 1.5 s after the last word. |
| `recap` | takeover | `TONIGHT` + the three truths, each tick lighting on the dial as its line arrives; 6–7 s. |
| `next` | takeover | End card: `TOMORROW · DAY N+1`, its title, its scripture ref; subscribe button; the prayer ribbon `Prayer Service · Saturdays 7:30pm · KidsInspiringNation.t.me`; `KidsInspiringNation.org`; when the edit sets `safeguard`, the quiet line `If someone is hurting you, tell a safe adult. KIN line +234 812 267 3417`. 8–10 s over the music theme. |

### Scripture — the Word must breathe

The door opens on a `night` veil (he stays 18% visible behind it — the Word is spoken *by a person*).
Candle glow breathing at the left margin, motes rising. Top-left: the dial and the ref in gold caps.
The verse in Fraunces 60–72 px `cream`, set in sense-lines (≤ 5 lines a page; long readings paginate with
a soft cross-push). Every word starts at 34% opacity and **lights as he reads it** (word-synced; if he
does not read it aloud it lights at 2.6 words/s). The `**emphasised**` phrase — the words the teaching
hangs on — turns `gold`, scales to 112%, and a hand-drawn underline strokes in beneath it. When the
reading ends the rest falls to 22% and the phrase holds alone for 1.2 s, then the door closes.
Text is ALWAYS the KJV from `series.json`/the guide, never whisper's hearing.
Signature flourish, at most once an episode, on the day's main text: the dial's minute hand sweeps to
twelve as the phrase lands and the glow blooms (Day 1: "the fulness of the time").

### Illustration — paintings that are alive

`art` plates are generated per day in ONE style (the prompt suffix is fixed in `scripts/december/art.mjs`):
painterly gouache storybook, warm candle-amber light against deep teal night, West African family
world, the story *happening* in the frame (a person acts), generous empty sky or wall for type, no text.
In motion: a slow push or drift (never both axes), the plate's named lights live (`flicker` for flames
and lanterns, `twinkle` for stars, `glow` for windows/doors, `rays` for a door of light), motes in the
light, a breathing vignette. `full` = door opens to the plate full-frame with an optional caption line in
Fraunces; `side` = the plate sits in a rounded window (36 px radius, 6° tilt settling to 2°, soft shadow)
on the open side of the wall while he keeps teaching. Never a stock-photo look, never icons, never clip-art.

### Subscribe — part of the film, not a sticker

Once at 30–45% of the body, in a breath between thoughts: from the lower-left, the real YouTube mark
(`brand/icons/youtube.svg`) + `@KidsInspiringNation` + an `ember` SUBSCRIBE button; the button presses
(scale 0.94, 3 frames), becomes `SUBSCRIBED`, the bell swings twice (soft bell in the mix); the line
above reads `A new devotional every day this December`. 4.5 s, then it folds away along the candle rule.
A second, smaller nudge at 65–80%: `Share this with a father` with the share arrow. Never over a
scripture, a prayer or the declaration.

## Grade (baked in `cut`)

**The series grade is N3** (`scripts/december/grade/`): N2's colour with a per-frame person matte and a
fitted skin lift. After the Day 1 finals in N2 the producer asked for skin "a little brighter" and a grade
that does not stay behind when he moves ("when the presenter moves, it moves out of the pixels that has the
colour grade"). N2's two masks are shapes placed from a face position sampled twice a second, so a raised
arm or a lean left them (measured: 46 % of his skin outside the shape with one arm up, 76 % with both).
N3 has no shapes:

- `n3.py matte` writes a person matte for EVERY frame of the recording (Robust Video Matting, 960x540,
  lossless) — that is the only mask;
- inside it, `him.cube` = N2's colour + a lift on the mid tones of all of him (0.14) + a fill on his skin that
  is fitted per recording so the median of his face lands on the same brightness every day (display luma
  0.36; Day 1, dark cap, needs k 0.87; Day 2, white cap, k 0.15). Blacks and highlights do not move;
- outside it, `wall.cube` = exactly N2's wall. Bright neutral pixels get no lift from either LUT, so the
  matte's edge cannot draw a halo.

`n3.py measure` gates every fresh master (skin hue and chroma, wall unchanged against N2's wall, no halo,
face never darker than N2, blacks, shirt hue, colour path); `bench.py` makes raw | N2 | N3 sheets with the
numbers for any moment; `compare.mjs` makes a before/after clip. `DEC_GRADE=n2` selects N2 as it was.

**N2** (`scripts/grade-n2/`, README there; owned by the month-intro film's session, never edited from here).
The producer approved it on the month-intro film and chose it for the devotionals on 2026-11-25, after
rejecting three grades made here (v1 "whitish", v2 "champagne gold and ash painted on", v3 look C).

What N2 does: each clip is measured (white balance from its own wall, one black level, skin fitted to the
skin line) and normalised to the reference room, then one fixed transform runs — natural deep-brown skin
with moderate chroma, speculars rolled off, the yellow wall patches calmed to about a third of their
chroma outside a subject matte, neutral blacks, no global tint, and a small face-tracked soft light on
his face. No scrim, vignette or veil. It is three 3D LUTs blended by two tracked masks.

In `cut.mjs`: `ensureN2()` runs `n2.py prepare` into `december/work/dayNN/n2/`; the master pass uses
`n2Graph` + `n2MasksAt`; `n2.py measure` then checks the fresh master against the raw and the stage stops on
a FAIL. `DEC_GRADE=v3` selects the old look C (kept only for reference). The master remembers its grade in
`full.grade.txt`, so a cached master of another grade is never reused.

Rules that outlive any grade: never tint globally, never replace or darken the recorded wall, and prove
colour by measuring a frame decoded from the FINAL mp4 against the same frame of the master (two matrix
bugs hid from still-vs-source checks: piped raw frames in `cut`, and Remotion's JPEG frames with
`colorSpace: "bt709"` — finals render from PNG frames).

## Voice (baked in `cut`)

Source peaks at 0 dBFS, −11 LUFS: `adeclip` → high-pass 80 Hz → RNNoise (`scripts/episode/rnnoise.rnnn`,
mix 0.85; never stack afftdn/anlmdn) → −2 dB @ 220 Hz → +2 dB @ 3.2 kHz → de-ess → compress 3:1 →
limiter → **−16 LUFS** dialogue. Final masters: **−14 LUFS**, true peak ≤ −1.3 dB.

## Sound

Warm and human: felt piano, strings pad, a low kalimba; sampled instruments from the studio
(`scripts/viral/studio`), never the game-like synth. One series theme (four bars, D major, 66 bpm) heard in
full on the title and end card and as fragments under chapters. Under speech the bed sits 22 dB below
the voice and never fights it; under prayer it is a single held pad; under the declaration it lifts.
SFX, all soft: the watch tick (cold open, title, dial moments), an airy swell + low thump for the door,
a paper breath for scripture, a click and a small bell for subscribe, one deep drum on the declaration.
Whooshes 9 dB under hits. Silence is allowed — the breath before the title, the hold after the declaration.

## Trailer (16:9 and 9:16, 35–50 s)

A trailer, not a summary: tease, don't teach. Shape: **cold** (one line, ≤ 6 s, hard cut) → **title**
(the sting, 2.8 s) → **tension** (3–5 short lines that build the ache, with 1–2 film shots between them)
→ **verse** (the day's text as he reads it, 4–6 s) → **turn** (1–2 lines: the answer begins) → **button**
(one short line to the viewer, music out) → **end** (`DAY N` · title · `Watch tonight's devotional` ·
`@KidsInspiringNation`). The presenter is matted (RVM) so giant words can stand BEHIND him (2–4 per
trailer, one gold hero in the turn) and the wall behind him can fall to candle-lit `night`.
Cut only on silence. Never caption a word you cannot hear for certain.

## Shorts (9:16, 20–55 s, three per day)

Each is ONE complete thought that stands alone with the sound off: (1) the Word, (2) the strongest
truth, (3) the prayer/declaration. Layout 1080×1920: top band (y 90–330) series chip + a two-line hook
title that is on screen from frame 0; presenter window 1080×1350 from a 4:5 crop centred on his face
(scale ≤ 1.25, camera rules apply); captions large (Poppins 900, 64–76 px, 2–4 words a page, active word
gold) centred at y ≈ 1230–1420; nothing important below y 1500 or right of x 930 below y 1100 (platform
UI). Opens on the door of light, ends on a 2.5 s card: `Full devotional on YouTube` · `@KidsInspiringNation` ·
`DAY N · title`. A progress hairline in candle at the very top.
