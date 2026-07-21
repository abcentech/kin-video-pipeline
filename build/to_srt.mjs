import fs from "node:fs";
// to_srt.mjs <caps.json> <out.srt>  (groups ~4 words per cue)
const [src,out]=process.argv.slice(2);
const {words}=JSON.parse(fs.readFileSync(src,"utf8"));
const f=s=>{const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=Math.floor(s%60),ms=Math.round((s-Math.floor(s))*1000);return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(x).padStart(2,"0")},${String(ms).padStart(3,"0")}`};
let cues=[],cur=[];
for(const w of words){cur.push(w); if(cur.length>=4||/[.!?]$/.test(w.w)){cues.push(cur);cur=[];}}
if(cur.length)cues.push(cur);
let o="";
cues.forEach((c,i)=>{o+=`${i+1}\n${f(c[0].start)} --> ${f(c[c.length-1].end)}\n${c.map(x=>x.w).join(" ")}\n\n`;});
fs.writeFileSync(out,o);
console.log(`${out}: ${cues.length} cues`);
