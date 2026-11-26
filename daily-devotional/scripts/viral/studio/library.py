"""The instrument library: real recorded instruments (CC0, Versilian Studios).

A patch is a folder of single-note recordings. The index (built once, cached in
studio/samples/index.json) knows each file's MIDI root (from its name, with the
octave checked against the measured pitch), its dynamic layer and round-robin.
`Patch.note()` plays any pitch at any length: nearest recording, resampled to the
pitch, extended with a crossfade loop if the note is longer than the recording.
"""
import json
import re
from functools import lru_cache
from pathlib import Path

import numpy as np
import soundfile as sf
import soxr

from .dsp import SR

ROOT = Path(__file__).resolve().parents[3] / "studio" / "samples"
INDEX = ROOT / "index.json"
CACHE = ROOT / ".cache"

NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
DYN = {"pppp": 0, "ppp": 1, "pp": 2, "p": 3, "mp": 4, "mp-mf": 4.5, "mf": 5, "f": 6, "ff": 7, "fff": 8}

# patch → (glob(s) under studio/samples, pitched?)
PATCHES = {
    # strings (sections, sustained with vibrato), tremolo, spiccato
    "violins": (["vsco2/Strings/Violin Section/susVib/*.wav"], True),
    "violins_trem": (["vsco2/Strings/Violin Section/Trem/*.wav"], True),
    "violas": (["vsco2/Strings/Viola Section/susvib/*.wav"], True),
    "celli": (["vsco2/Strings/Cello Section/susvib/*.wav"], True),
    "celli_trem": (["vsco2/Strings/Cello Section/trem/*.wav"], True),
    "celli_spic": (["vsco2/Strings/Cello Section/spic/*.wav"], True),
    "basses": (["vsco2/Strings/Solo Contrabass/SusVib/*.wav"], True),
    # brass
    "horns": (["vsco2/Brass/F Horn/sus/*.wav"], True),
    "trombones": (["vsco2/Brass/Tenor Trombone/sus/*.wav"], True),
    "tuba": (["vsco2/Brass/Tuba/sus/*.wav"], True),
    # keys, plucked, mallets, glass
    "piano": (["vcsl/Chordophones/Zithers/Grand Piano, Kawai/Sustains/*.wav"], True),
    "harp": (["vsco2/Strings/Harp/*.wav"], True),
    "bells": (["vcsl/Idiophones/Struck Idiophones/Tubular Bells 1/*.wav"], True),
    "glock": (["vcsl/Idiophones/Struck Idiophones/Glockenspiel/*.wav"], True),
    "chimes": (["vcsl/Idiophones/Struck Idiophones/Hand Chimes/*.wav"], True),
    "glass": (["vcsl/Idiophones/Friction Idiophones/Wine Glasses/Sustains/Slow/*.wav"], True),
    # percussion (one-shots, unpitched for our purposes)
    "timpani": (["vsco2/Percussion/Timpani/Timpani*_Hit_*.wav"], False),
    "timp_roll": (["vsco2/Percussion/Timpani/Rolls/*.wav"], False),
    "bdrum": (["vcsl/Membranophones/Struck Membranophones/Bass Drum 2/bassdrum_hit_*.wav", "vsco2/VSCO 1 Percussion/drums/bass/bdrum_f*.wav", "vsco2/VSCO 1 Percussion/drums/bass/bdrum_mp*.wav"], False),
    "bdrum_roll": (["vcsl/Membranophones/Struck Membranophones/Bass Drum 2/bassdrum_cresc_*.wav", "vcsl/Membranophones/Struck Membranophones/Bass Drum 2/bassdrum_roll_f*.wav"], False),
    "gong": (["vsco2/VSCO 1 Percussion/varMetal/Gong/gong_hit_*.wav", "vcsl/Idiophones/Struck Idiophones/Gong 1/gong_*.wav"], False),
    "cym_cresc": (["vcsl/Idiophones/Struck Idiophones/Suspended Cymbal 1/susCymb1_cresc_*.wav", "vsco2/Percussion/susCymb1-cresc*.wav", "vsco2/VSCO 1 Percussion/varMetal/Cymbals/susp/*cresc*.wav"], False),
    "cym_hit": (["vcsl/Idiophones/Struck Idiophones/Suspended Cymbal 1/susCymb1_hit_[fmp]*.wav", "vsco2/Percussion/cymbal-crash1*.wav"], False),
    "marktree": (["vcsl/Idiophones/Struck Idiophones/Mark Trees/Legacy/*.wav"], False),
    "belltree": (["vsco2/Percussion/BellTree*.wav"], False),
}

NOTE_RE = re.compile(r"(?:^|[_\-\s])([A-G])(#|b)?(-?\d)(?=[_\-.\s]|$)")


def _parse(name):
    stem = Path(name).stem
    m = NOTE_RE.search(stem)
    midi = None
    if m:
        pc = NAMES[m.group(1)] + (1 if m.group(2) == "#" else -1 if m.group(2) == "b" else 0)
        midi = 12 * (int(m.group(3)) + 1) + pc
    v = re.search(r"_v(\d)", stem)
    if v:
        layer = float(v.group(1))
    else:
        toks = [re.sub(r"\d+$", "", t) for t in re.split(r"[_\-\s]", stem.lower())]
        found = [DYN[t] for t in toks if t in DYN]
        layer = float(found[-1]) if found else 5.0
    rr = re.search(r"_rr(\d)|_(\d)$", stem)
    return midi, layer, rr.group(0) if rr else ""


def _detect_f0(x):
    """median pitch (Hz) of a held note, or None"""
    import librosa

    seg = x[int(0.25 * SR) : int(1.6 * SR)]
    if len(seg) < SR // 4:
        seg = x
    try:
        f0 = librosa.yin(seg.astype(np.float32), fmin=26, fmax=2200, sr=SR, frame_length=8192)
    except Exception:  # noqa: BLE001
        return None
    f0 = f0[np.isfinite(f0)]
    return float(np.median(f0)) if len(f0) else None


def _read(path):
    """float32 mono-or-stereo at 48 kHz, cached as .npy"""
    CACHE.mkdir(parents=True, exist_ok=True)
    key = CACHE / (re.sub(r"[^A-Za-z0-9]+", "_", str(path.relative_to(ROOT)))[-150:] + ".npy")
    if key.exists():
        return np.load(key)
    x, sr = sf.read(path, dtype="float32", always_2d=True)
    if sr != SR:
        x = soxr.resample(x, sr, SR).astype(np.float32)
    if x.shape[1] > 2:
        x = x[:, :2]
    if x.shape[1] == 1:
        x = np.repeat(x, 2, axis=1)
    np.save(key, x)
    return x


def build_index(force=False):
    if INDEX.exists() and not force:
        return json.loads(INDEX.read_text(encoding="utf-8"))
    idx = {}
    for name, (globs, pitched) in PATCHES.items():
        files = sorted({p for g in globs for p in ROOT.glob(g)})
        entries = []
        offsets = []
        for p in files:
            midi, layer, rr = _parse(p.name)
            e = {"file": str(p.relative_to(ROOT)).replace("\\", "/"), "midi": midi, "layer": layer, "rr": rr}
            if pitched and midi is not None and len(offsets) < 10 and name not in ("bells", "glock", "chimes"):
                x = _read(p).mean(axis=1)
                f0 = _detect_f0(x)
                if f0:
                    measured = 69 + 12 * np.log2(f0 / 440)
                    offsets.append(round((measured - midi) / 12) * 12)
            entries.append(e)
        off = int(np.median(offsets)) if offsets else 12  # Versilian names middle C "C3"
        if pitched:
            for e in entries:
                if e["midi"] is not None:
                    e["midi"] += off
        idx[name] = {"pitched": pitched, "octaveFix": off, "files": entries}
        print(f"  {name:13s} {len(entries):3d} files  octave fix {off:+d}")
    INDEX.write_text(json.dumps(idx, indent=1), encoding="utf-8")
    return idx


_INDEX = None


def index():
    global _INDEX
    if _INDEX is None:
        _INDEX = build_index()
    return _INDEX


@lru_cache(maxsize=512)
def load(rel):
    x = _read(ROOT / rel)
    # trim leading silence (some recordings start with room noise before the onset)
    env = np.max(np.abs(x), axis=1)
    pk = env.max() + 1e-9
    on = int(np.argmax(env > pk * 0.02))
    return x[max(0, on - int(0.004 * SR)) :]


def extend(x, n, xf=0.35):
    """make x at least n samples long with equal-power crossfade loops of its body"""
    if len(x) >= n:
        return x[:n]
    L = len(x)
    a = int(L * 0.35)
    b = L - int(0.4 * SR)
    f = int(xf * SR)
    if b - a < f * 2.5:
        return np.pad(x, ((0, n - L), (0, 0)))
    out = x[:b].copy()
    t = np.linspace(0, np.pi / 2, f)[:, None]
    while len(out) < n:
        seg = x[a:b]
        head = out[-f:] * np.cos(t) + seg[:f] * np.sin(t)
        out = np.concatenate([out[:-f], head, seg[f:]])
    return out[:n]


class Patch:
    def __init__(self, name, seed=0):
        info = index()[name]
        self.name = name
        self.pitched = info["pitched"]
        self.files = info["files"]
        if not self.files:
            raise FileNotFoundError(f"patch {name}: no samples (run fetch_samples.py)")
        self.layers = sorted({e["layer"] for e in self.files})
        self.rng = np.random.default_rng(seed)

    def pick(self, midi=None, vel=0.7, match=None):
        cands = self.files
        if match:
            cands = [e for e in cands if match in e["file"]] or cands
        # dynamic layer nearest the velocity
        layers = sorted({e["layer"] for e in cands})
        want = layers[min(len(layers) - 1, int(round(vel * (len(layers) - 1))))]
        cands = [e for e in cands if e["layer"] == want] or cands
        if self.pitched and midi is not None:
            best = min(abs(e["midi"] - midi) for e in cands if e["midi"] is not None)
            cands = [e for e in cands if e["midi"] is not None and abs(e["midi"] - midi) == best]
        return cands[self.rng.integers(len(cands))]

    def note(self, midi=None, dur=None, vel=0.7, attack=0.0, release=0.35, match=None, gain=1.0):
        """one note as a stereo array (n,2). dur=None plays the whole recording."""
        e = self.pick(midi, vel, match)
        x = load(e["file"])
        if self.pitched and midi is not None and e["midi"] is not None and midi != e["midi"]:
            ratio = 2 ** ((midi - e["midi"]) / 12)
            x = soxr.resample(x, SR * ratio, SR).astype(np.float32)
        if dur is not None:
            n = int((dur + release) * SR)
            x = extend(x, n)
            r = int(release * SR)
            if r > 0 and len(x) > r:
                e_ = np.exp(-np.linspace(0, 5, r)).astype(np.float32)[:, None]
                x = x.copy()
                x[-r:] *= e_
        else:
            x = x.copy()
        if attack > 0:
            a = min(len(x), int(attack * SR))
            x[:a] *= (np.linspace(0, 1, a) ** 1.6)[:, None]
        return (x * gain).astype(np.float32)
