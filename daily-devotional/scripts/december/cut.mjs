// Stage 4 — cut.
//   node scripts/december/cut.mjs <N> [--edit=<path>] [--stills-only] [--skip-stills] [--force-full] [--force-voice]
//
//  (a) .tmp/dec/dayNN/full.mp4   whole recording, CFR 30, graded, voice chain, SOURCE timebase (frame n = n/30 s). Cached.
//  Flags: --clean removes .tmp/dec/dayNN/full.mp4 after the body is built (never automatic); FULL_CRF=nn env overrides full.mp4 CRF (default 18).
//  (b) december-public/dayNN/body.mp4 + body.json   cut from full.mp4 by FRAME numbers from the edit's `keep` spans.
//
// Join rules: every span in = 0.08 s before its first word, out = 0.14 s after its last word (clamped between neighbours,
// so never inside a word). Pauses > maxPause (default 0.7 s) inside a span are shortened to maxPause -> a "soft" join
// (5-frame picture dissolve); span-to-span joins are "cut" (hard picture cut). Audio: 25 ms equal-power crossfade centred
// on every join (length-preserving: A continues 12.5 ms past its end, B starts 12.5 ms before its start).
// body.json segments are [start, end) in body frames; words[].from/to are body frames.
import fs from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { n2Graph, n2MasksAt, N2_MASK_W, N2_MASK_H, N2_ENC_TAGS } from "../grade-n2/n2.mjs";
import { n3Graph, N3_ENC_TAGS } from "./grade/n3.mjs";
import {
  CONFIG, ROOT, dayDir, pubDir, outDir, pad, readJson, writeJson, loadEdit, loadWords, exists, ff, ffprobe, loudness, readPcm, envelopeDb, run, runOk, log, fmtT, wordIndex, parseAnchor, withLock, waitNoWhisper,
} from "./lib.mjs";

const N = Number(process.argv[2]);
const flag = (n) => process.argv.includes(`--${n}`);
const opt = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? "").split("=").slice(1).join("=") || undefined;
if (!Number.isFinite(N)) {
  console.error("usage: cut.mjs <N> [--edit=path] [--stills-only] [--skip-stills] [--force-full] [--force-voice]");
  process.exit(1);
}
const dir = dayDir(N);
const pub = pubDir(N);
const FPS = 30;
const SR = 48000;
const SPF = SR / FPS; // 1600 samples per frame
const W = 1920;
const H = 1080;
const FS = (W * H * 3) / 2;
const source = readJson(`${dir}/source.json`);
const face = readJson(`${dir}/face.json`);
const TOTAL_FRAMES = Math.floor(Math.min(source.duration, source.videoStart + source.videoDuration) * FPS) - 1;
const LUFS = CONFIG.voiceLufs;

// ───────────────────────────────────────────────────── grade (DESIGN.md §Grade)
// The series grade is N2 (scripts/grade-n2, README there): the producer approved it on the month-intro film and, on
// 2026-11-25, chose it for the devotionals over look C below. It is measured per clip (white balance from the clip's own
// wall, one black level, skin fitted to the skin line), baked into three 3D LUTs and blended by two face-tracked masks.
// Its parameters change only with a new approval. DEC_GRADE=v3 selects the older look C (kept for reference).
//
// N3 (scripts/december/grade, the default since 2026-11-25) is N2's colour with what the producer asked for after the
// Day 1 finals: skin "a little brighter", and a grade that cannot be left behind when he moves. N2's masks are shapes
// placed from a face position sampled twice a second; N3 uses a person matte for every frame and a lift that is a
// function of each pixel's own colour, fitted per recording. DEC_GRADE=n2 selects N2 as it was.
//
// STUDIO (scripts/december/grade/studio.py, 2026-11-26): the producer reopened the grade after the Day 1 and Day 2
// finals ("as if shot with a very good sony camera … natural … not heavily edited") and chose look B from three. It
// is ONE global grade of the whole picture, fitted to each recording from its own measurements (black point, his face
// to its exposure, the wall held, highlights eased, skin turned toward the skin-tone line) and baked into one 3D LUT.
// It applies to the days named in december/grade.json → days.N.grade = "studio"; days without it stay on N3 (Days 1
// and 2 were delivered on N3).
const GRADE_FILE = exists(`${ROOT}/december/grade.json`) ? readJson(`${ROOT}/december/grade.json`) : {};
const GRADE = process.env.DEC_GRADE ?? GRADE_FILE.days?.[String(N)]?.grade ?? "n3";
const STUDIO_LOOK = process.env.DEC_LOOK ?? GRADE_FILE.days?.[String(N)]?.look ?? GRADE_FILE.studioLook ?? "B";
const N2DIR = `${dir}/n2`;
const PY = CONFIG.python;
async function ensureN2() {
  if (GRADE !== "n2") return;
  if (["norm.json", "base.cube", "patch.cube", "window.cube"].every((f) => exists(`${N2DIR}/${f}`)) && !flag("force-n2")) return;
  log("N2: measuring this clip (white balance, black level, skin target) and writing its LUTs…");
  await runOk(PY, ["-I", `${ROOT}/scripts/grade-n2/n2.py`, "prepare", source.path, N2DIR, "--face", `${dir}/face.json`]);
}
const N3DIR = `${dir}/n3`;
const N3_MATTE = `${N3DIR}/matte.mkv`;
const N3_CAP = `${N3DIR}/cap.mkv`;
// the producer chose the skin brightness from three variations (A 0.36, B 0.40, C 0.44 of display luma); the choice
// lives in december/grade.json → skinY so every day is fitted to the same face brightness. DEC_SKIN_Y overrides.
const N3_SKIN_Y = process.env.DEC_SKIN_Y ?? (() => {
  try {
    return String(JSON.parse(fs.readFileSync(`${ROOT}/december/grade.json`, "utf8")).skinY ?? "");
  } catch {
    return "";
  }
})();
const N3PY = `${ROOT}/scripts/december/grade/n3.py`;
const N3_CHOICE = (() => {
  const g = exists(`${ROOT}/december/grade.json`) ? readJson(`${ROOT}/december/grade.json`) : {};
  const day = g.days?.[String(N)] ?? {};
  return { maxLift: Number(process.env.DEC_MAX_LIFT ?? day.maxLift ?? g.maxLift ?? 0), warm: Number(process.env.DEC_WARM ?? day.warm ?? 0) };
})();
const STDIR = `${dir}/studio`;
const STPY = `${ROOT}/scripts/december/grade/studio.py`;
const ST_ARGS = ["--face-json", `${dir}/face.json`, "--matte", `${dir}/n3/matte.mkv`, "--headx", `${dir}/headx.json`];
async function ensureStudio() {
  if (GRADE !== "studio") return;
  // the fit reads his face through the person matte and the per-frame head position the pipeline already makes
  if (!exists(N3_CAP)) {
    log("studio: finding his eyes on every frame…");
    await runOk(PY, ["-I", N3PY, "cap", source.path, N3_CAP]);
  }
  if (!exists(N3_MATTE)) {
    await withLock(async () => {
      log("studio: matting every frame of the recording (about 0.17 s per frame)…");
      await runOk(PY, ["-I", N3PY, "matte", source.path, N3_MATTE]);
    });
  }
  if (!exists(`${dir}/headx.json`)) await runOk(PY, ["-I", `${ROOT}/scripts/december/grade/headx.py`, N3_CAP, `${dir}/headx.json`]);
  const pj = exists(`${STDIR}/params.json`) ? readJson(`${STDIR}/params.json`) : null;
  if (!pj || pj.look !== STUDIO_LOOK || !exists(`${STDIR}/grade.cube`) || flag("force-studio")) {
    log(`studio: measuring this recording and fitting look ${STUDIO_LOOK}…`);
    const r = await runOk(PY, ["-I", STPY, "prepare", source.path, STDIR, "--look", STUDIO_LOOK, ...ST_ARGS]);
    console.log((r.stdout ?? "").trim());
    fs.rmSync(`${dir}/full.grade.txt`, { force: true }); // a master graded with another fit is not reused
  }
}
async function ensureN3() {
  if (GRADE !== "n3") return;
  // the LUTs are re-made when the chosen skin brightness is not the one they were fitted to
  // (compared on what the choice comes to for THIS recording: its effective face aim = min(skinY, maxLift x its own
  // recorded median) and its warmth, so a day the cap does not reach is not graded again for nothing)
  const nj = exists(`${N3DIR}/norm.json`) ? readJson(`${N3DIR}/norm.json`) : null;
  const fitted = nj ? String(nj.n3?.skin_y ?? "") : "";
  const aimWas = nj ? Number(nj.skin_y_aim ?? nj.n3?.skin_y ?? NaN) : NaN;
  const aimNow = nj && N3_SKIN_Y !== "" ? Math.min(Number(N3_SKIN_Y), N3_CHOICE.maxLift && nj.skin_y_raw ? N3_CHOICE.maxLift * nj.skin_y_raw : Infinity) : NaN;
  const stale = !!nj && fitted !== "" && ((Number.isFinite(aimNow) && Math.abs(aimWas - aimNow) > 1e-4) || Math.abs(Number(nj.warm ?? 0) - N3_CHOICE.warm) > 1e-6);
  if (!["norm.json", "him.cube", "edge.cube", "wall.cube"].every((f) => exists(`${N3DIR}/${f}`)) || stale || flag("force-n3")) {
    log(`N3: measuring this clip (wall balance, black level, skin hue target, skin fill${N3_SKIN_Y ? ` to ${N3_SKIN_Y}` : ""}) and writing its LUTs…`);
    const r = await runOk(PY, ["-I", N3PY, "prepare", source.path, N3DIR, "--n2", N2DIR, "--face", `${dir}/face.json`, ...(N3_SKIN_Y ? ["--skin-y", N3_SKIN_Y] : []), ...(N3_CHOICE.maxLift ? ["--max-lift", String(N3_CHOICE.maxLift)] : []), ...(N3_CHOICE.warm ? ["--warm", String(N3_CHOICE.warm)] : [])]);
    console.log((r.stdout ?? "").trim());
    if (stale) fs.rmSync(`${dir}/full.grade.txt`, { force: true }); // a master graded to another brightness is not reused
  }
  if (!exists(N3_CAP) || flag("force-matte")) {
    log("N3: finding his eyes on every frame (the cap above the brim is left as recorded)…");
    const r = await runOk(PY, ["-I", N3PY, "cap", source.path, N3_CAP]);
    console.log((r.stdout ?? "").trim().split(/\r?\n/).slice(-1)[0]);
  }
  if (!exists(N3_MATTE) || flag("force-matte")) {
    await withLock(async () => {
      log("N3: matting every frame of the recording (about 0.17 s per frame)…");
      const t0 = Date.now();
      const r = await runOk(PY, ["-I", N3PY, "matte", source.path, N3_MATTE]);
      console.log((r.stdout ?? "").trim().split(/\r?\n/).slice(-1)[0]);
      log(`N3: matte done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
    });
  }
}
// v3 look C (producer: v2 read as a champagne/ash coat painted over the picture). Built from the MEASURED scene (Day 1 raw:
// wall a neutral grey at 60-87 % with ochre and green strokes; skin a cool, slightly ashy brown at ~30 %, r/g 1.25 b/g 0.97;
// shirt crimson; darkest 1.5 % at ~14 %). Rules: nothing is tinted globally and highlights stay neutral.
//   base : look C 'deep' (chosen 2026-11-25 after the producer asked to try again on the subtler look A): an S that sets the
//          black point (14 % -> 8.5 %) and takes the wall's mid-brights down (60 % -> 50 %, 75 % -> 63 %) while whites stay white, darks-and-mids warmed per channel (red +3 %, blue -12 %
//          below 62 % only, so the wall's greys are untouched and his skin becomes a healthy warm brown), a little vibrance
//   lift : inside the tracked face window only, tones under 60 % come up (his face under the cap brim); brighter tones
//          (the wall around his head) are identical, so there is no halo and no haze
//   wall : outside the window the picture comes down 10 % (a natural fall-off toward the edges)
const GR = {
  denoise: "hqdn3d=0.8:0.6:4:3",
  base: "curves=m='0/0 0.14/0.085 0.3/0.27 0.45/0.42 0.6/0.5 0.75/0.635 0.88/0.82 1/0.98':r='0/0 0.25/0.262 0.42/0.435 0.52/0.523 0.62/0.62 1/1':b='0/0 0.25/0.212 0.4/0.362 0.52/0.508 0.62/0.62 1/1',vibrance=intensity=0.18",
  lift: "curves=m='0/0 0.09/0.135 0.26/0.385 0.4/0.5 0.52/0.545 1/1'",
  wall: "curves=m='0/0 0.5/0.42 1/0.84'",
  grain: 2,
  sharpen: "unsharp=5:5:0.45:5:5:0",
};
const MW = 240;
const MH = 135;

/** face window mask 240x135 (value 255 = full lift) at time t, following the dense face track */
function faceAt(t) {
  const tr = face.track;
  const f = Math.min(Math.max(t * 2, 0), tr.length - 1);
  const i = Math.floor(f);
  const j = Math.min(tr.length - 1, i + 1);
  const a = f - i;
  return { x: tr[i][1] * (1 - a) + tr[j][1] * a, y: tr[i][2] * (1 - a) + tr[j][2] * a, h: tr[i][3] * (1 - a) + tr[j][3] * a };
}
const R0 = 0.3;
const R1 = 2.6;
function maskAt(t, out = new Uint8Array(MW * MH)) {
  const { x, y, h } = faceAt(t);
  const cx = x * W;
  const cy = y * H;
  const ry = 0.62 * h * H;
  const rx = 0.8 * ry;
  for (let py = 0; py < MH; py++) {
    const dy = ((py + 0.5) * (H / MH) - cy) / ry;
    for (let px = 0; px < MW; px++) {
      const dx = ((px + 0.5) * (W / MW) - cx) / rx;
      const r = Math.sqrt(dx * dx + dy * dy);
      let m = 1 - (r - R0) / (R1 - R0);
      m = m <= 0 ? 0 : m >= 1 ? 1 : m * m * (3 - 2 * m);
      out[py * MW + px] = Math.round(m * 255);
    }
  }
  return out;
}

/** filter_complex: input 0 = video, input 1 = mask (gray 240x135). `pre` = e.g. "fps=30:start_time=0," */
const gradeGraph = (pre, label = "out") =>
  [
    // RGB work: the source is BT.709 limited range; say so both ways so the curves see true RGB
    `[0:v]${pre}${GR.denoise},scale=in_color_matrix=bt709:in_range=tv,format=gbrp,${GR.base},split[b][c]`,
    `[c]${GR.lift}[l]`,
    `[1:v]scale=${W}:${H}:flags=bicubic,format=gray,format=gbrp,split[m][m2]`,
    `[b][l][m]maskedmerge[f]`,
    `[f]split[f1][f2]`,
    `[f1]${GR.wall}[d]`,
    `[d][f2][m2]maskedmerge,${GR.sharpen},scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,noise=c0s=${GR.grain}:c0f=t[${label}]`,
  ].join(";");

const IS_N2 = GRADE === "n2";
const MASK_W = IS_N2 ? N2_MASK_W : MW;
const MASK_H = IS_N2 ? N2_MASK_H : MH;
/** the grade in use: filtergraph (input 0 = picture, input 1 = gray masks MASK_W x MASK_H) and the mask frame at time t */
// the LUT folder goes in RELATIVE to the project root (every ffmpeg here runs with cwd = ROOT): n2Graph's escaping of a
// drive colon ('C\\:/…' inside quotes) does not parse in ffmpeg 9, a path without a colon needs no escaping
const N2REL = N2DIR.replace(/\\/g, "/").replace(ROOT.replace(/\\/g, "/") + "/", "");
const IS_N3 = GRADE === "n3";
const N3REL = N3DIR.replace(/\\/g, "/").replace(ROOT.replace(/\\/g, "/") + "/", "");
const IS_ST = GRADE === "studio";
const STREL = STDIR.replace(/\\/g, "/").replace(ROOT.replace(/\\/g, "/") + "/", "");
/** the studio grade: the same clean-up as N3 (declared BT.709, a light denoise), then one 3D LUT over the whole picture */
const studioGraph = (pre, label = "out") =>
  `[0:v]${pre}setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv,hqdn3d=1.2:1.0:3:2.5,` +
  "scale=in_color_matrix=bt709:in_range=tv:out_range=pc:flags=accurate_rnd+full_chroma_int,format=gbrp," +
  `lut3d=file='${STREL}/grade.cube':interp=tetrahedral,` +
  "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p," +
  `setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv[${label}]`;
const theGraph = (pre, label = "out") => (IS_ST ? studioGraph(pre, label) : IS_N3 ? n3Graph(N3REL, pre, label) : IS_N2 ? n2Graph(N2REL, pre, label, GR.grain) : gradeGraph(pre, label));
const theMask = (t, out) => (IS_N2 ? n2MasksAt(face.track, t, out) : maskAt(t, out));
const ENC_TAGS = IS_N3 || IS_ST ? N3_ENC_TAGS : IS_N2 ? N2_ENC_TAGS : ["-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"];

const statsOf = async (png, boxes) => {
  const r = await runOk("ffmpeg", ["-v", "error", "-i", png, "-vf", `scale=${W}:${H},format=yuv444p`, "-f", "rawvideo", "pipe:1"], { raw: true });
  const b = r.stdoutBuf;
  const P = W * H;
  const out = {};
  for (const [name, [x0, y0, x1, y1]] of Object.entries(boxes)) {
    let sy = 0, su = 0, sv = 0, n = 0;
    for (let y = Math.floor(y0 * H); y < Math.floor(y1 * H); y += 2)
      for (let x = Math.floor(x0 * W); x < Math.floor(x1 * W); x += 2) {
        const k = y * W + x;
        sy += b[k]; su += b[P + k]; sv += b[2 * P + k]; n++;
      }
    out[name] = { Y: sy / n, U: su / n - 128, V: sv / n - 128 };
  }
  return out;
};

async function gradeStills() {
  const qc = `${outDir(N)}/qc`;
  fs.mkdirSync(qc, { recursive: true });
  const dur = source.duration;
  const times = [0.18, 0.5, 0.82].map((f) => +(dur * f).toFixed(2));
  const report = [];
  for (const t of times) {
    const f = faceAt(t);
    const boxes = {
      wallA: [0.72, 0.08, 0.95, 0.38],
      wallB: [0.76, 0.5, 0.97, 0.8],
      wallL: [0.03, 0.55, 0.2, 0.9],
      face: [f.x - 0.045, f.y + f.h * 0.5 - f.h * 0.5 / 1.55 * 0.9 - 0.0, f.x + 0.045, f.y + f.h * 0.5 - 0.02],
      cap: [f.x - 0.04, f.y - f.h * 0.5 + 0.005, f.x + 0.04, f.y - f.h * 0.5 + 0.045],
    };
    const pgm = `${dir}/stills/mask_${t}.pgm`;
    fs.mkdirSync(`${dir}/stills`, { recursive: true });
    if (!IS_N3 && !IS_ST) fs.writeFileSync(pgm, Buffer.concat([Buffer.from(`P5\n${MASK_W} ${MASK_H}\n255\n`), Buffer.from(theMask(t))]));
    const rawPng = `${dir}/stills/raw_${t}.png`;
    const gPng = `${dir}/stills/graded_${t}.png`;
    await ff(["-ss", String(t), "-i", source.path, "-frames:v", "1", rawPng]);
    // N2 reads the SOURCE (its graph declares the input BT.709 limited, which a PNG is not); v3 reads the raw PNG
    // N3: the matte video is on the master's timeline (frame n = n/30 s), so the same -ss finds the same moment
    if (IS_ST) await ff(["-ss", String(t), "-i", source.path, "-filter_complex", theGraph(""), "-map", "[out]", "-frames:v", "1", gPng]);
    else if (IS_N3) await ff(["-ss", String(t), "-i", source.path, "-ss", String(t), "-i", N3_MATTE, "-ss", String(t), "-i", N3_CAP, "-filter_complex", theGraph(""), "-map", "[out]", "-frames:v", "1", gPng]);
    else if (IS_N2) await ff(["-ss", String(t), "-i", source.path, "-loop", "1", "-framerate", "30", "-i", pgm, "-filter_complex", theGraph(""), "-map", "[out]", "-frames:v", "1", gPng]);
    else await ff(["-i", rawPng, "-loop", "1", "-framerate", "30", "-i", pgm, "-filter_complex", gradeGraph(""), "-map", "[out]", "-frames:v", "1", gPng]);
    await ff(["-i", rawPng, "-i", gPng, "-filter_complex", "[0:v]scale=960:540[a];[1:v]scale=960:540[b];[a][b]hstack", "-q:v", "2", "-frames:v", "1", `${qc}/grade_${Math.round(t)}s.jpg`]);
    const sr = await statsOf(rawPng, boxes);
    const sg = await statsOf(gPng, boxes);
    report.push({ t, raw: sr, graded: sg });
  }
  const line = (name, a, b) => `${name.padEnd(5)} Y ${a.Y.toFixed(0).padStart(3)} -> ${b.Y.toFixed(0).padStart(3)}   U ${a.U.toFixed(1).padStart(6)} -> ${b.U.toFixed(1).padStart(6)}   V ${a.V.toFixed(1).padStart(6)} -> ${b.V.toFixed(1).padStart(6)}   chroma ${Math.hypot(a.U, a.V).toFixed(1)} -> ${Math.hypot(b.U, b.V).toFixed(1)}`;
  for (const r of report) {
    console.log(`\n[grade] t=${r.t}s  (stills: ${qc}/grade_${Math.round(r.t)}s.jpg, left raw | right graded; limited-range 8-bit YUV, U/V centred on 0)`);
    for (const k of ["wallA", "wallB", "wallL", "face", "cap"]) console.log("  " + line(k, r.raw[k], r.graded[k]));
    const wr = (r.raw.wallA.Y + r.raw.wallB.Y) / 2;
    const wg = (r.graded.wallA.Y + r.graded.wallB.Y) / 2;
    console.log(`  face-wall luma: raw ${(r.raw.face.Y - wr).toFixed(0)} -> graded ${(r.graded.face.Y - wg).toFixed(0)}`);
  }
  writeJson(`${dir}/grade-report.json`, report, 1);
  return report;
}

// ───────────────────────────────────────────────────── voice + full.mp4
const VOICE = `adeclip,highpass=f=80,arnndn=m=${CONFIG.rnnoise}:mix=0.85,equalizer=f=220:t=o:w=1:g=-2,equalizer=f=3200:t=o:w=1:g=2,deesser=i=0.4:m=0.5:f=0.5:s=o,acompressor=threshold=-22dB:ratio=3:attack=8:release=120:makeup=2`;

async function ensureVoice() {
  const voice = `${dir}/voice.wav`;
  if (exists(voice) && !flag("force-voice")) return voice;
  log("voice chain…");
  const pre = `${dir}/voice_pre.wav`;
  await ff(["-i", `${dir}/audio48k.wav`, "-af", VOICE, "-c:a", "pcm_f32le", pre]);
  let m = await loudness(pre);
  let gain = LUFS - m.lufs;
  log(`  pre-limiter ${m.lufs.toFixed(1)} LUFS, peak ${m.truePeak.toFixed(1)} -> gain ${gain.toFixed(2)} dB`);
  for (let it = 0; it < 3; it++) {
    await ff(["-i", pre, "-af", `volume=${gain.toFixed(3)}dB,alimiter=limit=0.8:attack=3:release=60:level=disabled`, "-c:a", "pcm_s16le", voice]);
    m = await loudness(voice);
    log(`  voice.wav ${m.lufs.toFixed(2)} LUFS, true peak ${m.truePeak.toFixed(2)} dB`);
    if (Math.abs(m.lufs - LUFS) <= 0.15) break;
    gain += LUFS - m.lufs;
  }
  fs.rmSync(pre, { force: true });
  return voice;
}

async function ensureFull() {
  const full = `${dir}/full.mp4`;
  // a cached master of another grade is never reused
  const gradeTag = `${dir}/full.grade.txt`;
  const cachedGrade = exists(gradeTag) ? fs.readFileSync(gradeTag, "utf8").trim() : "v3";
  if (exists(full) && !flag("force-full") && cachedGrade === GRADE) {
    log(`full.mp4 cached (${(fs.statSync(full).size / 1e6).toFixed(0)} MB; delete with --clean after the body is built)`);
    return full;
  }
  const voice = await ensureVoice();
  await waitNoWhisper();
  await withLock(async () => {
    log(`full.mp4: grading ${TOTAL_FRAMES} frames (grade ${GRADE})…`);
    const t0 = Date.now();
    const tmp = `${dir}/full.part.mp4`;
    const enc = spawn(
      "ffmpeg",
      ["-hide_banner", "-nostdin", "-y", "-i", source.path, ...(IS_ST ? [] : IS_N3 ? ["-i", N3_MATTE, "-i", N3_CAP] : ["-f", "rawvideo", "-pix_fmt", "gray", "-s", `${MASK_W}x${MASK_H}`, "-framerate", String(FPS), "-i", "pipe:0"]), "-i", voice,
        "-filter_complex", theGraph(`fps=${FPS}:start_time=0,`), "-map", "[out]", "-map", IS_ST ? "1:a" : IS_N3 ? "3:a" : "2:a", "-frames:v", String(TOTAL_FRAMES),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", process.env.FULL_CRF ?? "18", "-g", "15", ...ENC_TAGS,
        "-c:a", "aac", "-b:a", "256k", "-ar", String(SR), "-ac", "2", "-t", String(TOTAL_FRAMES / FPS), "-movflags", "+faststart", tmp],
      { stdio: ["pipe", "ignore", "pipe"], windowsHide: true, cwd: ROOT },
    );
    let err = "";
    enc.stderr.on("data", (d) => {
      err += d;
      const m = String(d).match(/frame=\s*(\d+)/g);
      if (m) process.stdout.write(`\r  ${m.at(-1)}   `);
    });
    let closed = false;
    const done = new Promise((res) => enc.on("close", (c) => ((closed = true), res(c))));
    enc.stdin.on("error", () => {});
    const buf = new Uint8Array(MASK_W * MASK_H);
    for (let f = 0; !IS_N3 && !IS_ST && f < TOTAL_FRAMES + 60 && !closed; f++) {
      theMask(f / FPS, buf);
      if (!enc.stdin.write(Buffer.from(buf)) && !closed) {
        // ffmpeg stops reading at -frames:v and closes the pipe: never wait for a drain that cannot come
        await Promise.race([new Promise((r) => enc.stdin.once("drain", r)), done]);
      }
    }
    if (!closed) enc.stdin.end();
    const code = await done;
    process.stdout.write("\n");
    if (code !== 0) throw new Error("full.mp4 encode failed:\n" + err.slice(-1500));
    fs.renameSync(tmp, full);
    fs.writeFileSync(gradeTag, GRADE);
    log(`full.mp4 done in ${((Date.now() - t0) / 1000).toFixed(0)} s, ${(fs.statSync(full).size / 1e6).toFixed(0)} MB`);
  });
  return full;
}

// ───────────────────────────────────────────────────── plan the cut
function planCut(edit, words, sil) {
  const arr = [...words].sort((a, b) => a.i - b.i);
  const pos = new Map(arr.map((w, k) => [w.i, k]));
  const maxPause = edit.maxPause ?? 0.7;
  const pace = (edit.pace ?? []).map((p) => ({ a: parseAnchor(p.span[0]).id, b: parseAnchor(p.span[1]).id, maxPause: p.maxPause }));
  const airs = (edit.air ?? []).map((a) => ({ id: parseAnchor(a.after).id, dur: a.dur, lead: a.lead }));
  const airSet = new Set(airs.map((a) => a.id));
  /** the pause limit that applies between words p and q: the first pace span containing BOTH, else the global one */
  const mpFor = (p, q) => pace.find((s) => p.i >= s.a && q.i <= s.b && q.i >= s.a && p.i <= s.b)?.maxPause ?? maxPause;
  const warn = [];
  // how far his head travels across a pause we are about to shorten (px at 1920x1080, from face.json's 0.5 s track).
  // A 5-frame dissolve hides a small move; a big one shows as a double image, so: a short pause is kept whole,
  // a long one becomes a hard cut (the camera reframes there).
  const faceTrack = (() => {
    try {
      return JSON.parse(fs.readFileSync(dir + "/face.json", "utf8")).track ?? [];
    } catch {
      return [];
    }
  })();
  const headAt = (t) => {
    let i = 0;
    while (i < faceTrack.length - 1 && faceTrack[i + 1][0] <= t) i++;
    const p = faceTrack[i];
    const q = faceTrack[Math.min(i + 1, faceTrack.length - 1)];
    const k = q[0] > p[0] ? Math.min(1, Math.max(0, (t - p[0]) / (q[0] - p[0]))) : 0;
    return [p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
  };
  const movePx = (t0, t1) => {
    if (faceTrack.length < 2) return 0;
    const p = headAt(t0);
    const q = headAt(t1);
    return Math.hypot((p[0] - q[0]) * 1920, (p[1] - q[1]) * 1080);
  };
  const MOVE_PX = 25;
  const KEEP_UP_TO = 0.9;
  // The 0.5 s face track misses quick nods (Day 1: 19 of 30 "soft" joins were visibly doubled, the track said < 25 px).
  // So the REAL frames decide: mean absolute difference of the head crop (160x160 gray, from the raw recording, so it
  // does not depend on the grade) between the last frame before the pause and the first frame after it. Calibrated on
  // Day 1: clean dissolves measure <= 12.4, doubled ones >= 14.1 (the Short 2 "daughter," join: 27.5).
  const DIFF_MAX = 13;
  const diffFile = `${dir}/joindiff.json`;
  const diffCache = exists(diffFile) ? readJson(diffFile) : {};
  const headCrop = (frame, box) =>
    execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-ss", ((frame + 0.25) / FPS).toFixed(4), "-i", source.path, "-frames:v", "1", "-vf", `scale=${W}:${H},crop=${box.s}:${box.s}:${box.x}:${box.y},scale=160:160:flags=area,format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 1 << 24 });
  /** null when it cannot be measured (then the face track decides) */
  const headDiff = (fa, fb) => {
    const key = `${fa}:${fb}`;
    if (key in diffCache) return diffCache[key];
    let v = null;
    try {
      const f = faceAt(fa / FPS);
      const s = Math.round(Math.max(360, 1.7 * f.h * H) / 2) * 2;
      const box = { s, x: Math.round(Math.min(W - s, Math.max(0, f.x * W - s / 2))), y: Math.round(Math.min(H - s, Math.max(0, f.y * H - s / 2))) };
      const A = headCrop(fa, box);
      const B = headCrop(fb, box);
      if (A.length === 25600 && B.length === 25600) {
        let sum = 0;
        for (let i = 0; i < 25600; i++) sum += Math.abs(A[i] - B[i]);
        v = +(sum / 25600).toFixed(1);
      }
    } catch {
      v = null;
    }
    diffCache[key] = v;
    return v;
  };
  const moved = { kept: 0, hard: 0 };
  const segs = []; // {a,b (frames, b exclusive), join}
  const kept = new Set();
  const PRE = 0.08;
  const POST = 0.14;
  const spansW = edit.keep.map((sp) => {
    const ia = parseAnchor(sp[0]).id;
    const ib = parseAnchor(sp[1]).id;
    const ws = arr.filter((w) => w.i >= ia && w.i <= ib);
    if (!ws.length) throw new Error(`keep span ${sp} contains no words`);
    return ws;
  });
  spansW.forEach((ws) => ws.forEach((w) => kept.add(w.i)));
  // two consecutive spans with NO word dropped between them: the pause between is treated like an inside pause
  const adjacent = (si) => si + 1 < spansW.length && pos.get(spansW[si + 1][0].i) === pos.get(spansW[si].at(-1).i) + 1;
  /** how much of the pause between p and q is kept (air: all of it) */
  const keptPause = (p, q) => (airSet.has(p.i) ? q.start - p.end : Math.min(q.start - p.end, mpFor(p, q)));
  edit.keep.forEach((sp, si) => {
    const ws = spansW[si];
    const adjPrev = si > 0 && adjacent(si - 1);
    const adjNext = adjacent(si);
    // pieces split at long pauses (never at an air pause)
    const pieces = [];
    let st = 0;
    let lastMp = maxPause;
    for (let k = 0; k < ws.length - 1; k++) {
      const gap = ws[k + 1].start - ws[k].end;
      const mp = mpFor(ws[k], ws[k + 1]);
      if (!airSet.has(ws[k].i) && gap > mp && gap - mp >= 0.07) {
        const d = movePx(ws[k].end + mp / 2, ws[k + 1].start - mp / 2);
        const diff = headDiff(Math.ceil((ws[k].end + mp / 2) * FPS) - 1, Math.floor((ws[k + 1].start - mp / 2) * FPS));
        const moves = diff === null ? d >= MOVE_PX : diff >= DIFF_MAX;
        if (moves && gap - mp <= KEEP_UP_TO) {
          moved.kept++;
          continue; // he moves through a short pause: keep it whole
        }
        if (moves) moved.hard++;
        pieces.push({ s: st, e: k, mpAfter: mp, mpBefore: lastMp, hard: moves });
        lastMp = mp;
        st = k + 1;
      }
    }
    pieces.push({ s: st, e: ws.length - 1, mpAfter: 0, mpBefore: lastMp });
    pieces.forEach(({ s, e, mpAfter, mpBefore }, pk) => {
      const first = ws[s];
      const last = ws[e];
      const prev = arr[pos.get(first.i) - 1];
      const next = arr[pos.get(last.i) + 1];
      let tin;
      let tout;
      if (pk === 0 && adjPrev) {
        tin = first.start - keptPause(prev, first) / 2;
      } else if (pk === 0) {
        tin = first.start - PRE;
        if (prev) tin = Math.max(tin, (prev.end + first.start) / 2);
      } else {
        // after a shortened pause: keep half of the pause limit of silence before this word
        const pw = ws[s - 1];
        tin = first.start - mpBefore / 2;
        tin = Math.max(tin, (pw.end + first.start) / 2);
      }
      if (pk === pieces.length - 1 && adjNext) {
        tout = last.end + keptPause(last, next) / 2;
      } else if (pk === pieces.length - 1) {
        tout = last.end + POST;
        if (next) tout = Math.min(tout, (last.end + next.start) / 2);
        // an air after the last word of a span: keep the real silence up to 0.1 s before the next source word
        if (airSet.has(last.i)) tout = next ? next.start - 0.1 : last.end + 1;
      } else {
        tout = last.end + mpAfter / 2;
        tout = Math.min(tout, (last.end + ws[e + 1].start) / 2);
      }
      const inAdj = pk === 0 && adjPrev;
      const outAdj = pk === pieces.length - 1 && adjNext;
      let a = inAdj ? Math.round(tin * FPS) : Math.floor(tin * FPS + 1e-6);
      if (prev && pk === 0 && !inAdj && a / FPS < prev.end) a = Math.ceil(prev.end * FPS);
      let b = outAdj ? Math.round(tout * FPS) : Math.ceil(tout * FPS - 1e-6);
      if (next && pk === pieces.length - 1 && !outAdj && b / FPS > next.start) b = Math.floor(next.start * FPS);
      if (b / FPS < last.end && !outAdj) b = Math.ceil(last.end * FPS);
      a = Math.max(0, a);
      b = Math.min(TOTAL_FRAMES, b);
      const gapIn = prev ? first.start - prev.end : 9;
      if (pk === 0 && gapIn < 0.12) warn.push(`span ${si}: only ${(gapIn * 1000).toFixed(0)} ms before w${first.i} - cut is tight`);
      if (pk === pieces.length - 1 && next && next.start - last.end < 0.12) warn.push(`span ${si}: only ${((next.start - last.end) * 1000).toFixed(0)} ms after w${last.i} - cut is tight`);
      segs.push({ a, b, join: segs.length === 0 ? "start" : pk === 0 || pieces[pk - 1].hard ? "cut" : "soft", keepJoin: pk === 0 && adjPrev && !airSet.has(prev.i) });
    });
  });
  writeJson(diffFile, diffCache, 0);
  if (moved.kept || moved.hard) warn.push("head movement: " + moved.kept + " short pauses kept whole, " + moved.hard + " long pauses made hard cuts (reframe)");
  // monotonic + merge touching pieces
  const out = [];
  for (const s of segs) {
    const p = out.at(-1);
    if (p && s.a < p.a) throw new Error("keep spans must be in ascending source order");
    if (p && s.a <= p.b && !s.keepJoin) {
      p.b = Math.max(p.b, s.b);
      continue;
    }
    out.push({ ...s });
  }
  for (const o of out) delete o.keepJoin;
  out[0].join = "start";
  // air: split the segment holding the pause at the middle of the real silence; a hold segment goes in the gap
  const airList = [];
  for (const ar of airs) {
    const X = arr[pos.get(ar.id)];
    if (!X) {
      warn.push(`air after w${ar.id}: no such word`);
      continue;
    }
    if (!kept.has(X.i)) {
      warn.push(`air after w${X.i}: word is not kept - ignored`);
      continue;
    }
    const nextSrc = arr[pos.get(X.i) + 1];
    const nextKept = arr.slice(pos.get(X.i) + 1).find((w) => kept.has(w.i)) ?? null;
    const yEnd = nextSrc && kept.has(nextSrc.i) ? nextSrc.start : nextSrc ? nextSrc.start - 0.1 : X.end + 1;
    const R = Math.max(0, yEnd - X.end);
    let lead = ar.lead ?? R / 2; // seconds of REAL pause kept before the held frame
    lead = R >= 0.2 ? Math.min(Math.max(lead, 0.1), R - 0.1) : R / 2;
    if (R < 0.25) {
      warn.push(`air after w${X.i}: the real pause is only ${R.toFixed(2)} s - nothing to hold inside, air ignored`);
      airList.push({ ar, X, nextKept, hold: null });
      continue;
    }
    const f0 = Math.ceil(X.end * FPS - 1e-6);
    const fm = Math.min(Math.max(Math.round((X.end + lead) * FPS), f0), Math.max(f0, Math.floor(yEnd * FPS)));
    const si = out.findIndex((s) => s.a <= Math.floor(X.end * FPS) && Math.floor(X.end * FPS) < s.b);
    if (si < 0 || !(out[si].a + 1 < fm && fm < out[si].b)) {
      warn.push(`air after w${X.i}: the silence middle (frame ${fm}) is not inside a kept segment - no hold inserted`);
      airList.push({ ar, X, nextKept, hold: null });
      continue;
    }
    const sg = out[si];
    const A1 = { a: sg.a, b: fm, join: sg.join };
    const HOLD = { hold: true, a: fm - 1, b: fm, join: "air", holdLen: 0, silence: [X.end + 0.06, Math.max(X.end + 0.12, yEnd - 0.06)] };
    const A2 = { a: fm, b: sg.b, join: "air", airResume: true };
    out.splice(si, 1, A1, HOLD, A2);
    airList.push({ ar, X, nextKept, hold: HOLD, A1, A2 });
  }
  return { segs: out, kept, maxPause, warn, airList };
}

// ───────────────────────────────────────────────────── helpers: wav, frames
function wavBuffer(f32, rate = SR) {
  const n = f32.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767))), 44 + i * 2);
  return buf;
}

async function cutBody(full) {
  const editPath = opt("edit");
  const edit = loadEdit(N, editPath);
  const { words } = loadWords(N);
  const sil = readJson(`${dir}/silences.json`);
  let { segs, kept, maxPause, warn, airList } = planCut(edit, words, sil);
  const layout = () => {
    let bf = 0;
    for (const s of segs) {
      s.len = s.hold ? s.holdLen : s.b - s.a;
      s.bs = bf;
      bf += s.len;
    }
    return bf;
  };
  const bodyPos = (t) => {
    const f = Math.floor(t * FPS + 1e-6);
    const s = segs.find((x) => !x.hold && f >= x.a - 1 && f < x.b);
    return s ? s.bs + (t * FPS - s.a) : NaN;
  };
  // air: hold the frame at the silence middle for whatever the pause lacks (measured word end -> next kept word start)
  layout();
  const airOut = [];
  for (const al of airList) {
    const T = Math.round(al.ar.dur * FPS);
    if (!al.hold) {
      warn.push(`air after w${al.X.i}: not honoured`);
      continue;
    }
    const dist0 = al.nextKept ? bodyPos(al.nextKept.start) - bodyPos(al.X.end) : (al.A2.b - al.X.end * FPS);
    al.hold.holdLen = Math.max(0, T - Math.round(dist0));
    al.T = T;
    al.dist0 = dist0;
    layout();
  }
  // drop holds that turned out to be 0 frames (the real pause is long enough): re-join their two halves
  for (const al of airList) {
    if (al.hold && al.hold.holdLen === 0) {
      const i = segs.indexOf(al.hold);
      segs.splice(i, 2); // hold + A2
      segs[i - 1].b = al.A2.b;
      al.hold = null;
    }
  }
  const BODY_FRAMES = layout();
  for (const al of airList) {
    if (!al.nextKept && al.ar) continue;
    const xs = bodyPos(al.X.end);
    const ys = al.nextKept ? bodyPos(al.nextKept.start) : NaN;
    airOut.push({ after: `w${al.X.i}`, from: Math.round(xs), frames: Math.round(ys - xs), wanted: Math.round(al.ar.dur * FPS), holdFrom: al.hold ? al.hold.bs : null, holdFrames: al.hold ? al.hold.holdLen : 0 });
  }
  warn.forEach((w) => log("warn: " + w));
  log(`cut plan: ${segs.length} segments (${segs.filter((s) => s.join === "cut").length} cut, ${segs.filter((s) => s.join === "soft").length} soft, ${segs.filter((s) => s.hold).length} hold) -> ${BODY_FRAMES} frames = ${(BODY_FRAMES / FPS).toFixed(2)} s`);
  if (airOut.length) log("air: " + JSON.stringify(airOut));

  // ── audio
  log("assembling audio…");
  const pcm = await readPcm(full, { rate: SR });
  const aud = new Float32Array(BODY_FRAMES * SPF);
  const HALF = 600; // 12.5 ms
  // hold segments: room tone = the real silence of that pause played forward/backward (ping-pong: no discontinuity)
  for (const s of segs) {
    if (!s.hold) continue;
    // quietest ~0.4 s window of the real pause (no breath tail, no word onset); ping-pong loop of that
    const lo = Math.round((s.silence[0] + 0.03) * SR);
    const hi = Math.round((s.silence[1] - 0.03) * SR);
    const Lw = Math.max(1600, Math.min(Math.round(0.4 * SR), hi - lo));
    let bestI = lo;
    let bestV = 1e9;
    for (let p = lo; p + Lw <= Math.max(lo + Lw, hi); p += 960) {
      let mx = 0;
      for (let q = p; q < p + Lw; q += 4) mx = Math.max(mx, Math.abs(pcm[q] ?? 0));
      if (mx < bestV) {
        bestV = mx;
        bestI = p;
      }
    }
    const i0 = bestI;
    const Ls = Lw;
    s.tone = new Float32Array(s.len * SPF + 2 * HALF);
    for (let n = 0; n < s.tone.length; n++) {
      const p = n % (2 * Ls);
      s.tone[n] = pcm[i0 + (p < Ls ? p : 2 * Ls - 1 - p)] ?? 0;
    }
  }
  const sampleAt = (s, rel) => {
    if (s.hold) return s.tone[Math.min(s.tone.length - 1, Math.max(0, rel + HALF))];
    const p = s.a * SPF + rel;
    return p >= 0 && p < pcm.length ? pcm[p] : 0;
  };
  for (const s of segs) aud.set(s.hold ? s.tone.subarray(HALF, HALF + s.len * SPF) : pcm.subarray(s.a * SPF, s.b * SPF), s.bs * SPF);
  for (let k = 1; k < segs.length; k++) {
    const A = segs[k - 1];
    const B = segs[k];
    const J = B.bs * SPF;
    for (let i = -HALF; i < HALF; i++) {
      const th = ((i + HALF + 0.5) / (2 * HALF)) * (Math.PI / 2);
      aud[J + i] = sampleAt(A, A.len * SPF + i) * Math.cos(th) + sampleAt(B, i) * Math.sin(th);
    }
  }
  const tmpWav = `${dir}/body_audio.wav`;
  fs.writeFileSync(tmpWav, wavBuffer(aud));
  let m = await loudness(tmpWav);
  const gdb = LUFS - m.lufs;
  log(`assembled audio ${m.lufs.toFixed(2)} LUFS, peak ${m.truePeak.toFixed(2)} dB -> trim ${gdb.toFixed(2)} dB`);
  const wavG = `${dir}/body_audio_g.wav`;
  await ff(["-i", tmpWav, "-af", `volume=${gdb.toFixed(3)}dB,alimiter=limit=0.7:attack=3:release=60:level=disabled`, "-c:a", "pcm_s16le", wavG]);

  // ── video: decode only the frames we need, assemble, encode once
  const instr = []; // {src, a?, alpha?}
  const need = new Set();
  const cacheA = new Set();
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k];
    const soft = k + 1 < segs.length && segs[k + 1].join === "soft" && s.len >= 8 && segs[k + 1].len >= 8;
    s.zoneOut = soft;
    if (k > 0) s.zoneIn = segs[k].join === "soft" && segs[k - 1].zoneOut;
  }
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k];
    if (s.hold) {
      for (let h = 0; h < s.len; h++) instr.push({ src: s.a });
      need.add(s.a);
      continue;
    }
    const nextSoft = s.zoneOut;
    // copies: from s.a (or after the incoming zone) to s.b (or before the outgoing zone)
    const from = s.zoneIn ? s.a + 3 : s.a;
    const to = nextSoft ? s.b - 2 : s.b;
    if (s.zoneIn) {
      const A = segs[k - 1];
      for (let z = 0; z < 5; z++) {
        // A-side z -> A.b-2+z ; B-side -> s.a-2+z
        const aIdx = Math.min(TOTAL_FRAMES - 1, A.b - 2 + z);
        const bIdx = Math.max(0, s.a - 2 + z);
        instr.push({ src: bIdx, a: aIdx, alpha: (z + 1) / 6 });
        need.add(bIdx);
        need.add(aIdx);
        cacheA.add(aIdx);
      }
    }
    for (let f = from; f < to; f++) {
      instr.push({ src: f });
      need.add(f);
    }
  }
  if (instr.length !== BODY_FRAMES) throw new Error(`internal: ${instr.length} instructions vs ${BODY_FRAMES} frames`);
  for (let i = 1; i < instr.length; i++) if (instr[i].src < instr[i - 1].src) throw new Error(`internal: non-monotonic source order at ${i}`);
  const order = [...need].sort((x, y) => x - y);
  // select expression from ranges
  const ranges = [];
  for (const f of order) {
    const r = ranges.at(-1);
    if (r && f === r[1] + 1) r[1] = f;
    else ranges.push([f, f]);
  }
  const sel = ranges.map(([x, y]) => (x === y ? `eq(n,${x})` : `between(n,${x},${y})`)).join("+");
  fs.writeFileSync(`${dir}/select.txt`, `select='${sel}'`);

  await waitNoWhisper();
  const bodyOut = `${pub}/body.mp4`;
  await withLock(async () => {
    log(`encoding body: ${BODY_FRAMES} frames…`);
    const t0 = Date.now();
    const dec = spawn("ffmpeg", ["-v", "error", "-nostdin", "-i", full, "-an", "-vf", `select='${sel}'`, "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "yuv420p", "pipe:1"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, cwd: ROOT });
    let derr = "";
    dec.stderr.on("data", (d) => (derr += d));
    const tmp = `${pub}/body.part.mp4`;
    const enc = spawn(
      "ffmpeg",
      ["-hide_banner", "-nostdin", "-y", "-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "pipe:0", "-i", wavG, "-map", "0:v", "-map", "1:a",
        // the piped frames are ALREADY BT.709 limited range: say so, or ffmpeg (7+) converts "unknown" -> bt709 a second time
        // (reds went magenta, luma dropped ~2 % in every body before 2026-11-25)
        "-vf", "setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv",
        "-c:v", "libx264", "-preset", "fast", "-crf", process.env.BODY_CRF ?? "18", "-g", "15", "-pix_fmt", "yuv420p", "-r", String(FPS), "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
        "-c:a", "aac", "-b:a", "256k", "-ar", String(SR), "-ac", "2", "-movflags", "+faststart", tmp],
      { stdio: ["pipe", "ignore", "pipe"], windowsHide: true, cwd: ROOT },
    );
    let eerr = "";
    enc.stderr.on("data", (d) => {
      eerr += d;
      const mm = String(d).match(/frame=\s*(\d+)/g);
      if (mm) process.stdout.write(`\r  ${mm.at(-1)}   `);
    });
    enc.stdin.on("error", () => {});
    const encDone = new Promise((res) => enc.on("close", res));
    const cache = new Map();
    let ptr = 0;
    let oi = 0; // index into `order`
    let cur = Buffer.allocUnsafe(FS);
    let fill = 0;
    const emit = async (idx, buf) => {
      // emit every instruction whose primary source frame is idx
      while (ptr < instr.length && instr[ptr].src === idx) {
        const ins = instr[ptr++];
        let o = buf;
        if (ins.a !== undefined) {
          const A = cache.get(ins.a);
          o = Buffer.allocUnsafe(FS);
          const al = Math.round(ins.alpha * 256);
          for (let i = 0; i < FS; i++) o[i] = (A[i] * (256 - al) + buf[i] * al) >> 8;
        }
        if (!enc.stdin.write(o)) await new Promise((r) => enc.stdin.once("drain", r));
      }
    };
    for await (const chunk of dec.stdout) {
      let off = 0;
      while (off < chunk.length) {
        const n = Math.min(FS - fill, chunk.length - off);
        chunk.copy(cur, fill, off, off + n);
        fill += n;
        off += n;
        if (fill === FS) {
          const idx = order[oi++];
          if (cacheA.has(idx)) cache.set(idx, cur);
          await emit(idx, cur);
          cur = Buffer.allocUnsafe(FS);
          fill = 0;
        }
      }
    }
    enc.stdin.end();
    const code = await encDone;
    process.stdout.write("\n");
    if (code !== 0 || ptr !== instr.length) throw new Error(`body encode failed (code ${code}, emitted ${ptr}/${instr.length})\n${derr.slice(-800)}\n${eerr.slice(-1200)}`);
    fs.renameSync(tmp, bodyOut);
    log(`body.mp4 done in ${((Date.now() - t0) / 1000).toFixed(0)} s, ${(fs.statSync(bodyOut).size / 1e6).toFixed(1)} MB`);
  });
  fs.rmSync(tmpWav, { force: true });

  // ── body.json
  const fix = {};
  for (const [k, v] of Object.entries(edit.fix ?? {})) fix[String(k).replace(/^w/, "")] = v;
  const bw = [];
  for (const w of words) {
    if (!kept.has(w.i)) continue;
    const s = segs.find((x) => !x.hold && w.start * FPS >= x.a - 1e-6 && w.start * FPS < x.b);
    if (!s) {
      warn.push(`word w${w.i} "${w.text}" kept but outside every segment`);
      continue;
    }
    const text = fix[String(w.i)] ?? w.text;
    if (text === "") continue;
    const from = Math.round(s.bs + (w.start * FPS - s.a));
    const to = Math.max(from + 1, Math.round(s.bs + (w.end * FPS - s.a)));
    bw.push({ i: w.i, text, from, to, src: [w.start, w.end] });
  }
  const body = {
    day: N,
    fps: FPS,
    frames: BODY_FRAMES,
    duration: +(BODY_FRAMES / FPS).toFixed(4),
    maxPause,
    segments: segs.map((s) => ({ src: [+(s.a / FPS).toFixed(4), +(s.b / FPS).toFixed(4)], body: [s.bs, s.bs + s.len], join: s.join, ...(s.hold ? { hold: true } : {}) })),
    air: airOut,
    joins: segs.slice(1).map((s) => ({ f: s.bs, kind: s.join })),
    words: bw,
    face: { x: face.x, y: face.y, h: face.h },
    // head centre on the BODY timeline, every 15 body frames: [bodyFrame, x, y]
    track: (() => {
      const o = [];
      for (let f = 0; f < BODY_FRAMES; f += 15) {
        const sg = segs.find((x) => f >= x.bs && f < x.bs + x.len);
        const p = faceAt((sg.a + (f - sg.bs)) / FPS);
        o.push([f, +p.x.toFixed(4), +p.y.toFixed(4)]);
      }
      return o;
    })(),
    edit: opt("edit") ?? `december/edits/day${pad(N)}.json`,
    warnings: warn,
  };
  writeJson(`${pub}/body.json`, body, 0);
  fs.copyFileSync(`${pub}/body.json`, `${dir}/body.json`);
  return { body, segs, edit };
}

// ───────────────────────────────────────────────────── verify
async function verify({ body, segs }) {
  console.log("\n[verify]");
  const p = await ffprobe(`${pub}/body.mp4`);
  const v = p.streams.find((s) => s.codec_type === "video");
  const a = p.streams.find((s) => s.codec_type === "audio");
  const sumSeg = body.segments.reduce((s, x) => s + (x.body[1] - x.body[0]), 0);
  console.log(`  video frames ${v.nb_frames} (${(Number(v.nb_frames) / FPS).toFixed(3)} s), audio ${Number(a.duration).toFixed(3)} s, container ${Number(p.format.duration).toFixed(3)} s; sum of segments ${sumSeg} frames = ${(sumSeg / FPS).toFixed(3)} s; body.json.frames ${body.frames}`);
  console.log(`  ${v.codec_name} ${v.width}x${v.height} ${v.avg_frame_rate} ${v.pix_fmt}; audio ${a.codec_name} ${a.sample_rate} Hz ${a.channels} ch`);
  const ok1 = Number(v.nb_frames) === sumSeg && Math.abs(Number(a.duration) - sumSeg / FPS) < 0.03;
  const L = await loudness(`${pub}/body.mp4`);
  console.log(`  loudness ${L.lufs.toFixed(2)} LUFS (target ${LUFS} +-0.5), LRA ${L.lra.toFixed(1)}, true peak ${L.truePeak.toFixed(2)} dBFS (limit -1.5)`);
  const ok2 = Math.abs(L.lufs - LUFS) <= 0.5;
  const ok3 = L.truePeak <= -1.5;
  // join spot checks
  const aud = await readPcm(`${pub}/body.mp4`, { rate: SR });
  const joins = body.joins;
  const pickJ = [];
  const soft = joins.filter((j) => j.kind === "soft");
  const cut = joins.filter((j) => j.kind === "cut");
  if (cut.length) pickJ.push(cut[0]);
  if (soft.length) pickJ.push(soft[0], soft[Math.floor(soft.length / 2)]);
  for (const j of joins) if (pickJ.length < 3 && !pickJ.includes(j)) pickJ.push(j);
  let ok4 = true;
  for (const j of pickJ.slice(0, 3)) {
    const c = j.f * SPF;
    const lo = Math.max(0, c - Math.round(0.4 * SR));
    const hi = Math.min(aud.length, c + Math.round(0.4 * SR));
    const seg = aud.subarray(lo, hi);
    const env = envelopeDb(seg, SR, 0.05, 0.05);
    const strip = [...env].map((d) => (d > -25 ? "#" : d > -38 ? "+" : d > -50 ? "." : "_")).join("");
    const nums = [...env].map((d) => d.toFixed(0)).join(" ");
    // silence at the join, and no clicks: max |sample step| within +-30 ms vs the loud neighbourhood
    const centre = envelopeDb(aud.subarray(c - 600, c + 600), SR, 0.025, 0.025);
    const cmax = Math.max(...centre);
    let step = 0;
    for (let i = c - 1500; i < c + 1500; i++) step = Math.max(step, Math.abs(aud[i + 1] - aud[i]));
    // words adjacent to the join
    const jf = j.f;
    const before = [...body.words].reverse().find((w) => w.to <= jf + 1);
    const after = body.words.find((w) => w.from >= jf - 1);
    const gapB = before ? (jf - before.to) / FPS : NaN;
    const gapA = after ? (after.from - jf) / FPS : NaN;
    const clipped = !(gapB >= 0.04 && gapA >= 0.04); // a word would be cut only if the join is closer than 40 ms to one
    if (clipped) ok4 = false;
    console.log(`  join @${jf} (${(jf / FPS).toFixed(2)} s, ${j.kind}): dB/50ms [${nums}]\n    strip ${strip}   (# >-25  + >-38  . >-50  _ quiet)  centre ±25 ms peak ${cmax.toFixed(1)} dB  max step ${step.toFixed(3)}  last word before "${before?.text}" ends ${gapB.toFixed(2)} s earlier, next "${after?.text}" starts ${gapA.toFixed(2)} s later  -> ${clipped ? "WORD CLIPPED?" : "no word clipped"}${cmax > -38 ? " (low-level breath/noise at the join, " + cmax.toFixed(0) + " dB)" : ""}`);
  }
  // every join: silence check summary
  let bad = 0;
  let noisy = 0;
  let minGap = 9;
  for (const j of joins) {
    const c = j.f * SPF;
    const e = envelopeDb(aud.subarray(c - 600, c + 600), SR, 0.025, 0.025);
    if (Math.max(...e) > -38) noisy++;
    const bw = [...body.words].reverse().find((w) => w.to <= j.f + 1);
    const aw = body.words.find((w) => w.from >= j.f - 1);
    const g = Math.min(bw ? (j.f - bw.to) / FPS : 9, aw ? (aw.from - j.f) / FPS : 9);
    minGap = Math.min(minGap, g);
    if (g < 0.04) bad++;
  }
  console.log(`  all ${joins.length} joins: ${joins.length - bad} with a word-free margin >= 40 ms each side (nearest word ${(minGap * 1000).toFixed(0)} ms), ${bad} too close; ${noisy} have low-level breath/noise (> -38 dB) within +-12 ms of the join (informational)`);
  const res = { frames: ok1, loudness: ok2, peak: ok3, joins: ok4 && bad === 0 };
  console.log(`  RESULT ${JSON.stringify(res)}`);
  writeJson(`${dir}/cut-verify.json`, { ...res, lufs: L.lufs, truePeak: L.truePeak, lra: L.lra, bodyFrames: Number(v.nb_frames), audioDuration: Number(a.duration), joinsNotSilent: bad }, 1);
  return res;
}

// ───────────────────────────────────────────────────── main
await ensureN2();
await ensureN3();
await ensureStudio();
if (!flag("skip-stills") || flag("stills-only")) {
  if (flag("stills-only") || !exists(`${dir}/full.mp4`) || flag("force-full")) await gradeStills();
}
if (flag("stills-only")) process.exit(0);
// "cached" means ensureFull will reuse it: same grade as asked for (a master of another grade is re-graded, and must be measured)
const fullWasCached = exists(`${dir}/full.mp4`) && !flag("force-full") && (exists(`${dir}/full.grade.txt`) ? fs.readFileSync(`${dir}/full.grade.txt`, "utf8").trim() : "v3") === GRADE;
const full = await ensureFull();
// N2's own check of a fresh master: skin on the skin line, wall balance, blacks, shirt hue, colour path, tags
if ((IS_N2 || IS_N3 || IS_ST) && (!fullWasCached || flag("n2-measure") || flag("measure"))) {
  log(`${GRADE.toUpperCase()}: measuring the graded master against the raw…`);
  const m = IS_ST
    ? await run(PY, ["-I", STPY, "check", full, STDIR, ...ST_ARGS])
    : IS_N3
    ? await run(PY, ["-I", N3PY, "measure", source.path, full, N3DIR, N3_MATTE, "--cap", N3_CAP, "--face", `${dir}/face.json`])
    : await run(PY, ["-I", `${ROOT}/scripts/grade-n2/n2.py`, "measure", source.path, full, "--face", `${dir}/face.json`, "--work", N2DIR]);
  console.log((m.stdout ?? "").trim());
  if (m.code !== 0) {
    console.error((m.stderr ?? "").trim().slice(-1500));
    // --accept-n2=<check>[,<check>]: an editor's decision, per day, to go on with NAMED failed checks (never a blanket
    // pass). It is written to n2-accepted.json and belongs in the day's notes for the producer. Any other failure stops.
    const failed = [...(m.stdout ?? "").matchAll(/^\s*FAIL\s+(\S+)\s+(-?[\d.]+)/gm)].map((x) => ({ check: x[1], value: Number(x[2]) }));
    const accept = (opt("accept-grade") ?? opt("accept-n2") ?? "").split(",").filter(Boolean);
    const rest = failed.filter((f) => !accept.includes(f.check));
    if (!failed.length || rest.length) throw new Error(`N2 measure FAILED on the graded master (${rest.map((f) => f.check).join(", ") || "see log"}) — not cutting a body from it`);
    writeJson(`${dir}/n2-accepted.json`, { at: new Date().toISOString(), accepted: failed }, 1);
    log(`N2: measure failed on ${failed.map((f) => `${f.check} ${f.value}`).join(", ")} — ACCEPTED for this day by --accept-n2 (see ${dir}/n2-accepted.json)`);
  }
}
const r = flag("verify-only") ? { body: readJson(`${pub}/body.json`) } : await cutBody(full);
const vres = await verify(r);
console.log(`  sizes: body.mp4 ${(fs.statSync(`${pub}/body.mp4`).size / 1e6).toFixed(1)} MB, full.mp4 ${(fs.statSync(full).size / 1e6).toFixed(0)} MB`);
if (flag("clean")) {
  fs.rmSync(full, { force: true });
  console.log("  --clean: removed " + full);
}
