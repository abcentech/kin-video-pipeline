// Unified CLIP + CAPTION editor (transcript-based, Descript-style).
//   node build/clip-editor.mjs   →   http://localhost:7788
// For each short you see the FULL source transcript. The words inside the clip
// are bright; trim words off either end (✕) to move the video cut-point, or add
// neighbouring words (+) to extend. Click a word to fix its text, double-click
// to toggle gold emphasis. "Save" re-cuts the clip + music + captions to match
// EXACTLY the words you kept, then regenerates the project.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = "/Users/mac/Documents/video raw";
const CAPDIR = path.join(ROOT, "remotion-video-studio/src/captions");
const CUTS = path.join(ROOT, "build/cuts.tsv");
const SHORTS = path.join(ROOT, "build/shorts_all.json");
const PORT = 7788;
const send = (res, c, t, b) => { res.writeHead(c, { "Content-Type": t, "Access-Control-Allow-Origin": "*" }); res.end(b); };
const toSec = (s) => { const [m, ss] = s.trim().split(":").map(Number); return m * 60 + ss; };
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function readCuts() {
  return fs.readFileSync(CUTS, "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => { const [id, source, start, end] = l.split("\t"); return { id, source, start: toSec(start), end: toSec(end) }; });
}
function writeCuts(rows) {
  const head = "# id\tsource\tstart(mm:ss)\tend(mm:ss)\t| edited via clip-editor\n";
  fs.writeFileSync(CUTS, head + rows.map((r) => `${r.id}\t${r.source}\t${mmss(r.start)}\t${mmss(r.end)}\t|`).join("\n") + "\n");
}
const master = (src) => JSON.parse(fs.readFileSync(path.join(CAPDIR, `${src}.json`), "utf8")).words;

const HTML = `<!doctype html><html><head><meta charset="utf8"><title>Clip + Caption Editor</title>
<style>
 body{font-family:-apple-system,Segoe UI,sans-serif;background:#0C1330;color:#fff;margin:0;padding:22px;}
 h1{font-size:19px;margin:0 0 14px} #bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
 select,button{font-size:15px;padding:8px 12px;border-radius:8px;border:1px solid #333;background:#1A2450;color:#fff}
 button{cursor:pointer} button.go{background:#FF0033;border:none;font-weight:700}
 #status{color:#7CFC9B;font-weight:700;margin-left:8px}
 .hint{opacity:.65;font-size:13px;margin:8px 0 14px;max-width:1100px}
 #words{display:flex;flex-wrap:wrap;gap:6px 5px;line-height:2.6;max-width:1150px}
 .w{position:relative;border-radius:6px;padding:2px 5px;white-space:pre;color:#566;}
 .w.in{color:#E8E8F0;background:#161f44}
 .w.in[contenteditable]:focus{background:#27347a;outline:none}
 .w.emp{color:#FFC500;font-weight:800}
 .w .x,.w .plus{position:absolute;top:-12px;font-size:11px;background:#FF0033;color:#fff;border-radius:4px;padding:0 4px;cursor:pointer;display:none}
 .w .x{right:-6px} .w .plus{background:#1E9E55;left:-6px}
 .w.edge .x{display:block} .w.addable .plus{display:block}
 .meta{opacity:.7;font-size:13px;margin:6px 0}
</style></head><body>
<h1>🎬 Clip + Caption Editor — KidsInspiringNation</h1>
<div id="bar">
  <select id="short"></select>
  <button onclick="load()">Reload</button>
  <button class="go" onclick="save()">💾 Save (re-cut + rebuild)</button>
  <span id="status"></span>
</div>
<div class="hint">Bright = in the clip. <b>✕</b> on the first/last word trims it (video cut-point moves). <b>+</b> on a neighbour word extends the clip. Click any word to fix the text; double-click to toggle <b style="color:#FFC500">gold emphasis</b>. Save re-cuts the actual video to match.</div>
<div class="meta" id="meta"></div>
<div id="words"></div>
<script>
let shorts=[], cur=null, words=[], lo=0, hi=0, edits={}, emps={};
async function init(){
  shorts=await (await fetch('/api/shorts')).json();
  document.getElementById('short').innerHTML=shorts.map(s=>'<option>'+s.id+'</option>').join('');
  document.getElementById('short').onchange=load; load();
}
async function load(){
  const id=document.getElementById('short').value;
  cur=await (await fetch('/api/clip?id='+id)).json();
  words=cur.words; lo=cur.lo; hi=cur.hi; edits={}; emps={};
  cur.words.forEach((w,i)=>{ emps[i]=!!w.emp; });
  render();
}
function setMeta(){
  document.getElementById('meta').textContent=
   cur.id+'  ·  '+cur.source+'  ·  '+fmt(words[lo].start)+' → '+fmt(words[hi].end)+'  ·  '+(words[hi].end-words[lo].start).toFixed(1)+'s';
}
function fmt(s){return Math.floor(s/60)+':'+String(Math.round(s%60)).padStart(2,'0');}
function render(){
  const c=document.getElementById('words');c.innerHTML='';setMeta();
  const from=Math.max(0,lo-10),to=Math.min(words.length-1,hi+10);
  for(let i=from;i<=to;i++){
    const w=words[i];const inClip=i>=lo&&i<=hi;
    const s=document.createElement('span');
    s.className='w'+(inClip?' in':'')+(emps[i]?' emp':'')+(i===lo||i===hi?' edge':'')+((i===lo-1||i===hi+1)?' addable':'');
    s.textContent=edits[i]!==undefined?edits[i]:w.w;
    if(inClip){s.contentEditable=true;s.oninput=()=>{edits[i]=s.textContent;};s.ondblclick=(e)=>{e.preventDefault();emps[i]=!emps[i];s.classList.toggle('emp');};}
    const x=document.createElement('span');x.className='x';x.textContent='✕';x.onclick=(e)=>{e.stopPropagation();if(i===lo&&lo<hi)lo++;else if(i===hi&&hi>lo)hi--;render();};
    const p=document.createElement('span');p.className='plus';p.textContent='+';p.onclick=(e)=>{e.stopPropagation();if(i===lo-1)lo--;else if(i===hi+1)hi++;render();};
    s.appendChild(x);s.appendChild(p);c.appendChild(s);
  }
}
async function save(){
  setStatus('re-cutting + rebuilding… (≈1 min)');
  const payload={id:cur.id,source:cur.source,start:words[lo].start,end:words[hi].end,
    words:[]};
  for(let i=lo;i<=hi;i++)payload.words.push({w:(edits[i]!==undefined?edits[i]:words[i].w),start:words[i].start,end:words[i].end,emp:!!emps[i]});
  const r=await fetch('/api/saveclip',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const j=await r.json();setStatus(j.ok?('✓ saved + re-cut '+cur.id+' — now re-render it'):('error: '+j.error));
}
function setStatus(t){document.getElementById('status').textContent=t;}
init();
</script></body></html>`;

http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (u.pathname === "/") return send(res, 200, "text/html", HTML);
    if (u.pathname === "/api/shorts") return send(res, 200, "application/json", JSON.stringify(readCuts()));
    if (u.pathname === "/api/clip") {
      const id = u.searchParams.get("id");
      const row = readCuts().find((r) => r.id === id);
      const words = master(row.source);
      // find lo/hi indices spanning [start,end]
      let lo = words.findIndex((w) => w.end > row.start); if (lo < 0) lo = 0;
      let hi = words.length - 1; for (let i = lo; i < words.length; i++) { if (words[i].start >= row.end) { hi = i - 1; break; } }
      return send(res, 200, "application/json", JSON.stringify({ id, source: row.source, words, lo, hi: Math.max(lo, hi) }));
    }
    if (u.pathname === "/api/saveclip" && req.method === "POST") {
      let body = ""; req.on("data", (d) => (body += d));
      req.on("end", () => {
        try {
          const { id, source, start, end, words } = JSON.parse(body);
          const dur = +(end - start).toFixed(2);
          // re-cut clip + music + write clip caption (rebased to clip-relative)
          const cfg = JSON.parse(fs.readFileSync(SHORTS, "utf8"));
          const short = cfg.shorts.find((s) => s.id === id);
          const name = short.video.replace(/\.mp4$/, "");
          execSync(`zsh build/cinematic.sh "${ROOT}/Jun 22-26/${source}.mp4" ${start.toFixed(2)} ${dur} ${name}`, { cwd: ROOT, stdio: "ignore" });
          execSync(`zsh build/cine_music.sh ${dur} ${Math.round(dur * 0.7)} "remotion-video-studio/public/music_${name}.mp3"`, { cwd: ROOT, stdio: "ignore" });
          const rebased = words.map((w) => ({ w: w.w, start: +Math.max(0, w.start - start).toFixed(2), end: +(w.end - start).toFixed(2), emp: !!w.emp }));
          fs.writeFileSync(path.join(CAPDIR, short.captions), JSON.stringify({ words: rebased }, null, 1));
          short.clip = Math.round(dur);
          fs.writeFileSync(SHORTS, JSON.stringify(cfg, null, 2));
          // update cuts.tsv
          const rows = readCuts(); const rr = rows.find((r) => r.id === id); rr.start = start; rr.end = end; writeCuts(rows);
          execSync(`node .claude/skills/video-to-short/scripts/make_root.mjs build/shorts_all.json remotion-video-studio/src/Root.tsx`, { cwd: ROOT, stdio: "ignore" });
          send(res, 200, "application/json", JSON.stringify({ ok: true }));
        } catch (e) { send(res, 200, "application/json", JSON.stringify({ ok: false, error: String(e.message) })); }
      });
      return;
    }
    send(res, 404, "text/plain", "not found");
  } catch (e) { send(res, 500, "application/json", JSON.stringify({ ok: false, error: String(e.message) })); }
}).listen(PORT, () => console.log(`Clip+Caption editor → http://localhost:${PORT}`));
