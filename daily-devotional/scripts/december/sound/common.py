"""Shared plumbing for the December sound stage: paths, timing constants, decoding,
loudness measurement (K-weighted, block-wise, low memory) and the master bus.

Everything is float32 stereo at 48 kHz. Nothing here uses unseeded randomness.
"""
import json
import re
import subprocess
import sys
import zlib
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.ndimage import maximum_filter1d, minimum_filter1d, uniform_filter1d

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "viral"))  # the house studio (import only, never edited)

from studio.dsp import SR  # noqa: E402

PUB = ROOT / "december-public"
DEV = ROOT / "out" / "december" / "dev" / "sound"
FPS = 30
HOP = SR // 100  # 10 ms analysis blocks

# ------------------------------------------------------------------ timing constants
_T_DEFAULT = dict(DOOR_IN=16, DOOR_OUT=10, TITLE_DUR=165, TITLE_DOOR=10, TITLE_HIT=26, TITLE_DUR_TRAILER=84,
                  TITLE_DOOR_TRAILER=4, TITLE_HIT_TRAILER=16, SLATE=60, IDENT_DUR=135, CHAPTER_DUR=84, CHAPTER_HIT=12,
                  SUB_DUR=135, SUB_PRESS=40, SUB_BELL=52, TEASER_DUR=120, KEYWORD_DUR=54, RECAP_DUR=200, NEXT_DUR=270,
                  NEXT_HIT=26, END_DUR_TRAILER=102, END_HIT_TRAILER=10, END_DUR_SHORT=75, OUTRO_DUR=219, LEAD=2)


def _load_T():
    """src/December/timing.ts is the lead's source of truth; read it, fall back to the documented table"""
    T = dict(_T_DEFAULT)
    p = ROOT / "src" / "December" / "timing.ts"
    if p.exists():
        for k, v in re.findall(r"^\s*([A-Z_]+):\s*(\d+)\s*,", p.read_text(encoding="utf-8"), re.M):
            T[k] = int(v)
    return T


T = _load_T()


def seed_of(*parts):
    """stable seed (crc32; Python's hash() is salted per process)"""
    return zlib.crc32("|".join(str(p) for p in parts).encode()) & 0x7FFFFFFF


def f2s(frame):
    return frame / FPS


def f2n(frame):
    return int(round(frame / FPS * SR))


def s2n(sec):
    return int(round(sec * SR))


# ------------------------------------------------------------------ files
def pub_path(rel):
    """a plan path (public-relative, e.g. 'day01/body.mp4') -> absolute Path"""
    rel = str(rel).replace("\\", "/")
    if re.match(r"^[A-Za-z]:/", rel) or rel.startswith("/"):
        return Path(rel)
    rel = re.sub(r"^(\./)?(december-public/)?", "", rel)
    return PUB / rel


def has_audio(path):
    if not Path(path).exists():
        return False
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True)
    return r.returncode == 0 and r.stdout.strip() != ""


def media_seconds(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


_DECODED = {}


def decode(path, cache=True):
    """whole audio track of a media file as float32 (n, 2) at 48 kHz (cached per run)"""
    key = str(path)
    if cache and key in _DECODED:
        return _DECODED[key]
    cmd = ["ffmpeg", "-v", "error", "-nostdin", "-i", str(path), "-vn", "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"]
    out = subprocess.run(cmd, capture_output=True, check=True).stdout
    x = np.frombuffer(out, np.float32).reshape(-1, 2).copy()
    if cache:
        _DECODED[key] = x
    return x


def clip_of(x, start_s, dur_s, fade_in=0.008, fade_out=0.008):
    """a slice of decoded audio (zero-padded if the source is short), with short edge fades"""
    a = s2n(start_s)
    n = s2n(dur_s)
    y = np.zeros((n, 2), np.float32)
    lo = max(0, a)
    hi = min(len(x), a + n)
    if hi > lo:
        y[lo - a : hi - a] = x[lo:hi]
    fi = min(s2n(fade_in), n // 2)
    fo = min(s2n(fade_out), n // 2)
    if fi > 0:
        y[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)[:, None]
    if fo > 0:
        y[-fo:] *= np.linspace(1, 0, fo, dtype=np.float32)[:, None]
    return y


def place(dst, x, at, gain=1.0):
    a = max(0, at)
    s = a - at
    n = min(len(x) - s, len(dst) - a)
    if n > 0:
        dst[a : a + n] += x[s : s + n] * np.float32(gain)


def write_wav(path, x, subtype="PCM_24"):
    import soundfile as sf

    Path(path).parent.mkdir(parents=True, exist_ok=True)
    if subtype == "PCM_24" and np.max(np.abs(x)) >= 0.999:
        subtype = "FLOAT"
    sf.write(str(path), x, SR, subtype=subtype)


# ------------------------------------------------------------------ loudness (BS.1770 K-weighting)
KB1 = np.array([1.53512485958697, -2.69169618940638, 1.19839281085285])
KA1 = np.array([1.0, -1.69065929318241, 0.73248077421585])
KB2 = np.array([1.0, -2.0, 1.0])
KA2 = np.array([1.0, -1.99004745483398, 0.99007225036621])


def kpower(x, hop=HOP):
    """K-weighted mean-square power per hop block, summed over channels (float64, len = n // hop)"""
    if x.ndim == 1:
        x = x[:, None]
    nb = len(x) // hop
    p = np.zeros(nb, np.float64)
    for c in range(x.shape[1]):
        y = signal.lfilter(KB1, KA1, x[:, c].astype(np.float64))
        y = signal.lfilter(KB2, KA2, y)
        p += (y[: nb * hop] ** 2).reshape(nb, hop).mean(axis=1)
    return p


def lk(p):
    return -0.691 + 10 * np.log10(np.maximum(p, 1e-20))


def momentary(p, win_blocks=40):
    """sliding-window loudness (LUFS) from block powers; 40 blocks = 400 ms, 300 = 3 s short-term (centred)"""
    return lk(uniform_filter1d(p, win_blocks, mode="constant"))


def integrated(p, mask=None):
    """BS.1770-4 gated integrated loudness from 10 ms block powers (400 ms windows, 75% overlap)"""
    if mask is not None:
        p = p[mask]
    if len(p) < 40:
        return -70.0
    w = uniform_filter1d(p, 40, mode="constant")[20 : len(p) - 20 + 1 : 10]
    if len(w) == 0:
        return -70.0
    w = w[lk(w) > -70]
    if len(w) == 0:
        return -70.0
    rel = lk(w.mean()) - 10
    w = w[lk(w) > rel]
    return float(lk(w.mean())) if len(w) else -70.0


def lufs(x, mask=None):
    return integrated(kpower(x), mask)


# ------------------------------------------------------------------ true peak (chunked, low memory)
def _os_peak_env(x, chunk=4800, floor_db=-6.0):
    """per-sample max |x| over channels and the 4x-oversampled points around each sample.
    Only blocks whose sample peak is above floor_db are oversampled (an inter-sample peak is
    never ~6 dB over its samples), so a speech mix costs a fraction of a full pass."""
    n = len(x)
    env = np.max(np.abs(x), axis=1).astype(np.float32)
    thr = 10 ** (floor_db / 20)
    m = 64
    nb = (n + chunk - 1) // chunk
    bmax = np.pad(env, (0, nb * chunk - n)).reshape(nb, chunk).max(axis=1)
    for k in np.flatnonzero(bmax > thr):
        a = k * chunk
        lo = max(0, a - m)
        hi = min(n, a + chunk + m)
        up = signal.resample_poly(x[lo:hi], 4, 1, axis=0)
        e = np.max(np.abs(up), axis=1).reshape(-1, 4).max(axis=1)
        b = min(n, a + chunk)
        env[a:b] = np.maximum(env[a:b], e[a - lo : b - lo])
    return env


def true_peak_db(x):
    return float(20 * np.log10(np.max(_os_peak_env(x)) + 1e-12))


def tp_limit(x, ceiling_db=-1.6, passes=3):
    """look-ahead true-peak limiter (gain curve min-filtered and smoothed, never above the request)"""
    ceil = 10 ** (ceiling_db / 20)
    y = x.astype(np.float32, copy=True)
    for _ in range(passes):
        env = _os_peak_env(y)
        if env.max() <= ceil:
            break
        g = np.minimum(1.0, ceil * 0.985 / np.maximum(env, 1e-9)).astype(np.float32)
        g = minimum_filter1d(g, int(0.008 * SR))
        g = uniform_filter1d(g, int(0.005 * SR))
        y *= g[:, None]
    np.clip(y, -ceil, ceil, out=y)
    return y


def glue(x, thr_db=-12.0, ratio=1.5, att=15, rel=250, knee=6):
    """a gentle bus compressor (linked, amplitude follower); no make-up, the loudness step follows"""
    from studio.dsp import follower

    env = follower(x, att, rel)
    lvl = 20 * np.log10(np.maximum(env, 1e-9))
    over = lvl - thr_db
    gr = np.where(over <= -knee / 2, 0.0, np.where(over >= knee / 2, over * (1 - 1 / ratio), (1 - 1 / ratio) * (over + knee / 2) ** 2 / (2 * knee)))
    return (x * (10 ** (-gr / 20)).astype(np.float32)[:, None]).astype(np.float32)


def edge_fades(x, ms=5):
    n = min(int(ms / 1000 * SR), len(x) // 2)
    x[:n] *= np.linspace(0, 1, n, dtype=np.float32)[:, None]
    x[-n:] *= np.linspace(1, 0, n, dtype=np.float32)[:, None]
    return x


def ffmpeg_r128(path):
    """independent measurement with ffmpeg's ebur128 (integrated, LRA, true peak)"""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    txt = r.stderr[r.stderr.rfind("Summary:") :]
    g = lambda pat: float(re.search(pat, txt).group(1)) if re.search(pat, txt) else None  # noqa: E731
    return {"I": g(r"I:\s+(-?[\d.]+) LUFS"), "LRA": g(r"LRA:\s+(-?[\d.]+) LU"), "TP": g(r"Peak:\s+(-?[\d.]+) dBFS")}


_T0 = [None]


def tlog(msg):
    """progress with elapsed seconds (stdout, flushed)"""
    import time

    if _T0[0] is None:
        _T0[0] = time.time()
    print(f"    [{time.time() - _T0[0]:6.1f}s] {msg}", flush=True)


def read_json(p):
    return json.loads(Path(p).read_text(encoding="utf-8").lstrip("\ufeff"))
