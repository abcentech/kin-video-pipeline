import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { fontFamily } from "../font";

// Burned-in progress branding, bottom-center. The channel name "KIDSINSPIRINGNATION"
// is rendered as one solid word; its letters brighten dim-grey -> gold (#FFC500) one by
// one, left to right, as the movie advances (progress = frame / durationInFrames). Kept
// small, low-opacity and quiet so it reads as a subtle progress hint, not a banner.
// Fully deterministic per frame (no random / Date).

const WORD = "KIDSINSPIRINGNATION";
const DIM = "rgba(255,255,255,0.22)";
const GOLD = "#FFC500";

// placement: "bottom" (default) or "top" (top-center — used when the logo moves to
// the bottom-right corner so the progress wordmark takes the freed top edge).
export const WordmarkProgress: React.FC<{ fontSize?: number; placement?: "bottom" | "top" }> = ({
  fontSize = 14,
  placement = "bottom",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = Math.min(1, Math.max(0, frame / Math.max(1, durationInFrames - 1)));
  const N = WORD.length;

  const op = interpolate(frame, [6, 24], [0, 0.62], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const vpos = placement === "top" ? { top: "3.6%" as const } : { bottom: "3.4%" as const };

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          ...vpos,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: op,
          fontFamily,
          fontWeight: 800,
          fontSize,
          letterSpacing: "2.5px",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {WORD.split("").map((ch, i) => {
          // each letter lights over its own slice of the progress bar, with a small
          // lead-in so the currently-filling letter pops a touch brighter.
          const lit = interpolate(p, [i / N, (i + 0.85) / N], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const color = lit > 0.001 ? GOLD : DIM;
          const glow = lit * 6;
          return (
            <span
              key={i}
              style={{
                color,
                opacity: lit > 0.001 ? 0.55 + 0.45 * lit : 1,
                textShadow: glow > 0.1 ? `0 0 ${glow}px rgba(255,197,0,0.7)` : "none",
              }}
            >
              {ch}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
