// Re-cut clips from build/cuts.tsv (user-editable start/end in mm:ss).
// For each row: cinematic cut + music bed + sliced captions, then update
// build/shorts_all.json clip durations and regenerate Root.tsx.
// Usage: node build/apply_cuts.mjs
import fs from "node:fs";
import { execSync } from "node:child_process";

const CAP = "remotion-video-studio/src/captions";
const PUB = "remotion-video-studio/public";
const SRCDIR = "/Users/mac/Documents/video raw/Jun 22-26";
const toSec = (s) => { const [m, ss] = s.trim().split(":").map(Number); return m * 60 + ss; };

const cfg = JSON.parse(fs.readFileSync("build/shorts_all.json", "utf8"));
const byId = Object.fromEntries(cfg.shorts.map((s) => [s.id, s]));

const lines = fs.readFileSync("build/cuts.tsv", "utf8").split("\n")
  .filter((l) => l.trim() && !l.startsWith("#"));

for (const line of lines) {
  const [id, source, startMM, endMM] = line.split("\t");
  const short = byId[id];
  if (!short) { console.log(`skip ${id} (not in shorts_all)`); continue; }
  const start = toSec(startMM), end = toSec(endMM), dur = +(end - start).toFixed(2);
  const name = short.video.replace(/\.mp4$/, "");
  const climax = Math.round(dur * 0.7);
  console.log(`>>> ${id} ${name}: ${startMM}-${endMM} (${dur}s)`);
  execSync(`zsh build/cinematic.sh "${SRCDIR}/${source}.mp4" ${start} ${dur} ${name}`, { stdio: "inherit" });
  execSync(`zsh build/cine_music.sh ${dur} ${climax} "${PUB}/music_${name}.mp3"`, { stdio: "inherit" });
  execSync(`node build/slice_caps.mjs "${CAP}/${source}.json" ${start} ${dur} "${CAP}/${name}.json"`, { stdio: "inherit" });
  short.clip = Math.round(dur);
}

fs.writeFileSync("build/shorts_all.json", JSON.stringify(cfg, null, 2));
execSync(`node .claude/skills/video-to-short/scripts/make_root.mjs build/shorts_all.json ${CAP.replace("/captions", "")}/Root.tsx`, { stdio: "inherit" });
console.log("\nAPPLYCUTSDONE — clips re-cut; Root regenerated. Re-render the affected ids.");
