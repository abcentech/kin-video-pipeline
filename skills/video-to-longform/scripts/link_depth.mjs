// Set each item's `depth` field to its <image>_depth.png if that file exists in
// the public dir. Run after gen_depth.mjs. Works on a studio pixar_intro.json
// (beats) or a longform scenes JSON (scenes).
//   node link_depth.mjs <json> <publicDir>
import fs from "node:fs";
import path from "node:path";

const p = process.argv[2];
const PUB = process.argv[3] || "../../longform-studio/public";
const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
const items = cfg.beats || cfg.scenes;
if (!items) { console.error("no beats/scenes in", p); process.exit(1); }

let n = 0;
for (const it of items) {
  const img = it.hero || it.image;
  if (!img) continue;
  const depthName = img.replace(/\.(png|jpe?g|webp)$/i, "_depth.png");
  if (fs.existsSync(path.join(PUB, depthName))) { it.depth = depthName; n++; }
  else it.depth = it.depth ?? null;
}
fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
console.log(`Linked ${n} depth maps into ${p}`);
