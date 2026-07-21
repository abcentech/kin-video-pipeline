const fs = require('fs');

const srtPath = '/Users/mac/Documents/video raw/Jun 22-26/FIH_W4E1_Jun22.srt';
const srtData = fs.readFileSync(srtPath, 'utf8');

function parseTime(str) {
  const [h,m,s] = str.split(':');
  const [sec, ms] = s.split(',');
  return parseInt(h)*3600 + parseInt(m)*60 + parseInt(sec) + parseInt(ms)/1000;
}

const blocks = srtData.split('\n\n').map(b => b.trim()).filter(b => b);
const words = [];

const targetStart = process.argv[2] ? parseFloat(process.argv[2]) : 0;
const targetEnd = process.argv[3] ? parseFloat(process.argv[3]) : 9999;
const outPath = process.argv[4];

for (const block of blocks) {
  const lines = block.split('\n');
  if (lines.length >= 3) {
    const times = lines[1].split(' --> ');
    const tStart = parseTime(times[0]);
    const tEnd = parseTime(times[1]);
    
    if (tEnd < targetStart || tStart > targetEnd) continue;
    
    const text = lines.slice(2).join(' ').trim();
    const tokens = text.split(/\s+/);
    
    const dur = tEnd - tStart;
    const durPerWord = dur / tokens.length;
    
    for (let i=0; i<tokens.length; i++) {
        let w = tokens[i].replace(/[^a-zA-Z0-9']/g, '');
        if (!w) continue;
        
        let startRel = (tStart - targetStart) + i * durPerWord;
        let endRel = startRel + durPerWord;
        if (startRel < 0) startRel = 0;
        
        words.push({
            w: w.toLowerCase(),
            start: parseFloat(startRel.toFixed(2)),
            end: parseFloat(endRel.toFixed(2)),
            emp: w.length > 5 || ["jesus", "receive", "need", "pains", "heals"].includes(w.toLowerCase())
        });
    }
  }
}

fs.writeFileSync(outPath, JSON.stringify({ words }, null, 2));
console.log(`Wrote ${words.length} words to ${outPath}`);
