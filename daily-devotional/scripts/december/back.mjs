// scripts/december/back.mjs — helpers shared by the back-half stages (art, stills, render, qc, post, make, watch).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { ROOT, pad, readJson, exists } from "./lib.mjs";

export const args = (() => {
  const o = { _: [] };
  for (const a of process.argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) o[m[1]] = m[2] ?? true;
    else o._.push(a);
  }
  return o;
})();

export const dayArg = () => {
  const n = Number(args._[0]);
  if (!Number.isInteger(n) || n < 0 || n > 99) {
    console.error("usage: <script> <N> [options]   (N = 0..30; 99 = test)");
    process.exit(2);
  }
  return n;
};

/** .tmp must never be scanned by Tailwind: keep `*` in .tmp/.gitignore. */
export function ensureTmp() {
  fs.mkdirSync(`${ROOT}/.tmp`, { recursive: true });
  const g = `${ROOT}/.tmp/.gitignore`;
  if (!fs.existsSync(g) || !/^\*\s*$/m.test(fs.readFileSync(g, "utf8"))) fs.writeFileSync(g, "*\n");
}

/** Re-run this script under the machine-wide render lock (one heavy job at a time). Call before importing remotion. */
export function ensureLocked() {
  if (process.env.DEC_LOCKED === "1") return;
  ensureTmp();
  const r = spawnSync(process.execPath, [`${ROOT}/scripts/with-render-lock.mjs`, process.execPath, ...process.execArgv, ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, DEC_LOCKED: "1" } });
  process.exit(r.status ?? 1);
}

export const slug = (title) =>
  String(title)
    .replace(/[’']/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .join("_");

export const planFile = (n) => `${ROOT}/december-public/day${pad(n)}/plan.json`;
export const loadPlan = (n) => readJson(planFile(n));

/** Every piece of a day, with composition id, size, length and output name (PIPELINE.md deliverables). */
export function pieces(n, plan) {
  const D = `Day${pad(n)}`;
  const out = [
    { id: "episode", comp: "Dec-Episode", props: { day: n }, w: 1920, h: 1080, frames: plan.episode.durationInFrames, audio: plan.episode.audio, file: `${D}_${slug(plan.meta.title)}_16x9.mp4`, label: "episode" },
    { id: "trailer16", comp: "Dec-Trailer-16x9", props: { day: n }, w: 1920, h: 1080, frames: plan.trailer["16x9"].durationInFrames, audio: plan.trailer["16x9"].audio, file: `${D}_Trailer_16x9.mp4`, label: "trailer 16x9" },
    { id: "trailer9", comp: "Dec-Trailer-9x16", props: { day: n }, w: 1080, h: 1920, frames: plan.trailer["9x16"].durationInFrames, audio: plan.trailer["9x16"].audio, file: `${D}_Trailer_9x16.mp4`, label: "trailer 9x16" },
  ];
  plan.shorts.forEach((s, i) => out.push({ id: `short${i + 1}`, comp: "Dec-Short", props: { day: n, index: i }, w: 1080, h: 1920, frames: s.durationInFrames, audio: s.audio, file: `${D}_Short${i + 1}_9x16.mp4`, label: `short ${i + 1}` }));
  return out;
}
export const selectPieces = (all, only) => (only && only !== true ? all.filter((p) => String(only).split(",").map((s) => s.trim()).includes(p.id)) : all);

export function freeGB(dir = ROOT) {
  const s = fs.statfsSync(dir);
  return (s.bavail * s.bsize) / 1e9;
}
export function needDisk(gb) {
  const f = freeGB();
  if (f < gb) {
    console.error(`NOT ENOUGH DISK: ${f.toFixed(1)} GB free on the project drive, need ≥ ${gb} GB. Free some space (out/, .tmp/, old bundles) and re-run.`);
    process.exit(3);
  }
  return f;
}

const linkTree = (from, to) => {
  const st = fs.statSync(from);
  if (st.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(from)) linkTree(path.join(from, f), path.join(to, f));
  } else {
    try {
      fs.linkSync(from, to);
    } catch {
      fs.copyFileSync(from, to);
    }
  }
};

/** Hard-linked minimal public dir: the shared folders (brand, fonts, outro, …) + this day's folder; never the other days. */
export function makePublic(n) {
  const src = `${ROOT}/december-public`;
  const dst = `${ROOT}/.tmp/dec/public-day${pad(n)}`;
  fs.rmSync(dst, { recursive: true, force: true });
  for (const f of fs.readdirSync(src)) {
    if (/^day\d+$/.test(f) && f !== `day${pad(n)}`) continue;
    if (f === "fixture") continue;
    linkTree(path.join(src, f), path.join(dst, f));
  }
  return dst;
}

/** Remove a directory, retrying: Windows holds files for a moment after Chrome exits. */
export function rmDir(p) {
  for (let i = 0; i < 5; i++) {
    try {
      fs.rmSync(p, { recursive: true, force: true });
      return;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }
}

export const entryFile = (name) => `${ROOT}/src/${name}`;
export const entryHas = (compId) => {
  for (const f of ["december-entry.tsx", "december-promo-entry.tsx"]) {
    const p = entryFile(f);
    if (exists(p) && new RegExp(`id=["'{\`]+${compId}["'}\`]`).test(fs.readFileSync(p, "utf8"))) return true;
  }
  return false;
};
export const entryFor = (comp) => (comp === "Dec-Episode" || comp === "Dec-Thumbnail" ? "december-entry.tsx" : "december-promo-entry.tsx");

export const tcs = (f) => {
  const s = f / 30;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
};

/**
 * Remotion leaves a copy of every public asset (body.mp4 …) in %TEMP%\remotion-v4*-assets* per still/render and a bundle dir per
 * bundle(). Delete the ones THIS process created (born after `since`), never anyone else's. `keep` = bundle dirs still in use.
 */
export function sweepTemp(since, keep = []) {
  const base = os.tmpdir();
  let n = 0;
  for (const d of fs.readdirSync(base, { withFileTypes: true })) {
    if (!d.isDirectory() || !/^(remotion-v4.*-assets|remotion-webpack-bundle-)/.test(d.name)) continue;
    const p = path.join(base, d.name);
    if (keep.some((k) => path.resolve(k) === path.resolve(p))) continue;
    try {
      if (fs.statSync(p).birthtimeMs < since - 1000) continue;
    } catch {
      continue;
    }
    rmDir(p);
    n++;
  }
  return n;
}
export const PROCESS_START = Date.now();
