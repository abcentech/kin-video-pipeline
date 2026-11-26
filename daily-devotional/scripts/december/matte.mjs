// THE FATHER SHOWED UP — matted presenter clips for the trailer.
//   node scripts/december/matte.mjs <N> [--force] [--only=t1,t3] [--retrack]
// Reads december-public/dayNN/plan.json and, for every job in plan.trailer["16x9"].mattes (plus any
// extra in ["9x16"]) `{ out, bodyFrom, frames }`, builds `december-public/<out>` from
// december-public/dayNN/body.mp4: a 1920x1620 H.264 clip (colour on top, half-size RVM matte
// bottom-left — tools/matte/rvm.mjs) WITH the same body range's audio (the sound stage takes each
// line's voice from it). Resumable: a sidecar `<out>.json` holds { bodyFrom, frames, body mtime+size };
// a clip whose sidecar matches is skipped. Takes the machine-wide render lock itself.
// The sidecar also carries `track`: the head measured from the matte, [clipFrame, x, capTop] (source 0..1,
// every frame, lightly smoothed) — the promo picture uses it to keep the 9:16 crop and the behind-words on
// his head when he sways faster than the plan's two camera keys can follow.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

if (!process.env.DEC_LOCKED) {
  const r = spawnSync(process.execPath, ["scripts/with-render-lock.mjs", process.execPath, ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, DEC_LOCKED: "1" } });
  process.exit(r.status ?? 1);
}

const FPS = 30;
const day = Number(process.argv[2]);
if (!Number.isFinite(day)) {
  console.error("usage: node scripts/december/matte.mjs <N> [--force] [--only=t1,t2]");
  process.exit(2);
}
const force = process.argv.includes("--force");
const only = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);
const dd = `day${String(day).padStart(2, "0")}`;
const pub = path.resolve("december-public");
const planFile = path.join(pub, dd, "plan.json");
const body = path.join(pub, dd, "body.mp4");
const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
const st = fs.statSync(body);
const bodyKey = { mtime: Math.round(st.mtimeMs), size: st.size };
const scratch = path.resolve("december/work", dd, "matte");
fs.mkdirSync(scratch, { recursive: true });

const jobs = new Map();
for (const fmt of ["16x9", "9x16"]) for (const m of plan.trailer?.[fmt]?.mattes ?? []) if (!jobs.has(m.out)) jobs.set(m.out, m);
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"], maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (${r.status})`);
  return r.stdout.toString();
};
const framesOf = (file) => Number(run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", file]).trim());

/** Head track from the matte half: top of the silhouette + its centre across the rows under it. */
const measure = (clip) => {
  const W = 480, H = 270;
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", clip, "-vf", `crop=960:540:0:1080,scale=${W}:${H}`, "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`measure ${clip} failed`);
  const raw = r.stdout;
  const n = Math.floor(raw.length / (W * H));
  const pts = [];
  for (let k = 0; k < n; k++) {
    const o = k * W * H;
    let top = -1;
    for (let y = 0; y < H && top < 0; y++) {
      let run = 0;
      for (let x = 0; x < W; x++) {
        run = raw[o + y * W + x] > 128 ? run + 1 : 0;
        if (run >= 6) {
          top = y;
          break;
        }
      }
    }
    if (top < 0) {
      pts.push(null);
      continue;
    }
    let sx = 0, c = 0;
    for (let y = top; y < Math.min(H, top + H * 0.14); y++)
      for (let x = 0; x < W; x++) if (raw[o + y * W + x] > 128) { sx += x; c++; }
    pts.push([sx / Math.max(1, c) / W, top / H]);
  }
  let last = pts.find(Boolean) ?? [0.5, 0.2];
  const filled = pts.map((p) => (last = p ?? last));
  // centred ±6 frames (no lag): steady for a camera, still fast enough to follow a sway
  return filled.map((_, i) => {
    let x = 0, t = 0, c = 0;
    for (let j = Math.max(0, i - 6); j <= Math.min(filled.length - 1, i + 6); j++) { x += filled[j][0]; t += filled[j][1]; c++; }
    return [i, +(x / c).toFixed(4), +(t / c).toFixed(4)];
  });
};

let built = 0;
let builtFrames = 0;
let builtMs = 0;
for (const [out, m] of jobs) {
  const id = path.basename(out, ".mp4");
  if (only.length && !only.includes(id)) continue;
  const dst = path.join(pub, out);
  const side = `${dst}.json`;
  const want = { bodyFrom: m.bodyFrom, frames: m.frames, body: bodyKey };
  if (!force && fs.existsSync(dst) && fs.existsSync(side)) {
    const have = JSON.parse(fs.readFileSync(side, "utf8"));
    if (have.bodyFrom === want.bodyFrom && have.frames === want.frames && have.body?.mtime === bodyKey.mtime && have.body?.size === bodyKey.size) {
      if (!have.track || process.argv.includes("--retrack")) {
        fs.writeFileSync(side, JSON.stringify({ ...have, track: measure(dst) }));
        console.log(`${out}: cached (head track added)`);
      } else console.log(`${out}: cached`);
      continue;
    }
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const start = m.bodyFrom / FPS;
  // half a frame extra so ffmpeg's -t never drops the last frame; trimmed to `frames` below
  const dur = (m.frames + 0.5) / FPS;
  const vpart = path.join(scratch, `${id}.video.mp4`);
  console.log(`${out}: matting body ${m.bodyFrom}..${m.bodyFrom + m.frames} (${m.frames} frames)`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ["tools/matte/rvm.mjs", body, start.toFixed(4), dur.toFixed(4), vpart], { stdio: "inherit", env: { ...process.env, MATTE_BT709: "1" } });
  if (r.status !== 0) throw new Error(`rvm failed for ${out}`);
  const ms = Date.now() - t0;
  // mux: exactly `frames` video frames + the body's audio over the same range
  const tmp = path.join(scratch, `${id}.mux.mp4`);
  run("ffmpeg", [
    "-v", "error", "-y",
    "-i", vpart,
    "-ss", start.toFixed(4), "-t", (m.frames / FPS).toFixed(4), "-i", body,
    "-map", "0:v:0", "-map", "1:a:0?",
    "-frames:v", String(m.frames),
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-movflags", "+faststart",
    tmp,
  ]);
  const n = framesOf(tmp);
  if (n < m.frames) throw new Error(`${out}: ${n} frames, wanted ${m.frames}`);
  fs.renameSync(tmp, dst);
  fs.rmSync(vpart, { force: true });
  fs.writeFileSync(side, JSON.stringify({ ...want, builtAt: new Date().toISOString(), msPerFrame: Math.round(ms / m.frames), track: measure(dst) }));
  built++;
  builtFrames += m.frames;
  builtMs += ms;
  console.log(`${out}: ${n} frames in ${(ms / 1000).toFixed(1)} s = ${(ms / 1000 / m.frames).toFixed(2)} s/frame`);
}
if (built) console.log(`matte day ${day}: ${built} clips, ${builtFrames} frames in ${(builtMs / 1000).toFixed(0)} s — ${(builtMs / 1000 / builtFrames).toFixed(2)} s per frame`);
else console.log(`matte day ${day}: all ${jobs.size} clips cached`);
