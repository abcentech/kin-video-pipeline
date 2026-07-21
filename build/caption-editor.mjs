// Dead-simple caption editor for the shorts. No dependencies.
//   node build/caption-editor.mjs   →   open http://localhost:7788
// Pick a short, click any word to fix the text, click it again (or the ★) to
// toggle gold emphasis, then Save. It writes the caption JSON AND regenerates
// Root.tsx so Remotion Studio / renders pick up your edits immediately.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = "/Users/mac/Documents/video raw";
const CAPDIR = path.join(ROOT, "remotion-video-studio/src/captions");
const PORT = 7788;

const listCaps = () =>
  fs.readdirSync(CAPDIR).filter((f) => f.endsWith(".json") && !f.startsWith(".")).sort();

const send = (res, code, type, body) => { res.writeHead(code, { "Content-Type": type, "Access-Control-Allow-Origin": "*" }); res.end(body); };

const HTML = `<!doctype html><html><head><meta charset="utf8"><title>Caption Editor</title>
<style>
 body{font-family:-apple-system,Segoe UI,sans-serif;background:#0C1330;color:#fff;margin:0;padding:24px;}
 h1{font-size:20px;margin:0 0 16px;} a{color:#FFC500;}
 select,button{font-size:15px;padding:8px 12px;border-radius:8px;border:1px solid #333;background:#1A2450;color:#fff;}
 button{cursor:pointer;background:#FF0033;border:none;font-weight:700;}
 button.ghost{background:#1A2450;}
 #bar{display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap;}
 #status{color:#7CFC9B;font-weight:700;}
 #words{display:flex;flex-wrap:wrap;gap:8px 6px;line-height:2.4;max-width:1100px;}
 .w{position:relative;border-radius:6px;padding:2px 4px;cursor:text;outline:none;white-space:pre;}
 .w:focus{background:#23306b;}
 .w.emp{color:#FFC500;font-weight:800;}
 .hint{opacity:.6;font-size:13px;margin:10px 0;}
 kbd{background:#222;border-radius:4px;padding:1px 6px;border:1px solid #444;}
</style></head><body>
<h1>🎬 KidsInspiringNation — Caption Editor</h1>
<div id="bar">
  <select id="file"></select>
  <button class="ghost" onclick="load()">Reload</button>
  <button onclick="save()">💾 Save + rebuild</button>
  <span id="status"></span>
</div>
<div class="hint">Click a word and type to fix it. <kbd>Tab</kbd> next word. Double-click a word to toggle <b style="color:#FFC500">gold emphasis</b>. Save writes the JSON and regenerates the project — Studio reloads automatically.</div>
<div id="words"></div>
<script>
let data=null, file=null;
async function init(){
  const files=await (await fetch('/api/list')).json();
  const sel=document.getElementById('file');
  sel.innerHTML=files.map(f=>'<option>'+f+'</option>').join('');
  sel.onchange=load; load();
}
async function load(){
  file=document.getElementById('file').value;
  data=await (await fetch('/api/cap?f='+encodeURIComponent(file))).json();
  render(); setStatus('loaded '+file);
}
function render(){
  const c=document.getElementById('words'); c.innerHTML='';
  data.words.forEach((w,i)=>{
    const s=document.createElement('span');
    s.className='w'+(w.emp?' emp':''); s.contentEditable=true; s.textContent=w.w; s.dataset.i=i;
    s.oninput=()=>{ data.words[i].w=s.textContent; };
    s.ondblclick=()=>{ data.words[i].emp=!data.words[i].emp; s.classList.toggle('emp'); };
    c.appendChild(s);
  });
}
async function save(){
  setStatus('saving…');
  const r=await fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({f:file,words:data.words})});
  const j=await r.json();
  setStatus(j.ok?('✓ saved + rebuilt '+file):('error: '+j.error));
}
function setStatus(t){document.getElementById('status').textContent=t;}
init();
</script></body></html>`;

http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (u.pathname === "/") return send(res, 200, "text/html", HTML);
  if (u.pathname === "/api/list") return send(res, 200, "application/json", JSON.stringify(listCaps()));
  if (u.pathname === "/api/cap") {
    const f = path.basename(u.searchParams.get("f"));
    return send(res, 200, "application/json", fs.readFileSync(path.join(CAPDIR, f), "utf8"));
  }
  if (u.pathname === "/api/save" && req.method === "POST") {
    let body = ""; req.on("data", (d) => (body += d));
    req.on("end", () => {
      try {
        const { f, words } = JSON.parse(body);
        fs.writeFileSync(path.join(CAPDIR, path.basename(f)), JSON.stringify({ words }, null, 1));
        execSync(`node .claude/skills/video-to-short/scripts/make_root.mjs build/shorts_w4.json remotion-video-studio/src/Root.tsx`, { cwd: ROOT });
        send(res, 200, "application/json", JSON.stringify({ ok: true }));
      } catch (e) { send(res, 200, "application/json", JSON.stringify({ ok: false, error: String(e.message) })); }
    });
    return;
  }
  send(res, 404, "text/plain", "not found");
}).listen(PORT, () => console.log(`Caption editor → http://localhost:${PORT}`));
