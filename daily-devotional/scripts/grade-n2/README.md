# grade-n2 — the approved "N2" presenter grade, as a reusable package

N2 is the grade the producer approved for **THE FATHER SHOWED UP** (Dec 2026 intro), in the producer's words "doesn't
look like an overlay". It gives:

- natural, deep-brown skin on the skin line (about 123° on the Cb→Cr vectorscope scale) with moderate chroma;
- speculars rolled off, and the shadow side opened slightly (skin only);
- yellow/ochre wall patches calmed to about ⅓ of their chroma, outside a subject matte, with luma untouched;
- neutral blacks, no global tint, and a wall at about +5 R−B;
- a small soft-light face window. It is face-tracked light on the face, not a vignette, scrim or veil.

This folder generalises N2 to any recording from the same room, presenter and wall, whatever the shirt.

**How it does it.** Each clip is **measured** and **normalised to the reference recording**, then the exact approved
N2 transform runs:

- White balance comes from the clip's own neutral wall. It is chromaticity only, so the wall keeps its recorded
  brightness.
- Black is one level taken from the clip's own darkest tones. It is not per channel, because a crimson shirt's folds
  would otherwise tint everything.
- The skin pull target is fitted per clip so this clip's skin lands on the line.

Everything is per-pixel, so it bakes into three 3D LUTs, blended by two tracked masks:

| LUT | Used where |
|---|---|
| `base.cube` | normalise + N2, used on him (inside the subject matte) |
| `patch.cube` | normalise + wall-patch calm + N2, used everywhere else |
| `window.cube` | base + the face window at full strength, blended in by the window mask (peak 0.46) |

The masks are 240×135 each, stacked into one 240×270 gray frame per video frame:

- **subject matte** (head + cap + torso, from the face track) keeps the patch calm off him, his shirt print and his cap;
- **face window** alpha is the film's ellipse at ×0.72 size.

Files:
- `n2core.py` — the colour maths: N2, the patch calm, normalisation, LUT writer, masks, ffmpeg graph, numpy twin.
- `n2.py` — the command line.
- `n2.mjs` — the Node drop-in: `n2Graph`, `n2MasksAt`, `N2_ENC_TAGS`.
- `ref.json` and `ref_face.json` — the reference room (`fatherhood-public/src/day0_30.mp4`).
- `proof.py` — the review sheets used to prove it on the devotional raws.

Python is `studio/.venv/Scripts/python.exe -I` (numpy, Pillow, OpenCV, MediaPipe). The face model is
`studio/models/blaze_face_short_range.tflite`, the same one the devotional `face.py` uses.

## Commands

```bash
PY="studio/.venv/Scripts/python.exe -I"
# once, already done: the reference room
$PY scripts/grade-n2/n2.py calibrate fatherhood-public/src/day0_30.mp4

# per clip: measure + LUTs (≈ 1–2 min; uses the pipeline's face.json if you pass it, else tracks the face itself)
$PY scripts/grade-n2/n2.py prepare inbox/Day_1.mp4 <work_dir> --face december/work/day01/face.json

# standalone bake to a graded mezzanine: CFR 30, BT.709 limited, tagged, x264 CRF 16, raw audio as AAC
$PY scripts/grade-n2/n2.py bake <raw.mp4> <out.mp4> --face <face.json> [--work <dir>] [--ss 40 --t 15] [--no-audio]

# check a clip automatically: before/after table + PASS/FAIL (exit code 1 on any FAIL)
$PY scripts/grade-n2/n2.py measure <raw.mp4> <graded.mp4> --face <face.json> --work <dir> [--ss <same as bake>]

# check ANY delivered MP4 against a known-good PNG of the same frame (the Remotion JPEG/BT.601 trap, below)
$PY scripts/grade-n2/n2.py check-mp4 <video.mp4> <reference.png> <frame_number>

# the face track on its own (same format as the devotional face.json)
$PY scripts/grade-n2/n2.py track <raw.mp4> <face.json>
```

`prepare` writes these files to `<work_dir>`: `norm.json` (the measured gains, black level, skin target and source
paths), `base.cube`, `patch.cube`, `window.cube` (65³, tetrahedral) and `graph.txt` (the filtergraph for this
work_dir).

## Parameters

From `n2core.py`. Change them only with a new approval.

| what | value | meaning |
|---|---|---|
| `N2.wb, bp, gamma, toe, shoulder, top` | (1, .993, 1.016), .092, .84, .07, .77, .92 | the approved tone: black point, mid lift for dark skin, soft toe, rolled shoulder (whites never clip) |
| `N2.wall_down` | .08 | a wide bell that holds the bright wall back a touch (texture keeps its contrast) |
| `N2.sat / skin_sat` | .92 / 1.16 | overall chroma slightly down; skin moderately up (B2 was 1.42: "boosted") |
| `N2.skin_target, skin_pull` | 137 → **fitted per clip**, 1.3 | the pull's target is fitted per clip (`fit_skin_target`) so the clip's skin, through N2 + the window, reads what the APPROVED film reads (`ref.json skin_aim`, 128.9 on the estimator's scale = 124.6° measured on the film) |
| `N2.skin_cmax` | (.075, .12) | NEW: skin is capped by chroma, so a crimson/red shirt (same hue, 5–10× the chroma) is never pulled toward orange |
| `N2.skin_hi, skin_kh, skin_lo` | .58, .40, .02 | speculars: soft knee above 40 %, ×0.58; shadow side +2 % (skin only) |
| `N2.hi_desat, hd0` | .88, .60 | highlight chroma out (the white tee read lilac on this camera), skin excepted |
| `N2.warm, cool, hi_cr, stone` | .016, .012, 0, 0 | the faintest split; no blue in the blacks, no stone tint |
| `PATCH` | hue 118–135 → 190–205°, chroma .025–.055, luma .30–.40, keep .30 | the ochre/yellow wall patches to 30 % chroma, luma untouched |
| `WINDOW` | win .46, rgb (255,231,206), wr .72 | the face window: W3C soft-light, alpha ramp 1/.84/.5/.16/0 |
| normalisation | per clip: black level, wall gains | `norm.json` (measured from 24 frames spread over the clip) |

## Colour-matrix rules (why reds went magenta, and how this package avoids it)

1. **Never let ffmpeg guess.** Every decode to RGB says `setparams=colorspace=bt709:…:range=tv` and then
   `scale=in_color_matrix=bt709:in_range=tv:out_range=pc`. Phone HEVC is BT.709 limited, but piped raw frames lose
   their tags, and swscale then defaults to BT.601. That moves reds toward magenta and orange.
2. **RGB work happens in full-range `gbrp`.** The LUTs expect 0..1 display-referred BT.709 RGB.
3. **Every encode states it both ways.** In the graph: `scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=…bt709…tv`.
   On the encoder: `-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv`
   (`N2_ENC_TAGS` in `n2.mjs`).
4. **Remotion.** `renderMedia` with the default JPEG frames and colorSpace "default" writes full-range BT.601
   (yuvj420p, tagged bt470bg/pc).
   - That is right only in players that honour the tags. In a player that assumes BT.709, golds and oranges move by
     about 9/255.
   - With `imageFormat: "jpeg"` plus `colorSpace: "bt709"`, the devotional session saw BT.601 pixels tagged BT.709:
     reds went orange (194,45,77 → 203,59,73).
   - Use `imageFormat: "png", colorSpace: "bt709"` for deliverables.
   - Remotion still leaves primaries and transfer "unknown". Fix that with a stream-copy remux:
     `-c copy -bsf:v h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0`.
   - `renderStill` is not affected, so a still-vs-source comparison hides the problem. Always decode the MP4 itself
     (`n2.py check-mp4`).

**Verified.**
- F16 film final path vs renderStill: ≤ 1.5/255 on orange, gold, green, skin and blue patches.
- The same frame from the old JPEG preview path, read as BT.709: up to 9/255.
- The `measure` command checks that the graded MP4, decoded as tagged, equals the numpy twin of the same transform on
  the explicitly decoded raw frame. It uses face, wall and shirt boxes, with tolerance 3/255 (`colour_path`). It also
  checks that the shirt keeps its hue (`shirt_dhue`, ±4°), which catches a red going magenta or orange.

## Self-test (paths)

```bash
node scripts/grade-n2/n2.mjs --selftest <work_dir>      # n2Graph with the cube folder absolute, absolute-with-spaces, relative
```
Expect three PASS lines. Rule: the cube path sits inside a single-quoted filter option, where a drive colon takes
exactly ONE backslash (`file='C\:/a b/base.cube'`). Two backslashes (`C\\:`) is what broke absolute paths. `n2core.graph`
always uses an absolute path built the same way.

## Results on the devotional raws (2026-11-25)

| | Day 1 (crimson shirt), 40–55 s | Day 2 (black tee, white cap), 110–122 s |
|---|---|---|
| measured gains / black | 1.000 1.001 0.988 / 25 → 34 | 0.997 1.002 0.992 / 14 → 34 |
| skin hue raw → N2 | 96 → 125.6° | 98 → 126.2° |
| skin chroma | 6.7 → 11.0 | 8.8 → 11.9 |
| wall R−B | +5.5 → +4.7 | +7.5 → +4.8 |
| yellow-patch p95 chroma | 21 → 5.9 (0.28) | 19.4 → 4.4 (0.22) |
| shirt hue | 90.6 → 90.4° (crimson kept) | (black: not graded) |
| colour path (graded MP4 vs numpy twin) | ≤ 0.9/255 | ≤ 1.2/255 |
| verdict | ALL PASS | ALL PASS (blacks +2.6 B−R, the navy tee) |

A deliberately wrong decode of the same Day 1 graded frame (BT.601 instead of 709) moves the crimson shirt patch
from 185/65/87 to 173/50/86, which the colour-path check would fail by about 12/255.

## How to verify a day

`n2.py measure` prints, at 4 moments, raw → graded:
- skin hue, skin chroma and face p98 (speculars);
- wall R−B and wall Y;
- the yellow-patch p95 chroma;
- black level and black cast;
- shirt hue;
- the colour-path error.

It then gives verdicts on the graded side, with these pass thresholds (`THRESH` in `n2.py`):

| check | pass |
|---|---|
| skin hue | 120 … 128° |
| skin chroma | 8 … 16 |
| wall R−B | +2 … +9 |
| black cast added by the grade (graded − raw, max−min of the darkest 1 % neutral pixels) | ≤ +3 |
| blue wash added (graded − raw, blue − red of those blacks) | −6 … +3 (a navy shirt stays navy) |
| face p98 | ≤ 200 |
| shirt hue shift (only when the shirt is coloured: chroma > 12) | ±4° |
| colour path | ≤ 3/255 |
| patch calm (graded/raw p95 chroma) | 0.20 … 0.55 |
| tags | bt709 / tv / yuv420p |

It writes `measure.json` and exits 1 on any FAIL. Review stills: `proof.py <raw> <work> <out.jpg> --face <face.json>`
gives raw | the devotional grade | N2 at 4 moments with 2× face crops.

## Known limits

- **Same room only.** The normalisation maps a clip onto the Day-0 room: the same wall, lamp and camera. A different
  room or wall colour needs a new `calibrate` and a look review.
- **Lighting changes inside a clip** are not followed; the measurement is one set per clip. A clip with a big light
  change, such as a door opening or the sun moving, should be split.
- **Shirts.**
  - Crimson and red keep their hue (the `skin_cmax` gate); on Day 1 the shirt hue moved by less than 1°.
  - A yellow, ochre or mustard shirt is protected only inside the subject matte. Sleeves outside the matte, such as
    arms stretched wide, would lose some chroma.
  - A very saturated orange shirt at skin-like chroma could catch some skin pull. Check `shirt_dhue`.
- **The masks follow a 0.5 s face track.** On very fast moves the window can lag a few frames. It is soft and only
  ×0.46, so it reads as light, not as a moving spot. The subject matte is generous around the head and shoulders.
- **Wall brightness.** The N2 tone curve lowers a very bright wall slightly. On Day 1 the wall went 183 → 171 Y
  (−7 %). The devotional v3 grade took it to 133.
- `n2.mjs` reimplements the mask maths in JS, with the same 5-px dilation and sigma-2 gaussian as n2core (matte within
  2/255 at p99, 4/255 max, of the Python masks after the bicubic upscale; checked 2026-11-25). Keep the two files in step if anything changes.

## Integration recipe for `scripts/december/cut.mjs` (10 lines)

```js
import { n2Graph, n2MasksAt, N2_MASK_W, N2_MASK_H, N2_ENC_TAGS } from "../grade-n2/n2.mjs";
const N2DIR = `${dir}/n2`;                                    // per day: run once before the full.mp4 pass
await run(PY, ["-I", "scripts/grade-n2/n2.py", "prepare", source.path, N2DIR, "--face", `${dir}/face.json`]);
// ensureFull(): swap the graph + the mask size; everything else (voice, -frames:v, -t, faststart) stays
const args = ["-i", source.path, "-f", "rawvideo", "-pix_fmt", "gray", "-s", `${N2_MASK_W}x${N2_MASK_H}`, "-framerate", "30", "-i", "pipe:0", "-i", voice,
  "-filter_complex", n2Graph(N2DIR, `fps=${FPS}:start_time=0,`, "out", GR.grain), "-map", "[out]", "-map", "2:a", "-c:v", "libx264", ...N2_ENC_TAGS];
// the mask writer: for (let n = 0; n < TOTAL_FRAMES; n++) enc.stdin.write(n2MasksAt(face.track, n / FPS));  (replaces maskAt)
// gradeStills(): same graph with input 1 = one 240x270 mask frame (n2MasksAt(face.track, t)) instead of the .pgm
// after the pass: run `n2.py measure source.path full.mp4 --face face.json --work N2DIR` and stop on exit code 1
```

Their DESIGN.md rules hold. The recorded wall stays as it is, apart from the calmed yellow patches and a neutral
balance. Nothing is baked that appears and disappears. There is no scrim, vignette or veil: the only spatial element
is the face-tracked light on his face, which their v3 grade also has.
