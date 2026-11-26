// scripts/december/qc.mjs <N> [--only=episode,…] — quality control of every deliverable → out/december/DayNN/DayNN_QC.md
//
// per deliverable: ffprobe (size, fps, duration vs the plan, audio stream) · EBU R128 integrated loudness (−14 ±0.7 LUFS) and
// true peak (≤ −1.0 dBTP) · per-frame luma scan: black runs ≥ 3 frames outside the known black moments (title sting head, cut
// after the cold open, first/last frames), white-outs (YAVG > 225), frozen picture > 2 s · a 12-frame contact sheet ·
// A/V sync (the first spoken word's energy onset against the plan frame, ±2 frames).
// Exit code 1 when any check FAILs.
import fs from "node:fs";
import path from "node:path";
import { args, dayArg, loadPlan, pieces, selectPieces, tcs } from "./back.mjs";
import { ROOT, pad, run, ff, ffprobe, loudness, readPcm, envelopeDb, log, exists } from "./lib.mjs";

const n = dayArg();
const plan = loadPlan(n);
const OUT = `${ROOT}/out/december/Day${pad(n)}`;
const QC = `${OUT}/qc`;
fs.mkdirSync(QC, { recursive: true });
const TMP = `${ROOT}/december/work/day${pad(n)}`;
fs.mkdirSync(TMP, { recursive: true });
const todo = selectPieces(pieces(n, plan), args.only);

const LUFS = { target: -14, tol: 0.7, tp: -1.0 };
const BLACK_Y = 18;
const WHITE_Y = 225;

const runs = (flags, minLen) => {
  const out = [];
  let a = -1;
  for (let i = 0; i <= flags.length; i++) {
    const on = i < flags.length && flags[i];
    if (on && a < 0) a = i;
    if (!on && a >= 0) {
      if (i - a >= minLen) out.push([a, i - 1]);
      a = -1;
    }
  }
  return out;
};

/** frames where black is expected, per piece (frame ranges, end exclusive) */
function blackWindows(p) {
  const w = [[0, 4], [p.frames - 8, p.frames]];
  if (p.id === "episode") {
    const t = plan.episode.sections.find((s) => s.kind === "title");
    w.push([t.from - 4, t.from + 12]);
  } else if (p.id.startsWith("trailer")) {
    const pl = plan.trailer["16x9"];
    const t = pl.beats.find((b) => b.kind === "title");
    if (t) w.push([t.from - 4, t.from + 8]);
  }
  return w;
}
const inWin = (f, wins) => wins.some(([a, b]) => f >= a && f < b);

/** Is a black run of the episode the FILM's own black (its cut to black before a title)? True only when the run lies
 *  inside the film section AND the same frames of the film clip itself are black: measured, never assumed. */
async function filmOwnBlack(p, x, y) {
  if (p.id !== "episode") return false;
  const s = plan.episode.sections.find((k) => k.kind === "film" && x >= k.from && y < k.from + k.dur);
  if (!s) return false;
  const from = s.srcFrom + (x - s.from);
  const r = await run("ffmpeg", ["-hide_banner", "-nostdin", "-nostats", "-loglevel", "info", "-ss", (from / 30).toFixed(4), "-i", `${ROOT}/december-public/${s.src}`, "-frames:v", String(y - x + 1), "-an", "-vf", "scale=320:-2,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", "-f", "null", "-"]);
  if (r.code !== 0) return false;
  const ys = [...(r.stdout + r.stderr).matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
  // (the seek can land a frame either side of the run: nine frames in ten must be black, not every one)
  return ys.length >= y - x && ys.filter((v) => v < BLACK_Y).length >= 0.9 * ys.length;
}

async function lumaScan(file, p) {
  const stats = `${TMP}/qc_${p.id}_yavg.txt`;
  fs.rmSync(stats, { force: true });
  const r = await run("ffmpeg", ["-hide_banner", "-nostdin", "-nostats", "-loglevel", "info", "-i", file, "-an", "-vf", `scale=320:-2,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${path.basename(stats)},freezedetect=n=-60dB:d=2`, "-f", "null", "-"], { spawn: { cwd: TMP } });
  if (r.code !== 0) return { error: r.stderr.slice(-400) };
  const y = [];
  for (const line of fs.readFileSync(stats, "utf8").split(/\r?\n/)) {
    const m = /YAVG=([\d.]+)/.exec(line);
    if (m) y.push(Number(m[1]));
  }
  const freezes = [];
  for (const m of r.stderr.matchAll(/freeze_start: ([\d.]+)[\s\S]*?freeze_duration: ([\d.]+)/g)) freezes.push([Number(m[1]), Number(m[2])]);
  return { y, freezes };
}

async function contact(file, p, dur) {
  const dir = `${TMP}/qc_${p.id}_sheet`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const w = p.w > p.h ? 480 : 216;
  for (let i = 0; i < 12; i++) await ff(["-ss", (((i + 0.5) / 12) * dur).toFixed(3), "-i", file, "-frames:v", "1", "-vf", `scale=${w}:-2`, "-q:v", "3", `${dir}/${String(i).padStart(2, "0")}.jpg`]);
  const cols = p.w > p.h ? 4 : 6;
  const out = `${QC}/${p.id}_contact.jpg`;
  fs.writeFileSync(`${dir}/list.txt`, Array.from({ length: 12 }, (_, i) => `file '${dir}/${String(i).padStart(2, "0")}.jpg'`).join("\n"));
  await ff(["-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`, "-vf", `tile=${cols}x${12 / cols}:padding=4:color=0x101820`, "-frames:v", "1", "-q:v", "3", out]);
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

/** the frame of the first spoken word on the piece's timeline, from the plan */
function firstWordFrame(p) {
  if (p.id === "episode") {
    const w = plan.episode.captions[0]?.lines[0]?.[0];
    return w ? plan.episode.bodyAt + w.from : null;
  }
  const pl = p.id === "trailer16" ? plan.trailer["16x9"] : p.id === "trailer9" ? plan.trailer["9x16"] : plan.shorts[p.props.index];
  const b = pl.beats.find((x) => x.kind === "line");
  return b ? b.from + b.words[0].from : null;
}
async function syncCheck(file, f, lo = 0) {
  // `lo`: never listen before this frame — in the episode the film clip's own sound runs right up to the body and
  // reads as an "onset" 24 frames early (Day 1 v3: the film ends at 1836, he speaks at 1839)
  const t0 = Math.max(0, lo / 30, (f - 24) / 30);
  const pcm = await readPcm(file, { rate: 16000, from: t0, to: (f + 60) / 30 });
  const env = envelopeDb(pcm, 16000, 0.01, 0.02);
  const peak = Math.max(...env);
  if (!(peak > -50)) return { skip: `silent around the first word (peak ${peak.toFixed(0)} dBFS)` };
  const thr = peak - 18;
  for (let k = 0; k + 5 < env.length; k++) {
    if (env.slice(k, k + 5).every((v) => v > thr)) {
      const frame = (t0 + k * 0.01) * 30;
      return { err: frame - f, frame };
    }
  }
  return { skip: "no clear onset" };
}

const report = [];
let anyFail = false;
for (const p of todo) {
  const file = `${OUT}/${p.file}`;
  const checks = [];
  const add = (name, status, detail = "") => {
    checks.push({ name, status, detail });
    if (status === "FAIL") anyFail = true;
  };
  if (!exists(file)) {
    add("file", "FAIL", `${file} not found — not rendered yet`);
    report.push({ p, checks });
    log(`${p.label}: MISSING`);
    continue;
  }
  log(`${p.label}: QC …`);
  const info = await ffprobe(file);
  const v = info.streams.find((s) => s.codec_type === "video");
  const a = info.streams.find((s) => s.codec_type === "audio");
  const dur = Number(info.format.duration);
  const planDur = p.frames / 30;
  add("size", v.width === p.w && v.height === p.h ? "PASS" : "FAIL", `${v.width}x${v.height} (want ${p.w}x${p.h})`);
  const [fn, fd] = v.r_frame_rate.split("/").map(Number);
  add("frame rate", Math.abs(fn / fd - 30) < 0.01 ? "PASS" : "FAIL", `${(fn / fd).toFixed(3)} fps`);
  add("codec", v.codec_name !== "h264" ? "FAIL" : v.pix_fmt === "yuv420p" && (v.color_range ?? "tv") === "tv" ? "PASS" : v.pix_fmt === "yuvj420p" || v.color_range === "pc" ? "WARN" : "FAIL", `${v.codec_name} ${v.pix_fmt} ${v.color_range ?? ""} ${v.color_space ?? ""}${a ? `, audio ${a.codec_name} ${a.sample_rate} Hz` : ""}`);
  add("duration vs plan", Math.abs(dur - planDur) <= 0.1 ? "PASS" : "FAIL", `${dur.toFixed(2)} s (plan ${planDur.toFixed(2)} s, ${p.frames} frames)`);
  if (!a) add("audio stream", "FAIL", "no audio stream");
  else {
    const L = await loudness(file);
    add("loudness", Math.abs(L.lufs - LUFS.target) <= LUFS.tol ? "PASS" : "FAIL", `${L.lufs.toFixed(1)} LUFS integrated, LRA ${L.lra.toFixed(1)} (target −14 ±0.7)`);
    add("true peak", L.truePeak <= LUFS.tp ? "PASS" : "FAIL", `${L.truePeak.toFixed(1)} dBTP (≤ −1.0)`);
  }
  const scan = await lumaScan(file, p);
  if (scan.error) add("luma scan", "FAIL", `ffmpeg failed: ${scan.error}`);
  else {
    const wins = blackWindows(p);
    const allBlack = runs(scan.y.map((v, i) => v < BLACK_Y && !inWin(i, wins)), 3);
    const black = [];
    const own = [];
    for (const r of allBlack) ((await filmOwnBlack(p, r[0], r[1])) ? own : black).push(r);
    const span = ([x, y]) => `${tcs(x)}–${tcs(y + 1)} (${y - x + 1}f)`;
    const ownNote = own.length ? `; the film clip's own black at ${own.map(span).join(", ")} (the clip itself is black there)` : "";
    add("black frames", black.length ? "FAIL" : "PASS", (black.length ? black.slice(0, 8).map(span).join(", ") : "none outside the known black moments") + ownNote);
    const white = runs(scan.y.map((v) => v > WHITE_Y), 1);
    add("white-outs", white.length ? "FAIL" : "PASS", white.length ? white.slice(0, 8).map(([x, y]) => `${tcs(x)} (${y - x + 1}f, Y ${Math.max(...scan.y.slice(x, y + 1)).toFixed(0)})`).join(", ") : `peak luma ${Math.max(...scan.y).toFixed(0)} (limit ${WHITE_Y})`);
    add("frozen picture", scan.freezes.length ? "FAIL" : "PASS", scan.freezes.length ? scan.freezes.map(([s, d]) => `${tcs(s * 30)} for ${d.toFixed(1)} s`).join(", ") : "no run > 2 s");
    if (scan.y.length !== p.frames) add("frame count", "WARN", `luma scan saw ${scan.y.length} frames, plan ${p.frames}`);
  }
  if (a) {
    const f = firstWordFrame(p);
    if (f == null) add("A/V sync", "SKIP", "no spoken line in this piece");
    else {
      const s = await syncCheck(file, f, p.id === "episode" ? plan.episode.bodyAt : 0);
      if (s.skip) add("A/V sync", "SKIP", s.skip);
      else add("A/V sync", Math.abs(s.err) <= 2 ? "PASS" : "FAIL", `first word onset at frame ${s.frame.toFixed(1)}, plan ${f} (${s.err >= 0 ? "+" : ""}${s.err.toFixed(1)} frames, ±2 allowed)`);
    }
  }
  const sheet = await contact(file, p, dur);
  add("contact sheet", "PASS", sheet.replace(ROOT + "/", ""));
  report.push({ p, checks });
  log(`${p.label}: ${checks.map((c) => c.status[0]).join("")}`);
}

const total = report.flatMap((r) => r.checks);
const counts = (s) => total.filter((c) => c.status === s).length;
const md = [];
md.push(`# Day ${n} — ${plan.meta.title} — QC`, "", `Result: **${anyFail ? "FAIL" : "PASS"}** — ${counts("PASS")} pass, ${counts("FAIL")} fail, ${counts("WARN")} warn, ${counts("SKIP")} skipped`, "");
for (const r of report) {
  md.push(`## ${r.p.label} — \`${r.p.file}\``, "", "| Check | Result | Detail |", "|---|---|---|");
  for (const c of r.checks) md.push(`| ${c.name} | ${c.status} | ${c.detail.replace(/\|/g, "/")} |`);
  md.push("");
}
const running = `${QC}/running-order.txt`;
if (exists(running)) md.push(`Running order: \`qc/running-order.txt\` · stills: \`qc/stills/\``, "");
// the notes for the producer (words to confirm, decisions, weak spots) live beside the edit, so a re-run keeps them
const notesFile = `${ROOT}/december/edits/day${pad(n)}.notes.md`;
if (exists(notesFile)) md.push(fs.readFileSync(notesFile, "utf8").trim(), "");
fs.writeFileSync(`${OUT}/Day${pad(n)}_QC.md`, md.join("\n"));
console.log(md.slice(0, 3).join("\n"));
log(`written ${OUT}/Day${pad(n)}_QC.md`);
process.exit(anyFail ? 1 : 0);
