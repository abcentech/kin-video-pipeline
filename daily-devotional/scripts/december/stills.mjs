// scripts/december/stills.mjs <N> [--only=episode,trailer16,trailer9,short1,…] [--frames=a,b,c] [--thumbnail] [--keep]
//
// Review frames for every piece → out/december/DayNN/qc/stills/<piece>/<frame>_<label>.jpg + contact sheets
// (labelled with cue id + time) → out/december/DayNN/qc/stills/<piece>_sheet<k>.jpg
//   episode: every cue at from+8, mid-hold and from+dur−4; each section start +20; each camera cut ±1
//   promos : every beat at +6 and mid
// One bundle per entry file (src/december-entry.tsx, src/december-promo-entry.tsx), public dir = hard-linked
// minimal copy at .tmp/dec/public-dayNN. Runs under scripts/with-render-lock.mjs.
// --frames=…  render exactly these timeline frames of the (single) selected piece (mechanics test).
// --thumbnail render Dec-Thumbnail frame 0 → out/december/DayNN/DayNN_thumbnail.png and stop.
import fs from "node:fs";
import path from "node:path";
import { args, dayArg, ensureLocked, needDisk, makePublic, rmDir, loadPlan, pieces, selectPieces, entryFor, entryFile, tcs, sweepTemp, PROCESS_START } from "./back.mjs";
import { ROOT, pad, ff, log, exists } from "./lib.mjs";

ensureLocked();
await import("../lib/run-temp.mjs");
const { bundle } = await import("@remotion/bundler");
const { openBrowser, renderStill, selectComposition } = await import("@remotion/renderer");

const n = dayArg();
needDisk(3);
const plan = loadPlan(n);
const all = pieces(n, plan);
const chromiumOptions = { gl: "angle" };
const qcDir = `${ROOT}/out/december/Day${pad(n)}/qc`;
const stillsRoot = `${qcDir}/stills`;
fs.mkdirSync(stillsRoot, { recursive: true });

function framesFor(p) {
  const want = new Map();
  const add = (f, label) => {
    f = Math.round(f);
    if (f < 0 || f >= p.frames) return;
    want.set(f, want.has(f) ? `${want.get(f)}+${label}` : label);
  };
  if (p.id === "episode") {
    const e = plan.episode;
    const counts = {};
    for (const s of e.sections) {
      counts[s.kind] = (counts[s.kind] ?? 0) + 1;
      add(s.from + 20, `sec-${s.kind}${counts[s.kind]}`);
    }
    for (const c of e.cues) {
      const a = e.bodyAt + c.from;
      add(a + 8, `${c.id}-in`);
      add(a + Math.floor(c.dur / 2), `${c.id}-mid`);
      add(a + c.dur - 4, `${c.id}-out`);
    }
    e.cuts.forEach((c, k) => {
      add(e.bodyAt + c - 1, `cut${k + 1}a`);
      add(e.bodyAt + c + 1, `cut${k + 1}b`);
    });
  } else {
    const pl = p.id === "trailer16" ? plan.trailer["16x9"] : p.id === "trailer9" ? plan.trailer["9x16"] : plan.shorts[p.props.index];
    pl.beats.forEach((b, k) => {
      add(b.from + 6, `${b.kind}${k + 1}-in`);
      add(b.from + Math.floor(b.dur / 2), `${b.kind}${k + 1}-mid`);
    });
  }
  return [...want.entries()].sort((a, b) => a[0] - b[0]);
}

async function sheet(pieceId, shots, landscape) {
  const dir = `${stillsRoot}/${pieceId}`;
  const thumbs = `${dir}/.thumbs`;
  fs.rmSync(thumbs, { recursive: true, force: true });
  fs.mkdirSync(thumbs, { recursive: true });
  const w = landscape ? 480 : 216;
  let i = 0;
  for (const s of shots) {
    const lab = `${s.label.slice(0, 34)}  f${s.frame}  ${tcs(s.frame).replace(":", "m")}s`.replace(/[^A-Za-z0-9_+. -]/g, "");
    const vf = `scale=${w}:-2,drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='${lab}':fontcolor=white:fontsize=${landscape ? 17 : 13}:box=1:boxcolor=black@0.65:boxborderw=3:x=4:y=h-th-4`;
    await ff(["-i", s.file, "-vf", vf, "-frames:v", "1", "-q:v", "3", `${thumbs}/${String(i++).padStart(4, "0")}.jpg`]);
  }
  const per = landscape ? 20 : 16;
  const cols = landscape ? 4 : 8;
    const pages = Math.ceil(shots.length / per);
  for (let pg = 0; pg < pages; pg++) {
    const list = `${thumbs}/list${pg}.txt`;
    const slice = Array.from({ length: Math.min(per, shots.length - pg * per) }, (_, k) => `file '${thumbs}/${String(pg * per + k).padStart(4, "0")}.jpg'`);
    fs.writeFileSync(list, slice.join("\n"));
    await ff(["-f", "concat", "-safe", "0", "-i", list, "-vf", `tile=${cols}x${Math.max(1, Math.ceil(slice.length / cols))}:padding=4:color=0x101820`, "-frames:v", "1", "-q:v", "3", `${stillsRoot}/${pieceId}_sheet${pg + 1}.jpg`]);
  }
  rmDir(thumbs);
  return pages;
}

const pub = makePublic(n);
const bundles = new Map();
const browser = await openBrowser("chrome", { chromiumOptions });
const cleanup = async () => {
  try {
    await browser.close({ silent: true });
  } catch {}
  for (const b of bundles.values()) rmDir(b);
  sweepTemp(PROCESS_START);
  if (!args.keep) rmDir(pub);
};
async function serve(entryName) {
  if (!bundles.has(entryName)) {
    if (!exists(entryFile(entryName))) throw new Error(`${entryFile(entryName)} does not exist yet`);
    log(`bundling ${entryName} …`);
    bundles.set(entryName, await bundle({ entryPoint: entryFile(entryName), publicDir: pub }));
  }
  return bundles.get(entryName);
}

try {
  if (args.thumbnail) {
    const serveUrl = await serve("december-entry.tsx");
    const comp = await selectComposition({ serveUrl, id: "Dec-Thumbnail", inputProps: { day: n }, chromiumOptions, puppeteerInstance: browser, timeoutInMilliseconds: 120000 });
    const out = `${ROOT}/out/december/Day${pad(n)}/Day${pad(n)}_thumbnail.png`;
    await renderStill({ serveUrl, composition: comp, inputProps: { day: n }, frame: 0, output: out, imageFormat: "png", chromiumOptions, puppeteerInstance: browser, timeoutInMilliseconds: 120000 });
    sweepTemp(PROCESS_START, [...bundles.values()]);
    log(`thumbnail → ${out}`);
  } else {
    const todo = selectPieces(all, args.only);
    if (args.frames && todo.length !== 1) throw new Error("--frames needs exactly one piece via --only=");
    for (const p of todo) {
      const entry = entryFor(p.comp);
      const serveUrl = await serve(entry);
      const comp = await selectComposition({ serveUrl, id: p.comp, inputProps: p.props, chromiumOptions, puppeteerInstance: browser, timeoutInMilliseconds: 120000 });
      if (comp.durationInFrames !== p.frames) console.warn(`  ! ${p.comp}: composition is ${comp.durationInFrames} frames, plan says ${p.frames}`);
      const list = args.frames && args.frames !== true ? String(args.frames).split(",").map((x) => [Number(x), `f${x}`]) : framesFor(p);
      const dir = `${stillsRoot}/${p.id}`;
      rmDir(dir);
      fs.mkdirSync(dir, { recursive: true });
      log(`${p.label}: ${list.length} stills`);
      const shots = [];
      let k = 0;
      for (const [frame, label] of list) {
        const file = `${dir}/${String(frame).padStart(5, "0")}_${label.replace(/[^A-Za-z0-9_+-]/g, "")}.jpg`;
        await renderStill({ serveUrl, composition: comp, inputProps: p.props, frame, output: file, imageFormat: "jpeg", jpegQuality: 80, chromiumOptions, puppeteerInstance: browser, timeoutInMilliseconds: 120000 });
        shots.push({ file, frame, label });
        sweepTemp(PROCESS_START, [...bundles.values()]);
        process.stdout.write(`\r  ${++k}/${list.length}`);
      }
      process.stdout.write("\n");
      const pages = await sheet(p.id, shots, p.w > p.h);
      log(`${p.label}: ${shots.length} stills → ${dir}  (${pages} sheet page${pages > 1 ? "s" : ""}: ${stillsRoot}/${p.id}_sheet*.jpg)`);
    }
  }
} catch (e) {
  console.error(e.message ?? e);
  await cleanup();
  process.exit(1);
}
await cleanup();
process.exit(0);
void path;
