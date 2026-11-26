// THE FATHER SHOWED UP — the day trailer (16:9 and 9:16, one timeline). Renders plan.trailer[format]:
// cold → title → tension (+ film shots) → verse → turn → button → end. All sound is PromoPlan.audio
// (the sound engineer's mix); every video is muted. When that file is missing (fixtures) the beats
// fall back to their own sound (matte clips carry the body range's audio).
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";
import type { DayProps } from "../load";
import type { Plan, PromoPlan } from "../types";
import { Captions } from "./Captions";
import { LineScene } from "./LineScene";
import { Finish } from "./Page";
import { EndScene, FilmScene, TitleScene, VerseScene } from "./Takeovers";
import { useFontsReady } from "./text";

export type TrailerProps = DayProps & { format: "16x9" | "9x16"; /** set by calculateMetadata: false = PromoPlan.audio is missing */ hasAudio?: boolean };

/** Beats of a promo piece, each in its own Sequence, sized w×h. Shared by the trailer and the shorts. */
export const Beats: React.FC<{ plan: Plan; promo: PromoPlan; w: number; h: number; withSound: boolean; endVariant: "trailer" | "short"; only?: (kind: string) => boolean }> = ({
  plan,
  promo,
  w,
  h,
  withSound,
  endVariant,
  only = () => true,
}) => (
  <>
    {promo.beats.filter((b) => only(b.kind)).map((b, i) => {
      let el: React.ReactNode = null;
      if (b.kind === "line")
        el = (
          <>
            <LineScene b={b} plan={plan} w={w} h={h} />
            {withSound ? <Audio src={staticFile(b.clip)} trimBefore={b.clipFrom} /> : null}
          </>
        );
      else if (b.kind === "title") el = <TitleScene meta={plan.meta} w={w} h={h} dur={b.dur} />;
      else if (b.kind === "film") el = <FilmScene b={b} w={w} h={h} withSound={withSound} />;
      else if (b.kind === "verse") el = <VerseScene b={b} meta={plan.meta} plan={plan} w={w} h={h} withSound={withSound} />;
      else el = <EndScene meta={plan.meta} w={w} h={h} dur={b.dur} variant={endVariant} />;
      return (
        <Sequence key={i} from={b.from} durationInFrames={b.dur} premountFor={12} name={`${b.kind}${b.kind === "line" ? ` ${b.mood}` : ""}`}>
          <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, overflow: "hidden" }}>{el}</div>
        </Sequence>
      );
    })}
  </>
);

export const lineWindows = (promo: PromoPlan): [number, number][] => promo.beats.filter((b) => b.kind === "line").map((b) => [b.from, b.from + b.dur]);

export const Trailer: React.FC<TrailerProps> = ({ plan, format, hasAudio }) => {
  const ok = useFontsReady();
  const f = useCurrentFrame();
  const { width: w, height: h } = useVideoConfig();
  if (!plan || !ok) return <AbsoluteFill style={{ backgroundColor: C.ink }} />;
  const promo = plan.trailer[format];
  const withSound = hasAudio === false || !promo.audio;
  return (
    <AbsoluteFill style={{ backgroundColor: C.ink }}>
      <Beats plan={plan} promo={promo} w={w} h={h} withSound={withSound} endVariant="trailer" />
      <Captions pages={promo.captions} style={format} show={lineWindows(promo)} />
      <Finish f={f} w={w} h={h} />
      {withSound ? null : <Audio src={staticFile(promo.audio)} />}
    </AbsoluteFill>
  );
};
