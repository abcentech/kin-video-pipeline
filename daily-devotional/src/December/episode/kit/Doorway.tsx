/**
 * A doorway in the dark wall with light pouring out of it — the door motif as an OBJECT (not a transition).
 * Used behind the declaration ("the door bursts fully open behind it in light") and wherever a piece needs
 * the Father's door on screen.
 *
 *   <Doorway open={0..1} burst={0..1} />   // open = leaves swing back; burst = light floods out to the frame
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../../theme";
import { alpha, breath, clamp01, eOut } from "./ease";

export const Doorway: React.FC<{
  open: number;
  burst?: number;
  /** door size, px */
  w?: number;
  h?: number;
  /** centre x (0..1), floor line y (0..1) */
  x?: number;
  floor?: number;
  seed?: number;
}> = ({ open, burst = 0, w = 360, h = 700, x = 0.5, floor = 0.9, seed = 5 }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const o = eOut(clamp01(open));
  const b = clamp01(burst);
  const br = breath(frame, seed, 0.06, 96);
  const cx = W * x;
  const bottom = H * floor;
  const top = bottom - h;
  const rot = (frame / 30) * 0.8;
  const light = clamp01(o * 0.9 + b * 0.4) * br;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* rays fanning from the doorway */}
      <AbsoluteFill
        style={{
          opacity: clamp01(o * 0.55 + b * 0.6) * br,
          background: `repeating-conic-gradient(from ${rot}deg at ${cx}px ${top + h * 0.45}px, ${alpha(C.goldLight, 0.0)} 0deg, ${alpha(C.goldLight, 0.22)} 4deg, ${alpha(C.goldLight, 0.0)} 9deg, ${alpha(C.goldLight, 0.0)} 15deg)`,
          WebkitMaskImage: `radial-gradient(ellipse ${30 + 60 * b}% ${50 + 50 * b}% at ${x * 100}% ${((top + h * 0.45) / H) * 100}%, black 0%, rgba(0,0,0,0.5) 40%, transparent 80%)`,
          maskImage: `radial-gradient(ellipse ${30 + 60 * b}% ${50 + 50 * b}% at ${x * 100}% ${((top + h * 0.45) / H) * 100}%, black 0%, rgba(0,0,0,0.5) 40%, transparent 80%)`,
          mixBlendMode: "screen",
        }}
      />
      {/* floor spill: the doorway's light thrown forward as a trapezoid on the floor */}
      <div
        style={{
          position: "absolute",
          left: cx - w * 1.9,
          width: w * 3.8,
          top: bottom,
          height: H - bottom + 4,
          clipPath: `polygon(${50 - (w / 2 / (w * 3.8)) * 100 * o}% 0%, ${50 + (w / 2 / (w * 3.8)) * 100 * o}% 0%, ${50 + 50 * o}% 100%, ${50 - 50 * o}% 100%)`,
          background: `linear-gradient(to bottom, ${alpha("#FFF3D6", 0.75 * light)}, ${alpha(C.candle, 0.35 * light)} 45%, transparent 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: cx - w * 1.6,
          width: w * 3.2,
          top: bottom - 30,
          height: H - bottom + 60,
          background: `radial-gradient(ellipse 50% 60% at 50% 10%, ${alpha(C.candle, 0.35 * light)}, transparent 75%)`,
        }}
      />
      {/* halo round the frame */}
      <div
        style={{
          position: "absolute",
          left: cx - w,
          width: w * 2,
          top: top - h * 0.25,
          height: h * 1.5,
          background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha(C.candle, 0.4 * light + 0.25 * b)}, transparent 70%)`,
        }}
      />
      {/* the opening */}
      <div
        style={{
          position: "absolute",
          left: cx - w / 2,
          top,
          width: w,
          height: h,
          background: `linear-gradient(to bottom, ${alpha(C.candle, 0.85 * light)} 0%, ${alpha(C.goldLight, 0.95 * light)} 45%, ${alpha("#FFF3D6", light)} 100%)`,
          boxShadow: `0 0 ${40 + 80 * b}px ${alpha(C.candle, 0.7 * light)}, inset 0 0 ${30 + 40 * b}px ${alpha(C.candle, 0.6)}`,
          borderRadius: "4px 4px 0 0",
          outline: `3px solid ${alpha(C.wall, 0.9)}`,
          overflow: "hidden",
        }}
      >
        {/* the two leaves part from the seam (motif 1, as an object), rims lit by the light behind */}
        {(["left", "right"] as const).map((s) => (
          <div
            key={s}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              [s]: 0,
              width: (w / 2) * (1 - o),
              background: `linear-gradient(${s === "left" ? "to right" : "to left"}, ${C.ink}, ${C.night} 70%, ${alpha(C.candle, 0.35)})`,
              boxShadow: `inset 0 0 0 2px ${alpha(C.cream, 0.05)}, ${s === "left" ? 3 : -3}px 0 14px ${alpha(C.goldLight, 0.8 * clamp01(o * 4))}`,
            }}
          />
        ))}
      </div>
      {/* the burst: everything warms */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 70% at ${x * 100}% ${((top + h / 2) / H) * 100}%, ${alpha(C.goldLight, 0.35 * b)}, transparent 70%)`, mixBlendMode: "screen" }} />
    </AbsoluteFill>
  );
};
