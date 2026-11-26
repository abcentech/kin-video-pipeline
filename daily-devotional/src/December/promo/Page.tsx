// Shared surfaces: the candle-lit night page and the finish (vignette + grain).
import React from "react";
import { useVideoConfig } from "remotion";
import { C } from "../theme";
import { CandleGlow, Motes } from "./kit";

/** The takeover page: deep teal night, one candle breathing, motes rising through its light. `glow` x/y are
 *  fractions of the page, r a fraction of its longer side. */
export const NightPage: React.FC<{ w: number; h: number; glow?: { x: number; y: number; r: number; s?: number }; motes?: number; seed?: number; tone?: number; bloom?: number }> = ({
  w,
  h,
  glow = { x: 0.5, y: 0.55, r: 0.6 },
  motes = 40,
  seed = 1,
  tone = 1,
  bloom = 0,
}) => {
  const { width } = useVideoConfig();
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, overflow: "hidden", background: `radial-gradient(ellipse 90% 80% at ${glow.x * 100}% ${glow.y * 100}%, #0C3239 0%, ${C.night} 48%, ${C.ink} 100%)` }}>
      <CandleGlow x={glow.x} y={glow.y} r={(glow.r * Math.max(w, h)) / width} intensity={(glow.s ?? 1) * tone} bloom={bloom} seed={seed} />
      {motes > 0 ? <Motes count={motes} seed={seed} x={Math.max(0, glow.x - 0.45)} w={0.9} opacity={0.85 * tone} /> : null}
    </div>
  );
};

/** A fine deterministic grain. No vignette: it sat over the recorded picture too, and nothing tonal goes over that. */
export const Finish: React.FC<{ f: number; w: number; h: number; grain?: number }> = ({ f, w, h, grain = 0.07 }) => (
  <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, pointerEvents: "none" }}>
    <svg width={w} height={h} style={{ position: "absolute", inset: 0, opacity: grain, mixBlendMode: "overlay" }}>
      <filter id="decGrain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency={0.9} numOctaves={2} seed={(f * 7) % 97} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#decGrain)" />
    </svg>
  </div>
);
