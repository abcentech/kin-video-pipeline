"""Audition exports for the lead: out/december/dev/sound/

  theme_full.wav        the Father's theme, full statement (pickup + 4 bars + ring), -16 LUFS
  mood_<name>.wav       20 s of each MusicSection mood, each normalised to -20 LUFS so the
                        content can be heard (in the mix they sit at their own levels)
  sfx_<type>.wav        every SoundCue type at its MIX level (as heard in a -14 LUFS master
                        whose voice sits at -14): hits 1/2/3, ticks + tickStop, swell into a
                        hit, the silence duck demonstrated on a bed
"""
import numpy as np

import compose as C
import sfx as SFX
from band import Band, tidy_bus
from common import DEV, SR, lufs, place, seed_of, tp_limit, write_wav, edge_fades

VOICE_IN_MASTER = -14.0


def norm(x, target):
    L = lufs(x)
    if L > -69:
        x = x * 10 ** ((target - L) / 20)
    return edge_fades(tp_limit(x.astype(np.float32), -1.6), 5)


def main():
    DEV.mkdir(parents=True, exist_ok=True)
    band = Band(seed_of("dev"))
    # ---- the theme
    t_down = 0.9
    y = tidy_bus(band.render(C.theme_notes("full", t_down, t_cut=14.5, t_pick=0.45), 0.0, 17.0))
    write_wav(DEV / "theme_full.wav", norm(y, -16.0))
    for form in ("head", "motif"):
        y = tidy_bus(band.render(C.theme_notes(form, t_down, t_cut=t_down + C.THEME[form]["end"] * C.BEAT + 0.5, t_pick=0.45), 0.0, 10.0))
        write_wav(DEV / f"theme_{form}.wav", norm(y, -16.0))
    print("theme -> theme_full.wav (+ theme_head.wav, theme_motif.wav)")
    # ---- moods, 20 s each
    D = 20.0
    rng = lambda k: np.random.default_rng(seed_of("dev", k))  # noqa: E731
    moods = {
        "cold": C.cold(rng("cold"), 0.2, D - 0.5, hard_end=True)[0],
        "theme": C.theme_notes("full", 1.6, t_cut=D - 0.5, t_pick=1.15) + C.theme_pad(0.2, 1.5),
        "teach": C.teach(rng("teach"), 0.3, D - 0.6, "D", 1.2, D - 0.8, chapters=(12.0,))[0],
        "word": C.word(rng("word"), 0.3, D - 0.6, 1.2, D - 0.8)[0],
        "story": C.story(rng("story"), 0.3, D - 0.6, D - 0.8)[0],
        "pray": C.pray(rng("pray"), 0.3, D - 0.6, 2.4, D - 0.8)[0],
        "lift": C.lift(rng("lift"), 0.3, D - 0.6, 9.0, D - 0.8)[0],
        "out": C.teach(rng("out"), 0.3, 6.0, "D", 1.2, 5.8)[0],
    }
    for name, notes in moods.items():
        y = tidy_bus(band.render(notes, 0.0, D))
        if name == "out":
            # the bed for 6 s, then nothing: what 'out' does is let the last chord go
            L = lufs(y[: 6 * SR])
            y = y * 10 ** ((-20.0 - L) / 20)
            y = edge_fades(tp_limit(y.astype(np.float32), -1.6), 5)
        else:
            y = norm(y, -20.0)
        write_wav(DEV / f"mood_{name}.wav", y)
        print(f"mood_{name}.wav  ({len(notes)} notes)")
    # ---- sfx at mix level
    def lay(items, length):
        out = np.zeros((int(length * SR), 2), np.float32)
        for t, kind, kw in items:
            x, l, L = SFX.make(kind, **kw)
            place(out, x, int(t * SR), 10 ** ((VOICE_IN_MASTER + L - l) / 20))
        return edge_fades(out, 5)

    sets = {
        "tick": ([(0.3 + i, "tick", {"index": i}) for i in range(6)] + [(6.3, "tickStop", {})], 7.6),
        "tickStop": ([(0.3, "tickStop", {})], 1.4),
        "door": ([(0.3, "door", {})], 2.6),
        "doorClose": ([(0.3, "doorClose", {})], 1.4),
        "paper": ([(0.3, "paper", {})], 1.4),
        "hit": ([(0.3, "hit", {"weight": 1}), (3.3, "hit", {"weight": 2}), (6.3, "hit", {"weight": 3})], 10.5),
        "hit1": ([(0.3, "hit", {"weight": 1})], 4.0),
        "hit2": ([(0.3, "hit", {"weight": 2})], 4.5),
        "hit3": ([(0.3, "hit", {"weight": 3})], 5.0),
        "drum": ([(0.3, "drum", {})], 4.5),
        "click": ([(0.3, "click", {})], 0.9),
        "bell": ([(0.3, "bell", {})], 3.0),
        "swell": ([(0.3, "swell", {"dur_s": 1.5}), (1.8, "hit", {"weight": 2})], 5.5),
    }
    for name, (items, length) in sets.items():
        write_wav(DEV / f"sfx_{name}.wav", lay(items, length))
    # silence: a teach bed, ducked to nothing for 3 s, then back
    y = tidy_bus(band.render(C.teach(rng("sil"), 0.2, 12.0, "G", 1.0, 11.6)[0], 0.0, 12.0))
    y = y * 10 ** ((-34.0 - lufs(y)) / 20)
    g = np.ones(len(y), np.float32)
    a, b = int(5.0 * SR), int(8.0 * SR)
    f = int(0.24 * SR)
    g[a - f // 2 : a + f // 2] = np.linspace(1, 0, f)
    g[a + f // 2 : b] = 0
    g[b : b + f] = np.linspace(0, 1, f)
    write_wav(DEV / "sfx_silence.wav", edge_fades((y * g[:, None]).astype(np.float32), 5))
    print("sfx_*.wav written (mix level; silence = a bed muted 5.0-8.0 s)")
