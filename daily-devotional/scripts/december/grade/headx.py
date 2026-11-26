# His head, frame by frame, from the per-frame "above the brim" mask the grade already made (n3/cap.mkv, raw
# timeline: built from face-detector eye points, so it sits on his head and never on a raised hand).
#   $PY scripts/december/grade/headx.py <work/dayNN/n3/cap.mkv> <out.json>
# -> { "fps": 30, "x": [...], "top": [...], "found": share of frames with a face }
#    head centre x and mask top y (0..1 of the frame), one value per frame.
# The body's own track is sampled twice a second: too coarse for the narrow 9:16 window of a short, where a quick
# sway puts his face at the frame edge (Day 6 short 3, and moments of earlier shorts). plan.mjs maps this to body
# frames through body.segments.
import json, subprocess, sys
import numpy as np

src, out = sys.argv[1], sys.argv[2]
W, H = 320, 180
p = subprocess.Popen(["ffmpeg", "-v", "error", "-nostdin", "-i", src, "-vf", f"scale={W}:{H}:flags=area,format=gray", "-f", "rawvideo", "-"], stdout=subprocess.PIPE)
xs, tops = [], []
cols = np.arange(W, dtype=np.float64)
found = 0
while True:
    buf = p.stdout.read(W * H)
    if len(buf) < W * H:
        break
    m = np.frombuffer(buf, np.uint8).reshape(H, W).astype(np.float64)
    m[m < 60] = 0
    tot = m.sum()
    if tot < 255 * 30:  # no face this frame: hold the last position
        xs.append(xs[-1] if xs else 0.5)
        tops.append(tops[-1] if tops else 0.2)
        continue
    found += 1
    xs.append(round(float((m.sum(axis=0) * cols).sum() / tot / W), 4))
    tops.append(round(float(np.flatnonzero(m.any(axis=1))[0]) / H, 4))
p.wait()
# a lone bad frame cannot throw it: 5-frame median
a = np.array(xs)
pad = np.pad(a, 2, mode="edge")
xs = [round(float(np.median(pad[i : i + 5])), 4) for i in range(len(a))]
json.dump({"fps": 30, "x": xs, "top": tops, "found": round(found / max(1, len(xs)), 4)}, open(out, "w"))
print(f"{out}: {len(xs)} frames, face found in {100 * found / max(1, len(xs)):.1f} %, x {min(xs):.3f}..{max(xs):.3f}")
