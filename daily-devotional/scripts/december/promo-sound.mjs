// Rebuild the sound of a day's trailer and shorts only (the episode's mix is left as it is).
//   node scripts/december/promo-sound.mjs <N>
// For when only the promo pieces' timelines changed (an ending held longer, a trailer line changed).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const n = Number(process.argv[2]);
const dd = `day${String(n).padStart(2, "0")}`;
const plan = JSON.parse(fs.readFileSync(`december-public/${dd}/plan.json`, "utf8"));
const names = ["trailer", ...plan.shorts.map((s) => `short-${s.id}`)]; // run.py names a short by its plan id
const r = spawnSync(process.execPath, ["scripts/december/sound.mjs", String(n), `--only=${names.join(",")}`], { stdio: "inherit" });
process.exit(r.status ?? 1);
