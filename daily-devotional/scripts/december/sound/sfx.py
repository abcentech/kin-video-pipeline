"""Sound design for every SoundCue.type — soft, warm, in D, never horror, never a "braam".

  tick      a fine steel wristwatch, dry and close: a tiny escapement click, steel ring, case knock
  tickStop  the last tick, then the movement winding down (a few slowing micro-clicks, a spring)
  door      a door of LIGHT: an airy swell that opens upward, a soft low thump as the seam parts,
            a faint glass harmonic (A5) for the light
  doorClose the short soft inverse: air drawn in, a small thump as it shuts
  paper     a page breath
  hit 1-3   warm low impacts: felt-piano low D octaves, a timpani tuned to D, a sine body;
            weight 3 adds bowed basses and a low harp, all low-passed (no brass, no cymbal)
  drum      one deep bass drum tuned to D, in the hall
  click     a soft UI click
  bell      a small hand-chime bell (A5), two rings as it swings
  swell     air + strings (D/A) rising over `dur` into the next hit, cut on the hit
  silence   (not a sound: the mixer ducks the music)

Each one-shot is returned at a fixed internal level; the mixer sets its loudness relative
to the presenter's voice (LEVEL, in LU vs. the voice's speech loudness, measured as the
one-shot's loudest 400 ms K-weighted window). Airs/whooshes sit ~9 dB under the hits.
Deterministic: every noise source is seeded from the cue's type and an index.
"""
import numpy as np

from band import Band, Note
from common import SR, kpower, lk, seed_of
from studio import foley
from studio.dsp import filt, pan, shelf, sos_bp, sos_hp, sos_lp

LEVEL = {"tick": -27.0, "tickStop": -25.5, "door": -18.0, "doorClose": -21.0, "paper": -21.0, "hit1": -13.0, "hit2": -9.0,
         "hit3": -6.0, "drum": -7.0, "click": -21.0, "bell": -15.0, "swell": -18.0}

_cache = {}


def _rng(*k):
    return np.random.default_rng(seed_of("sfx", *k))


def _sweep_noise(n, f_from, f_to, r, width=(0.55, 1.7), stereo=True):
    """noise band whose centre glides from f_from to f_to (block-wise), decorrelated L/R"""
    ch = 2 if stereo else 1
    noise = r.standard_normal((n, ch)).astype(np.float32)
    out = np.zeros((n, ch), np.float32)
    blk = 512
    for i in range(0, n, blk):
        p = i / max(1, n)
        fc = f_from * (f_to / f_from) ** p
        seg = filt(sos_bp(max(60, fc * width[0]), min(fc * width[1], 16000), 2), noise[max(0, i - 2048) : i + blk])
        out[i : i + blk] = seg[-min(blk, n - i) :]
    return out if stereo else out[:, 0]


def _sampled(notes, length, seed):
    b = Band(seed)
    y = b.render(notes, 0.0, length)
    return y


def m400(x):
    """loudest 400 ms K-weighted window (LUFS) of a one-shot"""
    if len(x) < SR // 10:
        x = np.pad(x, ((0, SR // 10 - len(x)), (0, 0)))
    p = kpower(x)
    from scipy.ndimage import uniform_filter1d

    return float(lk(uniform_filter1d(p, 40, mode="constant").max() * 1.0))


# ------------------------------------------------------------------ the watch
def _tick_one(i, scale=1.0, pitch=1.0):
    r = _rng("tick", i % 8)
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    hi = i % 2 == 0
    k = pitch * (1.0 if hi else 0.955) * (1 + 0.004 * ((i * 7) % 5 - 2))
    burst = filt(sos_bp(2200, 9000), r.standard_normal(n).astype(np.float32)) * np.exp(-t * 2800)
    ring = (0.22 * np.sin(2 * np.pi * 4150 * k * t + 0.3) * np.exp(-t * 950)
            + 0.12 * np.sin(2 * np.pi * 6230 * k * t + 1.1) * np.exp(-t * 1400)
            + 0.05 * np.sin(2 * np.pi * 8700 * k * t) * np.exp(-t * 1900))
    knock = 0.2 * np.sin(2 * np.pi * 1580 * k * t) * np.exp(-t * 650)
    body = 0.08 * np.sin(2 * np.pi * 420 * k * t) * np.exp(-t * 300)  # the wrist / case, so it isn't thin
    x = (burst * 0.7 + ring + knock + body).astype(np.float32)
    a = int(0.0004 * SR)
    x[:a] *= np.linspace(0, 1, a)
    x = filt(sos_lp(10500, 2), x)
    x /= np.max(np.abs(x)) + 1e-9
    return x * scale


def tick(i=0):
    x = _tick_one(i)
    return foley._room(x, 0.06, size=0.12, amount=0.05, seed=31, lp=9000)  # dry, close: barely any room


def tick_stop():
    n = int(0.7 * SR)
    x = np.zeros(n, np.float32)
    last = _tick_one(0, 1.12)
    x[: len(last)] += last
    # the movement runs down: slowing micro-clicks, falling, fading
    t = 0.075
    gap = 0.024
    for j in range(6):
        c = _tick_one(j + 3, 0.34 * (0.72 ** j), pitch=0.9 - 0.04 * j)
        a = int(t * SR)
        m = min(len(c), n - a)
        x[a : a + m] += c[:m] * 0.9
        t += gap
        gap *= 1.38
    tt = np.arange(n) / SR
    spring = 0.04 * np.sin(2 * np.pi * 2210 * tt) * np.exp(-np.maximum(0, tt - 0.08) * 22) * (tt > 0.08)
    x += spring.astype(np.float32)
    return foley._room(x, 0.06, size=0.15, amount=0.06, seed=32, lp=9000)


# ------------------------------------------------------------------ doors of light
def _thump(f0=74, f1=46, dur=0.42, decay=11.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t * 14)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = (np.sin(ph) + 0.18 * np.sin(2 * ph)) * np.exp(-t * decay)
    a = int(0.006 * SR)
    x[:a] *= np.linspace(0, 1, a)
    return x.astype(np.float32)


def door():
    """f = the seam appearing; the air peaks as the panels are open (~+12 frames)"""
    n = int(1.9 * SR)
    t = np.arange(n) / SR
    r = _rng("door")
    air = _sweep_noise(n, 260, 3600, r, (0.5, 1.9))
    pk = 0.42
    env = np.where(t < pk, (t / pk) ** 1.8, np.exp(-(t - pk) * 3.2)).astype(np.float32)
    air = filt(sos_lp(6000, 2), air * env[:, None]) * 0.55
    th = np.zeros(n, np.float32)
    th[int(0.02 * SR) : int(0.02 * SR) + int(0.42 * SR)] = _thump()[: n - int(0.02 * SR)]
    out = air + pan(filt(sos_lp(900, 2), th), 0.0) * 0.5
    # the light: a faint glass harmonic on A (in D, over any chord of the theme)
    glass = _sampled([Note(0.05, "glass", 81, 0.9, 0.3, 0.25, 0.9, 0.0)], 2.0, seed_of("door-glass"))
    out[: min(n, len(glass))] += glass[:n] * 0.22
    return out


def door_close():
    n = int(0.75 * SR)
    t = np.arange(n) / SR
    r = _rng("doorClose")
    air = _sweep_noise(n, 2600, 420, r, (0.5, 1.8))
    shut = 10 / 30  # DOOR_OUT
    env = np.where(t < shut, (t / shut) ** 2.2, np.exp(-(t - shut) * 40)).astype(np.float32)
    air = filt(sos_lp(5500, 2), air * env[:, None]) * 0.5
    th = np.zeros(n, np.float32)
    a = int(shut * SR)
    tp = _thump(88, 58, 0.3, 16.0) * 0.6
    th[a : a + len(tp)] = tp[: n - a]
    return air + pan(filt(sos_lp(900, 2), th), 0.0) * 0.5


def paper():
    r = _rng("paper")
    n = int(0.55 * SR)
    t = np.arange(n) / SR
    x = _sweep_noise(n, 900, 4200, r, (0.55, 1.6), stereo=False)
    e = np.sin(np.pi * np.clip(t / 0.46, 0, 1)) ** 1.6
    rough = 0.75 + 0.25 * filt(sos_lp(25, 1), r.standard_normal(n).astype(np.float32)) * 6
    x = filt(sos_lp(7000, 2), (x * e * np.clip(rough, 0.3, 1.3)).astype(np.float32))
    return foley._room(x, -0.1, size=0.3, amount=0.15, seed=33, lp=7000)


# ------------------------------------------------------------------ impacts
def hit(weight=2):
    w = int(weight)
    notes = [Note(0.0, "piano", 26, 2.4, 0.3 + 0.1 * w, 0.004, 1.8, 0.0), Note(0.0, "piano", 38, 2.0, 0.28 + 0.08 * w, 0.004, 1.6, -4.0),
             Note(0.0, "timpani", None, None, 0.3 + 0.18 * w, 0.0, 0.0, -3.0 + w)]
    if w >= 2:
        notes += [Note(0.0, "bdrum", None, None, 0.35 + 0.1 * w, 0.0, 0.0, -2.0), Note(0.0, "celli", 38, 0.28, 0.5, 0.01, 0.9, -4.0)]
    if w >= 3:
        notes += [Note(0.0, "basses", 26, 0.6, 0.55, 0.02, 1.6, -2.0), Note(0.01, "harp", 38, 1.5, 0.7, 0.0, 1.5, -4.0),
                  Note(0.02, "harp", 45, 1.5, 0.6, 0.0, 1.5, -7.0)]
    b = Band(seed_of("hit", w), tune="I")  # drums tuned to D, as a timpanist would

    y = b.render(notes, 0.0, 5.0)
    # a sine body under it (the felt part of the impact)
    th = _thump(66, 38, 1.4, 3.2 - 0.4 * w) * (0.25 + 0.12 * w)
    y[: len(th)] += pan(th, 0.0) * 0.5
    y = filt(sos_lp(3200 + 600 * w, 2), y)
    return filt(sos_hp(28, 2), y)


def drum():
    notes = [Note(0.0, "bdrum", None, None, 0.92, 0.0, 0.0, 0.0), Note(0.0, "timpani", None, None, 0.45, 0.0, 0.0, -7.0)]
    b = Band(seed_of("drum"), tune="I")
    y = b.render(notes, 0.0, 5.0)
    th = _thump(62, 36, 1.8, 2.2) * 0.5
    y[: len(th)] += pan(th, 0.0) * 0.5
    return filt(sos_hp(26, 2), filt(sos_lp(3000, 2), y))


# ------------------------------------------------------------------ interface sounds
def click():
    r = _rng("click")
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    burst = filt(sos_bp(1400, 5200), r.standard_normal(n).astype(np.float32)) * np.exp(-t * 1500)
    ping = 0.28 * np.sin(2 * np.pi * 2350 * t) * np.exp(-t * 260)
    body = 0.3 * np.sin(2 * np.pi * 190 * t) * np.exp(-t * 90)
    x = filt(sos_lp(7500, 2), (burst * 0.6 + ping + body).astype(np.float32))
    x /= np.max(np.abs(x)) + 1e-9
    return foley._room(x, -0.15, size=0.18, amount=0.1, seed=34, lp=7000)


def bell():
    notes = [Note(0.0, "chimes", 81, None, 0.6, 0.0, 0.0, 0.0), Note(0.30, "chimes", 81, None, 0.42, 0.0, 0.0, -3.5)]
    y = _sampled(notes, 3.2, seed_of("bell"))
    return filt(shelf(6000, -4.0), filt(sos_lp(9000, 2), y))


def swell(dur_s):
    """air + strings rising for dur_s seconds, ending on the hit (sample len == dur_s)"""
    dur_s = max(0.3, float(dur_s))
    n = int(dur_s * SR)
    t = np.arange(n) / SR
    r = _rng("swell", round(dur_s, 2))
    air = _sweep_noise(n, 320, 2600, r, (0.5, 1.8))
    u = t / dur_s
    air = filt(sos_lp(5500, 2), air * (u ** 2.4)[:, None].astype(np.float32)) * 0.5
    st = _sampled([Note(0.0, "violas", 57, dur_s, 0.45, dur_s * 0.95, 0.05, 0.0), Note(0.0, "violas", 62, dur_s, 0.42, dur_s * 0.95, 0.05, -2.0),
                   Note(0.0, "violins", 69, dur_s, 0.4, dur_s * 0.95, 0.05, -4.0)], dur_s + 0.2, seed_of("swell-str", round(dur_s, 2)))[:n]
    y = air + st * 0.6
    f = min(int(0.035 * SR), n // 4)
    y[-f:] *= np.linspace(1, 0, f, dtype=np.float32)[:, None]
    return y


# ------------------------------------------------------------------ registry
def _code_hash():
    import zlib
    from pathlib import Path

    h = 0
    for f in ("sfx.py", "band.py"):
        h = zlib.crc32(Path(__file__).with_name(f).read_bytes(), h)
    return f"{h:08x}"


_HASH = _code_hash()


def _disk_path(key):
    """one-shots are deterministic: cached on disk per code version (.tmp/dec/sound-cache)"""
    from common import ROOT

    name = "_".join(str(k) for k in key).replace(".", "p")
    return ROOT / ".tmp" / "dec" / "sound-cache" / f"{_HASH}_{name}.npy"


def make(kind, weight=None, dur_s=None, index=0):
    """(audio, level key) for one cue; cached per distinct sound"""
    if kind == "tick":
        key = ("tick", index % 8)
        lvl = "tick"
    elif kind == "hit":
        w = int(weight or 2)
        key = ("hit", w)
        lvl = f"hit{w}"
    elif kind == "swell":
        key = ("swell", round(float(dur_s or 1.5), 2))
        lvl = "swell"
    else:
        key = (kind,)
        lvl = kind
    if key not in _cache:
        disk = _disk_path(key)
        if disk.exists():
            try:
                x = np.load(disk)
                _cache[key] = (x, m400(x))
                return _cache[key][0], _cache[key][1], LEVEL[lvl]
            except Exception:  # noqa: BLE001 - a broken cache file is rebuilt
                pass
        fn = {"tick": lambda: tick(index % 8), "tickStop": tick_stop, "door": door, "doorClose": door_close, "paper": paper,
              "hit": lambda: hit(int(weight or 2)), "drum": drum, "click": click, "bell": bell,
              "swell": lambda: swell(dur_s or 1.5)}[kind]
        x = fn().astype(np.float32)
        _cache[key] = (x, m400(x))
        try:
            disk.parent.mkdir(parents=True, exist_ok=True)
            np.save(disk, x)
        except OSError:
            pass
    x, l = _cache[key]
    return x, l, LEVEL[lvl]
