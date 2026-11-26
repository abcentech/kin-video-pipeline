/**
 * Candle rules and the hand-drawn underline — the series' only line-work.
 */
import React from "react";
import { C } from "../../theme";
import { alpha, clamp01 } from "./ease";
import { rnd } from "../../theme";

/** A thin candle rule drawing left→right (progress 0..1), with a bright travelling head. `retract` folds it back right→left. */
export const CandleRule: React.FC<{ width: number; progress: number; retract?: number; thickness?: number; glint?: number; style?: React.CSSProperties; color?: string }> = ({
  width,
  progress,
  retract = 0,
  thickness = 2,
  glint,
  style,
  color = C.candle,
}) => {
  const p = clamp01(progress);
  const r = clamp01(retract);
  const len = width * p * (1 - r);
  const head = p < 1 ? p : glint;
  return (
    <div style={{ position: "relative", width, height: thickness, ...style }}>
      <div style={{ position: "absolute", left: 0, top: 0, height: thickness, width: len, background: `linear-gradient(to right, ${alpha(color, 0.25)}, ${color} 30%, ${color})`, borderRadius: thickness }} />
      {head !== undefined && len > 2 ? (
        <div
          style={{
            position: "absolute",
            top: thickness / 2 - 7,
            left: Math.min(len, width * (head ?? 1)) - 30,
            width: 60,
            height: 14,
            background: `radial-gradient(ellipse at center, ${alpha(C.goldLight, 0.9)} 0%, ${alpha(C.candle, 0.35)} 35%, transparent 70%)`,
          }}
        />
      ) : null}
    </div>
  );
};

/** Hand-drawn underline that strokes in (0..1). Deterministic wobble from `seed`. */
export const Underline: React.FC<{ width: number; progress: number; seed?: number; color?: string; thickness?: number; style?: React.CSSProperties }> = ({
  width,
  progress,
  seed = 7,
  color = C.gold,
  thickness = 5,
  style,
}) => {
  const h = 22;
  const n = 6;
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const x = (i / n) * width;
    const y = h / 2 + (rnd(seed + i) - 0.5) * 6 + (i / n) * -3;
    return [x, y] as const;
  });
  // smooth path through the points (quadratic midpoints)
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    d += ` Q ${x0} ${y0} ${(x0 + x1) / 2} ${(y0 + y1) / 2}`;
  }
  d += ` T ${pts[n][0]} ${pts[n][1]}`;
  const L = width * 1.08;
  const p = clamp01(progress);
  return (
    <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} style={{ overflow: "visible", ...style }}>
      <path d={d} fill="none" stroke={alpha(C.candle, 0.45)} strokeWidth={thickness + 6} strokeLinecap="round" strokeDasharray={L} strokeDashoffset={L * (1 - p)} style={{ filter: "blur(4px)" }} />
      <path d={d} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round" strokeDasharray={L} strokeDashoffset={L * (1 - p)} />
    </svg>
  );
};
