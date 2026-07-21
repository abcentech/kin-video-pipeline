// Render a HyperFrames b-roll insert card for every insert in a shorts config,
// then write the card video filename back into each insert as `video`.
// Usage: node build/gen_cards.mjs build/shorts_all.json
// Skips cards already rendered (resumable). Run with Node 24 (HyperFrames).
import fs from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const cfgPath = process.argv[2];
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const PUB = path.resolve("remotion-video-studio/public");

for (const s of cfg.shorts) {
  if (!s.inserts) continue;
  s.inserts.forEach((ins, i) => {
    const name = `card_${s.id}_${i}`;
    const dest = path.join(PUB, `${name}.mp4`);
    const dur = Math.max(3, +(ins.end - ins.start).toFixed(2));
    if (fs.existsSync(dest)) {
      console.log(`skip ${name} (exists)`);
    } else {
      console.log(`>>> ${name} "${ins.title}" ${dur}s`);
      const args = [JSON.stringify(ins.title), JSON.stringify(ins.sub || ""), JSON.stringify(ins.emoji || ""), String(dur), name];
      execSync(`node build/hf_card.mjs ${args.join(" ")}`, { stdio: "inherit" });
    }
    ins.video = `${name}.mp4`;
  });
}

fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
console.log(`\nGENCARDSDONE — updated ${cfgPath} with video refs`);
