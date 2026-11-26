"""Small DSP kit shared by the studio: filters, envelopes, placement, loudness."""
import numpy as np
from scipy import signal

SR = 48000


def sos_lp(f, order=2):
    return signal.butter(order, min(f, SR / 2 - 200), btype="low", fs=SR, output="sos")


def sos_hp(f, order=2):
    return signal.butter(order, f, btype="high", fs=SR, output="sos")


def sos_bp(lo, hi, order=2):
    return signal.butter(order, [lo, min(hi, SR / 2 - 200)], btype="band", fs=SR, output="sos")


def filt(sos, x):
    return signal.sosfilt(sos, x, axis=0).astype(np.float32)


def filtfilt(sos, x):
    return signal.sosfiltfilt(sos, x, axis=0).astype(np.float32)


def peak_eq(f0, gain_db, q=1.0):
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    al = np.sin(w) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]
    a = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return signal.tf2sos(np.array(b) / a[0], np.array(a) / a[0])


def shelf(f0, gain_db, high=True):
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    al = np.sin(w) / 2 * np.sqrt(2)
    c = np.cos(w)
    s = 1 if high else -1
    b = [A * ((A + 1) + s * (A - 1) * c + 2 * np.sqrt(A) * al), -2 * s * A * ((A - 1) + s * (A + 1) * c), A * ((A + 1) + s * (A - 1) * c - 2 * np.sqrt(A) * al)]
    a = [(A + 1) - s * (A - 1) * c + 2 * np.sqrt(A) * al, 2 * s * ((A - 1) - s * (A + 1) * c), (A + 1) - s * (A - 1) * c - 2 * np.sqrt(A) * al]
    return signal.tf2sos(np.array(b) / a[0], np.array(a) / a[0])


def st(x):
    """mono → stereo (n,2); stereo passes through"""
    if x.ndim == 1:
        return np.stack([x, x], axis=1).astype(np.float32)
    return x.astype(np.float32)


def mono(x):
    return x.mean(axis=1).astype(np.float32) if x.ndim == 2 else x.astype(np.float32)


def pan(x, p):
    """constant-power pan of a mono (or stereo, balance) signal, p in [-1, 1]"""
    l = np.cos((p + 1) * np.pi / 4) * np.sqrt(2)
    r = np.sin((p + 1) * np.pi / 4) * np.sqrt(2)
    y = st(x).copy()
    y[:, 0] *= l
    y[:, 1] *= r
    return y


def place(dst, x, at, gain=1.0):
    """add x into dst starting at sample `at` (clipped at both ends)"""
    x = st(x) if dst.ndim == 2 else x
    a = max(0, at)
    s = a - at
    n = min(len(x) - s, len(dst) - a)
    if n > 0:
        dst[a : a + n] += x[s : s + n] * gain


def fade(x, fin=0, fout=0, curve=1.0):
    y = x.copy()
    if fin > 0:
        fin = min(fin, len(y))
        e = np.linspace(0, 1, fin) ** curve
        y[:fin] *= e[:, None] if y.ndim == 2 else e
    if fout > 0:
        fout = min(fout, len(y))
        e = np.linspace(1, 0, fout) ** curve
        y[-fout:] *= e[:, None] if y.ndim == 2 else e
    return y


def ramp(n, points):
    """piecewise-linear envelope from [(t_seconds, value), ...]"""
    t = np.arange(n) / SR
    ts, vs = zip(*points)
    return np.interp(t, ts, vs).astype(np.float32)


def follower(x, att_ms, rel_ms):
    a = np.exp(-1 / (att_ms / 1000 * SR))
    r = np.exp(-1 / (rel_ms / 1000 * SR))
    y = np.abs(mono(x) if x.ndim == 2 else x)
    up = signal.lfilter([1 - a], [1, -a], y)
    dn = signal.lfilter([1 - r], [1, -r], y)
    return np.maximum(up, dn).astype(np.float32)


def db(x):
    return 20 * np.log10(np.maximum(x, 1e-9))


def undb(d):
    return 10 ** (d / 20)


def rms(x):
    return float(np.sqrt(np.mean(np.square(x)) + 1e-12))


def soft_clip(x, drive=1.0):
    return (np.tanh(x * drive) / np.tanh(drive)).astype(np.float32)


def compress(x, thr_db=-18, ratio=3.0, att=10, rel=150, knee=6, makeup=True):
    """feed-forward RMS-ish compressor on a stereo bus (linked)"""
    env = follower(x, att, rel)
    lvl = db(env)
    over = lvl - thr_db
    gr = np.where(over <= -knee / 2, 0.0,
                  np.where(over >= knee / 2, over * (1 - 1 / ratio),
                           (1 - 1 / ratio) * (over + knee / 2) ** 2 / (2 * knee)))
    g = undb(-gr).astype(np.float32)
    y = x * (g[:, None] if x.ndim == 2 else g)
    if makeup:
        y *= rms(x) / max(rms(y), 1e-9)
    return y.astype(np.float32)


def ms_width(x, width):
    """stereo width: 1 = unchanged, >1 wider (side boosted), 0 = mono"""
    m = (x[:, 0] + x[:, 1]) / 2
    s = (x[:, 0] - x[:, 1]) / 2 * width
    return np.stack([m + s, m - s], axis=1).astype(np.float32)


def mono_bass(x, f=120):
    """keep everything under f Hz in the centre (tight low end, safe on phones)"""
    lo = filtfilt(sos_lp(f, 4), x)
    hi = x - lo
    m = lo.mean(axis=1, keepdims=True)
    return (hi + m).astype(np.float32)


def phone_bass(x, f=110, amount=0.35):
    """psychoacoustic bass: harmonics of the sub band, so the low end is heard on
    phone speakers that cannot play it (the 'missing fundamental')"""
    lo = filtfilt(sos_lp(f, 4), mono(x))
    pk = np.max(np.abs(lo)) + 1e-9
    h = np.tanh(lo / pk * 3.0) * pk  # odd harmonics
    h2 = np.abs(lo) - np.mean(np.abs(lo))  # even harmonics (rectifier)
    harm = filt(sos_bp(f * 1.2, f * 5.5, 2), h + 0.6 * h2)
    return (x + st(harm) * amount).astype(np.float32)
