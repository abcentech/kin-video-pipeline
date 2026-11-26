// N2 grade — drop-in for a Node/ffmpeg pipeline (same shape as the devotional cut.mjs `gradeGraph`).
//
//   import { n2Graph, n2MasksAt, N2_MASK_W, N2_MASK_H } from "../grade-n2/n2.mjs";
//   // once per clip (Python, ~1 min): studio/.venv/Scripts/python.exe -I scripts/grade-n2/n2.py prepare <raw> <workDir> --face <face.json>
//   //   -> workDir/{base,patch,window}.cube + norm.json (this clip's measured white balance + black point)
//   ffmpeg ... -i raw -f rawvideo -pix_fmt gray -s 240x270 -framerate 30 -i pipe:0 \
//       -filter_complex n2Graph(workDir, "fps=30:start_time=0,") -map [out] ...  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv
//   and write n2MasksAt(faceTrack, t) for every output frame t = n/30 into stdin (240x270 gray: subject matte over face window).
//
// This file mirrors scripts/grade-n2/n2core.py (masks_at, graph) exactly; keep the two in step.

export const N2_MASK_W = 240;
export const N2_MASK_H = 270; // two 240x135 masks stacked: subject matte (top), face window (bottom)
const MW = 240;
const MH = 135;
const W = 1920;
const H = 1080;
const WINDOW = { win: 0.46, wr: 0.72 };

/** their face.json track rows are [t, x, y, h] every 0.5 s: head centre and head height, 0..1 of the frame */
export function faceFromTrack(track, t) {
  if (!track?.length) return { x: 0.48, y: 0.34, h: 0.32 };
  let i = 0;
  while (i < track.length - 1 && track[i + 1][0] <= t) i++;
  const j = Math.min(track.length - 1, i + 1);
  const a = track[j][0] === track[i][0] ? 0 : Math.min(1, Math.max(0, (t - track[i][0]) / (track[j][0] - track[i][0])));
  const L = (k) => track[i][k] * (1 - a) + track[j][k] * a;
  return { x: L(1), y: L(2), h: L(3) };
}

/** 240x270 gray: rows 0-134 subject matte (255 = him; the wall-patch calm stays off him), rows 135-269 the face
 *  window alpha (already x its strength 0.46). Same maths as n2core.masks_at (the 5-px max + 2-px blur of the matte are
 *  done with a small box approximation; the masks are upscaled bicubically by ffmpeg anyway). */
export function n2MasksAt(track, t, out = new Uint8Array(N2_MASK_W * N2_MASK_H)) {
  const { x, y, h } = faceFromTrack(track, t);
  const top = y - h / 2;
  const chin = y + h / 2;
  const fwn = 0.363 * h;
  const s = fwn / 0.145;
  const hx = 0.088 * s;
  const hcy = (top - 0.04 + chin) / 2;
  const hry = (chin - top) / 2 + 0.06;
  const raw = new Float32Array(MW * MH);
  for (let py = 0; py < MH; py++) {
    const yn = (py + 0.5) / MH;
    const half = Math.min(0.27, Math.max(0.055, 0.055 + Math.max(0, yn - chin - 0.05) * 1.5)) * s;
    for (let px = 0; px < MW; px++) {
      const xn = (px + 0.5) / MW;
      const head = ((xn - x) / hx) ** 2 + ((yn - hcy) / hry) ** 2 < 1;
      const torso = yn > chin - 0.03 && Math.abs(xn - x) < half;
      raw[py * MW + px] = head || torso ? 1 : 0;
    }
  }
  // dilate 2 px (MaxFilter 5) then blur (~gaussian 2 px) — as n2core
  const dil = new Float32Array(MW * MH);
  for (let py = 0; py < MH; py++)
    for (let px = 0; px < MW; px++) {
      let m = 0;
      for (let dy = -2; dy <= 2 && !m; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const yy = py + dy, xx = px + dx;
          if (yy >= 0 && yy < MH && xx >= 0 && xx < MW && raw[yy * MW + xx]) { m = 1; break; }
        }
      dil[py * MW + px] = m;
    }
  const R = 6; // gaussian sigma 2 (as PIL GaussianBlur(2) in n2core), radius 3 sigma
  const g = Array.from({ length: 2 * R + 1 }, (_, i) => Math.exp(-((i - R) ** 2) / 8));
  const gs = g.reduce((p, q) => p + q, 0);
  for (let i = 0; i < g.length; i++) g[i] /= gs;
  const tmp = new Float32Array(MW * MH);
  const blur = (src, dst, hor) => {
    for (let py = 0; py < MH; py++)
      for (let px = 0; px < MW; px++) {
        let v = 0;
        for (let k = -R; k <= R; k++) {
          const xx = hor ? Math.min(MW - 1, Math.max(0, px + k)) : px;
          const yy = hor ? py : Math.min(MH - 1, Math.max(0, py + k));
          v += g[k + R] * src[yy * MW + xx];
        }
        dst[py * MW + px] = v;
      }
  };
  blur(dil, tmp, true);
  blur(tmp, dil, false);
  for (let i = 0; i < MW * MH; i++) out[i] = Math.round(Math.min(1, Math.max(0, dil[i])) * 255);
  // face window
  const fw = fwn * W;
  const rx = 0.95 * fw * WINDOW.wr;
  const ry = 1.15 * fw * WINDOW.wr;
  const fy = y + 0.17 * h;
  const ramp = [1, 0.84, 0.5, 0.16, 0];
  for (let py = 0; py < MH; py++)
    for (let px = 0; px < MW; px++) {
      const dx = (((px + 0.5) / MW) * W - x * W) / rx;
      const dy = (((py + 0.5) / MH) * H - fy * H) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      let a = 0;
      if (d < 1) {
        const f = d * 4;
        const i0 = Math.floor(f);
        a = ramp[i0] + (ramp[Math.min(4, i0 + 1)] - ramp[i0]) * (f - i0);
      }
      out[(MH + py) * MW + px] = Math.round(Math.min(1, Math.max(0, a * WINDOW.win)) * 255);
    }
  return out;
}

/** filter_complex: input 0 = raw video, input 1 = the 240x270 gray masks. `pre` e.g. "fps=30:start_time=0,".
 *  Colour-matrix rules (do not drop any of them): tag the input BT.709 limited (setparams) and convert with an explicit
 *  in_color_matrix/in_range before any RGB work; LUTs run in full-range gbrp; convert back with an explicit
 *  out_color_matrix/out_range and tag again; the encoder gets -colorspace/-color_primaries/-color_trc bt709 -color_range tv. */
export function n2Graph(cubeDir, pre = "", label = "out", grain = 0) {
  // the path sits inside a single-quoted filter option: there a drive colon needs exactly ONE backslash
  // ('C\:/dir with spaces/x.cube'); a single quote is closed, escaped and reopened. Absolute and relative Windows
  // paths, with spaces, are covered by the self-test at the bottom of this file.
  const c = cubeDir.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "'\\''");
  return [
    `[0:v]${pre}setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv,hqdn3d=1.2:1.0:3:2.5,` +
      `scale=in_color_matrix=bt709:in_range=tv:out_range=pc:flags=accurate_rnd+full_chroma_int,format=gbrp,split=3[s0][s1][s2]`,
    `[s0]lut3d=file='${c}/base.cube':interp=tetrahedral[gb]`,
    `[s1]lut3d=file='${c}/patch.cube':interp=tetrahedral[gp]`,
    `[s2]lut3d=file='${c}/window.cube':interp=tetrahedral[gw]`,
    "[1:v]format=gray,split[mA][mB]",
    "[mA]crop=240:135:0:0,scale=1920:1080:flags=bicubic,format=gbrp[ms]",
    "[mB]crop=240:135:0:135,scale=1920:1080:flags=bicubic,format=gbrp[mw]",
    "[gp][gb][ms]maskedmerge[g1]",
    "[g1][gw][mw]maskedmerge," +
      "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p," +
      `setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv${grain ? `,noise=c0s=${grain}:c0f=t` : ""}[${label}]`,
  ].join(";");
}

/** the encoder flags that must accompany the graph */
export const N2_ENC_TAGS = ["-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];

// ---- self-test: node scripts/grade-n2/n2.mjs --selftest <work_dir with base/patch/window.cube>
// Runs the graph on a synthetic 1920x1080 frame with the cube folder given (1) as an absolute Windows path, (2) as a
// copy in a folder whose name has spaces, (3) relative to the cwd — and checks ffmpeg accepts each and writes a frame.
if (process.argv[2] === "--selftest" && import.meta.url.endsWith("/n2.mjs") && process.argv[1]?.replace(/\\/g, "/").endsWith("grade-n2/n2.mjs")) {
  const { spawnSync } = await import("node:child_process");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const os = await import("node:os");
  const src = path.resolve(process.argv[3] ?? ".");
  const spaced = fs.mkdtempSync(path.join(os.tmpdir(), "n2 self test "));
  for (const f of ["base.cube", "patch.cube", "window.cube"]) fs.copyFileSync(path.join(src, f), path.join(spaced, f));
  const cases = { absolute: src, "absolute with spaces": spaced, relative: path.relative(process.cwd(), src) || "." };
  const mask = Buffer.from(n2MasksAt([[0, 0.48, 0.34, 0.31]], 0));
  let ok = true;
  for (const [name, dir] of Object.entries(cases)) {
    const r = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=0xC02040:s=1920x1080:d=0.04,format=yuv420p", "-f", "rawvideo", "-pix_fmt", "gray", "-s", `${N2_MASK_W}x${N2_MASK_H}`, "-framerate", "30", "-i", "pipe:0",
      "-filter_complex", n2Graph(dir), "-map", "[out]", "-frames:v", "1", "-f", "null", "-"], { input: mask, encoding: "utf8" });
    const pass = r.status === 0;
    ok &&= pass;
    console.log(`${pass ? "PASS" : "FAIL"}  ${name.padEnd(22)} ${dir}${pass ? "" : `\n      ${r.stderr.trim().split("\n").slice(-2).join("\n      ")}`}`);
  }
  fs.rmSync(spaced, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}
