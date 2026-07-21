import { Composition } from "remotion";
import { LongForm, longFormSchema } from "./LongForm";
import jun22 from "./scenes/jun22.json";
import fih from "./scenes/fih_jun22.json";
import fih23 from "./scenes/fih_jun23.json";
import fih24 from "./scenes/fih_jun24.json";
import fih25 from "./scenes/fih_jun25.json";
import fih26 from "./scenes/fih_jun26.json";
import fih29 from "./scenes/fih_jun29.json";
import fih30 from "./scenes/fih_jun30.json";
import sol1 from "./scenes/sol_e1.json";
import sol2 from "./scenes/sol_e2.json";
import w2e1 from "./scenes/w2e1_jul6.json";
import w2e2 from "./scenes/w2e2_jul7.json";
import w2e3 from "./scenes/w2e3_jul8.json";
import w2e4 from "./scenes/w2e4_jul9.json";
import w2e5 from "./scenes/w2e5_jul10.json";
import jul3 from "./scenes/jul3.json";
import jul13 from "./scenes/jul13.json";
import jul15 from "./scenes/jul15.json";
import jul16 from "./scenes/jul16.json";
import jul17 from "./scenes/jul17.json";
import jul14 from "./scenes/jul14.json";
import jul14caps from "./captions/jul14.json";
import jul16caps from "./captions/jul16.json";
import jul17caps from "./captions/jul17.json";
import w4e1 from "./scenes/w4e1.json";
import w4e2 from "./scenes/w4e2.json";
import w4e3 from "./scenes/w4e3.json";
import w4e4 from "./scenes/w4e4.json";
import w4e5 from "./scenes/w4e5.json";
import w4e1caps from "./captions/w4e1.json";
import w4e2caps from "./captions/w4e2.json";
import w4e3caps from "./captions/w4e3.json";
import w4e4caps from "./captions/w4e4.json";
import w4e5caps from "./captions/w4e5.json";
import jul3caps from "./captions/jul3.json";
import { Thumbnail, thumbSchema } from "./Thumbnail";
import { PixarIntro, pixarSchema, CTA_TAIL_SEC } from "./PixarIntro";
import pixarIntro from "./scenes/pixar_intro.json";
import pixarIntroShort from "./scenes/pixar_intro_short.json";
import pixarHook from "./scenes/pixar_hook.json";
import { Depth3D } from "./Depth3D";
import { AbsoluteFill } from "remotion";

const FPS = 30;
const PIX_FPS = 60; // FINAL master at 60fps (long + hook — standalone)
const SHORT_FPS = 30; // the short is an intro to a main video → 30fps, no slider

const THUMBS = [
  { id: "ThumbE1", bg: "thumbbg_e1.png", title: "The question Jesus asked first", word: "Ask This First" },
  { id: "ThumbE2", bg: "thumbbg_e2.png", title: "Why your prayers don't work yet", word: "Care First" },
  { id: "ThumbE3", bg: "thumbbg_e3.png", title: "The prayer that heals the sick", word: "Just 2 Words" },
  { id: "ThumbE4", bg: "thumbbg_e4.png", title: "Instantly… or gradually?", word: "Instant?" },
  { id: "ThumbE5", bg: "thumbbg_e5.png", title: "What if every hospital closed?", word: "Refuse The Credit" },
];

// Scenes (timing / titles / points / refs / teasers / openLoop) live in
// src/scenes/*.json — live-reloads in Studio.
export const RemotionRoot: React.FC = () => {
  const oldEnd = jun22.scenes[jun22.scenes.length - 1].end;
  const fihDur = (fih as any).videoSeconds ?? fih.scenes[fih.scenes.length - 1].end;
  const fih23Dur = (fih23 as any).videoSeconds ?? fih23.scenes[fih23.scenes.length - 1].end;
  const fih24Dur = (fih24 as any).videoSeconds ?? fih24.scenes[fih24.scenes.length - 1].end;
  const fih25Dur = (fih25 as any).videoSeconds ?? fih25.scenes[fih25.scenes.length - 1].end;
  const fih26Dur = (fih26 as any).videoSeconds ?? fih26.scenes[fih26.scenes.length - 1].end;
  const fih29Dur = (fih29 as any).videoSeconds ?? fih29.scenes[fih29.scenes.length - 1].end;
  const fih30Dur = (fih30 as any).videoSeconds ?? fih30.scenes[fih30.scenes.length - 1].end;
  const sol1Dur = (sol1 as any).videoSeconds ?? sol1.scenes[sol1.scenes.length - 1].end;
  const sol2Dur = (sol2 as any).videoSeconds ?? sol2.scenes[sol2.scenes.length - 1].end;
  const w2e1Dur = (w2e1 as any).videoSeconds ?? w2e1.scenes[w2e1.scenes.length - 1].end;
  const w2e2Dur = (w2e2 as any).videoSeconds ?? w2e2.scenes[w2e2.scenes.length - 1].end;
  const w2e3Dur = (w2e3 as any).videoSeconds ?? w2e3.scenes[w2e3.scenes.length - 1].end;
  const w2e4Dur = (w2e4 as any).videoSeconds ?? w2e4.scenes[w2e4.scenes.length - 1].end;
  const w2e5Dur = (w2e5 as any).videoSeconds ?? w2e5.scenes[w2e5.scenes.length - 1].end;
  const jul3Dur = (jul3 as any).videoSeconds ?? jul3.scenes[jul3.scenes.length - 1].end;
  const jul14Dur = (jul14 as any).videoSeconds ?? jul14.scenes[jul14.scenes.length - 1].end;
  const jul13Dur = (jul13 as any).videoSeconds ?? jul13.scenes[jul13.scenes.length - 1].end;
  const jul15Dur = (jul15 as any).videoSeconds ?? jul15.scenes[jul15.scenes.length - 1].end;
  const jul16Dur = (jul16 as any).videoSeconds ?? jul16.scenes[jul16.scenes.length - 1].end;
  const jul17Dur = (jul17 as any).videoSeconds ?? jul17.scenes[jul17.scenes.length - 1].end;
  const w4e1Dur = (w4e1 as any).videoSeconds ?? w4e1.scenes[w4e1.scenes.length - 1].end;
  const w4e2Dur = (w4e2 as any).videoSeconds ?? w4e2.scenes[w4e2.scenes.length - 1].end;
  const w4e3Dur = (w4e3 as any).videoSeconds ?? w4e3.scenes[w4e3.scenes.length - 1].end;
  const w4e4Dur = (w4e4 as any).videoSeconds ?? w4e4.scenes[w4e4.scenes.length - 1].end;
  const w4e5Dur = (w4e5 as any).videoSeconds ?? w4e5.scenes[w4e5.scenes.length - 1].end;
  return (
    <>
      <Composition
        id="W4E1Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(w4e1Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...w4e1, captions: w4e1caps.words } as any}
      />
      <Composition
        id="W4E2Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(w4e2Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...w4e2, captions: w4e2caps.words } as any}
      />
      <Composition
        id="W4E3Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(w4e3Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...w4e3, captions: w4e3caps.words } as any}
      />
      <Composition
        id="W4E4Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(w4e4Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...w4e4, captions: w4e4caps.words } as any}
      />
      <Composition
        id="W4E5Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(w4e5Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...w4e5, captions: w4e5caps.words } as any}
      />
      <Composition
        id="Jul16Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(jul16Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...jul16, captions: jul16caps.words } as any}
      />
      <Composition
        id="Jul17Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(jul17Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...jul17, captions: jul17caps.words } as any}
      />
      <Composition
        id="Jul15Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(jul15Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...jul15 } as any}
      />
      <Composition
        id="Jul13Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(jul13Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...jul13 } as any}
      />
      <Composition
        id="Jul14Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(jul14Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...jul14, captions: jul14caps.words } as any}
      />
      <Composition
        id="Jul3Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(jul3Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...jul3, captions: jul3caps.words } as any}
      />
      <Composition
        id="Jun22Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(oldEnd * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...jun22 } as any}
      />
      <Composition
        id="FIHJun22Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(fihDur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...fih } as any}
      />
      <Composition
        id="FIHJun23Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(fih23Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...fih23 } as any}
      />
      <Composition
        id="FIHJun24Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(fih24Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...fih24 } as any}
      />
      <Composition
        id="FIHJun25Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(fih25Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...fih25 } as any}
      />
      <Composition
        id="FIHJun26Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(fih26Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...fih26 } as any}
      />
      <Composition
        id="FIHJun29Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(fih29Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...fih29 } as any}
      />
      <Composition
        id="FIHJun30Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(fih30Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...fih30 } as any}
      />
      <Composition
        id="SoLE1Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(sol1Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...sol1 } as any}
      />
      <Composition
        id="SoLE2Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(sol2Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...sol2 } as any}
      />
      <Composition
        id="W2E1Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(w2e1Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...w2e1 } as any}
      />
      <Composition
        id="W2E2Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(w2e2Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...w2e2 } as any}
      />
      <Composition
        id="W2E3Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(w2e3Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...w2e3 } as any}
      />
      <Composition
        id="W2E4Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(w2e4Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...w2e4 } as any}
      />
      <Composition
        id="W2E5Long"
        component={LongForm}
        schema={longFormSchema}
        durationInFrames={Math.round(w2e5Dur * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...w2e5 } as any}
      />
      <Composition
        id="PixarIntro16x9"
        component={PixarIntro}
        schema={pixarSchema}
        durationInFrames={Math.round((((pixarIntro.beats[pixarIntro.beats.length - 1]?.end ?? 99)) + CTA_TAIL_SEC) * PIX_FPS)}
        fps={PIX_FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...pixarIntro } as any}
      />
      <Composition
        id="PixarIntro9x16"
        component={PixarIntro}
        schema={pixarSchema}
        durationInFrames={Math.round((((pixarIntro.beats[pixarIntro.beats.length - 1]?.end ?? 99)) + CTA_TAIL_SEC) * PIX_FPS)}
        fps={PIX_FPS}
        width={1080}
        height={1920}
        defaultProps={{ ...pixarIntro } as any}
      />
      <Composition
        id="PixarIntroShort16x9"
        component={PixarIntro}
        schema={pixarSchema}
        durationInFrames={Math.round((((pixarIntroShort.beats[pixarIntroShort.beats.length - 1]?.end ?? 84)) + ((pixarIntroShort as any).tail ?? CTA_TAIL_SEC)) * SHORT_FPS)}
        fps={SHORT_FPS}
        width={1920}
        height={1080}
        defaultProps={{ ...pixarIntroShort } as any}
      />
      <Composition
        id="PixarIntroShort9x16"
        component={PixarIntro}
        schema={pixarSchema}
        durationInFrames={Math.round((((pixarIntroShort.beats[pixarIntroShort.beats.length - 1]?.end ?? 84)) + ((pixarIntroShort as any).tail ?? CTA_TAIL_SEC)) * SHORT_FPS)}
        fps={SHORT_FPS}
        width={1080}
        height={1920}
        defaultProps={{ ...pixarIntroShort } as any}
      />
      <Composition
        id="PixarHook9x16"
        component={PixarIntro}
        schema={pixarSchema}
        durationInFrames={Math.round((((pixarHook.beats[pixarHook.beats.length - 1]?.end ?? 16)) + CTA_TAIL_SEC) * PIX_FPS)}
        fps={PIX_FPS}
        width={1080}
        height={1920}
        defaultProps={{ ...pixarHook } as any}
      />
      <Composition
        id="Depth3DTest"
        component={() => (
          <AbsoluteFill style={{ backgroundColor: "#000" }}>
            <Depth3D src="thumbbg_e1.png" depth="thumbbg_e1_depth.png" motion="dolly-left" intensity={1} width={1920} height={1080} />
          </AbsoluteFill>
        )}
        durationInFrames={60}
        fps={FPS}
        width={1920}
        height={1080}
      />
      {THUMBS.map((t) => (
        <Composition
          key={t.id}
          id={t.id}
          component={Thumbnail}
          schema={thumbSchema}
          durationInFrames={1}
          fps={FPS}
          width={1280}
          height={720}
          defaultProps={{ bg: t.bg, title: t.title, word: t.word }}
        />
      ))}
    </>
  );
};
