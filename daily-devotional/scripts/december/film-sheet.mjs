// Time-stamped contact sheet of a range of a video (to look through a film clip shot by shot).
//   node scripts/december/film-sheet.mjs <in> <from s> <dur s> <step s> <cols> <out.jpg> [cell width=384]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const [inp, from, dur, step, cols, out, w = "384"] = process.argv.slice(2);
const dir = path.dirname(out).split("\\").join("/");
const tmp = `${dir}/_sheet_${Date.now()}`;
fs.mkdirSync(tmp, { recursive: true });
const n = Math.floor(Number(dur) / Number(step));
const h = Math.round((Number(w) * 9) / 16 / 2) * 2;
const list = [];
for (let i = 0; i < n; i++) {
  const t = Number(from) + i * Number(step);
  const f = `${tmp}/f${String(i).padStart(3, "0")}.jpg`;
  const label = `${Math.floor(t / 60)}\\:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-y", "-ss", String(t), "-i", inp, "-frames:v", "1", "-vf", `scale=${w}:${h},drawtext=fontfile=C\\\\:/Windows/Fonts/arialbd.ttf:text='${label}':x=6:y=6:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.6`, f]);
  list.push(f);
}
const rows = Math.ceil(n / Number(cols));
const args = ["-v", "error", "-nostdin", "-y"];
for (const f of list) args.push("-i", f);
const layout = list.map((_, i) => `${(i % Number(cols)) * Number(w)}_${Math.floor(i / Number(cols)) * h}`).join("|");
args.push("-filter_complex", `xstack=inputs=${list.length}:layout=${layout}:fill=black`, "-frames:v", "1", "-q:v", "3", out);
execFileSync("ffmpeg", args);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${out}: ${n} frames, ${cols}x${rows}`);
