# The grade bench: raw | N2 (current) | N3 on real frames of a day, with the numbers.
#   python -I bench.py <day> <t,t,…> <out dir> [--variant name:subject:skin[:kh:hi] …]
# For every moment: a 3-up sheet (half size), a full-size face crop of each, a hands/arms crop where his matte reaches
# beyond N2's shapes, a picture of the two masks (N2 shapes in red, the matte in green), and a table: luma of his
# face / all his skin / the wall, the skin's hue and chroma, the wall's balance.
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "..", "grade-n2")))
import n2core as C  # noqa: E402
import n2 as CLI  # noqa: E402
import n3core as G  # noqa: E402

ROOT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
W, H = 1920, 1080


def font(sz):
    try:
        return ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", sz)
    except Exception:
        return ImageFont.load_default()


def small(a):
    return np.asarray(Image.fromarray((a * 255 + 0.5).astype(np.uint8)).resize((G.MATTE_W, G.MATTE_H), Image.BILINEAR))


def matte_at(raw, t, warm=10):
    """the matte of the frame at t: RVM is recurrent, so run `warm` frames before it."""
    m = G.Matter()
    pha = None
    for k in range(warm, -1, -1):
        a = CLI.frame_at(raw, max(0, t - k / 30))
        pha = m(small(a))
    return a, pha


def up(mask_u8):
    return np.asarray(Image.fromarray(mask_u8).resize((W, H), Image.BICUBIC)).astype(np.float32) / 255


def stats(img, face_m, skin_m, wall_m):
    y = C.luma(img)
    _, cb, cr = C.ycc(img)
    f = dict(face=float(y[face_m].mean()), skin=float(y[skin_m].mean()) if skin_m.any() else 0, wall=float(y[wall_m].mean()))
    sk = img[face_m]
    _, scb, scr = C.ycc(sk)
    f["hue"] = float(np.degrees(np.arctan2(scr.mean(), scb.mean())) % 360)
    f["chroma"] = float(np.hypot(scb.mean(), scr.mean()) * 255)
    wl = img[wall_m].mean(0) * 255
    f["wall_rmb"] = float(wl[0] - wl[2])
    return f


def label(im, text):
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 12 + d.textlength(text, font=font(22)), 32], fill=(0, 0, 0))
    d.text((6, 3), text, fill=(255, 220, 60), font=font(22))
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("day", type=int)
    ap.add_argument("times")
    ap.add_argument("out")
    ap.add_argument("--variant", action="append", default=[])
    a = ap.parse_args()
    nn = f"{a.day:02d}"
    work = os.path.join(ROOT, "december", "work", f"day{nn}")
    norm = json.load(open(os.path.join(work, "n2", "norm.json")))
    raw = norm["raw"]
    trk = CLI.load_track(os.path.join(work, "face.json"))
    z = np.load(os.path.join(work, "n2", "measure_cache.npz"))
    skin_px = z["skin"] if len(z["skin"]) else None
    aim = json.load(open(CLI.REF)).get("skin_aim", 124.0)
    variants = []
    for v in a.variant or ["N3"]:
        p = v.split(":", 1)
        q = dict(G.N3)
        for kv in (p[1].split(",") if len(p) > 1 and p[1] else []):
            k, val = kv.split("=")
            q[k] = tuple(float(x) for x in val.split("/")) if "/" in val else float(val)
        nv = G.fit(skin_px, norm, aim, q)
        variants.append((p[0], q, nv))
        print(f"variant {p[0]}: skin_y {q['skin_y']} sat_ease {q['sat_ease']} aim {q.get('skin_aim') or aim} -> skin target {nv['skin_target3']} (N2 {norm['skin_target']}), fill k {nv['lift_k']} (face median {nv['skin_y_n2']:.3f} after N2's colour -> {nv['skin_y_est']:.3f})")
    os.makedirs(a.out, exist_ok=True)
    rows = []
    for t in [float(x) for x in a.times.split(",")]:
        frame, pha = matte_at(raw, t)
        matte = up(G.finish_matte(pha))
        n2m = C.masks_at(trk, t)
        sm, win = up(n2m[:C.MH]), up(n2m[C.MH:])
        cur = C.apply_numpy(frame, norm, sm, win)
        outs = [(name, G.apply_numpy(frame, nv, matte, q)) for name, q, nv in variants]
        # regions, from the RAW frame: face = N2's face ellipse core; all skin = skin-coloured pixels inside the matte;
        # wall = neutral pixels well outside him
        x, y, h = C.face_from_track(trk, t)
        yy, xx = np.mgrid[0:H, 0:W]
        fw = 0.363 * h * W
        face_m = (((xx - x * W) / (0.42 * fw)) ** 2 + ((yy - (y + 0.17 * h) * H) / (0.5 * fw)) ** 2 < 1)
        sw = C.skin_weight(C.normalise(frame.reshape(-1, 3), norm), C.N2).reshape(H, W)
        skin_m = (matte > 0.9) & (sw > 0.5)
        face_m = face_m & (sw > 0.3)
        _, cb, cr = C.ycc(frame)
        wall_m = (matte < 0.02) & (np.hypot(cb, cr) < 0.05) & (C.luma(frame) > 0.35)
        st = [("raw", stats(frame, face_m, skin_m, wall_m)), ("N2", stats(cur, face_m, skin_m, wall_m))] + [(n, stats(o, face_m, skin_m, wall_m)) for n, o in outs]
        rows.append((t, st, float(((matte > 0.5) & (sm < 0.5)).mean() * 100), float((skin_m & (sm < 0.5)).sum() / max(1, skin_m.sum()) * 100)))
        tag = f"d{nn}_{int(round(t * 10)):05d}"
        panels = [("raw", frame), ("N2 (now)", cur)] + outs
        # 3-up (or more) sheet at half size
        sheet = Image.new("RGB", (960 * len(panels), 540))
        for i, (n, im) in enumerate(panels):
            sheet.paste(label(Image.fromarray((im * 255 + 0.5).astype(np.uint8)).resize((960, 540), Image.LANCZOS), n), (960 * i, 0))
        sheet.save(os.path.join(a.out, f"{tag}_sheet.jpg"), quality=93)
        # face crops at full size
        cx, cy = int(x * W), int((y + 0.1 * h) * H)
        bx = (max(0, cx - 300), max(0, cy - 300), min(W, cx + 300), min(H, cy + 300))
        crops = Image.new("RGB", (600 * len(panels), 600))
        for i, (n, im) in enumerate(panels):
            crops.paste(label(Image.fromarray((im * 255 + 0.5).astype(np.uint8)).crop(bx), n), (600 * i, 0))
        crops.save(os.path.join(a.out, f"{tag}_face.png"))
        # the masks: N2 shapes red, N2 face window blue, the matte green, over the frame in grey
        g = np.repeat((C.luma(frame) * 0.55)[..., None], 3, -1)
        ov = np.clip(g + np.stack([sm * 0.35, matte * 0.35, win / max(1e-6, win.max()) * 0.45], -1), 0, 1)
        label(Image.fromarray((ov * 255).astype(np.uint8)).resize((960, 540)), "red: N2 body shape   blue: N2 face light   green: matte (N3)").save(os.path.join(a.out, f"{tag}_masks.jpg"), quality=90)
        np.save(os.path.join(a.out, f"{tag}_matte.npy"), G.finish_matte(pha))
    print("\n   t   | look        | face Y | all-skin Y | wall Y | face-wall | skin hue | chroma | wall R-B |  him outside N2 shape (px %) | skin outside it (%)")
    for t, st, o1, o2 in rows:
        for n, s in st:
            print(f" {t:6.1f} | {n:11s} | {s['face'] * 255:6.1f} | {s['skin'] * 255:10.1f} | {s['wall'] * 255:6.1f} | {(s['face'] - s['wall']) * 255:9.1f} | {s['hue']:8.1f} | {s['chroma']:6.1f} | {s['wall_rmb']:8.1f} | {o1:6.2f} | {o2:6.1f}")
        print()


if __name__ == "__main__":
    main()
