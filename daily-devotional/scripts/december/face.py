"""Face box of a recording (BlazeFace short-range via MediaPipe): median over 40 samples + a dense 2 fps track.

    studio/.venv/Scripts/python.exe -I scripts/december/face.py <video> <out.json> [samples=40]

One sequential decode at 2 fps (seeking an HEVC phone file 40 times is ~10x slower). Values are 0..1 of the
1920x1080 frame, y down. Writes
  x, y, h  : HEAD centre x / y and head height chin -> top of cap (what DayMeta/Plan.face wants), median of `samples`
  box      : median detector box (brow -> chin) {x,y,w,h}; head h = box.h * HEAD_K
  samples  : the 40 per-sample values (so drift is visible)
  track    : [[t, x, y, h]] every 0.5 s (head values, gaps filled, lightly smoothed) — the grade follows this
  hits/n   : detections / frames scanned
"""
import json
import subprocess
import sys

import cv2  # noqa: F401  (mediapipe needs it importable)
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import FaceDetector, FaceDetectorOptions

HEAD_K = 1.55  # chin-to-cap-top / detector box height (calibrated by eye on Day 1: cap top 0.157, chin 0.463 of frame height)
src, out = sys.argv[1], sys.argv[2]
NS = int(sys.argv[3]) if len(sys.argv) > 3 else 40
model = "studio/models/blaze_face_short_range.tflite"
W, H = 1920, 1080
X0, SQ, S = 360, 1200, 480  # the presenter stands in the middle: x 360..1560, full height (padded square) at 480 px
RATE = 2

det = FaceDetector.create_from_options(FaceDetectorOptions(base_options=BaseOptions(model_asset_path=model), min_detection_confidence=0.5))
vf = f"fps=fps={RATE}:start_time=0,crop={SQ}:{H}:{X0}:0,pad={SQ}:{SQ}:0:0,scale={S}:{S}"
p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", src, "-an", "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], stdout=subprocess.PIPE)
k = S / SQ
rows = []  # per frame: None or (x, y_box_centre, w, h, score)
while True:
    b = p.stdout.read(S * S * 3)
    if len(b) < S * S * 3:
        break
    img = np.frombuffer(b, np.uint8).reshape(S, S, 3)
    r = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img)))
    f = None
    if r.detections:
        d = max(r.detections, key=lambda d: d.categories[0].score)
        sc = d.categories[0].score
        if sc >= 0.6:
            bb = d.bounding_box
            f = ((X0 + (bb.origin_x + bb.width / 2) / k) / W, ((bb.origin_y + bb.height / 2) / k) / H, (bb.width / k) / W, (bb.height / k) / H, float(sc))
    rows.append(f)
p.wait()
hits = [i for i, f in enumerate(rows) if f]
if not hits:
    print("NO FACE DETECTED", file=sys.stderr)
    sys.exit(3)


def head(f):
    """box -> head (chin stays, cap rises): returns centre x, centre y, height"""
    x, yc, w, h, _ = f
    chin = yc + h / 2
    hh = h * HEAD_K
    return x, chin - hh / 2, hh


# 40 evenly spaced detections (the per-sample record + the median)
pick = [hits[int(i * (len(hits) - 1) / max(1, NS - 1))] for i in range(NS)] if len(hits) >= NS else hits
samples = []
for i in pick:
    x, y, h = head(rows[i])
    samples.append({"t": round(i / RATE, 2), "x": round(x, 4), "y": round(y, 4), "h": round(h, 4), "score": round(rows[i][4], 3)})
med = lambda key: float(np.median([s[key] for s in samples]))
box = {k2: round(float(np.median([rows[i][j] for i in pick])), 4) for j, k2 in enumerate(["x", "y", "w", "h"])}

# dense track: fill gaps, median-3 then gaussian(sigma 1 sample)
n = len(rows)
arr = np.full((n, 3), np.nan)
for i in hits:
    arr[i] = head(rows[i])
tr = np.zeros((n, 3))
for c in range(3):
    a = arr[:, c]
    ok = ~np.isnan(a)
    a = np.interp(np.arange(n), np.where(ok)[0], a[ok])
    pad_ = np.pad(a, 1, mode="edge")
    a = np.array([np.median(pad_[j : j + 3]) for j in range(n)])
    g = np.exp(-0.5 * (np.arange(-3, 4) / 1.0) ** 2)
    g /= g.sum()
    tr[:, c] = np.convolve(np.pad(a, 3, mode="edge"), g, mode="valid")
track = [[round(i / RATE, 2), round(float(tr[i, 0]), 4), round(float(tr[i, 1]), 4), round(float(tr[i, 2]), 4)] for i in range(n)]

res = {
    "x": round(med("x"), 4),
    "y": round(med("y"), 4),
    "h": round(med("h"), 4),
    "box": box,
    "method": f"mediapipe blaze_face_short_range; median of {len(samples)} evenly spaced detections out of {len(hits)}/{n} frames scanned at {RATE} fps; head h = box.h*{HEAD_K}",
    "hits": len(hits),
    "n": n,
    "samples": samples,
    "track": track,
}
json.dump(res, open(out, "w"))
xs = [s["x"] for s in samples]
print(f"{out}: {len(hits)}/{n} frames with a face; head x={res['x']:.3f} y={res['y']:.3f} h={res['h']:.3f}; x range {min(xs):.3f}..{max(xs):.3f}")
