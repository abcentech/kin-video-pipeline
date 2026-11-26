// Stage 1 — ingest: probe the raw recording, write source.json, audio48k.wav (mono, untouched) and audio16k.wav.
//   node scripts/december/ingest.mjs <N> [--force]
import fs from "node:fs";
import { dayDir, exists, ff, ffprobe, log, readJson, sourcePath, writeJson } from "./lib.mjs";

const N = Number(process.argv[2]);
if (!Number.isFinite(N)) {
  console.error("usage: ingest.mjs <N> [--force]");
  process.exit(1);
}
const force = process.argv.includes("--force");
const dir = dayDir(N);
const src = sourcePath(N);
if (!exists(src)) {
  console.error(`no raw file: ${src}`);
  process.exit(1);
}
const st = fs.statSync(src);
const prev = readJson(`${dir}/source.json`, null);
const stamp = `${st.size}:${Math.round(st.mtimeMs)}`;
if (!force && prev?.stamp === stamp && exists(`${dir}/audio48k.wav`) && exists(`${dir}/audio16k.wav`)) {
  log(`ingest day ${N}: up to date`);
  process.exit(0);
}

const p = await ffprobe(src);
const v = p.streams.find((s) => s.codec_type === "video");
const a = p.streams.find((s) => s.codec_type === "audio");
const rate = (r) => {
  const [x, y] = r.split("/").map(Number);
  return y ? x / y : x;
};
const nb = Number(v.nb_frames);
const vDur = Number(v.duration);
const info = {
  day: N,
  path: src,
  stamp,
  bytes: st.size,
  container: Number(p.format.duration),
  duration: Number(a?.duration ?? p.format.duration), // SOURCE timebase = the container clock (audio starts at 0)
  videoDuration: vDur,
  videoStart: Number(v.start_time),
  audioStart: Number(a?.start_time ?? 0),
  codec: v.codec_name,
  width: v.width,
  height: v.height,
  fps: nb && vDur ? nb / vDur : rate(v.avg_frame_rate), // average (the recording is variable-rate)
  nominalFps: rate(v.r_frame_rate),
  videoFrames: nb,
  audio: { codec: a?.codec_name, rate: Number(a?.sample_rate), channels: a?.channels },
  ingested: new Date().toISOString(),
};

log(`ingest day ${N}: ${info.width}x${info.height} ${info.codec} avg ${info.fps.toFixed(2)} fps (nominal ${info.nominalFps}), ${info.duration.toFixed(2)} s`);
await ff(["-i", src, "-vn", "-ac", "1", "-c:a", "pcm_s16le", `${dir}/audio48k.wav`]);
await ff(["-i", `${dir}/audio48k.wav`, "-ar", "16000", "-c:a", "pcm_s16le", `${dir}/audio16k.wav`]);
writeJson(`${dir}/source.json`, info);
log(`wrote ${dir}/source.json, audio48k.wav, audio16k.wav`);
