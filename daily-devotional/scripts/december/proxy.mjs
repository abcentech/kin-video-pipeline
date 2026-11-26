// A light copy of a day's body for review stills: december/work/dayNN/body.proxy.mp4 (same frames, CRF 27, no audio).
//   node scripts/december/proxy.mjs <N>
// Remotion copies the source video for every still; the full body is ~850 MB, the proxy ~60 MB.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { ROOT, pad } from "./lib.mjs";

const n = Number(process.argv[2]);
const src = `${ROOT}/december-public/day${pad(n)}/body.mp4`;
const out = `${ROOT}/december/work/day${pad(n)}/body.proxy.mp4`;
if (!fs.existsSync(src)) (console.error(`no body for day ${n}`), process.exit(1));
const r = spawnSync("ffmpeg", ["-v", "error", "-nostdin", "-y", "-i", src, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-g", "15", "-pix_fmt", "yuv420p",
  "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-movflags", "+faststart", out], { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`${out}  ${(fs.statSync(out).size / 1e6).toFixed(0)} MB`);
