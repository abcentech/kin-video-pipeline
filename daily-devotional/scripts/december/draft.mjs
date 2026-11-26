// Stage 3 — draft: the editor's worksheet (december/work/dayNN/draft.md + draft.json) and face.json.
//   node scripts/december/draft.mjs <N> [--reface]
import fs from "node:fs";
import { CONFIG, dayDir, exists, fmtT, loadSeries, loadWords, log, pad, readJson, readPcm, ROOT, run, writeJson } from "./lib.mjs";

const N = Number(process.argv[2]);
if (!Number.isFinite(N)) {
  console.error("usage: draft.mjs <N> [--reface]");
  process.exit(1);
}
const dir = dayDir(N);
const series = loadSeries();
const source = readJson(`${dir}/source.json`);
const { words, unreliableWindows = [] } = loadWords(N);
const sil = readJson(`${dir}/silences.json`);
const day = N === 0 ? null : series.days.find((d) => d.day === N);

// ───────────────────────────── face
let face = readJson(`${dir}/face.json`, null);
if (!face || process.argv.includes("--reface")) {
  log("face tracking (40 samples)…");
  const r = await run(CONFIG.python, ["-I", `${ROOT}/scripts/december/face.py`, source.path, `${dir}/face.json`, "40"]);
  if (r.code !== 0) {
    console.error("face.py failed:\n" + r.stderr.slice(-800) + r.stdout);
    process.exit(3);
  }
  console.log(r.stdout.trim());
  face = readJson(`${dir}/face.json`);
}

// ───────────────────────────── text helpers
const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/'/g, "")
    .split(/\s+/)
    .filter(Boolean);

// guide corpus: flat token array with labels
const sections = [];
const addSec = (label, text) => {
  if (text) sections.push({ label, text });
};
if (day) {
  addSec("verse", day.verse);
  addSec("story", day.story);
  addSec("word", day.word);
  day.truths.forEach((t) => addSec(`truth${t.n}`, `${t.title}. ${t.body}`));
  addSec("response-child", day.response.child);
  addSec("response-father", day.response.father);
  day.prayers.forEach((p, k) => addSec(`prayer${k + 1}`, p));
  addSec("declaration", day.declaration);
} else {
  series.opener.text.forEach((p, k) => addSec(`opener${k + 1}`, p));
  addSec("declaration", series.opener.declaration);
}
const gtok = []; // {w, sec, k}
const gtext = []; // original token text parallel to gtok
for (const s of sections) {
  const raw = s.text.split(/\s+/).filter(Boolean);
  for (const t of raw) {
    const n = norm(t);
    for (const w of n) {
      gtok.push({ w, sec: s.label });
      gtext.push(t);
    }
  }
}
// scripture the guide quotes: verse + every “…” of >= 4 words in the day's text
const quotes = [];
if (day) {
  quotes.push({ ref: day.verseRef || day.ref, text: day.verse, where: "main text" });
  const seen = new Set([norm(day.verse).join(" ")]);
  for (const s of sections) {
    for (const m of s.text.matchAll(/[“"]([^”"]{12,}?)[”"]\s*(?:\(([^)]*\d[^)]*)\))?/g)) {
      const n = norm(m[1]);
      if (n.length < 4 || seen.has(n.join(" "))) continue;
      seen.add(n.join(" "));
      quotes.push({ ref: m[2] ?? "", text: m[1], where: s.label });
    }
  }
  for (const a of day.also) quotes.push({ ref: a, text: "", where: "also (not quoted)" });
}

/** best window of `corpus` tokens for a phrase: unigram overlap (multiset) / phrase length, window = n+2 */
function bestWindow(ptok, corpus) {
  const n = ptok.length;
  if (!n || !corpus.length) return { score: 0, at: 0, len: 0 };
  const L = Math.min(corpus.length, n + 2);
  const need = new Map();
  for (const t of ptok) need.set(t, (need.get(t) ?? 0) + 1);
  let best = { score: 0, at: 0, len: L };
  const have = new Map();
  let ov = 0;
  const add = (t, d) => {
    const nd = need.get(t);
    if (!nd) return;
    const h = have.get(t) ?? 0;
    if (d > 0 && h < nd) ov++;
    if (d < 0 && h <= nd) ov--;
    have.set(t, h + d);
  };
  for (let i = 0; i < corpus.length; i++) {
    add(corpus[i].w, 1);
    if (i >= L) add(corpus[i - L].w, -1);
    if (i >= L - 1) {
      // bigram bonus: consecutive phrase tokens in order
      const sc = ov / n;
      if (sc > best.score) best = { score: sc, at: i - L + 1, len: L };
    }
  }
  return best;
}
const stripCorpus = (arr) => arr;

// ───────────────────────────── phrases
const SPLIT = 0.35;
const phrases = [];
let cur = null;
for (let k = 0; k < words.length; k++) {
  const w = words[k];
  const gap = k ? w.start - words[k - 1].end : w.start;
  if (!cur || gap >= SPLIT) {
    if (cur) phrases.push(cur);
    cur = { w0: w.i, w1: w.i, start: w.start, end: w.end, gap: +gap.toFixed(2), words: [w] };
  } else {
    cur.w1 = w.i;
    cur.end = w.end;
    cur.words.push(w);
  }
}
if (cur) phrases.push(cur);

const pcm = await readPcm(`${dir}/audio16k.wav`, { rate: 16000 });
const dbOf = (a, b) => {
  const i0 = Math.max(0, Math.floor(a * 16000));
  const i1 = Math.min(pcm.length, Math.floor(b * 16000));
  let s = 0;
  let pk = 0;
  for (let i = i0; i < i1; i++) {
    s += pcm[i] * pcm[i];
    pk = Math.max(pk, Math.abs(pcm[i]));
  }
  return { rms: 10 * Math.log10(s / Math.max(1, i1 - i0) + 1e-12), peak: 20 * Math.log10(pk + 1e-9) };
};

const FILLERS = new Set(["um", "uh", "umm", "uhm", "erm", "er", "hmm", "ah", "eh"]);
phrases.forEach((p, k) => {
  p.id = `p${pad(k + 1, 3)}`;
  p.text = p.words.map((w) => w.text).join(" ");
  p.ptok = p.words.flatMap((w) => norm(w.text));
  const ld = dbOf(p.start, p.end);
  p.loud = { rms: +ld.rms.toFixed(1), peak: +ld.peak.toFixed(1) };
  p.flags = [];
  const tk = p.ptok;
  if (tk.some((t) => FILLERS.has(t)) || /\byou know\b/.test(tk.join(" "))) p.flags.push("FILLER");
  if (p.gap > 0.9) p.flags.push("DEAD AIR");
  // guide match
  if (tk.length >= 2) {
    const m = bestWindow(tk, gtok);
    p.match = { score: +m.score.toFixed(2), sec: gtok[m.at]?.sec, text: gtext.slice(m.at, m.at + m.len + 1).join(" ") };
    if (m.score < 0.5 && tk.length >= 3) p.flags.push("OFF-SCRIPT");
  }
  // scripture
  for (const q of quotes) {
    if (!q.text) continue;
    const qt = norm(q.text).map((w) => ({ w }));
    const m = bestWindow(tk, qt);
    if (tk.length >= 3 && m.score >= 0.75) {
      p.flags.push("SCRIPTURE");
      (p.scripture ??= []).push({ ref: q.ref || q.where, score: +m.score.toFixed(2) });
      q.phrases = [...(q.phrases ?? []), p.id];
    }
  }
});
// retakes: first 3+ words repeat in a LATER phrase within the next 20 s
phrases.forEach((p, k) => {
  if (p.ptok.length < 3) return;
  const head = p.ptok.slice(0, 3).join(" ");
  for (let j = k + 1; j < phrases.length && phrases[j].start - p.start < 20; j++) {
    if (phrases[j].ptok.slice(0, 3).join(" ") === head) {
      p.flags.push(`RETAKE?(=${phrases[j].id})`);
      break;
    }
  }
});

// ───────────────────────────── totals
const voicedT = sil.voiced.reduce((s, r) => s + r[1] - r[0], 0);
const wordT = words.reduce((s, w) => s + (w.end - w.start), 0);
const pauses = [];
for (let k = 1; k < words.length; k++) {
  const g = words[k].start - words[k - 1].end;
  if (g > 0.9) pauses.push({ after: words[k - 1].i, before: words[k].i, at: +words[k - 1].end.toFixed(2), len: +g.toFixed(2) });
}

// ───────────────────────────── markdown
const bar = (db) => "#".repeat(Math.max(0, Math.round((db + 50) / 3)));
const L = [];
L.push(`# Day ${N} draft${day ? ` — ${day.title}` : " — To Every Child"}`);
L.push("");
L.push("## Source");
L.push(`- ${source.path} — ${source.width}x${source.height} ${source.codec}, ${source.duration.toFixed(2)} s, avg ${source.fps.toFixed(2)} fps (nominal ${source.nominalFps}; variable), video starts ${source.videoStart} s after audio`);
L.push(`- ${words.length} words, ${phrases.length} phrases (split at pauses >= ${SPLIT} s); first word ${fmtT(words[0].start)}, last ${fmtT(words.at(-1).end)}`);
L.push(`- voiced ${voicedT.toFixed(1)} s (${((100 * voicedT) / source.duration).toFixed(0)}%), word time ${wordT.toFixed(1)} s, silence/non-voiced ${(source.duration - voicedT).toFixed(1)} s (${((100 * (source.duration - voicedT)) / source.duration).toFixed(0)}%)`);
L.push(`- face (median of ${face.hits}/${face.n} samples): head centre x=${face.x} y=${face.y}, head height ${face.h} (detector box ${face.box.w}x${face.box.h}); x range ${Math.min(...face.samples.map((s) => s.x)).toFixed(3)}..${Math.max(...face.samples.map((s) => s.x)).toFixed(3)}, y range ${Math.min(...face.samples.map((s) => s.y)).toFixed(3)}..${Math.max(...face.samples.map((s) => s.y)).toFixed(3)} (see face.json for per-sample values)`);
if (unreliableWindows.length) L.push(`- UNRELIABLE transcript windows (words per voiced second out of range; timing/text suspect): ${unreliableWindows.map((w) => `${w.window[0]}-${w.window[1]} s (${w.wordsPerVoicedSec} w/s)`).join(", ")}`);
L.push("");
L.push(`## Pauses longer than 0.9 s (${pauses.length})`);
L.push(pauses.length ? pauses.map((p) => `- ${fmtT(p.at)}  ${p.len.toFixed(2)} s  (after w${p.after})`).join("\n") : "- none");
L.push("");
if (day) {
  L.push("## Guide block (series.json)");
  L.push(`- **${day.title}** · ${day.dateLabel} · ${day.part} · main text ${day.ref} · read aloud ${day.readAloud} · also ${day.also.join("; ")}`);
  L.push(`- film: ${day.film.file} ${day.film.from}–${day.film.to} s`);
  L.push(`- verse: “${day.verse}”`);
  L.push(`- story: ${day.story}`);
  L.push(`- word: ${day.word}`);
  day.truths.forEach((t) => L.push(`- truth ${t.n}: **${t.title}.** ${t.body}`));
  L.push(`- response (child): ${day.response.child}`);
  L.push(`- response (father): ${day.response.father}`);
  day.prayers.forEach((p, k) => L.push(`- prayer ${k + 1}: ${p}`));
  L.push(`- declaration: ${day.declaration}`);
  L.push("");
}
L.push("## Scripture the guide quotes");
for (const q of quotes) L.push(`- **${q.ref || "(no ref)"}** [${q.where}]${q.text ? ` “${q.text}”` : ""}  → phrases: ${q.phrases?.length ? q.phrases.join(", ") : "none matched"}`);
L.push("");
L.push("## Phrases");
L.push("`id [w-range] start–end (gap before) \"text\" | flags | loud rms/peak dBFS bar | guide~score [section] \"guide wording\"`");
L.push("");
for (const p of phrases) {
  const g = p.match && p.match.score >= 0.3 && p.ptok.length >= 2 ? `  ~ guide(best, score ${p.match.score}${p.match.score < 0.6 ? ", LOW" : ""}) [${p.match.sec}] “${p.match.text}”` : "";
  L.push(`${p.id} [w${p.w0}–w${p.w1}] ${p.start.toFixed(2)}–${p.end.toFixed(2)} (gap ${p.gap.toFixed(2)}) "${p.text}"${p.flags.length ? "  | " + p.flags.join(", ") : ""}  | ${p.loud.rms}/${p.loud.peak} ${bar(p.loud.rms)}${g}`);
}
fs.writeFileSync(`${dir}/draft.md`, L.join("\n") + "\n");
writeJson(
  `${dir}/draft.json`,
  {
    day: N,
    source: { path: source.path, duration: source.duration, fps: source.fps },
    speech: { voiced: +voicedT.toFixed(2), words: +wordT.toFixed(2), silence: +(source.duration - voicedT).toFixed(2) },
    pauses,
    face: { x: face.x, y: face.y, h: face.h },
    scripture: quotes,
    phrases: phrases.map(({ id, w0, w1, start, end, gap, text, flags, loud, match, scripture }) => ({ id, w0, w1, start, end, gap, text, flags, loud, match, scripture })),
  },
  1,
);
const fl = {};
phrases.forEach((p) => p.flags.forEach((f) => (fl[f.replace(/\(.*/, "")] = (fl[f.replace(/\(.*/, "")] ?? 0) + 1)));
log(`draft day ${N}: ${phrases.length} phrases, flags ${JSON.stringify(fl)} -> ${dir}/draft.md`);
