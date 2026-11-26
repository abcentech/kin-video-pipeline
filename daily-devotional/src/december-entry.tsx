/**
 * THE FATHER SHOWED UP — episode entry (public dir: december-public).
 *   Dec-Episode    1920×1080, props { day }  — the long-form episode from dayNN/plan.json
 *   Dec-Thumbnail  1920×1080, 1 frame, props { day }
 */
import React from "react";
import { Composition, registerRoot, staticFile, type CalculateMetadataFunction } from "remotion";
import { Episode } from "./December/episode/Episode";
import { Thumbnail } from "./December/episode/Thumbnail";
import { withPlan, type DayProps } from "./December/load";

const SIZE = { width: 1920, height: 1080 };

/** the plan's mix may not exist yet (fixtures, previews): drop it so the videos carry their own sound */
const episodeMeta: CalculateMetadataFunction<DayProps> = async (args) => {
  const res = await withPlan<DayProps>((p) => p.episode.durationInFrames, SIZE)(args);
  const plan = res.props?.plan;
  if (plan && plan.episode.audio) {
    const rel = plan.episode.audio.replace(/^\/+/, "");
    const url = /^day\d+\//.test(rel) ? staticFile(rel) : staticFile(`day${String(plan.meta.day).padStart(2, "0")}/${rel}`);
    let ok = false;
    try {
      ok = (await fetch(url, { method: "HEAD" })).ok;
    } catch {
      ok = false;
    }
    if (!ok) {
      console.warn(`Dec-Episode: mix ${url} not found — previewing with the clips' own sound`);
      return { ...res, props: { ...res.props, plan: { ...plan, episode: { ...plan.episode, audio: "" } } } as DayProps };
    }
  }
  return res;
};

const Root: React.FC = () => (
  <>
    <Composition id="Dec-Episode" component={Episode} {...SIZE} fps={30} durationInFrames={300} defaultProps={{ day: 99 } as DayProps} calculateMetadata={episodeMeta} />
    <Composition id="Dec-Thumbnail" component={Thumbnail} {...SIZE} fps={30} durationInFrames={1} defaultProps={{ day: 99 } as DayProps} calculateMetadata={withPlan<DayProps>(() => 1, SIZE)} />
  </>
);

registerRoot(Root);
