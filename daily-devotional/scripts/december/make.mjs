// scripts/december/make.mjs <N> [--from=stage] [--until=stage] [--only=episode,trailer16,…] [--force]
// Runs the stages of december/PIPELINE.md in order, each as a child process (log: december/work/dayNN/logs/<stage>.log),
// skipping stages whose outputs are newer than their inputs, one status line per stage.
//   ingest transcribe draft  [edit must exist]  cut film plan art matte sound stills render qc post
// A stage script that does not exist yet stops the run cleanly ("stage not built yet").
import fs from "node:fs";
import { spawn } from "node:child_process";
import { args, dayArg, ensureTmp, tcs } from "./back.mjs";
import { ROOT, pad, exists, readJson, sourcePath } from "./lib.mjs";

ensureTmp();
const n = dayArg();
const NN = pad(n);
const S = `${ROOT}/december/work/day${NN}`;
const P = `${ROOT}/december-public/day${NN}`;
const OUT = `${ROOT}/out/december/Day${NN}`;
const EDIT = `${ROOT}/december/edits/day${NN}.json`;
const SERIES = `${ROOT}/december/series.json`;
const readOr = (f) => (exists(f) ? readJson(f, null) : null);
const plan = () => readOr(`${P}/plan.json`);
const edit = () => readOr(EDIT);

const deliverables = () => {
  const pl = plan();
  if (!pl) return [];
  const slug = String(pl.meta.title).replace(/[’']/g, "").replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).join("_");
  return [`Day${NN}_${slug}_16x9.mp4`, `Day${NN}_Trailer_16x9.mp4`, `Day${NN}_Trailer_9x16.mp4`, ...pl.shorts.map((_, i) => `Day${NN}_Short${i + 1}_9x16.mp4`)].map((f) => `${OUT}/${f}`);
};
const audios = () => {
  const pl = plan();
  if (!pl) return [];
  return [pl.episode.audio, pl.trailer["16x9"].audio, ...pl.shorts.map((s) => s.audio)].map((a) => `${ROOT}/december-public/${a}`);
};

const STAGES = [
  { name: "ingest", in: () => [sourcePath(n)], out: () => [`${S}/source.json`] },
  { name: "transcribe", in: () => [`${S}/audio16k.wav`], out: () => [`${S}/words.json`] },
  { name: "draft", in: () => [`${S}/words.json`], out: () => [`${S}/draft.json`], after: "edit" },
  { name: "cut", in: () => [EDIT, `${S}/words.json`], out: () => [`${P}/body.mp4`, `${P}/body.json`] },
  { name: "film", in: () => [SERIES], out: () => [`${P}/film.mp4`] },
  { name: "plan", in: () => [EDIT, SERIES, `${P}/body.json`, `${P}/film.mp4`, `${ROOT}/src/December/timing.ts`], out: () => [`${P}/plan.json`] },
  { name: "art", in: () => [EDIT], out: () => (edit()?.art ?? []).map((a) => `${P}/art/${a.id}.jpg`), always: true },
  { name: "matte", in: () => [`${P}/plan.json`, `${P}/body.mp4`], out: () => (plan()?.trailer["16x9"].mattes ?? []).map((m) => `${P}/${m.out.replace(/^day\d+\//, "")}`) },
  { name: "sound", in: () => [`${P}/plan.json`], out: () => audios() },
  { name: "stills", in: () => [`${P}/plan.json`], out: () => [`${OUT}/qc/stills/episode_sheet1.jpg`], pass: true },
  { name: "render", in: () => [`${P}/plan.json`, ...audios()], out: () => deliverables(), pass: true },
  { name: "qc", in: () => deliverables(), out: () => [`${OUT}/Day${NN}_QC.md`], pass: true },
  { name: "post", in: () => [`${P}/plan.json`], out: () => [`${OUT}/Day${NN}.srt`, `${OUT}/Day${NN}_socials.md`] },
];
const names = STAGES.map((s) => s.name);
for (const k of ["from", "until"]) if (args[k] && !names.includes(args[k])) (console.error(`--${k}=${args[k]}: unknown stage (${names.join(", ")})`), process.exit(2));
const i0 = args.from ? names.indexOf(args.from) : 0;
const i1 = args.until ? names.indexOf(args.until) : names.length - 1;

const mtime = (f) => (exists(f) ? fs.statSync(f).mtimeMs : null);
function fresh(st) {
  const outs = st.out();
  if (!outs.length || st.always && !outs.length) return false;
  const om = outs.map(mtime);
  if (om.some((m) => m === null)) return false;
  const im = st.in().map(mtime).filter((m) => m !== null);
  return !im.length || Math.min(...om) >= Math.max(...im);
}

const logDir = `${S}/logs`;
fs.mkdirSync(logDir, { recursive: true });
const runStage = (st, extra) =>
  new Promise((resolve) => {
    const logFile = `${logDir}/${st.name}.log`;
    const fd = fs.openSync(logFile, "w");
    const script = `${ROOT}/scripts/december/${st.name}.mjs`;
    const p = spawn(process.execPath, [script, String(n), ...extra], { stdio: ["ignore", fd, fd], cwd: ROOT });
    p.on("close", (code) => {
      fs.closeSync(fd);
      resolve({ code, logFile });
    });
  });

const t00 = Date.now();
for (let i = i0; i <= i1; i++) {
  const st = STAGES[i];
  const script = `${ROOT}/scripts/december/${st.name}.mjs`;
  if (st.name === "cut" && !exists(EDIT)) {
    console.log(`[stop] draft ready at ${S}/draft.md; write the edit at ${EDIT}, then run: node scripts/december/make.mjs ${n} --from=cut`);
    process.exit(0);
  }
  if (!exists(script)) {
    console.log(`[stop] ${st.name.padEnd(10)} stage not built yet (${script.replace(ROOT + "/", "")})`);
    process.exit(0);
  }
  if (!args.force && fresh(st)) {
    console.log(`[skip] ${st.name.padEnd(10)} up to date`);
    continue;
  }
  const extra = [];
  if (st.pass && args.only && args.only !== true) extra.push(`--only=${args.only}`);
  const t0 = Date.now();
  process.stdout.write(`[run ] ${st.name.padEnd(10)} …`);
  const r = await runStage(st, extra);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.code !== 0) {
    console.log(`\r[FAIL] ${st.name.padEnd(10)} exit ${r.code} after ${secs}s   log: ${r.logFile}`);
    const tail = fs.readFileSync(r.logFile, "utf8").split(/\r?\n/).slice(-15).join("\n");
    console.log(tail);
    process.exit(1);
  }
  console.log(`\r[ ok ] ${st.name.padEnd(10)} ${secs}s`);
}
console.log(`done in ${tcs(((Date.now() - t00) / 1000) * 30)} min:s`);
