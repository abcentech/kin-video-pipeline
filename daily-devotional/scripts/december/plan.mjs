// scripts/december/plan.mjs — compile an Edit into a Plan (december/COMPILE.md).
//
//   node scripts/december/plan.mjs <N> [--edit=path] [--body=path] [--series=path] [--out=path] [--quiet]
//   node scripts/december/plan.mjs --selftest
//
// Inputs : december/edits/dayNN.json, december/series.json, december-public/dayNN/body.json, film.mp4 length
// Output : december-public/dayNN/plan.json (+ out/december/DayNN/qc/running-order.txt)
// Deterministic: same inputs -> byte-identical plan.json (no clocks, no randomness, fixed key order).
//
// Conventions chosen where COMPILE.md is silent (also listed in the hand-off report):
//  * Cue-level numbers (`from`, `lit[]`, `hit`, response/prayer line windows, `chipTo`) are BODY frames, absolute.
//    Section-level (`cold.words`, `cold.big.from`, cold `cam`) and promo-beat-level numbers are relative to the section / beat.
//  * `lit` with no sync/read: cue.from + 20, then 2.6 words/s.
//  * `next` carries `safeguard: true` when the edit asks for it (the Plan type has no other place for it).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, pad, readJson, writeJson, exists, loadSeries, loadEdit, ffprobe } from "./lib.mjs";
import { T } from "./timing.mjs";

const FPS = 30;
const SCALE = { wide: 1.0, medium: 1.12, tight: 1.25 };
const r4 = (v) => Math.round(v * 10000) / 10000;
export const tc = (f) => {
  const s = f / FPS;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
};

// ───────────────────────────────────────────── T parity with src/December/timing.ts
export function checkTiming(file = `${ROOT}/src/December/timing.ts`) {
  if (!fs.existsSync(file)) return [`${file} is missing`];
  const src = fs.readFileSync(file, "utf8");
  const m = /export const T = \{([\s\S]*?)\}\s*as const/.exec(src);
  if (!m) return ["could not find `export const T = {...} as const` in src/December/timing.ts"];
  const ts = {};
  for (const line of m[1].split("\n")) {
    const l = line.replace(/\/\/.*$/, "").trim();
    if (!l) continue;
    const k = /^([A-Z_0-9]+)\s*:\s*(.+?),?$/.exec(l);
    if (!k) return [`cannot parse timing.ts line: ${line.trim()}`];
    ts[k[1]] = JSON.parse(k[2].replace(/,$/, ""));
  }
  const bad = [];
  for (const k of new Set([...Object.keys(ts), ...Object.keys(T)])) {
    if (JSON.stringify(ts[k]) !== JSON.stringify(T[k])) bad.push(`T.${k}: timing.ts = ${JSON.stringify(ts[k])}, timing.mjs = ${JSON.stringify(T[k])}`);
  }
  return bad;
}

// ───────────────────────────────────────────── rich text
/** Split a Rich string into words. `*x*` = stress, `**x**` = strong, `|` = forced break (flags the word before it). */
export function richWords(text) {
  const out = [];
  let cur = "";
  let strong = false;
  let stress = false;
  let cs = false;
  let ct = false;
  const flush = () => {
    if (cur) out.push({ w: cur, strong: cs, stress: ct, br: false });
    cur = "";
    cs = ct = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "*") {
      if (text[i + 1] === "*") {
        strong = !strong;
        i++;
      } else stress = !stress;
    } else if (ch === "|") {
      flush();
      if (out.length) out[out.length - 1].br = true;
    } else if (/\s/.test(ch)) flush();
    else {
      cur += ch;
      if (strong) cs = true;
      if (stress) ct = true;
    }
  }
  flush();
  return out;
}
export const plain = (text) => richWords(text).map((w) => w.w).join(" ");
const strongPairs = (text) => ((text.match(/\*\*/g) ?? []).length / 2) | 0;

const CANON = { thee: "you", thou: "you", ye: "you", you: "you", thy: "your", thine: "your", your: "your", hath: "has", hast: "has", doth: "does", saith: "says", unto: "to", wilt: "will", shalt: "shall" };
const norm = (w) => {
  const x = w.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]/g, "");
  return CANON[x] ?? x;
};

/**
 * Longest-common-subsequence alignment of text words to spoken words (normalised); returns one frame per text word:
 * the start of the matched spoken word, unmatched ones interpolated between neighbours (12 frames apart at the edges).
 */
export function alignLit(textWords, spoken) {
  const a = textWords.map(norm);
  const b = spoken.map((w) => norm(w.text));
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] && a[i] !== "" ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const match = new Array(n).fill(-1);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === b[j] && a[i] !== "" && dp[i][j] === dp[i + 1][j + 1] + 1) match[i++] = j++;
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const idx = match.map((j, i) => (j >= 0 ? i : -1)).filter((i) => i >= 0);
  const matched = idx.length;
  const STEP = Math.round(FPS / 2.6);
  const frames = new Array(n);
  if (!matched || !m) {
    const base = m ? spoken[0].from : 0;
    for (let i = 0; i < n; i++) frames[i] = base + Math.round((i * FPS) / 2.6);
    return { frames, matched: 0 };
  }
  for (const i of idx) frames[i] = spoken[match[i]].from;
  const first = idx[0];
  const last = idx[idx.length - 1];
  for (let i = first - 1; i >= 0; i--) frames[i] = Math.max(spoken[0].from, frames[i + 1] - STEP);
  for (let i = last + 1; i < n; i++) frames[i] = Math.min(spoken[m - 1].to, frames[i - 1] + STEP);
  for (let k = 0; k + 1 < idx.length; k++) {
    const i0 = idx[k];
    const i1 = idx[k + 1];
    for (let i = i0 + 1; i < i1; i++) frames[i] = Math.round(frames[i0] + ((frames[i1] - frames[i0]) * (i - i0)) / (i1 - i0));
  }
  for (let i = 1; i < n; i++) if (frames[i] < frames[i - 1]) frames[i] = frames[i - 1];
  return { frames, matched };
}
const readingPace = (n, start) => Array.from({ length: n }, (_, i) => start + 20 + Math.round((i * FPS) / 2.6));

// ───────────────────────────────────────────── captions
const sentEnd = (t) => /[.!?;:…]["”’')\]]*$/.test(t);
const lineLen = (ws) => ws.map((w) => w.text).join(" ").length;

function layout(ws, chars, nl) {
  if (ws.length === 1 || lineLen(ws) <= chars) return [ws];
  if (nl < 2) return null;
  let best = null;
  for (let k = 1; k < ws.length; k++) {
    const l1 = ws.slice(0, k);
    const l2 = ws.slice(k);
    if (lineLen(l1) > chars || lineLen(l2) > chars) continue;
    let score = Math.abs(lineLen(l1) - lineLen(l2));
    if (ws.length > 2 && (k === 1 || k === ws.length - 1)) score += 12;
    if (/,$/.test(l1[l1.length - 1].text)) score -= 4;
    if (!best || score < best.score) best = { score, lines: [l1, l2] };
  }
  return best ? best.lines : null;
}

/**
 * Page words into captions. words: [{text, from, to, stress?, pb?}] (pb = forced page break after this word).
 * opts: chars per line, lines per page, maxWords per page, pauseFrames (break at pauses >= this).
 */
export function pageCaptions(words, { chars, lines = 2, maxWords = Infinity, pauseFrames = 13.5 }) {
  const phrases = [];
  let cur = [];
  words.forEach((w, i) => {
    cur.push(w);
    const nx = words[i + 1];
    if (!nx || sentEnd(w.text) || w.pb || nx.from - w.to >= pauseFrames) {
      phrases.push(cur);
      cur = [];
    }
  });
  const fits = (ws) => ws.length <= maxWords && layout(ws, chars, lines) !== null;
  const raw = [];
  for (const ph of phrases) {
    let rest = ph.slice();
    while (rest.length) {
      let n = 1;
      while (n < rest.length && fits(rest.slice(0, n + 1))) n++;
      if (n < rest.length) {
        for (let k = n; k >= Math.ceil(n * 0.5); k--) {
          if (k < n && /[,;:]$/.test(rest[k - 1].text)) {
            n = k;
            break;
          }
        }
        if (rest.length - n === 1 && n > 1) n--;
      }
      raw.push(rest.slice(0, n));
      rest = rest.slice(n);
    }
  }
  const toWord = (w) => (w.stress ? { text: w.text, from: w.from, to: w.to, stress: true } : { text: w.text, from: w.from, to: w.to });
  const pages = [];
  let prevTo = -Infinity;
  for (const ws of raw) {
    const from = Math.max(ws[0].from - 4, prevTo, 0);
    const to = ws[ws.length - 1].to + 8;
    pages.push({ from, to, lines: layout(ws, chars, lines).map((l) => l.map(toWord)) });
    prevTo = to;
  }
  for (let i = 0; i + 1 < pages.length; i++) {
    if (pages[i + 1].from - pages[i].to < 20) pages[i].to = pages[i + 1].from;
  }
  return pages;
}

// ───────────────────────────────────────────── camera helpers
const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** The view at zoom s with the face (eyes on the upper-third line); shift = +1 face to the left third, -1 to the right third. */
export function makeView(face, s, { shift = 0, fmt = "16x9" } = {}) {
  const hw = fmt === "9x16" ? 9 / 16 / (16 / 9) / 2 : 0.5;
  const eyeY = face.y - 0.02;
  const x = face.x + (shift * 1) / (6 * s);
  const y = eyeY + 1 / (6 * s);
  return { s: r4(s), x: r4(clamp(x, hw / s, 1 - hw / s)), y: r4(clamp(y, 0.5 / s, 1 - 0.5 / s)) };
}

// ───────────────────────────────────────────── the compiler
const CLASS_NAME = { lower: "lower-third", takeover: "takeover", side: "side" };
const clsOf = (c) =>
  c.kind === "ident" || c.kind === "subscribe" || c.kind === "teaser" || (c.kind === "scripture" && c.mode === "card")
    ? "lower"
    : c.kind === "point" || c.kind === "keyword" || (c.kind === "art" && c.mode === "side")
      ? "side"
      : "takeover";

/**
 * @param {{ edit, series, body, filmSec?: number|null }} input
 * @returns {{ plan, errors: string[], warnings: string[] }}
 */
export function compilePlan({ edit, series, body, filmSec = null }) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);
  const day = edit.day;
  const dd = `day${pad(day)}`;
  const face = { x: body.face.x, y: body.face.y, h: body.face.h };
  const bodyFrames = Math.round(body.frames);
  const fixes = Object.fromEntries(Object.entries(edit.fix ?? {}).map(([k, v]) => [String(k).replace(/^w/, ""), v]));
  // smoothed head position (body.track every 15 frames): zero-phase low-pass ≈ 1.5 s + dead-zone 0.02; falls back to the median face
  const head = (() => {
    const tr = body.track;
    if (!Array.isArray(tr) || !tr.length) return () => face;
    const N = Math.max(1, Math.round(body.frames));
    const raw = [new Float64Array(N), new Float64Array(N)];
    for (let f = 0; f < N; f++) {
      let k = tr.findIndex((t) => t[0] > f);
      const a = k <= 0 ? tr[0] : tr[k - 1];
      const b = k < 0 ? tr[tr.length - 1] : tr[Math.max(k, 0)];
      const u = b[0] === a[0] ? 0 : clamp((f - a[0]) / (b[0] - a[0]), 0, 1);
      raw[0][f] = a[1] + (b[1] - a[1]) * u;
      raw[1][f] = a[2] + (b[2] - a[2]) * u;
    }
    const W = 22; // box half-width 22 frames, applied twice ≈ 1.5 s triangular, symmetric = zero phase
    const blur = (arr) => {
      const out = new Float64Array(N);
      const pre = new Float64Array(N + 1);
      for (let i = 0; i < N; i++) pre[i + 1] = pre[i] + arr[i];
      for (let i = 0; i < N; i++) {
        const lo = Math.max(0, i - W);
        const hi = Math.min(N, i + W + 1);
        out[i] = (pre[hi] - pre[lo]) / (hi - lo);
      }
      return out;
    };
    const sm = raw.map((a) => blur(blur(a)));
    const dz = sm.map((a) => {
      const out = new Float64Array(N);
      let h = a[0];
      for (let i = 0; i < N; i++) {
        const d = a[i] - h;
        if (Math.abs(d) > 0.02) h += d - Math.sign(d) * 0.02;
        out[i] = h;
      }
      return out;
    });
    return (f) => {
      const i = clamp(Math.round(f), 0, N - 1);
      return { x: r4(dz[0][i]), y: r4(dz[1][i]), h: face.h };
    };
  })();
  const rawWords = [...body.words].sort((a, b) => a.i - b.i);
  const words = rawWords.map((w) => {
    const fixed = Object.prototype.hasOwnProperty.call(fixes, String(w.i)) ? fixes[String(w.i)] : w.text;
    return { i: w.i, text: fixed, from: Math.round(w.from), to: Math.round(w.to) };
  });
  const byId = new Map(words.map((w) => [w.i, w]));
  const spokenAll = words.filter((w) => w.text !== "");
  // How long the picture may stay on him after a line's last word (body frames): "soft" = up to his next spoken word
  // (-3); "hard" = never into any OTHER voiced sound, including the little ones the transcript has no word for (an
  // "uh", a click before the next sentence: Day 1 short 3 and Day 2 short 3 ended on one, straight into the end card).
  // A short sound within 6 frames of the word is the word's own tail (a released consonant): it is kept whole.
  const voicedBody = body.voicedBody ?? [];
  const quietAfter = (lastId, lastTo) => {
    const nx = spokenAll[spokenAll.findIndex((w) => w.i === lastId) + 1];
    const soft = nx ? nx.from - lastTo - 3 : Infinity;
    let end = lastTo;
    let hard = Infinity;
    for (const r of voicedBody) {
      if (r[0] <= end + 2) continue; // the word's own run, or earlier
      if (r[0] - end <= 6 && r[1] - r[0] <= 8) {
        end = Math.max(end, r[1]);
        continue;
      }
      hard = r[0] - 2 - lastTo;
      break;
    }
    // …and never across a hard cut of the body: past it he is in another take, in another pose (Day 2's trailer
    // jumped to it for its last eight frames before the end card)
    hard = Math.min(hard, takeEnd(lastTo - 1) - lastTo);
    return { soft, hard, tail: end - lastTo };
  };
  const landHold = (lastId, lastTo, lo, hi) => {
    const q = quietAfter(lastId, lastTo);
    return Math.max(0, Math.min(Math.max(q.tail + 2, clamp(Math.min(hi, q.soft), lo, hi)), q.hard));
  };
  // The take a body frame belongs to: from the hard cut at or before it to the next hard cut. A promo line never
  // shows a frame of a neighbouring take at its head or tail (a flash of another pose).
  const takeStart = (f) => {
    let r = 0;
    for (const c of cuts) if (c <= f) r = c;
    return r;
  };
  const takeEnd = (f) => {
    for (const c of cuts) if (c > f) return c;
    return Infinity;
  };
  // The camera of a short's line (camera v2 for the 9:16 window). The window is narrow: the old two keys (his head at
  // the line's first and last frame, eased) let his face slide to the frame edge and be cut whenever he swayed in
  // between (Day 6 short 3; moments of the Day 1 and Day 2 shorts too). Now the frame is STEADY: one frame per line,
  // centred on the middle of his sway, when the sway fits; otherwise a slightly wider frame that holds still while
  // he is inside it and re-frames once, slowly, when he settles somewhere else (what an operator does) — it never
  // chases him. His head, frame by frame, comes from december/work/dayNN/headx.json
  // (scripts/december/grade/headx.py), mapped to body frames in planDay.
  const SHORT_HW = 1080 / 1350 / (16 / 9) / 2; // half the short's presenter window (1080x1350: src/December/theme.ts windowH), in source widths, at zoom 1
  const SHORT_NEED = 0.078; // half his head (cap) plus air to the frame edge
  const shortCam = (start, dur, s0, fmt, label, alt) => {
    const old = [makeView(head(start), s0, { fmt }), makeView(head(start + dur), s0 * 1.02, { fmt })];
    const hb = body.headBody;
    if (fmt !== "9x16" || !Array.isArray(hb) || hb.length < 2 || dur < 2) return { cam: old };
    const xs = [];
    for (let f = 0; f < dur; f++) xs.push(hb[Math.min(hb.length - 1, start + f)]);
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    const fy = head(start + Math.floor(dur / 2));
    const sFit = SHORT_HW / ((hi - lo) / 2 + SHORT_NEED);
    if (sFit >= 1.04) {
      const s = Math.min(s0, sFit);
      const at = { x: (lo + hi) / 2, y: fy.y, h: face.h };
      return { cam: [makeView(at, s, { fmt }), makeView(at, Math.min(s * 1.02, sFit), { fmt })] };
    }
    // He moves too far for one frame. The frame then behaves like a patient operator's: it stays where it is while
    // his head is inside a comfortable zone, and moves only as far as it must when he pushes past it (a dead zone,
    // run forwards and backwards over the line so it neither lags nor anticipates), with the corners rounded.
    // It never chases a sway, and his face can never reach the frame edge.
    const s = alt ? 1.06 : 1;
    const zone = SHORT_HW / s - 0.088; // how far his head centre may sit from the frame centre before the frame moves
    const hard = SHORT_HW / s - 0.07; // …and the most it may ever sit
    const pass = (order) => {
      const c = new Array(dur);
      let cx = xs[order[0]];
      for (const f of order) {
        cx = clamp(cx, xs[f] - zone, xs[f] + zone);
        c[f] = cx;
      }
      return c;
    };
    const idx = xs.map((_, f) => f);
    const fwd = pass(idx);
    const bwd = pass([...idx].reverse());
    let c = fwd.map((v, f) => (v + bwd[f]) / 2);
    const R = 9;
    c = c.map((_, f) => {
      let sum = 0;
      let n = 0;
      for (let d = -R; d <= R; d++) {
        sum += c[clamp(f + d, 0, dur - 1)];
        n++;
      }
      return clamp(sum / n, xs[f] - hard, xs[f] + hard);
    });
    const track = [];
    for (let f = 0; f < dur; f += 2) track.push([f, r4(c[f]), r4(face.y - face.h / 2)]);
    track.push([dur, r4(c[dur - 1]), r4(face.y - face.h / 2)]);
    const at0 = { x: c[0], y: fy.y, h: face.h };
    const at1 = { x: c[dur - 1], y: fy.y, h: face.h };
    return { cam: [makeView(at0, s, { fmt }), makeView(at1, s, { fmt })], track };
  };
  const sideOf = () => (face.x < 0.5 ? "right" : "left");
  const filmFrames = filmSec == null ? null : Math.round(filmSec * FPS);

  // ── anchors
  const anchorRe = /^(end:)?w(\d+)([+-]\d+(?:\.\d+)?)?$/;
  function frameOf(a, label) {
    const m = anchorRe.exec(String(a).trim());
    if (!m) {
      err(`${label}: bad anchor "${a}" (expected w123, w123+0.4, w123-0.2 or end:w123)`);
      return null;
    }
    const w = byId.get(Number(m[2]));
    if (!w) {
      err(`${label}: anchor "${a}" — word w${m[2]} is not in the body (it was cut, or there is no such word)`);
      return null;
    }
    return (m[1] ? w.to : w.from) + (m[3] ? Math.round(Number(m[3]) * FPS) : 0);
  }
  function spanOf(span, label) {
    if (!Array.isArray(span) || span.length !== 2) {
      err(`${label}: span must be ["wA","wB"]`);
      return null;
    }
    const ids = span.map((a) => anchorRe.exec(String(a).trim()));
    if (ids.some((m) => !m)) {
      err(`${label}: bad span anchor in ${JSON.stringify(span)}`);
      return null;
    }
    const [a, b] = ids.map((m) => Number(m[2]));
    for (const [n, m] of [[a, span[0]], [b, span[1]]]) if (!byId.has(n)) err(`${label}: span anchor "${m}" — word w${n} is not in the body (cut)`);
    if (!byId.has(a) || !byId.has(b)) return null;
    if (b < a) {
      err(`${label}: span ${span[0]}..${span[1]} runs backwards`);
      return null;
    }
    const ws = words.filter((w) => w.i >= a && w.i <= b);
    const spoken = ws.filter((w) => w.text !== "");
    return spoken.length ? spoken : null;
  }

  // ── a line's words (say replaces text; stress from *…*)
  function lineWords(line, label) {
    const ws = spanOf(line.span, label);
    if (!ws) return null;
    let out = ws.map((w) => ({ text: w.text, from: w.from, to: w.to }));
    if (line.say) {
      const rw = richWords(line.say);
      if (rw.length === out.length) out = out.map((w, k) => ({ text: rw[k].w, from: w.from, to: w.to, ...(rw[k].stress ? { stress: true } : {}), ...(rw[k].br ? { pb: true } : {}) }));
      else warn(`${label}: \`say\` has ${rw.length} words but the span has ${out.length}; kept the body's words (no stress)`);
    }
    return out;
  }
  const holdFrames = (line, dflt) => (line.hold !== undefined ? Math.round(line.hold * FPS) : dflt);
  const wordOut = (w) => (w.stress ? { text: w.text, from: w.from, to: w.to, stress: true } : { text: w.text, from: w.from, to: w.to });

  // ───────────────────────── cues
  const artById = new Map((edit.art ?? []).map((p) => [p.id, p]));
  const cues = [];
  const snaps = [];
  const hushes = [];
  const silentCards = new Set();
  (edit.cues ?? []).forEach((c, idx) => {
    const label = `cue #${idx + 1} (${c.kind}${c.kind === "scripture" ? " " + c.mode : ""}${c.ref ? " " + c.ref : ""}, at ${c.at})`;
    const at = frameOf(c.at, label);
    if (at == null) return;
    const sec = (v) => Math.round(v * FPS);
    const toF = c.to !== undefined ? frameOf(c.to, `${label} .to`) : null;
    if (c.to !== undefined && toF == null) return;
    if (toF !== null && toF <= at) return err(`${label}: \`to\` (${c.to}) is not after \`at\``);
    const syncWords = (span, l) => (span ? spanOf(span, `${label} ${l}`) : null);
    const base = { kind: c.kind };
    switch (c.kind) {
      case "snap":
        snaps.push(at);
        return;
      case "hush":
        if (toF == null) return err(`${label}: \`to\` is required`);
        hushes.push([at, toF]);
        return;
      case "ident":
        return cues.push({ ...base, from: at, dur: T.IDENT_DUR });
      case "chapter":
        return cues.push({ ...base, from: at, dur: T.CHAPTER_DUR, label: c.label, title: c.title, ...(c.numeral ? { numeral: c.numeral } : {}) });
      case "scripture": {
        const tw = richWords(c.text);
        if (strongPairs(c.text) > 1) err(`${label}: scripture text has more than one **…** phrase`);
        let from = at;
        let dur;
        let lit;
        const read = c.read ? spanOf(c.read, `${label} .read`) : null;
        if (c.read && !read) return;
        if (c.mode === "card") {
          dur = c.dur !== undefined ? sec(c.dur) : 150;
          if (read) lit = alignLit(tw.map((w) => w.w), read).frames;
          else lit = readingPace(tw.length, from);
        } else if (read) {
          from = read[0].from - T.DOOR_IN;
          dur = c.dur !== undefined ? sec(c.dur) : read[read.length - 1].to + 36 + T.DOOR_OUT - from;
          const al = alignLit(tw.map((w) => w.w), read);
          lit = al.frames;
          if (al.matched < tw.length * 0.5) warn(`${label}: only ${al.matched}/${tw.length} words of the text match what he says in the \`read\` span — check the span or the fixes`);
        } else {
          dur = c.dur !== undefined ? sec(c.dur) : Math.round(20 + (tw.length * FPS) / 2.6 + 36 + T.DOOR_OUT);
          lit = readingPace(tw.length, from);
        }
        const hi = tw.findIndex((w) => w.strong);
        return cues.push({ ...base, from, dur, mode: c.mode, ref: c.ref, text: c.text, lit, ...(c.flourish ? { flourish: true } : {}), ...(hi >= 0 ? { hit: lit[hi] } : {}) });
      }
      case "point": {
        const tw = richWords(c.text);
        const sync = syncWords(c.sync, ".sync");
        if (c.sync && !sync) return;
        const dur = toF !== null ? toF - at : c.dur !== undefined ? sec(c.dur) : Math.max(90, 12 * tw.length + 60);
        const lit = sync ? alignLit(tw.map((w) => w.w), sync).frames : readingPace(tw.length, at);
        return cues.push({ ...base, from: at, dur, text: c.text, side: c.side ?? sideOf(), lit });
      }
      case "keyword":
        return cues.push({ ...base, from: at, dur: c.dur !== undefined ? sec(c.dur) : T.KEYWORD_DUR, text: c.text, side: c.side ?? sideOf() });
      case "art": {
        const plate = artById.get(c.plate);
        if (!plate) return err(`${label}: plate "${c.plate}" is not in edit.art`);
        const dur = toF !== null ? toF - at : c.dur !== undefined ? sec(c.dur) : 180;
        return cues.push({ ...base, from: at, dur, src: `${dd}/art/${plate.id}.jpg`, mode: c.mode, side: c.side ?? sideOf(), ...(c.caption ? { caption: c.caption } : {}), lights: plate.lights ?? [], move: plate.move ?? "push", space: plate.space ?? "none" });
      }
      case "film": {
        const dur = toF !== null ? toF - at : c.dur !== undefined ? sec(c.dur) : 120;
        const srcFrom = sec(c.from);
        if (filmFrames != null && srcFrom + dur > filmFrames) err(`${label}: film shot ${c.from}s + ${(dur / FPS).toFixed(1)}s runs past the end of the film clip (${filmSec.toFixed(1)}s)`);
        return cues.push({ ...base, from: at, dur, src: `${dd}/film.mp4`, srcFrom });
      }
      case "subscribe":
        return cues.push({ ...base, from: at, dur: T.SUB_DUR, variant: c.variant ?? "subscribe" });
      case "teaser":
        return cues.push({ ...base, from: at, dur: T.TEASER_DUR, text: c.text });
      case "response":
      case "prayer": {
        if (toF == null) return err(`${label}: \`to\` is required`);
        const from = at;
        const end = toF + 20;
        const items = c.kind === "prayer" ? c.lines : [c.child ? ["child", c.child] : null, c.father ? ["father", c.father] : null].filter(Boolean).map(([k, v]) => ({ k, ...v }));
        if (!items.length) return err(`${label}: nothing to show (no ${c.kind === "prayer" ? "lines" : "child/father"})`);
        const slot = (i) => [from + T.DOOR_IN + Math.round(((end - from - T.DOOR_IN) * i) / items.length), from + T.DOOR_IN + Math.round(((end - from - T.DOOR_IN) * (i + 1)) / items.length)];
        const win = items.map((it, i) => {
          const sw = it.sync ? spanOf(it.sync, `${label} sync "${it.text.slice(0, 24)}"`) : null;
          if (it.sync && !sw) return null;
          return sw ? { text: it.text, from: sw[0].from, to: sw[sw.length - 1].to } : { text: it.text, from: slot(i)[0], to: slot(i)[1] };
        });
        if (win.some((x) => !x)) return;
        if (c.kind === "response" && items.every((it) => !it.sync)) silentCards.add(from);
        if (c.kind === "prayer") return cues.push({ ...base, from, dur: end - from, lines: win });
        const out = { ...base, from, dur: end - from };
        items.forEach((it, i) => (out[it.k] = win[i]));
        return cues.push(out);
      }
      case "declare": {
        const tw = richWords(c.text);
        const sync = syncWords(c.sync, ".sync");
        if (c.sync && !sync) return;
        const from = at - T.DOOR_IN;
        const lit = sync ? alignLit(tw.map((w) => w.w), sync).frames : readingPace(tw.length, from);
        const dur = toF !== null ? toF - from : lit[lit.length - 1] + 45 + T.DOOR_OUT - from;
        return cues.push({ ...base, from, dur, text: c.text, lit });
      }
      case "recap":
        return cues.push({ ...base, from: at, dur: c.dur !== undefined ? sec(c.dur) : T.RECAP_DUR, title: c.title ?? "TONIGHT", items: c.items });
      default:
        return err(`${label}: unknown cue kind "${c.kind}"`);
    }
  });

  const KORDER = ["ident", "chapter", "scripture", "point", "keyword", "art", "film", "subscribe", "teaser", "response", "prayer", "declare", "recap", "next"];
  cues.sort((a, b) => a.from - b.from || a.dur - b.dur || KORDER.indexOf(a.kind) - KORDER.indexOf(b.kind));
  cues.push({ kind: "next", from: bodyFrames - 20, dur: T.NEXT_DUR, ...(edit.safeguard ? { safeguard: true } : {}) });
  const counts = {};
  const cueList = cues.map((c) => {
    counts[c.kind] = (counts[c.kind] ?? 0) + 1;
    const { kind, from, dur, ...rest } = c;
    return { id: `${kind}${counts[c.kind]}`, from, dur, kind, ...rest };
  });
  // chapter chipTo
  const chapters = cueList.filter((c) => c.kind === "chapter");
  chapters.forEach((c, i) => {
    const nx = chapters[i + 1];
    const rc = cueList.find((q) => q.kind === "recap" && q.from > c.from);
    c.chipTo = nx ? nx.from : rc ? rc.from : bodyFrames;
  });
  // field order for chapter: chipTo after numeral — rebuild
  for (const c of chapters) {
    const { chipTo, ...r } = c;
    Object.keys(c).forEach((k) => delete c[k]);
    Object.assign(c, r, { chipTo });
  }

  // ── validation
  const cls = (c) => (c.kind === "next" ? "takeover" : clsOf(c));
  const span = (c) => `${c.id} (${c.from}–${c.from + c.dur}, ${CLASS_NAME[cls(c)]}, ${tc(c.from)}–${tc(c.from + c.dur)})`;
  const ov = (a, b) => a.from < b.from + b.dur && b.from < a.from + a.dur;
  const overlapping = new Set();
  for (let i = 0; i < cueList.length; i++) {
    for (let j = i + 1; j < cueList.length; j++) {
      const a = cueList[i];
      const b = cueList[j];
      const ca = cls(a);
      const cb = cls(b);
      const clash = (ca === cb) || ca === "takeover" || cb === "takeover";
      if (clash && ov(a, b)) {
        overlapping.add(`${i}:${j}`);
        err(`cues overlap: ${span(a)} and ${span(b)} — ${ca === cb ? `two ${CLASS_NAME[ca]} cues` : `a ${CLASS_NAME[ca === "takeover" ? cb : ca]} cue under a takeover`} may not overlap`);
      }
    }
  }
  for (const k of ["lower", "takeover", "side"]) {
    const L = cueList.map((c, i) => ({ c, i })).filter((x) => cls(x.c) === k);
    for (let n = 0; n + 1 < L.length; n++) {
      const a = L[n];
      const b = L[n + 1];
      if (overlapping.has(`${a.i}:${b.i}`)) continue;
      const gap = b.c.from - (a.c.from + a.c.dur);
      if (gap < 18) err(`${span(a.c)} and ${span(b.c)} — only ${gap} frames apart; same-class cues need ≥ 18`);
    }
  }
  for (const c of cueList) {
    if (c.kind === "next") continue;
    if (c.from < 36) err(`${span(c)} starts at body frame ${c.from}; nothing may start in the first 36 frames of the body`);
    if (c.from + c.dur > bodyFrames - 20) err(`${span(c)} runs into the end card (the \`next\` cue starts at body frame ${bodyFrames - 20})`);
  }
  for (const s of cueList.filter((c) => c.kind === "subscribe")) {
    for (const o of cueList.filter((c) => c.kind === "scripture" || c.kind === "prayer" || c.kind === "declare")) {
      const gap = Math.max(o.from - (s.from + s.dur), s.from - (o.from + o.dur));
      if (gap < 60) err(`${span(s)} is ${Math.max(gap, 0)} frames from ${span(o)} — subscribe must stay ≥ 60 frames from a scripture, prayer or declaration`);
    }
  }
  const tkCover = cueList.filter((c) => cls(c) === "takeover" && c.kind !== "next").reduce((s, c) => s + Math.max(0, Math.min(c.from + c.dur, bodyFrames) - Math.max(c.from, 0)), 0);
  const coverage = bodyFrames ? tkCover / bodyFrames : 0;
  if (coverage > 0.45) warn(`takeovers cover ${(coverage * 100).toFixed(0)}% of the body (limit 45%)`);

  // ── air: every hold must sit inside the solid part of an opaque takeover
  const airs = Array.isArray(body.air) ? body.air : [];
  const OPAQUE = new Set(["chapter", "scripture", "art", "film", "response", "declare", "recap", "next"]);
  for (const a of airs) {
    const h0 = a.holdFrom;
    const h1 = a.holdFrom + a.holdFrames;
    const ok = cueList.some((c) => OPAQUE.has(c.kind) && !(c.kind === "scripture" && c.mode === "card") && !(c.kind === "art" && c.mode === "side") && c.from + T.DOOR_IN <= h0 && h1 <= c.from + c.dur - T.DOOR_OUT);
    if (!ok) err(`air at body ${tc(a.from)} (frames ${a.from}–${a.from + a.frames}): its hold frames ${h0}–${h1} (${tc(h0)}–${tc(h1)}) are not covered by the solid part (from+DOOR_IN … from+dur−DOOR_OUT) of an opaque takeover cue — put a chapter/art/film/response/declare/recap cue over it`);
  }

  // ── body camera
  const cuts = (body.segments ?? []).filter((s, i) => i > 0 && s.join === "cut").map((s) => Math.round(s.body[0])).sort((a, b) => a - b);
  const bounds = [0, ...cuts, bodyFrames];
  const stretches = [];
  let prevFr = null;
  const cycle = ["wide", "medium", "tight", "medium"];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const a = bounds[i];
    const b = bounds[i + 1];
    let fr;
    if (i === 0) fr = "medium";
    else {
      const len = b - a;
      fr = len < 6 * FPS ? "tight" : len > 20 * FPS ? "wide" : prevFr === "medium" ? "wide" : "medium";
      if (fr === prevFr) fr = prevFr === "wide" ? "medium" : prevFr === "medium" ? "tight" : "medium";
    }
    prevFr = fr;
    stretches.push({ a, b, fr, s0: SCALE[fr] });
  }
  void cycle;
  // Camera style. "v1" (Day 1, approved as it is): the frame follows his head and slides aside and back for every
  // side caption. "v2" (default, from the producer's note on Day 3: "the shaky camera left and right movement can
  // really feel distracting"): the frame is LOCKED OFF for each shot (it only breathes in), it moves aside for side
  // captions at an edit point whenever one is near instead of sliding, and stays aside between captions that
  // follow each other.
  const CAMV = edit.camera === "v1" ? 1 : 2;
  // a locked-off centre for [a, b): the median head position, giving way only when he really leaves it
  const lockOf = (a, b) => {
    const xs = [];
    const ys = [];
    for (let f = a; f < Math.max(a + 1, b); f += 2) {
      const h = head(f);
      xs.push(h.x);
      ys.push(h.y);
    }
    const med = (v) => [...v].sort((p, q) => p - q)[Math.floor(v.length / 2)];
    let cx = med(xs);
    let cy = med(ys);
    const DX = 0.06;
    const DY = 0.05;
    const at = new Map();
    for (let f = a; f < Math.max(a + 1, b); f++) {
      const h = head(f);
      if (Math.abs(h.x - cx) > DX) cx = h.x - Math.sign(h.x - cx) * DX;
      if (Math.abs(h.y - cy) > DY) cy = h.y - Math.sign(h.y - cy) * DY;
      at.set(f, { x: r4(cx), y: r4(cy), h: face.h });
    }
    return (f) => at.get(clamp(Math.round(f), a, Math.max(a, b - 1)));
  };
  if (CAMV === 2) for (const st of stretches) st.lock = lockOf(st.a, st.b);
  const baseView = (f) => {
    const st = stretches.find((x) => f >= x.a && f < x.b) ?? stretches[stretches.length - 1];
    let s = st.s0;
    if (st.b - st.a > 8 * FPS) s = st.s0 * (1 + 0.025 * easeIO(clamp((f - st.a) / Math.max(1, st.b - st.a - 1), 0, 1)));
    if (CAMV === 2) return makeView(st.fr === "wide" ? face : st.lock(f), s);
    return makeView(st.fr === "wide" ? face : head(f), s);
  };
  let keys = [];
  const push = (f, view, ease, ev, fol = false) => keys.push({ f: Math.round(clamp(f, 0, Math.max(0, bodyFrames - 1))), view, ease, ev, fol, n: keys.length });
  for (const st of stretches) {
    push(st.a, baseView(st.a), "cut", true);
    if (st.fr === "wide") {
      if (st.b - st.a > 8 * FPS) push(st.b - 1, baseView(st.b - 1), "in-out", false);
    } else {
      for (let f = st.a + 15; f < st.b - 1; f += 15) push(f, baseView(f), "linear", false, true);
      if (st.b - 1 > st.a) push(st.b - 1, baseView(st.b - 1), "linear", false, true);
    }
  }
  const windows = [];
  const dropRanges = [];
  const sideCues = cueList.filter((x) => cls(x) === "side" && x.kind !== "next");
  if (CAMV === 1) {
    for (const c of sideCues) {
      const start = c.from;
      const end = c.from + c.dur;
      const cutIn = cuts.find((x) => x > start && x <= end + 14);
      if (cutIn !== undefined && cutIn <= start + 14) continue;
      const shift = c.side === "right" ? 1 : -1;
      const sv = (f) => makeView(head(f), 1.25, { shift });
      windows.push([start, end + 14]);
      dropRanges.push([start, cutIn ?? end + 14]);
      push(start, baseView(start), "in-out", true);
      push(start + 14, sv(start + 14), "in-out", true);
      const holdEnd = cutIn !== undefined ? cutIn - 1 : end;
      for (let f = start + 14 + 15; f < holdEnd; f += 15) push(f, sv(f), "linear", false);
      push(holdEnd, sv(holdEnd), "linear", false);
      if (cutIn === undefined) push(end + 14, baseView(end + 14), "in-out", true);
    }
  } else {
    const IN = 20; // frames to glide aside when no edit point is near
    const OUT = 24; // frames to glide back
    const NEAR_BEFORE = 90; // an edit point this close before the caption: go aside AT it (no glide)
    const NEAR_AFTER = 105; // an edit point this close after the caption: stay aside until it (no glide back)
    const JOIN = 150; // captions on the same side this close together: stay aside between them
    // 1. one window per caption, snapped to edit points
    const wins = sideCues
      .map((c) => {
        const start = c.from;
        const end = c.from + c.dur;
        const before = [...cuts].reverse().find((x) => x <= start && start - x <= NEAR_BEFORE);
        const after = cuts.find((x) => x > end && x - end <= NEAR_AFTER);
        return { a: before !== undefined ? before : Math.max(0, start - 6), aCut: before !== undefined || start - 6 <= 0, b: after !== undefined ? after : end, bCut: after !== undefined, shift: c.side === "right" ? 1 : -1 };
      })
      .sort((p, q) => p.a - q.a);
    // 2. join neighbours
    const merged = [];
    for (const w of wins) {
      const last = merged[merged.length - 1];
      if (last && last.shift === w.shift && w.a <= (last.bCut ? last.b : last.b + OUT) + JOIN) {
        last.b = Math.max(last.b, w.b);
        last.bCut = w.b >= last.b ? w.bCut : last.bCut;
      } else merged.push({ ...w });
    }
    // 3. keys
    for (const w of merged) {
      const endAll = w.bCut ? w.b : w.b + OUT; // the frame the base framing is back
      windows.push([w.a, endAll]);
      dropRanges.push([w.a - 1, w.bCut ? w.b - 1 : endAll]);
      const inside = cuts.filter((x) => x > w.a && x < w.b);
      const marks = [w.a, ...inside, w.b];
      for (let i = 0; i + 1 < marks.length; i++) {
        const a = marks[i];
        const b = marks[i + 1]; // this segment is [a, b)
        // One fixed framing for the segment, set by where he gets NEAREST the words in it (not by where he is on
        // average): Day 3's first point had him lean to within 30 px of the caption. His nearest lean now stays at
        // least a tenth of the frame clear of centre, tightening the shot (to 1.42 at most) when the recording has
        // him sitting toward the words' side.
        const hs = [];
        const ys = [];
        for (let f = a; f < Math.max(a + 1, b); f += 2) {
          const h = head(f);
          hs.push(h.x);
          ys.push(h.y);
        }
        const med = (v) => [...v].sort((p, q) => p - q)[Math.floor(v.length / 2)];
        // "nearest" is read from the unsmoothed track (a quick lean is over before the smoothed one shows it),
        // at its 97th percentile so one bad detection cannot throw the framing
        const rawXs = (Array.isArray(body.track) ? body.track : []).filter((t) => t[0] >= a && t[0] < Math.max(a + 1, b)).map((t) => t[1]).sort((p, q) => p - q);
        const pool = rawXs.length >= 8 ? rawXs : [...hs].sort((p, q) => p - q);
        const far = w.shift > 0 ? pool[Math.min(pool.length - 1, Math.floor(pool.length * 0.97))] : pool[Math.floor(pool.length * 0.03)];
        const sA = clamp(w.shift > 0 ? 0.6 / (1 - far) : 0.6 / far, 1.25, 1.42);
        const cx = w.shift > 0 ? Math.max(med(hs), far + 0.1 / sA - 1 / (6 * sA)) : Math.min(med(hs), far - 0.1 / sA + 1 / (6 * sA));
        const fixed = makeView({ x: cx, y: med(ys), h: face.h }, sA, { shift: w.shift });
        const sv = () => fixed;
        let from = a;
        if (i === 0 && !w.aCut) {
          push(a, baseView(a), "in-out", true);
          push(a + IN, sv(a + IN), "in-out", true);
          from = a + IN;
        } else push(a, sv(a), "cut", true); // pushed after the shot's own key at this frame, so it wins
        const holdTo = i + 2 === marks.length && !w.bCut ? b : b - 1;
        for (let f = from + 15; f < holdTo; f += 15) push(f, sv(f), "linear", false);
        if (holdTo > from) push(holdTo, sv(holdTo), "linear", false);
      }
      if (!w.bCut) push(endAll, baseView(endAll), "in-out", true);
    }
  }
  // a point line that cannot fit the side column runs left over him (the column is 740 px; the type will not go under 54 px)
  for (const c of cueList.filter((x) => x.kind === "point"))
    for (const l of String(c.text).split("|")) {
      const n = l.replace(/\*/g, "").trim().length;
      if (n > 26) warn(`${c.id}: point line is ${n} characters (“${l.replace(/\*/g, "").trim()}”) — over 26 runs out of the side column and can cross his face; break it with |`);
    }
  for (const f of snaps) {
    const hit = windows.some(([a, b]) => f >= a - 5 && f <= b) || cuts.some((x) => x >= f - 25 && x <= f + 25);
    if (hit) {
      warn(`snap at body frame ${f} (${tc(f)}) falls inside a side-cue move or within 25 frames of a camera cut — dropped`);
      continue;
    }
    const b0 = baseView(f);
    push(f, b0, "in-out", true);
    dropRanges.push([f, f + 25]);
    push(f + 5, makeView(head(f + 5), b0.s * 1.06), "out", true);
    push(f + 25, baseView(f + 25), "in-out", false);
  }
  keys = keys.filter((k) => !(k.fol && dropRanges.some(([a, b]) => k.f > a && k.f <= b)));
  keys.sort((a, b) => a.f - b.f || (a.ease === "cut" ? 1 : 0) - (b.ease === "cut" ? 1 : 0) || a.n - b.n);
  const collapsed = [];
  for (const k of keys) {
    if (collapsed.length && collapsed[collapsed.length - 1].f === k.f) collapsed[collapsed.length - 1] = k;
    else collapsed.push(k);
  }
  keys = collapsed;
  const cam = keys.map((k) => ({ f: k.f, view: k.view, ease: k.ease }));
  // quiet-stretch warning: no cue and no camera change for > 18 s
  const ev = [0, bodyFrames, ...keys.filter((k) => k.ev).map((k) => k.f)];
  for (const c of cueList) if (c.kind !== "next") ev.push(c.from, c.from + c.dur);
  for (const a of airs) ev.push(a.from, a.from + a.frames); // wordless air made for a silent takeover: not a quiet stretch
  ev.sort((a, b) => a - b);
  for (let i = 0; i + 1 < ev.length; i++) if (ev[i + 1] - ev[i] > 18 * FPS) warn(`nothing happens (no cue, no camera change) for ${((ev[i + 1] - ev[i]) / FPS).toFixed(0)} s from body ${tc(ev[i])} to ${tc(ev[i + 1])}`);

  // ── captions (body)
  const captions = pageCaptions(spokenAll, { chars: 38, lines: 2 });

  // ───────────────────────── episode sections
  const sections = [];
  let cur = 0;
  const sideWall = sideOf();
  const coldCam = (bodyFrom, dur, f0, f1, fmt = "16x9") => {
    const at = (f) => makeView(head(bodyFrom + f), f0 + ((f1 - f0) * f) / Math.max(1, dur), { fmt });
    const ks = [{ f: 0, view: at(0), ease: "cut" }];
    for (let f = 15; f < dur; f += 15) ks.push({ f, view: at(f), ease: "linear" });
    ks.push({ f: dur, view: at(dur), ease: "linear" });
    return ks;
  };
  (edit.hook ?? []).forEach((line, k) => {
    const label = `hook line ${k + 1}`;
    const lw = lineWords(line, label);
    if (!lw) return;
    // (a hook line stays inside its take too: never a frame of the neighbouring one at its head or tail)
    const bodyFrom = Math.max(0, lw[0].from - T.LEAD, takeStart(lw[0].from));
    const dur = Math.min(lw[lw.length - 1].to + holdFrames(line, 4), takeEnd(lw[lw.length - 1].to - 1)) - bodyFrom;
    const rel = lw.map((w) => ({ ...wordOut(w), from: w.from - bodyFrom, to: w.to - bodyFrom }));
    const big = [];
    if (line.big) {
      let on = line.big.on ? frameOf(line.big.on, `${label} big.on`) : null;
      if (on == null) {
        const sw = lw.find((w) => w.stress);
        on = sw ? sw.from : lw[0].from;
      }
      big.push({ text: line.big.text, from: on - bodyFrom, side: sideWall });
    }
    const f0 = line.cam ? SCALE[line.cam[0]] : 1.25;
    const f1 = line.cam ? SCALE[line.cam[1]] : 1.3;
    sections.push({ kind: "cold", from: cur, dur, bodyFrom, words: rel, big, cam: coldCam(bodyFrom, dur, f0, f1) });
    cur += dur;
  });
  if (!sections.length) warn("the edit has no hook (cold open)");
  const coldEnd = cur;
  sections.push({ kind: "title", from: cur, dur: T.TITLE_DUR });
  cur += T.TITLE_DUR;
  if (edit.film?.play) {
    const entry = day === 0 ? series.opener : series.days.find((d) => d.day === day);
    const clipSec = filmSec ?? entry?.film?.dur ?? null;
    const f0 = edit.film.from ?? 0;
    const f1 = edit.film.to ?? clipSec;
    if (f1 == null) err("film.play is set but the film length is unknown (no film.mp4 and no series film.dur) and film.to is not given");
    else if (f1 <= f0) err(`film.from (${f0}) / film.to (${f1}) give no film`);
    else {
      if (clipSec != null && f1 > clipSec + 0.05) err(`film.to (${f1}s) is past the end of the film clip (${clipSec.toFixed(1)}s)`);
      const dur = Math.round((f1 - f0) * FPS);
      sections.push({ kind: "film", from: cur, dur, src: `${dd}/film.mp4`, srcFrom: Math.round(f0 * FPS) });
      cur += dur;
    }
  }
  const bodyAt = cur;
  const bodyDur = bodyFrames + T.NEXT_DUR - 20;
  sections.push({ kind: "body", from: cur, dur: bodyDur });
  cur += bodyDur;
  sections.push({ kind: "outro", from: cur, dur: T.OUTRO_DUR, src: "outro/LikeShare_16x9.mp4" });
  cur += T.OUTRO_DUR;
  const episodeFrames = cur;

  // ── music + sound (episode timeline)
  const ep = (f) => bodyAt + f;
  const PRI = { teach: 1, theme: 2, word: 3, pray: 4, lift: 5, out: 6 };
  const layers = [];
  const bodyEnd = bodyAt + bodyDur;
  layers.push({ from: bodyAt, to: bodyEnd, mood: "teach" });
  for (const c of cueList) {
    if (c.kind === "scripture" && c.mode === "page") layers.push({ from: ep(c.from), to: ep(c.from + c.dur), mood: "word" });
    if (c.kind === "prayer") layers.push({ from: ep(c.from), to: ep(c.from + c.dur), mood: "pray" });
    if (c.kind === "declare") layers.push({ from: ep(c.from), to: ep(c.from + c.dur), mood: "lift" });
    if (c.kind === "response" && silentCards.has(c.from)) layers.push({ from: ep(c.from), to: ep(c.from + c.dur), mood: "pray" });
    if (c.kind === "recap") layers.push({ from: ep(c.from), to: bodyFrames - (c.from + c.dur) <= 600 ? bodyEnd : ep(c.from + c.dur), mood: "theme" });
  }
  const nextCue = cueList.find((c) => c.kind === "next");
  layers.push({ from: ep(nextCue.from), to: bodyEnd, mood: "theme" });
  for (const [a, b] of hushes) layers.push({ from: ep(a), to: ep(b), mood: "out" });
  const cuePts = [...new Set(layers.flatMap((l) => [l.from, l.to]))].sort((a, b) => a - b);
  const bodyMusic = [];
  for (let i = 0; i + 1 < cuePts.length; i++) {
    const a = cuePts[i];
    const b = cuePts[i + 1];
    const cover = layers.filter((l) => l.from <= a && l.to >= b);
    if (!cover.length) continue;
    const mood = cover.reduce((m, l) => (PRI[l.mood] > PRI[m] ? l.mood : m), cover[0].mood);
    const last = bodyMusic[bodyMusic.length - 1];
    if (last && last.mood === mood && last.to === a) last.to = b;
    else bodyMusic.push({ from: a, to: b, mood });
  }
  const music = [];
  if (coldEnd > 0) music.push({ from: 0, to: coldEnd, mood: "cold" });
  music.push({ from: coldEnd, to: coldEnd + T.TITLE_DUR, mood: "theme" });
  const filmSec2 = sections.find((s) => s.kind === "film");
  if (filmSec2) music.push({ from: filmSec2.from, to: filmSec2.from + filmSec2.dur, mood: "story" });
  music.push(...bodyMusic);
  music.push({ from: bodyEnd, to: episodeFrames, mood: "out" });

  const sound = [];
  const sc = (f, type, extra = {}) => sound.push({ f, type, ...extra });
  if (coldEnd > 0) {
    for (let f = 0; f < coldEnd; f += 30) sc(f, "tick");
    sc(coldEnd - 1, "tickStop");
    for (const s of sections.filter((x) => x.kind === "cold")) for (const b of s.big) sc(s.from + b.from, "hit", { weight: 2 });
  }
  sc(coldEnd + T.TITLE_DOOR, "door");
  sc(coldEnd + T.TITLE_HIT, "hit", { weight: 3 });
  for (const c of cueList) {
    const k = cls(c);
    if (k === "takeover") {
      sc(ep(c.from), "door");
      sc(ep(c.from + c.dur - T.DOOR_OUT), "doorClose");
    }
    if (c.kind === "scripture" && c.mode === "page") {
      sc(ep(c.from + 6), "paper");
      if (c.hit !== undefined) {
        sc(ep(c.hit - 45), "swell", { dur: 45 });
        sc(ep(c.hit), "hit", { weight: 2 });
      }
    }
    if (c.kind === "chapter") sc(ep(c.from + T.CHAPTER_HIT), "hit", { weight: 1 });
    if (c.kind === "keyword") sc(ep(c.from), "hit", { weight: 1 });
    if (c.kind === "subscribe") {
      sc(ep(c.from + T.SUB_PRESS), "click");
      sc(ep(c.from + T.SUB_BELL), "bell");
    }
    if (c.kind === "declare") {
      sc(ep(c.lit[0]), "drum");
      sc(ep(c.lit[c.lit.length - 1]), "hit", { weight: 3 });
    }
    if (c.kind === "next") sc(ep(c.from + T.NEXT_HIT), "hit", { weight: 2 });
  }
  const SO = ["tick", "tickStop", "door", "doorClose", "paper", "swell", "hit", "drum", "click", "bell", "silence"];
  sound.sort((a, b) => a.f - b.f || SO.indexOf(a.type) - SO.indexOf(b.type));

  const episode = { durationInFrames: episodeFrames, sections, bodyAt, bodyFrames, cuts, cam, captions, cues: cueList, music, sound, audio: `${dd}/audio/episode.wav` };

  // ───────────────────────── promos
  const promoCue = (v) => v; // placeholder for symmetry
  void promoCue;
  const viewPair = (fr, fmt, start, dur) => {
    const [a, b] = fr;
    const sa = SCALE[a];
    let sb = SCALE[b];
    if (a === b) sb = sa * 1.03;
    return [makeView(head(start), sa, { fmt }), makeView(head(start + dur), sb, { fmt })];
  };
  const verseBeat = (v, label) => {
    const tw = richWords(v.text);
    if (strongPairs(v.text) > 1) err(`${label}: verse text has more than one **…** phrase`);
    const hi = tw.findIndex((w) => w.strong);
    if (v.read) {
      const rd = spanOf(v.read, `${label} .read`);
      if (!rd) return null;
      const speech = rd[rd.length - 1].to - rd[0].from;
      const dur = T.DOOR_IN + speech + 30;
      const al = alignLit(tw.map((w) => w.w), rd);
      if (al.matched < tw.length * 0.5) warn(`${label}: only ${al.matched}/${tw.length} verse words match what he says in the \`read\` span`);
      const lit = al.frames.map((f) => T.DOOR_IN + T.LEAD + (f - rd[0].from));
      return { dur, ref: v.ref, text: v.text, lit, hit: hi >= 0 ? lit[hi] : undefined, read: { clip: `${dd}/body.mp4`, clipFrom: Math.max(0, rd[0].from - T.LEAD), frames: speech + T.LEAD, at: T.DOOR_IN }, firstId: byId.size ? rd[0].i : 0 };
    }
    const lit = readingPace(tw.length, 0);
    if (lit[lit.length - 1] > 126 - 10) warn(`${label}: verse without \`read\` is long for 126 frames (last word lights at ${lit[lit.length - 1]}); consider \`read\``);
    return { dur: 126, ref: v.ref, text: v.text, lit, hit: hi >= 0 ? lit[hi] : undefined, firstId: Infinity };
  };

  // trailer (common timeline)
  const tBeats = [];
  const mattes = [];
  let tcur = 0;
  let lineK = 0;
  (edit.trailer ?? []).forEach((b, i) => {
    const label = `trailer beat ${i + 1} (${b.kind}${b.mood ? " " + b.mood : ""})`;
    if (b.kind === "line") {
      const lw = lineWords(b, label);
      if (!lw) return;
      const start = Math.max(0, lw[0].from - T.LEAD, takeStart(lw[0].from));
      const speech = lw[lw.length - 1].to - lw[0].from;
      let dflt = b.mood === "cold" ? 4 : b.mood === "button" ? 20 : 8;
      if (b.mood === "button") {
        // the closing line lands before the end card: up to 26 frames after his last word, never into his next one
        const ids = spanOf(b.span, label) ?? [];
        dflt = ids.length ? landHold(ids[ids.length - 1].i, lw[lw.length - 1].to, 12, 26) : 26;
      }
      const dur = lw[0].from - start + speech + Math.max(0, Math.min(holdFrames(b, dflt), takeEnd(lw[lw.length - 1].to - 1) - lw[lw.length - 1].to));
      lineK++;
      let bigFrom;
      if (b.big) {
        const on = b.big.on ? frameOf(b.big.on, `${label} big.on`) : null;
        const sw = lw.find((w) => w.stress);
        bigFrom = (on ?? (sw ? sw.from : lw[0].from)) - start;
      }
      const stressed = lw.filter((w) => w.stress);
      tBeats.push({
        kind: "line", mood: b.mood, from: tcur, dur, start, k: lineK, words: lw.map((w) => ({ ...wordOut(w), from: w.from - start, to: w.to - start, ...(w.pb ? { pb: true } : {}) })),
        camFr: b.cam ?? { cold: ["tight", "tight"], tension: ["medium", "tight"], turn: ["wide", "medium"], button: ["tight", "tight"] }[b.mood] ?? ["medium", "medium"],
        big: b.big ? { text: b.big.text, from: bigFrom } : undefined,
        snaps: b.mood === "cold" && stressed.length ? [stressed[stressed.length - 1].from - start] : [],
      });
      const mf = Math.max(0, start - 15);
      let fr = dur + 30;
      if (mf + fr > bodyFrames) {
        warn(`${label}: matte range runs past the end of the body; clipped`);
        fr = bodyFrames - mf;
      }
      mattes.push({ out: `${dd}/matte/t${lineK}.mp4`, bodyFrom: mf, frames: fr, clipFrom: start - mf });
      tcur += dur;
    } else if (b.kind === "title") {
      tBeats.push({ kind: "title", from: tcur, dur: T.TITLE_DUR_TRAILER });
      tcur += T.TITLE_DUR_TRAILER;
    } else if (b.kind === "film") {
      const dur = Math.round(b.dur * FPS);
      const srcFrom = Math.round(b.from * FPS);
      if (filmFrames != null && srcFrom + dur > filmFrames) err(`${label}: film ${b.from}s + ${b.dur}s runs past the end of the film clip (${filmSec.toFixed(1)}s)`);
      const srcFrom9 = b.from9 != null ? Math.round(b.from9 * FPS) : undefined;
      if (srcFrom9 != null && filmFrames != null && srcFrom9 + dur > filmFrames) err(`${label}: film from9 ${b.from9}s + ${b.dur}s runs past the end of the film clip (${filmSec.toFixed(1)}s)`);
      tBeats.push({ kind: "film", from: tcur, dur, src: `${dd}/film.mp4`, srcFrom, focusX: b.focusX ?? 50, ...(srcFrom9 != null ? { srcFrom9 } : {}), ...(b.top9 != null ? { top9: clamp(b.top9, 0.6, 0.8) } : {}) });
      tcur += dur;
    } else if (b.kind === "verse") {
      const v = verseBeat(b, label);
      if (!v) return;
      tBeats.push({ kind: "verse", from: tcur, ...v });
      tcur += v.dur;
    } else if (b.kind === "end") {
      tBeats.push({ kind: "end", from: tcur, dur: T.END_DUR_TRAILER });
      tcur += T.END_DUR_TRAILER;
    } else err(`${label}: unknown beat kind`);
  });
  const trailerFrames = tcur;
  if (!tBeats.length) err("the edit has no trailer beats");
  else if (trailerFrames < 30 * FPS || trailerFrames > 58 * FPS) err(`trailer is ${(trailerFrames / FPS).toFixed(1)} s — must be between 30 and 58 s (target 35–50 s)`);
  else if (trailerFrames < 35 * FPS || trailerFrames > 50 * FPS) warn(`trailer is ${(trailerFrames / FPS).toFixed(1)} s (target 35–50 s)`);
  if (!tBeats.some((b) => b.kind === "end")) err("trailer has no `end` beat");
  if (!tBeats.some((b) => b.kind === "title")) err("trailer has no `title` beat");

  const trailerMusicMood = { cold: "cold", tension: "story", turn: "lift" };
  const buildTrailer = (fmt) => {
    const lim = fmt === "16x9" ? { chars: 30, lines: 2 } : { chars: 18, lines: 2, maxWords: 4 };
    const beats = [];
    let captionsP = [];
    for (const b of tBeats) {
      if (b.kind === "line") {
        const [c0, c1] = viewPair(b.camFr, fmt, b.start, b.dur);
        beats.push({ kind: "line", mood: b.mood, from: b.from, dur: b.dur, clip: `${dd}/matte/t${b.k}.mp4`, matte: true, clipFrom: mattes[b.k - 1].clipFrom, words: b.words.map(({ pb, ...w }) => w), cam: [c0, c1], ...(b.big ? { big: b.big } : {}), snaps: b.snaps });
        const abs = b.words.map((w) => ({ ...w, from: b.from + w.from, to: b.from + w.to }));
        const pages = pageCaptions(abs, lim).map((p) => ({ ...p, from: Math.max(p.from, b.from), to: Math.min(p.to, b.from + b.dur) }));
        captionsP = captionsP.concat(pages);
      } else if (b.kind === "verse") {
        const { firstId, ...rest } = b;
        beats.push(rest);
      } else beats.push({ ...b });
    }
    return { beats, captions: captionsP };
  };
  const tMusic = [];
  const addMusic = (arr, from, to, mood) => {
    const l = arr[arr.length - 1];
    if (l && l.mood === mood && l.to === from) l.to = to;
    else arr.push({ from, to, mood });
  };
  const tSound = [];
  const ts = (f, type, extra = {}) => tSound.push({ f, type, ...extra });
  for (const b of tBeats) {
    const end = b.from + b.dur;
    if (b.kind === "line") {
      if (b.mood === "button") ts(b.from, "silence", { dur: b.dur });
      else addMusic(tMusic, b.from, end, trailerMusicMood[b.mood] ?? "story");
      if (b.mood === "cold") {
        for (let f = b.from; f < end; f += 30) ts(f, "tick");
        ts(end - 1, "tickStop");
      }
      if (b.big) ts(b.from + b.big.from, "hit", { weight: b.mood === "turn" ? 3 : 2 });
    } else if (b.kind === "title") {
      addMusic(tMusic, b.from, end, "theme");
      ts(b.from + T.TITLE_DOOR_TRAILER, "door");
      ts(b.from + T.TITLE_HIT_TRAILER, "hit", { weight: 3 });
    } else if (b.kind === "film") addMusic(tMusic, b.from, end, "story");
    else if (b.kind === "verse") {
      addMusic(tMusic, b.from, end, "word");
      ts(b.from, "door");
      if (b.hit !== undefined) {
        ts(b.from + b.hit - 45, "swell", { dur: 45 });
        ts(b.from + b.hit, "hit", { weight: 2 });
      }
    } else if (b.kind === "end") {
      addMusic(tMusic, b.from, end, "theme");
      ts(b.from, "door");
      ts(b.from + T.END_HIT_TRAILER, "hit", { weight: 2 });
    }
  }
  tSound.sort((a, b) => a.f - b.f || SO.indexOf(a.type) - SO.indexOf(b.type));
  const matteJobs = mattes.map(({ clipFrom, ...m }) => m);
  const mk = (fmt) => {
    const t = buildTrailer(fmt);
    return { id: "trailer", format: fmt, durationInFrames: trailerFrames, beats: t.beats, captions: t.captions, music: tMusic, sound: tSound, audio: `${dd}/audio/trailer.wav`, mattes: matteJobs };
  };
  const trailer = { "16x9": mk("16x9"), "9x16": mk("9x16") };

  // shorts
  const shorts = [];
  (edit.shorts ?? []).forEach((sh, si) => {
    const sl = `short ${si + 1} ("${sh.id}")`;
    // one beat per line; lines that are consecutive in the body meet at the midpoint of the silence between them
    const lines = [];
    // a line that crosses a body cut (the cut stage adds hard cuts where he moves through a shortened pause) is
    // split there into two beats: the reframe between beats hides the cut
    const shLines = [];
    (sh.lines ?? []).forEach((ln, li) => {
      const ids = spanOf(ln.span, `${sl} line ${li + 1}`) ?? [];
      if (ids.length < 2 || ids[0].from == null) return shLines.push(ln);
      let g = [ids[0]];
      const flush = () => shLines.push(g.length === ids.length ? ln : { ...ln, say: undefined, big: undefined, span: [`w${g[0].i}`, `w${g[g.length - 1].i}`] });
      for (let k = 1; k < ids.length; k++) {
        if (cuts.some((c) => c > ids[k - 1].from && c <= ids[k].from)) {
          flush();
          g = [];
        }
        g.push(ids[k]);
      }
      flush();
    });
    shLines.forEach((ln, li) => {
      const lab = `${sl} line ${li + 1}`;
      const lw = lineWords(ln, lab);
      if (!lw) return;
      const ids = spanOf(ln.span, lab) ?? [];
      const first = lw[0].from;
      const last = lw[lw.length - 1].to;
      const crossed = cuts.find((c) => c > first && c < last); // a cut exactly at the end of the last word is the line's own edge
      if (crossed !== undefined) err(`${lab}: the span crosses a camera cut join at body frame ${crossed} (${tc(crossed)}) — split the line there into two lines`);
      const prev = lines[lines.length - 1];
      const nextIdx = prev ? spokenAll.findIndex((w) => w.i === prev.lastId) + 1 : -1;
      const adj = !!(prev && spokenAll[nextIdx] && spokenAll[nextIdx].i === ids[0].i);
      const l = { words: lw, firstId: ids[0].i, lastId: ids[ids.length - 1].i, hold: holdFrames(ln, 8), holdSet: ln.hold !== undefined, start: Math.max(0, first - T.LEAD, takeStart(first)), end: Math.min(last + holdFrames(ln, 8), takeEnd(last - 1)) };
      if (adj) {
        // two lines that follow each other in the recording change over half-way through the pause — or exactly
        // at the body's hard cut, when there is one in that pause
        const pe = prev.words[prev.words.length - 1].to;
        const cut = cuts.find((c) => c >= pe && c <= first);
        const mid = cut ?? Math.round((pe + first) / 2);
        prev.end = mid;
        l.start = mid;
      }
      lines.push(l);
    });
    // The last line LANDS: he stays on screen for up to 0.8 s after his last word (never into his next one) before the
    // end card. With the general 8 frames the card arrived on the heels of the word and the sentence felt cut off
    // (producer, Day 1 shorts: "sentence at the ending was not completed").
    {
      const L = lines[lines.length - 1];
      if (L && !L.holdSet) {
        const lastTo = L.words[L.words.length - 1].to;
        const hold = landHold(L.lastId, lastTo, 8, 24);
        if (hold < 8) warn(`${sl}: only ${hold} frames of him after the last word (the take ends there): the ending will feel quick — consider ending on another line`);
        L.hold = hold;
        L.end = lastTo + hold;
      }
    }
    const beats0 = lines.map((l) => ({ type: "line", firstId: l.firstId, l }));
    let verse = null;
    if (sh.verse) verse = verseBeat(sh.verse, `${sl} verse`);
    if (verse) {
      const at = verse.read ? beats0.findIndex((b) => b.firstId > verse.firstId) : -1;
      beats0.splice(at < 0 ? beats0.length : at, 0, { type: "verse", v: verse });
    }
    let f = 0;
    let k = 0;
    const beats = [];
    const caps = [];
    const sMusic = [];
    const sSound = [];
    const ssc = (fr, type, extra = {}) => sSound.push({ f: fr, type, ...extra });
    ssc(0, "door");
    const mkBeats = (fmt) => {
      let cf = 0;
      let kk = 0;
      const out = [];
      const cp = [];
      for (const b of beats0) {
        if (b.type === "line") {
          const l = b.l;
          const start = l.start;
          const dur = l.end - l.start;
          const fr = kk % 2 === 0 ? "medium" : "tight";
          const s0 = SCALE[fr];
          const { cam: lineCam, track: lineTrack } = shortCam(start, dur, s0, fmt, `${sl} line ${kk + 1}`, kk % 2 === 1);
          out.push({ kind: "line", mood: "teach", from: cf, dur, clip: `${dd}/body.mp4`, matte: false, clipFrom: start, words: l.words.map((w) => ({ ...wordOut(w), from: w.from - start, to: w.to - start })), cam: lineCam, snaps: [], ...(lineTrack ? { track: lineTrack } : {}) });
          if (fmt === "9x16") {
            const abs = l.words.map((w) => ({ ...w, from: cf + (w.from - start), to: cf + (w.to - start) }));
            for (const p of pageCaptions(abs, { chars: 18, lines: 2, maxWords: 4 })) cp.push({ ...p, from: Math.max(p.from, cf), to: Math.min(p.to, cf + dur) });
          }
          cf += dur;
          kk++;
        } else {
          const { firstId, ...rest } = b.v;
          out.push({ kind: "verse", from: cf, ...rest });
          cf += b.v.dur;
        }
      }
      out.push({ kind: "end", from: cf, dur: T.END_DUR_SHORT });
      return { out, cp, total: cf + T.END_DUR_SHORT };
    };
    const built = mkBeats("9x16");
    beats.push(...built.out);
    caps.push(...built.cp);
    f = built.total;
    for (const b of beats) {
      const end = b.from + b.dur;
      if (b.kind === "line") addMusic(sMusic, b.from, end, "teach");
      else if (b.kind === "verse") {
        addMusic(sMusic, b.from, end, "word");
        ssc(b.from, "door");
        if (b.hit !== undefined) {
          ssc(b.from + b.hit - 45, "swell", { dur: 45 });
          ssc(b.from + b.hit, "hit", { weight: 2 });
        }
      } else {
        addMusic(sMusic, b.from, end, "theme");
        ssc(b.from, "door");
        ssc(b.from + 10, "hit", { weight: 2 });
      }
    }
    void k;
    sSound.sort((a, b) => a.f - b.f || SO.indexOf(a.type) - SO.indexOf(b.type));
    if (f < 15 * FPS || f > 58 * FPS) err(`${sl} is ${(f / FPS).toFixed(1)} s — must be between 15 and 58 s (target 20–55 s)`);
    else if (f < 20 * FPS || f > 55 * FPS) warn(`${sl} is ${(f / FPS).toFixed(1)} s (target 20–55 s)`);
    shorts.push({ id: `short${si + 1}`, format: "9x16", durationInFrames: f, title: sh.title, beats, captions: caps, music: sMusic, sound: sSound, audio: `${dd}/audio/short-${sh.id}.wav`, post: sh.post });
  });
  if (shorts.length !== 3) warn(`the edit has ${shorts.length} shorts (the pipeline delivers 3)`);

  // ── meta
  const entry = day === 0 ? series.opener : series.days.find((d) => d.day === day);
  if (!entry) err(`series.json has no day ${day}`);
  const nxt = series.days.find((d) => d.day === day + 1);
  const decl = entry?.declaration;
  let thumb;
  if (edit.social?.thumbnail?.frame) {
    const bf = frameOf(edit.social.thumbnail.frame, "social.thumbnail.frame");
    if (bf != null) {
      thumb = { line: edit.social.thumbnail.line, bodyFrame: bf };
      // where his head actually is on that frame (he sways): nearest raw track sample
      const tr = Array.isArray(body.track) ? body.track : [];
      if (tr.length) {
        const n = tr.reduce((m, t) => (Math.abs(t[0] - bf) < Math.abs(m[0] - bf) ? t : m), tr[0]);
        thumb.face = { x: n[1], y: n[2] };
      }
    }
  }
  const meta = {
    day,
    total: 30,
    title: entry?.title ?? "",
    dateLabel: entry?.dateLabel ?? "",
    ref: entry?.ref ?? entry?.verseRef ?? "",
    verse: entry?.verse ?? "",
    declaration: typeof decl === "string" ? decl : Array.isArray(decl) ? decl.join(" ") : (decl?.text ?? series.series?.declaration ?? ""),
    truths: (entry?.truths ?? []).map((t) => (typeof t === "string" ? t : t.title)),
    ...(nxt ? { next: { day: nxt.day, title: nxt.title, ref: nxt.ref, dateLabel: nxt.dateLabel } } : {}),
    presenter: edit.presenter ?? { name: "", role: "" },
    ...(thumb ? { thumb } : {}),
  };

  const plan = { meta, fps: 30, face, episode, trailer, shorts };
  return { plan, errors, warnings, coverage };
}

// ───────────────────────────────────────────── report
export function runningOrder(plan, { warnings = [], coverage } = {}) {
  const L = [];
  const e = plan.episode;
  const m = plan.meta;
  L.push(`DAY ${m.day} — ${m.title}   ${m.dateLabel} · ${m.ref}`);
  L.push(`episode ${tc(e.durationInFrames)} (${e.durationInFrames} frames)   body ${tc(e.bodyFrames)}   joins: ${e.cuts.length} cuts   takeover coverage ${coverage !== undefined ? (coverage * 100).toFixed(0) + "%" : "?"}`);
  L.push("");
  L.push("EPISODE — sections (timeline)");
  for (const s of e.sections) L.push(`  ${tc(s.from).padStart(6)}  ${String(s.from).padStart(6)}f  ${s.kind.padEnd(6)} ${(s.dur / FPS).toFixed(1).padStart(6)} s${s.kind === "cold" ? `  "${s.words.map((w) => w.text).join(" ")}"` : ""}`);
  L.push("");
  L.push("EPISODE — cues (timeline time | body time)");
  for (const c of e.cues) {
    const t = e.bodyAt + c.from;
    const desc = c.text ? plain(c.text).slice(0, 48) : c.ref ?? c.label ?? c.src ?? c.title ?? "";
    L.push(`  ${tc(t).padStart(6)} | ${tc(c.from).padStart(6)}  ${String(c.dur).padStart(4)}f  ${c.id.padEnd(12)} ${desc}${c.mode ? ` [${c.mode}]` : ""}${c.side ? ` (${c.side})` : ""}`);
  }
  L.push("");
  L.push(`  camera: ${e.cam.length} keys; first framings ${e.cam.slice(0, 6).map((k) => k.view.s).join(" ")}…`);
  L.push(`  captions: ${e.captions.length} pages`);
  L.push("");
  for (const t of [plan.trailer["16x9"], ...plan.shorts]) {
    L.push(`${t.id.toUpperCase()}${t.format === "16x9" ? " (16x9 + 9x16, same timeline)" : ""} — ${tc(t.durationInFrames)} (${t.durationInFrames} frames)${t.title ? `   title: ${plain(t.title)}` : ""}`);
    for (const b of t.beats) {
      const what = b.kind === "line" ? `${b.mood} "${b.words.map((w) => w.text).join(" ")}"${b.big ? `  BIG ${plain(b.big.text)}` : ""}` : b.kind === "verse" ? `${b.ref}${b.read ? " (read)" : ""}` : b.kind === "film" ? `film @${(b.srcFrom / FPS).toFixed(1)}s` : "";
      L.push(`  ${tc(b.from).padStart(6)}  ${String(b.dur).padStart(4)}f  ${b.kind.padEnd(6)} ${what}`);
    }
    if (t.mattes) L.push(`  matte jobs: ${t.mattes.length}`);
    L.push("");
  }
  L.push(warnings.length ? `WARNINGS (${warnings.length})` : "no warnings");
  for (const w of warnings) L.push(`  ! ${w}`);
  return L.join("\n");
}

// ───────────────────────────────────────────── CLI
function parseArgs(argv) {
  const o = { _: [] };
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) o[m[1]] = m[2] ?? true;
    else o._.push(a);
  }
  return o;
}

export async function planDay(n, o = {}) {
  const dd = `day${pad(n)}`;
  const edit = loadEdit(n, o.edit);
  const series = o.series ? readJson(o.series) : loadSeries();
  const bodyFile = o.body ?? `${ROOT}/december-public/${dd}/body.json`;
  if (!exists(bodyFile)) throw new Error(`no body.json at ${bodyFile} — run the cut stage first`);
  const body = readJson(bodyFile);
  // every voiced run of the recording, in body frames (for the endings: see quietAfter)
  const silFile = `${ROOT}/december/work/${dd}/silences.json`;
  if (!body.voicedBody && exists(silFile)) {
    const voiced = readJson(silFile).voiced ?? [];
    body.voicedBody = [];
    for (const s of body.segments ?? []) for (const [a, b] of voiced) if (b > s.src[0] && a < s.src[1]) body.voicedBody.push([Math.round(s.body[0] + (Math.max(a, s.src[0]) - s.src[0]) * 30), Math.round(s.body[0] + (Math.min(b, s.src[1]) - s.src[0]) * 30)]);
    body.voicedBody.sort((x, y) => x[0] - y[0]);
  }
  // his head on every body frame (for the shorts' camera: see shortCam)
  const headFile = `${ROOT}/december/work/${dd}/headx.json`;
  if (!body.headBody && exists(headFile)) {
    const hx = readJson(headFile).x ?? [];
    body.headBody = [];
    for (const s of body.segments ?? []) for (let f = Math.round(s.body[0]); f < Math.round(s.body[1]); f++) body.headBody[f] = hx[Math.min(hx.length - 1, Math.max(0, Math.round((s.src[0] + (f - s.body[0]) / 30) * 30)))];
    for (let f = 0; f < body.headBody.length; f++) if (body.headBody[f] === undefined) body.headBody[f] = f > 0 ? body.headBody[f - 1] : 0.5;
  }
  let filmSec = null;
  const filmFile = o.film ?? `${ROOT}/december-public/${dd}/film.mp4`;
  if (exists(filmFile)) filmSec = Number((await ffprobe(filmFile)).format.duration);
  if (edit.day !== n) throw new Error(`edit says day ${edit.day} but you asked for day ${n}`);
  return { ...compilePlan({ edit, series, body, filmSec }), dd };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bad = checkTiming();
  if (bad.length) {
    console.error("TIMING MISMATCH between scripts/december/timing.mjs and src/December/timing.ts:\n  " + bad.join("\n  "));
    process.exit(1);
  }
  if (args.selftest) {
    const { selftest } = await import("./plan-selftest.mjs");
    process.exit((await selftest()) ? 0 : 1);
  }
  const n = Number(args._[0]);
  if (!Number.isInteger(n) || n < 0) {
    console.error("usage: node scripts/december/plan.mjs <N> [--edit=path] [--body=path] [--series=path] [--out=path] | --selftest");
    process.exit(2);
  }
  const r = await planDay(n, args);
  const report = runningOrder(r.plan, r);
  if (!args.quiet) console.log(report);
  if (r.errors.length) {
    console.error(`\nPLAN FAILED — ${r.errors.length} error${r.errors.length > 1 ? "s" : ""}:`);
    for (const e of r.errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  const out = args.out ?? `${ROOT}/december-public/day${pad(n)}/plan.json`;
  writeJson(out, r.plan, 1);
  if (!args.out) {
    const qd = `${ROOT}/out/december/Day${pad(n)}/qc`;
    fs.mkdirSync(qd, { recursive: true });
    fs.writeFileSync(`${qd}/running-order.txt`, report + "\n");
  }
  console.log(`\nplan ok → ${out} (${r.warnings.length} warnings)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
