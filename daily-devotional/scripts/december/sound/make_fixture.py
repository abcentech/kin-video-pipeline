"""Write the sound stage's own fixture: december-public/day97/plan.json (valid per
src/December/types.ts), over the fixture media (own copies in day97/, see below). Words come from a simple voice-activity pass over the fixture's audio
(text is placeholder): good enough to time cues, ducking and QA against real speech.

    studio/.venv/Scripts/python.exe scripts/december/sound/make_fixture.py

~80 s episode: cold · title · 12 s film · body (ident, chapter, scripture page, subscribe,
prayer, declaration, next) · outro; a ~35 s trailer (16x9 + 9x16); one ~25 s short.
Music and sound lists follow december/COMPILE.md.
"""
import json
import os

import sys
from pathlib import Path

import numpy as np
from scipy.ndimage import binary_closing, binary_opening, uniform_filter1d

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PUB, ROOT, T, decode, kpower, lk  # noqa: E402

DAY = 97
D = f"day{DAY}"
out = PUB / D
out.mkdir(parents=True, exist_ok=True)
# Own copies, NOT hard links: on 24 Nov a write through another day's hard link truncated
# the shared fixture/body.mp4 to 0.1 s. fixture/body.mp4 was Day_1.mp4 from 20.0 s for 100 s
# (audio cross-correlation 0.9995), so day97 cuts its own from the raw source.
RAW_DAY1 = os.environ.get("DEC_RAW_DAY1") or str(ROOT / "inbox" / "Day_1.mp4")  # or set DEC_RAW_DAY1 to your Day_1.mp4
if not (out / "body.mp4").exists():
    import subprocess

    subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-y", "-ss", "20", "-i", RAW_DAY1, "-t", "100", "-vf", "fps=30,scale=640:-2",
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", str(out / "body.mp4")], check=True)
if not (out / "film.mp4").exists():
    import shutil

    shutil.copyfile(PUB / "fixture" / "film.mp4", out / "film.mp4")

# ------------------------------------------------------------------ words (VAD)
x = decode(out / "body.mp4")
p = kpower(x)
Lg = lk(np.sort(p)[int(len(p) * 0.9)])
m = lk(uniform_filter1d(p, 5, mode="constant"))
vad = binary_opening(binary_closing(m > Lg - 26, np.ones(12, bool)), np.ones(6, bool))
st = np.flatnonzero(np.diff(np.concatenate([[0], vad.astype(np.int8)])) == 1)
en = np.flatnonzero(np.diff(np.concatenate([vad.astype(np.int8), [0]])) == -1) + 1
LEX = "the Father showed up he is never late when you wait at the door God sees you and he comes in the fulness of time".split()
words = []  # body frames
for a, b in zip(st, en):
    dur = (b - a) / 100
    n = max(1, int(round(dur / 0.31)))
    for k in range(n):
        fa = (a + (b - a) * k / n) / 100 * 30
        fb = (a + (b - a) * (k + 1) / n) / 100 * 30 - 1
        words.append({"text": LEX[len(words) % len(LEX)], "from": int(round(fa)), "to": int(round(max(fa + 3, fb)))})
print(f"{len(words)} pseudo-words in {len(st)} voiced runs, body {len(x) / 48000:.1f} s")


def phrases(lo, hi, min_s, max_s, gap=10):
    """runs of words with gaps < `gap` frames, between body frames lo..hi, lasting min_s..max_s"""
    out_, cur = [], []
    for w in words:
        if not (lo <= w["from"] < hi):
            continue
        if cur and w["from"] - cur[-1]["to"] > gap:
            out_.append(cur)
            cur = []
        cur.append(w)
    if cur:
        out_.append(cur)
    return [c for c in out_ if min_s * 30 <= c[-1]["to"] - c[0]["from"] <= max_s * 30]


def word_at(f):
    """first word starting at or after body frame f"""
    for w in words:
        if w["from"] >= f:
            return w
    return words[-1]


def rel(ws, base):
    return [{"text": w["text"], "from": w["from"] - base, "to": w["to"] - base} for w in ws]


def view(s=1.12):
    return {"s": s, "x": 0.47, "y": 0.42}


# ------------------------------------------------------------------ episode
BODY_FRAMES = 1380
hook = phrases(150, BODY_FRAMES - 60, 1.6, 6.5)[0]
cold_from = 0
c_bodyFrom = hook[0]["from"] - T["LEAD"]
c_dur = hook[-1]["to"] - hook[0]["from"] + T["LEAD"] + 4
big_w = hook[len(hook) // 2]
sections = [{"kind": "cold", "from": 0, "dur": c_dur, "bodyFrom": c_bodyFrom, "words": rel(hook, c_bodyFrom),
             "big": [{"text": "*NEVER* LATE", "from": big_w["from"] - c_bodyFrom, "side": "right"}],
             "cam": [{"f": 0, "view": view(1.25), "ease": "cut"}, {"f": c_dur, "view": view(1.30), "ease": "in-out"}]}]
title_from = c_dur
sections.append({"kind": "title", "from": title_from, "dur": T["TITLE_DUR"]})
film_from = title_from + T["TITLE_DUR"]
FILM_DUR = 360
sections.append({"kind": "film", "from": film_from, "dur": FILM_DUR, "src": f"{D}/film.mp4", "srcFrom": 300})
bodyAt = film_from + FILM_DUR
body_dur = BODY_FRAMES + T["NEXT_DUR"] - 20
sections.append({"kind": "body", "from": bodyAt, "dur": body_dur})
outro_from = bodyAt + body_dur
sections.append({"kind": "outro", "from": outro_from, "dur": T["OUTRO_DUR"], "src": "outro/LikeShare_16x9.mp4"})
total = outro_from + T["OUTRO_DUR"]

# cues (body frames), each anchored on a word start like the compiler would
w_ident = word_at(60)
w_chap = word_at(260)
read_ph = phrases(400, 800, 2.5, 9.0, gap=45)[0]
sc_from = read_ph[0]["from"] - T["DOOR_IN"]
sc_dur = (read_ph[-1]["to"] - read_ph[0]["from"]) + T["DOOR_IN"] + 36 + T["DOOR_OUT"]
sc_lit = [w["from"] for w in read_ph][:9]
sc_hit = sc_lit[min(5, len(sc_lit) - 1)]
w_sub = word_at(sc_from + sc_dur + 70)
w_pray = word_at(w_sub["from"] + T["SUB_DUR"] + 70)
pray_to = word_at(w_pray["from"] + 120)
w_decl = word_at(pray_to["to"] + 30)
decl_ws = [w for w in words if w_decl["from"] <= w["from"] < w_decl["from"] + 140][:7]
decl_from = decl_ws[0]["from"] - T["DOOR_IN"]
decl_dur = decl_ws[-1]["from"] + 45 + T["DOOR_OUT"] - decl_from
next_from = BODY_FRAMES - 20
assert decl_from + decl_dur < next_from, (decl_from, decl_dur, next_from)
cues = [
    {"id": "ident", "kind": "ident", "from": w_ident["from"], "dur": T["IDENT_DUR"]},
    {"id": "ch1", "kind": "chapter", "from": w_chap["from"], "dur": T["CHAPTER_DUR"], "label": "TRUTH 1 OF 3", "title": "He is *never* late", "numeral": 1, "chipTo": next_from},
    {"id": "gal4", "kind": "scripture", "mode": "page", "from": sc_from, "dur": sc_dur, "ref": "Galatians 4:4–5",
     "text": "But when **the fulness of the time** was come, God sent forth his Son", "lit": sc_lit, "flourish": True, "hit": sc_hit},
    {"id": "sub", "kind": "subscribe", "from": w_sub["from"], "dur": T["SUB_DUR"], "variant": "subscribe"},
    {"id": "pray", "kind": "prayer", "from": w_pray["from"], "dur": pray_to["to"] + 20 - w_pray["from"],
     "lines": [{"text": "Father, thank you that you are never late.", "from": w_pray["from"], "to": pray_to["to"]}]},
    {"id": "decl", "kind": "declare", "from": decl_from, "dur": decl_dur, "text": "My Father in heaven is *never late*.", "lit": [w["from"] for w in decl_ws]},
    {"id": "next", "kind": "next", "from": next_from, "dur": T["NEXT_DUR"]},
]
TAKEOVER = {"chapter", "scripture", "prayer", "declare", "next"}
B = lambda f: bodyAt + f  # noqa: E731
music = [{"from": 0, "to": c_dur, "mood": "cold"}, {"from": title_from, "to": film_from, "mood": "theme"},
         {"from": film_from, "to": bodyAt, "mood": "story"}]
body_music = [(0, sc_from, "teach"), (sc_from, sc_from + sc_dur, "word"), (sc_from + sc_dur, w_pray["from"], "teach"),
              (w_pray["from"], w_pray["from"] + cues[4]["dur"], "pray"), (w_pray["from"] + cues[4]["dur"], decl_from, "teach"),
              (decl_from, decl_from + decl_dur, "lift"), (decl_from + decl_dur, next_from, "teach"), (next_from, body_dur, "theme")]
music += [{"from": B(a), "to": B(b), "mood": m} for a, b, m in body_music if b > a]
music.append({"from": outro_from, "to": total, "mood": "out"})

sound = [{"f": f, "type": "tick"} for f in range(0, c_dur, 30)]
sound += [{"f": c_dur - 1, "type": "tickStop"}, {"f": big_w["from"] - c_bodyFrom, "type": "hit", "weight": 2}]
sound += [{"f": title_from + T["TITLE_DOOR"], "type": "door"}, {"f": title_from + T["TITLE_HIT"], "type": "hit", "weight": 3}]
sound += [{"f": bodyAt - T["DOOR_OUT"], "type": "doorClose"}]  # the film's door closes into the body
for c in cues:
    if c["kind"] in TAKEOVER:
        sound.append({"f": B(c["from"]), "type": "door"})
        if c["kind"] != "next":
            sound.append({"f": B(c["from"] + c["dur"] - T["DOOR_OUT"]), "type": "doorClose"})
    if c["kind"] == "scripture":
        sound += [{"f": B(c["from"] + 6), "type": "paper"}, {"f": B(c["hit"] - 45), "type": "swell", "dur": 45}, {"f": B(c["hit"]), "type": "hit", "weight": 2}]
    if c["kind"] == "chapter":
        sound.append({"f": B(c["from"] + T["CHAPTER_HIT"]), "type": "hit", "weight": 1})
    if c["kind"] == "subscribe":
        sound += [{"f": B(c["from"] + T["SUB_PRESS"]), "type": "click"}, {"f": B(c["from"] + T["SUB_BELL"]), "type": "bell"}]
    if c["kind"] == "declare":
        sound += [{"f": B(c["lit"][0]), "type": "drum"}, {"f": B(c["lit"][-1]), "type": "hit", "weight": 3}]
    if c["kind"] == "next":
        sound.append({"f": B(c["from"] + T["NEXT_HIT"]), "type": "hit", "weight": 2})
sound.sort(key=lambda s: s["f"])

# captions over the body: pages of up to 6 words
caps = []
bw = [w for w in words if w["to"] < BODY_FRAMES]
for i in range(0, len(bw), 6):
    pg = bw[i : i + 6]
    caps.append({"from": pg[0]["from"] - 4, "to": pg[-1]["to"] + 8, "lines": [pg[:3], pg[3:]] if len(pg) > 3 else [pg]})

episode = {"durationInFrames": total, "sections": sections, "bodyAt": bodyAt, "bodyFrames": BODY_FRAMES, "cuts": [],
           "cam": [{"f": 0, "view": view(1.12), "ease": "cut"}], "captions": caps, "cues": cues, "music": music,
           "sound": sound, "audio": f"{D}/audio/episode.wav"}


# ------------------------------------------------------------------ trailer
def line_beat(ph, mood, t, k, hold):
    start = ph[0]["from"]
    dur = T["LEAD"] + (ph[-1]["to"] - start) + hold
    clip = f"{D}/matte/t{k}.mp4"
    beat = {"kind": "line", "mood": mood, "from": t, "dur": dur, "clip": clip, "matte": True, "clipFrom": 15,
            "words": rel(ph, start - T["LEAD"]), "cam": [view(1.25), view(1.25)], "snaps": []}
    job = {"out": clip, "bodyFrom": start - T["LEAD"] - 15, "frames": dur + 30}
    return beat, job


cands = phrases(0, 3000, 1.6, 3.4)
used = {id(hook)}
pick = [c for c in cands if c[0]["from"] != hook[0]["from"]]
beats, jobs, tsound = [], [], []
t = 0
seq = [("line", "cold", 4), ("title",), ("line", "tension", 8), ("film", 300, 66), ("line", "tension", 8), ("line", "tension", 8),
       ("film", 900, 54), ("verse",), ("line", "turn", 8), ("line", "button", 20), ("end",)]
li = 0
tmusic = []
for s in seq:
    if s[0] == "line":
        ph = pick[li]
        li += 1
        b, j = line_beat(ph, s[1], t, li, s[2])
        if s[1] in ("cold", "turn"):
            bw_ = b["words"][len(b["words"]) // 2]
            b["big"] = {"text": "*NEVER*" if s[1] == "turn" else "WAITING", "from": bw_["from"]}
            tsound.append({"f": t + bw_["from"], "type": "hit", "weight": 2})
        if s[1] == "cold":
            tsound += [{"f": f, "type": "tick"} for f in range(t, t + b["dur"], 30)] + [{"f": t + b["dur"] - 1, "type": "tickStop"}]
            b["snaps"] = [b["words"][-1]["from"]]
        if s[1] == "button":
            tsound.append({"f": t, "type": "silence", "dur": b["dur"]})
        beats.append(b)
        jobs.append(j)
        t += b["dur"]
    elif s[0] == "title":
        beats.append({"kind": "title", "from": t, "dur": T["TITLE_DUR_TRAILER"]})
        tsound += [{"f": t + T["TITLE_DOOR_TRAILER"], "type": "door"}, {"f": t + T["TITLE_HIT_TRAILER"], "type": "hit", "weight": 3}]
        t += T["TITLE_DUR_TRAILER"]
    elif s[0] == "film":
        beats.append({"kind": "film", "from": t, "dur": s[2], "src": f"{D}/film.mp4", "srcFrom": s[1], "focusX": 50})
        t += s[2]
    elif s[0] == "verse":
        ph = read_ph
        frames = ph[-1]["to"] - ph[0]["from"] + 4
        dur = T["DOOR_IN"] + frames + 30
        lit = [T["DOOR_IN"] + w["from"] - ph[0]["from"] for w in ph][:9]
        hit = lit[min(5, len(lit) - 1)]
        beats.append({"kind": "verse", "from": t, "dur": dur, "ref": "Galatians 4:4", "text": "But when **the fulness of the time** was come",
                      "lit": lit, "hit": hit, "read": {"clip": f"{D}/body.mp4", "clipFrom": ph[0]["from"] - 2, "frames": frames, "at": T["DOOR_IN"]}})
        tsound += [{"f": t, "type": "door"}, {"f": t + 6, "type": "paper"}, {"f": t + hit - 45, "type": "swell", "dur": 45}, {"f": t + hit, "type": "hit", "weight": 2}]
        t += dur
    elif s[0] == "end":
        beats.append({"kind": "end", "from": t, "dur": T["END_DUR_TRAILER"]})
        tsound.append({"f": t, "type": "door"})
        t += T["END_DUR_TRAILER"]
TR_TOTAL = t
# music by beat moods
MOOD = {"cold": "cold", "tension": "story", "turn": "lift", "button": "lift"}
for b in beats:
    m = {"line": MOOD.get(b.get("mood")), "title": "theme", "film": "story", "verse": "word", "end": "theme"}[b["kind"]]
    if tmusic and tmusic[-1]["mood"] == m and tmusic[-1]["to"] == b["from"]:
        tmusic[-1]["to"] = b["from"] + b["dur"]
    else:
        tmusic.append({"from": b["from"], "to": b["from"] + b["dur"], "mood": m})
tsound.sort(key=lambda s: s["f"])
tcaps = []
for b in beats:
    if b["kind"] == "line":
        ws = [{**w, "from": w["from"] + b["from"], "to": w["to"] + b["from"]} for w in b["words"]]
        for i in range(0, len(ws), 4):
            pg = ws[i : i + 4]
            tcaps.append({"from": pg[0]["from"] - 2, "to": pg[-1]["to"] + 6, "lines": [pg]})
trailer16 = {"id": "trailer", "format": "16x9", "durationInFrames": TR_TOTAL, "beats": beats, "captions": tcaps, "music": tmusic,
             "sound": tsound, "audio": f"{D}/audio/trailer.wav", "mattes": jobs}
trailer9 = json.loads(json.dumps(trailer16))
trailer9["format"] = "9x16"
print(f"trailer {TR_TOTAL / 30:.1f} s")

# ------------------------------------------------------------------ short
lines_src = []
for ph in phrases(1400, 2700, 3.0, 12.0, gap=45):
    if sum(x[-1]["to"] - x[0]["from"] for x in lines_src) < 15 * 30:
        lines_src.append(ph)
sbeats, smusic, ssound = [], [], [{"f": 0, "type": "door"}]
t = 0
for ph in lines_src:
    start = ph[0]["from"] - T["LEAD"]
    dur = ph[-1]["to"] - start + 8
    sbeats.append({"kind": "line", "mood": "line", "from": t, "dur": dur, "clip": f"{D}/body.mp4", "matte": False, "clipFrom": start,
                   "words": rel(ph, start), "cam": [view(1.12), view(1.14)], "snaps": []})
    t += dur
smusic.append({"from": 0, "to": t, "mood": "teach"})
vph = phrases(lines_src[-1][-1]["to"] + 10, 3000, 2.5, 7.0, gap=30)[0]
frames = vph[-1]["to"] - vph[0]["from"] + 4
vdur = T["DOOR_IN"] + frames + 30
lit = [T["DOOR_IN"] + w["from"] - vph[0]["from"] for w in vph][:9]
sbeats.append({"kind": "verse", "from": t, "dur": vdur, "ref": "Galatians 4:5", "text": "To redeem them that were under the law, that we might receive the **adoption of sons**",
               "lit": lit, "hit": lit[-1], "read": {"clip": f"{D}/body.mp4", "clipFrom": vph[0]["from"] - 2, "frames": frames, "at": T["DOOR_IN"]}})
ssound += [{"f": t, "type": "door"}, {"f": t + 6, "type": "paper"}, {"f": t + lit[-1] - 45, "type": "swell", "dur": 45}, {"f": t + lit[-1], "type": "hit", "weight": 2}]
smusic.append({"from": t, "to": t + vdur, "mood": "word"})
t += vdur
sbeats.append({"kind": "end", "from": t, "dur": T["END_DUR_SHORT"]})
ssound.append({"f": t, "type": "door"})
smusic.append({"from": t, "to": t + T["END_DUR_SHORT"], "mood": "theme"})
t += T["END_DUR_SHORT"]
scaps = []
for b in sbeats:
    if b["kind"] == "line":
        ws = [{**w, "from": w["from"] + b["from"], "to": w["to"] + b["from"]} for w in b["words"]]
        for i in range(0, len(ws), 3):
            pg = ws[i : i + 3]
            scaps.append({"from": pg[0]["from"] - 2, "to": pg[-1]["to"] + 6, "lines": [pg]})
short = {"id": "word", "format": "9x16", "durationInFrames": t, "title": "When the *time* came|God *showed up*", "beats": sbeats,
         "captions": scaps, "music": smusic, "sound": sorted(ssound, key=lambda s: s["f"]), "audio": f"{D}/audio/short-word.wav",
         "post": "The fulness of time. #KidsInspiringNation"}
print(f"short {t / 30:.1f} s, episode {total / 30:.1f} s")

plan = {
    "meta": {"day": 1, "total": 30, "title": "The Father Who Is Never Late", "dateLabel": "TUE 1 DEC", "ref": "Galatians 4:4–5",
             "verse": "But when the fulness of the time was come, God sent forth his Son, made of a woman, made under the law, to redeem them that were under the law, that we might receive the adoption of sons.",
             "declaration": "My Father in heaven is never late.", "truths": ["He is never late", "He sees you waiting", "He comes in the fulness of time"],
             "next": {"day": 2, "title": "A Father Who Sees", "ref": "Psalm 139:1–3", "dateLabel": "WED 2 DEC"},
             "presenter": {"name": "", "role": ""}},
    "fps": 30,
    "face": {"x": 0.47, "y": 0.36, "h": 0.34},
    "episode": episode,
    "trailer": {"16x9": trailer16, "9x16": trailer9},
    "shorts": [short],
}
(out / "plan.json").write_text(json.dumps(plan, indent=1), encoding="utf-8")
print(f"-> {out / 'plan.json'}  (sound stage fixture)")
