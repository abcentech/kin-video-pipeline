// Bundle once, render several Jul3Long stills for Gate A review.
import { bundle } from "@remotion/bundler";
import { selectComposition, renderStill } from "@remotion/renderer";
import path from "node:path";

const OUT = "/private/tmp/claude-501/-Users-mac-Documents-video-raw/4b6fe20f-6551-423a-b4f1-d7309cd32d91/scratchpad";
const frames = { ps92full: 3810, mnd: 870, generationsfull: 5220, titlefull: 150, caption: 7200 };

const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const comp = await selectComposition({ serveUrl, id: "Jul3Long" });
for (const [name, frame] of Object.entries(frames)) {
  await renderStill({ serveUrl, composition: comp, output: `${OUT}/jl_${name}.png`, frame, imageFormat: "png", timeoutInMilliseconds: 120000 });
  console.log(`rendered ${name} @ frame ${frame}`);
}
console.log("STILLS DONE");
