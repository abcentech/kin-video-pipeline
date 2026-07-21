// Generate a HyperFrames composition (hf/index.html) for one short:
// cinematic video + push-in + emphasis punches, big kinetic caption takeover,
// recurring animated Subscribe overlay, voice + cinematic music, KIN closing.
// Usage: node build/make_hf.mjs <whisperJson> <videoAsset> <voiceAsset> <musicAsset> <clipSeconds>
import fs from "node:fs";

const [wj, videoAsset, voiceAsset, musicAsset, clipStr] = process.argv.slice(2);
const CLIP = +clipStr;
const CLOSING = 4.43;
const TOTAL = +(CLIP + CLOSING).toFixed(2);

const EMP = /^(hospital|hospitals|closed|no|never|medicine|surgeries|pharmacies|survive|sickness|disease|diseases|defeated|power|greater|deeper|stronger|diagnosis|faith|name|jesus|healed|healing|touch|touched|whole|wholeness|miracle|growth|disappeared|skin|fever|fresh|God|doctor|doctors|walked|suddenly|answer|cleansed|perfume|fragrance|everlasting|alive)$/i;

const data = JSON.parse(fs.readFileSync(wj, "utf8"));
let words = [];
for (const s of data.transcription || []) {
  const w = (s.text || "").trim();
  if (!w || /^\[.*\]$/.test(w) || /^(um|uh|umm|err)[,.]?$/i.test(w)) continue;
  words.push({ w, start: s.offsets.from / 1000, end: s.offsets.to / 1000, emp: EMP.test(w.replace(/[^a-zA-Z]/g, "")) });
}
const pages = [];
let cur = [];
for (const w of words) {
  cur.push(w);
  if (cur.length >= 3 || /[.!?]$/.test(w.w)) { pages.push(cur); cur = []; }
}
if (cur.length) pages.push(cur);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let capHtml = "", tweens = "";
pages.forEach((pg, i) => {
  const start = +pg[0].start.toFixed(2);
  const end = +pg[pg.length - 1].end.toFixed(2);
  const nextStart = i + 1 < pages.length ? pages[i + 1][0].start : CLIP;
  const dur = +(Math.max(0.4, Math.min(nextStart - start - 0.03, end - start + 1.2))).toFixed(2);
  const inner = pg.map((w) => `<span class="${w.emp ? "emp" : ""}">${esc(w.w)}</span>`).join(" ");
  capHtml += `      <div id="cap${i}" class="clip cap" data-start="${start}" data-duration="${dur}" data-track-index="5">${inner}</div>\n`;
  tweens += `  tl.fromTo("#cap${i}", { scale: 0.4, opacity: 0, y: 60 }, { scale: 1, opacity: 1, y: 0, duration: 0.32, ease: "back.out(2)" }, ${start});\n`;
});

// emphasis punch zooms on the video
let punchTweens = "";
for (const w of words) {
  if (!w.emp) continue;
  const s = +w.start.toFixed(2);
  punchTweens += `  tl.to("#vid", { scale: 1.05, duration: 0.12, ease: "power2.out" }, ${s}).to("#vid", { scale: 1.0, duration: 0.4, ease: "power2.inOut" }, ${(s + 0.12).toFixed(2)});\n`;
}

// recurring Subscribe overlay instances (non-overlapping, track 7)
let subHtml = "", subTweens = "";
const SUBDUR = 5.5;
const subTimes = [];
for (let t = 7; t + SUBDUR < CLIP - 3; t += 24) subTimes.push(+t.toFixed(2));
subTimes.forEach((t, i) => {
  subHtml += `      <div id="sub${i}" class="clip sub" data-start="${t}" data-duration="${SUBDUR}" data-track-index="7">
        <span class="subbtn">▶ SUBSCRIBE</span><span class="subhandle">@KidsInspiringNation</span>
      </div>\n`;
  subTweens += `  tl.fromTo("#sub${i}", { y: 180, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "back.out(1.7)" }, ${t});\n`;
  subTweens += `  tl.to("#sub${i} .subbtn", { scale: 1.08, duration: 0.5, yoyo: true, repeat: 8, ease: "sine.inOut" }, ${t});\n`;
  subTweens += `  tl.to("#sub${i}", { y: 180, opacity: 0, duration: 0.4, ease: "power2.in" }, ${(t + SUBDUR - 0.4).toFixed(2)});\n`;
});

const repeatSweep = Math.max(0, Math.floor(CLIP / 6));

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      @font-face { font-family: "Poppins"; font-weight: 800; src: url("assets/fonts/Poppins-800.woff2") format("woff2"); }
      @font-face { font-family: "Poppins"; font-weight: 900; src: url("assets/fonts/Poppins-900.woff2") format("woff2"); }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: #000; font-family: "Poppins", sans-serif; }
      #vidwrap { position: absolute; inset: 0; overflow: hidden; transform-origin: 50% 45%; }
      #vid { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform-origin: 50% 45%; }
      #grade { position: absolute; inset: 0; background:
        radial-gradient(circle at 50% 40%, transparent 38%, rgba(0,0,0,0.55) 100%),
        linear-gradient(to top, rgba(8,10,24,0.96) 0%, rgba(8,10,24,0.82) 14%, rgba(8,10,24,0.25) 28%, rgba(0,0,0,0) 40%); }
      #sweep { position: absolute; top: 0; left: -40%; width: 40%; height: 100%;
        background: linear-gradient(100deg, transparent, rgba(255,255,255,0.06), transparent); }
      .cap { position: absolute; left: 50px; right: 50px; bottom: 430px; text-align: center;
        font-weight: 900; font-size: 110px; line-height: 0.98; color: #fff; text-transform: uppercase; letter-spacing: -2px;
        text-shadow: 6px 6px 0 #000, -4px -4px 0 #000, 4px -4px 0 #000, -4px 4px 0 #000, 0 10px 26px rgba(0,0,0,0.8); }
      .cap .emp { color: #FFC500; font-size: 134px;
        text-shadow: 0 0 28px rgba(255,197,0,0.8), 6px 6px 0 #000, -4px -4px 0 #000, 4px -4px 0 #000, -4px 4px 0 #000; }
      #wm { position: absolute; top: 54px; right: 40px; display: flex; align-items: center; gap: 12px;
        background: rgba(12,19,48,0.55); padding: 10px 18px 10px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12); }
      #wm img { width: 50px; height: 50px; } #wm span { font-weight: 800; font-size: 24px; color: #fff; }
      #bar { position: absolute; top: 0; left: 0; height: 10px; background: linear-gradient(90deg,#FFC500,#FF0033); box-shadow: 0 0 12px #FFC500; }
      .sub { position: absolute; bottom: 200px; left: 0; right: 0; display: flex; justify-content: center; align-items: center; gap: 20px; }
      .sub .subbtn { background:#FF0033; color:#fff; font-weight:800; font-size:42px; padding:18px 38px; border-radius:999px; display:inline-block; box-shadow:0 8px 28px rgba(255,0,51,0.6); }
      .sub .subhandle { font-weight:800; font-size:46px; color:#FFC500; text-shadow:0 0 20px rgba(255,197,0,0.6), 3px 3px 0 #000; }
      #closing { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background:#0a0a0a; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="1080" data-height="1920">
      <div id="vidwrap">
        <video id="vid" class="clip" data-start="0" data-duration="${CLIP}" data-track-index="0" muted src="assets/${videoAsset}"></video>
      </div>
      <div id="grade" class="clip" data-start="0" data-duration="${CLIP}" data-track-index="1"></div>
      <div id="sweep" class="clip" data-start="0" data-duration="${CLIP}" data-track-index="2"></div>
      <div id="bar" class="clip" data-start="0" data-duration="${CLIP}" data-track-index="3" style="width:0%"></div>
      <div id="wm" class="clip" data-start="0" data-duration="${CLIP}" data-track-index="4">
        <img src="assets/logoIcon.svg" /><span>@KidsInspiringNation</span>
      </div>
${capHtml}${subHtml}      <video id="closing" class="clip" data-start="${CLIP}" data-duration="${CLOSING}" data-track-index="0" muted src="assets/closing.mp4"></video>
      <audio id="voice" data-start="0" data-duration="${CLIP}" data-track-index="10" data-volume="1.0" src="assets/${voiceAsset}"></audio>
      <audio id="music" data-start="0" data-duration="${CLIP}" data-track-index="11" data-volume="0.3" src="assets/${musicAsset}"></audio>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#vidwrap", { scale: 1.0 }, { scale: 1.10, duration: ${CLIP}, ease: "none" }, 0);
      tl.fromTo("#sweep", { x: 0 }, { x: 2700, duration: 6, ease: "power1.inOut", repeat: ${repeatSweep} }, 0);
      tl.fromTo("#bar", { width: "0%" }, { width: "100%", duration: ${TOTAL}, ease: "none" }, 0);
${punchTweens}${tweens}${subTweens}      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;

fs.writeFileSync("hf/index.html", html);
console.log(`wrote hf/index.html — ${pages.length} caption pages, ${subTimes.length} subscribe pops, total ${TOTAL}s`);
