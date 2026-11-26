"""The composer, the arranger and the sound designer.

Score(key, length) takes the short's sections (mood + time) and events (drops, slams,
risers…) and writes real notes for a sampled orchestra seated in the hall:

  dark     basses + celli drone on i (slow bowed swells), a sparse low piano with a
           high answering note, wine glass halo, a soft bass-drum heartbeat
  tension  celli spiccato pulse on the root, high violin tremolo on the fifth that
           grows, basses holding, the heartbeat
  light    VI (add9) → III: the strings open up, a soft grand-piano arpeggio,
           a harp sweep and glock sparkle as it arrives
  payoff   I major (the Picardy turn): full strings, noble horns, low brass, a
           tubular bell on the root in a cathedral, timpani + gong + bass drum

Sound design is made of the same real recordings: impacts (bass drum + timpani +
gong + a sub drop), braams (low brass + basses), risers (suspended-cymbal crescendo
+ timpani roll + string tremolo), whooshes (reversed cymbal), shimmers (mark tree,
glock, harp, glass).
"""
import numpy as np

from . import space
from .dsp import SR, fade, filt, mono, pan, place, sos_bp, sos_hp, sos_lp, st
from .library import Patch, load

NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}
DEGREE = {"i": (0, "min"), "I": (0, "maj"), "III": (3, "maj"), "iv": (5, "min"), "IV": (5, "maj"), "v": (7, "min"), "V": (7, "maj"), "vi": (9, "min"), "VI": (8, "maj"), "VII": (10, "maj")}
DEFAULT_CHORDS = {"dark": ["i"], "tension": ["i"], "light": ["VI", "III"], "payoff": ["I"]}
PAD = 5 * SR
PLUCKED = {"piano", "harp", "bells", "glock", "chimes"}

# per-instrument level trims (dB) after each patch is normalised to the same loudness
TRIM = {
    "violins": -4, "violins_trem": -7, "violas": -5, "celli": -3, "celli_trem": -6, "celli_spic": -5,
    "basses": -2, "horns": -5, "trombones": -6, "tuba": -6, "piano": -3, "harp": -6, "bells": -7,
    "glock": -13, "chimes": -10, "glass": -12, "timpani": 0, "timp_roll": -6, "bdrum": 0, "bdrum_roll": -4,
    "gong": -5, "cym_cresc": -6, "cym_hit": -12, "marktree": -10, "belltree": -12,
}
SEAT = {
    "violins": "violins", "violins_trem": "violins", "violas": "violas", "celli": "celli", "celli_trem": "celli",
    "celli_spic": "celli", "basses": "basses", "horns": "horns", "trombones": "trombones", "tuba": "tuba",
    "piano": "piano", "harp": "harp", "bells": "bells", "glock": "glock", "chimes": "glock", "glass": "glass",
    "timpani": "timpani", "timp_roll": "timpani", "bdrum": "bdrum", "bdrum_roll": "bdrum", "gong": "gong",
    "cym_cresc": "cymbals", "cym_hit": "cymbals", "marktree": "glock", "belltree": "glock",
}


def nearest(pc, lo, hi):
    for m in range(lo, hi + 1):
        if m % 12 == pc % 12:
            return m
    return lo


TUNED = {"bdrum": (28, 110), "timpani": (60, 260), "timp_roll": (60, 260)}


def tune_drum(x, pc, band):
    """resample a drum hit so its strongest low partial lands on pitch class pc"""
    import soxr

    seg = mono(x)[int(0.03 * SR) : int(0.6 * SR)]
    if len(seg) < 2048:
        return x
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), n=1 << 16))
    freqs = np.fft.rfftfreq(1 << 16, 1 / SR)
    lo, hi = band
    sel = (freqs >= lo) & (freqs <= hi)
    f0 = freqs[sel][np.argmax(spec[sel])]
    m = 69 + 12 * np.log2(f0 / 440)
    target = m + ((pc - round(m)) % 12)
    if target - m > 6:
        target -= 12
    shift = target - m
    if abs(shift) < 0.15:
        return x
    ratio = 2 ** (shift / 12)
    return soxr.resample(x, SR * ratio, SR).astype(np.float32)


def sine_drop(dur=1.8, f0=62, f1=33, decay=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t * 9)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t * decay)
    a = int(0.003 * SR)
    x[:a] *= np.linspace(0, 1, a)
    return np.tanh(1.6 * x).astype(np.float32) * 0.9


class Score:
    def __init__(self, key="D", n=0, seed=1):
        self.root = NOTE[key]
        self.n = n + PAD
        self.seed = seed
        self.rng = np.random.default_rng(seed)
        self.patches = {}
        self.norms = {}
        self.tracks = {}  # (bus, seat) -> mono dry
        # cathedral sends, one per (bus, section): each section's halo fades when the next chord lands
        self.cath = {}
        self.cath_end = {}
        self.sec = None
        self.front = {"music": np.zeros((self.n, 2), np.float32), "sfx": np.zeros((self.n, 2), np.float32)}
        self.chord_at = []  # (t0, t1, pcs) for sfx that should be in key
        self.choke_at = None  # music notes are damped here (the next section's chord)
        self.choke_len = 0.45

    # ------------------------------------------------------------- plumbing
    def patch(self, name):
        if name not in self.patches:
            p = Patch(name, self.seed + len(self.patches))
            self.patches[name] = p
            # normalise: the loudest layer near the middle of the range to -18 dBFS RMS
            # (percussion: peak to -3 dBFS), then the instrument's trim
            top = max(e["layer"] for e in p.files)
            cands = [e for e in p.files if e["layer"] == top]
            if p.pitched and name not in PLUCKED:
                mids = sorted(e["midi"] for e in cands if e["midi"] is not None)
                mid = mids[len(mids) // 2] if mids else None
                e = min(cands, key=lambda e: abs((e["midi"] or 0) - (mid or 0)))
                x = mono(load(e["file"]))[: int(1.5 * SR)]
                ref = np.sqrt(np.mean(x**2)) + 1e-9
                g = 10 ** (-18 / 20) / ref
            elif p.pitched:
                # plucked / struck: a decaying note has a low RMS; match peaks instead
                mids = sorted(e["midi"] for e in cands if e["midi"] is not None)
                mid = mids[len(mids) // 2]
                e = min(cands, key=lambda e: abs((e["midi"] or 0) - mid))
                g = 10 ** (-8 / 20) / (np.max(np.abs(mono(load(e["file"])))) + 1e-9)
            else:
                x = mono(load(cands[0]["file"]))
                g = 10 ** (-3 / 20) / (np.max(np.abs(x)) + 1e-9)
            self.norms[name] = g * 10 ** (TRIM.get(name, 0) / 20)
        return self.patches[name]

    def put(self, seat, x, at, gain=1.0, bus="music", cath=0.0):
        key = (bus, seat)
        if key not in self.tracks:
            self.tracks[key] = np.zeros(self.n, np.float32)
        m = mono(x) * gain
        place(self.tracks[key], m, at)
        if cath:
            k = (bus, self.sec if bus == "music" else None)
            if k not in self.cath:
                self.cath[k] = np.zeros(self.n, np.float32)
            place(self.cath[k], m * cath, at)

    def play(self, inst, midi, t, dur=None, vel=0.6, attack=0.0, release=0.6, gain_db=0.0, bus="music", cath=0.0, match=None):
        p = self.patch(inst)
        x = p.note(midi, dur, vel, attack, release, match)
        if inst in TUNED and self.chord_at:
            # drums have a pitch too: tune the boom to the chord's root, as a timpanist would
            x = tune_drum(x, self.pcs_at(t)["r"], TUNED[inst])
        if bus == "music" and self.choke_at is not None:
            # lift the pedal / stop the bows when the next chord arrives
            keep = int((self.choke_at - t + self.choke_len) * SR)
            if keep <= 0:
                return x
            if len(x) > keep:
                f = min(keep, int(self.choke_len * SR))
                x = x[:keep].copy()
                x[-f:] *= (np.linspace(1, 0, f) ** 2)[:, None]
        g = self.norms[inst] * 10 ** (gain_db / 20) * (0.35 + 0.65 * vel)
        self.put(SEAT[inst], x, int(round(t * SR)), g, bus, cath)
        return x

    def chord_pcs(self, name):
        deg, q = DEGREE[name]
        r = (self.root + deg) % 12
        return {"r": r, "3": (r + (3 if q == "min" else 4)) % 12, "5": (r + 7) % 12, "9": (r + 2) % 12, "q": q}

    def pcs_at(self, t):
        for a, b, pcs in self.chord_at:
            if a <= t < b:
                return pcs
        return self.chord_at[-1][2] if self.chord_at else self.chord_pcs("i")

    # ------------------------------------------------------------- the score
    def section(self, mood, t0, t1, bpm=76, hard=False, chords=None, energy=1.0, choke=None):
        """choke: seconds of release allowed past t1 (None = let it ring: the last section)"""
        names = chords or DEFAULT_CHORDS.get(mood, ["i"])
        span = t1 - t0
        if span < 3.2:
            names = names[:1]
        seg = span / len(names)
        beat = 60.0 / bpm
        att = 0.04 if hard else 0.6
        for ci, name in enumerate(names):
            a = t0 + ci * seg
            b = a + seg
            c = self.chord_pcs(name)
            self.chord_at.append((a, b, c))
            first = ci == 0
            last_chord = ci == len(names) - 1
            self.choke_at = (b if not last_chord or choke is not None else None)
            self.choke_len = (choke if last_chord and choke is not None else 0.5)
            self.sec = (round(t0, 3), ci)
            self.cath_end[self.sec] = None if self.choke_at is None else self.choke_at + self.choke_len
            at_ = att if first else 0.35
            d = b - a
            if mood == "dark":
                self.play("basses", nearest(c["r"], 28, 39), a, d, 0.35, 1.4 if not hard else 0.1, 1.2, -1)
                self.play("celli", nearest(c["r"], 36, 47), a, d, 0.3, 1.2 if not hard else 0.1, 1.2, -2)
                self.play("celli", nearest(c["5"], 43, 54), a + 0.15, d, 0.25, 1.6, 1.2, -5)
                self.play("violas", nearest(c["3"], 51, 62), a + 0.4, d, 0.6, 2.0, 1.2, 3)
                self.play("glass", nearest(c["5"], 74, 86), a + 0.4, d, 0.4, 1.8, 1.4, -2, cath=0.25)
                # sparse piano: a low note on the downbeat, a high note answers
                k = 0
                while a + k * 2 * beat < b - 0.3:
                    tt = a + k * 2 * beat
                    self.play("piano", nearest(c["r"], 33, 44), tt, 2.4, 0.7, 0, 1.5, 0, cath=0.15)
                    if tt + beat < b - 0.2:
                        self.play("piano", nearest([c["5"], c["3"], c["9"]][k % 3], 72, 84), tt + beat, 2.0, 0.55, 0, 1.6, -5, cath=0.3)
                    k += 1
                self.heartbeat(a, b, beat, 0.32)
            elif mood == "tension":
                self.play("basses", nearest(c["r"], 28, 39), a, d, 0.45, 0.8 if not hard else 0.05, 1.0, 0)
                self.play("celli_trem", nearest(c["r"], 36, 47), a, d, 0.25, 1.0, 0.9, -8)
                self.play("violas", nearest(c["3"], 55, 66), a + 0.3, d, 0.6, 1.8, 1.0, 5)
                # spiccato pulse in eighths, root / root / octave / root, accents on the beat
                step = beat / 2
                k = 0
                lo = nearest(c["r"], 40, 51)
                while a + k * step < b - 0.05:
                    m = [lo, lo, lo + 12, lo][k % 4]
                    acc = k % 2 == 0
                    self.play("celli_spic", m, a + k * step, None, 0.6 if acc else 0.35, 0, 0, -1 if acc else -5)
                    k += 1
                # violins: tremolo on the fifth, growing through the section
                v = self.patch("violins_trem").note(nearest(c["5"], 67, 79), d, 0.6, min(d * 0.8, 3.0), 0.8)
                g = np.linspace(0.45, 1.0, len(v)).astype(np.float32)[:, None] * energy
                self.put("violins", v * g, int(a * SR), self.norms["violins_trem"] * 1.1)
                self.heartbeat(a, b, beat * 2, 0.4)
            elif mood == "light":
                self.play("basses", nearest(c["r"], 28, 39), a, d, 0.4, at_, 1.4, -1)
                self.play("celli", nearest(c["r"], 36, 47), a, d, 0.45, at_, 1.4, 0)
                self.play("celli", nearest(c["5"], 43, 55), a, d, 0.4, at_ + 0.1, 1.4, -3)
                self.play("violas", nearest(c["3"], 55, 66), a, d, 0.45, at_ + 0.2, 1.4, -1)
                self.play("violins", nearest(c["5"], 67, 78), a, d, 0.45, at_ + 0.3, 1.5, -1, cath=0.12)
                self.play("violins", nearest(c["9"], 72, 86), a + 0.2, d, 0.4, at_ + 0.6, 1.5, -4, cath=0.12)
                self.play("glass", nearest(c["r"], 74, 86), a, d, 0.35, 1.0, 1.5, -4, cath=0.3)
                # the piano: a slow rocking arpeggio, pedal down
                pat = [nearest(c["r"], 55, 66), nearest(c["5"], 62, 73), nearest(c["9"], 67, 78), nearest(c["3"], 69, 81), nearest(c["5"], 74, 85), nearest(c["3"], 69, 81)]
                step = beat / 2
                k = 0
                while a + k * step < b - 0.15:
                    self.play("piano", pat[k % len(pat)], a + k * step, 2.6, 0.65 if k % len(pat) == 0 else 0.55, 0, 1.8, 0 if k % 6 == 0 else -3, cath=0.18)
                    k += 1
                if first:
                    self.harp_sweep(a - 0.05, c, up=True, gain_db=-2)
                    self.play("glock", nearest(c["5"], 84, 96), a, None, 0.5, 0, 0, -3, cath=0.35)
            elif mood == "payoff":
                self.play("basses", nearest(c["r"], 28, 39), a, d, 0.6, 0.05 if hard else 0.4, 1.8, 1)
                self.play("celli", nearest(c["r"], 36, 47), a, d, 0.6, 0.05 if hard else 0.3, 1.8, 0)
                self.play("celli", nearest(c["5"], 43, 55), a, d, 0.55, 0.2, 1.8, -2)
                self.play("violas", nearest(c["3"], 55, 66), a, d, 0.55, 0.25, 1.8, -1)
                self.play("violins", nearest(c["5"], 67, 79), a, d, 0.6, 0.3, 2.0, 0, cath=0.15)
                self.play("violins", nearest(c["3"], 76, 88), a + 0.1, d, 0.55, 0.5, 2.0, -2, cath=0.18)
                self.play("horns", nearest(c["r"], 53, 64), a, d, 0.55, 0.35, 1.8, 0)
                self.play("horns", nearest(c["3"], 57, 68), a + 0.05, d, 0.5, 0.4, 1.8, -2)
                self.play("horns", nearest(c["5"], 60, 72), a + 0.1, d, 0.5, 0.45, 1.8, -2)
                self.play("trombones", nearest(c["r"], 40, 51), a, d, 0.45, 0.3, 1.8, -2)
                self.play("tuba", nearest(c["r"], 29, 40), a, d, 0.45, 0.3, 1.8, -3)
                self.play("glass", nearest(c["5"], 76, 88), a + 0.3, d, 0.35, 1.2, 2.0, -4, cath=0.4)
                if first:
                    self.play("bells", nearest(c["r"], 60, 71), a, None, 0.8, 0, 0, 0, cath=0.6)
                    self.harp_sweep(a, c, up=True, gain_db=-3)
                    self.play("glock", nearest(c["3"], 84, 96), a + 0.05, None, 0.6, 0, 0, -2, cath=0.4)
                # piano: a high, slow line over the chord
                line = [nearest(c["5"], 72, 84), nearest(c["3"], 76, 88), nearest(c["r"], 79, 91), nearest(c["9"], 79, 91)]
                k = 0
                while a + 0.8 + k * beat < b - 0.2:
                    self.play("piano", line[k % 4], a + 0.8 + k * beat, 2.6, 0.6, 0, 2.0, -1, cath=0.3)
                    k += 1

    def end_sections(self):
        self.choke_at = None
        self.sec = None

    def heartbeat(self, a, b, every, vel):
        t = a
        while t < b - 0.1:
            self.play("bdrum", None, t, None, vel, 0, 0, -4, match="hit")
            # a felt sub under the drum: the beat you feel more than hear
            f1 = 440 * 2 ** ((nearest(self.pcs_at(t)["r"], 28, 39) - 69) / 12)
            place(self.front["music"], st(sine_drop(0.35, f1 * 1.5, f1, 10)), int(t * SR), 0.22 * vel)
            t2 = t + 0.27
            if t2 < b:
                self.play("bdrum", None, t2, None, vel * 0.6, 0, 0, -9, match="hit")
            t += every

    def harp_sweep(self, t, c, up=True, gain_db=-3, notes=9, gap=0.045):
        pcs = [c["r"], c["9"], c["3"], c["5"]]
        seq = []
        m = nearest(c["r"], 50, 61)
        while len(seq) < notes:
            if m % 12 in pcs:
                seq.append(m)
            m += 1
        if not up:
            seq = seq[::-1]
        for i, m in enumerate(seq):
            self.play("harp", m, t + i * gap, None, 0.55, 0, 0, gain_db - (0 if i < notes - 1 else -2), cath=0.2)

    # ------------------------------------------------------------- sound design
    def impact(self, t, size=1.0, low_stab=True, bus="sfx"):
        """the cinematic hit: bass drum + timpani + gong wash + a sub drop + low string/brass stab"""
        c = self.pcs_at(t)
        self.play("bdrum", None, t, None, min(1, 0.75 * size + 0.2), 0, 0, 1, bus=bus, match="hit")
        self.play("timpani", None, t, None, min(1, 0.7 * size + 0.3), 0, 0, 0, bus=bus)
        self.play("gong", None, t + 0.01, None, 0.55 * size, 0, 0, -4, bus=bus)
        self.play("cym_hit", None, t, None, 0.35 * size, 0, 0, -4, bus=bus)
        f1 = 440 * 2 ** ((nearest(c["r"], 28, 39) - 69) / 12)
        sub = sine_drop(2.0, f1 * 2, f1, 1.7) * 0.55 * size
        place(self.front[bus], st(sub), int(t * SR))
        if low_stab:
            r = nearest(c["r"], 28, 39)
            self.play("basses", r, t, 0.35, 0.95, 0, 1.4, 1, bus=bus)
            self.play("celli", r + 12, t, 0.35, 0.9, 0, 1.3, -1, bus=bus)
            self.play("trombones", nearest(c["r"], 40, 51), t, 0.4, 0.9, 0, 1.2, -2, bus=bus)
            self.play("tuba", r + 12 if r + 12 <= 40 else r, t, 0.4, 0.9, 0, 1.2, -3, bus=bus)

    def braam(self, t, dur=1.4, bus="sfx"):
        """low brass + basses fortissimo with a slow fall-off: the deep opening statement"""
        c = self.pcs_at(t)
        r = nearest(c["r"], 28, 39)
        self.play("trombones", nearest(c["r"], 40, 51), t, dur, 1.0, 0.02, 1.6, 0, bus=bus)
        self.play("trombones", nearest(c["5"], 45, 56), t, dur, 0.9, 0.02, 1.6, -4, bus=bus)
        self.play("tuba", r if r >= 29 else r + 12, t, dur, 1.0, 0.02, 1.6, -1, bus=bus)
        self.play("basses", r, t, dur, 1.0, 0.02, 1.6, 1, bus=bus)
        self.play("celli", r + 12, t, dur, 0.9, 0.02, 1.4, -2, bus=bus)
        self.play("horns", nearest(c["r"], 50, 62), t + 0.03, dur, 0.85, 0.05, 1.5, -3, bus=bus)

    def reversed_cymbal(self, end_t, length=1.2, gain=1.0, bus="sfx"):
        p = self.patch("cym_hit")
        x = p.note(None, None, 0.9)
        x = mono(x) * self.norms["cym_hit"] * 3.0
        y = space.stage("cymbals", x, spot=0.6)
        y = y[::-1].copy()
        n = int(length * SR)
        y = y[-n:]
        y = fade(y, int(0.25 * n), int(0.004 * SR), 1.5)
        place(self.front[bus], y * gain, int(end_t * SR) - len(y))

    def drop(self, t):
        self.reversed_cymbal(t + 0.02, 1.3, 0.8)
        self.impact(t, 1.0)
        c = self.pcs_at(t + 0.05)
        self.play("bells", nearest(c["r"], 60, 71), t, None, 0.95, 0, 0, -1, bus="sfx", cath=0.8)
        self.play("bells", nearest(c["r"], 48, 59), t + 0.01, None, 0.7, 0, 0, -6, bus="sfx", cath=0.6)

    def slam(self, t, size=0.75):
        self.play("timpani", None, t, None, 0.8 * size + 0.2, 0, 0, -1, bus="sfx")
        self.play("bdrum", None, t, None, 0.7 * size, 0, 0, -3, bus="sfx", match="hit")
        c = self.pcs_at(t)
        r = nearest(c["r"], 28, 39)
        self.play("basses", r, t, 0.22, 0.85, 0, 0.9, -1, bus="sfx")
        self.play("celli", r + 12, t, 0.22, 0.8, 0, 0.9, -3, bus="sfx")
        f1 = 440 * 2 ** ((nearest(c["r"], 28, 39) - 69) / 12)
        place(self.front["sfx"], st(sine_drop(0.8, f1 * 1.8, f1, 5)) * 0.3 * size, int(t * SR))

    def whoosh(self, t, dur=0.36):
        # a short reversed cymbal into the snap + an air sweep across the stereo field
        self.reversed_cymbal(t + 0.03, dur + 0.1, 0.45)
        n = int(dur * SR)
        noise = self.rng.standard_normal(n).astype(np.float32)
        out = np.zeros(n, np.float32)
        seg = 512
        for i in range(0, n, seg):
            fc = 400 * (10 ** (i / n))
            blk = filt(sos_bp(fc * 0.6, fc * 1.7), noise[max(0, i - 2048) : i + seg])
            out[i : i + seg] = blk[-min(seg, n - i) :]
        e = np.sin(np.pi * np.arange(n) / n) ** 1.8
        x = out * e * 0.5
        lr = np.linspace(-0.6, 0.6, n)
        y = np.stack([x * np.cos((lr + 1) * np.pi / 4), x * np.sin((lr + 1) * np.pi / 4)], axis=1)
        place(self.front["sfx"], y, int((t - dur * 0.75) * SR))

    def riser(self, end_t, dur=1.2):
        p = self.patch("cym_cresc")
        # the shortest crescendo recording that covers dur; its peak lands on end_t
        best = None
        for e in p.files:
            x = load(e["file"])
            env = np.abs(mono(x))
            pk = int(np.argmax(filt(sos_lp(20, 1), env)))
            if pk >= dur * SR * 0.9 and (best is None or pk < best[1]):
                best = (e, pk)
        if best is None:
            best = (max(p.files, key=lambda e: len(load(e["file"]))), None)
        x = mono(load(best[0]["file"]))
        pk = best[1] or len(x)
        seg = x[max(0, pk - int(dur * SR)) : pk]
        seg = fade(seg, int(0.15 * len(seg)), int(0.01 * SR))
        self.put("cymbals", seg, int(end_t * SR) - len(seg), self.norms["cym_cresc"] * 1.2, "sfx", cath=0.15)
        # timpani roll and violin tremolo swelling into the hit
        c = self.pcs_at(end_t - 0.1)
        roll = self.patch("timp_roll").note(None, dur, 0.8, dur * 0.9, 0.05)
        self.put("timpani", roll, int((end_t - dur) * SR), self.norms["timp_roll"] * 0.9, "sfx")
        v = self.patch("violins_trem").note(nearest(c["5"], 72, 84), dur, 0.8, dur * 0.95, 0.05)
        self.put("violins", v, int((end_t - dur) * SR), self.norms["violins_trem"] * 0.8, "sfx")

    def shimmer(self, t):
        c = self.pcs_at(t + 0.1)
        mk = self.patch("marktree").note(None, None, 0.7, match="asc")
        self.put("glock", mk[: int(2.2 * SR)], int(t * SR), self.norms["marktree"], "sfx", cath=0.4)
        for i, k in enumerate(("r", "3", "5", "9")):
            self.play("glock", nearest(c[k], 84, 98), t + 0.06 * i, None, 0.45, 0, 0, -4, bus="sfx", cath=0.4)
        self.harp_sweep(t, c, True, -6, notes=7, gap=0.04)

    def pop(self, t):
        c = self.pcs_at(t)
        self.play("harp", nearest(c["5"], 72, 83), t, None, 0.8, 0, 0, -1, bus="sfx", cath=0.15)
        self.play("glock", nearest(c["5"], 84, 96), t, None, 0.4, 0, 0, -6, bus="sfx", cath=0.2)

    # ------------------------------------------------------------- render
    def render(self, wet=1.0):
        """stage every seat in the hall; returns (music, sfx, stems) as stereo arrays"""
        out = {"music": np.zeros((self.n, 2), np.float32), "sfx": np.zeros((self.n, 2), np.float32)}
        stems = {}
        for (bus, seat), dry in self.tracks.items():
            if not np.any(dry):
                continue
            y = space.stage(seat, dry, spot=0.4 if seat in ("piano", "harp", "glock") else 0.3, wet=wet)[: self.n]
            out[bus][: len(y)] += y
            stems[f"{bus}_{seat}"] = y
        for bus in out:
            for (b_, sec), send in self.cath.items():
                if b_ != bus or not np.any(send):
                    continue
                cw = space.cathedral(send, 1.0)[: self.n]
                end = self.cath_end.get(sec)
                if end is not None:
                    a = int(end * SR)
                    f = int(0.9 * SR)
                    env = np.ones(len(cw), np.float32)
                    env[a : a + f] = np.exp(-np.linspace(0, 5, max(0, min(f, len(cw) - a))))
                    env[a + f :] = 0
                    cw = cw * env[:, None]
                out[bus][: len(cw)] += cw
            out[bus] += self.front[bus]
            out[bus] = filt(sos_hp(24, 2), out[bus])
        return out["music"], out["sfx"], stems
