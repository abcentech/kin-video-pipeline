// Run several pipeline steps one after another; stop at the first that fails.
//   node scripts/december/chain.mjs [--locked] "<step args>" "<step args>" …
// Each step is `node <args split on spaces>`. With --locked every step gets DEC_LOCKED=1, i.e. it does NOT queue for
// the machine lock: use that either under `node scripts/with-render-lock.mjs node scripts/december/chain.mjs --locked …`
// (one lock hold for the whole chain: the lock has no fairness) or, knowingly, to run beside another heavy job.
import { spawnSync } from "node:child_process";
const locked = process.argv.includes("--locked");
const steps = process.argv.slice(2).filter((a) => a !== "--locked");
const t0 = Date.now();
for (const step of steps) {
  console.log(`\n=== ${new Date().toTimeString().slice(0, 8)}  node ${step}`);
  const r = spawnSync(process.execPath, step.split(" "), { stdio: "inherit", env: locked ? { ...process.env, DEC_LOCKED: "1" } : process.env });
  console.log(`=== exit ${r.status} after ${((Date.now() - t0) / 60000).toFixed(1)} min total`);
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log(`\n=== chain done ${new Date().toTimeString().slice(0, 8)}`);
