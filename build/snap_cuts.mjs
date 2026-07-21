// Propose sentence-aware cut points so clips never end mid-thought.
// Reads the master caption JSON per source and snaps a rough [start,end] to the
// nearest sentence boundary (word ending in . ! ?). Writes build/cuts.tsv which
// the USER can hand-edit (start/end are mm:ss). Re-cut with apply_cuts.mjs.
//
// Usage: node build/snap_cuts.mjs
import fs from "node:fs";

const CAP = "remotion-video-studio/src/captions";
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}`;

// id, source, rough start sec, rough dur sec  (initial human picks)
const ROUGH = [
  ["J22S1", "Jun22", 36, 66], ["J22S2", "Jun22", 278, 70], ["J22S3", "Jun22", 353, 72],
  ["J23S1", "Jun23", 26, 62], ["J23S2", "Jun23", 103, 60], ["J23S3", "Jun23", 297, 69],
  ["J24S1", "Jun24", 29, 63], ["J24S2", "Jun24", 97, 66], ["J24S3", "Jun24", 235, 70],
  ["J25S1", "Jun25", 25, 66], ["J25S2", "Jun25", 90, 68], ["J25S3", "Jun25", 270, 70],
  ["J26S1", "Jun26", 55, 62], ["J26S2", "Jun26", 114, 64], ["J26S3", "Jun26", 350, 72],
];

const masters = {};
const load = (src) => (masters[src] ??= JSON.parse(fs.readFileSync(`${CAP}/${src}.json`, "utf8")).words);

const isSentEnd = (w) => /[.!?]$/.test(w.w.trim());

// nearest word whose START is closest to target time
const nearestStartIdx = (words, t) => {
  let best = 0, bd = Infinity;
  words.forEach((w, i) => { const d = Math.abs(w.start - t); if (d < bd) { bd = d; best = i; } });
  return best;
};

const rows = [];
for (const [id, src, rs, rd] of ROUGH) {
  const words = load(src);
  const re = rs + rd;
  // START: snap to the first word that begins a sentence (prev word is sentence-end)
  let si = nearestStartIdx(words, rs);
  for (let i = si; i > 0 && i > si - 12; i--) { if (isSentEnd(words[i - 1])) { si = i; break; } }
  // END: extend to the next sentence-ending word at/after the rough end (within +12 words)
  let ei = nearestStartIdx(words, re);
  for (let i = ei; i < words.length && i < ei + 16; i++) { if (isSentEnd(words[i])) { ei = i; break; } }
  const start = +words[si].start.toFixed(2);
  const end = +(words[ei].end + 0.35).toFixed(2); // tiny tail so speech isn't clipped
  const startTxt = words.slice(si, si + 6).map((w) => w.w).join(" ");
  const endTxt = words.slice(Math.max(si, ei - 5), ei + 1).map((w) => w.w).join(" ");
  rows.push({ id, src, start, end, dur: +(end - start).toFixed(2), startTxt, endTxt });
}

const header = "# id\tsource\tstart(mm:ss)\tend(mm:ss)\tdur\t| opens: … | ends: …\n# edit start/end (mm:ss) to taste, then: node build/apply_cuts.mjs\n";
const body = rows.map((r) => `${r.id}\t${r.src}\t${mmss(r.start)}\t${mmss(r.end)}\t${r.dur}s\t| opens: ${r.startTxt} | ends: …${r.endTxt}`).join("\n");
fs.writeFileSync("build/cuts.tsv", header + body + "\n");
console.log("wrote build/cuts.tsv\n");
console.log(body);
