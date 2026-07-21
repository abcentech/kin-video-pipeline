import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { fontFamily } from "../font";

// Opening title lockup, composited over the exterior establishing footage (Veo can't
// render legible text, so the in-scene gate sign is left blank and this rides on top).
// A small gold eyebrow (the school), the film title with the hero word emphasized, and
// the subtext motto. Shown on the opening establishing beat + a brief finale reprise, so
// it never collides with the karaoke (starts ~15s) or the top-center progress wordmark.
const GOLD = "#FFC500";

export const SchoolSign: React.FC<{
  name?: string; // small eyebrow (school)
  title?: string; // big title, the word "GENIUS" (any case) is emphasized
  motto?: string; // gold subtext under the title
}> = ({
  name = "goDs Academy",
  title = "I am a GENIUS",
  motto = "In Spirit by Skills and For Service",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const openOp = interpolate(t, [0.6, 1.8, 5.4, 6.7], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const finaleOp = interpolate(t, [138, 139.5, 144.5, 146], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const op = Math.max(openOp, finaleOp);
  if (op <= 0.001) return null;

  const rise = interpolate(op, [0, 1], [22, 0]);

  // split the title so the hero word ("genius") can glow gold
  const parts = title.split(/(\bgenius\b\.?)/i).filter(Boolean);

  return (
    <AbsoluteFill style={{ pointerEvents: "none", justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: "33%",
          textAlign: "center",
          opacity: op,
          transform: `translateY(${rise}px)`,
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: 30,
            color: GOLD,
            letterSpacing: "6px",
            textTransform: "uppercase",
            marginBottom: 14,
            textShadow: "0 2px 12px rgba(0,0,0,0.7)",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontFamily,
            fontWeight: 900,
            fontSize: 104,
            color: "#fff",
            letterSpacing: "-1px",
            lineHeight: 1,
            textShadow: "0 0 40px rgba(255,197,0,0.5), 0 8px 26px rgba(0,0,0,0.75)",
          }}
        >
          {parts.map((p, i) =>
            /genius/i.test(p) ? (
              <span
                key={i}
                style={{
                  color: GOLD,
                  textShadow:
                    "0 0 18px rgba(255,243,200,0.9), 0 0 50px rgba(255,196,0,0.85), 0 8px 26px rgba(0,0,0,0.7)",
                }}
              >
                {p}
              </span>
            ) : (
              <span key={i}>{p}</span>
            ),
          )}
        </div>
        <div
          style={{
            margin: "20px auto 0",
            width: 420,
            height: 2,
            background: `linear-gradient(90deg, rgba(255,197,0,0), ${GOLD}, rgba(255,197,0,0))`,
          }}
        />
        <div
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: 28,
            color: "#ffe9b0",
            marginTop: 18,
            letterSpacing: "3px",
            textShadow: "0 2px 12px rgba(0,0,0,0.7)",
          }}
        >
          {motto}
        </div>
      </div>
    </AbsoluteFill>
  );
};
