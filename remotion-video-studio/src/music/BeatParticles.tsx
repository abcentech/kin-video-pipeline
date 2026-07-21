import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { beatPulse } from "./beat";

// Faint, deterministic gold "Spirit & Wisdom" dust. Particles drift upward and sway;
// the whole field brightens toward the climax and flares on each downbeat. Kept subtle
// (screen blend, low opacity) so it reads as atmosphere, never confetti.

const COUNT = 46;
// cheap deterministic pseudo-random in [0,1) from an integer seed
const rnd = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export const BeatParticles: React.FC<{ downbeats?: number[] }> = ({ downbeats }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;

  // field intensity ramps up across the song and flares on downbeats
  const base = interpolate(t, [0, 40, 100, 147], [0.12, 0.2, 0.42, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const flare = beatPulse(downbeats, t, 0.16);
  const fieldOp = Math.min(0.6, base + flare * 0.22);

  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen", opacity: fieldOp }}>
      {Array.from({ length: COUNT }).map((_, i) => {
        const seedX = rnd(i + 1);
        const seedSpd = 0.3 + rnd(i + 7) * 0.8; // upward speed factor
        const seedSize = 2 + rnd(i + 13) * 5;
        const seedPhase = rnd(i + 21) * 10;
        const swayAmp = 8 + rnd(i + 31) * 26;
        // loop upward over ~ (height) with per-particle speed
        const period = 7 + rnd(i + 41) * 6; // seconds for a full rise
        const prog = ((t * seedSpd) / period + seedPhase) % 1;
        const y = height * (1.05 - prog * 1.15);
        const x = seedX * width + Math.sin(t * 1.6 + seedPhase * 6.28) * swayAmp;
        const twinkle = 0.5 + 0.5 * Math.sin(t * 3 + i);
        const size = seedSize * (1 + flare * 0.5);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: size,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(255,226,140,0.95) 0%, rgba(255,196,0,0.5) 45%, rgba(255,196,0,0) 70%)",
              opacity: 0.25 + twinkle * 0.6,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
