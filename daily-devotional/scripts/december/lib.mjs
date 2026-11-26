// scripts/december/lib.mjs — shared helpers for the December pipeline (stable API; other stages import it).
//
// EXPORTS
//   ROOT                         absolute repo root (forward slashes)
//   CONFIG                       { inbox, guide, filmMaster, whisperExe, whisperModel, rnnoise, python, faceModel,
//                                  fps, voiceLufs }  — every external location lives here;
//                                each is overridable by a DEC_* env var or december/config.local.json
//   pad(n, w=2)                  7 -> "07"
//   dayDir(n)                    scratch  december/work/dayNN            (created on call)
//   pubDir(n)                    public   december-public/dayNN     (created on call)
//   outDir(n)                    deliver  out/december/DayNN        (created on call)
//   sourcePath(n)                inbox path of Day_N.mp4
//   readJson(file, fallback?)    BOM-safe JSON read; throws if missing and no fallback given
//   writeJson(file, obj, indent) mkdir -p + write (indent default 1; 0 = compact)
//   exists(file)                 fs.existsSync
//   run(cmd, args, opts?)        spawn with an args array -> Promise<{code, stdout, stderr}> (never throws).
//                                opts: input (string to stdin), log (file to append stderr to), onStderr(chunk),
//                                stdout:false (drop stdout), raw:true (also return stdoutBuf Buffer), spawn:{...}. cwd is ROOT.
//   runOk(cmd, args, opts?)      like run() but rejects with the stderr tail if code != 0
//   ff(args, opts?)              runOk("ffmpeg", ["-hide_banner","-nostdin","-y",...args])
//   ffprobe(file)                -> parsed `ffprobe -show_format -show_streams` JSON
//   readPcm(file, {rate=16000, filter, from, to}) -> Promise<Float32Array> mono float samples via ffmpeg
//   envelopeDb(pcm, rate, hop=0.01, win=0.02) -> Float32Array of RMS dBFS per hop (index k covers t = k*hop)
//   voicedRuns(env, hop, {thresholdDb=-38, minSilence=0.12, minVoiced=0.04}) -> [[start,end],...] voiced runs (seconds)
//   loudness(file, {filter})     -> { lufs, lra, truePeak }  (EBU R128 via ffmpeg ebur128, whole file)
//   parseAnchor(a)               "end:w123-0.2" -> { id:123, end:true, off:-0.2 }
//   resolveAnchor(words, a)      anchor -> SOURCE seconds (words = [{i,start,end}] or Map i->word). "w5" = start of w5,
//                                "w5+0.4" / "w5-0.2" = offset in seconds, "end:w5" = end of w5. Throws on unknown id.
//   wordIndex(words)             Map i -> word
//   spanWords(words, span)       inclusive run of words for a Span ["w40","w61"] (by word id)
//   loadSeries()                 december/series.json parsed
//   loadWords(n)                 december/work/dayNN/words.json parsed ({source, model, words})
//   loadEdit(n, path?)           december/edits/dayNN.json (or explicit path)
//   fmtT(sec)                    "1:05.32"
//   log(...)                     timestamped console.log
//   sleep(ms)
//   waitNoWhisper(say)           poll tasklist until no whisper-cli.exe is running
//   acquireLock() -> release fn (hold the lock across several jobs)
//   withLock(fn)                 hold the machine-wide heavy-job lock (.tmp/kind-outro.render.lock) while fn() runs

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..").replace(/\\/g, "/");

// Every external location. Resolution order for each key: environment variable (DEC_*) > december/config.local.json
// (git-ignored; copy december/config.example.json) > the default below. Use forward slashes. `rnnoise` must stay
// RELATIVE to the project root (a drive-letter colon cannot be escaped inside an ffmpeg filter; run() uses cwd=ROOT).
const WIN = process.platform === "win32";
function readLocalConfig() {
  const f = `${ROOT}/december/config.local.json`;
  try {
    return JSON.parse(fs.readFileSync(f, "utf8").replace(/^\uFEFF/, ""));
  } catch (e) {
    if (e.code !== "ENOENT") console.warn(`december/config.local.json ignored: ${e.message}`);
    return {};
  }
}
const LOCAL = readLocalConfig();
const setting = (key, env, dflt) => {
  const v = process.env[env] ?? LOCAL[key];
  return v === undefined || v === "" ? dflt : String(v).replace(/\\/g, "/");
};

export const CONFIG = {
  inbox: setting("inbox", "DEC_INBOX", `${ROOT}/inbox`), // folder holding Day_N.mp4
  guide: setting("guide", "DEC_GUIDE", `${ROOT}/assets/teachers_guide.html`), // the teaching-guide HTML
  filmMaster: setting("filmMaster", "DEC_FILM_MASTER", `${ROOT}/assets/film_master_16x9.mp4`), // the picture-film master the day films are cut from
  whisperExe: setting("whisperExe", "DEC_WHISPER_EXE", WIN ? `${ROOT}/tools/whisper/Release/whisper-cli.exe` : `${ROOT}/tools/whisper/whisper-cli`),
  whisperModel: setting("whisperModel", "DEC_WHISPER_MODEL", `${ROOT}/tools/whisper/ggml-large-v3-turbo-q5_0.bin`),
  rnnoise: setting("rnnoise", "DEC_RNNOISE", "scripts/episode/rnnoise.rnnn"),
  python: setting("python", "DEC_PYTHON", `${ROOT}/studio/.venv/${WIN ? "Scripts/python.exe" : "bin/python"}`),
  faceModel: setting("faceModel", "DEC_FACE_MODEL", `${ROOT}/studio/models/blaze_face_short_range.tflite`),
  fps: 30,
  voiceLufs: -16,
};

export const pad = (n, w = 2) => String(n).padStart(w, "0");
const mk = (p) => (fs.mkdirSync(p, { recursive: true }), p);
export const dayDir = (n) => mk(`${ROOT}/december/work/day${pad(n)}`);
export const pubDir = (n) => mk(`${ROOT}/december-public/day${pad(n)}`);
export const outDir = (n) => mk(`${ROOT}/out/december/Day${pad(n)}`);
export const sourcePath = (n) => `${CONFIG.inbox}/Day_${n}.mp4`;

export const exists = (f) => fs.existsSync(f);
export function readJson(file, fallback) {
  if (!fs.existsSync(file)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}
export function writeJson(file, obj, indent = 1) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, indent || undefined));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
export const fmtT = (s) => {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, "0")}`;
};

export function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: [opts.input ? "pipe" : "ignore", opts.stdout === false ? "ignore" : "pipe", "pipe"], windowsHide: true, cwd: ROOT, ...(opts.spawn ?? {}) });
    const out = [];
    let err = "";
    const logFd = opts.log ? fs.openSync(opts.log, "a") : null;
    p.stdout?.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => {
      err += d;
      if (err.length > 400000) err = err.slice(-200000);
      if (logFd !== null) fs.writeSync(logFd, d);
      opts.onStderr?.(d.toString());
    });
    if (opts.input) p.stdin.end(opts.input);
    p.on("error", (e) => resolve({ code: -1, stdout: "", stderr: String(e) }));
    p.on("close", (code) => {
      if (logFd !== null) fs.closeSync(logFd);
      const buf = Buffer.concat(out);
      resolve({ code, stdout: opts.raw ? "" : buf.toString("utf8"), stdoutBuf: opts.raw ? buf : undefined, stderr: err });
    });
  });
}
export async function runOk(cmd, args, opts = {}) {
  const r = await run(cmd, args, opts);
  if (r.code !== 0) throw new Error(`${cmd} ${args.slice(0, 14).join(" ")} … exit ${r.code}\n${r.stderr.slice(-1500)}`);
  return r;
}
export const ff = (args, opts) => runOk("ffmpeg", ["-hide_banner", "-nostdin", "-y", ...args], opts);
export async function ffprobe(file) {
  const r = await runOk("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", file]);
  return JSON.parse(r.stdout);
}

/** Decode `file` to mono float32 samples. */
export async function readPcm(file, { rate = 16000, filter, from, to } = {}) {
  const args = ["-v", "error", "-nostdin"];
  if (from !== undefined) args.push("-ss", String(from));
  if (to !== undefined) args.push("-to", String(to));
  args.push("-i", file, "-vn", "-ac", "1");
  if (filter) args.push("-af", filter);
  args.push("-ar", String(rate), "-f", "f32le", "pipe:1");
  const r = await runOk("ffmpeg", args, { raw: true });
  const b = r.stdoutBuf;
  const len = b.length - (b.length % 4);
  const out = new Float32Array(len / 4);
  for (let i = 0; i < out.length; i++) out[i] = b.readFloatLE(i * 4);
  return out;
}

export function envelopeDb(pcm, rate, hop = 0.01, win = 0.02) {
  const h = Math.round(rate * hop);
  const w = Math.round(rate * win);
  const n = Math.floor(pcm.length / h);
  const env = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const c = k * h + h / 2;
    const a = Math.max(0, Math.round(c - w / 2));
    const b = Math.min(pcm.length, Math.round(c + w / 2));
    let s = 0;
    for (let i = a; i < b; i++) s += pcm[i] * pcm[i];
    env[k] = 10 * Math.log10(s / Math.max(1, b - a) + 1e-12);
  }
  return env;
}

/** Voiced runs: env > threshold; gaps shorter than minSilence are bridged; runs shorter than minVoiced dropped. */
export function voicedRuns(env, hop = 0.01, { thresholdDb = -38, minSilence = 0.12, minVoiced = 0.04 } = {}) {
  const runs = [];
  let a = -1;
  for (let k = 0; k <= env.length; k++) {
    const on = k < env.length && env[k] > thresholdDb;
    if (on && a < 0) a = k;
    if (!on && a >= 0) {
      runs.push([a * hop, k * hop]);
      a = -1;
    }
  }
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] < minSilence) last[1] = r[1];
    else merged.push([...r]);
  }
  return merged.filter((r) => r[1] - r[0] >= minVoiced);
}

export async function loudness(file, { filter } = {}) {
  const args = ["-hide_banner", "-nostdin", "-i", file, "-vn"];
  args.push("-af", (filter ? filter + "," : "") + "ebur128=peak=true", "-f", "null", "-");
  const r = await run("ffmpeg", args);
  const t = r.stderr.slice(r.stderr.lastIndexOf("Summary:"));
  const num = (re) => {
    const m = t.match(re);
    return m ? Number(m[1]) : NaN;
  };
  return { lufs: num(/I:\s+(-?[\d.]+) LUFS/), lra: num(/LRA:\s+(-?[\d.]+) LU/), truePeak: num(/Peak:\s+(-?[\d.]+) dBFS/) };
}

// ───────────────────────────────────────────── anchors
export function parseAnchor(a) {
  const m = /^(end:)?w(\d+)([+-]\d+(?:\.\d+)?)?$/.exec(String(a).trim());
  if (!m) throw new Error(`bad anchor "${a}" (expected w123, w123+0.4, w123-0.2 or end:w123)`);
  return { id: Number(m[2]), end: !!m[1], off: m[3] ? Number(m[3]) : 0 };
}
export const wordIndex = (words) => (words instanceof Map ? words : new Map(words.map((w) => [w.i, w])));
export function resolveAnchor(words, a) {
  const { id, end, off } = parseAnchor(a);
  const w = wordIndex(words).get(id);
  if (!w) throw new Error(`anchor "${a}": no word w${id}`);
  return (end ? w.end : w.start) + off;
}
export function spanWords(words, span) {
  const a = parseAnchor(span[0]).id;
  const b = parseAnchor(span[1]).id;
  const arr = words instanceof Map ? [...words.values()] : words;
  return arr.filter((w) => w.i >= a && w.i <= b);
}

export const loadSeries = () => readJson(`${ROOT}/december/series.json`);
export const loadWords = (n) => readJson(`${dayDir(n)}/words.json`);
export const loadEdit = (n, p) => readJson(p ?? `${ROOT}/december/edits/day${pad(n)}.json`);

export async function waitNoWhisper() {} // no-op: serialise through withLock / scripts/with-render-lock.mjs only

// ───────────────────────────────────────────── machine lock (same protocol as scripts/with-render-lock.mjs)
//   withLock(fn)  hold .tmp/kind-outro.render.lock while fn() runs (heavy ffmpeg encodes use it)
export async function acquireLock(maxWaitMs = Infinity) {
  const t0 = Date.now();
  const dir = `${ROOT}/.tmp/kind-outro.render.lock`;
  const alive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (e) {
      return e.code === "EPERM";
    }
  };
  let told = false;
  for (;;) {
    try {
      fs.mkdirSync(dir);
      fs.writeFileSync(`${dir}/pid`, String(process.pid));
      break;
    } catch {
      let holder = NaN;
      try {
        holder = Number(fs.readFileSync(`${dir}/pid`, "utf8"));
      } catch {}
      if (Number.isFinite(holder) && !alive(holder)) fs.rmSync(dir, { recursive: true, force: true });
      else {
        if (Date.now() - t0 > maxWaitMs) {
          log("lock not free in time — proceeding without it");
          return () => {};
        }
        if (!told) log("waiting for the machine lock (another heavy job is running)");
        told = true;
        await sleep(2000);
      }
    }
  }
  const release = () => fs.rmSync(dir, { recursive: true, force: true });
  process.on("exit", release);
  return release;
}
export async function withLock(fn, maxWaitMs = 120000) {
  const release = await acquireLock(maxWaitMs);
  try {
    return await fn();
  } finally {
    release();
  }
}
