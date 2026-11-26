// scripts/december/render.mjs <N> [--only=episode,trailer16,trailer9,short1,short2,short3] [--preview] [--audio-only]
//                              [--frames=a-b] [--silent] [--chunk=1500] [--keep]
//
// Renders each piece of the day to out/december/DayNN/ under the deliverable names (PIPELINE.md):
//   h264 CRF 17, yuv420p BT.709, AAC 320k, --concurrency=2, 420 s delayRender timeout, PNG frames (JPEG shifts the colours).
//   --preview   1280x720 (720x1280) CRF 23 → out/december/DayNN/preview/
//   --frames=a-b  render only that frame range (mechanics test) → preview/<name>_test_a-b.mp4
// Every piece is rendered in chunks (default 1500 frames) that are RESUMABLE: a finished chunk whose frame count
// verifies is skipped. Chunks are video-only; they are concatenated losslessly and the audio (the plan's mix, e.g.
// december-public/day01/audio/episode.wav) is muxed ONCE, so a crash never loses more than a chunk and an audio fix needs
// no re-render:  --audio-only  re-muxes the new mix into the existing mp4 without touching the picture.
// Needs ≥ 4 GB free. Runs under scripts/with-render-lock.mjs. Bundle and chunk temp are deleted when the piece verifies.
import fs from "node:fs";
import path from "node:path";
import { args, dayArg, ensureLocked, needDisk, makePublic, rmDir, loadPlan, pieces, selectPieces, entryFor, entryFile, ensureTmp, sweepTemp, PROCESS_START } from "./back.mjs";
import { ROOT, pad, run, ff, log, exists } from "./lib.mjs";

const BSF = "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1";
const audioOnly = !!args["audio-only"];
if (!audioOnly) ensureLocked();
ensureTmp();
const n = dayArg();
needDisk(4);
const preview = !!args.preview;
const CHUNK = Number(args.chunk ?? 1500);
const plan = loadPlan(n);
const todo = selectPieces(pieces(n, plan), args.only);
if (!todo.length) {
  console.error(`nothing selected by --only=${args.only}`);
  process.exit(2);
}
const range = args.frames && args.frames !== true ? String(args.frames).split("-").map(Number) : null;
const OUT = `${ROOT}/out/december/Day${pad(n)}`;
const finalDir = preview ? `${OUT}/preview` : OUT;
fs.mkdirSync(finalDir, { recursive: true });
const audioFile = (p) => `${ROOT}/december-public/${p.audio.replace(/^\/+/, "")}`;

// a missing mix is a hard stop for deliverables (silent files must never ship by accident)
const missing = todo.filter((p) => !exists(audioFile(p)));
if (missing.length && !preview && !range && !args.silent) {
  console.error(`No mix for: ${missing.map((p) => `${p.id} (${audioFile(p)})`).join(", ")}\nRun the sound stage first (node scripts/december/sound.mjs ${n}), or pass --silent to render without audio.`);
  process.exit(2);
}

const outName = (p) => (range ? p.file.replace(/\.mp4$/, `_test_${range[0]}-${range[1]}.mp4`) : preview ? p.file.replace(/\.mp4$/, "_preview.mp4") : p.file);

async function probeFrames(file) {
  const r = await run("ffprobe", ["-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", file]);
  return Number(r.stdout.trim().split(",")[0]);
}
async function probe(file) {
  const r = await run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,duration", "-of", "json", file]);
  return JSON.parse(r.stdout || "{}").streams ?? [];
}

// `first` = the timeline frame the picture starts at. A --frames=a-b test stretch must take the mix from the same
// place: until 26 Nov it took it from 0, so a stretch from the middle of an episode played the opening's sound
// under it (the producer: "sound is not following the teacher"). Full renders start at 0 and were always right.
async function mux(videoFile, p, out, frames, first = 0) {
  const a = audioFile(p);
  const dur = (frames / 30).toFixed(3);
  const a1 = ["-i", videoFile];
  if (exists(a)) {
    await ff([...a1, ...(first > 0 ? ["-ss", (first / 30).toFixed(4)] : []), "-i", a, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-bsf:v", BSF, "-af", "apad", "-c:a", "aac", "-b:a", preview ? "192k" : "320k", "-ar", "48000", "-t", dur, "-movflags", "+faststart", out]);
    return true;
  }
  await ff([...a1, "-map", "0:v:0", "-c:v", "copy", "-bsf:v", BSF, "-an", "-movflags", "+faststart", out]);
  return false;
}

// ───────── audio-only
if (audioOnly) {
  for (const p of todo) {
    const final = `${finalDir}/${outName(p)}`;
    if (!exists(final)) {
      console.error(`  ✗ ${p.id}: ${final} does not exist — render it first`);
      continue;
    }
    if (!exists(audioFile(p))) {
      console.error(`  ✗ ${p.id}: no mix at ${audioFile(p)}`);
      continue;
    }
    const tmp = final.replace(/\.mp4$/, ".remux.mp4");
    await ff(["-i", final, "-i", audioFile(p), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-bsf:v", BSF, "-af", "apad", "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-t", (p.frames / 30).toFixed(3), "-movflags", "+faststart", tmp]);
    fs.renameSync(tmp, final);
    log(`${p.label}: audio re-muxed into ${final}`);
  }
  process.exit(0);
}

// ───────── picture
await import("../lib/run-temp.mjs");
const { bundle } = await import("@remotion/bundler");
const { openBrowser, renderMedia, selectComposition } = await import("@remotion/renderer");
const chromiumOptions = { gl: "angle" };
const pub = makePublic(n);
const bundles = new Map();
const serve = async (entry) => {
  if (!bundles.has(entry)) {
    if (!exists(entryFile(entry))) throw new Error(`${entryFile(entry)} does not exist yet`);
    log(`bundling ${entry} …`);
    bundles.set(entry, await bundle({ entryPoint: entryFile(entry), publicDir: pub }));
  }
  return bundles.get(entry);
};
let failed = false;
const t00 = Date.now();

for (const p of todo) {
  const final = `${finalDir}/${outName(p)}`;
  const first = range ? range[0] : 0;
  const last = range ? Math.min(range[1], p.frames - 1) : p.frames - 1;
  const total = last - first + 1;
  const work = `${ROOT}/december/work/day${pad(n)}/render/${p.id}${preview ? "_preview" : ""}${range ? `_${first}-${last}` : ""}`;
  fs.mkdirSync(work, { recursive: true });
  const chunks = [];
  for (let a = first; a <= last; a += CHUNK) chunks.push({ a, b: Math.min(last, a + CHUNK - 1), file: `${work}/c${String(chunks.length).padStart(3, "0")}.mp4` });
  log(`${p.label}: ${total} frames in ${chunks.length} chunk${chunks.length > 1 ? "s" : ""} → ${final}`);
  const t0 = Date.now();
  let browser;
  try {
    const serveUrl = await serve(entryFor(p.comp));
    browser = await openBrowser("chrome", { chromiumOptions });
    const comp = await selectComposition({ serveUrl, id: p.comp, inputProps: p.props, chromiumOptions, puppeteerInstance: browser, timeoutInMilliseconds: 120000 });
    if (comp.durationInFrames !== p.frames) throw new Error(`${p.comp} is ${comp.durationInFrames} frames but plan.json says ${p.frames} — the picture and the plan disagree`);
    for (const [k, c] of chunks.entries()) {
      const want = c.b - c.a + 1;
      if (exists(c.file) && (await probeFrames(c.file)) === want) {
        log(`  chunk ${k + 1}/${chunks.length} ${c.a}–${c.b}: already done`);
        continue;
      }
      const t1 = Date.now();
      let lastPct = -1;
      await renderMedia({
        serveUrl,
        composition: comp,
        inputProps: p.props,
        codec: "h264",
        crf: preview ? 23 : 17,
        pixelFormat: "yuv420p",
        colorSpace: "bt709", // limited range, BT.709
        x264Preset: preview ? "veryfast" : "medium",
        // PNG frames, never JPEG: with colorSpace bt709 Remotion runs `zscale=matrixin=709`, which is only right for RGB
        // input. JPEG frames are BT.601 YUV, so they came out 601-encoded but tagged 709 — reds went orange
        // (shirt 194,45,77 → 203,59,73, measured 2026-11-25). PNG frames measure 193,44,76.
        imageFormat: "png",
        muted: true,
        frameRange: [c.a, c.b],
        outputLocation: c.file,
        overwrite: true,
        concurrency: Number(args.concurrency ?? 2),
        offthreadVideoCacheSizeInBytes: 384 * 1024 * 1024,
        timeoutInMilliseconds: 420000,
        chromiumOptions,
        puppeteerInstance: browser,
        ...(preview ? { scale: 2 / 3 } : {}),
        onProgress: ({ progress }) => {
          const pct = Math.floor(progress * 20) * 5;
          if (pct !== lastPct) {
            lastPct = pct;
            process.stdout.write(`\r  chunk ${k + 1}/${chunks.length} ${c.a}–${c.b}: ${pct}%   `);
          }
        },
      });
      process.stdout.write("\n");
      sweepTemp(PROCESS_START, [...bundles.values()]);
      const got = await probeFrames(c.file);
      if (got !== want) throw new Error(`chunk ${c.a}–${c.b} came out with ${got} frames, expected ${want}`);
      log(`  chunk ${k + 1}/${chunks.length} done in ${((Date.now() - t1) / 1000).toFixed(0)} s`);
    }
    // lossless concat, then the mix once
    const list = `${work}/list.txt`;
    fs.writeFileSync(list, chunks.map((c) => `file '${c.file.replace(/\\/g, "/")}'`).join("\n"));
    const video = `${work}/video.mp4`;
    await ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", video]);
    const hadAudio = await mux(video, p, final, total, first);
    // verify
    const frames = await probeFrames(final);
    const streams = await probe(final);
    const v = streams.find((s) => s.codec_type === "video");
    const okSize = preview ? v?.width === p.w * (2 / 3) || Math.abs(v?.width - p.w * (2 / 3)) < 2 : v?.width === p.w && v?.height === p.h;
    if (frames !== total) throw new Error(`final has ${frames} frames, expected ${total}`);
    if (!okSize) throw new Error(`final is ${v?.width}x${v?.height}`);
    if (hadAudio && !streams.some((s) => s.codec_type === "audio")) throw new Error("final has no audio stream");
    log(`${p.label}: OK  ${frames} frames, ${v.width}x${v.height}, ${hadAudio ? "with audio" : "SILENT (no mix)"}, ${(fs.statSync(final).size / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
    if (!args.keep) rmDir(work);
  } catch (e) {
    failed = true;
    console.error(`\n  ✗ ${p.label}: ${e.message ?? e}\n    finished chunks are kept in ${work} — re-run the same command to resume`);
  } finally {
    try {
      await browser?.close({ silent: true });
    } catch {}
  }
  if (failed) break;
}
for (const b of bundles.values()) rmDir(b);
sweepTemp(PROCESS_START);
if (!args.keep) rmDir(pub);
log(`render ${failed ? "FAILED" : "finished"} in ${((Date.now() - t00) / 60000).toFixed(1)} min`);
process.exit(failed ? 1 : 0);
void path;
