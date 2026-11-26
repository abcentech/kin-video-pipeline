// Side-by-side comparison of several grades of the same moment, for the producer's phone.
//   node scripts/december/grade/compare.mjs <out.mp4|.jpg> <cropX> <colW> "<label>=<file>" "<label>=<file>" …
// Every column is the same colW x 1080 slice of the frame (from cropX), so he fills each one; labels are burned in.
// Two to four columns; the result is scaled to 1920 wide. A .jpg output takes the frame at --at=<seconds> (default 2).
import { execFileSync } from "node:child_process";
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const at = (process.argv.find((a) => a.startsWith("--at=")) ?? "--at=2").slice(5);
const [out, cropX, colW, ...cols] = args;
const still = /\.(jpg|png)$/i.test(out);
const font = "C\\\\:/Windows/Fonts/arialbd.ttf";
const items = cols.map((c) => ({ label: c.slice(0, c.indexOf("=")), file: c.slice(c.indexOf("=") + 1) }));
const side = (i, label) =>
  `[${i}:v]crop=${colW}:1080:${cropX}:0,drawtext=fontfile=${font}:text='${label.replace(/[':,\\]/g, " ")}':x=20:y=20:fontsize=40:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=12[v${i}]`;
const H = Math.round((1920 / (Number(colW) * items.length)) * 1080 / 2) * 2;
const graph = `${items.map((it, i) => side(i, it.label)).join(";")};${items.map((_, i) => `[v${i}]`).join("")}hstack=inputs=${items.length},scale=1920:${H}:in_color_matrix=bt709:out_color_matrix=bt709:flags=lanczos,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv[o]`;
const inputs = items.flatMap((it) => (still ? ["-ss", at, "-i", it.file] : ["-i", it.file]));
execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-y", ...inputs, "-filter_complex", graph, "-map", "[o]",
  ...(still ? ["-frames:v", "1", "-q:v", "2"] : ["-an", "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-movflags", "+faststart"]),
  out], { stdio: "inherit" });
console.log(out);
