"""The scoring hall: where the 3D comes from.

A shoebox hall (26 x 36 x 15 m) with the orchestra on its stage and a Decca tree
(L / C / R omnis 1.5 m apart, plus two outriggers) above the conductor, the way
film scores are recorded. Each seat gets its own impulse response:
  direct sound   arrives at each mic with its own delay and 1/r level → real width
  early echoes   image sources up to 3rd order off the six walls (darker per bounce)
  late tail      decorrelated L/R noise, decaying per band (lows 2.9 s … highs 1.0 s)
A far seat (timpani, gong) is quieter, later and wetter than a near one (piano):
that is the depth. A second, longer "cathedral" space is a send for the payoff.
"""
from functools import lru_cache

import zlib
import numpy as np
from scipy import signal

from .dsp import SR, filt, mono, pan, sos_bp, sos_hp, sos_lp

C = 343.0
W, D, H = 26.0, 36.0, 15.0
STAGE = (13.0, 24.0)  # front-centre of the stage (x, y)
MIC_Z = 3.6
# Decca tree + outriggers (x, y) — the tree's centre mic sits 0.8 m nearer the stage
MICS = {"L": (11.5, 20.0), "C": (13.0, 20.8), "R": (14.5, 20.0), "OL": (8.0, 21.0), "OR": (18.0, 21.0)}
MIX = {"L": {"L": 1.0, "C": 0.7, "OL": 0.55}, "R": {"R": 1.0, "C": 0.7, "OR": 0.55}}

# seats: metres from the stage's front-centre (+x = right, +y = deeper), height
SEATS = {
    "piano": (-3.5, 0.6, 1.1),
    "glass": (0.5, 0.8, 1.3),
    "violins": (-5.0, 2.0, 1.2),
    "harp": (-7.5, 4.5, 1.3),
    "violas": (1.0, 3.2, 1.2),
    "celli": (4.5, 2.4, 1.0),
    "basses": (7.5, 5.0, 1.4),
    "horns": (-3.0, 7.0, 1.6),
    "trombones": (2.5, 8.0, 1.6),
    "tuba": (4.5, 8.2, 1.6),
    "timpani": (0.0, 9.0, 1.4),
    "bdrum": (2.0, 9.6, 1.4),
    "gong": (4.0, 9.8, 1.8),
    "cymbals": (-2.0, 9.6, 1.6),
    "bells": (6.0, 9.2, 2.2),
    "glock": (-4.5, 8.8, 1.2),
    "front": (0.0, -2.0, 2.4),  # in front of the stage: sound design that should feel close
}

BANDS = [(20, 200, 2.9), (200, 800, 2.5), (800, 2500, 2.1), (2500, 6000, 1.6), (6000, 20000, 1.0)]
IR_LEN = 3.8


def _images(src, order=3):
    """image sources of a point in the shoebox: (position, reflection count)"""
    out = []
    xs, ys, zs = src
    rng = range(-2, 3)
    for nx in rng:
        for qx in (0, 1):
            cx = abs(2 * nx - qx)
            px = (1 - 2 * qx) * xs + 2 * nx * W
            for ny in rng:
                for qy in (0, 1):
                    cy = abs(2 * ny - qy)
                    if cx + cy > order:
                        continue
                    py = (1 - 2 * qy) * ys + 2 * ny * D
                    for nz in rng:
                        for qz in (0, 1):
                            cz = abs(2 * nz - qz)
                            k = cx + cy + cz
                            if k > order:
                                continue
                            pz = (1 - 2 * qz) * zs + 2 * nz * H
                            out.append(((px, py, pz), k, cz))
    return out


def _tail(n, seed, scale):
    r = np.random.default_rng(seed)
    t = np.arange(n) / SR
    out = np.zeros((n, 2), np.float32)
    for lo, hi, rt in BANDS:
        noise = r.standard_normal((n, 2)).astype(np.float32)
        band = filt(sos_bp(lo, hi, 2) if lo > 20 else sos_lp(hi, 2), noise)
        out += band * np.exp(-6.91 * t / rt)[:, None].astype(np.float32)
    return out * scale


@lru_cache(maxsize=32)
def seat_ir(seat, wet=1.0):
    dx, dy, z = SEATS[seat]
    src = (STAGE[0] + dx, STAGE[1] + dy, z)
    n = int(IR_LEN * SR)
    groups = [np.zeros((n, len(MICS)), np.float64) for _ in range(3)]  # direct / 1st / later
    first = 1e9
    alpha = 0.22
    beta = np.sqrt(1 - alpha)
    for m, (name, (mx, my)) in enumerate(MICS.items()):
        for (px, py, pz), k, kz in _images(src):
            d = np.sqrt((px - mx) ** 2 + (py - my) ** 2 + (pz - MIC_Z) ** 2)
            tt = d / C * SR
            first = min(first, tt)
            i = int(tt)
            if i + 1 >= n:
                continue
            fr = tt - i
            g = (beta**k) * (0.85 ** kz) / max(d, 0.5)
            grp = groups[min(k, 2)]
            grp[i, m] += g * (1 - fr)
            grp[i + 1, m] += g * fr
    # air absorption and wall colour: each bounce darker
    sig = groups[0] + filt(sos_lp(9000, 1), groups[1].astype(np.float32)) + filt(sos_lp(5200, 1), groups[2].astype(np.float32))
    names = list(MICS)
    out = np.zeros((n, 2), np.float32)
    for c, side in enumerate(("L", "R")):
        for mic, g in MIX[side].items():
            out[:, c] += sig[:, names.index(mic)] * g
    # diffuse tail: energy set by the room (critical distance ~4.5 m), independent of seat
    t0 = int(first) + int(0.018 * SR)
    tail = _tail(n - t0, zlib.crc32(seat.encode()) % 1000 + 7, 1.0)  # stable across runs (hash() is salted)
    on = int(0.07 * SR)
    tail[:on] *= (np.linspace(0, 1, on) ** 1.5)[:, None]
    e_tail = np.sum(tail**2) / 2
    target = (1 / 4.5**2) * wet * 2.4
    tail *= np.sqrt(target / e_tail)
    out[t0:] += tail
    return out.astype(np.float32)


@lru_cache(maxsize=4)
def cathedral_ir():
    n = int(6.5 * SR)
    t = np.arange(n) / SR
    r = np.random.default_rng(99)
    out = np.zeros((n, 2), np.float32)
    for (lo, hi, _), rt in zip(BANDS, (6.0, 5.4, 4.6, 3.4, 2.0)):
        noise = r.standard_normal((n, 2)).astype(np.float32)
        band = filt(sos_bp(lo, hi, 2) if lo > 20 else sos_lp(hi, 2), noise)
        out += band * np.exp(-6.91 * t / rt)[:, None].astype(np.float32)
    pre = int(0.07 * SR)
    out = np.concatenate([np.zeros((pre, 2), np.float32), out])
    on = int(0.25 * SR)
    out[pre : pre + on] *= (np.linspace(0, 1, on) ** 2)[:, None]
    return (out / np.sqrt(np.sum(out**2) / 2) * 0.5).astype(np.float32)


def stage(seat, dry, spot=0.35, wet=1.0):
    """put a dry track on its seat: the tree pickup (direct + room) plus a little
    spot mic (close, panned to the seat) for detail. Returns stereo, length + IR."""
    x = mono(dry)
    ir = seat_ir(seat, wet)
    y = np.stack([signal.oaconvolve(x, ir[:, c]) for c in range(2)], axis=1).astype(np.float32)
    dx, dy, _ = SEATS[seat]
    p = float(np.clip(dx / 9.0, -0.85, 0.85))
    close = pan(x, p) * (spot / max(1.0, np.hypot(dx, dy + 4) / 4))
    y[: len(close)] += close
    return y


def cathedral(x, amount=0.3):
    ir = cathedral_ir()
    xm = mono(x)
    return np.stack([signal.oaconvolve(xm, ir[:, c]) for c in range(2)], axis=1).astype(np.float32) * amount


def room(x, size=0.6, amount=0.25):
    """a small tight room for close foley (switch clicks, paper)"""
    n = int(size * SR)
    t = np.arange(n) / SR
    r = np.random.default_rng(5)
    ir = r.standard_normal((n, 2)).astype(np.float32) * np.exp(-6.91 * t / size)[:, None].astype(np.float32)
    ir = filt(sos_lp(7000), ir)
    ir /= np.sqrt(np.sum(ir**2) / 2)
    xm = mono(x)
    wet = np.stack([signal.oaconvolve(xm, ir[:, c]) for c in range(2)], axis=1).astype(np.float32)
    out = wet * amount
    out[: len(xm)] += pan(xm, 0) * (1 - amount)
    return out


def hp_tidy(x, f=28):
    return filt(sos_hp(f, 2), x)
