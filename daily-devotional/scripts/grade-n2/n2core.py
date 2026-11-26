# N2 grade — the core colour maths (self-contained; no imports from the film code).
# N2 is the grade approved for THE FATHER SHOWED UP (Dec 2026): natural deep-brown skin on the skin line with moderate
# chroma, tamed speculars, the yellow/ochre wall patches calmed to ~1/3 chroma outside a subject matte, neutral blacks, no
# global tint. Here it is generalised for any clip from the same room: each clip is first NORMALISED to the reference
# recording (white balance from the clip's own wall, black point from its own darkest tones — measured per clip), then
# the exact approved N2 transform is applied. Everything is a per-pixel function of RGB, so it is baked into 3D LUTs:
#   base.cube   — normalise + N2 (used on him: inside the subject matte)
#   patch.cube  — normalise + wall-patch calm + N2 (used outside the subject matte)
#   window.cube — base + the soft-light face window at full strength (blended in by the face-window mask)
import math
import os

import numpy as np

# ------------------------------------------------------------------------------------------ colour basics (BT.709)
KR, KB = 0.2126, 0.0722


def luma(a):
    return a[..., 0] * KR + a[..., 1] * (1 - KR - KB) + a[..., 2] * KB


def ycc(a):
    y = luma(a)
    return y, (a[..., 2] - y) / 1.8556, (a[..., 0] - y) / 1.5748


def from_ycc(y, cb, cr):
    r = y + 1.5748 * cr
    b = y + 1.8556 * cb
    g = (y - KR * r - KB * b) / (1 - KR - KB)
    return np.stack([r, g, b], -1)


def hue_deg(cb, cr):
    """vectorscope angle measured from +Cb toward +Cr (the skin line sits at ~123 deg on this scale)."""
    return np.degrees(np.arctan2(cr, cb)) % 360


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def filmic(x, toe=0.05, shoulder=0.82, top=0.985):
    x = np.clip(x, 0, 1)
    y = np.where(x < toe, (x * x) / (2 * toe), x - toe / 2)
    y = y / (1 - toe / 2)
    k = 1.0 / (top - shoulder)
    return np.where(y > shoulder, shoulder + (top - shoulder) * (1 - np.exp(-(y - shoulder) * k)), y)


def soft_light(cb, cs, alpha):
    """W3C soft-light of colour `cs` over backdrop `cb` at opacity `alpha` (what the browser did in the film)."""
    d = np.where(cb <= 0.25, ((16 * cb - 12) * cb + 4) * cb, np.sqrt(np.clip(cb, 0, 1)))
    B = np.where(cs <= 0.5, cb - (1 - 2 * cs) * cb * (1 - cb), cb + (2 * cs - 1) * (d - cb))
    return cb * (1 - alpha) + B * alpha


# ------------------------------------------------------------------------------------------ the approved N2 transform
# Exactly the film's N2 (scripts/fatherhood-grade.py PARAMS["N2"]) except `skin_cmax`: the film's presenter wore a white
# tee, so skin was qualified by hue alone; a crimson shirt sits on the same hue (~94 deg) at 5-10x skin's chroma, so skin
# is now also capped by chroma — a red shirt keeps its own colour and is never pulled toward orange.
N2 = dict(
    wb=(1.0, 0.993, 1.016), bp=0.092, gamma=0.84, toe=0.07, shoulder=0.77, top=0.92, sat=0.92, skin_sat=1.16,
    skin_target=137.0, skin_pull=1.3, skin_sig=26.0, skin_cmax=(0.075, 0.12), warm=0.016, cool=0.012, wall_down=0.08,
    hi0=0.5, hi_desat=0.88, hd0=0.6, hi_cr=0.0, stone=0.0, skin_hi=0.58, skin_kh=0.4, skin_lo=0.02,
)
# the film's face window for N2 (src/Fatherhood/film/grade.ts KEY2.N2): soft-light, warm-neutral, small (x0.72)
WINDOW = dict(win=0.46, rgb=(255, 231, 206), wr=0.72)
# the wall-patch calm (film: patch_fix): yellow/ochre by hue + chroma + brightness, chroma kept at `keep`
PATCH = dict(h0=(118, 135), h1=(190, 205), c=(0.025, 0.055), y=(0.3, 0.4), keep=0.3)


def skin_weight(a, p):
    _, cb0, cr0 = ycc(a)
    h0 = np.degrees(np.arctan2(cr0, cb0))
    ch = np.hypot(cb0, cr0)
    w = np.exp(-(((h0 - 94) / p["skin_sig"]) ** 2)) * smoothstep(0.002, 0.01, ch) * (1 - smoothstep(0.55, 0.8, luma(a)))
    lo, hi = p.get("skin_cmax", (9, 10))
    return w * (1 - smoothstep(lo, hi, ch))


def n2(a, p=N2):
    """the approved N2 transform on display-referred BT.709 RGB in 0..1 (after the per-clip normalisation)."""
    skin = skin_weight(a, p)
    a = np.clip(a * np.array(p["wb"], dtype=np.float32), 0, 1)
    a = np.clip((a - p["bp"]) / (1 - p["bp"]), 0, 1)
    y = luma(a)
    y2 = filmic(np.power(np.clip(y, 1e-5, 1), p["gamma"]), p["toe"], p["shoulder"], top=p["top"])
    y2 = y2 - p["wall_down"] * np.exp(-(((y2 - 0.6) / 0.22) ** 2))
    a = a * np.where(y > 1e-4, y2 / np.maximum(y, 1e-4), 1)[..., None]
    Yc = luma(a)
    kh = p["skin_kh"]
    y3 = np.where(Yc > kh, kh + (Yc - kh) * p["skin_hi"], Yc)
    y3 = y3 + p["skin_lo"] * (1 - smoothstep(0.02, 0.24, Yc)) * smoothstep(0.0, 0.04, Yc)
    y3 = Yc + skin * (y3 - Yc)
    a = a * np.where(Yc > 1e-4, y3 / np.maximum(Yc, 1e-4), 1)[..., None]
    Y, cb, cr = ycc(a)
    hue = np.degrees(np.arctan2(cr, cb))
    d = (p["skin_target"] - hue + 180) % 360 - 180
    th = np.radians(np.clip(d, -40, 40)) * p["skin_pull"] * skin
    cb, cr = cb * np.cos(th) - cr * np.sin(th), cb * np.sin(th) + cr * np.cos(th)
    s = p["sat"] + (p["skin_sat"] - p["sat"]) * skin
    s = s * (1 - p["hi_desat"] * smoothstep(p["hd0"], 0.88, Y) * (1 - skin))
    cb, cr = cb * s, cr * s
    keep = 1 - skin
    sh = (1 - smoothstep(0.0, 0.22, Y)) * keep
    hi = smoothstep(p["hi0"], 0.95, Y) * keep
    mid = smoothstep(0.18, 0.32, Y) * (1 - smoothstep(0.62, 0.8, Y)) * keep
    cb = cb + p["cool"] * sh * 0.6 - p["warm"] * hi * 0.55 - p["stone"] * mid
    cr = cr - p["cool"] * sh * 0.2 + p["warm"] * hi * p["hi_cr"] + p["stone"] * 0.55 * mid
    return np.clip(from_ycc(Y, cb, cr), 0.0, 0.985)


def patch_calm(a, q=PATCH):
    """the yellow/ochre wall patches to `keep` of their chroma, luma untouched (per pixel; the subject matte is applied
    outside the LUT, by maskedmerge)."""
    y, cb, cr = ycc(a)
    h = hue_deg(cb, cr)
    ch = np.hypot(cb, cr)
    m = smoothstep(*q["h0"], h) * (1 - smoothstep(*q["h1"], h)) * smoothstep(*q["c"], ch) * smoothstep(*q["y"], y)
    k = 1 - (1 - q["keep"]) * m
    return np.clip(from_ycc(y, cb * k, cr * k), 0, 1)


# ------------------------------------------------------------------------------------------ per-clip normalisation
def normalise(a, norm):
    """map this clip onto the reference recording: black LEVEL (from the clip's own darkest tones; one value for all
    channels), then
    white-balance gains from its own wall (chromaticity only: the wall keeps its recorded brightness)."""
    blk = np.array(norm["black"], dtype=np.float32)
    ref_blk = np.array(norm["ref_black"], dtype=np.float32)
    g = np.array(norm["gain"], dtype=np.float32)
    # black: move the clip's black to the reference's black, keeping white fixed
    a = ref_blk + (a - blk) * (1 - ref_blk) / np.maximum(1e-4, 1 - blk)
    return np.clip(a * g, 0, 1)


def identity_norm():
    return dict(black=[0, 0, 0], ref_black=[0, 0, 0], gain=[1, 1, 1])


def fit_skin_target(skin_px, norm, aim=124.0):
    """per clip: the skin pull's target such that this clip's skin (pixels sampled on the face, through normalise + N2
    + the face window at its typical strength) lands on `aim` deg — the skin line the film was approved at."""
    if skin_px is None or len(skin_px) < 500:
        return N2["skin_target"], None
    w = np.array(WINDOW["rgb"], dtype=np.float32) / 255
    best = None
    for tgt in np.arange(95.0, 151.0, 1.0):
        g = soft_light(n2(normalise(skin_px, norm), dict(N2, skin_target=float(tgt))), w, WINDOW["win"] * 0.7)
        _, cb, cr = ycc(g)
        h = math.degrees(math.atan2(float(cr.mean()), float(cb.mean())))
        if best is None or abs(h - aim) < abs(best[1] - aim):
            best = (float(tgt), h)
    return best


# ------------------------------------------------------------------------------------------ LUTs
def grid(n):
    g = np.linspace(0, 1, n, dtype=np.float32)
    b, gg, r = np.meshgrid(g, g, g, indexing="ij")  # .cube order: red fastest
    return np.stack([r, gg, b], -1).reshape(-1, 3)


def lut_fns(norm):
    w = np.array(WINDOW["rgb"], dtype=np.float32) / 255
    p = dict(N2, skin_target=norm.get("skin_target", N2["skin_target"]))
    base = lambda x: n2(normalise(x, norm), p)
    patch = lambda x: n2(patch_calm(normalise(x, norm)), p)
    window = lambda x: np.clip(soft_light(n2(normalise(x, norm), p), w, 1.0), 0, 1)
    return dict(base=base, patch=patch, window=window)


def write_cube(fn, f, n=65, title="n2"):
    out = f(grid(n))
    with open(fn, "w", newline="\n") as fh:
        fh.write(f'TITLE "{title}"\nLUT_3D_SIZE {n}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n')
        fh.write("\n".join(f"{v[0]:.6f} {v[1]:.6f} {v[2]:.6f}" for v in out))
        fh.write("\n")


# ------------------------------------------------------------------------------------------ masks (240 x 135 each)
MW, MH = 240, 135


def face_from_track(track, t):
    """their face.json track rows are [t, x, y, h] every 0.5 s (centre of the head, head height), normalised."""
    if not track:
        return 0.48, 0.34, 0.32
    ts = [r[0] for r in track]
    i = int(np.clip(np.searchsorted(ts, t) - 1, 0, len(track) - 1))
    j = min(len(track) - 1, i + 1)
    a = 0.0 if track[j][0] == track[i][0] else float(np.clip((t - track[i][0]) / (track[j][0] - track[i][0]), 0, 1))
    return tuple(track[i][k] * (1 - a) + track[j][k] * a for k in (1, 2, 3))


def masks_at(track, t, W=1920, H=1080):
    """two 240x135 masks stacked (240x270, uint8): top = SUBJECT matte (255 = him: head + cap + torso; the wall-patch
    calm stays off him), bottom = FACE WINDOW (alpha of the soft-light window, already scaled by its strength)."""
    x, y, h = face_from_track(track, t)
    yy, xx = np.mgrid[0:MH, 0:MW].astype(np.float32)
    xn, yn = (xx + 0.5) / MW, (yy + 0.5) / MH
    top, chin = y - h / 2, y + h / 2
    # their head h = face box h * 1.55; the face box is ~0.56 as wide as tall -> face width fwn ~ 0.363 h (of the frame
    # width). The film's numbers were for a face 0.145 wide, so every size scales by s.
    fwn = 0.363 * h * (H / W) * (16 / 9)
    s = fwn / 0.145
    # subject: head ellipse (a little wider than the head for the cap) + torso widening below the chin
    hx = 0.088 * s
    head = ((xn - x) / hx) ** 2 + ((yn - (top - 0.04 + chin) / 2) / ((chin - top) / 2 + 0.06)) ** 2 < 1
    half = np.clip(0.055 + np.maximum(0, yn - chin - 0.05) * 1.5, 0.055, 0.27) * s
    torso = (yn > chin - 0.03) & (np.abs(xn - x) < half)
    from PIL import Image, ImageFilter

    sm = Image.fromarray(((head | torso) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(2))
    # face window: the film's ellipse (rx 0.95*fw, ry 1.15*fw, fw = face width ~ 0.145 W at head h 0.30) x wr, centred on
    # the face; radial alpha 1 -> 0.84 -> 0.5 -> 0.16 -> 0 at 0/25/50/75/100 %
    fw = fwn * W
    rx, ry = 0.95 * fw * WINDOW["wr"], 1.15 * fw * WINDOW["wr"]
    fy = y + 0.17 * h  # the film's window sat on the face-box centre, ~0.17 h below their head centre
    d = np.sqrt(((xn * W - x * W) / rx) ** 2 + ((yn * H - fy * H) / ry) ** 2)
    win = np.interp(d, [0, 0.25, 0.5, 0.75, 1.0], [1, 0.84, 0.5, 0.16, 0], right=0) * WINDOW["win"]
    return np.concatenate([np.asarray(sm), (np.clip(win, 0, 1) * 255 + 0.5).astype(np.uint8)], 0)


# ------------------------------------------------------------------------------------------ ffmpeg graph
def graph(cube_dir, pre="", label="out", grain=0):
    """filter_complex for: input 0 = the raw video, input 1 = the stacked masks (gray 240x270, see masks_at).
    Colour-matrix rules: the decode is told BT.709 limited (in_color_matrix/in_range) before any RGB work, LUTs run in
    full-range gbrp, the encode is told BT.709 limited (out_color_matrix/out_range) and setparams tags the frames."""
    # inside the single-quoted filter option a drive colon needs exactly ONE backslash ('C\:/dir with spaces/x.cube')
    c = os.path.abspath(cube_dir).replace("\\", "/").replace(":", "\\:").replace("'", "'\\''")
    g = [
        f"[0:v]{pre}setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv,hqdn3d=1.2:1.0:3:2.5,"
        f"scale=in_color_matrix=bt709:in_range=tv:out_range=pc:flags=accurate_rnd+full_chroma_int,format=gbrp,split=3[s0][s1][s2]",
        f"[s0]lut3d=file='{c}/base.cube':interp=tetrahedral[gb]",
        f"[s1]lut3d=file='{c}/patch.cube':interp=tetrahedral[gp]",
        f"[s2]lut3d=file='{c}/window.cube':interp=tetrahedral[gw]",
        "[1:v]format=gray,split[mA][mB]",
        "[mA]crop=240:135:0:0,scale=1920:1080:flags=bicubic,format=gbrp[ms]",
        "[mB]crop=240:135:0:135,scale=1920:1080:flags=bicubic,format=gbrp[mw]",
        "[gp][gb][ms]maskedmerge[g1]",
        "[g1][gw][mw]maskedmerge,"
        "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p,"
        f"setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv{f',noise=c0s={grain}:c0f=t' if grain else ''}[{label}]",
    ]
    return ";".join(g)


def apply_numpy(a, norm, sm=None, win=None):
    """the same result as the ffmpeg graph, in numpy (for the expected-value check and the review sheets).
    sm / win: full-size masks in 0..1 (subject, window alpha)."""
    f = lut_fns(norm)
    sh = a.shape
    flat = a.reshape(-1, 3)
    gb = f["base"](flat).reshape(sh)
    gp = f["patch"](flat).reshape(sh)
    out = gp if sm is None else gp + (gb - gp) * sm[..., None]
    if win is not None:
        gw = f["window"](flat).reshape(sh)
        out = out + (gw - out) * win[..., None]
    return np.clip(out, 0, 1)
