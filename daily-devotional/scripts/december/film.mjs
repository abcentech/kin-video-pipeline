// Stage 6 (film half) — cut the day's film clip from the family master.
//   node scripts/december/film.mjs <N> [--force]
// series.json days[N].film {from,to} (seconds in the master) -> december-public/dayNN/film.mp4
// 1920x1080 30 fps, CRF 16, -g 15; audio loudnormed to -16 LUFS (2-pass), 8-frame audio fades at both ends.
import fs from "node:fs";
import { CONFIG, exists, ff, ffprobe, loadSeries, loadWords, loudness, log, pubDir, run, writeJson } from "./lib.mjs";
import { waitNoWhisper, withLock } from "./lib.mjs";

const N = Number(process.argv[2]);
if (!Number.isFinite(N) || N < 1) {
  console.error("usage: film.mjs <N 1..30> [--force]");
  process.exit(1);
}
const day = loadSeries().days.find((d) => d.day === N);
if (!day) throw new Error(`no day ${N} in series.json`);
const { from, to } = day.film;
const dur = to - from;
const frames = Math.round(dur * 30);
const out = `${pubDir(N)}/film.mp4`;
if (exists(out) && !process.argv.includes("--force")) {
  log(`film.mp4 exists (${out}); --force to rebuild`);
  process.exit(0);
}
if (!exists(CONFIG.filmMaster)) throw new Error(`film master not found: ${CONFIG.filmMaster} (set filmMaster in december/config.local.json)`);
const FADE = 8 / 30;

await waitNoWhisper();
await withLock(async () => {
  log(`film day ${N}: ${from}-${to} s (${dur} s, ${frames} frames) from ${CONFIG.filmMaster}`);
  // pass 1: measure the clip's audio
  const m = await run("ffmpeg", ["-hide_banner", "-nostdin", "-ss", String(from), "-t", String(dur), "-i", CONFIG.filmMaster, "-vn", "-af", `loudnorm=I=${CONFIG.voiceLufs}:TP=-1.5:LRA=11:print_format=json`, "-f", "null", "-"]);
  const j = JSON.parse(m.stderr.slice(m.stderr.lastIndexOf("{"), m.stderr.lastIndexOf("}") + 1));
  log(`  measured ${j.input_i} LUFS, TP ${j.input_tp}, LRA ${j.input_lra}`);
  const ln = `loudnorm=I=${CONFIG.voiceLufs}:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
  const af = `${ln},aresample=48000,afade=t=in:st=0:d=${FADE.toFixed(4)},afade=t=out:st=${(dur - FADE).toFixed(4)}:d=${FADE.toFixed(4)}`;
  const tmp = out.replace(/\.mp4$/, ".part.mp4");
  await ff([
    "-ss", String(from), "-t", String(dur), "-i", CONFIG.filmMaster,
    "-vf", "scale=1920:1080:in_range=auto:out_range=tv:flags=lanczos,fps=30,format=yuv420p",
    "-af", af, "-frames:v", String(frames),
    "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-g", "15", "-pix_fmt", "yuv420p", "-r", "30", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", tmp,
  ]);
  fs.renameSync(tmp, out);
});
const p = await ffprobe(out);
const v = p.streams.find((s) => s.codec_type === "video");
const a = p.streams.find((s) => s.codec_type === "audio");
const L = await loudness(out);
log(`film.mp4: ${v.width}x${v.height} ${v.avg_frame_rate} ${v.nb_frames} frames, video ${Number(v.duration).toFixed(3)} s, audio ${Number(a.duration).toFixed(3)} s; ${L.lufs.toFixed(2)} LUFS, true peak ${L.truePeak.toFixed(2)} dB; ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
writeJson(`${pubDir(N)}/film.json`, { day: N, from, to, dur, frames: Number(v.nb_frames), lufs: L.lufs, truePeak: L.truePeak, source: CONFIG.filmMaster }, 1);
