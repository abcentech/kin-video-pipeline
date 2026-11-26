// N3 grade — the Node side (see n3core.py for what N3 is). Mirrors n3core.graph exactly; keep the two in step.
//   input 0 = the raw video
//   input 1 = the matte video (gray 960x540, one frame per output frame: n3.py matte)
//   input 2 = the above-the-brim video (gray 480x270, one frame per output frame: n3.py cap)
//   cubeDir holds wall.cube + edge.cube + him.cube (n3.py prepare). Pass it RELATIVE to the cwd: a drive colon inside
//   the filter option needs escaping that ffmpeg 9 on Windows does not take reliably.
export const N3_ENC_TAGS = ["-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];
const RIM = 3; // n3core.RIM

export function n3Graph(cubeDir, pre = "", label = "out") {
  const c = cubeDir.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "'\\''");
  const ero = Array(RIM).fill("erosion").join(",");
  return [
    `[0:v]${pre}setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv,hqdn3d=1.2:1.0:3:2.5,` +
      `scale=in_color_matrix=bt709:in_range=tv:out_range=pc:flags=accurate_rnd+full_chroma_int,format=gbrp,split=4[s0][s1][s2][s3]`,
    `[s0]lut3d=file='${c}/wall.cube':interp=tetrahedral[gw]`,
    `[s1]lut3d=file='${c}/edge.cube':interp=tetrahedral[ge]`,
    `[s2]lut3d=file='${c}/him.cube':interp=tetrahedral[gh]`,
    "[1:v]format=gray,scale=1920:1080:flags=bilinear:in_range=pc:out_range=pc,split[m0][m1]",
    "[m0]format=gbrp[m]",
    `[m1]${ero},gblur=sigma=1.2,split[mi0][mi1]`,
    "[mi0]format=gbrp[mi]",
    "[2:v]format=gray,scale=1920:1080:flags=bilinear:in_range=pc:out_range=pc[c0]",
    "[c0][mi1]blend=all_mode=multiply,format=gbrp[mc]",
    "[gw][ge][m]maskedmerge[g1]",
    "[g1][gh][mi]maskedmerge[g2]",
    "[g2][s3][mc]maskedmerge," +
      "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p," +
      `setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv[${label}]`,
  ].join(";");
}

// node scripts/december/grade/n3.mjs bake <raw> <matte.mkv> <cap.mkv> <cubeDir (relative)> <out.mp4> [ss] [t]
// a graded test clip (picture only), cut the same way the matte and cap videos were (same -ss / -t)
if (process.argv[2] === "bake") {
  const { spawnSync } = await import("node:child_process");
  const [raw, matte, cap, cubes, out, ss, t] = process.argv.slice(3);
  const r = spawnSync("ffmpeg", ["-v", "error", "-nostdin", "-y", ...(ss ? ["-ss", ss] : []), ...(t ? ["-t", t] : []), "-i", raw, "-i", matte, "-i", cap,
    "-filter_complex", n3Graph(cubes, "fps=30:start_time=0,"), "-map", "[out]", ...(t ? ["-frames:v", String(Math.round(Number(t) * 30))] : []),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-g", "15", ...N3_ENC_TAGS, "-an", "-movflags", "+faststart", out], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
