// Re-map every timed field in scenes/jul3.json from the OLD trimmed timeline
// (unsnapped drops + the removed ending drop) onto the NEW snapped timeline, so
// cutaways/scriptures/keywords stay locked to the spoken beats after the re-cut.
import fs from "node:fs";
const ROOT = "/Users/mac/Documents/video raw";

const OLD = [
 [24.73,29.25],[34.51,37.21],[55.41,58.93],[64.41,66.95],[91.27,95.49],
 [118.61,119.49],[120.19,125.37],[132.17,134.75],[149.53,153.31],[161.83,167.41],
 [191.73,195.47],[207.75,210.29],[217.11,220.35],[269.47,270.75],[304.71,307.65],
 [362.37,365.75],[420.39,422.31],[478.67,482.51],[516.35,520.31],[529.5,537.1]
];
const NEW = JSON.parse(fs.readFileSync(`${ROOT}/build/jul3_drops_snapped.json`)).drops;

// trimmed(old) -> original
function invert(T, drops) {
  let removed = 0;
  for (const [a, b] of drops) {
    const ts = a - removed;           // trimmed start of this drop
    if (T >= ts) removed += (b - a);
    else break;
  }
  return T + removed;
}
// original -> trimmed(new)
const removedBefore = (t, drops) => drops.reduce((acc, [a, b]) => acc + (t > a ? Math.min(t, b) - a : 0), 0);
const forward = (t) => +(t - removedBefore(t, NEW)).toFixed(2);
const remap = (T) => forward(invert(T, OLD));

const j = JSON.parse(fs.readFileSync(`${ROOT}/longform-studio/src/scenes/jul3.json`, "utf8"));
for (const s of j.scenes) { s.start = remap(s.start); s.end = remap(s.end); }
if (j.keywords) for (const k of j.keywords) k.at = remap(k.at);
if (j.immersion?.scriptures) for (const sc of j.immersion.scriptures) sc.at = remap(sc.at);
j.videoSeconds = 471;

fs.writeFileSync(`${ROOT}/longform-studio/src/scenes/jul3.json`, JSON.stringify(j, null, 2));
console.log("retimed scenes:", j.scenes.map(s => `${s.start}-${s.end}`).join(" "));
console.log("kw:", (j.keywords||[]).map(k=>k.at).join(","), " scr:", (j.immersion?.scriptures||[]).map(s=>s.at).join(","));
