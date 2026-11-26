"""The mix: one piece (episode / trailer / short) from plan.json alone.

  voice   placed per COMPILE.md "Where the voice comes from"; the body voice arrives cleaned
          at -16 LUFS (only a static level match if it does not); the trailer's voice gets a
          touch more presence and 2.5:1 compression. No reverb on speech.
  clips   the film section's own sound at its own level; the on-file outro laid in untouched
  music   the score (compose.py) section by section, each section's level set against the
          voice: UNDER (while he speaks) and FREE (no speech); pauses > 1.2 s may lift the bed
          (episode: by at most 4 dB; it is fully up only once the talking in that section is
          over: title, end card). A sidechain guard then keeps every 400 ms of bed at least
          20.5 dB under the voice wherever he speaks. `silence` cues mute it.
  sfx     every SoundCue at its LEVEL (sfx.py) vs. the voice; any sound landing in the 3 frames
          before a word is pulled down until it is >= 10 dB under that word.
  master  gentle glue, -14.0 LUFS integrated, true-peak limiter (ceiling -1.6 dBTP), 5 ms edges.
"""
import numpy as np
from scipy.ndimage import binary_closing, binary_opening, maximum_filter1d, uniform_filter1d

import compose as C
import sfx as SFX
from band import Band, tidy_bus
from common import (FPS, HOP, SR, T, clip_of, decode, edge_fades, f2n, f2s, glue, has_audio, integrated, kpower, lk, lufs,
                    momentary, place, pub_path, seed_of, tlog, tp_limit)
from studio.dsp import compress, filt, peak_eq, sos_hp

VOICE_LUFS = -16.0
TARGET = -14.0
EPISODE_LEVELS = {"cold": (-26, -24), "theme": (-22, -6), "teach": (-22, -18), "word": (-21, -17), "story": (-20, -9),
                  "pray": (-22, -19), "lift": (-20, -14)}
PROMO_LEVELS = {"cold": (-25, -21), "theme": (-21, -5), "teach": (-22, -15), "word": (-21, -13), "story": (-20, -8),
                "pray": (-22, -16), "lift": (-20, -10)}
PAUSE = 1.2
GUARD_DB = 20.5
RENDER_LEAD = 2.0
RENDER_TAIL = 7.0


def curve_to_samples(c100, n):
    """10 ms control curve -> per-sample float32 (chunked linear interpolation)"""
    out = np.empty(n, np.float32)
    xs = (np.arange(len(c100)) + 0.5) * HOP
    step = SR * 20
    for a in range(0, n, step):
        b = min(n, a + step)
        out[a:b] = np.interp(np.arange(a, b), xs, c100).astype(np.float32)
    return out


def media(rel, day_dir, p):
    """a plan media path: public-relative ('day01/film.mp4'); tolerates a day-relative one ('film.mp4')"""
    a = pub_path(rel)
    if a.exists():
        return a
    b = day_dir / str(rel).replace("\\", "/").split("/")[-1]
    if b.exists():
        p.warnings.append(f"media path {rel!r} is not public-relative; used {b.parent.name}/{b.name}")
        return b
    return a


class Piece:
    def __init__(self, name, kind, n_frames, music, sound, day_dir):
        self.name = name
        self.kind = kind  # "episode" | "promo"
        self.frames = int(n_frames)
        self.N = f2n(n_frames)
        self.music = music
        self.sound = sound
        self.day_dir = day_dir
        self.voice = np.zeros((self.N, 2), np.float32)
        self.clips = []  # (at_sample, stereo) — film sound (episode)
        self.outro = None  # (at_sample, stereo) — laid in untouched after the master
        self.words = []  # (from_s, to_s) of words the plan knows
        self.read_spans = []  # (from_s, to_s) where he reads a verse (words found by VAD)
        self.film_spans = []  # (from_s, to_s) where the bed is out
        self.chapters = []
        self.notes = []
        self.warnings = []
        self.forms = {}


# ------------------------------------------------------------------ voice sources
class BodyAudio:
    """body.mp4 audio, level-matched to -16 LUFS if it is not already (a fixture may be raw)"""

    def __init__(self, path, warnings):
        self.path = path
        self.x = decode(path)
        L = lufs(self.x)
        self.lufs_in = L
        self.gain_db = 0.0
        if np.isfinite(L) and L > -60 and abs(L - VOICE_LUFS) > 0.5:
            self.gain_db = VOICE_LUFS - L
            warnings.append(f"{path.name} measures {L:.1f} LUFS (contract: -16): static {self.gain_db:+.1f} dB applied")
            self.x = (self.x * 10 ** (self.gain_db / 20)).astype(np.float32)


def episode_piece(plan, day_dir):
    ep = plan["episode"]
    p = Piece("episode", "episode", ep["durationInFrames"], ep["music"], ep["sound"], day_dir)
    body = BodyAudio(day_dir / "body.mp4", p.warnings)
    p.body_lufs_in = body.lufs_in
    bodyAt = ep["bodyAt"]
    for s in ep["sections"]:
        k = s["kind"]
        if k == "cold":
            y = clip_of(body.x, f2s(s["bodyFrom"]), f2s(s["dur"]), 0.006, 0.010)
            place(p.voice, y, f2n(s["from"]))
            for w in s.get("words", []):
                p.words.append((f2s(s["from"] + w["from"]), f2s(s["from"] + w["to"])))
        elif k == "body":
            y = clip_of(body.x, 0.0, f2s(min(ep["bodyFrames"], s["dur"])), 0.010, 0.010)
            place(p.voice, y, f2n(s["from"]))
        elif k == "film":
            src = media(s["src"], day_dir, p)
            if has_audio(src):
                fx = decode(src)
                y = clip_of(fx, f2s(s["srcFrom"]), f2s(s["dur"]), 0.02, f2s(T["DOOR_OUT"]))
                p.clips.append((f2n(s["from"]), y))
            else:
                p.warnings.append(f"film section: {src} has no audio")
            p.film_spans.append((f2s(s["from"]), f2s(s["from"] + s["dur"])))
        elif k == "outro":
            src = media(s["src"], day_dir, p)
            if has_audio(src):
                ox = decode(src)
                n = min(len(ox), p.N - f2n(s["from"]))
                p.outro = (f2n(s["from"]), ox[:n].copy())
            else:
                p.warnings.append(f"outro: {src} missing or silent")
    for page in ep.get("captions", []):
        for line in page["lines"]:
            for w in line:
                p.words.append((f2s(bodyAt + w["from"]), f2s(bodyAt + w["to"])))
    for c in ep.get("cues", []):
        if c["kind"] == "chapter":
            p.chapters.append(f2s(bodyAt + c["from"] + T["CHAPTER_HIT"]))
    p.body_gain_db = body.gain_db
    return p


def promo_piece(pp, name, day_dir, forward):
    p = Piece(name, "promo", pp["durationInFrames"], pp["music"], pp["sound"], day_dir)
    body = None

    def get_body():
        nonlocal body
        if body is None:
            body = BodyAudio(day_dir / "body.mp4", p.warnings)
        return body

    jobs = {j["out"]: j for j in (pp.get("mattes") or [])}
    for b in pp["beats"]:
        k = b["kind"]
        if k == "line":
            src = media(b["clip"], day_dir, p)
            if src.exists() and has_audio(src):
                x = decode(src, cache=False)
                bo = get_body()
                if bo.gain_db:
                    x = (x * 10 ** (bo.gain_db / 20)).astype(np.float32)
                start = f2s(b["clipFrom"])
                # A clip shorter than its line means the cut-out was made for an OLDER version of the line: the voice
                # would stop early and he would mouth the rest in silence (Day 3 trailer, 26 Nov). Stop here instead.
                if len(x) < int((start + f2s(b["dur"])) * SR) - int(0.07 * SR):
                    raise SystemExit(f"{name}: line at frame {b['from']} needs {start + f2s(b['dur']):.2f} s of {b['clip']} but the clip is {len(x) / SR:.2f} s long — rebuild the cut-outs first (node scripts/december/matte.mjs <N> --force), then the sound")
            else:
                job = jobs.get(b["clip"])
                if b.get("matte") and job is None:
                    p.warnings.append(f"line at {b['from']}: matte clip {b['clip']} missing and no mattes[] job; voice skipped")
                    continue
                x = get_body().x
                start = f2s((job["bodyFrom"] if job else 0) + b["clipFrom"])
                if b.get("matte"):
                    p.warnings.append(f"line at {b['from']}: {b['clip']} not built yet -> body.mp4 frame {job['bodyFrom'] + b['clipFrom']}")
            y = clip_of(x, start, f2s(b["dur"]), 0.008, 0.012)
            place(p.voice, y, f2n(b["from"]))
            for w in b.get("words", []):
                p.words.append((f2s(b["from"] + w["from"]), f2s(b["from"] + w["to"])))
        elif k == "verse" and b.get("read"):
            r = b["read"]
            src = media(r["clip"], day_dir, p)
            if not src.exists():
                p.warnings.append(f"verse read: {src} missing")
                continue
            bo = get_body()
            x = bo.x if src.resolve() == (day_dir / "body.mp4").resolve() else decode(src)
            y = clip_of(x, f2s(r["clipFrom"]), f2s(r["frames"]), 0.008, 0.012)
            at = b["from"] + r.get("at", 0)
            place(p.voice, y, f2n(at))
            p.read_spans.append((f2s(at), f2s(at + r["frames"])))
    if forward and np.any(p.voice):
        p.voice = forward_voice(p.voice)
    if body is not None:
        p.body_lufs_in = body.lufs_in
        p.body_gain_db = body.gain_db
    return p


def forward_voice(v):
    """a little more presence and density for a trailer, then back to -16 LUFS speech"""
    L0 = lufs(v)
    m = filt(sos_hp(75, 2), v)
    m = filt(peak_eq(3200, 1.5, 0.8), m)
    m = filt(peak_eq(220, -1.0, 0.9), m)
    m = compress(m, thr_db=-24, ratio=2.5, att=6, rel=140, knee=6, makeup=False)
    L1 = lufs(m)
    if L1 > -69 and L0 > -69:
        m = m * 10 ** ((L0 - L1) / 20)
    return m.astype(np.float32)


# ------------------------------------------------------------------ speech map
def speech_map(p):
    """10 ms blocks where he speaks (VAD on the voice stem, plus the plan's words) and his level"""
    pv = kpower(p.voice)
    nb = len(pv)
    Vg = integrated(pv)
    if Vg <= -69:
        return np.zeros(nb, bool), -23.0, pv
    m50 = lk(uniform_filter1d(pv, 5, mode="constant"))
    vad = m50 > Vg - 20
    vad = binary_closing(vad, np.ones(30, bool))
    vad = binary_opening(vad, np.ones(8, bool))
    sp = vad.copy()
    for a, b in p.words:
        sp[max(0, int(a * 100) - 5) : min(nb, int(b * 100) + 5)] = True
    V = integrated(pv, sp)
    return sp, (V if V > -69 else Vg), pv


def pause_rise(sp):
    """0..1: 1 inside pauses longer than PAUSE (0.35 s after the last word, 0.45 s before the next)"""
    nb = len(sp)
    tgt = np.zeros(nb, np.float32)
    idx = np.flatnonzero(np.diff(np.concatenate([[1], sp.astype(np.int8), [1]])))
    # runs of silence: starts where sp goes 1->0, ends 0->1
    starts = np.flatnonzero(np.diff(np.concatenate([[1], sp.astype(np.int8)])) == -1)
    ends = np.flatnonzero(np.diff(np.concatenate([sp.astype(np.int8), [1]])) == 1) + 1
    del idx
    for a, b in zip(starts, ends):
        if (b - a) >= PAUSE * 100:
            lo = a + 35 if a > 0 else 0
            hi = b - 45 if b < nb else nb
            if hi > lo:
                tgt[lo:hi] = 1.0
    return np.clip(uniform_filter1d(tgt, 50, mode="nearest"), 0, 1)


def gated_st(pm, pv, sp, win=301):
    """speech-gated 3 s short-term loudness (LUFS) of music and voice, centred, from 10 ms powers:
    only the blocks where he speaks count (the bed in a pause is not 'under a word')"""
    m = sp.astype(np.float64)
    cnt = uniform_filter1d(m, win, mode="constant") + 1e-9
    return lk(uniform_filter1d(pm * m, win, mode="constant") / cnt), lk(uniform_filter1d(pv * m, win, mode="constant") / cnt)


# ------------------------------------------------------------------ the score
def merged_sections(music):
    secs = []
    for s in sorted(music, key=lambda s: s["from"]):
        if secs and secs[-1]["mood"] == s["mood"] and abs(secs[-1]["to"] - s["from"]) <= 1:
            secs[-1]["to"] = s["to"]
        else:
            secs.append(dict(s))
    return secs


def cues_s(p, kind, lo, hi, weight=None):
    return [f2s(c["f"]) for c in p.sound if c["type"] == kind and lo <= f2s(c["f"]) <= hi and (weight is None or c.get("weight", 2) == weight)]


def silence_spans(p):
    return [(f2s(c["f"]), f2s(c["f"] + max(1, c.get("dur", 1)))) for c in p.sound if c["type"] == "silence"]


def compose_section(p, i, secs, state, seed):
    s = secs[i]
    mood = s["mood"]
    t0, t1 = f2s(s["from"]), f2s(s["to"])
    nxt = secs[i + 1] if i + 1 < len(secs) else None
    prv = secs[i - 1] if i > 0 else None
    rng = np.random.default_rng(seed_of(seed, mood, s["from"]))
    sil = silence_spans(p)
    nxt_quiet = nxt is None or nxt["mood"] == "out" or any(abs(a - t1) < 0.4 for a, _ in sil)
    rel_to = t1 - 0.15
    # an episode film SECTION carries its own sound: the bed is out under it
    in_film = any(min(t1, b) - max(t0, a) > 0.5 * (t1 - t0) for a, b in p.film_spans)
    if mood == "out" or in_film:
        return [], state.get("chord", "D")
    soft = 1.8 if (prv is None or prv["mood"] in ("out",) or any(min(f2s(prv["to"]), b) - max(f2s(prv["from"]), a) > 0 for a, b in p.film_spans)) else 1.2
    first = {"D": "G", "G": "D", "A": "D", "Bm": "G", "Em": "A"}.get(state.get("chord"), "D")
    if mood == "cold":
        hard = nxt is not None and nxt["mood"] == "theme"
        return C.cold(rng, t0, t1, hard_end=hard)
    if mood == "teach":
        return C.teach(rng, t0, t1, first, soft, rel_to, p.chapters)
    if mood == "word":
        return C.word(rng, t0, t1, soft, rel_to)
    if mood == "pray":
        return C.pray(rng, t0, t1, 2.4, rel_to)
    if mood == "lift":
        hits = cues_s(p, "hit", t0, t1 + 0.3, 3)
        return C.lift(rng, t0, t1, hits[-1] if hits else None, rel_to)
    if mood == "story":
        return C.story(rng, t0, t1, rel_to)
    if mood == "theme":
        return theme_section(p, s, t0, t1, i, secs, nxt_quiet)
    p.warnings.append(f"unknown mood {mood!r} at frame {s['from']}: silent")
    return [], state.get("chord", "D")


def theme_section(p, s, t0, t1, i, secs, nxt_quiet):
    last_theme = all(x["mood"] in ("out",) for x in secs[i + 1 :])
    span = t1 - t0
    full_need = C.THEME["full"]["arrive"] * C.BEAT
    head_need = C.THEME["head"]["arrive"] * C.BEAT
    doors = cues_s(p, "door", t0 - 0.1, t0 + 1.4)
    notes = []
    cut = t1 + (0.6 if not nxt_quiet else 1.4)
    if last_theme and span >= 8.0:
        # the end card: the whole theme, its arrival ~2.4 s before the section ends (room to ring)
        arrive = t1 - 2.4
        t_down = arrive - full_need
        if t_down - 0.45 < t0 - 1.5:
            t_down = t0 - 1.05
            arrive = t_down + full_need
        if arrive <= t1 - 1.6:
            pick = t_down - 0.45
            notes += C.theme_pad(t0 - 0.3, pick + 0.6) if pick - t0 > 1.5 else []
            notes += C.theme_notes("full", t_down, t_cut=cut, t_pick=pick)
            p.forms[s["from"]] = {"form": "full", "align": "end", "downbeat_s": round(t_down, 3), "arrival_s": round(arrive, 3)}
            return notes, "D"
    if doors:
        door = doors[0]
        hits = [h for h in cues_s(p, "hit", door + 0.05, door + 1.2)]
        t_down = hits[0] if hits else door + 0.55
        pick = door + 0.03
    else:
        pick = t0 + 0.15
        t_down = pick + 0.45
    avail = t1 - t_down
    form = "full" if avail >= full_need + 1.4 else "head" if avail >= head_need + 1.2 else "motif"
    notes += C.theme_notes(form, t_down, t_cut=cut, t_pick=pick)
    p.forms[s["from"]] = {"form": form, "align": "start", "pickup_s": round(pick, 3), "downbeat_s": round(t_down, 3)}
    return notes, "G" if form == "head" else "D"


def build_music(p, sp, V, levels, cap_db, seed):
    """the score, section by section, each at its own level against the voice"""
    nb = len(sp)
    rise = pause_rise(sp)
    secs = merged_sections(p.music)
    music = np.zeros((p.N, 2), np.float32)
    band = Band(seed_of(seed, "band"))
    state = {"chord": None}
    p.section_report = []
    for i, s in enumerate(secs):
        notes, last = compose_section(p, i, secs, state, seed)
        state["chord"] = last
        if not notes:
            p.section_report.append({"mood": s["mood"], "from": s["from"], "to": s["to"], "notes": 0})
            continue
        t0, t1 = f2s(s["from"]), f2s(s["to"])
        r0 = max(0.0, min(t0 - RENDER_LEAD, min(n.t for n in notes)))
        r1 = min(p.N / SR, t1 + RENDER_TAIL)
        tlog(f"{s['mood']:6s} {t0:6.1f}-{t1:6.1f}s  {len(notes)} notes")
        y = band.render(notes, r0, r1)
        y = tidy_bus(y)
        a = int(round(r0 * SR))
        # raw loudness inside the section itself
        lo, hi = max(0, int((t0 - r0) * SR)), min(len(y), int((t1 - r0) * SR))
        Lraw = lufs(y[lo:hi]) if hi - lo > SR // 2 else lufs(y)
        if Lraw <= -69:
            continue
        under, free = levels.get(s["mood"], (-22, -18))
        cap = min(cap_db, free - under)
        # r_final: once the talking in this section is over (or there is none), fully up
        b0, b1 = int(t0 * 100), min(nb, int(t1 * 100))
        sp_in = np.flatnonzero(sp[b0:b1])
        rb0, rb1 = int(r0 * 100), min(nb, int(r1 * 100) + 1)
        fin = np.zeros(rb1 - rb0, np.float32)
        if len(sp_in) == 0:
            fin[:] = 1.0
        else:
            last_b = b0 + sp_in[-1] + 40
            if b1 - last_b > 20:
                k = last_b - rb0
                ramp = np.clip((np.arange(rb1 - rb0) - k) / 100.0, 0, 1)
                fin = ramp.astype(np.float32)
        r = rise[rb0:rb1]
        lvl = under + cap * r + (free - under - cap) * np.minimum(fin, r)
        g_db = V + lvl - Lraw
        g = curve_to_samples(10 ** (g_db / 20), len(y)) if len(g_db) > 1 else np.full(len(y), 10 ** (g_db[0] / 20), np.float32)
        place(music, y * g[:, None], a)
        p.section_report.append({"mood": s["mood"], "from": s["from"], "to": s["to"], "notes": len(notes), "raw_lufs": round(Lraw, 1),
                                 "under_db": under, "free_db": free, "form": p.forms.get(s["from"])})
        del y, g
    tlog("score rendered")
    # silence cues: the music ducks to nothing over them
    sil = np.ones(nb, np.float32)
    for a, b in silence_spans(p):
        ia, ib = int(a * 100), int(b * 100)
        sil[max(0, ia - 12) : ib] = 0.0
    sil = np.clip(uniform_filter1d(sil, 15, mode="nearest"), 0, 1)
    sil[np.flatnonzero(sil < 0.02)] = 0.0
    # the sidechain guard: every 400 ms of bed >= GUARD_DB under his voice while he speaks
    pm = kpower(music) * sil.astype(np.float64)[: len(sp)] ** 2
    pvv = kpower(p.voice)
    Mv = momentary(pvv, 40)
    ref = np.clip(Mv, V - 12, V + 4)
    red = np.zeros(nb)
    # (a) 400 ms: every moment of speech
    excess = np.where(sp, momentary(pm, 40) - (ref - GUARD_DB), 0.0)
    red = np.maximum(red, uniform_filter1d(maximum_filter1d(np.clip(excess, 0, 40), 41), 21, mode="nearest"))
    # (b) 3 s short-term, speech-gated (the QA rule): around each word, the bed's level while he
    # speaks vs. his; an excess is taken out of the speech in that window only (pauses and
    # stings keep their level), iterated
    spd = binary_closing(sp, np.ones(20, bool)) | sp
    for _ in range(3):
        sm3, sv3 = gated_st(pm * 10 ** (-red / 10), pvv, sp)
        ex3 = np.where(sp, sm3 - (sv3 - GUARD_DB + 1.0), 0.0)
        if ex3.max() <= 0.05:
            break
        add = np.where(spd, maximum_filter1d(np.clip(ex3, 0, 40), 301), 0.0)
        red = red + uniform_filter1d(add, 21, mode="nearest")
    gc = sil * 10 ** (-red / 20)
    music *= curve_to_samples(gc, p.N)[:, None]
    p.guard_max_db = float(red.max()) if len(red) else 0.0
    p.guard_active_s = float((red > 0.5).sum() / 100.0)
    return music


# ------------------------------------------------------------------ sound design
def build_sfx(p, sp, V, pv):
    events = []
    ticks = 0
    for c in sorted(p.sound, key=lambda c: c["f"]):
        k = c["type"]
        if k == "silence":
            continue
        if k not in ("tick", "tickStop", "door", "doorClose", "paper", "hit", "drum", "click", "bell", "swell"):
            p.warnings.append(f"sound cue type {k!r} at {c['f']}: unknown, skipped")
            continue
        dur_s = f2s(c.get("dur", 45)) if k == "swell" else None
        x, l, L = SFX.make(k, weight=c.get("weight", 2), dur_s=dur_s, index=ticks)
        if k == "tick":
            ticks += 1
        g = 10 ** ((V + L - l) / 20)
        events.append({"type": k, "f": c["f"], "at": f2n(c["f"]), "x": x, "g": g, "weight": c.get("weight")})
    # the syllable guard: nothing loud in the 3 frames before a word starts
    onsets = word_onsets(p, sp)
    for it in range(4):
        out = np.zeros((p.N, 2), np.float32)
        for e in events:
            place(out, e["x"], e["at"], e["g"])
        if it == 3:
            break
        ps = kpower(out)
        bad = 0
        for ws in onsets:
            b = int(ws * 100)
            if b - 10 < 0 or b + 30 > len(ps):
                continue
            s_db = lk(ps[b - 10 : b].mean())
            v_db = lk(uniform_filter1d(pv[b : b + 30], 10).max())  # the syllable's peak 100 ms
            over = s_db - (v_db - 10.5)
            if over > 0:
                bad += 1
                a_s, b_s = (b - 10) * HOP, b * HOP
                for e in events:
                    if e["at"] < b_s and e["at"] + len(e["x"]) > a_s:
                        e["g"] *= 10 ** (-(over + 0.5) / 20)
                        e["guarded"] = True
        if bad == 0:
            break
    p.sfx_events = events
    tlog(f"sfx: {len(events)} events")
    return out


def word_onsets(p, sp):
    on = [a for a, _ in p.words]
    # verse readings: their word starts come from the voice itself
    st = np.flatnonzero(np.diff(np.concatenate([[0], sp.astype(np.int8)])) == 1) / 100.0
    for a, b in p.read_spans:
        on += [float(x) for x in st if a <= x < b]
    if not p.words:
        on += [float(x) for x in st]
    return sorted(set(round(x, 3) for x in on))


def qa_words(p, sp):
    """(start, end) of every word to check: the plan's, plus voiced runs inside verse readings"""
    w = list(p.words)
    st = np.flatnonzero(np.diff(np.concatenate([[0], sp.astype(np.int8)])) == 1)
    en = np.flatnonzero(np.diff(np.concatenate([sp.astype(np.int8), [0]])) == -1) + 1
    for a, b in p.read_spans:
        for s_, e_ in zip(st, en):
            if a <= s_ / 100 < b:
                w.append((s_ / 100, e_ / 100))
    if not p.words:
        w += [(s_ / 100, e_ / 100) for s_, e_ in zip(st, en)]
    return sorted(w)


# ------------------------------------------------------------------ master
def master(p, voice, music, sfx_bus):
    """returns (final, stems, gain_db). The outro (episode) is laid in after the master, untouched."""
    prog = voice + music + sfx_bus
    for at, y in p.clips:
        place(prog, y, at)
    cut = p.outro[0] if p.outro else None
    if cut is not None:
        f = int(0.5 * SR)
        a = max(0, cut - f)
        prog[a:cut] *= np.linspace(1, 0, cut - a, dtype=np.float32)[:, None] ** 1.5
        prog[cut:] = 0.0
    prog = glue(prog)

    def with_outro(y):
        if p.outro is None:
            return y
        z = y.copy()
        place(z, p.outro[1], p.outro[0])
        return z

    tlog("master")
    g = 10 ** ((TARGET - lufs(with_outro(prog))) / 20)
    for it in range(3):
        y = tp_limit(prog * np.float32(g), -1.6)
        full = with_outro(y)
        del y
        L = lufs(full)
        if abs(L - TARGET) <= 0.08 or it == 2:
            break
        g *= 10 ** ((TARGET - L) / 20)
        del full
    full = edge_fades(full, 5)
    gf = np.float32(g)
    stems = {"voice": voice * gf, "music": music * gf, "sfx": sfx_bus * gf}
    clips = np.zeros((p.N, 2), np.float32)
    for at, y_ in p.clips:
        place(clips, y_, at, gf)
    if p.outro is not None:
        place(clips, p.outro[1], p.outro[0])
    if np.any(clips):
        stems["clips"] = clips
    return full, stems, 20 * np.log10(g)
