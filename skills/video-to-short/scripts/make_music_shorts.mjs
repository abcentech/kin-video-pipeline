#!/usr/bin/env node
// ONE-STEP music-video shorts builder.
// Turns an ALREADY-GRADED music video (song + burned-in karaoke, e.g. a video-music-3d movie)
// into N vertical Shorts — no re-grade, no re-caption, song preserved. Does the whole pipeline:
//   silent bed -> crop/fill each short (single beat OR multi-beat teaser concat) -> empty
//   captions -> shorts config (intro/closing = 0, hook-first) -> make_root -> optional
//   ensure-root hook (re-inject sibling comps) -> render each id to out/.
//
// Usage:
//   node make_music_shorts.mjs <spec.json> [--no-render]
//
// Spec (paths relative to CWD = project root):
// {
//   "src": "out/he_stood_up_16x9.mp4",
//   "remotion": "remotion-video-studio",
//   "out": "out",                                  // optional, default "out"
//   "ensureRoot": "skills/video-music-3d/scripts/ensure_root.mjs",  // optional, run after make_root
//   "handle": "@KidsInspiringNation",
//   "channels": [ { "glyph":"▶️","label":"YouTube","color":"#FF0033" }, ... ],   // optional
//   "framing": "crop",                             // "crop" (default) | "fill"; per-short override allowed
//   "shorts": [
//     { "id":"HsuMiracle",  "hook":"HE STOOD UP",    "beats":[ {"ss":128,"dur":50} ] },
//     { "id":"HsuMinistry", "hook":"IN JESUS' NAME", "beats":[ {"ss":88,"dur":38} ] },
//     { "id":"HsuTeaser",   "hook":"WATCH HIM WALK", "cuts":"hard", "framing":"crop",
//       "beats":[ {"ss":24,"dur":6},{"ss":78,"dur":7},{"ss":150,"dur":7},{"ss":166,"dur":6},{"ss":186,"dur":7} ] }
//   ]
// }
// `cuts`: "hard" (default, straight cuts) | "fade" (0.25s dip-to-black + audio fade per beat).
// Composition `id`s: letters/digits/hyphen only (no underscores) — Remotion rule.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // .../video-to-short
const CROP = "crop=608:1080:656:0,scale=1080:1920:flags=lanczos,setsar=1";
const FILL =
  "[0:v]split=2[bg][fg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=40:2[bg2];[fg]scale=1080:-1:flags=lanczos[fg2];[bg2][fg2]overlay=(W-w)/2:(H-h)/2,setsar=1";
const AF = "loudnorm=I=-14:TP=-1.5:LRA=11";
const VENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-r", "30",
  "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.0", "-movflags", "+faststart"];
const AENC = ["-c:a", "aac", "-b:a", "192k"];

const sh = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
  if (r.status !== 0) {
    throw new Error(`${cmd} failed (${r.status}):\n${r.stderr?.toString().split("\n").slice(-8).join("\n")}`);
  }
  return r.stdout?.toString() ?? "";
};
const probeDur = (f) =>
  parseFloat(sh("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", f]).trim());

const [, , specPath, ...flags] = process.argv;
if (!specPath) { console.error("usage: make_music_shorts.mjs <spec.json> [--no-render]"); process.exit(1); }
const noRender = flags.includes("--no-render");
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));

const SRC = path.resolve(spec.src);
const REM = path.resolve(spec.remotion);
const OUTDIR = path.resolve(spec.out ?? "out");
const PUB = path.join(REM, "public");
const CAPDIR = path.join(REM, "src", "captions");
const DEF_FRAMING = spec.framing ?? "crop";
for (const d of [PUB, CAPDIR, OUTDIR]) fs.mkdirSync(d, { recursive: true });
if (!fs.existsSync(SRC)) throw new Error(`src not found: ${SRC}`);

// 1) silent music bed (so the 0.16 music layer adds nothing; the clip's own song leads)
const silent = path.join(PUB, "silent.mp3");
if (!fs.existsSync(silent)) {
  sh("ffmpeg", ["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "60", "-q:a", "9", silent]);
  console.log("· wrote public/silent.mp3");
}

// build one beat -> file; framing crop|fill, optional fade for montage joins
const buildBeat = (ss, dur, framing, fade, outFile) => {
  const args = ["-y", "-ss", String(ss), "-t", String(dur), "-i", SRC];
  let vf = framing === "fill" ? FILL : CROP;
  let af = AF;
  if (fade) {
    const fo = (dur - 0.25).toFixed(3);
    vf += `,fade=t=in:st=0:d=0.2,fade=t=out:st=${fo}:d=0.25`;
    af += `,afade=t=in:st=0:d=0.2,afade=t=out:st=${fo}:d=0.25`;
  }
  if (framing === "fill") args.push("-filter_complex", vf);
  else args.push("-vf", vf);
  args.push("-af", af, ...VENC, ...AENC, outFile);
  sh("ffmpeg", args);
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mvshorts-"));
const shortsCfg = [];

for (const s of spec.shorts) {
  const framing = s.framing ?? DEF_FRAMING;
  const beats = s.beats ?? [];
  if (!beats.length) throw new Error(`short ${s.id} has no beats`);
  const videoName = `cine_${s.id}.mp4`;
  const videoPath = path.join(PUB, videoName);

  if (beats.length === 1) {
    buildBeat(beats[0].ss, beats[0].dur, framing, false, videoPath);
  } else {
    const fade = (s.cuts ?? "hard") === "fade";
    const parts = beats.map((b, i) => {
      const p = path.join(tmp, `${s.id}_${i}.mp4`);
      buildBeat(b.ss, b.dur, framing, fade, p);
      return p;
    });
    const listFile = path.join(tmp, `${s.id}_list.txt`);
    fs.writeFileSync(listFile, parts.map((p) => `file '${p}'`).join("\n") + "\n");
    sh("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, ...VENC, ...AENC, videoPath]);
  }

  const clip = probeDur(videoPath);
  // empty captions => no double-captions over the existing burned-in karaoke
  fs.writeFileSync(path.join(CAPDIR, `${s.id}.json`), JSON.stringify({ words: [] }, null, 2) + "\n");
  shortsCfg.push({ id: s.id, video: videoName, music: "silent.mp3", clip, captions: `${s.id}.json`, hook: s.hook ?? "" });
  console.log(`· ${s.id}: ${videoName} (${clip.toFixed(2)}s, ${framing}${beats.length > 1 ? `, ${beats.length} beats` : ""})`);
}

// 2) shorts config — hook-first renderer: intro/closing MUST be 0 (else the clip freezes
//    on its last frame for intro+closing seconds before the end-card).
const cfg = { handle: spec.handle ?? "@KidsInspiringNation", intro: 0, closing: 0, shorts: shortsCfg };
if (spec.channels) cfg.channels = spec.channels;
const genCfgPath = specPath.replace(/\.json$/, "") + ".generated.json";
fs.writeFileSync(genCfgPath, JSON.stringify(cfg, null, 2) + "\n");

// 3) make_root, then optional ensure-root hook (re-inject sibling comps wiped by make_root)
const rootTsx = path.join(REM, "src", "Root.tsx");
execFileSync("node", [path.join(SKILL_DIR, "scripts", "make_root.mjs"), genCfgPath, rootTsx], { stdio: "inherit" });
if (spec.ensureRoot) {
  execFileSync("node", [path.resolve(spec.ensureRoot)], { stdio: "inherit" });
}

// 4) render
if (noRender) {
  console.log(`\n✓ built ${shortsCfg.length} clip(s) + config (${path.basename(genCfgPath)}). Skipped render (--no-render).`);
} else {
  for (const s of shortsCfg) {
    const outFile = path.join(OUTDIR, `${s.id}.mp4`);
    console.log(`\n→ rendering ${s.id} ...`);
    execFileSync("npx", ["remotion", "render", s.id, outFile, "--concurrency=3", "--timeout=120000"],
      { cwd: REM, stdio: "inherit" });
  }
  console.log(`\n✓ done — ${shortsCfg.length} short(s) in ${path.relative(process.cwd(), OUTDIR)}/`);
}

fs.rmSync(tmp, { recursive: true, force: true });
