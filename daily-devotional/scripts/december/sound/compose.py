"""THE FATHER'S THEME and its moods — the notes.

Key D major, 66 bpm, 3/4 (a lullaby's rocking; one bar = 2.727 s, four bars = 10.9 s).

    pickup | bar 1 (D)      | bar 2 (Bm)     | bar 3 (G .. A) | bar 4 (D)
    A3 ->  | F#4 ----  E4   | D4   E4   F#4  | G4   B4   A4   | F#4 --------
           ^ the door: a rising major sixth (A3 -> F#4), the interval of a door swinging open

Felt piano sings the melody with a soft left hand (root, fifth, tenth); a strings pad
(celli / violas / violins) holds the harmony; a low harp — plucked short, like a kalimba —
answers: it echoes the door interval an octave down in bar 1 and closes the phrase in bar 4.

Forms (the theme never restarts mid-phrase; the form is chosen by the room the plan gives):
  full   pickup + 4 bars (needs ~10 s)                      end card / recap
  head   pickup + bar 1 + an open arrival (D4 over G)       episode title sting (5.5 s)
  motif  pickup + F#4 held over D                           trailer title / end, shorts end

Moods (MusicSection.mood): cold · theme · teach · word · story · pray · lift · out.
All randomness is seeded from the plan (day, piece, section start): same plan -> same notes.
"""
import numpy as np

from band import Note

BPM = 66
BEAT = 60.0 / BPM
BAR = 3 * BEAT

CH = {"D": (2, (0, 4, 7)), "Bm": (11, (0, 3, 7)), "G": (7, (0, 4, 7)), "A": (9, (0, 4, 7)), "Em": (4, (0, 3, 7)),
      "F#m": (6, (0, 3, 7)), "Asus": (9, (0, 5, 7))}


def pcs(name):
    r, iv = CH[name]
    return [(r + i) % 12 for i in iv]


def root(name):
    return CH[name][0]


def near(pc, lo, hi):
    for m in range(lo, hi + 1):
        if m % 12 == pc % 12:
            return m
    return lo


# ------------------------------------------------------------------ the theme (beats from bar 1's downbeat)
THEME = {
    "full": {
        "mel": [(-0.5, 57, 0.5), (0, 66, 2), (2, 64, 1), (3, 62, 1), (4, 64, 1), (5, 66, 1), (6, 67, 1), (7, 71, 1), (8, 69, 1), (9, 66, 3)],
        "harm": [(0, "D"), (3, "Bm"), (6, "G"), (8, "A"), (9, "D")],
        "lh": [(0, 38), (1, 45), (2, 54), (3, 47), (4, 54), (5, 50), (6, 43), (7, 50), (8, 45), (9, 38), (10, 45)],
        "harp": [(1.0, 45), (1.5, 54), (10.0, 50), (11.0, 57), (12.0, 62)],
        "end": 12.0,
        "arrive": 9.0,
    },
    "head": {
        "mel": [(-0.5, 57, 0.5), (0, 66, 2), (2, 64, 1), (3, 62, 3.5)],
        "harm": [(0, "D"), (3, "G")],
        "lh": [(0, 38), (1, 45), (2, 54), (3, 43), (4, 50)],
        "harp": [(1.0, 45), (1.5, 54), (4.0, 43), (4.5, 50)],
        "end": 6.5,
        "arrive": 3.0,
    },
    "motif": {
        "mel": [(-0.5, 57, 0.5), (0, 66, 3.0)],
        "harm": [(0, "D")],
        "lh": [(0, 38), (1, 45)],
        "harp": [(1.0, 45), (1.5, 54)],
        "end": 3.0,
        "arrive": 0.0,
    },
}
MEL_DB = 10.0  # the felt piano leads the pad by ~5 LU (measured: melody vs. strings)
LH_DB = 3.0
HARP_DB = 3.0
PICKUP = 0.5 * BEAT  # nominal; the plan's door->hit gap overrides it on stings


def theme_notes(form, t_down, t_cut=None, t_pick=None, full_strings=False, vel=1.0):
    """notes of one statement; bar 1's downbeat at t_down (s). t_pick moves the pickup (door).
    t_cut: everything is released by then (the section's end + crossfade)."""
    th = THEME[form]
    out = []
    tb = lambda b: t_down + b * BEAT  # noqa: E731
    end_t = tb(th["end"])
    stop = min(end_t + 1.5, t_cut) if t_cut is not None else end_t + 1.5
    # melody: felt piano, soft layer
    for b, m, d in th["mel"]:
        t = tb(b) if b >= 0 or t_pick is None else t_pick
        dd = d * BEAT * 1.05 if b >= 0 else max(0.25, t_down - t)
        if b == th["mel"][-1][0]:
            dd = max(dd, stop - t - 0.4)
        out.append(Note(t, "piano", m, max(0.2, min(dd, stop - t)), 0.46 * vel, 0.006, 1.6, MEL_DB))
    # left hand: root / fifth / tenth, softer
    for b, m in th["lh"]:
        t = tb(b)
        if t < stop - 0.2:
            out.append(Note(t, "piano", m, min(BEAT * 2.2, stop - t), 0.28 * vel, 0.01, 1.4, LH_DB))
    # strings pad on the harmony
    hs = th["harm"]
    for i, (b, name) in enumerate(hs):
        a = tb(b)
        z = tb(hs[i + 1][0]) if i + 1 < len(hs) else stop
        if a >= stop:
            break
        z = min(z + 0.15, stop)
        c = pcs(name)
        att = 0.9 if i == 0 else 0.35
        d = max(0.3, z - a)
        out.append(Note(a, "celli", near(root(name), 41, 52), d, 0.34 * vel, att, 1.5, -4.0))
        out.append(Note(a, "violas", near(c[1], 54, 65), d, 0.3 * vel, att + 0.1, 1.5, 1.0))
        out.append(Note(a, "violins", near(c[2], 64, 76), d, 0.28 * vel, att + 0.2, 1.6, -6.0))
        if full_strings:
            out.append(Note(a, "basses", near(root(name), 30, 41), d, 0.3 * vel, att, 1.6, -4.0))
            out.append(Note(a, "violins", near(c[1], 70, 81), d, 0.26 * vel, att + 0.3, 1.6, -7.0))
    # the low harp, plucked short (a kalimba's answer)
    for b, m in th["harp"]:
        t = tb(b)
        if t < stop - 0.3:
            out.append(Note(t, "harp", m, 0.9, 0.55 * vel, 0.0, 0.9, HARP_DB))
    return out


def theme_length(form):
    """seconds from bar 1's downbeat to the form's arrival + a ring worth hearing"""
    return THEME[form]["arrive"] * BEAT


# ------------------------------------------------------------------ moods
TRANS = {"D": ["G", "Bm", "A", "Em", "G"], "Bm": ["G", "Em", "A", "D"], "G": ["D", "A", "Em", "Bm", "D"],
         "A": ["D", "Bm", "G"], "Em": ["A", "G", "D"], "F#m": ["G", "Bm"], "Asus": ["D"]}


def chord_plan(rng, t0, t1, first, lo=7.0, hi=12.0):
    span = t1 - t0
    n = max(1, int(round(span / ((lo + hi) / 2))))
    lens = rng.uniform(0.8, 1.2, n)
    lens = lens / lens.sum() * span
    out = []
    c = first
    t = t0
    for k in range(n):
        out.append((t, t + lens[k], c))
        t += lens[k]
        c = TRANS[c][int(rng.integers(len(TRANS[c])))]
    return out


def teach(rng, t0, t1, first="D", soft_in=1.2, release_to=None, chapters=()):
    """the bed under teaching: slow pad chords from the theme's harmony, an occasional felt
    piano note, a rare low harp; thin chords and breaths leave air. Never loops."""
    notes = []
    end = release_to if release_to is not None else t1
    plan = chord_plan(rng, t0, t1, first)
    for k, (a, b, name) in enumerate(plan):
        c = pcs(name)
        breath = rng.random() < 0.16 and k > 0
        thin = breath or rng.random() < 0.22
        att = soft_in if k == 0 else 2.2
        a_ = a - (0.3 if k == 0 else 0.6)
        z = (b - 1.6) if breath else min(b + 0.35, end)
        d = max(0.5, z - a_)
        notes.append(Note(a_, "celli", near(root(name), 41, 52), d, 0.26, att, 2.8, -1.0))
        if thin:
            notes.append(Note(a_ + 1.4, "violas", near(c[2], 55, 64), max(0.5, d - 1.4), 0.24, 2.6, 2.8, -4.0))
        else:
            notes.append(Note(a_ + 0.4, "violas", near(c[1], 54, 65), max(0.5, d - 0.4), 0.26, att + 0.4, 2.8, -3.0))
            if rng.random() < 0.5:
                notes.append(Note(a_ + 1.0, "violins", near(c[2], 64, 74), max(0.5, d - 1.0), 0.22, att + 0.8, 3.0, -8.0))
        # felt piano: one quiet note now and then, sometimes a second that answers it
        if not breath and rng.random() < 0.6 and b - a > 4.0:
            tp = a + float(rng.uniform(1.2, min(3.6, b - a - 2.0)))
            m1 = near(c[int(rng.integers(3))], 62, 76)
            notes.append(Note(tp, "piano", m1, 3.2, float(rng.uniform(0.18, 0.28)), 0.01, 2.2, 6.0))
            if rng.random() < 0.3 and tp + 2.6 < b - 0.5:
                m2 = near(c[int(rng.integers(3))], 60, 74)
                notes.append(Note(tp + float(rng.uniform(1.6, 2.6)), "piano", m2, 3.0, 0.18, 0.01, 2.2, 4.0))
        if rng.random() < 0.14 and b - a > 3.0:
            notes.append(Note(a + float(rng.uniform(0.5, 2.0)), "harp", near(root(name), 43, 55), 1.0, 0.5, 0.0, 0.8, -6.0))
    # chapter fragments: the door interval, softly, on the numeral
    for tc in chapters:
        if t0 <= tc < t1 - 0.8:
            notes.append(Note(tc, "piano", 57, 0.7, 0.3, 0.005, 1.4, 5.0))
            notes.append(Note(tc + BEAT * 0.6, "piano", 66, 2.4, 0.32, 0.005, 2.0, 5.0))
    return notes, plan[-1][2]


def word(rng, t0, t1, soft_in=1.2, release_to=None):
    """scripture: the pad opens upward, bottom to top; a soft high D (a string harmonic + glass) over it"""
    notes = []
    end = release_to if release_to is not None else t1
    span = t1 - t0
    seq = ["G", "D", "Bm", "D", "G", "D"]
    n = max(1, int(round(span / (2.5 * BAR))))
    lens = np.full(n, span / n)
    t = t0
    for k in range(n):
        name = seq[k % len(seq)]
        c = pcs(name)
        a = t - (0.3 if k == 0 else 0.5)
        z = min(t + lens[k] + 0.4, end)
        d = max(0.5, z - a)
        att = soft_in if k == 0 else 1.6
        notes.append(Note(a, "celli", near(root(name), 41, 52), d, 0.28, att, 2.6, -1.0))
        notes.append(Note(a + (1.0 if k == 0 else 0.2), "violas", near(c[1], 54, 65), max(0.5, d - 0.6), 0.27, att + 0.5, 2.6, -3.0))
        notes.append(Note(a + (2.0 if k == 0 else 0.3), "violins", near(c[2], 64, 76), max(0.5, d - 1.0), 0.25, att + 1.0, 2.8, -5.0))
        t += lens[k]
    # the reverent halo: D6 high and soft, a common tone of every chord above
    hd = max(0.5, end - (t0 + 2.6))
    notes.append(Note(t0 + 2.6, "violins", 86, hd, 0.2, 2.4, 3.0, -9.0))
    notes.append(Note(t0 + 3.0, "glass", 86, hd, 0.3, 2.0, 3.0, -12.0))
    return notes, seq[(n - 1) % len(seq)]


def pray(rng, t0, t1, soft_in=2.4, release_to=None):
    """a single held warm pad (D), no melody; long sections re-bow it, staggered, so it never loops"""
    notes = []
    end = release_to if release_to is not None else t1
    voices = [("basses", 38, 0.24, -6.0), ("celli", 50, 0.3, -1.0), ("violas", 57, 0.28, -3.0), ("violas", 66, 0.24, -5.0)]
    for j, (inst, m, v, db) in enumerate(voices):
        a = t0 - 0.4 + j * 0.35
        seg = float(rng.uniform(15.0, 20.0))
        first = True
        while a < end - 0.5:
            z = min(a + seg, end)
            notes.append(Note(a, inst, m, max(0.5, z - a + (1.2 if z < end else 0.0)), v, soft_in if first else 3.0, 3.0, db))
            if z >= end:
                break
            a = z - 1.2
            first = False
    return notes, "D"


def lift(rng, t0, t1, arrive=None, release_to=None):
    """the declaration: the theme's rising sixth sung by the violins over IV -> V -> I,
    fuller strings, the arrival on the last word"""
    notes = []
    end = release_to if release_to is not None else t1
    arr = arrive if arrive is not None and t0 + 1.5 < arrive < t1 + 0.5 else max(t0 + 1.5, t1 - 1.0)
    vtime = max(t0 + 0.8, arr - BAR)
    prog = [(t0 - 0.3, vtime, "G"), (vtime, arr, "A"), (arr, end, "D")]
    for k, (a, b, name) in enumerate(prog):
        if b - a < 0.3:
            continue
        c = pcs(name)
        d = max(0.4, min(b + 0.3, end) - a)
        att = 0.9 if k == 0 else 0.35
        notes.append(Note(a, "basses", near(root(name), 30, 41), d, 0.34, att, 2.2, -3.0))
        notes.append(Note(a, "celli", near(root(name), 41, 52), d, 0.38, att, 2.2, 0.0))
        notes.append(Note(a, "violas", near(c[1], 54, 65), d, 0.36, att + 0.1, 2.2, -2.0))
        notes.append(Note(a, "violas", near(c[2], 57, 67), d, 0.32, att + 0.1, 2.2, -5.0))
    # the rising sixth, high strings + felt piano doubling: A4 -> F#5 ... E5 -> D5 on the arrival
    s0 = t0 + 0.25
    notes.append(Note(s0, "violins", 69, BEAT * 0.9, 0.42, 0.25, 0.8, -2.0))
    f_end = max(s0 + BEAT, vtime)
    notes.append(Note(s0 + BEAT, "violins", 78, max(0.4, f_end - s0 - BEAT + 0.2), 0.45, 0.35, 1.0, -2.0))
    notes.append(Note(s0, "piano", 57, BEAT, 0.36, 0.005, 1.4, 4.0))
    notes.append(Note(s0 + BEAT, "piano", 66, 2.0, 0.38, 0.005, 1.8, 4.0))
    if vtime + 0.3 < arr:
        notes.append(Note(vtime, "violins", 76, max(0.3, arr - vtime + 0.1), 0.42, 0.3, 0.8, -3.0))
    notes.append(Note(arr, "violins", 74, max(0.5, end - arr), 0.44, 0.2, 2.4, -2.0))
    notes.append(Note(arr, "piano", 62, 3.0, 0.4, 0.005, 2.2, 5.0))
    # a harp rising into the arrival
    for i, m in enumerate((50, 54, 57, 62, 66, 69)):
        t = arr - 0.42 + i * 0.07
        if t > t0:
            notes.append(Note(t, "harp", m, 1.2, 0.5, 0.0, 1.2, -6.0))
    return notes, "D"


def story(rng, t0, t1, release_to=None):
    """trailer tension: low and slow, a heartbeat pulse, strings trembling on the fifth"""
    notes = []
    end = release_to if release_to is not None else t1
    seq = ["Bm", "G", "Bm", "A"]
    span = t1 - t0
    n = max(1, int(round(span / (2 * BAR))))
    L = span / n
    for k in range(n):
        name = seq[k % 4]
        c = pcs(name)
        a = t0 + k * L - (0.2 if k == 0 else 0.4)
        d = max(0.4, min(t0 + (k + 1) * L + 0.3, end) - a)
        notes.append(Note(a, "basses", near(root(name), 30, 41), d, 0.32, 0.6, 1.6, -2.0))
        notes.append(Note(a, "celli", near(root(name), 41, 52), d, 0.32, 0.6, 1.6, -2.0))
        notes.append(Note(a + 0.3, "violas", near(c[2], 54, 64), d, 0.28, 1.2, 1.6, -5.0))
        # a low felt-piano octave on each chord
        notes.append(Note(t0 + k * L, "piano", near(root(name), 35, 46), 2.0, 0.3, 0.005, 1.4, 4.0))
    # the trembling fifth, growing over the section
    notes.append(Note(t0 + 0.8, "celli_trem", 54, max(0.5, end - t0 - 0.8), 0.3, max(0.5, span * 0.6), 1.4, -9.0))
    if span > 8:
        notes.append(Note(t0 + span * 0.45, "violins_trem", 66, max(0.5, end - t0 - span * 0.45), 0.28, span * 0.4, 1.2, -14.0))
    # a soft heartbeat every other beat
    t = t0 + 0.05
    while t < t1 - 0.3:
        notes.append(Note(t, "bdrum", None, None, 0.3, 0.0, 0.0, -14.0))
        if t + 0.27 < t1:
            notes.append(Note(t + 0.27, "bdrum", None, None, 0.2, 0.0, 0.0, -19.0))
        t += 2 * BEAT
    return notes, "A"


def cold(rng, t0, t1, hard_end=True):
    """one held low D, barely there (the watch ticks over it)"""
    d = max(0.3, t1 - t0)
    rel = 0.12 if hard_end else 1.2
    return [Note(t0, "celli", 38, d, 0.28, 0.25, rel, 0.0), Note(t0, "basses", 38, d, 0.24, 0.3, rel, -4.0)], "D"


def theme_pad(t0, t1):
    """a quiet D pad that leads into a statement placed later in its section"""
    if t1 - t0 < 1.0:
        return []
    d = t1 - t0 + 0.3
    return [Note(t0, "celli", 50, d, 0.28, 1.4, 1.5, -2.0), Note(t0 + 0.3, "violas", 57, d - 0.3, 0.26, 1.6, 1.5, -4.0),
            Note(t0 + 0.6, "violas", 66, d - 0.6, 0.24, 1.8, 1.5, -6.0)]
