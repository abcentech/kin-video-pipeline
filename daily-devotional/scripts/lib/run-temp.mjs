// Gives this process (and the Chrome/ffmpeg it spawns) a temp dir of its own
// under .tmp/rtmp-nbc/<pid>, removed on exit. Import it FIRST, before
// @remotion/*: Remotion leaves ~0.8 GB asset caches in %TEMP% per render
// (the scripts exit before it cleans up), which filled C: on 2026-10-03.
// Dirs of runs that died without cleaning up are swept at the next start —
// only inside this folder, never the shared %TEMP%.

import { mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const base = path.resolve(import.meta.dirname, "..", "..", ".tmp", "rtmp-nbc");
mkdirSync(base, { recursive: true });

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
};
for (const d of readdirSync(base)) {
  if (!/^\d+$/.test(d) || alive(Number(d))) continue;
  try {
    rmSync(path.join(base, d), { recursive: true, force: true });
  } catch {
    // A dead run's Chrome can still hold a file (EPERM): the next sweep takes it.
  }
}

export const runTemp = path.join(base, String(process.pid));
mkdirSync(runTemp, { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = runTemp;
process.on("exit", () => {
  try {
    rmSync(runTemp, { recursive: true, force: true });
  } catch {
    // Chrome can still hold a file for a moment; the next run sweeps it.
  }
});
