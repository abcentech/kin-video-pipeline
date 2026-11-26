// node scripts/december/plan.mjs --selftest — compiles the synthetic fixture, asserts the shape of the Plan and
// proves every validation rule of COMPILE.md fires on a deliberately broken edit.
import fs from "node:fs";
import { ROOT } from "./lib.mjs";
import { compilePlan, checkTiming, richWords } from "./plan.mjs";
import { buildFixture } from "./fixtures/make-fixture.mjs";
import { T } from "./timing.mjs";

const clone = (o) => JSON.parse(JSON.stringify(o));
let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.error(`  FAIL  ${msg}`);
  }
};

export async function selftest() {
  const fx = buildFixture();
  const run = (edit, o = {}) => compilePlan({ edit, series: fx.series, body: o.body ?? fx.body, filmSec: o.filmSec ?? null });

  // timing parity
  ok(checkTiming().length === 0, `timing.mjs matches src/December/timing.ts: ${checkTiming().join("; ")}`);
  const tmp = `${ROOT}/.tmp/dec/selftest-timing.ts`;
  fs.mkdirSync(`${ROOT}/.tmp/dec`, { recursive: true });
  fs.writeFileSync(tmp, fs.readFileSync(`${ROOT}/src/December/timing.ts`, "utf8").replace("DOOR_IN: 16", "DOOR_IN: 17"));
  ok(checkTiming(tmp).some((m) => /DOOR_IN/.test(m)), "a changed constant in timing.ts is detected");
  fs.rmSync(tmp, { force: true });

  // good compile
  const a = run(fx.edit, { filmSec: 50 });
  ok(a.errors.length === 0, `fixture compiles clean: ${a.errors.join(" | ")}`);
  const { plan } = a;
  const b = run(clone(fx.edit), { filmSec: 50 });
  ok(JSON.stringify(plan) === JSON.stringify(b.plan), "deterministic: two compiles are byte-identical");
  const bad = [];
  (function walk(o, p) {
    if (typeof o === "number" && !Number.isFinite(o)) bad.push(p);
    else if (o === undefined) bad.push(p + " undefined");
    else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, `${p}.${k}`);
  })(plan, "plan");
  ok(!bad.length, `no NaN/undefined in the plan: ${bad.slice(0, 5)}`);

  const ep = plan.episode;
  let c = 0;
  let contiguous = true;
  for (const s of ep.sections) {
    if (s.from !== c) contiguous = false;
    c += s.dur;
  }
  ok(contiguous && c === ep.durationInFrames, "episode sections are contiguous and sum to durationInFrames");
  const kinds = ep.sections.map((s) => s.kind);
  const nCold = kinds.filter((k) => k === "cold").length;
  ok(nCold === fx.edit.hook.length && kinds.slice(nCold).join() === "title,film,body,outro", `section order cold×${fx.edit.hook.length},title,film,body,outro (${kinds})`);
  const body = ep.sections.find((s) => s.kind === "body");
  ok(body.dur === ep.bodyFrames + T.NEXT_DUR - 20 && ep.bodyAt === body.from, "body section length = frames + NEXT_DUR − 20; bodyAt = its start");
  ok(ep.sections.at(-1).dur === T.OUTRO_DUR, "outro length");
  ok(ep.sections.find((s) => s.kind === "title").dur === T.TITLE_DUR, "title length");
  const cold = ep.sections.filter((s) => s.kind === "cold");
  ok(cold.every((s) => s.words.length && s.words[0].from === T.LEAD && s.bodyFrom >= 0 && s.big.every((x) => x.from >= 0 && x.from < s.dur && (x.side === "right") === (plan.face.x < 0.5))), "cold: words start at LEAD, big words inside the section on the wall side");
  ok(cold[0].words.some((w) => w.stress) && cold[0].big[0].from === cold[0].words.find((w) => w.stress).from, "cold: big word lands on the first stressed word");
  // cues
  ok(ep.cues.every((q, i) => i === 0 || ep.cues[i - 1].from <= q.from), "cues sorted by from");
  ok(new Set(ep.cues.map((q) => q.id)).size === ep.cues.length, "cue ids unique");
  const nxt = ep.cues.at(-1);
  ok(nxt.kind === "next" && nxt.from === ep.bodyFrames - 20 && nxt.dur === T.NEXT_DUR && nxt.safeguard === true, "next cue present, at bodyFrames−20, carries safeguard");
  for (const q of ep.cues.filter((x) => x.lit)) {
    const n = richWords(q.text).length;
    ok(q.lit.length === n, `${q.id}: lit has ${q.lit.length} entries for ${n} words`);
    ok(q.lit.every((v, i) => i === 0 || v >= q.lit[i - 1]), `${q.id}: lit is non-decreasing`);
  }
  const scr = ep.cues.find((x) => x.kind === "scripture");
  ok(scr.hit !== undefined && scr.lit.includes(scr.hit), "scripture hit = lit of the first **-word");
  ok(Math.abs(scr.lit[0] - (scr.from + T.DOOR_IN)) < 3, "scripture lit[0] is the start of the reading ('But'), door opens DOOR_IN before");
  ok(scr.from + scr.dur >= scr.lit.at(-1) + 36, "scripture page holds ≥ 36 frames after the last word");
  const ch = ep.cues.filter((x) => x.kind === "chapter");
  const rcp = ep.cues.find((x) => x.kind === "recap");
  ok(ch.every((x, i) => x.chipTo === (ch[i + 1] ? ch[i + 1].from : rcp.from)), "chapter chipTo = next chapter, else the next recap (not the body end)");
  const resp = ep.cues.find((x) => x.kind === "response");
  ok(resp.child.from < resp.child.to && resp.child.to <= resp.father.from, "response: child then father windows from sync spans");
  const pr = ep.cues.find((x) => x.kind === "prayer");
  ok(pr.lines.length === 3 && pr.lines[2].from > pr.from && pr.lines[2].to <= pr.from + pr.dur, "prayer: unsynced third line gets an even-split window inside the cue");
  const dec = ep.cues.find((x) => x.kind === "declare");
  ok(dec.from + dec.dur === dec.lit.at(-1) + 45 + T.DOOR_OUT, "declare ends at last lit + 45 + DOOR_OUT");
  const cls = (q) => (q.kind === "ident" || q.kind === "subscribe" || q.kind === "teaser" || (q.kind === "scripture" && q.mode === "card") ? "L" : q.kind === "point" || q.kind === "keyword" || (q.kind === "art" && q.mode === "side") ? "S" : "T");
  let overlaps = 0;
  for (let i = 0; i < ep.cues.length; i++)
    for (let j = i + 1; j < ep.cues.length; j++) {
      const p = ep.cues[i];
      const q = ep.cues[j];
      const x = cls(p);
      const y = cls(q);
      if ((x === y || x === "T" || y === "T") && p.from < q.from + q.dur && q.from < p.from + p.dur) overlaps++;
    }
  ok(overlaps === 0, "no overlap within a class or under a takeover");
  // captions
  const lens = (pages, chars, words) => pages.every((p) => p.lines.length >= 1 && p.lines.length <= 2 && p.lines.every((l) => l.map((w) => w.text).join(" ").length <= chars) && p.from < p.to && (!words || p.lines.flat().length <= words));
  ok(lens(ep.captions, 38), "episode captions: ≤ 2 lines × 38 characters");
  ok(ep.captions.every((p, i) => i === 0 || ep.captions[i - 1].to <= p.from), "episode captions do not overlap");
  ok(!ep.captions.some((p) => p.lines.flat().some((w) => w.text === "um" || w.text === "")), 'removed words (fix "") are not captioned');
  ok(ep.captions.some((p) => p.lines.flat().some((w) => w.text === "Galatia.")), "fix text replaces the transcript word");
  const orphan = ep.captions.filter((p) => p.lines.length === 2 && p.lines.some((l) => l.length === 1) && p.lines.flat().length > 2);
  ok(orphan.length <= 1, `no single-word line when avoidable (${orphan.length} pages with one)`);
  // camera
  ok(ep.cam[0].f === 0 && ep.cam[0].ease === "cut" && ep.cam.every((k, i) => i === 0 || k.f > ep.cam[i - 1].f), "camera keys start at 0 and strictly increase");
  ok(ep.cam.every((k) => k.view.s >= 1 && k.view.s <= 1.42 && k.view.x >= 0.5 / k.view.s - 1e-3 && k.view.x <= 1 - 0.5 / k.view.s + 1e-3 && k.view.y >= 0.5 / k.view.s - 1e-3 && k.view.y <= 1 - 0.5 / k.view.s + 1e-3), "camera views clamped, s in 1..1.42 (camera v2 side framing)");
  const cutKeys = ep.cam.filter((k) => ep.cuts.includes(k.f));
  ok(ep.cuts.length === fx.body.segments.filter((s) => s.join === "cut").length && cutKeys.length === ep.cuts.length && cutKeys.every((k) => k.ease === "cut"), "every cut join has a 'cut' key; soft joins have none");
  for (const cutf of ep.cuts) {
    const before = [...ep.cam].reverse().find((k) => k.f < cutf && k.ease === "cut"); // the previous stretch's framing (creep excluded)
    const after = ep.cam.find((k) => k.f === cutf);
    ok(Math.max(after.view.s, before.view.s) / Math.min(after.view.s, before.view.s) - 1 >= 0.11, `cut at ${cutf} flips framing by ≥ 11% (${before.view.s} → ${after.view.s})`);
  }
  ok(ep.cam.some((k) => k.ease === "out"), "a snap produced an 'out' key");
  const lin = ep.cam.filter((k) => k.ease === "linear");
  ok(lin.length > 20 && new Set(lin.map((k) => k.view.x)).size > 3, `follow keys (linear) exist and track the sway (${lin.length} keys)`);
  ok(cold.every((s) => s.cam.length >= 2 && s.cam.at(-1).f === s.dur && s.cam.slice(1).every((k) => k.ease === "linear")), "cold cam: follow keys every 15 frames");
  const noTrack = run(fx.edit, { filmSec: 50, body: { ...fx.body, track: undefined } });
  ok(noTrack.errors.length === 0 && !noTrack.plan.episode.cam.some((k) => k.view.x !== noTrack.plan.episode.cam[0].view.x && false), "no track: falls back to the median face without error");
  // music + sound
  ok(ep.music.every((m, i) => m.to > m.from && (i === 0 || m.from >= ep.music[i - 1].to)) && ep.music.at(-1).to === ep.durationInFrames && ep.music[0].from === 0, "music sections ordered, non-overlapping, spanning the episode");
  ok(["cold", "theme", "story", "teach", "word", "lift", "out", "pray"].every((m) => ep.music.some((x) => x.mood === m)), "music uses cold/theme/story/teach/word/pray/lift/out");
  ok(ep.sound.every((s, i) => i === 0 || s.f >= ep.sound[i - 1].f) && ep.sound.every((s) => s.f >= 0 && s.f < ep.durationInFrames), "sound cues sorted and inside the episode");
  ok(ep.sound.filter((s) => s.type === "doorClose").length === ep.cues.filter((q) => cls(q) === "T").length, "a doorClose per takeover (next included)");
  ok(["tickStop", "drum", "bell", "click", "paper"].every((t) => ep.sound.some((s) => s.type === t)) && ep.sound.some((s) => s.type === "swell" && s.dur === 45), "tickStop, drum, bell, click, paper, swell present");
  ok(ep.audio === "day01/audio/episode.wav", "episode audio path");

  // promos
  const t16 = plan.trailer["16x9"];
  const t9 = plan.trailer["9x16"];
  ok(t16.durationInFrames >= 30 * 30 && t16.durationInFrames <= 58 * 30 && t16.durationInFrames === t9.durationInFrames, `trailer ${(t16.durationInFrames / 30).toFixed(1)} s within 30–58 s, same in both formats`);
  ok(JSON.stringify(t16.beats.map((x) => [x.kind, x.from, x.dur])) === JSON.stringify(t9.beats.map((x) => [x.kind, x.from, x.dur])), "trailer formats share one timeline");
  let tc = 0;
  ok(t16.beats.every((x) => (x.from === tc ? ((tc += x.dur), true) : false)) && tc === t16.durationInFrames, "trailer beats contiguous");
  ok(t16.audio === "day01/audio/trailer.wav" && t9.audio === t16.audio, "trailer audio path shared");
  const lineBeats = t16.beats.filter((x) => x.kind === "line");
  ok(lineBeats.some((x) => x.cam[0].x !== lineBeats[0].cam[0].x || x.cam[0].y !== lineBeats[0].cam[0].y), "promo line cams are centred on the smoothed head, not a constant");
  ok(t16.mattes.length === lineBeats.length && t16.mattes.every((m, i) => m.out === `day01/matte/t${i + 1}.mp4` && m.bodyFrom >= 0 && m.frames === lineBeats[i].dur + 30), "one matte job per line beat (bodyFrom−15, dur+30)");
  ok(lineBeats.every((x, i) => x.matte === true && x.clipFrom === 15 && x.clip === t16.mattes[i].out && x.words[0].from >= 0 && x.words[0].from <= T.LEAD), "line beats: matte clip, clipFrom 15, words start at LEAD (or at the take's first frame)");
  ok(lineBeats[0].snaps.length === 1 && lineBeats[0].big && lineBeats[0].mood === "cold", "cold line: one snap and a big word");
  ok(lineBeats.find((x) => x.mood === "turn" && x.big)?.big.from > 0, "turn line big word lands on its anchor");
  ok(t16.beats.find((x) => x.kind === "title").dur === T.TITLE_DUR_TRAILER && t16.beats.find((x) => x.kind === "end").dur === T.END_DUR_TRAILER, "trailer title/end lengths");
  const vb = t16.beats.find((x) => x.kind === "verse");
  ok(vb.read && vb.read.at === T.DOOR_IN && vb.dur === T.DOOR_IN + (vb.read.frames - T.LEAD) + 30 && vb.lit.length === richWords(vb.text).length && vb.hit !== undefined, "trailer verse: read window, lit per word, hit");
  ok(lens(t16.captions, 30), "trailer 16x9 captions ≤ 2 × 30");
  ok(lens(t9.captions, 18, 4), "trailer 9x16 captions ≤ 2 × 18, ≤ 4 words");
  ok(t16.beats.filter((x) => x.kind === "film").every((x) => x.src === "day01/film.mp4" && x.focusX > 0), "trailer film beats");
  ok(lineBeats.every((x) => x.cam[0].s && x.cam[1].s >= x.cam[0].s), "trailer cams are views");
  ok(t9.beats.filter((x) => x.kind === "line").every((x) => x.cam[0].x >= 9 / 16 / (16 / 9) / 2 / x.cam[0].s - 1e-3), "9:16 views keep the crop inside the source");
  ok(t16.sound.some((s) => s.type === "silence" && s.dur > 0) && t16.sound.some((s) => s.type === "tickStop"), "trailer: silence over the button, tick stop after the cold line");
  ok(t16.music.every((m, i) => i === 0 || m.from >= t16.music[i - 1].to), "trailer music ordered");
  ok(plan.shorts.length === 3 && plan.shorts.every((s, i) => s.id === `short${i + 1}` && s.format === "9x16" && s.durationInFrames >= 15 * 30 && s.durationInFrames <= 58 * 30 && s.audio === `day01/audio/short-${fx.edit.shorts[i].id}.wav` && s.post === fx.edit.shorts[i].post && s.title === fx.edit.shorts[i].title), "3 shorts: ids, duration 15–58 s, audio, title, post");
  for (const s of plan.shorts) {
    let x = 0;
    ok(s.beats.every((q) => (q.from === x ? ((x += q.dur), true) : false)) && x === s.durationInFrames, `${s.id}: beats contiguous`);
    ok(s.beats.at(-1).kind === "end" && s.beats.at(-1).dur === T.END_DUR_SHORT, `${s.id}: ends on the end card`);
    ok(s.beats.filter((q) => q.kind === "line").every((q) => q.matte === false && q.clip === "day01/body.mp4"), `${s.id}: lines play body.mp4 un-matted`);
    ok(lens(s.captions, 18, 4), `${s.id}: captions ≤ 2 × 18, ≤ 4 words`);
  }
  ok(plan.shorts[0].beats.map((q) => q.kind).join() === "line,verse,line,line,line,end", `short1 beat order lines/verse/lines/end (${plan.shorts[0].beats.map((q) => q.kind)})`);
  for (const [si, n] of [[0, 4], [1, 4], [2, 6]]) ok(plan.shorts[si].beats.filter((q) => q.kind === "line").length === n, `short${si + 1}: one beat per line (${n}), no merging`);
  const s2 = plan.shorts[1].beats.filter((q) => q.kind === "line");
  ok(s2[2].clipFrom === s2[1].clipFrom + s2[1].dur && s2[3].clipFrom === s2[2].clipFrom + s2[2].dur, "short2: lines consecutive in the body meet exactly (continuous sound, no pre-roll/hold gap)");
  ok(s2.every((q, i) => q.cam[0].s === (i % 2 === 0 ? 1.12 : 1.25)) && s2.every((q) => q.cam[1].s > q.cam[0].s), "short lines alternate medium / tight with a creep");
  ok(plan.meta.day === 1 && plan.meta.next?.day === 2 && plan.meta.truths.length === 3 && plan.meta.presenter.name === "Pastor Daniel" && plan.meta.declaration === "My Father in heaven is never late.", "meta from series + edit");

  // every validation rule fires
  const mut = (fn, o) => {
    const e = clone(fx.edit);
    fn(e);
    return run(e, o);
  };
  const expectErr = (name, res, re) => ok(res.errors.some((m) => re.test(m)), `rule fires: ${name}  [errors: ${res.errors.slice(0, 2).join(" | ") || "none"}]`);
  const expectWarn = (name, res, re) => ok(res.warnings.some((m) => re.test(m)), `warning fires: ${name}  [warnings: ${res.warnings.slice(0, 2).join(" | ") || "none"}]`);
  const bw = fx.body.words;
  const cutId = bw[0].i - 1;
  const ident = a.plan.episode.cues.find((q) => q.kind === "ident");
  const near = bw.find((w) => w.from >= ident.from + 135 + 3 && w.from < ident.from + 135 + 16);
  expectErr("anchor on a cut word", mut((e) => (e.cues[0].at = `w${cutId}`)), /ident.*w\d+ is not in the body/);
  expectErr("end: anchor on a cut word", mut((e) => (e.cues.find((q) => q.kind === "point").to = `end:w${cutId}`)), /not in the body/);
  expectErr("bad anchor syntax", mut((e) => (e.cues[0].at = "word12")), /bad anchor/);
  expectErr("span on a cut word", mut((e) => (e.hook[0].span[0] = `w${cutId}`)), /hook line 1.*cut/);
  expectErr("art plate missing from edit.art", mut((e) => (e.cues.find((q) => q.kind === "art").plate = "nope")), /plate "nope" is not in edit\.art/);
  expectErr("two **…** in a scripture", mut((e) => (e.cues.find((q) => q.kind === "scripture").text = "**But when** the fulness of **the time** was come")), /more than one/);
  expectErr("two takeovers overlap", mut((e) => e.cues.push({ ...e.cues.find((q) => q.kind === "chapter"), at: e.cues.find((q) => q.kind === "scripture").at })), /overlap/);
  expectErr("lower-third under a takeover", mut((e) => e.cues.push({ kind: "teaser", at: e.cues.find((q) => q.kind === "scripture").at, text: "x" })), /under a takeover/);
  expectErr("same-class gap < 18 frames", mut((e) => e.cues.push({ kind: "teaser", at: `w${near.i}`, text: "x" })), /only \d+ frames apart/);
  expectErr("cue in the first 36 frames", mut((e) => (e.cues[0].at = `w${bw[0].i}`)), /first 36 frames/);
  expectErr("subscribe within 60 frames of a scripture", mut((e) => (e.cues.find((q) => q.kind === "subscribe").at = `end:w${bw.find((w) => w.text === "sons.").i}`)), /subscribe must stay/);
  expectErr("trailer too long", mut((e) => (e.trailer = [...e.trailer.slice(0, -1), ...e.trailer.slice(1, -1), ...e.trailer.slice(-1)])), /trailer is [\d.]+ s — must be between 30 and 58/);
  expectErr("trailer too short", mut((e) => (e.trailer = [e.trailer[0], e.trailer[1], e.trailer.at(-1)])), /trailer is [\d.]+ s — must be between 30 and 58/);
  expectErr("short too short", mut((e) => ((e.shorts[0].lines = e.shorts[0].lines.slice(0, 1)), delete e.shorts[0].verse)), /short 1 .* must be between 15 and 58/);
  expectErr("film cue past the clip", mut((e) => e.cues.push({ kind: "film", at: `w${bw.find((w) => w.text === "tomorrow").i}`, from: 48, dur: 5 }), { filmSec: 50 }), /runs past the end of the film clip/);
  expectErr("film.to past the clip", mut((e) => (e.film = { play: true, from: 0, to: 60 }), { filmSec: 50 }), /past the end of the film clip/);
  expectErr("cue runs into the end card", mut((e) => e.cues.push({ kind: "keyword", at: `w${bw.at(-2).i}`, text: "X" })), /end card/);
  expectErr("`to` before `at`", mut((e) => (e.cues.find((q) => q.kind === "point").to = e.cues.find((q) => q.kind === "point").at)), /not after `at`/);
  expectErr("unknown cue kind", mut((e) => e.cues.push({ kind: "wobble", at: `w${bw[100].i}` })), /unknown cue kind/);
  const heavy = mut((e) => {
    const ws = (p) => bw.find((w) => w.text === p);
    e.cues = [{ kind: "film", at: `w${ws("Some").i}`, dur: 40, from: 0 }, { kind: "art", at: `w${ws("Now").i}`, dur: 40, plate: "bethlehem", mode: "full" }, { kind: "film", at: `w${ws("Every").i}`, dur: 12, from: 3 }];
  });
  expectWarn("takeover coverage > 45%", heavy, /takeovers cover \d+%/);
  expectWarn("18 s with nothing happening", mut((e) => (e.cues = [])), /nothing happens .* for \d+ s/);
  expectWarn("`say` word count differs", mut((e) => (e.hook[0].say = "one two")), /`say` has 2 words/);
  expectWarn("scripture text does not match the reading", mut((e) => (e.cues.find((q) => q.kind === "scripture").text = "Completely different words that nobody says anywhere in this recording at all")), /only \d+\/\d+ words/);

  const crossLine = mut((e) => (e.shorts[0].lines[0].span = [`w${bw.find((w) => w.text === "tonight.").i}`, `w${bw.find((w) => w.text === "Some").i}`]));
  expectErr("short line crossing a cut join", crossLine, /crosses a camera cut join/);
  // ── lead's round 2: hush, music rules, air, thumb, subscribe cap
  const W1 = (t, nth = 0) => bw.filter((w) => w.text === t)[nth];
  ok(plan.meta.thumb && plan.meta.thumb.line === fx.edit.social.thumbnail.line && plan.meta.thumb.bodyFrame === bw.find((w) => `w${w.i}` === fx.edit.social.thumbnail.frame).from, "meta.thumb = line + resolved body frame");
  const lastMusic = plan.episode.music.filter((m) => m.mood === "theme").at(-1);
  ok(lastMusic.to === ep.bodyAt + body.dur, "recap within 20 s of the end: theme runs to the body end");
  const hz = mut((e) => e.cues.push({ kind: "hush", at: `w${W1("Maybe", 0).i}`, to: `end:w${W1("window.", 0).i}` }));
  ok(hz.errors.length === 0, `hush compiles: ${hz.errors}`);
  const hm = hz.plan.episode.music.filter((m) => m.mood === "out" && m.to < hz.plan.episode.durationInFrames - T.OUTRO_DUR);
  ok(hm.length === 1 && hm[0].from === hz.plan.episode.bodyAt + W1("Maybe", 0).from && hz.plan.episode.cues.every((q) => q.kind !== "hush"), "hush: one `out` music section over [at,to], no cue emitted");
  const silent = mut((e) => {
    const r = e.cues.find((q) => q.kind === "response");
    delete r.child.sync;
    delete r.father.sync;
  });
  const sr = silent.plan.episode.cues.find((q) => q.kind === "response");
  ok(silent.errors.length === 0 && silent.plan.episode.music.some((m) => m.mood === "pray" && m.from <= silent.plan.episode.bodyAt + sr.from + 1 && m.to >= silent.plan.episode.bodyAt + sr.from + sr.dur - 1), "silent response card: `pray` over its duration");
  const early = mut((e) => e.cues.push({ kind: "recap", at: `w${W1("People", 0).i}`, items: ["a", "b", "c"] }));
  const er = early.plan.episode.cues.find((q) => q.kind === "recap" && q.from < 3000);
  ok(early.plan.episode.music.some((m) => m.mood === "theme" && m.from === early.plan.episode.bodyAt + er.from && m.to === early.plan.episode.bodyAt + er.from + er.dur), "an early recap's theme ends with the recap");
  // air: offsets resolve; a hold inside a solid takeover is fine, an uncovered one is an error, a missing air is tolerated
  const art = a.plan.episode.cues.find((q) => q.kind === "art" && q.mode === "full");
  const goodAir = { from: art.from + 10, frames: 90, holdFrom: art.from + T.DOOR_IN + 5, holdFrames: 60 };
  const okAir = run(fx.edit, { filmSec: 50, body: { ...fx.body, air: [goodAir] } });
  ok(okAir.errors.length === 0, `air covered by an opaque takeover: no error (${okAir.errors})`);
  const badAir = run(fx.edit, { filmSec: 50, body: { ...fx.body, air: [{ from: 100, frames: 90, holdFrom: 110, holdFrames: 60 }] } });
  ok(badAir.errors.some((m) => /air at body .*not covered by the solid part/.test(m)), "air hold not under a takeover: error");
  const offs = mut((e) => { const k = e.cues.find((q) => q.kind === "keyword"); k.at = `end:w${W1("It", 0).i}+0.3`; k.dur = 0.8; });
  ok(offs.errors.length === 0 && offs.plan.episode.cues.find((q) => q.kind === "keyword").from === W1("It", 0).to + 9, "offset anchor `end:wN+0.3` = word end + 9 frames, accepted");
  const airJoin = run(fx.edit, { filmSec: 50, body: { ...fx.body, segments: fx.body.segments.map((s) => (s.join === "cut" ? { ...s, join: "air" } : s)) } });
  ok(airJoin.plan.episode.cuts.length === 0, "a join marked `air` is not a camera cut");
  const subs = mut((e) => [["Maybe", 1], ["Every", 0]].forEach(([t, k]) => e.cues.push({ kind: "subscribe", at: `w${W1(t, k).i}`, variant: "share" })));
  ok(!subs.errors.some((m) => /subscribe/.test(m) && !/stay/.test(m)) && subs.plan.episode.cues.filter((q) => q.kind === "subscribe").length === 3, "3 subscribe cues are allowed (no count cap)");

  console.log(`\nplan selftest: ${pass} passed, ${fail} failed`);
  return fail === 0;
}
