// Compositions of the December promo pieces. One bundle renders any day: the plan is fetched in
// calculateMetadata (../load withPlan), and whether the piece's mix exists is checked there too.
import React from "react";
import { Composition, staticFile, type CalculateMetadataFunction } from "remotion";
import { withPlan, type DayProps } from "../load";
import type { Plan } from "../types";
import { Short, type ShortCompProps } from "./Short";
import { Trailer, type TrailerProps } from "./Trailer";

const exists = async (rel: string) => {
  if (!rel) return false;
  try {
    const res = await fetch(staticFile(rel), { headers: { Range: "bytes=0-0" } });
    void res.body?.cancel();
    return res.ok;
  } catch {
    return false;
  }
};

/**
 * Matted line beats: scripts/december/matte.mjs measures his head from the matte and keeps it in the clip's
 * sidecar (`<clip>.json` → track [clipFrame, x, capTop]). Attach it to the beat in beat frames, so the crop and
 * the behind-words follow him even when he sways faster than the plan's two camera keys.
 */
const withHeadTracks = async (plan: Plan): Promise<Plan> => {
  const cache = new Map<string, [number, number, number][] | null>();
  const load = async (clip: string) => {
    if (!cache.has(clip)) {
      let tr: [number, number, number][] | null = null;
      try {
        const res = await fetch(staticFile(`${clip}.json`));
        if (res.ok) tr = ((await res.json()) as { track?: [number, number, number][] }).track ?? null;
      } catch {
        tr = null;
      }
      cache.set(clip, tr);
    }
    return cache.get(clip) ?? null;
  };
  const out: Plan = { ...plan, trailer: { ...plan.trailer } };
  for (const fmt of ["16x9", "9x16"] as const) {
    const promo = plan.trailer[fmt];
    const beats = await Promise.all(
      promo.beats.map(async (b) => {
        if (b.kind !== "line" || !b.matte) return b;
        const tr = await load(b.clip);
        if (!tr) return b;
        return { ...b, track: tr.filter((p) => p[0] >= b.clipFrom - 3 && p[0] <= b.clipFrom + b.dur + 3).map((p) => [p[0] - b.clipFrom, p[1], p[2]]) };
      }),
    );
    out.trailer[fmt] = { ...promo, beats };
  }
  return out;
};

const meta =
  <T extends DayProps & { hasAudio?: boolean }>(pick: (plan: Plan, props: T) => number, size: { width: number; height: number }, audioOf: (plan: Plan, props: T) => string): CalculateMetadataFunction<T> =>
  async (args) => {
    const r = await withPlan<T>(pick, size)(args);
    const props = r.props as T;
    const plan = await withHeadTracks(props.plan as Plan);
    return { ...r, props: { ...props, plan, hasAudio: await exists(audioOf(plan, props)) } };
  };

const L = { width: 1920, height: 1080 };
const V = { width: 1080, height: 1920 };

export const PromoRoot: React.FC = () => (
  <>
    <Composition
      id="Dec-Trailer-16x9"
      component={Trailer}
      fps={30}
      durationInFrames={1200}
      {...L}
      defaultProps={{ day: 98, format: "16x9" } as TrailerProps}
      calculateMetadata={meta<TrailerProps>((p) => p.trailer["16x9"].durationInFrames, L, (p) => p.trailer["16x9"].audio)}
    />
    <Composition
      id="Dec-Trailer-9x16"
      component={Trailer}
      fps={30}
      durationInFrames={1200}
      {...V}
      defaultProps={{ day: 98, format: "9x16" } as TrailerProps}
      calculateMetadata={meta<TrailerProps>((p) => p.trailer["9x16"].durationInFrames, V, (p) => p.trailer["9x16"].audio)}
    />
    <Composition
      id="Dec-Short"
      component={Short}
      fps={30}
      durationInFrames={900}
      {...V}
      defaultProps={{ day: 98, index: 0 } as ShortCompProps}
      calculateMetadata={meta<ShortCompProps>((p, props) => p.shorts[props.index]?.durationInFrames ?? 1, V, (p, props) => p.shorts[props.index]?.audio ?? "")}
    />
  </>
);
