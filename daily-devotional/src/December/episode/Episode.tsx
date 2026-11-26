/**
 * THE FATHER SHOWED UP — the long-form episode picture. Renders the whole programme from `plan.episode`:
 * sections in order (cold → title → film → body → outro), the body's camera, every cue, captions and the brand.
 * All audio is ONE file (`plan.episode.audio`, the sound engineer's mix); every video is muted. If the plan has no
 * mix yet, the videos play their own sound instead so previews are not silent.
 */
import React from "react";
import { AbsoluteFill, Audio, Sequence, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { T } from "../timing";
import type { Cue, Plan, Section } from "../types";
import { BrandLayer } from "./Brand";
import { CameraVideo } from "./CameraVideo";
import { Captions } from "./Captions";
import { ArtFull, ArtSide } from "./cues/Art";
import { Chapter } from "./cues/Chapter";
import { Ident, Subscribe, Teaser } from "./cues/LowerThirds";
import { ScriptureCard, ScripturePage } from "./cues/Scripture";
import { Keyword, Point } from "./cues/Side";
import { Declare, FilmCut, Next, Prayer, Recap, Response } from "./cues/Takeovers";
import { Door } from "./kit/Door";
import { ramp } from "./kit/ease";
import { ColdOpen, FilmSection, Outro, TitleSting } from "./Sections";
import { coverAt, hidesCaptions, isTakeover, resolveSrc } from "./util";

type Layer = "side" | "lower" | "takeover";
const layerOf = (c: Cue): Layer | null => {
  switch (c.kind) {
    case "point":
    case "keyword":
      return "side";
    case "art":
      return c.mode === "side" ? "side" : "takeover";
    case "ident":
    case "subscribe":
    case "teaser":
      return "lower";
    case "scripture":
      return c.mode === "card" ? "lower" : "takeover";
    default:
      return "takeover";
  }
};

const CueView: React.FC<{ cue: Cue; plan: Plan; day: number }> = ({ cue, plan, day }) => {
  const meta = plan.meta;
  switch (cue.kind) {
    case "ident":
      return <Ident cue={cue} meta={meta} />;
    case "chapter":
      return <Chapter cue={cue} day={day} />;
    case "scripture":
      return cue.mode === "page" ? <ScripturePage cue={cue} /> : <ScriptureCard cue={cue} />;
    case "point":
      return <Point cue={cue} />;
    case "keyword":
      return <Keyword cue={cue} />;
    case "art":
      return cue.mode === "full" ? <ArtFull cue={cue} src={resolveSrc(day, cue.src)} /> : <ArtSide cue={cue} src={resolveSrc(day, cue.src)} />;
    case "film":
      return <FilmCut cue={cue} src={resolveSrc(day, cue.src)} />;
    case "subscribe":
      return <Subscribe cue={cue} />;
    case "teaser":
      return <Teaser cue={cue} />;
    case "response":
      return <Response cue={cue} />;
    case "prayer":
      return <Prayer cue={cue} />;
    case "declare":
      return <Declare cue={cue} />;
    case "recap":
      return <Recap cue={cue} day={day} />;
    case "next":
      return <Next cue={cue} meta={meta} />;
  }
};

const Cues: React.FC<{ cues: Cue[]; layer: Layer; plan: Plan; day: number }> = ({ cues, layer, plan, day }) => (
  <>
    {cues
      .filter((c) => layerOf(c) === layer)
      .map((c) => (
        <Sequence key={c.id} from={c.from} durationInFrames={Math.max(1, c.dur)} name={`${c.kind} ${c.id}`}>
          <CueView cue={c} plan={plan} day={day} />
        </Sequence>
      ))}
  </>
);

const Body: React.FC<{ plan: Plan; day: number; audible: boolean; afterBlack: boolean }> = ({ plan, day, audible, afterBlack }) => {
  const f = useCurrentFrame();
  const ep = plan.episode;
  const cues = ep.cues;
  const progress = Math.min(1, (f + ep.bodyAt) / ep.durationInFrames);
  // brand fades under takeovers (chapter included: its chip lands as the dial returns)
  const under = coverAt(cues, f, isTakeover, 4, 3);
  // the logo keeps its plate wherever the recorded wall is behind it: only a takeover that covers the picture drops it
  // (the prayer is a takeover, but the picture stays up)
  const page = coverAt(cues, f, (c) => isTakeover(c) && c.kind !== "prayer", 4, 3);
  const hide = coverAt(cues, f, hidesCaptions, 8, 6);
  const bodyOpen = afterBlack ? ramp(f, 0, T.DOOR_IN) : 1;
  // under a scripture page he is a presence, not a distraction: soften the picture while the page is up
  const pageBlur = 12 * coverAt(cues, f, (c) => c.kind === "scripture" && c.mode === "page", 12, 10);
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Door open={bodyOpen} solid>
        <AbsoluteFill>
          <Sequence durationInFrames={ep.bodyFrames} name="body video">
            <CameraVideo src={resolveSrc(day, "body.mp4")} cam={ep.cam} face={plan.face} muted={!audible} blur={pageBlur} />
          </Sequence>
          <Cues cues={cues} layer="side" plan={plan} day={day} />
          <Cues cues={cues} layer="lower" plan={plan} day={day} />
          <Cues cues={cues} layer="takeover" plan={plan} day={day} />
          <Captions pages={ep.captions} hide={hide} />
          <BrandLayer meta={plan.meta} cues={cues} f={f} progress={progress} under={under} page={page} open={ramp(f, T.DOOR_IN, T.DOOR_IN + 12)} />
        </AbsoluteFill>
      </Door>
    </AbsoluteFill>
  );
};

const SectionView: React.FC<{ sec: Section; prev?: Section; plan: Plan; day: number; audible: boolean }> = ({ sec, prev, plan, day, audible }) => {
  switch (sec.kind) {
    case "cold":
      return <ColdOpen sec={sec} plan={plan} src={resolveSrc(day, "body.mp4")} audible={audible} />;
    case "title":
      return <TitleSting sec={sec} meta={plan.meta} />;
    case "film":
      return <FilmSection sec={sec} src={resolveSrc(day, sec.src)} audible={audible} />;
    case "body":
      return <Body plan={plan} day={day} audible={audible} afterBlack={!!prev && prev.kind !== "cold"} />;
    case "outro":
      return <Outro src={resolveSrc(day, sec.src)} audible={audible} />;
  }
};

export const Episode: React.FC<{ day: number; plan?: Plan }> = ({ day, plan }) => {
  if (!plan) return <AbsoluteFill style={{ background: C.ink }} />;
  const ep = plan.episode;
  const audible = !ep.audio;
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      {ep.sections.map((sec, i) => (
        <Sequence key={`${sec.kind}-${i}`} from={sec.from} durationInFrames={Math.max(1, sec.dur)} name={sec.kind}>
          <SectionView sec={sec} prev={ep.sections[i - 1]} plan={plan} day={day} audible={audible} />
        </Sequence>
      ))}
      {ep.audio ? <Audio src={resolveSrc(day, ep.audio)} /> : null}
    </AbsoluteFill>
  );
};
