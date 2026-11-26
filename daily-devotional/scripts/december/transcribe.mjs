// Stage 2 — transcribe: word-level transcript in SOURCE seconds.
//   node scripts/december/transcribe.mjs <N> [--redo-analysis] [--nodtw]
//
// 1. clean track (high-pass + RNNoise) -> voiced runs + silences (silences.json)
// 2. windows of ~12-28 s that start/end inside silences >= 0.4 s
// 3. each window transcribed on its own (whisper.cpp, -ml 1 -sow, DTW word timing; cached per window)
// 4. tokens merged into words, non-speech dropped, words wholly in silence dropped,
//    every word clamped to the voiced run it sits in
import fs from "node:fs";
import { spawn } from "node:child_process";
import { acquireLock, CONFIG, dayDir, envelopeDb, exists, ff, fmtT, loadSeries, log, readJson, readPcm, ROOT, voicedRuns, waitNoWhisper, writeJson } from "./lib.mjs";

const N = Number(process.argv[2]);
if (!Number.isFinite(N)) {
  console.error("usage: transcribe.mjs <N>");
  process.exit(1);
}
const NODTW = !process.argv.includes("--dtw"); // DTW stalls on this build (5 min per window); opt in with --dtw
const dir = dayDir(N);
const wdir = `${dir}/whisper`;
fs.mkdirSync(wdir, { recursive: true });
if (!exists(`${dir}/source.json`)) {
  console.error("run ingest first");
  process.exit(1);
}
const source = readJson(`${dir}/source.json`);
const HOP = 0.005;
const THRESH = -38;
const MINSIL = 0.12;

// ───────────────────────────────── 1. voiced runs on the cleaned track
let sil = readJson(`${dir}/silences.json`, null);
if (!sil || process.argv.includes("--redo-analysis")) {
  log("analysing voiced runs (cleaned track)");
  const pcm = await readPcm(`${dir}/audio48k.wav`, { rate: 16000, filter: `highpass=f=80,arnndn=m=${CONFIG.rnnoise}:mix=0.85` });
  const env = envelopeDb(pcm, 16000, HOP, 0.015);
  const voiced = voicedRuns(env, HOP, { thresholdDb: THRESH, minSilence: MINSIL, minVoiced: 0.04 });
  const dur = pcm.length / 16000;
  const silences = [];
  let t = 0;
  for (const [a, b] of voiced) {
    if (a - t > 0.001) silences.push([+t.toFixed(3), +a.toFixed(3)]);
    t = b;
  }
  if (dur - t > 0.001) silences.push([+t.toFixed(3), +dur.toFixed(3)]);
  sil = { params: { track: "highpass80+arnndn(0.85)", thresholdDb: THRESH, minSilence: MINSIL, hop: HOP }, duration: dur, voiced: voiced.map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)]), silences };
  writeJson(`${dir}/silences.json`, sil, 0);
  log(`voiced runs ${voiced.length}, silences ${silences.length}, voiced ${voiced.reduce((s, r) => s + r[1] - r[0], 0).toFixed(1)} s of ${dur.toFixed(1)} s`);
}
const voiced = sil.voiced;

// ───────────────────────────────── 2. windows
const longSil = sil.silences.filter(([a, b]) => b - a >= 0.4).map(([a, b]) => ({ a, b, mid: (a + b) / 2, len: b - a }));
const total = sil.duration;
const windows = [];
{
  let s0 = 0;
  while (s0 < total - 0.05) {
    if (total - s0 <= 28) {
      windows.push([s0, total]);
      break;
    }
    // candidates: silences whose midpoint lies 12..28 s after s0; prefer the longest in 16..26, else any
    const inR = (lo, hi) => longSil.filter((s) => s.mid - s0 >= lo && s.mid - s0 <= hi);
    let c = inR(16, 26);
    if (!c.length) c = inR(12, 28);
    let end;
    if (c.length) end = c.reduce((m, s) => (s.len > m.len ? s : m)).mid;
    else {
      // no 0.4 s silence in range: take the longest shorter silence 14..28 s ahead, else hard cut at the quietest instant
      const sh = sil.silences.filter(([a, b]) => (a + b) / 2 - s0 >= 14 && (a + b) / 2 - s0 <= 28).sort((x, y) => y[1] - y[0] - (x[1] - x[0]));
      end = sh.length ? (sh[0][0] + sh[0][1]) / 2 : s0 + 24;
      log(`warn: no long silence for window after ${fmtT(s0)} -> cutting at ${fmtT(end)}`);
    }
    windows.push([s0, end]);
    s0 = end;
  }
}
log(`${windows.length} windows: ${windows.map(([a, b]) => (b - a).toFixed(0)).join(" ")} s`);

// ───────────────────────────────── 3. whisper per window
const series = loadSeries();
const dayInfo = N === 0 ? null : series.days.find((d) => d.day === N);
const refs = dayInfo ? [dayInfo.ref, dayInfo.readAloud, ...dayInfo.also].join("; ") : series.opener.ref;
const prompt = N === 0
  ? `${series.series.title}. ${series.opener.title}. ${series.opener.ref}. Kids Inspiring Nation.`
  : `${series.series.title}. Day ${N}: ${dayInfo.title}. ${refs}. Kids Inspiring Nation. Eight O'Clock. Galatians, Jesus Christ.`;
const wavSize = fs.statSync(`${dir}/audio16k.wav`).size;

// take the machine lock first (no timeout on waiting), start the clock only when whisper-cli launches
function runWhisper(args, timeoutMs, logf) {
  return (
    () =>
      new Promise((resolve) => {
        const p = spawn(CONFIG.whisperExe, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true, cwd: ROOT });
        let err = "";
        p.stderr.on("data", (d) => (err += d));
        const timer = setTimeout(() => {
          spawn("taskkill", ["/PID", String(p.pid), "/T", "/F"], { stdio: "ignore" });
          resolve({ timeout: true });
        }, timeoutMs);
        p.on("close", (code) => {
          clearTimeout(timer);
          fs.appendFileSync(logf, err.slice(-3000));
          resolve({ code });
        });
      })
  )();
}

const winKey = (a, b) => `w_${Math.round(a * 1000)}_${Math.round(b * 1000)}_${wavSize}`;
const winResults = [];
let release = null; // ONE lock acquisition for all uncached windows

for (const [a, b] of windows) {
  const base = `${wdir}/${winKey(a, b)}`;
  if (!exists(`${base}.json`)) {
    await ff(["-ss", String(a), "-t", String(b - a), "-i", `${dir}/audio16k.wav`, "-c:a", "pcm_s16le", `${base}.wav`]);
    const t0 = Date.now();
    const common = ["-m", CONFIG.whisperModel, "-f", `${base}.wav`, "-l", "en", "-t", "3", "-ml", "1", "-sow", "-oj", "-of", base, "-np", "--prompt", prompt, "-bs", "3", "-bo", "3"];
    let r = NODTW ? { timeout: true } : await runWhisper([...common, "-dtw", "large.v3.turbo"], 900000, `${dir}/whisper.log`);
    let dtw = !NODTW;
    if (!exists(`${base}.json`)) {
      if (!NODTW && r.timeout !== undefined) log(`  window ${fmtT(a)}-${fmtT(b)}: DTW run failed/timed out (${r.timeout ? "timeout" : "exit " + r.code}) -> retry without DTW`);
      r = await runWhisper(common, 900000, `${dir}/whisper.log`);
      if (!exists(`${base}.json`)) {
        log("  retry with -bs 1 -bo 1");
        r = await runWhisper([...common.slice(0, common.indexOf("-bs")), "-bs", "1", "-bo", "1"], 900000, `${dir}/whisper.log`);
      }
      dtw = false;
    }
    if (!exists(`${base}.json`)) {
      console.error(`window ${fmtT(a)}-${fmtT(b)} failed twice; aborting (rerun resumes from cache)`);
      process.exit(2);
    }
    fs.rmSync(`${base}.wav`, { force: true });
    const j = readJson(`${base}.json`);
    j._dtw = dtw;
    writeJson(`${base}.json`, j, 0);
    log(`window ${fmtT(a)}-${fmtT(b)} (${(b - a).toFixed(1)} s) done in ${((Date.now() - t0) / 1000).toFixed(0)} s${dtw ? " [dtw]" : ""}`);
  } else log(`window ${fmtT(a)}-${fmtT(b)} cached`);
  winResults.push({ a, b, json: readJson(`${base}.json`) });
}

release?.();

// ───────────────────────────────── 4. tokens -> words, tighten
const isNonSpeech = (t) => /^\s*[\[(<*♪].*[\])>*♪]?\s*$/.test(t) && /[\[(<*♪]/.test(t.trim()[0]);
const raw = []; // {text,start,end}
const dropped0 = { nonspeech: 0 };
let wi = 0;
for (const { a, b, json } of winResults) {
  wi++;
  let cur = null;
  for (const seg of json.transcription) {
    const txt = seg.text;
    if (!txt.trim()) continue;
    if (isNonSpeech(txt)) {
      dropped0.nonspeech++;
      continue;
    }
    const s = a + seg.offsets.from / 1000;
    const e = a + seg.offsets.to / 1000;
    const newWord = /^\s/.test(txt) && !/^\s*[^\w\s'’"“”(]+\s*$/.test(txt); // pure punctuation never starts a word
    if (cur && !newWord) {
      cur.text += txt.trim();
      cur.end = Math.max(cur.end, e);
    } else {
      if (cur) raw.push(cur);
      cur = { text: txt.trim(), start: s, end: e, win: wi - 1 };
    }
  }
  if (cur) raw.push(cur);
}
// leading space could be missing on the first token of a window: handled (cur null -> new word)

// Whisper's per-word times (no DTW) drift badly on this slow, pausing speaker, so they are only a weak prior. The voiced
// runs are the truth: per window, words are assigned to voiced runs in order by dynamic programming (each run's duration
// should match the speaking time its words need; a run boundary prefers to fall after punctuation), then each run's words
// share its time in proportion to their length. Every word therefore sits inside voiced time; nothing is silently dropped.
const words = [];
const dropped = { nonspeech: dropped0.nonspeech, silent: 0, list: [] };
const badWin = [];
const weightOf = (w) => w.text.replace(/[^A-Za-z0-9']/g, "").length + 1.5;
const endsPhrase = (w) => /[,.;:?!"”)]$/.test(w.text);
windows.forEach(([wa, wb], wk) => {
  const ws = raw.filter((w) => w.win === wk);
  if (!ws.length) return;
  const runs = voiced.map((r) => [Math.max(r[0], wa), Math.min(r[1], wb)]).filter((r) => r[1] - r[0] >= 0.04);
  const R = runs.length;
  const n = ws.length;
  const cw = [0];
  ws.forEach((w) => cw.push(cw[cw.length - 1] + weightOf(w)));
  const V = runs.reduce((s, r) => s + r[1] - r[0], 0);
  const rate = V / cw[n]; // seconds per weight unit in this window
  if (!R) {
    dropped.silent += n;
    ws.forEach((w) => dropped.list.push(w.text + "@" + w.start.toFixed(2)));
    return;
  }
  // D[j][k] = best cost with the first k words placed in runs 0..j-1
  const INF = 1e18;
  const D = Array.from({ length: R + 1 }, () => new Float64Array(n + 1).fill(INF));
  const P = Array.from({ length: R + 1 }, () => new Int32Array(n + 1));
  D[0][0] = 0;
  for (let j = 1; j <= R; j++) {
    const dur = runs[j - 1][1] - runs[j - 1][0];
    for (let k = 0; k <= n; k++) {
      for (let m = 0; m <= k; m++) {
        if (D[j - 1][m] >= INF) continue;
        // run j-1 takes words m..k-1
        let c;
        if (k === m) c = 0.35 * dur; // a run with no words (cough, breath, noise)
        else {
          const need = (cw[k] - cw[m]) * rate;
          c = ((dur - need) * (dur - need)) / (dur + 0.4);
          const last = ws[k - 1];
          if (k < n) c += endsPhrase(last) ? -0.12 : 0.18; // a pause after the run should follow punctuation
          // weak prior from whisper's own time for the first word
          const dt = Math.min(4, Math.abs(ws[m].start - runs[j - 1][0]));
          c += 0.015 * dt * dt;
        }
        const v = D[j - 1][m] + c;
        if (v < D[j][k]) {
          D[j][k] = v;
          P[j][k] = m;
        }
      }
    }
  }
  const cut = new Array(R + 1);
  cut[R] = n;
  for (let j = R; j >= 1; j--) cut[j - 1] = P[j][cut[j]];
  let overfull = 0;
  for (let j = 0; j < R; j++) {
    const m = cut[j];
    const k = cut[j + 1];
    if (k <= m) continue;
    const [ra, rb] = runs[j];
    const need = (cw[k] - cw[m]) * rate;
    if (need > 2.2 * (rb - ra) + 0.3) overfull++;
    let t0 = ra;
    for (let q = m; q < k; q++) {
      const t1 = q === k - 1 ? rb : t0 + ((rb - ra) * weightOf(ws[q])) / (cw[k] - cw[m]);
      words.push({ text: ws[q].text, start: +t0.toFixed(3), end: +t1.toFixed(3), ws: +ws[q].start.toFixed(2), we: +ws[q].end.toFixed(2) });
      t0 = t1;
    }
  }
  const rateWps = n / V; // words per voiced second
  if (overfull > 1 || rateWps > 5 || rateWps < 0.8) badWin.push({ window: [+wa.toFixed(2), +wb.toFixed(2)], words: n, voicedSec: +V.toFixed(1), wordsPerVoicedSec: +rateWps.toFixed(2), overfullRuns: overfull });
});
const moved = words.filter((w) => Math.abs(w.start - w.ws) > 0.5).length;
dropped.moved = moved;
words.forEach((w, i) => (w.i = i));
if (badWin.length) log("UNRELIABLE WINDOWS: " + JSON.stringify(badWin));
const out = { unreliableWindows: badWin, source: source.path, model: "ggml-large-v3-turbo-q5_0", windows: windows.map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)]), words: words.map(({ i, text, start, end, ws, we }) => ({ i, text, start, end, ws, we })), dropped };
writeJson(`${dir}/words.json`, out, 0);
const speech = words.reduce((s, w) => s + (w.end - w.start), 0);
log(`words ${words.length} (dropped: ${dropped.nonspeech} non-speech tokens, ${dropped.silent} words in silence); first ${fmtT(words[0].start)}, last ${fmtT(words.at(-1).end)}; word time ${speech.toFixed(1)} s`);
