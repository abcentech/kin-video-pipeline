// Convert whisper.cpp JSON (-oj) into src/captions.json word list.
// Usage: node build/whisper_to_captions.mjs build/transcripts/clipC.whisper.json
import fs from 'node:fs';

const inPath = process.argv[2];
const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const segs = data.transcription || [];

const EMP = /^(everything|falls|rises|leadership|darkness|light|leader|deciding|genius|kings|change|king|wisdom|gifts|change|transform)$/i;

let words = [];
for (const s of segs) {
  const w = (s.text || '').trim();
  if (!w) continue;
  if (/^(um|uh|umm|err)[,.]?$/i.test(w)) continue;
  // whisper.cpp offsets are in milliseconds
  const start = +(s.offsets.from / 1000).toFixed(2);
  const end = +(s.offsets.to / 1000).toFixed(2);
  words.push({ w, start, end: Math.max(end, start + 0.1), emp: EMP.test(w.replace(/[^a-zA-Z]/g, '')) });
}

fs.writeFileSync('remotion-video-studio/src/captions.json', JSON.stringify({ words }));
console.log('words:', words.length, '| span', words[0]?.start, '->', words.at(-1)?.end);
console.log('emphasized:', words.filter(w => w.emp).map(w => w.w).join(' '));
