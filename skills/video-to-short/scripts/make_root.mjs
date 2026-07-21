// Generate Root.tsx for the Remotion project from a shorts config.
// Usage: node make_root.mjs <shorts.json> <outRootTsx>
// shorts.json: {
//   "handle": "@YourChannel", "intro": 3.4, "closing": 4.43,
//   "channels": [ { "glyph":"▶️","label":"YouTube","color":"#FF0033" }, ... ],
//   "shorts": [ { "id":"Short1", "video":"cine_s1.mp4", "music":"music_s1.mp3",
//                 "clip":69, "captions":"short1.json", "hook":"...",
//                 "inserts":[ {start,end,title,sub?,emoji?,video?} ] }, ... ]
// }
// Emits an explicit <Composition> per short with a zod `schema` and INLINE
// literal defaultProps (words inlined from the caption JSON). This is what lets
// Remotion Studio render an editable caption form AND persist edits via "Save".
import fs from "node:fs";
import path from "node:path";

const [cfgPath, outPath] = process.argv.slice(2);
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const intro = cfg.intro ?? 3.4;
const closing = cfg.closing ?? 4.43;
const handle = cfg.handle ?? "@KidsInspiringNation";
// Default to the real platform icons on file (public/icons/*.svg) — never emoji.
const channels = cfg.channels ?? [
  { icon: "icons/youtube.svg", label: "YouTube", color: "#FF0033" },
  { icon: "icons/instagram.svg", label: "Instagram", color: "#E1306C" },
  { icon: "icons/telegram.svg", label: "Telegram", color: "#229ED9" },
  { icon: "icons/facebook.svg", label: "Facebook", color: "#1877F2" },
  { icon: "icons/web.svg", label: "KidsInspiringNation.org", color: "#FFC500" },
];
const capDir = path.join(path.dirname(outPath), "captions");

const comps = cfg.shorts
  .map((s) => {
    const words = JSON.parse(fs.readFileSync(path.join(capDir, s.captions), "utf8")).words;
    const clip = s.clip;
    const defaultProps = {
      video: s.video,
      music: s.music,
      closing: "closing_9x16.mp4",
      words,
      handle,
      hook: s.hook ?? "",
      reHook: s.reHook ?? "",
      payoffSec: s.payoffSec ?? null,
      channels,
      inserts: s.inserts ?? [],
      capY: s.capY ?? null,
      introSeconds: intro,
      clipSeconds: clip,
      closingSeconds: closing,
    };
    return `      <Composition
        id=${JSON.stringify(s.id)}
        component={Short}
        schema={shortSchema}
        durationInFrames={Math.round((${intro} + ${clip} + ${closing}) * FPS)}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={${JSON.stringify(defaultProps)}}
      />`;
  })
  .join("\n");

const out = `import { Composition } from "remotion";
import { Short, shortSchema } from "./Short";

const FPS = 30;

// Captions are editable directly in Remotion Studio: select a composition, open
// the right-hand "Props" panel, expand "words", edit any \`w\` (text) or toggle
// \`emp\`, then click "Save" — it writes your edits back into this file.
export const RemotionRoot: React.FC = () => {
  return (
    <>
${comps}
    </>
  );
};
`;
fs.writeFileSync(outPath, out);
console.log(`wrote ${outPath} with ${cfg.shorts.length} composition(s), inline editable props`);
