// Find the "clean gaps" in an ALREADY-EDITED video — the plain talking-head
// stretches with no burned-in graphics/animation — so kinetic overlays only go
// there. Edited channels flash scripture cards in/out faster than scene-cut
// detection catches, so this builds DENSE contact sheets for a human to verify.
//
//   node detect_gaps.mjs <graded_or_source.mp4> <bodyStartSec> <bodyEndSec> [stepSec=4] [outDir=out/gaps]
//
// Outputs: scene_cuts.txt (hard cuts) + sweepNN.png contact sheets (one frame
// every <stepSec>, 6 per row, time-ordered). Read the sheets, mark which cells
// are clean talking-head, and translate cell index -> time:
//     time = bodyStart + cellIndex * stepSec   (row-major, 6 cells/row)
// Then place scenes only inside the clean runs. ALWAYS re-verify a candidate
// window at 1s resolution before committing — cards can flash between samples.
import { execSync } from "node:child_process";
import fs from "node:fs";

const [src, b0, b1, step = "4", outDir = "out/gaps"] = process.argv.slice(2);
if (!src) { console.error("usage: detect_gaps.mjs <video> <bodyStartSec> <bodyEndSec> [stepSec] [outDir]"); process.exit(1); }
const bodyStart = +b0, bodyEnd = +b1, S = +step;
fs.mkdirSync(outDir, { recursive: true });

// hard scene cuts (coarse — animation boundaries)
execSync(`ffmpeg -hide_banner -nostats -i "${src}" -filter_complex "select='gt(scene,0.30)',showinfo" -f null - 2>&1 | grep pts_time | sed -E 's/.*pts_time:([0-9.]+).*/\\1/' > ${outDir}/scene_cuts.txt`, { shell: "/bin/zsh" });

// dense contact sheets, ~60 cells each (6x10), every S seconds
const span = bodyEnd - bodyStart;
const perSheet = 60 * S; // seconds covered per 6x10 sheet
let n = 0;
for (let t = bodyStart; t < bodyEnd; t += perSheet, n++) {
  const to = Math.min(t + perSheet, bodyEnd);
  const out = `${outDir}/sweep${String(n).padStart(2, "0")}.png`;
  execSync(`ffmpeg -y -hide_banner -loglevel error -ss ${t} -to ${to} -i "${src}" -vf "fps=1/${S},scale=210:-1,tile=6x10:padding=4:margin=4:color=white" "${out}"`);
  console.log(`${out}  starts ${t}s, +${S}s per cell (6/row)`);
}
console.log(`\nsheets: ${n}.  cell time = ${bodyStart} + index*${S}s.  Verify finalists at 1s before committing.`);
