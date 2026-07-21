// Render a single HyperFrames b-roll INSERT CARD to MP4.
// Usage: node build/hf_card.mjs '<title>' '<sub>' '<emoji>' <dur> <outName>
// Writes hf/index.html from a template, runs `npm run render`, copies newest
// render to remotion-video-studio/public/<outName>.mp4
import fs from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const [title, sub = "", emoji = "", durA = "5", outName] = process.argv.slice(2);
const dur = +durA;
const HF = path.resolve("hf");
const PUB = path.resolve("remotion-video-studio/public");

const titleSize = title.length > 30 ? 96 : title.length > 18 ? 120 : 150;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=1080, height=1920" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
  @font-face { font-family:"Poppins"; font-weight:900; src:url("assets/fonts/Poppins-900.woff2") format("woff2"); }
  @font-face { font-family:"Poppins"; font-weight:800; src:url("assets/fonts/Poppins-800.woff2") format("woff2"); }
  *{margin:0;padding:0;box-sizing:border-box;}
  html,body{width:1080px;height:1920px;overflow:hidden;background:#0C1330;font-family:"Poppins",sans-serif;}
  #bg{position:absolute;inset:0;background:radial-gradient(circle at 50% 40%, #1A2450 0%, #0C1330 78%);}
  #rays{position:absolute;width:1300px;height:1300px;top:44%;left:50%;transform:translate(-50%,-50%);
    background:repeating-conic-gradient(rgba(255,197,0,0.10) 0deg 8deg, transparent 8deg 16deg);
    border-radius:50%;-webkit-mask-image:radial-gradient(circle,#000 26%,transparent 66%);}
  #wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:80px;text-align:center;}
  #emoji{font-size:170px;margin-bottom:30px;filter:drop-shadow(0 8px 24px rgba(0,0,0,0.5));}
  #title{font-weight:900;font-size:${titleSize}px;line-height:0.98;color:#fff;text-transform:uppercase;letter-spacing:-2px;
    text-shadow:0 0 34px rgba(255,197,0,0.4),0 10px 36px rgba(0,0,0,0.6);}
  #title .word{display:inline-block;}
  #sub{font-weight:800;font-size:54px;color:#FFC500;margin-top:34px;letter-spacing:1px;
    text-shadow:0 0 22px rgba(255,197,0,0.5);}
</style></head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${dur}" data-width="1080" data-height="1920">
    <div id="bg" class="clip" data-start="0" data-duration="${dur}" data-track-index="0"></div>
    <div id="rays" class="clip" data-start="0" data-duration="${dur}" data-track-index="1"></div>
    <div id="wrap" class="clip" data-start="0" data-duration="${dur}" data-track-index="2">
      ${emoji ? `<div id="emoji">${esc(emoji)}</div>` : ""}
      <div id="title">${esc(title).split(" ").map((w) => `<span class="word">${w}</span>`).join(" ")}</div>
      ${sub ? `<div id="sub">${esc(sub)}</div>` : ""}
    </div>
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const D=${dur};
    const tl=gsap.timeline({ paused: true });
    tl.fromTo("#rays",{rotation:0},{rotation:360,duration:D,ease:"none",transformOrigin:"50% 50%"},0);
    if(document.querySelector("#emoji"))
      tl.fromTo("#emoji",{scale:0.3,opacity:0},{scale:1,opacity:1,duration:0.5,ease:"back.out(2)"},0);
    tl.fromTo("#title .word",{y:70,opacity:0,scale:0.7},{y:0,opacity:1,scale:1,stagger:0.06,duration:0.5,ease:"back.out(1.6)"},0.1);
    if(document.querySelector("#sub"))
      tl.fromTo("#sub",{y:40,opacity:0},{y:0,opacity:1,duration:0.5,ease:"power3.out"},0.4);
    // gentle ken-burns push on the whole card
    tl.fromTo("#wrap",{scale:1.0},{scale:1.04,duration:D,ease:"none"},0);
    // fade out at the end
    tl.to("#root",{opacity:0,duration:0.3,ease:"power2.in"},D-0.3);
    window.__timelines["main"]=tl;
  </script>
</body></html>`;

fs.writeFileSync(path.join(HF, "index.html"), html);
console.log(`[hf_card] wrote index.html for "${title}" (${dur}s)`);
execSync("npm run render", { cwd: HF, stdio: "inherit" });
// pick newest render
const rdir = path.join(HF, "renders");
const newest = fs.readdirSync(rdir).filter((f) => f.endsWith(".mp4"))
  .map((f) => ({ f, t: fs.statSync(path.join(rdir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)[0];
const dest = path.join(PUB, `${outName}.mp4`);
fs.copyFileSync(path.join(rdir, newest.f), dest);
console.log(`[hf_card] -> ${dest}`);
