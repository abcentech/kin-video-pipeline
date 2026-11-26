# N2 grade — command line (see README.md). Python = studio/.venv/Scripts/python.exe (numpy, Pillow, OpenCV).
#   n2.py calibrate <reference.mp4>                         -> scripts/grade-n2/ref.json (the room the N2 look was built on)
#   n2.py track <raw.mp4> <face.json>                       -> a face track ([t, x, y, h] every 0.5 s) when none exists
#   n2.py prepare <raw.mp4> <work_dir> [--face F]           -> work_dir/{norm.json, base.cube, patch.cube, window.cube,
#                                                              graph.txt}: the per-clip measurement + the LUTs
#   n2.py bake <raw.mp4> <out.mp4> [--face F] [--work D] [--ss S] [--t T] [--no-audio]
#                                                           -> a graded BT.709 mezzanine (CFR 30, x264 CRF 16, raw audio)
#   n2.py measure <raw.mp4> <graded.mp4> [--face F] [--work D] [--ss S]
#                                                           -> before/after table + PASS/FAIL (incl. the colour-path check)
#   n2.py check-mp4 <video.mp4> <reference.png> <frame>      -> decode one frame several ways and compare saturated patches
#                                                              with a known-good PNG (the Remotion JPEG/601 trap)
#   n2.py sheet <raw.mp4> <out.jpg> --cols name=video.mp4[@offset] ... [--face F] [--times a,b,c,d]
import argparse
import json
import math
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import n2core as C  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(HERE, "ref.json")
W, H = 1920, 1080
# decode rule: tag the frames BT.709 limited, convert with an explicit matrix + range, never let ffmpeg guess
DEC = "setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv,scale=in_color_matrix=bt709:in_range=tv:out_range=pc:flags=accurate_rnd+full_chroma_int,format=rgb24"
ENC_TAGS = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]


def run(args, **kw):
    return subprocess.run(args, capture_output=True, **kw)


def probe(path):
    r = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,pix_fmt,color_range,color_space,color_transfer,color_primaries,codec_name,avg_frame_rate:format=duration", "-of", "json", path])
    j = json.loads(r.stdout)
    s = j["streams"][0]
    s["duration"] = float(j["format"]["duration"])
    return s


def frame_at(path, t, vf=DEC, size=(W, H)):
    """one frame at time t (seconds) as float RGB 0..1, decoded with the explicit BT.709 rule (or another `vf`)."""
    r = run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", path, "-vf", vf, "-frames:v", "1", "-f", "rawvideo", "-"])
    a = np.frombuffer(r.stdout, np.uint8)
    if a.size != size[0] * size[1] * 3:
        raise RuntimeError(f"decode failed at {t}s: {r.stderr.decode()[-300:]}")
    return a.reshape(size[1], size[0], 3).astype(np.float32) / 255


def frame_cfr(path, ss, k, resample=True):
    """frame k after -ss `ss` (through fps=30 when `resample`), decoded with the explicit BT.709 rule."""
    vf = (f"fps=30:start_time=0," if resample else "") + f"select=eq(n\,{k})," + DEC
    r = run(["ffmpeg", "-v", "error", "-ss", f"{ss:.3f}", "-i", path, "-vf", vf, "-frames:v", "1", "-fps_mode", "passthrough", "-f", "rawvideo", "-"])
    a = np.frombuffer(r.stdout, np.uint8)
    if a.size != W * H * 3:
        raise RuntimeError(f"decode failed: {r.stderr.decode()[-300:]}")
    return a.reshape(H, W, 3).astype(np.float32) / 255


def load_track(face):
    if not face:
        return None
    j = json.load(open(face))
    return j.get("track") or [[s["t"], s["x"], s["y"], s["h"]] for s in j.get("samples", [])]


# ------------------------------------------------------------------------------------------ face track (fallback)
def track(raw, out, fps=2.0):
    """BlazeFace (MediaPipe, the model already in studio/models) at 2 fps -> the same face.json the devotional pipeline
    writes ([t, x, y, h] head centre/height every 0.5 s, gaps filled, median-3 + light gaussian)."""
    import cv2  # noqa: F401
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python.vision import FaceDetector, FaceDetectorOptions

    model = os.path.join(os.path.dirname(os.path.dirname(HERE)), "studio", "models", "blaze_face_short_range.tflite")
    det = FaceDetector.create_from_options(FaceDetectorOptions(base_options=BaseOptions(model_asset_path=model), min_detection_confidence=0.5))
    X0, SQ, S, K = 360, 1200, 480, 1.55
    vf = f"fps=fps={fps}:start_time=0,{DEC.replace('format=rgb24', '')}crop={SQ}:{H}:{X0}:0,pad={SQ}:{SQ}:0:0,scale={S}:{S},format=rgb24"
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", raw, "-an", "-vf", vf, "-f", "rawvideo", "pipe:1"], stdout=subprocess.PIPE)
    k = S / SQ
    rows = []
    while True:
        b = p.stdout.read(S * S * 3)
        if len(b) < S * S * 3:
            break
        r = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(np.frombuffer(b, np.uint8).reshape(S, S, 3))))
        f = None
        if r.detections:
            d = max(r.detections, key=lambda d: d.categories[0].score)
            if d.categories[0].score >= 0.6:
                bb = d.bounding_box
                yc, bh = ((bb.origin_y + bb.height / 2) / k) / H, (bb.height / k) / H
                hh = bh * K
                f = ((X0 + (bb.origin_x + bb.width / 2) / k) / W, yc + bh / 2 - hh / 2, hh)
        rows.append(f)
    p.wait()
    hits = [i for i, f in enumerate(rows) if f]
    if not hits:
        raise RuntimeError("no face found")
    n = len(rows)
    arr = np.full((n, 3), np.nan)
    for i in hits:
        arr[i] = rows[i]
    tr = np.zeros((n, 3))
    g = np.exp(-0.5 * (np.arange(-3, 4) / 1.0) ** 2)
    g /= g.sum()
    for c in range(3):
        v = arr[:, c]
        ok = ~np.isnan(v)
        v = np.interp(np.arange(n), np.where(ok)[0], v[ok])
        pv = np.pad(v, 1, mode="edge")
        v = np.array([np.median(pv[j : j + 3]) for j in range(n)])
        tr[:, c] = np.convolve(np.pad(v, 3, mode="edge"), g, mode="valid")
    med = np.median(arr[hits], 0)
    json.dump({"x": round(float(med[0]), 4), "y": round(float(med[1]), 4), "h": round(float(med[2]), 4), "method": f"mediapipe blaze_face_short_range at {fps} fps (scripts/grade-n2, same as the devotional face.py); head h = box.h*{K}",
               "hits": len(hits), "n": n, "track": [[round(i / fps, 2)] + [round(float(v), 4) for v in tr[i]] for i in range(n)]}, open(out, "w"))
    print(f"track: {len(hits)}/{n} frames with a face -> {out}")


# ------------------------------------------------------------------------------------------ per-clip measurement
def sample_times(dur, n=24):
    return [dur * (0.06 + 0.88 * i / (n - 1)) for i in range(n)]


def wall_and_black(raw, trk, n=24):
    """the clip's neutral wall colour (outside the subject, mid-bright, low chroma) and its black per channel."""
    dur = probe(raw)["duration"]
    walls, darks, skins = [], [], []
    for t in sample_times(dur, n):
        a = frame_at(raw, t)
        sm = np.asarray(Image.fromarray(C.masks_at(trk, t)[: C.MH]).resize((W, H), Image.BILINEAR)).astype(np.float32) / 255
        sm = np.maximum(sm, np.asarray(Image.fromarray((sm * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(31))).astype(np.float32) / 255)
        y, cb, cr = C.ycc(a)
        ch = np.hypot(cb, cr)
        m = (sm < 0.05) & (y > 0.35) & (y < 0.9) & (ch < 0.045)
        m[:, :60] = False
        m[:, -60:] = False
        m[:40] = False
        if m.sum() > 2000:
            walls.append(a[m].mean(0))
        # skin pixels on the face (track box), for the per-clip skin-line fit
        x, yh, h = C.face_from_track(trk, t)
        fy, fw = yh + 0.17 * h, 0.363 * h
        x0, x1, y0, y1 = int((x - fw * 0.25) * W), int((x + fw * 0.25) * W), int((fy - 0.16 * h) * H), int((fy + 0.16 * h) * H)
        fp = a[max(0, y0):y1, max(0, x0):x1].reshape(-1, 3)
        if fp.size:
            fyy, fcb, fcr = C.ycc(fp)
            fh = C.hue_deg(fcb, fcr)
            sk = (fyy > 0.06) & (fyy < 0.75) & (fh > 60) & (fh < 175) & (np.hypot(fcb, fcr) > 0.012) & (np.hypot(fcb, fcr) < 0.075)
            skins.append(fp[sk][::4])
        # black is a LEVEL (one number for all channels): the darkest tones of a clip are often coloured (a crimson
        # shirt's folds, skin in shadow), so a per-channel black would tint the whole picture
        v = float(y[y < np.percentile(y, 0.5)].mean())
        darks.append(np.array([v, v, v]))
    sk = np.concatenate(skins) if skins else None
    return np.median(np.array(walls), 0), np.median(np.array(darks), 0), sk


def calibrate(ref_mp4):
    trk_path = os.path.join(HERE, "ref_face.json")
    if not os.path.exists(trk_path):
        track(ref_mp4, trk_path)
    wall, black, skin = wall_and_black(ref_mp4, load_track(trk_path))
    # the skin aim: what the per-clip estimator reads on the APPROVED film (identity normalisation, the film's target 137)
    ident = dict(black=[float(black[0])] * 3, ref_black=[float(black[0])] * 3, gain=[1.0, 1.0, 1.0])
    w = np.array(C.WINDOW["rgb"], dtype=np.float32) / 255
    gr = C.soft_light(C.n2(C.normalise(skin, ident), dict(C.N2, skin_target=137.0)), w, C.WINDOW["win"] * 0.7)
    _, cb, cr = C.ycc(gr)
    aim = math.degrees(math.atan2(float(cr.mean()), float(cb.mean())))
    j = dict(source=ref_mp4.replace("\\", "/"), wall_rgb=[round(float(v), 5) for v in wall], black_rgb=[round(float(v), 5) for v in black], skin_aim=round(aim, 2), note="the room N2 was approved on (THE FATHER SHOWED UP, Day 0); every clip is normalised to this")
    json.dump(j, open(REF, "w"), indent=1)
    print("ref", json.dumps(j))


def prepare(raw, work, face=None, quiet=False):
    os.makedirs(work, exist_ok=True)
    ref = json.load(open(REF))
    if not face:
        face = os.path.join(work, "face.json")
        if not os.path.exists(face):
            track(raw, face)
    trk = load_track(face)
    # the measurement is cached per work_dir (delete measure_cache.npz to re-measure)
    cache = os.path.join(work, "measure_cache.npz")
    if os.path.exists(cache) and str(np.load(cache)["raw"]) == raw:
        z = np.load(cache)
        wall, black, skin_px = z["wall"], z["black"], z["skin"]
    else:
        wall, black, skin_px = wall_and_black(raw, trk)
        np.savez(cache, wall=wall, black=black, skin=skin_px if skin_px is not None else np.zeros((0, 3)), raw=raw)
    ref_wall, ref_black = np.array(ref["wall_rgb"]), np.array(ref["black_rgb"])
    # black: the clip's darkest tones -> the reference's; white balance: the clip's wall chromaticity -> the reference's,
    # brightness kept (the gains are normalised to keep the wall's luma: the recorded wall stays as it is)
    wall_n = ref_black + (wall - black) * (1 - ref_black) / np.maximum(1e-4, 1 - black)
    gain = (ref_wall / np.maximum(1e-4, ref_wall.mean())) / (wall_n / np.maximum(1e-4, wall_n.mean()))
    gain = gain * (float(C.luma(wall_n)) / max(1e-4, float(C.luma(wall_n * gain))))
    norm = dict(black=[round(float(v), 5) for v in black], ref_black=[round(float(v), 5) for v in ref_black], gain=[round(float(v), 5) for v in gain],
                clip_wall_rgb=[round(float(v), 5) for v in wall], ref_wall_rgb=ref["wall_rgb"], face=face.replace("\\", "/"), raw=raw.replace("\\", "/"))
    tgt, est = C.fit_skin_target(skin_px, norm, aim=ref.get("skin_aim", 124.0))
    norm["skin_target"] = tgt
    norm["skin_hue_est"] = None if est is None else round(est, 1)
    json.dump(norm, open(os.path.join(work, "norm.json"), "w"), indent=1)
    for name, f in C.lut_fns(norm).items():
        C.write_cube(os.path.join(work, f"{name}.cube"), f, title=f"n2 {name}")
    open(os.path.join(work, "graph.txt"), "w").write(C.graph(work) + "\n")
    if not quiet:
        print(f"prepare: wall {np.round(wall * 255, 1)} black {np.round(black[0] * 255, 1)} -> gains {np.round(gain, 4)}; skin target {tgt} (est. {norm['skin_hue_est']} deg)  ({work})")
    return norm, trk


# ------------------------------------------------------------------------------------------ bake
def bake(raw, out, face=None, work=None, ss=0.0, dur=None, audio=True, crf=16):
    work = work or os.path.splitext(out)[0] + "_n2"
    norm, trk = prepare(raw, work, face)
    total = probe(raw)["duration"] - ss
    dur = min(dur or total, total)
    nf = int(math.floor(dur * 30))
    args = ["ffmpeg", "-v", "error", "-y", "-ss", f"{ss:.3f}", "-i", raw, "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{C.MW}x{2 * C.MH}", "-framerate", "30", "-i", "pipe:0",
            "-filter_complex", C.graph(work, pre="fps=30:start_time=0,"), "-map", "[out]"]
    if audio:
        args += ["-map", "0:a:0?", "-c:a", "aac", "-b:a", "256k"]
    args += ["-frames:v", str(nf), "-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-g", "30", "-pix_fmt", "yuv420p", *ENC_TAGS, "-t", f"{nf / 30:.3f}", "-movflags", "+faststart", out]
    p = subprocess.Popen(args, stdin=subprocess.PIPE)
    try:
        for i in range(nf + 30):  # a few spare mask frames so the graph never starves
            p.stdin.write(C.masks_at(trk, ss + i / 30).tobytes())
        p.stdin.close()
    except (BrokenPipeError, OSError):
        pass
    if p.wait() != 0:
        raise RuntimeError("encode failed")
    print(f"bake: {out} ({nf} frames from {ss:.2f} s)")


# ------------------------------------------------------------------------------------------ measure
_DET = None


def face_in_frame(a, trk, t):
    """head (x, y, h) found IN this frame (BlazeFace), so measurement boxes and crops sit on the face even when he moves
    faster than the 0.5 s track; falls back to the track."""
    global _DET
    try:
        import cv2  # noqa: F401
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions
        from mediapipe.tasks.python.vision import FaceDetector, FaceDetectorOptions

        if _DET is None:
            model = os.path.join(os.path.dirname(os.path.dirname(HERE)), "studio", "models", "blaze_face_short_range.tflite")
            _DET = FaceDetector.create_from_options(FaceDetectorOptions(base_options=BaseOptions(model_asset_path=model), min_detection_confidence=0.5))
        X0, SQ, S = 360, 1200, 480
        img = np.zeros((SQ, SQ, 3), np.uint8)
        img[:H] = (np.clip(a[:, X0 : X0 + SQ], 0, 1) * 255).astype(np.uint8)
        small = np.asarray(Image.fromarray(img).resize((S, S), Image.BILINEAR))
        r = _DET.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(small)))
        if r.detections:
            d = max(r.detections, key=lambda d: d.categories[0].score)
            if d.categories[0].score >= 0.6:
                k = S / SQ
                bb = d.bounding_box
                yc, bh = ((bb.origin_y + bb.height / 2) / k) / H, (bb.height / k) / H
                hh = bh * 1.55
                return (X0 + (bb.origin_x + bb.width / 2) / k) / W, yc + bh / 2 - hh / 2, hh
    except Exception:
        pass
    return C.face_from_track(trk, t)


def stats(a, t, trk, face=None):
    x, y, h = face or face_in_frame(a, trk, t)
    fy = y + 0.17 * h
    fw = 0.363 * h
    yy, cb, cr = C.ycc(a)
    out = {}
    x0, x1, y0, y1 = int((x - fw * 0.25) * W), int((x + fw * 0.25) * W), int((fy - 0.32 * h * 0.5) * H), int((fy + 0.32 * h * 0.5) * H)
    fy_, fcb, fcr = yy[y0:y1, x0:x1], cb[y0:y1, x0:x1], cr[y0:y1, x0:x1]
    fh = C.hue_deg(fcb, fcr)
    sk = (fy_ > 0.06) & (fy_ < 0.75) & (fh > 60) & (fh < 175) & (np.hypot(fcb, fcr) > 0.012)
    if sk.sum() > 50:
        out["skin_hue"] = math.degrees(math.atan2(float(fcr[sk].mean()), float(fcb[sk].mean())))
        out["skin_chroma"] = float(np.hypot(fcb[sk], fcr[sk]).mean() * 255)
        out["face_Y"] = float(fy_[sk].mean() * 255)
        out["face_p98"] = float(np.percentile(fy_[sk], 98) * 255)
    sm = np.asarray(Image.fromarray(C.masks_at(trk, t)[: C.MH]).resize((W, H), Image.BILINEAR)).astype(np.float32) / 255
    sm = np.asarray(Image.fromarray((sm * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(41))).astype(np.float32) / 255
    wallm = (sm < 0.05) & (yy > 0.3)
    wallm[:, :60] = wallm[:, -60:] = False
    ch = np.hypot(cb, cr)
    hue = C.hue_deg(cb, cr)
    neutral = wallm & (ch < 0.05)
    out["wall_Y"] = float(yy[neutral].mean() * 255)
    rgb = a[neutral].mean(0) * 255
    out["wall_RmB"] = float(rgb[0] - rgb[2])
    pm = wallm & (hue > 118) & (hue < 205) & (ch > 0.03)
    out["patch_chroma_p95"] = float(np.percentile(ch[wallm & (hue > 118) & (hue < 205)], 95) * 255) if pm.any() else 0.0
    out["patch_px"] = int(pm.sum())
    # blacks: the darkest 1 % of the NEUTRAL-ish pixels (a red shirt's folds are not 'black')
    nz = np.hypot(cb, cr) < 0.035
    k = nz & (yy < np.percentile(yy[nz], 1.0))
    bl = a[k].mean(0) * 255
    out["black_Y"] = float(yy[k].mean() * 255)
    out["black_cast"] = float(max(bl) - min(bl))
    out["black_bmr"] = float(bl[2] - bl[0])
    out["white_p995"] = float(np.percentile(yy, 99.5) * 255)
    # the shirt: below the chin, centre column, the most saturated cluster (crimson on Day 1)
    sx0, sx1, sy0, sy1 = int((x - fw * 0.6) * W), int((x + fw * 0.6) * W), int(min(H - 2, (y + h * 0.75) * H)), int(min(H - 1, (y + h * 1.25) * H))
    if sy1 - sy0 > 10:
        sp = a[sy0:sy1, sx0:sx1].reshape(-1, 3)
        sy_, scb, scr = C.ycc(sp)
        sc = np.hypot(scb, scr)
        top = sc > np.percentile(sc, 70)
        out["shirt_rgb"] = [float(v * 255) for v in sp[top].mean(0)]
        out["shirt_hue"] = math.degrees(math.atan2(float(scr[top].mean()), float(scb[top].mean())))
        out["shirt_chroma"] = float(np.hypot(scb[top].mean(), scr[top].mean()) * 255)
        out["shirt_box"] = [sx0, sy0, sx1, sy1]
    return out


THRESH = {
    "skin_hue": (120.0, 128.0),       # N2 skin line 123 +- 3 (+2 margin for other shirts / light)
    "skin_chroma": (8.0, 16.0),       # moderate: not ashy, not boosted (B2 was 17)
    "wall_RmB": (2.0, 9.0),           # about +5: neutral-warm wall, never cold, never yellow
    "black_cast_d": (-99.0, 3.0),     # the grade adds no cast to the blacks (graded - raw, max-min of the darkest 1 % neutral RGB)
    "black_bmr_d": (-6.0, 3.0),       # no blue wash added (graded - raw, blue minus red of those blacks; a navy shirt stays
                                      # navy); at most a slight warming of dark skin-adjacent tones
    "face_p98": (0.0, 200.0),         # speculars tamed
    "shirt_dhue": (-4.0, 4.0),        # a shirt keeps its hue (crimson must not go orange/magenta)
    "colour_path": (0.0, 3.0),        # graded MP4 decoded = the expected numpy result within 3/255 (matrix + range right)
}


def measure(raw, graded, face=None, work=None, ss=0.0, n=4):
    work = work or os.path.splitext(graded)[0] + "_n2"
    norm_path = os.path.join(work, "norm.json")
    norm = json.load(open(norm_path)) if os.path.exists(norm_path) else prepare(raw, work, face, quiet=True)[0]
    trk = load_track(face or norm.get("face"))
    gp = probe(graded)
    tags_ok = gp.get("color_space") == "bt709" and gp.get("color_range") == "tv" and gp.get("color_primaries") == "bt709" and gp.get("color_transfer") == "bt709" and gp.get("pix_fmt") == "yuv420p"
    gdur = gp["duration"]
    times = [ss + gdur * f for f in ([0.2, 0.4, 0.6, 0.8] if n == 4 else np.linspace(0.1, 0.9, n))]
    rows, fails = [], []
    print(f"\nN2 measure  raw={raw}\n            graded={graded}  (tags {gp.get('color_space')}/{gp.get('color_range')}/{gp.get('pix_fmt')}: {'OK' if tags_ok else 'WRONG'})")
    hdr = f"{'t':>7} | {'skin hue':>15} | {'skin C':>11} | {'face p98':>11} | {'wall R-B':>11} | {'wall Y':>11} | {'patch p95':>11} | {'black Y':>10} | {'blk cast':>9} | {'shirt hue':>15} | path"
    print(hdr)
    print("-" * len(hdr))
    for t in times:
        # the same frame on both sides: frame k of the graded CFR-30 file = frame k of the raw through the bake's own
        # "-ss ss ... fps=30:start_time=0" resample (a VFR phone file has no frame at exactly t)
        k = int(round((t - ss) * 30))
        t = ss + k / 30
        a = frame_cfr(raw, ss, k)
        g = frame_cfr(graded, 0.0, k, resample=False)
        fc = face_in_frame(a, trk, t)
        sa, sg = stats(a, t, trk, fc), stats(g, t, trk, fc)
        # colour path: expected = the same LUTs + masks applied in numpy to the explicitly decoded raw frame
        m = C.masks_at(trk, t)
        sm = np.asarray(Image.fromarray(m[: C.MH]).resize((W, H), Image.BICUBIC)).astype(np.float32) / 255
        wn = np.asarray(Image.fromarray(m[C.MH :]).resize((W, H), Image.BICUBIC)).astype(np.float32) / 255
        exp = C.apply_numpy(a, norm, sm, wn)
        boxes = {"face": None, "wall": None, "shirt": sg.get("shirt_box")}
        x, y, h = fc
        fx, fyy = int(x * W), int((y + 0.17 * h) * H)
        boxes["face"] = [fx - 30, fyy - 20, fx + 30, fyy + 40]
        boxes["wall"] = [1500, 150, 1800, 400]
        dmax = 0.0
        for k, b in boxes.items():
            if not b:
                continue
            x0, y0, x1, y1 = b
            # median of the per-pixel difference: a matrix/range error is a bias over the whole patch; grain, the temporal
            # denoise and edges are not
            d = np.abs(np.median((exp[y0:y1, x0:x1] - g[y0:y1, x0:x1]).reshape(-1, 3), 0)) * 255
            dmax = max(dmax, float(d.max()))
        row = dict(t=round(t, 2), raw=sa, n2=sg, colour_path=dmax)
        if "shirt_hue" in sa and "shirt_hue" in sg and sa.get("shirt_chroma", 0) > 12:  # a hue only means something on a coloured shirt
            row["shirt_dhue"] = (sg["shirt_hue"] - sa["shirt_hue"] + 180) % 360 - 180
        rows.append(row)
        f = lambda k, fmt="{:6.1f}": (fmt.format(sa[k]) if k in sa else "   -  ") + " > " + (fmt.format(sg[k]) if k in sg else "   -  ")
        print(f"{t:7.1f} | {f('skin_hue')} | {f('skin_chroma', '{:4.1f}')} | {f('face_p98', '{:4.0f}')} | {f('wall_RmB', '{:4.1f}')} | {f('wall_Y', '{:4.0f}')} | {f('patch_chroma_p95', '{:4.1f}')} | {f('black_Y', '{:3.0f}')} | {f('black_cast', '{:3.1f}')} | {f('shirt_hue')} | {dmax:4.1f}")
    # verdicts on the graded side (means over the moments)
    def mean(k, side="n2"):
        v = [r[side][k] for r in rows if k in r[side]]
        return float(np.mean(v)) if v else None
    checks = {k: mean(k) for k in ("skin_hue", "skin_chroma", "wall_RmB", "face_p98")}
    checks["black_cast_d"] = mean("black_cast") - mean("black_cast", "raw")
    checks["black_bmr_d"] = mean("black_bmr") - mean("black_bmr", "raw")
    checks["shirt_dhue"] = float(np.mean([r["shirt_dhue"] for r in rows if "shirt_dhue" in r])) if any("shirt_dhue" in r for r in rows) else None
    checks["colour_path"] = max(r["colour_path"] for r in rows)
    print("\nverdict (graded, mean of the moments):")
    for k, v in checks.items():
        lo, hi = THRESH[k]
        ok = v is None or (lo <= v <= hi)
        if not ok:
            fails.append(k)
        print(f"  {'PASS' if ok else 'FAIL'}  {k:12s} {('%.1f' % v) if v is not None else '-':>7}   (want {lo} .. {hi})")
    pr, pg = mean("patch_chroma_p95", "raw"), mean("patch_chroma_p95")
    pc = pg / pr if pr else 0
    ok = pr is None or pr < 6 or 0.2 <= pc <= 0.55
    if not ok:
        fails.append("patch")
    print(f"  {'PASS' if ok else 'FAIL'}  patch calm   {pc:7.2f}   (graded / raw p95 chroma of the yellow wall; want 0.2 .. 0.55)")
    print(f"  {'PASS' if tags_ok else 'FAIL'}  tags         bt709 / tv / yuv420p")
    if not tags_ok:
        fails.append("tags")
    json.dump(dict(rows=rows, checks=checks, fails=fails), open(os.path.join(work, "measure.json"), "w"), indent=1)
    print("\n" + ("ALL PASS" if not fails else f"{len(fails)} FAIL: {', '.join(fails)}"))
    return not fails


# ------------------------------------------------------------------------------------------ check-mp4 (Remotion trap)
def check_mp4(mp4, ref_png, frame, tol=3.0):
    S = np.asarray(Image.open(ref_png).convert("RGB")).astype(np.float32)
    h, w, _ = S.shape
    gp = probe(mp4)
    R, G, B = S[..., 0], S[..., 1], S[..., 2]
    er = lambda m: np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(7))) > 127
    masks = {
        "red/orange": er((R > 150) & (R - G > 50) & (R - B > 70)),
        "gold": er((R > 190) & (G > 140) & (B < 130) & (R - B > 90)),
        "green": er((G > R + 25) & (G > B + 15) & (G > 70)),
        "skin": er((R > 50) & (R < 150) & (R > G + 12) & (G > B) & (R - B > 25) & (R - B < 80)),
        "blue": er((B > 150) & (B > R + 30)),
    }
    print(f"check-mp4 {mp4} frame {frame} vs {ref_png}\n  tags: {gp.get('pix_fmt')} {gp.get('color_space')}/{gp.get('color_range')} primaries {gp.get('color_primaries')} trc {gp.get('color_transfer')}")
    verdict = None
    for name, vf in (("as tagged", f"scale={w}:{h}:flags=bicubic,format=rgb24"), ("forced bt709 tv", f"scale=in_color_matrix=bt709:in_range=tv:out_range=pc,scale={w}:{h}:flags=bicubic,format=rgb24"), ("forced bt601 pc", f"scale=in_color_matrix=bt601:in_range=pc:out_range=pc,scale={w}:{h}:flags=bicubic,format=rgb24")):
        r = run(["ffmpeg", "-v", "error", "-i", mp4, "-vf", f"select=eq(n\\,{frame}),{vf}", "-frames:v", "1", "-fps_mode", "passthrough", "-f", "rawvideo", "-"])
        D = np.frombuffer(r.stdout, np.uint8).reshape(h, w, 3).astype(np.float32)
        worst = 0.0
        parts = []
        for k, m in masks.items():
            if m.sum() < 60:
                continue
            d = np.abs(S[m].mean(0) - D[m].mean(0))
            worst = max(worst, float(d.max()))
            parts.append(f"{k} {np.round(S[m].mean(0)).astype(int).tolist()}->{np.round(D[m].mean(0)).astype(int).tolist()}")
        print(f"  decode {name:16s} max |d| {worst:4.1f}  " + "  ".join(parts))
        if verdict is None:
            verdict = worst
    ok = verdict <= tol and gp.get("color_space") == "bt709" and gp.get("color_range") == "tv"
    print(f"  {'PASS' if ok else 'FAIL'}: as-tagged decode within {tol}/255 of the reference and tagged bt709/tv")
    return ok


# ------------------------------------------------------------------------------------------ review sheet
def sheet(raw, out, cols, face=None, times=None, title=""):
    trk = load_track(face)
    dur = probe(raw)["duration"]
    times = times or [dur * f for f in (0.15, 0.38, 0.62, 0.85)]
    cw, ch = 640, 360
    fz = 2
    pad, lab = 12, 28
    font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 22)
    fs = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 17)
    names = ["raw"] + [c[0] for c in cols]
    face_h = 300
    Wt = pad + len(names) * (cw + pad)
    Ht = 70 + len(times) * (ch + lab + face_h + lab + pad)
    S = Image.new("RGB", (Wt, Ht), (22, 21, 20))
    d = ImageDraw.Draw(S)
    d.text((pad, 10), title, font=font, fill=(240, 236, 230))
    for i, n in enumerate(names):
        d.text((pad + i * (cw + pad), 40), n, font=font, fill=(255, 214, 150) if n.startswith("N2") else (210, 210, 210))
    y0 = 70
    for t in times:
        x, y, h = C.face_from_track(trk, t)
        fw = 0.363 * h * W
        fcx, fcy = x * W, (y + 0.05 * h) * H
        bw, bh = fw * 1.25, fw * 1.25 * face_h / cw
        box = (int(fcx - bw / 2), int(fcy - bh / 2), int(fcx + bw / 2), int(fcy + bh / 2))
        for i, n in enumerate(names):
            if n == "raw":
                a = frame_at(raw, t)
            else:
                path, off = cols[i - 1][1]
                a = frame_at(path, t - off)
            im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))
            xx = pad + i * (cw + pad)
            S.paste(im.resize((cw, ch), Image.LANCZOS), (xx, y0 + lab))
            st = stats(a, t, trk)
            d.text((xx, y0 + 4), f"t {t:.1f}s   skin {st.get('skin_hue', 0):.0f} deg C {st.get('skin_chroma', 0):.1f}   wall R-B {st.get('wall_RmB', 0):+.1f}", font=fs, fill=(225, 220, 210))
            fc = im.crop(box).resize((cw, face_h), Image.LANCZOS)
            S.paste(fc, (xx, y0 + lab + ch + lab))
            d.text((xx, y0 + lab + ch + 5), f"face 2x   shirt hue {st.get('shirt_hue', 0):.0f}   black Y {st.get('black_Y', 0):.0f}", font=fs, fill=(225, 220, 210))
        y0 += ch + lab + face_h + lab + pad
    S.save(out, quality=90)
    print("sheet:", out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd")
    ap.add_argument("a", nargs="*")
    ap.add_argument("--face")
    ap.add_argument("--work")
    ap.add_argument("--ss", type=float, default=0.0)
    ap.add_argument("--t", type=float)
    ap.add_argument("--no-audio", action="store_true")
    ap.add_argument("--crf", type=int, default=16)
    ap.add_argument("--cols", nargs="*", default=[])
    ap.add_argument("--times")
    ap.add_argument("--title", default="")
    o = ap.parse_args()
    if o.cmd == "calibrate":
        calibrate(o.a[0])
    elif o.cmd == "track":
        track(o.a[0], o.a[1])
    elif o.cmd == "prepare":
        prepare(o.a[0], o.a[1], o.face)
    elif o.cmd == "bake":
        bake(o.a[0], o.a[1], o.face, o.work, o.ss, o.t, not o.no_audio, o.crf)
    elif o.cmd == "measure":
        sys.exit(0 if measure(o.a[0], o.a[1], o.face, o.work, o.ss) else 1)
    elif o.cmd == "check-mp4":
        sys.exit(0 if check_mp4(o.a[0], o.a[1], int(o.a[2])) else 1)
    elif o.cmd == "sheet":
        cols = []
        for c in o.cols:
            n, v = c.split("=", 1)
            p, off = (v.rsplit("@", 1) + ["0"])[:2] if "@" in v else (v, "0")
            cols.append((n, (p, float(off))))
        sheet(o.a[0], o.a[1], cols, o.face, [float(x) for x in o.times.split(",")] if o.times else None, o.title)
    else:
        print(__doc__ or "see README.md")
        sys.exit(2)
