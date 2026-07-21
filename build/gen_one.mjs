const KEY=process.env.GKEY;
const prompt=process.argv[2], out=process.argv[3];
const body={contents:[{parts:[{text:prompt}]}]};
const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${KEY}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
const j=await r.json();
if(!r.ok){console.log("ERR",r.status,JSON.stringify(j).slice(0,300));process.exit(1);}
const parts=j.candidates?.[0]?.content?.parts||[];
const img=parts.find(p=>p.inlineData);
if(!img){console.log("no image; parts:",JSON.stringify(parts).slice(0,200));process.exit(1);}
const fs=await import("node:fs");
fs.writeFileSync(out,Buffer.from(img.inlineData.data,"base64"));
console.log("wrote",out,(fs.statSync(out).size/1024).toFixed(0)+"KB");
