// Convert a whisper.cpp -oj transcript into an editable caption JSON.
// Usage: node build_captions.mjs <whisper.json> <out.json> [emphasisWordsCSV]
// Output: { "words": [ { "w": "...", "start": s, "end": s, "emp": bool }, ... ] }
// Humans edit the "w" text to fix mis-heard words; timings stay intact.
import fs from "node:fs";

const [wj, out, empCsv] = process.argv.slice(2);
// Default emphasis: punchy / emotional words. Override by passing a CSV.
const DEFAULT_EMP = "no,never,every,everything,power,greater,stronger,faith,jesus,god,touch,healed,healing,whole,miracle,growth,closed,answer,now,you,today,one,best,change,leader,light,darkness,life,truth";
const empSet = new Set((empCsv || DEFAULT_EMP).toLowerCase().split(",").map((s) => s.trim()).filter(Boolean));

const data = JSON.parse(fs.readFileSync(wj, "utf8"));
let words = [];
for (const s of data.transcription || []) {
  const w = (s.text || "").trim();
  if (!w || /^\[.*\]$/.test(w) || /^(um|uh|umm|err)[,.]?$/i.test(w)) continue;
  const start = +(s.offsets.from / 1000).toFixed(2);
  const end = +Math.max(s.offsets.to / 1000, start + 0.1).toFixed(2);
  words.push({ w, start, end, emp: empSet.has(w.replace(/[^a-zA-Z]/g, "").toLowerCase()) });
}
fs.writeFileSync(out, JSON.stringify({ words }, null, 1));
console.log(`${out}: ${words.length} words, ${words.filter((x) => x.emp).length} emphasized`);
