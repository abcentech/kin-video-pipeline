import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { fontFamily } from "../font";

// A small, elegant scripture reference card that rides the Bible-reading beat
// (Emeka reading Daniel 1). Hairline gold frame, gentle slide-in, then fades — placed
// upper-left so it never collides with the lower-third karaoke or the top wordmark.
const GOLD = "#FFC500";

export const ScriptureChip: React.FC<{
  reference?: string;
  line?: string;
  fromSec: number;
  toSec: number;
}> = ({
  reference = "Daniel 1:17",
  line = "God gave them knowledge and skill",
  fromSec,
  toSec,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < fromSec - 0.5 || t > toSec + 0.8) return null;

  const inP = spring({ frame: frame - fromSec * fps, fps, config: { damping: 200 }, durationInFrames: 18 });
  const out = interpolate(t, [toSec, toSec + 0.7], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const op = Math.min(inP, out);
  if (op <= 0.001) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: "6%",
          top: "16%",
          opacity: op,
          transform: `translateX(${(1 - inP) * -28}px)`,
          padding: "14px 22px",
          borderLeft: `3px solid ${GOLD}`,
          background: "linear-gradient(90deg, rgba(10,12,20,0.62), rgba(10,12,20,0))",
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 900,
            fontSize: 34,
            color: "#fff",
            letterSpacing: "0.5px",
            textShadow: "0 2px 14px rgba(0,0,0,0.7)",
          }}
        >
          {reference}
        </div>
        <div
          style={{
            fontFamily,
            fontWeight: 700,
            fontSize: 20,
            color: GOLD,
            marginTop: 4,
            letterSpacing: "1.5px",
            textShadow: "0 2px 10px rgba(0,0,0,0.7)",
          }}
        >
          {line}
        </div>
      </div>
    </AbsoluteFill>
  );
};
