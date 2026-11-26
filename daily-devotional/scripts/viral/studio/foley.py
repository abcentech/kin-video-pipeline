"""Foley for wordless stories, synthesised (no recordings needed): the sounds that tell
time and place when nobody speaks.

  tick / tock   a wall clock's escapement (hard click, a little metal ring, the case's knock)
  crickets      two crickets on either side: the awkward-silence beat
  car_pass      a car going by (engine + tyres, Doppler, air absorption, panned across)
  steps         someone walking in from one side (heel, sole click, scuff), getting closer

Each returns stereo float32 at SR, already in its space (a small room or the open air).
"""
import numpy as np

from .dsp import SR, filt, mono, pan, sos_bp, sos_hp, sos_lp

_rng = np.random.default_rng(11)


def _room(x, p=0.0, size=0.45, amount=0.22, seed=5, lp=7000):
    """a mono sound in a small space: the dry sound panned to p, the room around it"""
    x = mono(x)
    n = int(size * SR)
    t = np.arange(n) / SR
    r = np.random.default_rng(seed)
    ir = r.standard_normal((n, 2)).astype(np.float32) * np.exp(-6.91 * t / size)[:, None].astype(np.float32)
    ir = filt(sos_lp(lp), ir)
    ir /= np.sqrt(np.sum(ir**2) / 2)
    from scipy import signal

    wet = np.stack([signal.oaconvolve(x, ir[:, c]) for c in range(2)], axis=1).astype(np.float32) * amount
    wet[: len(x)] += pan(x, p) * (1 - amount)
    return wet


def tick(kind="tick", p=0.0):
    """one beat of a wall clock; kind 'tock' is the lower half of the pair"""
    hi = kind == "tick"
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    burst = filt(sos_bp(1800, 9500), _rng.standard_normal(n).astype(np.float32)) * np.exp(-t * 1500)
    ring = np.sin(2 * np.pi * (3150 if hi else 2700) * t) * np.exp(-t * 110) * 0.16
    ring += np.sin(2 * np.pi * (5230 if hi else 4480) * t) * np.exp(-t * 190) * 0.07
    knock = np.sin(2 * np.pi * (610 if hi else 505) * t) * np.exp(-t * 85) * 0.24
    x = (burst + ring + knock).astype(np.float32)
    x /= np.max(np.abs(x)) + 1e-9
    return _room(x, p, 0.35, 0.16)


def crickets(dur, seed=3):
    """two crickets, left and right, chirping out of step; a faint evening air under them"""
    r = np.random.default_rng(seed)
    n = int(dur * SR)
    out = np.zeros((n, 2), np.float32)
    for f, p, period, off in ((4650, -0.55, 0.58, 0.04), (4390, 0.5, 0.67, 0.31)):
        sig = np.zeros(n, np.float32)
        tt = off
        while tt < dur - 0.15:
            pulses = int(r.integers(3, 5))
            for j in range(pulses):
                a = int((tt + j * 0.032) * SR)
                L = int(0.017 * SR)
                if a + L >= n:
                    break
                g = np.sin(np.pi * np.arange(L) / L) ** 2
                ph = 2 * np.pi * f * (1 + 0.004 * j) * np.arange(L) / SR
                sig[a : a + L] += (g * (np.sin(ph) + 0.22 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)) * (0.75 + 0.25 * r.random())).astype(np.float32)
            tt += period * (0.92 + 0.16 * r.random())
        out += _room(sig, p, 0.9, 0.3, seed=int(f))[:n]
    air = filt(sos_bp(250, 2400), r.standard_normal(n).astype(np.float32)) * 0.006
    out += np.stack([air, np.roll(air, 900)], axis=1)
    e = np.ones(n, np.float32)
    k = int(0.08 * SR)
    e[:k] = np.linspace(0, 1, k)
    e[-k:] = np.linspace(1, 0, k)
    return out * e[:, None]


def car_pass(dur=2.6, closest=1.5, lr=(-0.9, 0.85), speed=13.0, dist=7.0, seed=4):
    """a car driving past: closest approach at `closest` s, travelling from lr[0] to lr[1]"""
    r = np.random.default_rng(seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = speed * (t - closest)
    rr = np.sqrt(x**2 + dist**2)
    vr = speed * x / rr  # + receding
    dop = 343.0 / (343.0 + vr)
    f0 = 41.0 * (1 + 0.012 * np.sin(2 * np.pi * 0.6 * t))
    ph = 2 * np.pi * np.cumsum(f0 * dop) / SR
    eng = np.zeros(n)
    for k in range(1, 14):
        eng += np.sin(k * ph + r.random() * 6.28) / k**0.75 * (1.3 if k in (2, 4) else 1.0)
    eng *= 1 + 0.25 * filt(sos_lp(30), r.standard_normal(n).astype(np.float32))
    tyre = filt(sos_bp(220, 3200), r.standard_normal(n).astype(np.float32))
    wind = filt(sos_bp(900, 6000), r.standard_normal(n).astype(np.float32)) * 0.35
    src = (eng / np.max(np.abs(eng)) * 0.45 + tyre * 0.9 + wind).astype(np.float32)
    # air absorption: far = dark; blockwise low-pass following the distance
    out = np.zeros(n, np.float32)
    blk = 1024
    for i in range(0, n, blk):
        d = rr[min(n - 1, i + blk // 2)]
        fc = float(np.clip(9000 * (dist / d) ** 1.3, 700, 9000))
        seg = filt(sos_lp(fc, 2), src[max(0, i - 4096) : i + blk])
        out[i : i + blk] = seg[-min(blk, n - i) :]
    amp = (dist / rr) ** 1.6
    out *= amp.astype(np.float32)
    k = int(0.25 * SR)
    out[:k] *= np.linspace(0, 1, k)
    out[-k:] *= np.linspace(1, 0, k)
    # pan follows the car across the street
    p = lr[0] + (lr[1] - lr[0]) * (0.5 + 0.5 * np.tanh(x / (dist * 0.9)))
    L = np.cos((p + 1) * np.pi / 4) * np.sqrt(2)
    R = np.sin((p + 1) * np.pi / 4) * np.sqrt(2)
    y = np.stack([out * L, out * R], axis=1).astype(np.float32)
    y /= np.max(np.abs(y)) + 1e-9
    y = filt(sos_hp(35, 2), y)
    return y


def steps(count=5, gap=0.47, p=(0.95, 0.55), g=(0.25, 1.0), seed=8):
    """someone walking in: heel strike, sole click, a scuff; from p[0] to p[1], g[0] to g[1]"""
    r = np.random.default_rng(seed)
    total = int((count * gap + 0.5) * SR)
    out = np.zeros((total, 2), np.float32)
    for i in range(count):
        k = i / max(1, count - 1)
        a = int((i * gap + r.normal(0, 0.012)) * SR)
        n = int(0.2 * SR)
        t = np.arange(n) / SR
        heel = np.sin(2 * np.pi * (92 + 22 * r.random()) * t) * np.exp(-t * 52) * 0.9
        click = filt(sos_bp(900, 5200), r.standard_normal(n).astype(np.float32)) * np.exp(-t * 170) * 0.55
        scuff = filt(sos_bp(1400, 6500), r.standard_normal(n).astype(np.float32)) * np.exp(-(((t - 0.055) / 0.028) ** 2)) * 0.14
        x = ((heel + click + scuff) * (g[0] + (g[1] - g[0]) * k)).astype(np.float32)
        y = _room(x, p[0] + (p[1] - p[0]) * k, 0.5, 0.26, seed=40 + i)
        a = max(0, a)
        m = min(len(y), total - a)
        out[a : a + m] += y[:m]
    return out


def haptic(strength=1.0, seed=0):
    """the felt tap under a word landing on screen (a phone's haptic, as sound): a tight
    low thump with a little body an inch above it, and the faintest tick on top"""
    r = np.random.default_rng(100 + seed)
    n = int(0.11 * SR)
    t = np.arange(n) / SR
    f = 58 + (110 - 58) * np.exp(-t * 45)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 34)
    over = np.sin(2 * np.pi * np.cumsum(f * 2.02) / SR) * np.exp(-t * 60) * 0.35  # reads on a phone speaker
    tick_ = filt(sos_bp(1800, 6000), r.standard_normal(n).astype(np.float32)) * np.exp(-t * 1100) * 0.07
    x = ((body + over + tick_) * strength).astype(np.float32)
    a = int(0.002 * SR)
    x[:a] *= np.linspace(0, 1, a)
    return pan(x, 0.0)


def flip(seed=0):
    """a split-flap clock card turning over: two quick plastic clacks and a small tap"""
    r = np.random.default_rng(200 + seed)
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    x = np.zeros(n, np.float32)
    for off, g in ((0.0, 1.0), (0.021, 0.6)):
        a = int(off * SR)
        m = n - a
        tt = t[:m]
        clack = filt(sos_bp(1200, 7000), r.standard_normal(m).astype(np.float32)) * np.exp(-tt * 700)
        ring = np.sin(2 * np.pi * (2300 + 300 * off) * tt) * np.exp(-tt * 260) * 0.15
        x[a:] += ((clack + ring) * g).astype(np.float32)
    x += (np.sin(2 * np.pi * 140 * t) * np.exp(-t * 70) * 0.35).astype(np.float32)
    x /= np.max(np.abs(x)) + 1e-9
    return _room(x, -0.35, 0.3, 0.15)


def flutter(dur, seed=0):
    """the minutes racing: flaps that speed up and slow down again, quiet"""
    n = int(dur * SR)
    out = np.zeros((n + int(0.2 * SR), 2), np.float32)
    t, k = 0.0, 0
    while t < dur:
        p = t / dur
        gap = 0.16 - 0.12 * np.sin(np.pi * p)  # 160 ms → 40 ms → 160 ms
        y = flip(seed + k) * (0.35 + 0.25 * np.sin(np.pi * p))
        a = int(t * SR)
        m = min(len(y), len(out) - a)
        out[a : a + m] += y[:m]
        t += gap
        k += 1
    return out


def beep(f=988.0, dur=0.13, seed=0):
    """a heart monitor's blip: a clean tone with a soft edge and a hint of square"""
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(2 * np.pi * 3 * f * t) + 0.06 * np.sin(2 * np.pi * 5 * f * t)
    e = np.minimum(1, t / 0.006) * np.minimum(1, (dur - t) / 0.02)
    return _room((x * e).astype(np.float32) * 0.6, 0.15, 0.35, 0.18, seed=300 + seed)


def flatline(dur, f=988.0):
    """the long tone of a monitor with no pulse"""
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(2 * np.pi * 3 * f * t)
    e = np.minimum(1, t / 0.05) * np.minimum(1, (dur - t) / 0.25)
    return _room((x * e).astype(np.float32) * 0.5, 0.15, 0.6, 0.2, seed=310)


def page_turn(seed=0):
    """a thin Bible page turning: a rising paper swish and a soft flap at the end"""
    r = np.random.default_rng(400 + seed)
    n = int(0.42 * SR)
    t = np.arange(n) / SR
    noise = r.standard_normal(n).astype(np.float32)
    out = np.zeros(n, np.float32)
    blk = 512
    for i in range(0, n, blk):
        p = i / n
        fc = 1500 + 5000 * p
        seg = filt(sos_bp(fc * 0.5, min(fc * 1.6, 15000)), noise[max(0, i - 2048) : i + blk])
        out[i : i + blk] = seg[-min(blk, n - i) :]
    e = np.sin(np.pi * np.clip(t / 0.36, 0, 1)) ** 1.5 * 0.5
    flap = filt(sos_bp(500, 3000), r.standard_normal(n).astype(np.float32)) * np.exp(-np.maximum(0, t - 0.33) * 60) * (t > 0.33) * 0.8
    return _room((out * e + flap).astype(np.float32), 0.0, 0.35, 0.2, seed=410 + seed)


def paper_toss(seed=0):
    """a sheet of paper flung down: a flutter that falls, then a light slap on the floor"""
    r = np.random.default_rng(500 + seed)
    n = int(0.8 * SR)
    t = np.arange(n) / SR
    flut = filt(sos_bp(900, 6000), r.standard_normal(n).astype(np.float32))
    am = 0.5 + 0.5 * np.sin(2 * np.pi * (14 - 8 * t) * t)
    e = np.exp(-t * 4) * np.minimum(1, t / 0.02)
    slap = filt(sos_bp(300, 4000), r.standard_normal(n).astype(np.float32)) * np.exp(-np.maximum(0, t - 0.55) * 45) * (t > 0.55)
    return _room((flut * am * e * 0.6 + slap * 0.7).astype(np.float32), 0.2, 0.4, 0.22, seed=510 + seed)


def sit(seed=0):
    """someone sitting down on a plastic chair: the body's soft weight and a creak"""
    r = np.random.default_rng(600 + seed)
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    thump = np.sin(2 * np.pi * (85 - 25 * t) * t) * np.exp(-t * 18) * 0.9
    creak = np.zeros(n)
    for f0, a in ((640, 0.25), (1310, 0.12), (2050, 0.07)):
        creak += np.sin(2 * np.pi * f0 * t * (1 + 0.04 * np.sin(2 * np.pi * 6 * t))) * a
    creak *= np.exp(-np.maximum(0, t - 0.08) * 9) * (t > 0.08) * (0.5 + 0.5 * r.random(n) ** 3)
    cloth = filt(sos_bp(1500, 7000), r.standard_normal(n).astype(np.float32)) * np.exp(-t * 14) * 0.15
    return _room((thump + creak + cloth).astype(np.float32), 0.25, 0.45, 0.25, seed=610 + seed)


def breath(dur=1.4, seed=0):
    """the breath of life: a long drawn-in air, rising and widening (a wind that becomes a breath)"""
    r = np.random.default_rng(700 + seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = r.standard_normal((n, 2)).astype(np.float32)
    out = np.zeros((n, 2), np.float32)
    blk = 512
    for i in range(0, n, blk):
        p = i / n
        lo, hi = 300 + 900 * p, 1800 + 6000 * p
        seg = filt(sos_bp(lo, hi), noise[max(0, i - 2048) : i + blk])
        out[i : i + blk] = seg[-min(blk, n - i) :]
    e = (np.clip(t / dur, 0, 1) ** 1.6 * np.minimum(1, (dur - t) / 0.12))[:, None]
    return (out * e * 0.5).astype(np.float32)


def marker(dur=0.55, seed=0):
    """a felt marker circling something on glass: a squeaky, wavering stroke"""
    r = np.random.default_rng(800 + seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 1900 + 500 * np.sin(2 * np.pi * 2.2 * t / dur) + 120 * np.sin(2 * np.pi * 23 * t)
    squeak = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.35 + 0.65 * r.random(n) ** 2)
    hiss = filt(sos_bp(2500, 9000), r.standard_normal(n).astype(np.float32)) * 0.5
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 0.6
    x = filt(sos_bp(1200, 8000), ((squeak * 0.4 + hiss) * e).astype(np.float32))
    return _room(x.astype(np.float32), 0.15, 0.3, 0.15, seed=810 + seed)


def stone_roll(dur=1.6, p=(-0.2, 0.7), seed=0):
    """a heavy tomb stone rolled aside: a deep grinding rumble with gravel crackle under it,
    rising as it gets moving and settling with a low thud; it travels across the stereo field"""
    r = np.random.default_rng(900 + seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    u = t / dur
    # the grind: brown noise through a low band, its roughness from a slow random wobble
    brown = np.cumsum(r.standard_normal(n)).astype(np.float32)
    brown -= filt(sos_lp(8), brown)
    grind = filt(sos_bp(55, 420), brown)
    grind /= np.max(np.abs(grind)) + 1e-9
    wob = filt(sos_lp(9), r.standard_normal(n).astype(np.float32))
    wob = 0.55 + 0.45 * wob / (np.max(np.abs(wob)) + 1e-9)
    # gravel: sparse grains, each a tiny band-passed click
    grains = (r.random(n) < 0.0016 * (0.4 + u)).astype(np.float32) * r.random(n).astype(np.float32)
    gravel = filt(sos_bp(900, 5200), grains) * 2.2
    rumble = np.sin(2 * np.pi * np.cumsum(38 + 6 * np.sin(2 * np.pi * 1.3 * t)) / SR) * 0.35
    e = np.minimum(1, u / 0.18) ** 1.4 * np.minimum(1, (1 - u) / 0.35) ** 0.7
    thud_t = np.maximum(0, t - dur * 0.86)
    thud = np.sin(2 * np.pi * (70 - 25 * thud_t) * thud_t) * np.exp(-thud_t * 16) * (t > dur * 0.86) * 0.9
    x = ((grind * wob * 0.9 + gravel * 0.25 + rumble) * e + thud).astype(np.float32)
    x /= np.max(np.abs(x)) + 1e-9
    # move across: the pan glides from p[0] to p[1]
    out = np.zeros((n, 2), np.float32)
    pp = p[0] + (p[1] - p[0]) * u
    out[:, 0] = x * np.cos((pp + 1) * np.pi / 4)
    out[:, 1] = x * np.sin((pp + 1) * np.pi / 4)
    return _wide(out, seed)


def _wide(st2, seed=0):
    """a stereo sound in a big stone room (keeps its own panning)"""
    from scipy import signal

    n = int(0.9 * SR)
    t = np.arange(n) / SR
    r = np.random.default_rng(950 + seed)
    ir = r.standard_normal((n, 2)).astype(np.float32) * np.exp(-6.91 * t / 0.9)[:, None].astype(np.float32)
    ir = filt(sos_lp(4500), ir)
    ir /= np.sqrt(np.sum(ir**2) / 2)
    wet = np.stack([signal.oaconvolve(st2[:, c], ir[:, c]) for c in range(2)], axis=1).astype(np.float32) * 0.28
    wet[: len(st2)] += st2 * 0.8
    return wet


def fly(dur=1.8, p=(-0.8, 0.8), seed=0):
    """a fly buzzing past (the 'he stinketh' joke): a nasal sawtooth buzz with wing flutter,
    Doppler-ish pitch bends and a loop-de-loop across the stereo field"""
    r = np.random.default_rng(1000 + seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    u = t / dur
    bend = 1 + 0.08 * np.sin(2 * np.pi * 1.7 * t + 0.6) + 0.04 * np.sin(2 * np.pi * 5.3 * t)
    f = 205 * bend
    ph = np.cumsum(f) / SR
    saw = 2 * (ph % 1) - 1
    flutter = 0.7 + 0.3 * np.sin(2 * np.pi * 31 * t + r.random() * 6)
    x = filt(sos_bp(300, 4200), (saw * flutter).astype(np.float32))
    dist = 0.55 + 0.45 * np.cos(2 * np.pi * (u * 1.5))  # comes close twice
    e = np.minimum(1, u / 0.12) * np.minimum(1, (1 - u) / 0.2) * (1.15 - dist)
    x = (x * e).astype(np.float32)
    x /= np.max(np.abs(x)) + 1e-9
    pp = p[0] + (p[1] - p[0]) * u + 0.35 * np.sin(2 * np.pi * 1.1 * t)
    pp = np.clip(pp, -1, 1)
    out = np.stack([x * np.cos((pp + 1) * np.pi / 4), x * np.sin((pp + 1) * np.pi / 4)], axis=1).astype(np.float32)
    return out * 0.8


def cloth(dur=0.5, seed=0, pull=True):
    """grave cloth pulled off: a fabric swish (rising if pull, else a soft fall) and a flap"""
    r = np.random.default_rng(1100 + seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = r.standard_normal(n).astype(np.float32)
    out = np.zeros(n, np.float32)
    blk = 512
    for i in range(0, n, blk):
        q = i / n
        fc = (700 + 2600 * q) if pull else (2600 - 1800 * q)
        seg = filt(sos_bp(fc * 0.45, min(fc * 2.2, 14000)), noise[max(0, i - 2048) : i + blk])
        out[i : i + blk] = seg[-min(blk, n - i) :]
    rough = 0.6 + 0.4 * filt(sos_lp(40), r.standard_normal(n).astype(np.float32)) * 3
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** (0.8 if pull else 1.6)
    flap_t = np.maximum(0, t - dur * 0.8)
    flap = filt(sos_bp(250, 2500), r.standard_normal(n).astype(np.float32)) * np.exp(-flap_t * 50) * (t > dur * 0.8) * 0.6
    x = (out * np.clip(rough, 0.2, 1.4) * e + flap).astype(np.float32)
    x /= np.max(np.abs(x)) + 1e-9
    return _room(x, 0.1 * (1 if seed % 2 else -1), 0.35, 0.2, seed=1110 + seed)
