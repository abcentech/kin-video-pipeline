# Proof sheets for the N2 grade on the devotional raws (read-only on the raws and on the devotional files).
#   studio/.venv/Scripts/python.exe -I scripts/grade-n2/proof.py <day> <work_dir> <out.jpg> [--face face.json]
# Columns: raw | the devotional pipeline's CURRENT grade (reproduced from scripts/december/cut.mjs GR + gradeGraph +
# maskAt, v3 'look C deep', copied here verbatim — that file is never imported or edited) | N2 (this package, through
# the real ffmpeg graph). 4 moments, each with a 2x face crop.
import argparse
import json
import math
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import n2  # noqa: E402
import n2core as C  # noqa: E402

W, H = 1920, 1080
TO_RGB = "scale=in_color_matrix=bt709:in_range=tv:out_range=pc:flags=accurate_rnd+full_chroma_int,format=rgb24"

# ---- the devotional grade as of 2026-11-25 (scripts/december/cut.mjs lines 49-101, copied; v3 look C 'deep')
DEC_GR = dict(
    denoise="hqdn3d=0.8:0.6:4:3",
    base="curves=m='0/0 0.14/0.085 0.3/0.27 0.45/0.42 0.6/0.5 0.75/0.635 0.88/0.82 1/0.98':r='0/0 0.25/0.262 0.42/0.435 0.52/0.523 0.62/0.62 1/1':b='0/0 0.25/0.212 0.4/0.362 0.52/0.508 0.62/0.62 1/1',vibrance=intensity=0.18",
    lift="curves=m='0/0 0.09/0.135 0.26/0.385 0.4/0.5 0.52/0.545 1/1'",
    wall="curves=m='0/0 0.5/0.42 1/0.84'",
    sharpen="unsharp=5:5:0.45:5:5:0",
)


def dec_graph():
    g = DEC_GR
    return ";".join([
        f"[0:v]{g['denoise']},scale=in_color_matrix=bt709:in_range=tv,format=gbrp,{g['base']},split[b][c]",
        f"[c]{g['lift']}[l]",
        "[1:v]scale=1920:1080:flags=bicubic,format=gray,format=gbrp,split[m][m2]",
        "[b][l][m]maskedmerge[f]",
        "[f]split[f1][f2]",
        f"[f1]{g['wall']}[d]",
        f"[d][f2][m2]maskedmerge,{g['sharpen']},scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,{TO_RGB}[out]",
    ])


def dec_mask(track, t):
    """their maskAt (cut.mjs 69-88): 240x135, ellipse around the face, smoothstep from R0 0.3 to R1 2.6"""
    x, y, h = C.face_from_track(track, t)
    cx, cy = x * W, y * H
    ry = 0.62 * h * H
    rx = 0.8 * ry
    py, px = np.mgrid[0:135, 0:240].astype(np.float32)
    dy = ((py + 0.5) * (H / 135) - cy) / ry
    dx = ((px + 0.5) * (W / 240) - cx) / rx
    r = np.sqrt(dx * dx + dy * dy)
    m = np.clip(1 - (r - 0.3) / (2.6 - 0.3), 0, 1)
    m = m * m * (3 - 2 * m)
    return (m * 255 + 0.5).astype(np.uint8)


def through(raw, t, graph, mask, msize):
    r = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", raw, "-f", "rawvideo", "-pix_fmt", "gray", "-s", msize, "-framerate", "30", "-i", "pipe:0",
                        "-filter_complex", graph, "-map", "[out]", "-frames:v", "1", "-f", "rawvideo", "-"], input=mask.tobytes() * 3, capture_output=True)
    a = np.frombuffer(r.stdout, np.uint8)
    if a.size != W * H * 3:
        raise RuntimeError(r.stderr.decode()[-400:])
    return a.reshape(H, W, 3).astype(np.float32) / 255


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("raw")
    ap.add_argument("work")
    ap.add_argument("out")
    ap.add_argument("--face")
    ap.add_argument("--title", default="")
    ap.add_argument("--times")
    o = ap.parse_args()
    norm, trk = n2.prepare(o.raw, o.work, o.face)
    dur = n2.probe(o.raw)["duration"]
    times = [float(v) for v in o.times.split(",")] if o.times else [dur * f for f in (0.14, 0.38, 0.62, 0.86)]
    n2g = C.graph(o.work).replace("range=tv[out]", f"range=tv,{TO_RGB}[out]")
    cols = ["raw", "devotional grade now (cut.mjs v3)", "N2 (scripts/grade-n2)"]
    cw, ch, fh, pad, lab = 640, 360, 300, 12, 28
    font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 22)
    fs = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 16)
    S = Image.new("RGB", (pad + 3 * (cw + pad), 76 + len(times) * (ch + fh + 2 * lab + pad)), (22, 21, 20))
    d = ImageDraw.Draw(S)
    d.text((pad, 10), o.title, font=font, fill=(240, 236, 230))
    for i, c in enumerate(cols):
        d.text((pad + i * (cw + pad), 44), c, font=font, fill=(255, 214, 150) if c.startswith("N2") else (210, 210, 210))
    y0 = 76
    rows = []
    for t in times:
        imgs = [n2.frame_at(o.raw, t), through(o.raw, t, dec_graph(), dec_mask(trk, t), "240x135"), through(o.raw, t, n2g, C.masks_at(trk, t), "240x270")]
        x, y, h = fc = n2.face_in_frame(imgs[0], trk, t)
        fw = 0.363 * h * W
        cx, cy = x * W, (y + 0.08 * h) * H
        bw = fw * 1.5
        bh = bw * fh / cw
        box = (int(cx - bw / 2), int(cy - bh / 2), int(cx + bw / 2), int(cy + bh / 2))
        row = {"t": round(t, 2)}
        for i, a in enumerate(imgs):
            im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))
            xx = pad + i * (cw + pad)
            S.paste(im.resize((cw, ch), Image.LANCZOS), (xx, y0 + lab))
            S.paste(im.crop(box).resize((cw, fh), Image.LANCZOS), (xx, y0 + 2 * lab + ch))
            st = n2.stats(a, t, trk, fc)
            row[cols[i]] = {k: (round(v, 1) if isinstance(v, float) else v) for k, v in st.items() if k != "shirt_box"}
            d.text((xx, y0 + 5), f"t {t:.0f}s  skin {st.get('skin_hue', 0):.0f}deg C {st.get('skin_chroma', 0):.1f}  wall Y {st.get('wall_Y', 0):.0f} R-B {st.get('wall_RmB', 0):+.1f}", font=fs, fill=(225, 220, 210))
            d.text((xx, y0 + lab + ch + 6), f"face 2x   p98 {st.get('face_p98', 0):.0f}   shirt hue {st.get('shirt_hue', 0):.0f}  rgb {[round(v) for v in st.get('shirt_rgb', [0, 0, 0])]}   black Y {st.get('black_Y', 0):.0f}", font=fs, fill=(225, 220, 210))
        rows.append(row)
        y0 += ch + fh + 2 * lab + pad
    S.save(o.out, quality=90)
    json.dump(rows, open(os.path.splitext(o.out)[0] + ".json", "w"), indent=1)
    print("sheet:", o.out)
    for r in rows:
        print(r["t"], {c: {k: r[c].get(k) for k in ("skin_hue", "skin_chroma", "wall_RmB", "wall_Y", "patch_chroma_p95", "black_Y", "shirt_hue")} for c in cols})


if __name__ == "__main__":
    main()
