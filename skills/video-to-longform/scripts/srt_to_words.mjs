// Build full-karaoke caption words from an EDITED SRT (no whisper — honors the
// user's hand-edited text), remapped onto the trimmed timeline if a drops file is given.
//   node srt_to_words.mjs <in.srt> <out.json> [drops.json] [corrections.json] [empWordsCSV]
// drops.json: { "drops": [[startSec,endSec],...] } (same file fed to grade_trim.sh)
// corrections.json: { "Wrongword": "Right", "Bad.": "" } (fix transcription mis-hears; "" drops token)
import fs from "node:fs";

const SRT = process.argv[2];
const OUT = process.argv[3];
const DROPS_F = process.argv[4];
const CORR_F = process.argv[5];
const EMP_CSV = process.argv[6];
if (!SRT || !OUT) { console.error("usage: srt_to_words.mjs <in.srt> <out.json> [drops.json] [corrections.json] [empWordsCSV]"); process.exit(1); }
const drops = DROPS_F && fs.existsSync(DROPS_F) ? JSON.parse(fs.readFileSync(DROPS_F, "utf8")).drops : [];

// theme/emphasis words for the gold keyword treatment (override via empWordsCSV)
const EMP = EMP_CSV
  ? new RegExp("^(" + EMP_CSV.split(",").map((s) => s.trim()).filter(Boolean).join("|") + ")$", "i")
  : /^(long|life|longevity|covenant|blessing|blessings|bless|blessed|god|god's|jesus|christ|fruitful|fruitfulness|fulfilment|generation|generations|tree|trees|palm|cedar|seed|fruit|fruits|grow|flourish|righteous|influence|decades|seven|salvation|satisfy|love|loved|son|begotten|world|graham|grandchild|maturity|matured|purpose|story|never)$/i;

// fix obvious transcription brand/proper-noun mis-hears (token -> replacement; "" drops the token)
const CORR = (CORR_F && fs.existsSync(CORR_F)) ? JSON.parse(fs.readFileSync(CORR_F, "utf8")) : {
  "Kittin's": "Kids",
  "Paranasians": "Inspiring Nation",
  "H.": "",            // "Father H. Jacob" -> "Father Jacob"
  "barefoot.": "Pa Billy Graham.", // "Long life to barefoot." mis-hear
};

const toSec = (t) => {
  const [h, m, rest] = t.split(":");
  const [s, ms] = rest.split(",");
  return (+h) * 3600 + (+m) * 60 + (+s) + (+ms) / 1000;
};

// cumulative removed-time before original timestamp t (drops are sentence-aligned)
const removedBefore = (t) =>
  drops.reduce((acc, [a, b]) => acc + (t > a ? Math.min(t, b) - a : 0), 0);
const inDrop = (t) => drops.some(([a, b]) => t >= a && t < b);

const raw = fs.readFileSync(SRT, "utf8").replace(/\r/g, "");
const blocks = raw.split(/\n\n+/).filter((b) => b.trim());
const words = [];

for (const blk of blocks) {
  const lines = blk.split("\n");
  const tl = lines.find((l) => l.includes("-->"));
  if (!tl) continue;
  const [a, b] = tl.split("-->").map((x) => x.trim());
  let cs = toSec(a), ce = toSec(b);
  let text = lines.slice(lines.indexOf(tl) + 1).join(" ").trim();
  // strip the TurboScribe watermark from the first cue
  text = text.replace(/\(Transcribed by TurboScribe\.[^)]*\)/gi, "").trim();
  if (!text) continue;
  // skip cues whose mid falls inside a removed range
  if (inDrop((cs + ce) / 2)) continue;
  // remap onto trimmed timeline
  cs = Math.max(0, cs - removedBefore(cs));
  ce = Math.max(cs + 0.1, ce - removedBefore(ce));

  let toks = text.split(/\s+/).filter(Boolean);
  toks = toks.map((w) => (w in CORR ? CORR[w] : w)).filter(Boolean);
  const step = (ce - cs) / toks.length;
  toks.forEach((w, i) => {
    const ws = +(cs + i * step).toFixed(3);
    const we = +(cs + (i + 1) * step).toFixed(3);
    words.push({ w, start: ws, end: we, emp: EMP.test(w.replace(/[^a-zA-Z']/g, "")) });
  });
}

fs.mkdirSync(OUT.replace(/\/[^/]+$/, "") || ".", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ words }, null, 1));
const last = words[words.length - 1];
console.log(`wrote ${OUT}: ${words.length} words, ${words.filter((w) => w.emp).length} emphasized, ends ${last.end.toFixed(1)}s`);
