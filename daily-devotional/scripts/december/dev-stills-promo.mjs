// Review stills (and a preview render) for the December promo pieces — ONE bundle per run.
//   node scripts/december/dev-stills-promo.mjs <day> [piece:frames ...] [--auto] [--video=<piece>] [--scale=0.5]
//   piece = t16 | t9 | s<index>     frames = 12,40,95  (or "auto": every beat, entrance + hold)
//   e.g. node scripts/december/dev-stills-promo.mjs 98 --auto
//        node scripts/december/dev-stills-promo.mjs 98 t16:120,140 s0:0,30
//        node scripts/december/dev-stills-promo.mjs 98 --video=t16 --scale=0.667
// Writes out/december/dev/promo/<piece>_<frame>_<what>.png (and <piece>_preview.mp4 for --video).
// Takes the machine-wide render lock itself; bundles from src/december-promo-entry.tsx with a
// hard-linked minimal public dir (fonts, brand, the day), deletes the bundle afterwards.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

if (!process.env.DEC_LOCKED) {
  // never queue behind a long job for more than --lock-wait seconds (default 120): give up and say so
  const waitS = Number((process.argv.find((x) => x.startsWith("--lock-wait=")) ?? "=120").split("=")[1]);
  const lock = path.resolve(".tmp", "kind-outro.render.lock");
  const t0 = Date.now();
  while (fs.existsSync(lock) && Date.now() - t0 < waitS * 1000) spawnSync(process.execPath, ["-e", "setTimeout(()=>{},2000)"]);
  if (fs.existsSync(lock)) {
    let who = "?";
    try {
      who = fs.readFileSync(path.join(lock, "pid"), "utf8");
    } catch {
      /* gone */
    }
    console.error(`render lock still held by pid ${who} after ${waitS} s — not queuing; try again later`);
    process.exit(3);
  }
  const r = spawnSync(process.execPath, ["scripts/with-render-lock.mjs", process.execPath, ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, DEC_LOCKED: "1" } });
  process.exit(r.status ?? 1);
}

// a temp dir of this process's own, before anything reads os.tmpdir(): the sweep below must never touch the shared
// %TEMP% (it once removed a folder another session's render was using)
await import("../lib/run-temp.mjs");

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? "1"]; }));
const pos = args.filter((a) => !a.startsWith("--"));
const day = Number(pos[0]);
const dd = `day${String(day).padStart(2, "0")}`;
const outDir = path.resolve(opt.out ?? "out/december/dev/promo");
fs.mkdirSync(outDir, { recursive: true });
const scale = Number(opt.scale ?? 0.5);
const plan = JSON.parse(fs.readFileSync(`december-public/${dd}/plan.json`, "utf8"));

const pieceOf = (p) => {
  if (p === "t16") return { id: "Dec-Trailer-16x9", props: { day, format: "16x9" }, promo: plan.trailer["16x9"] };
  if (p === "t9") return { id: "Dec-Trailer-9x16", props: { day, format: "9x16" }, promo: plan.trailer["9x16"] };
  const m = /^s(\d+)$/.exec(p);
  if (m) return { id: "Dec-Short", props: { day, index: Number(m[1]) }, promo: plan.shorts[Number(m[1])] };
  throw new Error(`unknown piece ${p}`);
};

/** entrance mid-motion + hold for every beat, plus the big-word slam and its hold */
const autoFrames = (promo) => {
  const fr = [];
  for (const b of promo.beats) {
    const k = b.kind === "line" ? `${b.kind}-${b.mood}` : b.kind;
    fr.push([b.from + 5, `${k}-in`], [b.from + Math.floor(b.dur * 0.62), `${k}-hold`]);
    if (b.kind === "line" && b.big) fr.push([b.from + b.big.from + 4, `${k}-big`], [b.from + Math.min(b.dur - 2, b.big.from + 20), `${k}-bighold`]);
    if (b.kind === "verse" && b.hit !== undefined) fr.push([b.from + b.hit + 8, "verse-hit"]);
    if (b.kind === "title" || b.kind === "end") fr.push([b.from + 20, `${k}-land`]);
  }
  fr.push([promo.durationInFrames - 1, "last"]);
  return fr.filter(([f]) => f >= 0 && f < promo.durationInFrames).sort((a, b) => a[0] - b[0]);
};

const work = [];
if (opt.auto) for (const p of ["t16", "t9", ...plan.shorts.map((_, i) => `s${i}`)]) work.push([p, autoFrames(pieceOf(p).promo)]);
for (const spec of pos.slice(1)) {
  const [p, list] = spec.split(":");
  work.push([p, list === "auto" ? autoFrames(pieceOf(p).promo) : list.split(",").map((x) => [Number(x), "f"])]);
}

// minimal hard-linked public dir: fonts, brand, the day (Remotion copies the whole public dir per bundle)
const pub = path.resolve(".tmp/dec/promo", `pub-${process.pid}`);
const link = (src, dst) => {
  const s = fs.statSync(src);
  if (s.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src)) link(path.join(src, e), path.join(dst, e));
  } else {
    try {
      fs.linkSync(src, dst);
    } catch {
      fs.copyFileSync(src, dst);
    }
  }
};
for (const d of ["fonts", "brand", dd]) link(path.resolve("december-public", d), path.join(pub, d));
// review stills from the light proxy of the body when one exists (Remotion copies source videos per still)
{
  const proxy = path.resolve("december/work", dd, "body.proxy.mp4");
  const t = path.join(pub, dd, "body.mp4");
  if (!process.argv.some((x) => x.startsWith("--video")) && fs.existsSync(proxy) && fs.existsSync(t)) {
    fs.rmSync(t, { force: true });
    try {
      fs.linkSync(proxy, t);
    } catch {
      fs.copyFileSync(proxy, t);
    }
  }
}

// Every renderStill/renderMedia downloads the media it references (body.mp4 is ~400 MB) into a fresh
// os.tmpdir()/remotion-v4*-assets* dir and leaves it behind: remove the ones this run creates.
const assetDirs = () => new Set(fs.readdirSync(os.tmpdir()).filter((d) => /^remotion-v.*-assets/.test(d)));
const before = assetDirs();
const sweep = () => {
  // a dir still held by the compositor is retried at the next sweep
  for (const d of assetDirs()) {
    if (before.has(d)) continue;
    try {
      fs.rmSync(path.join(os.tmpdir(), d), { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch {
      /* busy: next sweep */
    }
  }
};

const { bundle } = await import("@remotion/bundler");
const { renderStill, renderMedia, selectComposition } = await import("@remotion/renderer");
let serveUrl;
try {
  console.log("bundling…");
  serveUrl = await bundle({ entryPoint: path.resolve("src/december-promo-entry.tsx"), publicDir: pub });
  const chromiumOptions = { gl: "angle" };
  for (const [p, frames] of work) {
    const { id, props } = pieceOf(p);
    const composition = await selectComposition({ serveUrl, id, inputProps: props, chromiumOptions, timeoutInMilliseconds: 420000 });
    for (const [f, what] of frames) {
      if (f >= composition.durationInFrames) continue;
      const output = path.join(outDir, `${p}_${String(f).padStart(4, "0")}_${what}.png`);
      const t0 = Date.now();
      await renderStill({ serveUrl, composition, frame: f, output, inputProps: props, chromiumOptions, scale, timeoutInMilliseconds: 420000, imageFormat: "png" });
      console.log("wrote", path.relative(process.cwd(), output), `${Date.now() - t0} ms`);
      sweep();
    }
  }
  if (opt.video) {
    const p = opt.video;
    const { id, props } = pieceOf(p);
    const composition = await selectComposition({ serveUrl, id, inputProps: props, chromiumOptions, timeoutInMilliseconds: 420000 });
    const output = path.join(outDir, opt.name ?? `${p === "t16" ? "trailer" : p}_preview.mp4`);
    const t0 = Date.now();
    let last = -1;
    await renderMedia({
      serveUrl,
      composition,
      inputProps: props,
      codec: "h264",
      ...(opt.range ? { frameRange: opt.range.split("-").map(Number) } : {}),
      outputLocation: output,
      scale: Number(opt.scale ?? 0.667),
      concurrency: Number(opt.concurrency ?? 3),
      chromiumOptions,
      timeoutInMilliseconds: 420000,
      // the laptop runs out of RAM with Remotion's default frame cache (a 1920x1620 matte frame is 9 MB)
      offthreadVideoCacheSizeInBytes: 384 * 1024 * 1024,
      onProgress: ({ progress }) => {
        const pc = Math.floor(progress * 20) * 5;
        if (pc !== last) {
          last = pc;
          console.log(`render ${pc}%`);
        }
      },
    });
    console.log("wrote", output, `${((Date.now() - t0) / 1000).toFixed(0)} s`, fs.existsSync(output) ? `${fs.statSync(output).size} bytes` : "MISSING");
  }
} finally {
  try {
    sweep();
  } catch (e) {
    console.warn("asset sweep:", e.message);
  }
  if (serveUrl) fs.rmSync(serveUrl, { recursive: true, force: true });
  fs.rmSync(pub, { recursive: true, force: true });
}
if (opt.video) console.log("after cleanup:", fs.readdirSync(outDir).filter((x) => x.endsWith(".mp4")).join(" ") || "no mp4");
