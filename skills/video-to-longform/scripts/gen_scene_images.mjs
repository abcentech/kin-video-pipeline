// Generate a "drive-home-the-point" image per scene via Gemini, write the
// filename back into the scenes JSON. Resumable; on quota/error it leaves the
// scene image unset so LongForm falls back to its motion-graphic card.
//   GKEY=<key> node build/gen_scene_images.mjs longform-studio/src/scenes/jun22.json
import fs from "node:fs";
import path from "node:path";

const KEY = process.env.GKEY;
const cfgPath = process.argv[2];
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const PUB = "longform-studio/public";
const base = path.basename(cfgPath, ".json");

const MODELS = ["gemini-2.5-flash-image", "gemini-3.1-flash-image", "imagen-4.0-fast-generate-001"];

async function genGemini(model, prompt) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 120)}`);
  const img = (j.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData);
  if (!img) throw new Error("no image in response");
  return Buffer.from(img.inlineData.data, "base64");
}

let made = 0, failed = 0;
for (let i = 0; i < cfg.scenes.length; i++) {
  const sc = cfg.scenes[i];
  if (!sc.imagePrompt) continue;
  const name = `${base}_img${i}.png`;
  const dest = path.join(PUB, name);
  if (fs.existsSync(dest)) { sc.image = name; console.log(`skip ${name}`); continue; }
  let ok = false;
  for (const m of MODELS) {
    try {
      const buf = await genGemini(m, sc.imagePrompt);
      fs.writeFileSync(dest, buf); sc.image = name; made++; ok = true;
      console.log(`✓ ${name} via ${m} (${(buf.length / 1024).toFixed(0)}KB)`);
      break;
    } catch (e) { console.log(`  ${m} failed: ${e.message}`); }
  }
  if (!ok) { failed++; console.log(`✗ scene ${i} — falls back to motion-graphic card`); }
}
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
console.log(`\nGENIMGDONE made=${made} failed=${failed} — wrote ${cfgPath}`);
