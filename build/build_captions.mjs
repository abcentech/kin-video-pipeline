// Convert each fihtN.whisper.json -> src/captions/fihtN.json
// Usage: node build/build_captions.mjs fiht1 fiht2 ...
import fs from "node:fs";

// emphasis: punchy, emotional, theme words for this devotional
const EMP = /^(hospital|hospitals|closed|no|never|not|medicine|surgeries|pharmacies|survive|sickness|disease|diseases|defeated|power|greater|deeper|stronger|diagnosis|faith|name|jesus|healed|healing|heal|touch|touched|whole|wholeness|growth|disappear|disappeared|miracle|skin|fever|believe|god|fresh|cleansed|ask|pray|prayer|prayers|care|compassion|genuinely|problems|responsibility|long|short|simple|glory|driver|gift|dad|recall|instant|gradual|immediately|expect|expects|confidence|finished|daily|bread|fear|every|everyone|receive|pity|drugs|instrument|first|only|must|crucial|body|temple|fuel|food|eat|eating|sugar|junk|rest|sleep|sleeping|pit|stop|stops|discipline|priceless|blood|bought|price|workmanship|perfect|perfection|honor|steward|recharge|repair|repaired|games|nonstop|breakdown|poison|poisons|purifies|moderation|gluttony|wonderfully|fearfully)$/i;

fs.mkdirSync("remotion-video-studio/src/captions", { recursive: true });

for (const name of process.argv.slice(2)) {
  const data = JSON.parse(fs.readFileSync(`build/transcripts/${name}.whisper.json`, "utf8"));
  const segs = data.transcription || [];
  let words = [];
  for (const s of segs) {
    const w = (s.text || "").trim();
    if (!w) continue;
    if (/^(um|uh|umm|err)[,.]?$/i.test(w)) continue;
    if (/^\[.*\]$/.test(w)) continue; // [BLANK_AUDIO] etc
    const start = +(s.offsets.from / 1000).toFixed(2);
    const end = +(s.offsets.to / 1000).toFixed(2);
    words.push({ w, start, end: Math.max(end, start + 0.1), emp: EMP.test(w.replace(/[^a-zA-Z]/g, "")) });
  }
  fs.writeFileSync(`remotion-video-studio/src/captions/${name}.json`, JSON.stringify({ words }));
  console.log(`${name}: ${words.length} words, ${words.filter(w=>w.emp).length} emphasized`);
}
