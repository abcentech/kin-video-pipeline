// Run any command while holding the machine-wide Remotion lock that scripts/kind-outro.mjs uses
// (.tmp/kind-outro.render.lock), so batch jobs and agent stills never overlap.
//   node scripts/with-render-lock.mjs <command> [args...]
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const dir = path.resolve(".tmp", "kind-outro.render.lock");
mkdirSync(path.resolve(".tmp"), { recursive: true });
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (;;) {
  try {
    mkdirSync(dir);
    writeFileSync(path.join(dir, "pid"), String(process.pid));
    break;
  } catch {
    let holder = NaN;
    try {
      holder = Number(readFileSync(path.join(dir, "pid"), "utf8"));
    } catch {
      // pid file not written yet
    }
    if (Number.isFinite(holder) && !alive(holder)) rmSync(dir, { recursive: true, force: true });
    else await sleep(2000);
  }
}
const release = () => rmSync(dir, { recursive: true, force: true });
process.on("exit", release);
const [cmd, ...args] = process.argv.slice(2);
const child = spawn(cmd, args, { stdio: "inherit" });
child.on("exit", (code) => {
  release();
  process.exit(code ?? 1);
});
