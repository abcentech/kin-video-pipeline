// Contact sheets of a folder of review stills, labelled with each file's name, for a beat-by-beat review.
//   node scripts/december/review-sheets.mjs <stills dir> <out prefix> [cols=5] [rows=6] [w=512]
// Writes <out prefix>_01.jpg, _02.jpg … (cols x rows stills per sheet, in file-name order).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const [dir, prefix, cols = "5", rows = "6", w = "512"] = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => /\.(jpg|png)$/i.test(f)).sort();
const C = Number(cols), R = Number(rows), W = Number(w);
const font = "C\\\\:/Windows/Fonts/arialbd.ttf";
const tmp = `${path.dirname(prefix)}/_rs_${Date.now()}`;
fs.mkdirSync(tmp, { recursive: true });
let sheet = 0;
for (let i = 0; i < files.length; i += C * R) {
  const part = files.slice(i, i + C * R);
  let H = 0;
  const cells = part.map((f, k) => {
    const dims = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", `${dir}/${f}`]).toString().trim().split(",").map(Number);
    const h = Math.round((W * dims[1]) / dims[0] / 2) * 2;
    H = Math.max(H, h);
    const out = `${tmp}/c${String(k).padStart(3, "0")}.jpg`;
    const label = f.replace(/\.(jpg|png)$/i, "").replace(/[':,\\%]/g, " ").slice(0, 46);
    execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-y", "-i", `${dir}/${f}`, "-vf", `scale=${W}:${h},drawtext=fontfile=${font}:text='${label}':x=4:y=${h - 22}:fontsize=15:fontcolor=yellow:box=1:boxcolor=black@0.75`, "-frames:v", "1", "-q:v", "2", out]);
    return { out, h };
  });
  const args = ["-v", "error", "-nostdin", "-y"];
  for (const c of cells) args.push("-i", c.out);
  const layout = cells.map((_, k) => `${(k % C) * W}_${Math.floor(k / C) * H}`).join("|");
  const name = `${prefix}_${String(++sheet).padStart(2, "0")}.jpg`;
  args.push("-filter_complex", cells.length > 1 ? `xstack=inputs=${cells.length}:layout=${layout}:fill=black` : "null", "-frames:v", "1", "-q:v", "3", name);
  execFileSync("ffmpeg", args);
  console.log(name, part.length);
}
fs.rmSync(tmp, { recursive: true, force: true });
