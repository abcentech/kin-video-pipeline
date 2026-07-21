import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

// Tiny animated film-grain texture (SVG feTurbulence as a data URI, tiled + drifting).
const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/></svg>")`;

// Top cinematic layer: film grain + vignette + a drifting warm light-leak/flare.
// Stacks ON TOP of the existing warm Grade in PixarIntro.
export const CinematicGrade: React.FC<{ flare?: boolean }> = ({ flare }) => {
  const frame = useCurrentFrame();
  const gx = (frame * 7) % 160;
  const gy = (frame * 11) % 160;
  const leak = 0.10 + 0.06 * Math.sin(frame / 50);

  return (
    <>
      {/* grain */}
      <AbsoluteFill style={{
        backgroundImage: GRAIN, backgroundRepeat: "repeat",
        backgroundPosition: `${gx}px ${gy}px`,
        opacity: 0.07, mixBlendMode: "overlay", pointerEvents: "none",
      }} />
      {/* vignette */}
      <AbsoluteFill style={{
        background: "radial-gradient(120% 90% at 50% 45%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.5) 100%)",
        pointerEvents: "none",
      }} />
      {/* warm filmic tone wash */}
      <AbsoluteFill style={{
        background: "linear-gradient(0deg, rgba(20,12,4,0.18), rgba(40,28,10,0.05) 60%, rgba(255,210,140,0.06))",
        mixBlendMode: "soft-light", pointerEvents: "none",
      }} />
      {/* occasional warm light-leak / flare on divine-light beats */}
      {flare ? (
        <AbsoluteFill style={{
          background: `radial-gradient(40% 30% at 68% 22%, rgba(255,200,110,${leak}), rgba(255,180,80,0) 70%)`,
          mixBlendMode: "screen", pointerEvents: "none",
        }} />
      ) : null}
    </>
  );
};
