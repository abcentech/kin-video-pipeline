"""The band: a list of note events played by the studio's sampled instruments
(scripts/viral/studio: VSCO-2-CE / VCSL, CC0) and staged in its simulated hall.

Events are rendered in windows of WINDOW seconds so a seven-minute bed never holds more
than about a minute of dry tracks in memory. Convolution is linear, so windowing by note
onset is exact as long as every window keeps room for its notes' tails (it does).

The grand piano is played as a FELT piano: soft dynamic layer, a low-pass on its seat
(the hammers wrapped in felt) before it goes into the hall.
"""
import math
from functools import lru_cache

import numpy as np
import soxr

from common import SR, place
from studio import library as LIB
from studio import space
from studio.dsp import filt, sos_hp, sos_lp, shelf
from studio.orchestra import Score


# ---- a faster Patch.note (same output as studio/library.py): resample only the part of the
# recording the note will use, and remember it — a bed asks for the same notes again and again.
@lru_cache(maxsize=128)
def _pitched(file, src_midi, midi, n_sec):
    x = LIB.load(file)
    ratio = 2 ** ((midi - src_midi) / 12) if src_midi is not None else 1.0
    x = x[: int(n_sec * SR * ratio) + 4096]
    if ratio != 1.0:
        x = soxr.resample(x, SR * ratio, SR).astype(np.float32)
    return x


def _fast_note(self, midi=None, dur=None, vel=0.7, attack=0.0, release=0.35, match=None, gain=1.0):
    e = self.pick(midi, vel, match)
    shift = self.pitched and midi is not None and e["midi"] is not None and midi != e["midi"]
    n_sec = math.ceil(dur + release) + 1 if dur is not None else 40
    x = _pitched(e["file"], e["midi"] if shift else None, midi if shift else None, n_sec)
    if dur is not None:
        n = int((dur + release) * SR)
        x = LIB.extend(x, n)
        r = int(release * SR)
        x = x.copy()
        if r > 0 and len(x) > r:
            x[-r:] *= np.exp(-np.linspace(0, 5, r)).astype(np.float32)[:, None]
    else:
        x = x.copy()
    if attack > 0:
        a = min(len(x), int(attack * SR))
        x[:a] *= (np.linspace(0, 1, a) ** 1.6)[:, None]
    return (x * gain).astype(np.float32)


LIB.Patch.note = _fast_note

WINDOW = 60.0
FELT_LP = 2400.0
WET = 0.85
SPOT = {"piano": 0.5, "harp": 0.45, "glock": 0.35}


class Note:
    __slots__ = ("t", "inst", "midi", "dur", "vel", "att", "rel", "db")

    def __init__(self, t, inst, midi, dur, vel=0.4, att=0.0, rel=0.8, db=0.0):
        self.t, self.inst, self.midi, self.dur, self.vel, self.att, self.rel, self.db = t, inst, midi, dur, vel, att, rel, db

    @property
    def end(self):
        return self.t + (self.dur if self.dur is not None else 6.0) + self.rel


class Band:
    def __init__(self, seed, tune=None):
        # one Score for the whole piece: its patches (and their round-robin generators) persist
        self.s = Score("D", int(4 * SR), seed=seed)
        self.s.choke_at = None
        self.tune = tune  # e.g. "I": drums (bdrum, timpani) are tuned to that chord's root

    def _reset(self, n):
        s = self.s
        s.n = n
        s.tracks = {}
        s.cath = {}
        s.cath_end = {}
        s.chord_at = [(0.0, 1e9, s.chord_pcs(self.tune))] if self.tune else []
        s.choke_at = None
        s.front = {"music": np.zeros((n, 2), np.float32), "sfx": np.zeros((n, 2), np.float32)}

    def _stage(self, n):
        out = np.zeros((n, 2), np.float32)
        for (_bus, seat), dry in self.s.tracks.items():
            if not np.any(dry):
                continue
            if seat == "piano":
                dry = filt(sos_lp(FELT_LP, 2), dry)
                dry = filt(shelf(1200, -2.0), dry)
            y = space.stage(seat, dry, spot=SPOT.get(seat, 0.3), wet=WET)
            m = min(n, len(y))
            out[:m] += y[:m]
        out += self.s.front["music"] + self.s.front["sfx"]
        return out

    def render(self, notes, t0, t1):
        """stereo covering [t0, t1) seconds (notes outside are dropped; tails past t1 are cut)"""
        n_total = max(1, int(round((t1 - t0) * SR)))
        out = np.zeros((n_total, 2), np.float32)
        notes = sorted([x for x in notes if t0 <= x.t < t1], key=lambda x: (x.t, x.inst, x.midi or 0))
        i = 0
        w0 = t0
        while i < len(notes):
            batch = []
            while i < len(notes) and notes[i].t < w0 + WINDOW:
                batch.append(notes[i])
                i += 1
            if batch:
                end = max(x.end for x in batch)
                n = int((min(end, t1) - w0 + 4.2) * SR)
                self._reset(n)
                for x in batch:
                    self.s.play(x.inst, x.midi, x.t - w0, x.dur, x.vel, x.att, x.rel, x.db)
                place(out, self._stage(n), int(round((w0 - t0) * SR)))
            w0 += WINDOW
        return out


def tidy_bus(x):
    """the whole music bus: rumble out, and nothing harsh above ~6 kHz (warm, under a voice)"""
    x = filt(sos_hp(32, 2), x)
    x = filt(sos_lp(6200, 2), x)
    return filt(shelf(4500, -3.0), x)
