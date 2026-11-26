// scripts/december/watch.mjs [--all] [--next] — status board: inbox vs out/december (no daemon).
//   per day: raw present? draft ready? edit present? plan? delivered?     --next prints the next command to run.
import fs from "node:fs";
import { args } from "./back.mjs";
import { ROOT, pad, exists, CONFIG } from "./lib.mjs";

const inbox = new Set();
if (exists(CONFIG.inbox)) for (const f of fs.readdirSync(CONFIG.inbox)) {
  const m = /^Day_(\d+)\.mp4$/i.exec(f);
  if (m) inbox.add(Number(m[1]));
}
const days = new Set([...inbox]);
const list = (d, re) => (exists(d) ? fs.readdirSync(d).filter((f) => re.test(f)) : []);
for (const f of list(`${ROOT}/december/edits`, /^day\d+\.json$/)) days.add(Number(f.match(/\d+/)[0]));
for (const f of list(`${ROOT}/out/december`, /^Day\d+$/)) days.add(Number(f.match(/\d+/)[0]));
if (args.all) for (let d = 0; d <= 30; d++) days.add(d);

const state = (n) => {
  const N = pad(n);
  const out = `${ROOT}/out/december/Day${N}`;
  const delivered = exists(`${out}/Day${N}_QC.md`) && list(out, /^Day\d+_.*16x9\.mp4$/).length > 0 && !/Result: \*\*FAIL/.test(fs.readFileSync(`${out}/Day${N}_QC.md`, "utf8"));
  return {
    n,
    raw: inbox.has(n),
    draft: exists(`${ROOT}/december/work/day${N}/draft.json`),
    edit: exists(`${ROOT}/december/edits/day${N}.json`),
    plan: exists(`${ROOT}/december-public/day${N}/plan.json`),
    rendered: list(out, /\.mp4$/).length,
    delivered,
  };
};
const rows = [...days].sort((a, b) => a - b).map(state);
const yn = (b) => (b ? "yes" : " - ");
console.log("day  raw  draft  edit  plan  mp4s  delivered");
for (const r of rows) console.log(`${String(r.n).padStart(3)}  ${yn(r.raw)}  ${yn(r.draft).padStart(3)}    ${yn(r.edit)}   ${yn(r.plan)}   ${String(r.rendered).padStart(3)}   ${yn(r.delivered)}`);

if (args.next) {
  const r = rows.filter((x) => x.raw && !x.delivered).sort((a, b) => a.n - b.n)[0] ?? rows.filter((x) => x.edit && !x.delivered)[0];
  console.log("");
  if (!r) console.log("nothing to do: every day with a raw file is delivered.");
  else if (!r.draft && !r.edit) console.log(`next: node scripts/december/make.mjs ${r.n} --until=draft`);
  else if (!r.edit) console.log(`next: write december/edits/day${pad(r.n)}.json from december/work/day${pad(r.n)}/draft.md (then: node scripts/december/make.mjs ${r.n})`);
  else console.log(`next: node scripts/december/make.mjs ${r.n}`);
}
