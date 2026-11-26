# N3 — command line (see n3core.py for what N3 is and why).
#   PY="studio/.venv/Scripts/python.exe -I"
#   $PY scripts/december/grade/n3.py prepare <raw.mp4> <work/n3> --n2 <work/n2> --face <face.json>
#        measures the clip (through N2's own prepare: wall balance, black level, face pixels), fits N3's skin hue target
#        and lift for THIS clip, writes norm.json + him.cube + wall.cube
#   $PY scripts/december/grade/n3.py matte <raw.mp4> <matte.mkv> [--ss s --t s]
#        the person matte of every frame (the raw through fps=30:start_time=0, i.e. the master's own frames), 960x540
#        gray, lossless (FFV1). About 0.15-0.2 s per frame on this laptop.
#   $PY scripts/december/grade/n3.py measure <raw.mp4> <graded.mp4> <work/n3> <matte.mkv> --face <face.json> [--ss s]
#        the gate on a graded master: PASS/FAIL table, exit code 1 on any FAIL
import argparse
import json
import math
import os
import subprocess
import sys
import time

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "..", "grade-n2")))
import n2core as C  # noqa: E402
import n2 as CLI  # noqa: E402
import n3core as G  # noqa: E402

W, H = 1920, 1080


def prepare(raw, work, n2dir, face, skin_y=None, max_lift=None, warm=None):
    os.makedirs(work, exist_ok=True)
    p = dict(G.N3)
    if skin_y:
        p["skin_y"] = skin_y
    if max_lift:
        p["max_lift"] = max_lift
    if warm:
        p["warm"] = warm
    if not all(os.path.exists(os.path.join(n2dir, f)) for f in ("norm.json", "measure_cache.npz")):
        CLI.prepare(raw, n2dir, face, quiet=True)
    norm = json.load(open(os.path.join(n2dir, "norm.json")))
    z = np.load(os.path.join(n2dir, "measure_cache.npz"))
    skin_px = z["skin"] if len(z["skin"]) else None
    aim = json.load(open(CLI.REF)).get("skin_aim", 124.0)
    n = G.fit(skin_px, norm, aim, p)
    n["n3"] = {k: (list(v) if isinstance(v, tuple) else v) for k, v in p.items()}
    json.dump(n, open(os.path.join(work, "norm.json"), "w"), indent=1)
    G.write_cubes(work, n, p)
    open(os.path.join(work, "graph.txt"), "w").write(G.graph(work) + "\n")
    r = lambda v: v if v is None else round(v, 3)
    print(f"n3 prepare: skin hue target {n['skin_target3']} (N2's {norm.get('skin_target')}); face median luma raw {r(n.get('skin_y_raw'))}, N2's colour {r(n.get('skin_y_n2'))} -> {r(n.get('skin_y_est'))} with fill k {n['lift_k']} (aim {p['skin_y']})  ({work})")
    if n.get("skin_y_est") is not None and abs(n["skin_y_est"] - n.get("skin_y_aim", p["skin_y"])) > 0.01:
        print(f"  NOTE: the aim was not reached (k is at the end of its range {p['k_range']})")
    return n


def matte(raw, out, ss=0.0, dur=None, threads=3):
    mw, mh = G.MATTE_W, G.MATTE_H
    vf = (f"fps=30:start_time=0,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv,"
          f"scale={mw}:{mh}:flags=bilinear:in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb24")
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-nostdin"] + (["-ss", f"{ss:.3f}"] if ss else []) + ["-i", raw] + (["-t", f"{dur:.3f}"] if dur else []) + ["-vf", vf, "-f", "rawvideo", "-"], stdout=subprocess.PIPE)
    tmp = out + ".part.mkv"
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-nostdin", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{mw}x{mh}", "-framerate", "30", "-i", "pipe:0",
                            "-c:v", "ffv1", "-level", "3", "-g", "30", "-slices", "4", "-pix_fmt", "gray", tmp], stdin=subprocess.PIPE)
    m = G.Matter(threads=threads)
    n, t0, nb = 0, time.time(), mw * mh * 3
    while True:
        buf = dec.stdout.read(nb)
        if len(buf) < nb:
            break
        pha = m(np.frombuffer(buf, np.uint8).reshape(mh, mw, 3))
        enc.stdin.write(G.finish_matte(pha).tobytes())
        n += 1
        if n % 300 == 0:
            print(f"  matte {n} frames, {(time.time() - t0) / n * 1000:.0f} ms/frame", flush=True)
    enc.stdin.close()
    enc.wait()
    dec.wait()
    if enc.returncode != 0 or n == 0:
        raise SystemExit(f"matte failed ({n} frames, encoder exit {enc.returncode})")
    os.replace(tmp, out)
    print(f"n3 matte: {n} frames in {time.time() - t0:.0f} s ({(time.time() - t0) / n * 1000:.0f} ms/frame) -> {out} ({os.path.getsize(out) / 1e6:.0f} MB)")
    return n


CAP_W, CAP_H = 480, 270


def cap(raw, out, ss=0.0, dur=None, debug=None):
    """A brown cap is skin-coloured, so colour alone would grade it (and fade the lettering's ground). This writes, for
    every frame, a soft mask of everything ABOVE THE BRIM: the half-plane beyond a line parallel to his eyes (so it
    tilts with his head), a little above them, within reach of the head. The graph multiplies it by the shrunken matte
    and puts the recorded picture back there. Eyes come from BlazeFace on every frame; gaps are bridged and the track
    is smoothed without lag (it is filtered forward and backward in one pass over the whole clip)."""
    import cv2  # noqa: F401
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python.vision import FaceDetector, FaceDetectorOptions

    X0, SQ, S = 360, 1200, 480
    det = FaceDetector.create_from_options(FaceDetectorOptions(base_options=BaseOptions(model_asset_path=os.path.join(G.HERE, "..", "..", "..", "studio", "models", "blaze_face_short_range.tflite")), min_detection_confidence=0.5))
    vf = f"fps=30:start_time=0,crop={SQ}:{H}:{X0}:0,pad={SQ}:{SQ}:0:0,scale={S}:{S}"
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-nostdin"] + (["-ss", f"{ss:.3f}"] if ss else []) + ["-i", raw] + (["-t", f"{dur:.3f}"] if dur else []) + ["-an", "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    rows, t0 = [], time.time()
    px = lambda kp: (X0 + kp.x * SQ, kp.y * SQ)  # keypoints are 0..1 of the padded square -> pixels of the 1920x1080 frame
    while True:
        b = dec.stdout.read(S * S * 3)
        if len(b) < S * S * 3:
            break
        r = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(np.frombuffer(b, np.uint8).reshape(S, S, 3))))
        row = [np.nan] * 6
        if r.detections:
            d = max(r.detections, key=lambda d: d.categories[0].score)
            if d.categories[0].score >= 0.55 and len(d.keypoints) >= 4:
                (ax, ay), (bx, by), (mx, my) = px(d.keypoints[0]), px(d.keypoints[1]), px(d.keypoints[3])
                row = [ax, ay, bx, by, mx, my]
        rows.append(row)
    dec.wait()
    a = np.array(rows, np.float64)
    n = len(a)
    hits = int(np.isfinite(a[:, 0]).sum())
    if n == 0 or hits < max(3, n * 0.2):
        raise SystemExit(f"cap: face found in only {hits} of {n} frames")
    idx = np.arange(n)
    for c in range(6):
        ok = np.isfinite(a[:, c])
        a[:, c] = np.interp(idx, idx[ok], a[ok, c])
        k = np.exp(-0.5 * (np.arange(-6, 7) / 2.0) ** 2)
        a[:, c] = np.convolve(np.pad(a[:, c], 6, mode="edge"), k / k.sum(), mode="valid")
    tmp = out + ".part.mkv"
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-nostdin", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{CAP_W}x{CAP_H}", "-framerate", "30", "-i", "pipe:0",
                            "-c:v", "ffv1", "-level", "3", "-g", "30", "-pix_fmt", "gray", tmp], stdin=subprocess.PIPE)
    yy, xx = np.mgrid[0:CAP_H, 0:CAP_W].astype(np.float32)
    X, Y = (xx + 0.5) * (W / CAP_W), (yy + 0.5) * (H / CAP_H)
    for i in range(n):
        enc.stdin.write(cap_mask(a[i], X, Y).tobytes())
    enc.stdin.close()
    enc.wait()
    os.replace(tmp, out)
    if debug:
        json.dump([[round(float(v), 1) for v in r] for r in a], open(debug, "w"))
    print(f"n3 cap: {n} frames, face found in {hits} ({hits / n * 100:.0f} %), {time.time() - t0:.0f} s -> {out} ({os.path.getsize(out) / 1e6:.1f} MB)")
    return a


CAP = dict(up=0.50, soft=(-0.07, 0.09), reach=(3.3, 3.9))  # in eye distances: the brim line above the eye line, its softness, how far from the eyes the mask reaches


def cap_mask(row, X, Y):
    ax, ay, bx, by, mx, my = row
    ex, ey = (ax + bx) / 2, (ay + by) / 2
    d = max(8.0, math.hypot(bx - ax, by - ay))
    ux, uy = (bx - ax) / d, (by - ay) / d
    nx, ny = -uy, ux
    if nx * (mx - ex) + ny * (my - ey) > 0:  # the normal must point away from the mouth
        nx, ny = -nx, -ny
    s = ((X - (ex + nx * CAP["up"] * d)) * nx + (Y - (ey + ny * CAP["up"] * d)) * ny) / d
    r = np.hypot(X - ex, Y - ey) / d
    m = C.smoothstep(CAP["soft"][0], CAP["soft"][1], s) * (1 - C.smoothstep(CAP["reach"][0], CAP["reach"][1], r))
    return (np.clip(m, 0, 1) * 255 + 0.5).astype(np.uint8)


def gray_frame(path, k, w, h):
    r = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-i", path, "-vf", f"select=eq(n\\,{k})", "-frames:v", "1", "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True)
    a = np.frombuffer(r.stdout, np.uint8)
    if a.size != w * h:
        raise RuntimeError(f"{path} frame {k}: {r.stderr.decode()[-200:]}")
    return np.asarray(Image.fromarray(a.reshape(h, w)).resize((W, H), Image.BILINEAR)).astype(np.float32) / 255


def matte_frame(path, k):
    r = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-i", path, "-vf", f"select=eq(n\\,{k})", "-frames:v", "1", "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True)
    a = np.frombuffer(r.stdout, np.uint8)
    if a.size != G.MATTE_W * G.MATTE_H:
        raise RuntimeError(f"matte frame {k}: {r.stderr.decode()[-200:]}")
    return np.asarray(Image.fromarray(a.reshape(G.MATTE_H, G.MATTE_W)).resize((W, H), Image.BILINEAR)).astype(np.float32) / 255


# what a graded master must measure (means over the moments)
THRESH = {
    "skin_hue": (117.0, 128.0),     # N2's own estimator and band (120-128), opened 3 deg toward red: N3 aims at 123.5
    "skin_chroma": (8.0, 17.5),     # not ashy, not boosted
    "wall_RmB": (2.0, 9.0),         # N2's wall: neutral-warm
    "wall_d": (0.0, 1.5),           # the wall is N2's wall: graded vs N2's wall LUT, away from him (levels)
    "halo": (0.0, 1.5),             # the 16 px of wall around him are the wall too (no bright or dark rim)
    "face_gain": (1.0, 1.9),        # his face is never darker than N2 made it, and never blown up
    "face_p98": (0.0, 205.0),       # speculars tamed
    "clothes_d": (0.0, 1.5),        # his clothes, cap and lettering are as recorded (graded vs raw, median per channel)
    "shirt_dhue": (-4.0, 4.0),      # a coloured shirt keeps its hue
    "colour_path": (0.0, 3.0),      # the MP4, decoded as tagged, equals the numpy twin (matrix, range and matte in step)
}


def measure(raw, graded, work, matte_path, face, ss=0.0, n=4, cap_path=None):
    import cv2

    norm = json.load(open(os.path.join(work, "norm.json")))
    trk = CLI.load_track(face)
    gp = CLI.probe(graded)
    tags_ok = gp.get("color_space") == "bt709" and gp.get("color_range") == "tv" and gp.get("color_primaries") == "bt709" and gp.get("color_transfer") == "bt709" and gp.get("pix_fmt") == "yuv420p"
    times = [ss + gp["duration"] * f for f in np.linspace(0.14, 0.86, n)]
    rows = []
    print(f"\nN3 measure  raw={raw}\n            graded={graded}  (tags {'OK' if tags_ok else 'WRONG'})   lift k {norm.get('lift_k')}  skin target {norm.get('skin_target3')}")
    print(f"{'t':>7} | skin hue raw>N3 | skin C | face Y raw > N2 > N3 | wall R-B | wall d | halo | clothes | path")
    n2p = dict(C.N2, skin_target=norm.get("skin_target", C.N2["skin_target"]))
    for t in times:
        k = int(round((t - ss) * 30))
        t = ss + k / 30
        a = CLI.frame_cfr(raw, ss, k)
        g = CLI.frame_cfr(graded, 0.0, k, resample=False)
        m = matte_frame(matte_path, k)
        fc = CLI.face_in_frame(a, trk, t)
        sa, sg = CLI.stats(a, t, trk, fc), CLI.stats(g, t, trk, fc)
        flat = a.reshape(-1, 3)
        cm = gray_frame(cap_path, k, CAP_W, CAP_H) if cap_path else None
        exp = G.apply_numpy(a, norm, m, cm)
        wl = G.wall(flat, norm).reshape(a.shape)
        # N2's look on this frame (its shapes and window), for the face comparison
        mk = C.masks_at(trk, t)
        up = lambda u: np.asarray(Image.fromarray(u).resize((W, H), Image.BICUBIC)).astype(np.float32) / 255
        n2img = C.apply_numpy(a, norm, up(mk[:C.MH]), up(mk[C.MH:]))
        x, y, h = fc
        yy, xx = np.mgrid[0:H, 0:W]
        fw = 0.363 * h * W
        sw = C.skin_weight(C.normalise(flat, norm), C.N2).reshape(H, W)
        face_m = (((xx - x * W) / (0.42 * fw)) ** 2 + ((yy - (y + 0.17 * h) * H) / (0.5 * fw)) ** 2 < 1) & (sw > 0.3) & (m > 0.9)
        far = cv2.dilate((m > 0.02).astype(np.uint8), np.ones((81, 81), np.uint8)) == 0
        near = (cv2.dilate((m > 0.5).astype(np.uint8), np.ones((33, 33), np.uint8)) == 1) & (m < 0.01)
        md = lambda mask: float(np.abs(np.median((g - wl)[mask], 0)).max() * 255) if mask.any() else 0.0
        row = dict(t=t, raw=sa, n3=sg, wall_d=md(far), halo=md(near))
        fy = lambda im: float(C.luma(im)[face_m].mean() * 255) if face_m.any() else 0.0
        row["face_raw"], row["face_n2"], row["face_n3"] = fy(a), fy(n2img), fy(g)
        # his clothes: well inside him, not skin-coloured (or above the brim) -> must equal the recording
        sw3 = G.skin_weight(C.normalise(flat, norm)).reshape(H, W)
        cloth = (G.inner(m) > 0.98) & ((sw3 < 0.02) | ((cm > 0.98) if cm is not None else False))
        row["black_d"] = float(np.abs(np.median((g - a)[cloth], 0)).max() * 255) if cloth.any() else 0.0
        fx, fyy = int(x * W), int((y + 0.17 * h) * H)
        dmax = 0.0
        for b in ([fx - 30, fyy - 20, fx + 30, fyy + 40], [1500, 150, 1800, 400], sg.get("shirt_box")):
            if b:
                x0, y0, x1, y1 = b
                dmax = max(dmax, float((np.abs(np.median((exp[y0:y1, x0:x1] - g[y0:y1, x0:x1]).reshape(-1, 3), 0)) * 255).max()))
        row["colour_path"] = dmax
        if "shirt_hue" in sa and "shirt_hue" in sg and sa.get("shirt_chroma", 0) > 12:
            row["shirt_dhue"] = (sg["shirt_hue"] - sa["shirt_hue"] + 180) % 360 - 180
        rows.append(row)
        print(f"{t:7.1f} | {sa.get('skin_hue', 0):6.1f} > {sg.get('skin_hue', 0):6.1f} | {sg.get('skin_chroma', 0):6.1f} | {row['face_raw']:5.1f} > {row['face_n2']:5.1f} > {row['face_n3']:5.1f} | {sg.get('wall_RmB', 0):8.1f} | {row['wall_d']:6.2f} | {row['halo']:4.2f} | {row['black_d']:7.2f} | {dmax:4.1f}")
    mean = lambda f: float(np.mean([f(r) for r in rows]))
    checks = {
        "skin_hue": mean(lambda r: r["n3"].get("skin_hue", 0)),
        "skin_chroma": mean(lambda r: r["n3"].get("skin_chroma", 0)),
        "wall_RmB": mean(lambda r: r["n3"].get("wall_RmB", 0)),
        "wall_d": max(r["wall_d"] for r in rows),
        "halo": max(r["halo"] for r in rows),
        "face_gain": mean(lambda r: r["face_n3"]) / max(1e-6, mean(lambda r: r["face_n2"])),
        "face_p98": mean(lambda r: r["n3"].get("face_p98", 0)),
        "clothes_d": max(r["black_d"] for r in rows),
        "colour_path": max(r["colour_path"] for r in rows),
    }
    sh = [r["shirt_dhue"] for r in rows if "shirt_dhue" in r]
    if sh:
        checks["shirt_dhue"] = float(np.mean(sh))
    fails = [] if tags_ok else ["tags"]
    print("\nverdict:")
    for k, v in checks.items():
        lo, hi = THRESH[k]
        ok = lo <= v <= hi
        if not ok:
            fails.append(k)
        print(f"  {'PASS' if ok else 'FAIL'}  {k:12s} {v:7.2f}   (want {lo} .. {hi})")
    print(f"  {'PASS' if tags_ok else 'FAIL'}  tags         bt709 / tv / yuv420p")
    print(f"\nface brightness (0-255): raw {mean(lambda r: r['face_raw']):.1f} -> N2 {mean(lambda r: r['face_n2']):.1f} -> N3 {mean(lambda r: r['face_n3']):.1f}")
    json.dump(dict(checks=checks, fails=fails, rows=[{k: v for k, v in r.items() if k not in ("raw", "n3")} for r in rows]), open(os.path.join(work, "measure.json"), "w"), indent=1)
    print("\n" + ("ALL PASS" if not fails else f"{len(fails)} FAIL: {', '.join(fails)}"))
    return 0 if not fails else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("prepare")
    p.add_argument("raw"); p.add_argument("work"); p.add_argument("--n2", required=True); p.add_argument("--face"); p.add_argument("--skin-y", type=float); p.add_argument("--max-lift", type=float); p.add_argument("--warm", type=float)
    p = sub.add_parser("matte")
    p.add_argument("raw"); p.add_argument("out"); p.add_argument("--ss", type=float, default=0.0); p.add_argument("--t", type=float); p.add_argument("--threads", type=int, default=3)
    p = sub.add_parser("cap")
    p.add_argument("raw"); p.add_argument("out"); p.add_argument("--ss", type=float, default=0.0); p.add_argument("--t", type=float); p.add_argument("--debug")
    p = sub.add_parser("measure")
    p.add_argument("raw"); p.add_argument("graded"); p.add_argument("work"); p.add_argument("matte"); p.add_argument("--face", required=True); p.add_argument("--ss", type=float, default=0.0); p.add_argument("--cap")
    a = ap.parse_args()
    if a.cmd == "prepare":
        prepare(a.raw, a.work, a.n2, a.face, a.skin_y, a.max_lift, a.warm)
    elif a.cmd == "matte":
        matte(a.raw, a.out, a.ss, a.t, a.threads)
    elif a.cmd == "cap":
        cap(a.raw, a.out, a.ss, a.t, a.debug)
    else:
        sys.exit(measure(a.raw, a.graded, a.work, a.matte, a.face, a.ss, cap_path=a.cap))
