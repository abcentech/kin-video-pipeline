# N3 — the devotional grade. N2's approved colour (scripts/grade-n2, imported, never edited) with what the producer
# asked for on 2026-11-25 after the Day 1 finals:
#   "the skin tone … looks dark … make that a little brighter"
#   "when the presenter moves, it moves out of the pixels that has the color grade"
#   "ensure that the color grade does not affect the letters, only the background and skin tone"
#   "if the face is brighter … [the] grade matches the brightness as well as the skin tone, so it doesn't look distorted
#    or overly saturated"
#
# Why N2 felt static: its two masks are SHAPES (an ellipse for the head, a trapezoid for the torso, an ellipse of
# soft-light on the face) placed from a face position sampled every 0.5 s. A raised hand, an arm, a quick lean leave
# the shapes: the hand gets the wall's LUT, the face slides out of its pool of light.
#
# N3 grades two things and nothing else:
#   THE WALL   exactly N2's wall (balanced from its own paint, the ochre patches calmed), wherever he is not;
#   HIS SKIN   N2's skin colour plus a fill light, on every skin-coloured pixel of him, in every frame.
# His clothes, his cap and the lettering on them are left as the camera recorded them.
#
# "Him" is a PERSON MATTE for every frame (Robust Video Matting). Everything else is a per-pixel function of RGB, so it
# bakes into three 3D LUTs blended by the matte m and a slightly shrunken copy of it, m_in:
#   wall.cube   normalise + wall-patch calm + N2                                   where m = 0
#   edge.cube   skin -> the skin grade; anything else -> the wall's grade           in the rim  m - m_in  (about 3 px)
#   him.cube    skin -> the skin grade; anything else -> UNCHANGED (as recorded)    where m_in = 1
# The rim is what makes a halo impossible: a wall pixel that the matte's soft edge lets through is graded as wall, and a
# skin pixel is graded as skin right up to the last pixel of an ear or a finger.
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "..", "grade-n2")))
import n2core as C  # noqa: E402

N3 = dict(
    # THE FILL LIGHT ON SKIN is fitted per recording: the gain k is solved so that the median of this clip's own face
    # pixels lands on `skin_y` (display luma). Day 1 (dark cap, his face in the shade of its brim, darker than his own
    # hands) sits at 0.24 after N2's colour; Day 2 (white cap) at 0.34. One target = every day's face at one brightness.
    skin_y=0.40,
    k_range=(0.0, 3.2),
    fill_amt=0.34,      # x k: the fill, on skin between `skin_lo` and `hi` …
    skin_lo=(0.02, 0.10),
    hi=(0.62, 0.90),
    # … easing to `fill_floor` of itself on skin that is already lit (a raised arm in the window light), so the face
    # comes up toward the hands instead of everything going up together
    fill=(0.34, 0.62),
    fill_floor=0.5,
    # … and a little more on the DEEPEST skin (eye sockets and forehead under the brim). It ends before true black:
    # beard, brows and pupils keep their depth.
    deep_amt=0.22,
    deep_lo=(0.03, 0.10),
    deep_hi=(0.20, 0.34),
    # BRIGHTNESS AND COLOUR MOVE TOGETHER. The lift multiplies R, G and B alike, which keeps saturation exactly; chroma
    # is then eased by gain ** -sat_ease so a much brighter face does not also read as more colourful. Nothing is added.
    sat_ease=0.22,
    skin_sat=1.16,      # N2's
    skin_kh=0.46,       # N2 compresses skin above 40 % luma to 0.58, which kept the lit side of the face dull.
    skin_hi=0.72,       # N3: knee at 46 %, slope 0.72 (still a roll-off: no shine)
    # The skin line to land on (N2's estimator scale). N2's own value (128.9) was fitted THROUGH its warm face window;
    # without the window it leaves his skin a few degrees toward yellow (khaki once brighter). 123.5 = natural brown,
    # inside N2's own band (120-128).
    skin_aim=123.5,
    # what counts as skin: N2's qualifier (hue around the skin line, some chroma, not a highlight) capped tighter on
    # chroma. His skin measures 0.013-0.059 (p1-p99, Days 1-2); a crimson tee starts around 0.08 and stays as recorded.
    skin_cmax=(0.062, 0.090),
)


def skin_weight(x, p=N3):
    """x = normalised raw RGB. 1 on his skin, 0 on everything that is not skin-coloured."""
    _, cb, cr = C.ycc(x)
    return C.skin_weight(x, C.N2) * (1 - C.smoothstep(p["skin_cmax"][0], p["skin_cmax"][1], np.hypot(cb, cr)))


def fill_weight(y, p=N3):
    w = C.smoothstep(p["skin_lo"][0], p["skin_lo"][1], y) * (1 - C.smoothstep(p["hi"][0], p["hi"][1], y))
    return w * (1 - (1 - p["fill_floor"]) * C.smoothstep(p["fill"][0], p["fill"][1], y))


def deep_weight(y, p=N3):
    return C.smoothstep(p["deep_lo"][0], p["deep_lo"][1], y) * (1 - C.smoothstep(p["deep_hi"][0], p["deep_hi"][1], y))


def n2_params(norm, p=N3):
    return dict(C.N2, skin_target=norm.get("skin_target3", norm.get("skin_target", C.N2["skin_target"])), skin_kh=p["skin_kh"], skin_hi=p["skin_hi"], skin_sat=p["skin_sat"])


def skin_grade(a, norm, p=N3):
    """the grade of a skin pixel: N2's colour, then the fill light."""
    g = C.n2(C.normalise(a, norm), n2_params(norm, p))
    y = C.luma(g)
    k = norm.get("lift_k", 1.0)
    gain = 1 + k * (p["fill_amt"] * fill_weight(y, p) + p["deep_amt"] * deep_weight(y, p))
    Y, cb, cr = C.ycc(g * gain[..., None])
    e = np.power(gain, -p["sat_ease"])
    cb, cr = cb * e, cr * e
    # per-day warmth, 0..8 (producer, Day 2: "a little orange ... not more than +8"): each unit turns his skin a quarter
    # of a degree from red toward orange and adds 1 % chroma. Set AFTER the fits (fit() adds it last), so the hue fit
    # does not cancel it. Read from norm, not p, so the measure's numpy twin sees it too.
    w = float(norm.get("warm", 0.0) or 0.0)
    if w:
        th = math.radians(0.25 * w)
        sc = 1.0 + 0.01 * w
        cb, cr = (cb * math.cos(th) - cr * math.sin(th)) * sc, (cb * math.sin(th) + cr * math.cos(th)) * sc
    return np.clip(C.from_ycc(Y, cb, cr), 0.0, 0.985)


def wall(a, norm):
    """everything that is not him: exactly N2's wall (normalise + ochre-patch calm + N2)."""
    return C.n2(C.patch_calm(C.normalise(a, norm)), dict(C.N2, skin_target=norm.get("skin_target", C.N2["skin_target"])))


def him(a, norm, p=N3):
    """inside him: skin gets the skin grade, everything else (clothes, cap, lettering, eyes, teeth) is left as recorded."""
    s = skin_weight(C.normalise(a, norm), p)[..., None]
    return a + (skin_grade(a, norm, p) - a) * s


def edge(a, norm, p=N3):
    """the rim of the matte: skin gets the skin grade, everything else the wall's grade."""
    s = skin_weight(C.normalise(a, norm), p)[..., None]
    w = wall(a, norm)
    return w + (skin_grade(a, norm, p) - w) * s


def fit_skin_target(skin_px, norm, aim, p=N3):
    """the skin pull's target for this clip so that its skin lands on `aim` (the gain does not move hue, so this is
    independent of the lift)."""
    if skin_px is None or len(skin_px) < 500:
        return norm.get("skin_target", C.N2["skin_target"]), None
    best = None
    for tgt in np.arange(95.0, 151.0, 0.5):
        g = skin_grade(skin_px, dict(norm, skin_target3=float(tgt), lift_k=0.0), p)
        _, cb, cr = C.ycc(g)
        h = math.degrees(math.atan2(float(cr.mean()), float(cb.mean())))
        if best is None or abs(h - aim) < abs(best[1] - aim):
            best = (float(tgt), h)
    return best


def fit_lift(skin_px, norm, p=N3):
    """k for this clip: the median of its own face pixels, through the skin grade, lands on p["skin_y"]."""
    if skin_px is None or len(skin_px) < 500:
        return 1.0, None
    lo, hi = p["k_range"]
    med = lambda k: float(np.median(C.luma(skin_grade(skin_px, dict(norm, lift_k=k), p))))
    if med(hi) <= p["skin_y"]:
        return hi, med(hi)
    if med(lo) >= p["skin_y"]:
        return lo, med(lo)
    for _ in range(26):
        mid = (lo + hi) / 2
        if med(mid) < p["skin_y"]:
            lo = mid
        else:
            hi = mid
    k = round((lo + hi) / 2, 3)
    return k, med(k)


def fit(skin_px, norm, aim, p=N3):
    """everything N3 measures per clip, added to a copy of N2's norm: the skin hue target, then the lift."""
    n = dict(norm)
    n["skin_target3"], n["skin_hue_est3"] = fit_skin_target(skin_px, n, p.get("skin_aim") or aim, p)
    ok = skin_px is not None and len(skin_px) >= 500
    n["skin_y_raw"] = float(np.median(C.luma(skin_px))) if ok else None
    # The fill never lifts a face by more than `max_lift` times its recorded median. Day 1 (the darkest recording: a
    # dark cap, his face in the shade of its brim) needed x1.69 to reach 0.44 and the producer read that as a spotlight
    # on his face ("should blend seamlessly"); Day 3 at x1.44 "seems okay". Brighter recordings are not touched by this.
    target = p["skin_y"]
    if ok and p.get("max_lift"):
        target = min(target, float(p["max_lift"]) * n["skin_y_raw"])
    n["skin_y_aim"] = float(target)
    n["lift_k"], n["skin_y_est"] = fit_lift(skin_px, n, dict(p, skin_y=target))
    n["skin_y_n2"] = float(np.median(C.luma(C.n2(C.normalise(skin_px, norm), dict(C.N2, skin_target=norm.get("skin_target", C.N2["skin_target"])))))) if ok else None
    n["warm"] = float(p.get("warm") or 0.0)
    return n


def write_cubes(work, norm, p=N3, n=65):
    C.write_cube(os.path.join(work, "wall.cube"), lambda x: wall(x, norm), n, "n3 wall")
    C.write_cube(os.path.join(work, "edge.cube"), lambda x: edge(x, norm, p), n, "n3 edge")
    C.write_cube(os.path.join(work, "him.cube"), lambda x: him(x, norm, p), n, "n3 him")


# ------------------------------------------------------------------------------------------ the matte
MATTE_W, MATTE_H = 960, 540  # stored size; RVM takes the frame at this size and works inside at RVM_RATIO of it
RVM_RATIO = 0.375            # measured on this laptop: 141 ms/frame (0.5: 217 ms, no visible gain in the edge)
MATTE_BLUR = 0.7             # matte pixels (x2 = 1080p pixels): the model's edge, softened by under a pixel
RIM = 3                      # 1080p pixels: m_in is the matte eroded by this much (the graph does it: erosion x RIM)


def finish_matte(pha):
    """RVM alpha (float HxW 0..1) -> uint8 grade mask m (faint haze removed, edge softened)."""
    import cv2

    m = np.clip((pha - 0.08) / 0.84, 0, 1)
    if MATTE_BLUR:
        m = cv2.GaussianBlur(m, (0, 0), MATTE_BLUR)
    return (np.clip(m, 0, 1) * 255 + 0.5).astype(np.uint8)


def inner(m_full):
    """m (float HxW at 1080p, 0..1) -> m_in, as the ffmpeg graph makes it: RIM erosions (3x3 min) then a 1.2 px blur."""
    import cv2

    e = cv2.erode(m_full, np.ones((3, 3), np.uint8), iterations=RIM)
    return cv2.GaussianBlur(e, (0, 0), 1.2)


def apply_numpy(a, norm, matte, capm=None, p=N3):
    """the same result as the ffmpeg graph: `matte` is 0..1 at the frame's size (1 = him); `capm` (0..1, same size) is
    the above-the-brim mask (n3.py cap): there, inside the shrunken matte, the recorded picture is put back."""
    sh = a.shape
    flat = a.reshape(-1, 3)
    gw = wall(flat, norm).reshape(sh)
    ge = edge(flat, norm, p).reshape(sh)
    gh = him(flat, norm, p).reshape(sh)
    mi = inner(matte)
    out = gw + (ge - gw) * matte[..., None]
    out = out + (gh - out) * mi[..., None]
    if capm is not None:
        out = out + (a - out) * (capm * mi)[..., None]
    return np.clip(out, 0, 1)


class Matter:
    """Robust Video Matting, frame by frame (it is recurrent: feed the frames of a clip in order)."""

    def __init__(self, model=None, threads=3):
        import onnxruntime as ort

        model = model or os.path.normpath(os.path.join(HERE, "..", "..", "..", "tools", "matte", "models", "rvm_mobilenetv3_fp32.onnx"))
        so = ort.SessionOptions()
        so.intra_op_num_threads = threads
        self.s = ort.InferenceSession(model, so, providers=["CPUExecutionProvider"])
        self.rec = [np.zeros((1, 1, 1, 1), np.float32)] * 4
        self.dr = np.array([RVM_RATIO], np.float32)

    def __call__(self, rgb_small):
        """rgb_small: uint8 or float HxWx3 at MATTE size, display RGB. Returns the raw alpha (float HxW)."""
        x = rgb_small.astype(np.float32)
        if rgb_small.dtype == np.uint8:
            x = x / 255.0
        src = np.ascontiguousarray(x.transpose(2, 0, 1)[None])
        out = self.s.run(None, {"src": src, "r1i": self.rec[0], "r2i": self.rec[1], "r3i": self.rec[2], "r4i": self.rec[3], "downsample_ratio": self.dr})
        self.rec = out[2:6]
        return out[1][0, 0]


# ------------------------------------------------------------------------------------------ ffmpeg graph
def graph(cube_dir, pre="", label="out"):
    """input 0 = the raw video, input 1 = the matte video, input 2 = the above-the-brim video (both gray, one frame
    per output frame). The colour-matrix rules are N2's: tag and convert explicitly on the way in and on the way out.
    The temporal denoise runs before the LUTs on the whole picture (as in N2), so 'as recorded' means recorded and
    denoised."""
    c = cube_dir.replace("\\", "/").replace(":", "\\:").replace("'", "'\\''")
    ero = ",".join(["erosion"] * RIM)
    return ";".join([
        f"[0:v]{pre}setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv,hqdn3d=1.2:1.0:3:2.5,"
        f"scale=in_color_matrix=bt709:in_range=tv:out_range=pc:flags=accurate_rnd+full_chroma_int,format=gbrp,split=4[s0][s1][s2][s3]",
        f"[s0]lut3d=file='{c}/wall.cube':interp=tetrahedral[gw]",
        f"[s1]lut3d=file='{c}/edge.cube':interp=tetrahedral[ge]",
        f"[s2]lut3d=file='{c}/him.cube':interp=tetrahedral[gh]",
        "[1:v]format=gray,scale=1920:1080:flags=bilinear:in_range=pc:out_range=pc,split[m0][m1]",
        "[m0]format=gbrp[m]",
        f"[m1]{ero},gblur=sigma=1.2,split[mi0][mi1]",
        "[mi0]format=gbrp[mi]",
        "[2:v]format=gray,scale=1920:1080:flags=bilinear:in_range=pc:out_range=pc[c0]",
        "[c0][mi1]blend=all_mode=multiply,format=gbrp[mc]",
        "[gw][ge][m]maskedmerge[g1]",
        "[g1][gh][mi]maskedmerge[g2]",
        "[g2][s3][mc]maskedmerge,"
        "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p,"
        f"setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv[{label}]",
    ])
