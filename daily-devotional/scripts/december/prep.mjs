// Everything a day needs BEFORE the editor writes its edit, for several days in a row:
//   node scripts/december/prep.mjs 3 4 5 6 0
// per day: ingest → transcribe (word pass) → draft → rehear (2nd + 3rd hearings) → film (the day's clip; not for day 0)
// One whisper at a time on this laptop: each day waits until no whisper-cli is running. A failed stage stops that
// day only; the next day still runs. Logs: december/work/dayNN/logs/prep-<stage>.log. Stages that are done are skipped
// by the stages themselves (they cache).
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { ROOT, pad } from "./lib.mjs";

const days = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
const stamp = () => new Date().toTimeString().slice(0, 8);
const whisperRunning = () => /whisper-cli/i.test(spawnSync("tasklist", [], { encoding: "utf8" }).stdout ?? "");
const waitNoWhisper = () => {
  while (whisperRunning()) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20000);
};
for (const n of days) {
  const dir = `${ROOT}/december/work/day${pad(n)}`;
  fs.mkdirSync(`${dir}/logs`, { recursive: true });
  const stages = ["ingest", "transcribe", "draft", "rehear", ...(n >= 1 ? ["film"] : [])];
  for (const st of stages) {
    if (st === "transcribe" || st === "rehear") waitNoWhisper();
    const t0 = Date.now();
    const fd = fs.openSync(`${dir}/logs/prep-${st}.log`, "w");
    const r = spawnSync(process.execPath, [`${ROOT}/scripts/december/${st}.mjs`, String(n)], { cwd: ROOT, stdio: ["ignore", fd, fd] });
    fs.closeSync(fd);
    console.log(`${stamp()} day ${n} ${st.padEnd(10)} ${r.status === 0 ? "ok  " : "FAIL"} ${((Date.now() - t0) / 60000).toFixed(1)} min`);
    if (r.status !== 0) break;
  }
}
console.log(`${stamp()} prep done`);
