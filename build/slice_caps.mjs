import fs from "node:fs";
// slice_caps.mjs <masterCaps.json> <ss> <dur> <out.json>
const [src,ssA,durA,out]=process.argv.slice(2);
const ss=+ssA, dur=+durA, end=ss+dur;
const {words}=JSON.parse(fs.readFileSync(src,"utf8"));
const sliced=words.filter(w=>w.end>ss && w.start<end)
  .map(w=>({w:w.w, start:+(w.start-ss).toFixed(2), end:+(w.end-ss).toFixed(2), emp:w.emp}))
  .map(w=>({...w, start:Math.max(0,w.start)}));
fs.writeFileSync(out, JSON.stringify({words:sliced},null,1));
console.log(`${out}: ${sliced.length} words`);
