// Presenter matte with Robust Video Matting (ONNX, CPU).
//   node tools/matte/rvm.mjs <in.mp4> <startSec> <durSec> <out.mp4> [--fps=30] [--ratio=0.5] [--desk=1040]
// Writes one H.264 file, 1920x1620: the colour frame on top, its half-size matte
// (white = presenter) in the bottom-left 960x540. One file keeps colour and
// alpha frame-locked; the Remotion shader (src/JesusLife/hook/Presenter.tsx)
// splits them and upsamples the matte on the GPU.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ort from "onnxruntime-node";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const [input, start, dur, output] = args;
const fps = Number(opt.fps ?? 30);
const ratio = Number(opt.ratio ?? 0.5);
const W = 1920;
const H = 1080;
// the model runs at half size; its matte is upsampled back onto the full-res colour
const w = W / 2;
const h = H / 2;
// below this line (the desk and the open Bible) the original frame is kept: it
// grounds the presenter, and the matte would otherwise cut him off at the desk
const deskY = Number(opt.desk ?? 0);

const session = await ort.InferenceSession.create(path.join(here, "models/rvm_mobilenetv3_fp32.onnx"), {
  intraOpNumThreads: Number(process.env.MATTE_THREADS ?? 4),
});

// MATTE_BT709=1 (December pipeline): the source is BT.709 limited range and the output must be too. Without it ffmpeg
// encodes the RGB frames with its default (BT.601) matrix and leaves the file untagged, which shifts reds toward magenta.
const BT709 = process.env.MATTE_BT709 === "1";
const dec = spawn("ffmpeg", ["-v", "error", "-ss", String(start), "-t", String(dur), "-i", input, "-vf", `fps=${fps},scale=${W}:${H}:flags=bicubic${BT709 ? ":in_color_matrix=bt709:in_range=tv" : ""}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { stdio: ["ignore", "pipe", "inherit"] });
const enc = spawn(
  "ffmpeg",
  ["-v", "error", "-y",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H + h}`, "-r", String(fps), "-i", "pipe:0",
    ...(BT709 ? ["-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"] : []),
    "-c:v", "libx264", "-preset", "fast", "-crf", "13", "-pix_fmt", "yuv420p", "-g", "15", "-movflags", "+faststart",
    output],
  { stdio: ["pipe", "inherit", "inherit"] },
);

const frameBytes = W * H * 3;
const zero = () => new ort.Tensor("float32", new Float32Array(1), [1, 1, 1, 1]);
let rec = { r1i: zero(), r2i: zero(), r3i: zero(), r4i: zero() };
const dr = new ort.Tensor("float32", new Float32Array([ratio]), [1]);
const src = new Float32Array(3 * w * h);
let n = 0;
let tModel = 0;
const t0 = Date.now();

const write = (stream, data) => new Promise((res) => (stream.write(data) ? res() : stream.once("drain", res)));

async function frame(rgb) {
  const small = w * h;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const p = (2 * y * W + 2 * x) * 3;
      const q = p + W * 3;
      for (let c = 0; c < 3; c++) src[c * small + i] = (rgb[p + c] + rgb[p + 3 + c] + rgb[q + c] + rgb[q + 3 + c]) / 1020;
    }
  const tm = Date.now();
  const out = await session.run({ src: new ort.Tensor("float32", src, [1, 3, h, w]), ...rec, downsample_ratio: dr });
  tModel += Date.now() - tm;
  rec = { r1i: out.r1o, r2i: out.r2o, r3i: out.r3o, r4i: out.r4o };
  const half = out.pha.data;
  // stacked frame: colour, then the half-size matte (halo crushed) as grey RGB
  const stacked = Buffer.alloc(frameBytes + W * h * 3);
  rgb.copy(stacked, 0);
  const dy = deskY / 2;
  for (let y = 0; y < h; y++) {
    const desk = dy && y >= dy ? Math.min(1, (y - dy) / 3) : 0;
    for (let x = 0; x < w; x++) {
      let v = (Math.max(half[y * w + x], desk) - 0.04) / 0.92;
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      const o = frameBytes + (y * W + x) * 3;
      stacked[o] = stacked[o + 1] = stacked[o + 2] = Math.round(v * 255);
    }
  }
  await write(enc.stdin, stacked);
  n++;
  if (n % 30 === 0) process.stdout.write(`\r${n} frames, ${(n / ((Date.now() - t0) / 1000)).toFixed(2)} fps (model ${(tModel / n).toFixed(0)} ms/frame)`);
}

let parts = [];
let have = 0;
for await (const chunk of dec.stdout) {
  parts.push(chunk);
  have += chunk.length;
  while (have >= frameBytes) {
    const all = Buffer.concat(parts, have);
    const f = Buffer.from(all.subarray(0, frameBytes));
    const rest = all.subarray(frameBytes);
    parts = rest.length ? [rest] : [];
    have = rest.length;
    await frame(f);
  }
}
enc.stdin.end();
await new Promise((r) => enc.on("close", r));
console.log(`\n${output}: ${n} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s (model ${(tModel / Math.max(1, n)).toFixed(0)} ms/frame)`);
