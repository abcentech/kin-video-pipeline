// scripts/december/sound.mjs — the sound stage (score, sound design, mix, master, QA) for one day.
//
//   node scripts/december/sound.mjs <N> [--only=episode,trailer,short-<id>] [--preview]
//   node scripts/december/sound.mjs dev          audition exports -> out/december/dev/sound/
//
// Reads ONLY december-public/dayNN/plan.json (and the media it names); writes
// december-public/dayNN/audio/<piece>.wav (+ .stems/, .report.json). The work is in Python
// (scripts/december/sound/*.py, on the house studio in scripts/viral/studio), run with the
// repo's venv (CONFIG.python). Exit code = the Python's.
import { spawn } from "node:child_process";
import { CONFIG, ROOT } from "./lib.mjs";

const args = process.argv.slice(2);
if (!args.length || args.includes("--help")) {
  console.log("usage: node scripts/december/sound.mjs <N|dev> [--only=episode,trailer,short-<id>] [--preview]");
  process.exit(args.length ? 0 : 2);
}
const p = spawn(CONFIG.python, ["-u", `${ROOT}/scripts/december/sound/run.py`, ...args], { stdio: "inherit", cwd: ROOT, windowsHide: true });
p.on("error", (e) => {
  console.error(`sound: cannot start ${CONFIG.python}: ${e.message}`);
  process.exit(1);
});
p.on("close", (code) => process.exit(code ?? 1));
