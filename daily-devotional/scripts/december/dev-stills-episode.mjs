// Review stills (and short sample videos) for the December EPISODE picture — bundle once, render many.
// Run through the render lock:  node scripts/with-render-lock.mjs node scripts/december/dev-stills-episode.mjs [options]
//
//   --day=99                 which day folder (december-public/dayNN)
//   --auto                   every cue: entrance mid-motion / hold / exit, plus cold, title ×3, film slate, a reframe
//   --only=scripture,next    with --auto: only these cue kinds / section kinds
//   --frames=10,200,1300     explicit timeline frames (added to the list)
//   --video=FROM:TO          also render that timeline range to <out>/sample.mp4 (concurrency 3)
//   --thumb                  render Dec-Thumbnail too
//   --out=out/december/dev/episode
//
// A hard-linked minimal public dir is built in .tmp/dec-pub-episode (brand, fonts, outro, the day folder) so the
// bundle copies as little as possible; the bundle is deleted afterwards.
// FIRST: a temp dir of this process's own. The sweep below deletes remotion asset dirs from os.tmpdir(); in the shared
// %TEMP% that once removed a folder another session's render was using.
import "../lib/run-temp.mjs";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";

const arg = (k, d) => {
  const a = process.argv.find((x) => x === `--${k}` || x.startsWith(`--${k}=`));
  if (!a) return d;
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : true;
};
const day = Number(arg("day", 99));
const dd = `day${String(day).padStart(2, "0")}`;
const outDir = path.resolve(arg("out", "out/december/dev/episode"));
fs.mkdirSync(outDir, { recursive: true });

// ── minimal public dir (hard links)
const PUB = path.resolve("december-public");
const MIN = path.resolve(".tmp/dec-pub-episode");
fs.rmSync(MIN, { recursive: true, force: true });
const link = (rel) => {
  const src = path.join(PUB, rel);
  if (!fs.existsSync(src)) return;
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    for (const f of fs.readdirSync(src)) link(path.join(rel, f));
    return;
  }
  const dst = path.join(MIN, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  try {
    fs.linkSync(src, dst);
  } catch {
    fs.copyFileSync(src, dst);
  }
};
["brand", "fonts", "outro/LikeShare_16x9.mp4", dd].forEach(link);
// --proxy: review stills from a light copy of the body (december/work/dayNN/body.proxy.mp4) — Remotion copies the
// source video into its temp dir for every still, and a 1 GB body makes that slow and fragile.
{
  const proxy = path.resolve(`december/work/${dd}/body.proxy.mp4`);
  if (arg("proxy") && fs.existsSync(proxy)) {
    const t = path.join(MIN, dd, "body.mp4");
    fs.rmSync(t, { force: true });
    try {
      fs.linkSync(proxy, t);
    } catch {
      fs.copyFileSync(proxy, t);
    }
  }
}

const plan = JSON.parse(fs.readFileSync(path.join(PUB, dd, "plan.json"), "utf8"));
const ep = plan.episode;

// ── the frame list
const list = [];
const add = (frame, name) => {
  frame = Math.round(frame);
  if (frame < 0 || frame >= ep.durationInFrames) return;
  list.push({ frame, name: name.replace(/[^\w.-]+/g, "_") });
};
const only = arg("only") ? String(arg("only")).split(",") : null;
const want = (k) => !only || only.includes(k);
if (arg("auto")) {
  for (const s of ep.sections) {
    if (!want(s.kind)) continue;
    if (s.kind === "cold") {
      add(s.from + 1, "cold_first");
      for (const b of s.big) add(s.from + b.from + 3, `cold_big_${b.text}`);
      add(s.from + s.dur - 2, "cold_last");
    }
    if (s.kind === "title") {
      add(s.from + 14, "title_door");
      add(s.from + 30, "title_hit");
      add(s.from + 110, "title_hold");
      add(s.from + s.dur - 4, "title_close");
    }
    if (s.kind === "film") {
      add(s.from + 8, "film_open");
      add(s.from + 30, "film_slate");
      add(s.from + 120, "film_tag");
      add(s.from + s.dur - 5, "film_close");
    }
    if (s.kind === "body") {
      add(s.from + 8, "body_open");
      // a camera reframe mid-ease
      const k = ep.cam.find((c) => c.ease === "out") ?? ep.cam.find((c, i) => i > 0 && c.ease !== "cut");
      if (k) add(s.from + k.f - 7, "camera_reframe");
    }
    if (s.kind === "outro") add(s.from + 60, "outro");
  }
  for (const c of ep.cues) {
    if (!want(c.kind)) continue;
    const t = ep.bodyAt + c.from;
    const tag = `${c.kind}${c.mode ? "-" + c.mode : ""}${c.variant ? "-" + c.variant : ""}_${c.id}`;
    add(t + 7, `${tag}_a_in`);
    if (c.kind === "scripture" && c.mode === "page") {
      const mid = c.lit[Math.floor(c.lit.length / 3)];
      add(ep.bodyAt + mid + 2, `${tag}_b_lighting`);
      if (c.hit) add(ep.bodyAt + c.hit + 14, `${tag}_c_hit`);
      add(t + c.dur - 20, `${tag}_d_fall`);
    } else if (c.kind === "chapter") {
      add(t + 12, `${tag}_b_hit`);
      add(t + 40, `${tag}_c_hold`);
      add(t + c.dur + 20, `${tag}_e_chip`);
    } else if (c.kind === "subscribe") {
      add(t + 38, `${tag}_b_prepress`);
      add(t + 56, `${tag}_c_bell`);
      add(t + 100, `${tag}_d_hold`);
    } else if (c.kind === "declare") {
      add(ep.bodyAt + c.lit[Math.floor(c.lit.length / 2)] + 2, `${tag}_b_words`);
      add(ep.bodyAt + c.lit[c.lit.length - 1] + 20, `${tag}_c_burst`);
    } else if (c.kind === "recap") {
      add(t + 75, `${tag}_b_two`);
      add(t + 150, `${tag}_c_all`);
    } else if (c.kind === "response" || c.kind === "prayer") {
      const ls = c.kind === "prayer" ? c.lines : [c.child, c.father].filter(Boolean);
      ls.forEach((l, i) => add(ep.bodyAt + (l.from + l.to) / 2, `${tag}_b_line${i}`));
    } else if (c.kind === "next") {
      add(t + 40, `${tag}_b_land`);
      add(t + 160, `${tag}_c_hold`);
    } else {
      add(t + Math.min(c.dur - 12, Math.max(20, c.dur / 2)), `${tag}_b_hold`);
    }
    add(t + c.dur - 5, `${tag}_z_out`);
  }
}
if (arg("frames")) for (const f of String(arg("frames")).split(",")) add(Number(f), `f${f}`);
list.sort((a, b) => a.frame - b.frame);

// Remotion leaves a full copy of every video it extracts frames from in %TEMP%/remotion-v*-assets* PER renderStill
// (≈ 300 MB each for a body.mp4) — 80 stills filled the disk once. os.tmpdir() is this process's private temp
// (run-temp.mjs, imported first), so every assets dir in it is ours: remove it after each still.
const ASSET_RE = /^remotion-v[\d.]+-assets/;
const assetDirs = () => new Set(fs.readdirSync(os.tmpdir()).filter((n) => ASSET_RE.test(n)));
const before = assetDirs();
const sweep = () => {
  for (const n of assetDirs()) {
    if (before.has(n)) continue;
    try {
      fs.rmSync(path.join(os.tmpdir(), n), { recursive: true, force: true });
    } catch {
      // still locked by the compositor; the next sweep gets it
    }
  }
};

console.log(`bundling (public: ${MIN}) …`);
const serveUrl = await bundle({ entryPoint: path.resolve("src/december-entry.tsx"), publicDir: MIN });
const opts = { serveUrl, chromiumOptions: { gl: "angle" }, timeoutInMilliseconds: 420000 };
try {
  const inputProps = { day };
  const composition = await selectComposition({ ...opts, id: "Dec-Episode", inputProps });
  console.log(`Dec-Episode day ${day}: ${composition.durationInFrames} frames, ${list.length} stills`);
  for (const { frame, name } of list) {
    const output = path.join(outDir, `${String(frame).padStart(5, "0")}_${name}.jpg`);
    const t0 = Date.now();
    await renderStill({ ...opts, composition, inputProps: composition.props, frame, output, imageFormat: "jpeg", jpegQuality: 88 });
    console.log(`wrote ${output} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    sweep();
  }
  if (arg("thumb")) {
    const th = await selectComposition({ ...opts, id: "Dec-Thumbnail", inputProps });
    const output = path.join(outDir, `thumbnail_${dd}.png`);
    await renderStill({ ...opts, composition: th, inputProps: th.props, frame: 0, output, imageFormat: "png" });
    console.log("wrote", output);
  }
  if (arg("video")) {
    const [a, b] = String(arg("video")).split(":").map(Number);
    const output = path.join(outDir, "sample.mp4");
    await renderMedia({
      ...opts,
      composition,
      inputProps: composition.props,
      codec: "h264",
      crf: 18,
      frameRange: [a, b],
      concurrency: 3,
      outputLocation: output,
      onProgress: ({ progress }) => {
        if (Math.round(progress * 100) % 10 === 0) process.stdout.write(`\rvideo ${(progress * 100).toFixed(0)} %`);
      },
    });
    console.log("\nwrote", output);
  }
} finally {
  sweep();
  fs.rmSync(serveUrl, { recursive: true, force: true });
  fs.rmSync(MIN, { recursive: true, force: true });
}
