// Second and third hearings of a day's recording, for the proof-read (STANDARD.md §1: compare three hearings).
//   node scripts/december/rehear.mjs <N> [--force]
// The transcribe stage is the WORD pass (windowed, -ml 1). This adds two SEGMENT passes over the whole recording:
//   A  prompted with the guide's own wording for the day (catches "hoax the child" = "hugs the child"; biased to the guide)
//   B  no guide wording, wider beam (the check on A: where B disagrees with A, the guide may have been put in his mouth)
// Output: december/work/dayNN/rehear.md — every draft phrase with the two other hearings of the same seconds beside it.
// No render lock (whisper is never queued behind renders); one model load per pass.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { CONFIG, dayDir, exists, loadSeries, log, readJson, ROOT } from "./lib.mjs";

const N = Number(process.argv[2]);
if (!Number.isFinite(N)) (console.error("usage: rehear.mjs <N> [--force]"), process.exit(1));
const dir = dayDir(N);
// The producer supplies a transcript for each recording (2026-11-25): with it the extra hearings are not needed, and
// they cost ~45 min of this laptop per day. While december/work/no-rehear exists this stage does nothing (prep.mjs
// then goes straight on); run with --force for a day that has no transcript.
if (exists(`${ROOT}/december/work/no-rehear`) && !process.argv.includes("--force")) {
  log(`day ${N}: extra hearings skipped (december/work/no-rehear is set; --force to run them)`);
  process.exit(0);
}
const wav = `${dir}/audio16k.wav`;
if (!exists(wav) || !exists(`${dir}/draft.json`)) (console.error("run ingest, transcribe and draft first"), process.exit(1));
const series = loadSeries();
const d = N === 0 ? null : series.days.find((x) => x.day === N);

// whisper keeps roughly the last 220 tokens of a prompt: the verse, the truth titles and the sentences most likely to be mis-heard
const guidePrompt = d
  ? [`${d.title}.`, `${d.verseRef}: ${d.verse}`, d.word, ...d.truths.map((t) => `${t.title}. ${t.body}`), `${d.declaration}`, "Kids Inspiring Nation. Jesus Christ."].join(" ").split(/\s+/).slice(0, 190).join(" ")
  : `${series.opener.title}. ${series.opener.ref}. Kids Inspiring Nation. Jesus Christ.`;
const passes = [
  { id: "A", prompt: guidePrompt, extra: ["-bs", "5", "-bo", "5"] },
  // beam 5 like A: beam 8 took over half an hour for a five-minute recording on this laptop and heard nothing more
  { id: "B", prompt: "A man teaches children and fathers from the Bible, slowly, with long pauses.", extra: ["-bs", "5", "-bo", "5", "-tp", "0.2"] },
];
for (const p of passes) {
  const base = `${dir}/rehear_${p.id}`;
  if (exists(`${base}.json`) && !process.argv.includes("--force")) {
    log(`pass ${p.id} cached`);
    continue;
  }
  const t0 = Date.now();
  const r = spawnSync(CONFIG.whisperExe, ["-m", CONFIG.whisperModel, "-f", wav, "-l", "en", "-t", "3", "-oj", "-of", base, "-np", "--prompt", p.prompt, ...p.extra], { cwd: ROOT, windowsHide: true, encoding: "utf8", maxBuffer: 1 << 26 });
  if (!exists(`${base}.json`)) (console.error(`pass ${p.id} failed: ${String(r.stderr).slice(-600)}`), process.exit(2));
  log(`pass ${p.id} done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

const segs = (id) => readJson(`${dir}/rehear_${id}.json`).transcription.map((s) => ({ a: s.offsets.from / 1000, b: s.offsets.to / 1000, text: s.text.trim() }));
const A = segs("A");
const B = segs("B");
const draft = readJson(`${dir}/draft.json`);
const phrases = draft.phrases ?? [];
// a segment belongs to the phrase group whose seconds contain its midpoint; phrases are grouped in runs of ~12 s so the
// three hearings can be read side by side as sentences
const groups = [];
let g = null;
for (const p of phrases) {
  const a = p.start ?? p.a, b = p.end ?? p.b;
  if (!g || b - g.a > 12) (g = { a, b, ids: [], text: [] }), groups.push(g);
  g.b = b;
  g.ids.push(p.id);
  g.text.push(p.text);
}
const inG = (S, gr, next) => S.filter((s) => { const m = (s.a + s.b) / 2; return m >= gr.a - 0.6 && m < (next ? next.a - 0.6 : 1e9); }).map((s) => s.text).join(" ");
const L = [`# Day ${N} — three hearings`, "", "W = word pass (the draft, what the captions are built from) · A = segment pass prompted with the guide · B = segment pass, no guide", ""];
groups.forEach((gr, i) => {
  const next = groups[i + 1];
  L.push(`## ${gr.ids[0]}–${gr.ids[gr.ids.length - 1]}  ${gr.a.toFixed(1)}–${gr.b.toFixed(1)} s`, `W  ${gr.text.join(" ")}`, `A  ${inG(A, gr, next)}`, `B  ${inG(B, gr, next)}`, "");
});
fs.writeFileSync(`${dir}/rehear.md`, L.join("\n"));
log(`wrote ${dir}/rehear.md (${groups.length} groups; A ${A.length} segments, B ${B.length} segments)`);
