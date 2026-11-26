# The grading studio: measure a recording the way a colourist reads the scopes, then build a camera-like grade from
# the measurements (white balance, black and white points, a tone curve that exposes for his face and protects the
# highlights, natural saturation) — one consistent rendering of the whole picture, nothing painted region by region.
#
#   $PY scripts/december/grade/studio.py measure <frame.png> [<matte.png>] --face x,y,h
#   $PY scripts/december/grade/studio.py look <raw.png> <out.png> --look A|B|C --face x,y,h [--matte m.png] [--json out.json]
#   $PY scripts/december/grade/studio.py cube <out.cube> --look A --params params.json      (65^3 LUT of the global part)
#   $PY scripts/december/grade/studio.py prepare <raw.mp4> <work/dayNN/studio> --look B --face-json face.json --matte n3/matte.mkv --headx headx.json
#        measures 24 moments of the recording, fits the look to it, writes params.json + grade.cube + measure.json
#   $PY scripts/december/grade/studio.py check <graded.mp4> <work/dayNN/studio> --face-json face.json --matte n3/matte.mkv --headx headx.json
#        measures the same moments of the graded master against what the fit aimed for (PASS / FAIL lines; exit 1 on a fail)
#
# Frames are RGB, full range, display-referred (decode with scale=in_color_matrix=bt709:in_range=tv:out_range=pc).
# Everything here is GLOBAL (the same for every pixel of a given colour) except the optional background trim of looks
# B and C, which uses the person matte the pipeline already makes.
import argparse, json, math, sys
import numpy as np
from PIL import Image
from scipy.interpolate import PchipInterpolator

LUMA = np.array([0.2126, 0.7152, 0.0722])


def load(p):
    return np.asarray(Image.open(p).convert("RGB"), np.float64) / 255.0


def save(a, p):
    Image.fromarray(np.clip(a * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(p)


def luma(a):
    return a @ LUMA


def ycc(a):
    y = luma(a)
    return y, (a[..., 2] - y) / 1.8556, (a[..., 0] - y) / 1.5748


def from_ycc(y, cb, cr):
    r = y + 1.5748 * cr
    b = y + 1.8556 * cb
    g = (y - 0.2126 * r - 0.0722 * b) / 0.7152
    return np.stack([r, g, b], -1)


def hue_deg(cb, cr):
    """angle on a vectorscope (0 = +Cb, counter-clockwise); the skin-tone line sits near 123 degrees"""
    return (np.degrees(np.arctan2(cr, cb)) + 360.0) % 360.0


def regions(a, face, matte=None):
    """masks: skin of his face, the wall, the white print on his clothes"""
    h, w, _ = a.shape
    yy, xx = np.mgrid[0:h, 0:w]
    fx, fy, fh = face
    y, cb, cr = ycc(a)
    hue = hue_deg(cb, cr)
    chroma = np.hypot(cb, cr)
    # face ellipse (a little inside the head box: no cap, no wall)
    ex = (xx / w - fx) / (fh * 0.23 * h / w * 16 / 9 * 9 / 16 * (h / w) ** 0 + 1e-9)
    ex = (xx / w - fx) / (fh * 0.26 * h / w)
    ey = (yy / h - (fy + fh * 0.12)) / (fh * 0.36)
    in_face = ex * ex + ey * ey < 1.0
    skin = in_face & (hue > 95) & (hue < 150) & (chroma > 0.012) & (chroma < 0.11) & (y > 0.05) & (y < 0.8)
    person = matte > 0.5 if matte is not None else np.zeros((h, w), bool)
    wall = (~person if matte is not None else np.ones((h, w), bool)) & ~in_face
    if matte is None:
        # no matte: the wall = the outer columns
        wall &= (np.abs(xx / w - fx) > 0.3)
    white = (person if matte is not None else np.ones((h, w), bool)) & (y > 0.62) & (chroma < 0.035) & (yy / h > fy + fh * 0.45)
    return dict(skin=skin, wall=wall, white=white, person=person)


def pct(v, q):
    return float(np.percentile(v, q)) if v.size else float("nan")


def measure(a, face, matte=None):
    r = regions(a, face, matte)
    y, cb, cr = ycc(a)
    out = {}
    out["luma_p1_p50_p99"] = [round(pct(y, q), 4) for q in (1, 50, 99)]
    out["black"] = round(pct(y, 0.1), 4)
    out["clipped_hi_pct"] = round(float((a.max(-1) > 0.985).mean() * 100), 3)
    out["crushed_lo_pct"] = round(float((a.max(-1) < 0.02).mean() * 100), 3)
    for k in ("skin", "wall", "white"):
        m = r[k]
        if m.sum() < 50:
            out[k] = None
            continue
        px = a[m]
        yk, cbk, crk = ycc(px)
        out[k] = dict(
            n=int(m.sum()),
            rgb=[round(float(v), 4) for v in np.median(px, 0)],
            luma_p10_p50_p90=[round(pct(yk, q), 4) for q in (10, 50, 90)],
            hue=round(float(hue_deg(np.median(cbk), np.median(crk))), 1),
            chroma=round(float(np.hypot(np.median(cbk), np.median(crk))), 4),
        )
    if out.get("skin") and out.get("wall"):
        out["face_to_wall"] = round(out["skin"]["luma_p10_p50_p90"][1] / out["wall"]["luma_p10_p50_p90"][1], 3)
    return out


# ───────────────────────────────────────────── the looks
SKIN_LINE = 120.0  # where natural brown skin sits on the vectorscope (the recordings put his at 103-107: a little cool)
LOOKS = {
    # A — "clean": true blacks, his face exposed, highlights held. The least done.
    "A": dict(wb=0.0, skin_y=0.41, max_lift=1.45, wall_keep=1.0, black=0.035, contrast=0.0, sat=1.03, hue_share=0.5, sat_ease=0.30),
    # B — "balanced": a little more exposure and depth, colour a touch richer, skin on the natural line.
    "B": dict(wb=0.0, skin_y=0.43, max_lift=1.5, wall_keep=0.98, black=0.028, contrast=0.10, sat=1.07, hue_share=0.8, sat_ease=0.28),
    # C — "rich": the fullest contrast and colour that still reads as a camera, not a filter.
    "C": dict(wb=0.0, skin_y=0.45, max_lift=1.55, wall_keep=0.96, black=0.022, contrast=0.18, sat=1.11, hue_share=1.0, sat_ease=0.26),
}


def merge(ms):
    """one measurement from several frames of a recording: the median of each number"""
    def med(path):
        vals = []
        for m in ms:
            v = m
            for k in path:
                v = None if v is None else v.get(k) if isinstance(v, dict) else v[k]
            if v is not None:
                vals.append(v)
        return None if not vals else np.median(np.array(vals, float), 0).tolist()
    out = dict(luma_p1_p50_p99=med(["luma_p1_p50_p99"]), black=med(["black"]))
    for k in ("skin", "wall", "white"):
        if med([k, "rgb"]) is None:
            out[k] = None
        else:
            out[k] = dict(rgb=med([k, "rgb"]), luma_p10_p50_p90=med([k, "luma_p10_p50_p90"]), hue=med([k, "hue"]), chroma=med([k, "chroma"]))
    return out


def fit(m, look):
    """the numbers of a grade for THIS recording, from its measurements (m = measure() of raw frames, merged)"""
    L = LOOKS[look]
    p = dict(look=look)
    # 1. white balance. Measured on these recordings (the white print on his tees, Days 3 and 4): the camera's
    #    balance is already neutral to within 1-2 %, and the warm cast is the wall's own paint. So every look leaves
    #    it alone (wb = 0). The share is here for a recording whose white print reads off-neutral; it needs a clean
    #    white (hands in the light are not one), so it is only used when the look asks for it.
    gains = np.ones(3)
    if L["wb"] > 0 and m.get("white"):
        g = np.array(m["white"]["rgb"], float)
        gains = np.clip((g.mean() / g) ** L["wb"], 0.97, 1.03)
        gains = gains / (gains @ LUMA)
    p["gains"] = [round(float(v), 5) for v in gains]
    # 2. the tone curve (on luma, hue kept): the darkest tones go to black, his face to its exposure, the wall is
    #    held, the brightest strokes eased
    sk = m["skin"]["luma_p10_p50_p90"]
    wl = m["wall"]["luma_p10_p50_p90"]
    b0 = m["black"]
    p1 = m["luma_p1_p50_p99"][0]
    hi = m["luma_p1_p50_p99"][2]
    B = L["black"]
    s_in = sk[1]
    s_out = max(s_in, min(L["skin_y"], s_in * L["max_lift"]))
    g = s_out / s_in
    # the toe: only the very darkest tones (cap, hair, deep folds) go down to black; by the first percentile the curve
    # is back above the recording, so the shaded parts of his face (beard, eye sockets under the brim) keep their
    # detail and come up with the rest of him
    t1 = max(p1, b0 + 0.06)
    pts = [(0.0, 0.0), (b0, B), (t1, t1 * g ** 0.55)]
    pts.append((sk[0], sk[0] * g ** 1.06))  # the shaded side of his face comes up a touch more than the lit side
    pts.append((s_in, s_out))
    pts.append((sk[2], min(sk[2] * g ** 0.82, s_out + (sk[2] - s_in) * 1.05)))
    w_in = wl[1]
    w_out = min(0.78, max(s_out + 0.14, w_in * L["wall_keep"]))
    pts.append((w_in, w_out))
    top_in = min(0.985, max(hi, wl[2], w_in + 0.1))
    pts.append((top_in, min(0.955, max(w_out + 0.1, top_in * 0.99))))
    pts.append((1.0, 1.0))
    pts = sorted(pts)
    xs, ys = [pts[0][0]], [pts[0][1]]
    for x, y in pts[1:]:
        if x > xs[-1] + 0.015 and y > ys[-1] + 0.006:
            xs.append(x)
            ys.append(y)
    if xs[-1] < 1.0:
        xs.append(1.0)
        ys.append(1.0)
    p["curve"] = [[round(float(x), 4), round(float(y), 4)] for x, y in zip(xs, ys)]
    p["contrast"] = L["contrast"]
    p["pivot"] = round(float(s_out + 0.03), 4)
    p["sat"] = L["sat"]
    p["sat_ease"] = L["sat_ease"]
    p["bg"] = 0.0
    # 3. skin: turned from where this recording puts it toward the natural skin-tone line, by the look's share
    p["skin_hue"] = round(float(m["skin"]["hue"]), 2)
    p["skin_turn"] = round(float(np.clip((SKIN_LINE - m["skin"]["hue"]) * L["hue_share"], -6, 16)), 2)
    return p


def curve_fn(p):
    xs = np.array([c[0] for c in p["curve"]])
    ys = np.array([c[1] for c in p["curve"]])
    f = PchipInterpolator(xs, ys)
    k = p.get("contrast", 0.0)
    pv = p.get("pivot", 0.45)

    def g(y):
        o = np.clip(f(np.clip(y, 0, 1)), 0, 1)
        if k:
            # a gentle S around the pivot (his face): the pivot stays, tones either side spread a little, ends meet
            d = o - pv
            span = np.where(d < 0, pv, 1 - pv)
            t = np.clip(np.abs(d) / span, 0, 1)
            o = pv + d * (1 + k * (1 - t * t))
        return np.clip(o, 0, 1)

    return g


def apply_global(a, p):
    """the part of the grade that is the same for every pixel of a given colour (this is what the .cube holds)"""
    x = np.clip(a * np.array(p["gains"]), 0, 1)
    y = luma(x)
    f = curve_fn(p)
    y2 = f(y)
    ratio = np.where(y > 1e-4, y2 / np.maximum(y, 1e-4), 0.0)
    # a colour that is already bright in one channel (a red tee in the light) is not pushed further: lifting it
    # would run the channel out of range and turn the red pale. Its lift eases off as its brightest channel nears 0.9.
    mxc = x.max(-1)
    room = np.clip(0.90 / np.maximum(mxc, 1e-4), 1.0, None)
    ratio = np.where(ratio > 1.0, 1.0 + (np.minimum(ratio, room) - 1.0) * np.clip((room - 1.0) / 0.25, 0.0, 1.0) ** 0.5, ratio)
    y2 = y * ratio
    # brightness and colour move together: a lifted tone keeps its hue, and a share of its colourfulness
    yy, cb, cr = ycc(x)
    e = np.power(np.maximum(ratio, 1e-3), 1.0 - p["sat_ease"])
    sat = p["sat"]
    cb2, cr2 = cb * e * sat, cr * e * sat
    # skin: turned toward the natural skin-tone line. Only skin-coloured pixels (around this recording's own skin
    # hue, moderate chroma): the red of a tee is far more saturated and stays where it is.
    turn = p.get("skin_turn", 0.0)
    if turn:
        hue = hue_deg(cb2, cr2)
        ch = np.hypot(cb2, cr2)
        d = np.abs(((hue - p["skin_hue"] + 180) % 360) - 180)
        sw = np.clip(1 - (d - 8) / 16.0, 0, 1) * np.clip((ch - 0.006) / 0.012, 0, 1) * np.clip((0.105 - ch) / 0.035, 0, 1)
        th = np.radians(turn) * sw
        cb2, cr2 = cb2 * np.cos(th) - cr2 * np.sin(th), cb2 * np.sin(th) + cr2 * np.cos(th)
    out = from_ycc(y2, cb2, cr2)
    # never clip a colour: pull chroma in where a channel would leave the range
    mx = out.max(-1)
    mn = out.min(-1)
    over = np.maximum(0, mx - 0.985) / np.maximum(mx - y2, 1e-4)
    under = np.maximum(0, 0.0 - mn) / np.maximum(y2 - mn, 1e-4)
    t = np.clip(np.maximum(over, under), 0, 1)[..., None]
    out = y2[..., None] + (out - y2[..., None]) * (1 - t)
    return np.clip(out, 0, 1)


def apply(a, p, matte=None):
    out = apply_global(a, p)
    bg = p.get("bg", 0.0)
    if bg and matte is not None:
        # the wall a touch further back: slightly down and slightly less colourful, behind him only
        y, cb, cr = ycc(out)
        back = from_ycc(y * (1 - bg), cb * (1 - bg * 1.2), cr * (1 - bg * 1.2))
        m = np.clip(matte, 0, 1)[..., None]
        out = back + (out - back) * m
    return np.clip(out, 0, 1)


def write_cube(path, p, n=65):
    g = np.linspace(0, 1, n)
    b, gg, r = np.meshgrid(g, g, g, indexing="ij")
    lut = apply_global(np.stack([r, gg, b], -1).reshape(-1, 3), p)
    with open(path, "w") as f:
        f.write(f"TITLE \"studio {p.get('look', '')}\"\nLUT_3D_SIZE {n}\n")
        for row in lut:
            f.write(f"{row[0]:.6f} {row[1]:.6f} {row[2]:.6f}\n")


def grab(path, t, w=960, h=540, gray=False):
    """one frame at t seconds as an array (RGB full range, or the matte as 0..1)"""
    import subprocess
    vf = f"scale={w}:{h}:flags=area,format=gray" if gray else f"scale={w}:{h}:flags=area:in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb24"
    r = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-ss", f"{t:.3f}", "-i", path, "-frames:v", "1", "-vf", vf, "-f", "rawvideo", "-"], capture_output=True)
    n = w * h * (1 if gray else 3)
    if len(r.stdout) < n:
        return None
    a = np.frombuffer(r.stdout[:n], np.uint8).astype(np.float64) / 255.0
    return a.reshape(h, w) if gray else a.reshape(h, w, 3)


def duration(path):
    import subprocess
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True)
    return float(r.stdout.strip())


def sample(video, face, matte_path, headx, n=24, times=None):
    """measure n moments of a video. Returns (times, measurements); a moment where his face is not showing
    (head bowed: the cap fills the face area) is measured but flagged skin_ok = False."""
    if times is None:
        d = min(duration(video), len(headx["x"]) / 30.0 if headx else 1e9)
        times = [round(d * (0.06 + 0.88 * i / (n - 1)), 3) for i in range(n)]
    ms = []
    for t in times:
        a = grab(video, t)
        m = grab(matte_path, t, gray=True) if matte_path else None
        if a is None:
            ms.append(None)
            continue
        fx = headx["x"][min(len(headx["x"]) - 1, int(round(t * 30)))] if headx else face[0]
        r = measure(a, [fx, face[1], face[2]], m)
        ms.append(r)
    hues = [m["skin"]["hue"] for m in ms if m and m.get("skin") and m["skin"]["n"] > 1500]
    med = float(np.median(hues)) if hues else 0.0
    for m in ms:
        if m:
            m["skin_ok"] = bool(m.get("skin") and m["skin"]["n"] > 1500 and abs(m["skin"]["hue"] - med) < 9 and m.get("wall"))
    return times, ms


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd")
    ap.add_argument("args", nargs="*")
    ap.add_argument("--face")
    ap.add_argument("--matte")
    ap.add_argument("--look", default="A")
    ap.add_argument("--json")
    ap.add_argument("--params")
    ap.add_argument("--face-json")
    ap.add_argument("--headx")
    o = ap.parse_args()
    face = [float(v) for v in o.face.split(",")] if o.face else [0.48, 0.31, 0.29]
    matte = None
    if o.matte and o.cmd in ("measure", "look"):
        matte = np.asarray(Image.open(o.matte).convert("L"), np.float64) / 255.0
    if o.cmd == "measure":
        a = load(o.args[0])
        if matte is not None and matte.shape != a.shape[:2]:
            matte = np.asarray(Image.fromarray((matte * 255).astype(np.uint8)).resize((a.shape[1], a.shape[0]), Image.BILINEAR), np.float64) / 255.0
        print(json.dumps(measure(a, face, matte), indent=1))
    elif o.cmd == "look":
        a = load(o.args[0])
        if matte is not None and matte.shape != a.shape[:2]:
            matte = np.asarray(Image.fromarray((matte * 255).astype(np.uint8)).resize((a.shape[1], a.shape[0]), Image.BILINEAR), np.float64) / 255.0
        m = measure(a, face, matte)
        p = json.load(open(o.params)) if o.params else fit(merge([m]), o.look)
        out = apply(a, p, matte)
        save(out, o.args[1])
        res = dict(params=p, before=m, after=measure(out, face, matte))
        if o.json:
            json.dump(res, open(o.json, "w"), indent=1)
        b, af = m, res["after"]
        print(f"{o.look}: gains {p['gains']}  skin {b['skin']['luma_p10_p50_p90'][1]:.3f}->{af['skin']['luma_p10_p50_p90'][1]:.3f}  hue {b['skin']['hue']}->{af['skin']['hue']}  chroma {b['skin']['chroma']}->{af['skin']['chroma']}  wall {b['wall']['luma_p10_p50_p90'][1]:.3f}->{af['wall']['luma_p10_p50_p90'][1]:.3f}  face/wall {b.get('face_to_wall')}->{af.get('face_to_wall')}  p1/p99 {b['luma_p1_p50_p99'][0]:.3f}/{b['luma_p1_p50_p99'][2]:.3f}->{af['luma_p1_p50_p99'][0]:.3f}/{af['luma_p1_p50_p99'][2]:.3f}  clip {af['clipped_hi_pct']}%")
    elif o.cmd in ("prepare", "check"):
        import os
        video, work = o.args[0], o.args[1]
        fj = json.load(open(o.face_json))
        face = [fj["x"], fj["y"], fj["h"]]
        headx = json.load(open(o.headx)) if o.headx else None
        if o.cmd == "prepare":
            os.makedirs(work, exist_ok=True)
            times, ms = sample(video, face, o.matte, headx)
            good = [m for m in ms if m and m["skin_ok"]]
            if len(good) < 6:
                sys.exit(f"studio prepare: his face was readable in only {len(good)} of {len(ms)} sampled moments")
            mm = merge(good)
            p = fit(mm, o.look)
            p["aim_skin_y"] = p["curve"][[c[0] for c in p["curve"]].index(min(p["curve"], key=lambda c: abs(c[0] - mm["skin"]["luma_p10_p50_p90"][1]))[0])][1]
            json.dump(p, open(os.path.join(work, "params.json"), "w"), indent=1)
            json.dump(dict(look=o.look, times=times, used=[bool(m and m["skin_ok"]) for m in ms], raw=mm), open(os.path.join(work, "measure.json"), "w"), indent=1)
            write_cube(os.path.join(work, "grade.cube"), p)
            sk, wl = mm["skin"], mm["wall"]
            print(f"studio prepare (look {o.look}): {len(good)}/{len(ms)} moments used; recorded black {mm['black']:.3f}, face {sk['luma_p10_p50_p90'][1]:.3f} (hue {sk['hue']:.1f}, chroma {sk['chroma']:.4f}), wall {wl['luma_p10_p50_p90'][1]:.3f}; face aim {p['aim_skin_y']:.3f}, skin turn {p['skin_turn']:+.1f} deg  ({work})")
        else:
            import subprocess
            p = json.load(open(os.path.join(work, "params.json")))
            mj = json.load(open(os.path.join(work, "measure.json")))
            times, ms = sample(video, face, o.matte, headx, times=mj["times"])
            good = [m for m, u in zip(ms, mj["used"]) if m and u and m.get("skin") and m.get("wall")]
            mm = merge(good)
            raw = mj["raw"]
            tags = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=color_space,color_range,pix_fmt", "-of", "csv=p=0", video], capture_output=True, text=True).stdout.strip()
            sk = mm["skin"]
            checks = [
                ("face_luma", sk["luma_p10_p50_p90"][1], p["aim_skin_y"] - 0.03, p["aim_skin_y"] + 0.03),
                ("face_gain", sk["luma_p10_p50_p90"][1] / raw["skin"]["luma_p10_p50_p90"][1], 1.0, 1.55),
                ("skin_hue", sk["hue"], 108.0, 126.0),
                ("skin_chroma", sk["chroma"], 0.022, 0.055),
                ("black", mm["black"], 0.0, 0.06),
                ("wall_luma", mm["wall"]["luma_p10_p50_p90"][1], raw["wall"]["luma_p10_p50_p90"][1] - 0.05, raw["wall"]["luma_p10_p50_p90"][1] + 0.03),
                ("highlights_clipped_pct", max(m["clipped_hi_pct"] for m in good), 0.0, 1.0),
                ("face_to_wall", sk["luma_p10_p50_p90"][1] / mm["wall"]["luma_p10_p50_p90"][1], 0.5, 0.8),
            ]
            fails = 0
            for name, v, lo, hi in checks:
                ok = lo <= v <= hi
                fails += 0 if ok else 1
                print(f"  {'PASS' if ok else 'FAIL'}  {name:<24}{v:8.3f}   (want {lo} .. {hi})")
            okt = tags.replace(" ", "") in ("yuv420p,tv,bt709", "yuv420p,bt709,tv")
            fails += 0 if okt else 1
            print(f"  {'PASS' if okt else 'FAIL'}  tags                    {tags}")
            json.dump(dict(checks=[dict(check=c[0], value=round(float(c[1]), 4), lo=c[2], hi=c[3]) for c in checks], graded=mm), open(os.path.join(work, "check.json"), "w"), indent=1)
            print("ALL PASS" if not fails else f"{fails} FAILED")
            sys.exit(1 if fails else 0)
    elif o.cmd == "cube":
        write_cube(o.args[0], json.load(open(o.params)))
    else:
        sys.exit("unknown command")


if __name__ == "__main__":
    main()
