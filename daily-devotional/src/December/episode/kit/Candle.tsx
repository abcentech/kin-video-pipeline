/**
 * MOTIF 3 — CANDLE LIGHT. Takeover pages are never flat: a soft amber glow breathes (±6 %, 3.2 s, noise-driven),
 * dust motes drift upward through it, the edges fall to `night`.
 *
 *   <CandleRoom />                         // the full page: night + breathing glow + motes + falloff
 *   <CandleRoom veil={0.82} glowX={0.12} /> // a veil over the presenter (he stays 18 % visible)
 *   <CandleGlow x={0.2} y={0.6} r={0.6} /> <Motes count={40} />
 *
 * All read the (sequence-local) frame; pass `seed` to decorrelate two on one screen.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { C, rnd } from "../../theme";
import { alpha, breath, clamp01 } from "./ease";

export const CandleGlow: React.FC<{
  /** centre, 0..1 of the frame */
  x?: number;
  y?: number;
  /** radius as a fraction of the frame width */
  r?: number;
  intensity?: number;
  seed?: number;
  color?: string;
  /** extra one-off bloom 0..1 (e.g. the scripture flourish) */
  bloom?: number;
}> = ({ x = 0.5, y = 0.55, r = 0.55, intensity = 1, seed = 0, color = C.candle, bloom = 0 }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const b = breath(frame, seed, 0.06, 96) * intensity;
  const R = width * r * (1 + 0.04 * (b - 1) / 0.06) * (1 + 0.25 * bloom);
  const a0 = clamp01(0.3 * b + 0.3 * bloom);
  const a1 = clamp01(0.09 * b + 0.1 * bloom);
  // a hot small core inside a soft wide falloff: reads as one flame's light, not an olive wash
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle ${R * 0.32}px at ${x * 100}% ${y * 100}%, ${alpha(C.goldLight, 0.12 * b + 0.2 * bloom)} 0%, transparent 100%), radial-gradient(circle ${R}px at ${x * 100}% ${y * 100}%, ${alpha(color, a0)} 0%, ${alpha(color, a1)} 32%, ${alpha(color, 0.02 * b)} 62%, transparent 100%)`,
        pointerEvents: "none",
      }}
    />
  );
};

export const Motes: React.FC<{
  count?: number;
  seed?: number;
  /** box the motes live in, fractions of the frame */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** px per second upward */
  speed?: number;
  /** size multiplier */
  size?: number;
  opacity?: number;
  color?: string;
}> = ({ count = 40, seed = 1, x = 0, y = 0, w = 1, h = 1, speed = 22, size = 1, opacity = 1, color = C.goldLight }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const bw = width * w;
  const bh = height * h;
  const t = frame / fps;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: count }, (_, i) => {
        const s = seed * 1000 + i * 7.13;
        const x0 = rnd(s + 1) * bw;
        const v = speed * (0.45 + rnd(s + 2) * 0.9);
        const y0 = rnd(s + 3) * (bh + 40);
        const yy = ((((y0 - v * t) % (bh + 40)) + (bh + 40)) % (bh + 40)) - 20;
        const sway = 14 * Math.sin(t * (0.4 + rnd(s + 4) * 0.6) + rnd(s + 5) * 6.28) + 6 * Math.sin(t * 1.7 + i);
        const px = (3 + rnd(s + 6) * 6) * size;
        const edge = Math.min(1, yy / (bh * 0.18), (bh - yy) / (bh * 0.25));
        const tw = 0.55 + 0.45 * Math.sin(t * (1.2 + rnd(s + 7) * 2) + rnd(s + 8) * 6.28);
        const o = clamp01(edge) * tw * (0.35 + 0.65 * rnd(s + 9)) * opacity;
        if (o <= 0.01) return null;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: width * x + x0 + sway - px,
              top: height * y + yy - px,
              width: px * 2,
              height: px * 2,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${alpha(color, 0.95)} 0%, ${alpha(color, 0.35)} 35%, transparent 70%)`,
              opacity: o,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** The candle-lit page every takeover opens onto. */
export const CandleRoom: React.FC<{
  /** page opacity: 1 = opaque night; 0.82 = veil (presenter 18 % visible) */
  veil?: number;
  glowX?: number;
  glowY?: number;
  glowR?: number;
  intensity?: number;
  bloom?: number;
  motes?: number;
  seed?: number;
}> = ({ veil = 1, glowX = 0.5, glowY = 0.58, glowR = 0.6, intensity = 1, bloom = 0, motes = 40, seed = 3 }) => (
  <AbsoluteFill>
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 120% 95% at ${glowX * 100}% ${glowY * 100}%, ${alpha(C.night, veil)} 0%, ${alpha(C.night, veil)} 45%, ${alpha(C.ink, Math.min(1, veil + 0.08))} 100%)` }} />
    <CandleGlow x={glowX} y={glowY} r={glowR} intensity={intensity} bloom={bloom} seed={seed} />
    {motes > 0 ? <Motes count={motes} seed={seed} x={Math.max(0, glowX - 0.42)} w={0.84} y={0.05} h={0.95} opacity={0.85} /> : null}
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 85% 85% at 50% 50%, transparent 55%, ${alpha(C.ink, 0.55 * veil)} 100%)` }} />
  </AbsoluteFill>
);
