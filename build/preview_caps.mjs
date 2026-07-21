import fs from "node:fs";
const f=process.argv[2];
const {words}=JSON.parse(fs.readFileSync(f,"utf8"));
const fmt=s=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`;
let line=[],lstart=null,last=0;
const flush=()=>{if(line.length){console.log(`[${fmt(lstart)}] ${line.join(" ")}`);line=[];lstart=null;}};
for(const w of words){
  if(lstart===null)lstart=w.start;
  line.push(w.w);last=w.end;
  if((/[.!?]$/.test(w.w)&&line.length>=8)||line.length>=14)flush();
}
flush();
