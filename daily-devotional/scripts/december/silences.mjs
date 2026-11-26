// Stage 2a — the voiced-run / silence map alone (december/work/dayNN/silences.json), without whisper.
// transcribe.mjs writes the same file as its first step; this exists so a day's working folder can be rebuilt
// (words.json restored from body.json) when the whisper build is not on the machine.
import { CONFIG, dayDir, envelopeDb, exists, log, readPcm, voicedRuns, writeJson } from "./lib.mjs";

const N = Number(process.argv[2]);
if (!Number.isFinite(N)) {
  console.error("usage: silences.mjs <N>");
  process.exit(1);
}
const dir = dayDir(N);
if (!exists(`${dir}/audio48k.wav`)) {
  console.error("run ingest first");
  process.exit(1);
}
const HOP = 0.005;
const THRESH = -38;
const MINSIL = 0.12;
const pcm = await readPcm(`${dir}/audio48k.wav`, { rate: 16000, filter: `highpass=f=80,arnndn=m=${CONFIG.rnnoise}:mix=0.85` });
const env = envelopeDb(pcm, 16000, HOP, 0.015);
const voiced = voicedRuns(env, HOP, { thresholdDb: THRESH, minSilence: MINSIL, minVoiced: 0.04 });
const dur = pcm.length / 16000;
const silences = [];
let t = 0;
for (const [a, b] of voiced) {
  if (a - t > 0.001) silences.push([+t.toFixed(3), +a.toFixed(3)]);
  t = b;
}
if (dur - t > 0.001) silences.push([+t.toFixed(3), +dur.toFixed(3)]);
writeJson(`${dir}/silences.json`, { params: { track: "highpass80+arnndn(0.85)", thresholdDb: THRESH, minSilence: MINSIL, hop: HOP }, duration: dur, voiced: voiced.map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)]), silences }, 0);
log(`voiced runs ${voiced.length}, silences ${silences.length}, voiced ${voiced.reduce((s, r) => s + r[1] - r[0], 0).toFixed(1)} s of ${dur.toFixed(1)} s`);
