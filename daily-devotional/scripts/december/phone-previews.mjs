// Phone-size copies of a day's finals, for sending to the producer (each must stay under 30 MiB).
//   node scripts/december/phone-previews.mjs <N> [--out=<dir>]   → out/december/DayNN/preview/final/
// Episode 960x540 CRF 27; trailers and shorts at 720 on the short side, CRF 24; audio AAC 96k. Finals are never touched.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { ROOT, pad, readJson } from "./lib.mjs";

const n = Number(process.argv[2]);
const NN = pad(n);
const OUT = `${ROOT}/out/december/Day${NN}`;
const dst = (process.argv.find((a) => a.startsWith("--out="))?.slice(6) ?? `${OUT}/preview/final`).split("\\").join("/");
fs.mkdirSync(dst, { recursive: true });
const plan = readJson(`${ROOT}/december-public/day${NN}/plan.json`);
const slug = String(plan.meta.title).replace(/[’']/g, "").replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).join("_");
const jobs = [
  { src: `Day${NN}_${slug}_16x9.mp4`, vf: "scale=960:540:flags=lanczos", crf: 27 },
  { src: `Day${NN}_Trailer_16x9.mp4`, vf: "scale=1280:720:flags=lanczos", crf: 24 },
  { src: `Day${NN}_Trailer_9x16.mp4`, vf: "scale=720:1280:flags=lanczos", crf: 24 },
  ...plan.shorts.map((_, i) => ({ src: `Day${NN}_Short${i + 1}_9x16.mp4`, vf: "scale=720:1280:flags=lanczos", crf: 24 })),
];
let bad = 0;
for (const j of jobs) {
  const out = `${dst}/${j.src.replace(/\.mp4$/, "_phone.mp4")}`;
  if (process.argv.includes("--missing") && fs.existsSync(out) && fs.statSync(out).size / 1048576 < 30) {
    console.log(`ok   ${out}  (kept)`);
    continue;
  }
  // the size limit is hard (the file does not reach the phone otherwise): step the quality down until it fits
  let r, mib = 0;
  for (const crf of [j.crf, j.crf + 2, j.crf + 4, j.crf + 6]) {
    r = spawnSync("ffmpeg", ["-v", "error", "-nostdin", "-y", "-i", `${OUT}/${j.src}`, "-vf", `${j.vf},setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv`, "-c:v", "libx264", "-preset", "medium", "-crf", String(crf), "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out], { stdio: "inherit" });
    mib = fs.existsSync(out) ? fs.statSync(out).size / 1048576 : 0;
    if (r.status !== 0 || mib < 29.5) break;
  }
  const ok = r.status === 0 && mib > 0 && mib < 30;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${out}  ${mib.toFixed(1)} MiB`);
}
process.exit(bad ? 1 : 0);
