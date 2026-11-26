// One picture of a day's episode layout for the producer: its key beats in running order, labelled in plain words.
//   node scripts/december/layout-picture.mjs <N> [--no-proxy]
// → out/december/DayNN/preview/DayNN_layout_01.jpg   (the checkpoint BEFORE any video is rendered)
// Renders only those frames (dev-stills-episode --frames) from the proxy body, so it takes minutes, not an hour.
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const n = Number(process.argv[2]);
if (!Number.isFinite(n)) {
  console.error("usage: layout-picture.mjs <N> [--no-proxy]");
  process.exit(1);
}
const dd = `day${String(n).padStart(2, "0")}`;
const DD = `Day${String(n).padStart(2, "0")}`;
const plan = JSON.parse(fs.readFileSync(`december-public/${dd}/plan.json`, "utf8"));
const e = plan.episode;
const at = e.bodyAt;
const beats = [];
const add = (label, frame) => beats.push({ label, frame: Math.max(0, Math.min(e.durationInFrames - 1, Math.round(frame))) });
const sec = (k) => e.sections.filter((s) => s.kind === k);
const cold = sec("cold");
if (cold.length) add("Hook", cold[0].from + cold[0].dur * 0.72);
for (const s of sec("title")) add("Title", s.from + s.dur * 0.6);
for (const s of sec("film")) add("Film clip", s.from + Math.min(120, s.dur * 0.4));
const seen = {};
const nth = (k) => (seen[k] = (seen[k] ?? 0) + 1);
for (const c of e.cues) {
  const f0 = at + c.from;
  switch (c.kind) {
    case "scripture":
      if (nth("scripture") === 1) add("Scripture", f0 + c.dur * 0.45);
      break;
    case "keyword":
      if (nth("keyword") <= 2) add("Key word", f0 + 24);
      break;
    case "point":
      if (nth("point") <= 2) add("Point line", f0 + c.dur * 0.72);
      break;
    case "chapter":
      add(`Truth ${nth("chapter")} card`, f0 + 36);
      break;
    case "film":
      if (nth("film") === 1) add("Film cutaway", f0 + Math.min(30, c.dur / 2));
      break;
    case "art":
      add(`Illustration ${nth("art")}`, f0 + c.dur / 2);
      break;
    case "subscribe":
      if (nth("subscribe") === 1) add("Subscribe nudge", f0 + 80);
      break;
    case "recap":
      add("Three truths recap", f0 + Math.min(c.dur - 30, 150));
      break;
    case "response":
      add("Tonight cards", f0 + c.dur * 0.75);
      break;
    case "prayer":
      add("Prayer", f0 + Math.min(100, c.dur / 3));
      break;
    case "declare":
      add("Say it with us", f0 + Math.min(110, c.dur * 0.8));
      break;
    case "next":
      add("Tomorrow card", f0 + Math.min(150, c.dur * 0.6));
      break;
    default:
  }
}
const run = (args, env = {}) => {
  const r = spawnSync(process.execPath, args, { stdio: "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
if (!process.argv.includes("--no-proxy")) run(["scripts/december/proxy.mjs", String(n)], { DEC_LOCKED: "1" });
const q = `out/december/${DD}/qc`;
const src = `${q}/layout-src`;
const dst = `${q}/layout`;
fs.rmSync(src, { recursive: true, force: true });
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
run(["scripts/december/dev-stills-episode.mjs", `--day=${n}`, "--thumb", "--proxy", `--frames=${beats.map((b) => b.frame).join(",")}`, `--out=${src}`], { DEC_LOCKED: "1" });
const files = fs.readdirSync(src);
let k = 0;
for (const b of beats) {
  const f = files.find((x) => x.startsWith(String(b.frame).padStart(5, "0") + "_"));
  if (!f) {
    console.error(`  ! no still for frame ${b.frame} (${b.label})`);
    continue;
  }
  k++;
  fs.copyFileSync(`${src}/${f}`, `${dst}/${String(k).padStart(2, "0")} ${b.label}.${f.split(".").pop()}`);
}
const th = files.find((x) => x.startsWith("thumbnail"));
if (th) fs.copyFileSync(`${src}/${th}`, `${dst}/${String(k + 1).padStart(2, "0")} Thumbnail.${th.split(".").pop()}`);
fs.mkdirSync(`out/december/${DD}/preview`, { recursive: true });
for (const f of fs.readdirSync(`out/december/${DD}/preview`)) if (/_layout_\d+\.jpg$/.test(f)) fs.rmSync(`out/december/${DD}/preview/${f}`);
run(["scripts/december/review-sheets.mjs", dst, `out/december/${DD}/preview/${DD}_layout`, "5", "5", "512"]);
console.log(`layout picture: out/december/${DD}/preview/${DD}_layout_01.jpg (${k + (th ? 1 : 0)} beats)`);
