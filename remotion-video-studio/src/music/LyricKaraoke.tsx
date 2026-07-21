import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";
import { fontFamily } from "../font";
import { groupLines, lineAt, type Word } from "./lyrics";
import { beatPulse } from "./beat";

// Per-word karaoke, art-directed. The active line sits in the lower third; the word
// being sung blooms with a layered gold glow and a soft underline sweep, and punches a
// little on the beat. "Hero" words (genius, God, wisdom, spirit, skill…) stay tinted gold
// even before they're sung so the song's theme reads at a glance. Sung words dim back.

const HERO = new Set([
  "genius",
  "god",
  "god's",
  "gods",
  "wisdom",
  "spirit",
  "skill",
  "skills",
  "knowledge",
  "wise",
  "better",
  "ten",
  "times",
  "service",
  "shine",
  "rise",
]);

const norm = (w: string) => w.toLowerCase().replace(/[^a-z']/g, "");

export const LyricKaraoke: React.FC<{
  words: Word[];
  format: "16x9" | "9x16";
  beats?: number[];
}> = ({ words, format, beats }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const lines = React.useMemo(() => groupLines(words), [words]);
  const idx = lineAt(lines, t);
  if (idx < 0) return null;
  const line = lines[idx];

  const vertical = format === "9x16";
  const fontSize = vertical ? 66 : 74;
  const bottom = vertical ? "31%" : "11%";

  const inP = spring({ frame: frame - line.start * fps, fps, config: { damping: 200 }, durationInFrames: 14 });
  const sinceEnd = t - line.end;
  const outOp = sinceEnd > 0 ? interpolate(sinceEnd, [0, 0.8], [1, 0], { extrapolateRight: "clamp" }) : 1;
  const op = inP * outOp;
  const beat = beatPulse(beats, t, 0.11);

  return (
    <AbsoluteFill
      style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: bottom, pointerEvents: "none" }}
    >
      {/* soft readability scrim — a feathered gradient, not a box */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse 60% 26% at 50% 88%, rgba(0,0,0,0.42), rgba(0,0,0,0) 70%)",
          opacity: op * 0.9,
        }}
      />
      <div
        style={{
          maxWidth: vertical ? "90%" : "80%",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: `${fontSize * 0.14}px ${fontSize * 0.28}px`,
          opacity: op,
          transform: `translateY(${(1 - inP) * 28}px)`,
        }}
      >
        {line.words.map((w, i) => {
          const hero = HERO.has(norm(w.w));
          const active = t >= w.start - 0.05 && t <= w.end + 0.12;
          const sung = t > w.end + 0.12;
          const enter = active
            ? interpolate(t, [w.start - 0.05, w.start + 0.14], [0.8, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.back(2.2)),
              })
            : 1;
          // beat punch only while the word is live
          const pop = enter * (active ? 1 + beat * 0.07 : 1);

          const color = active
            ? "#fff7df"
            : hero
              ? "#ffd24d"
              : sung
                ? "rgba(255,255,255,0.5)"
                : "rgba(255,255,255,0.82)";

          const glow = active
            ? "0 0 10px rgba(255,243,200,0.95), 0 0 34px rgba(255,196,0,0.85), 0 0 64px rgba(255,150,0,0.5), 0 4px 12px rgba(0,0,0,0.65)"
            : hero
              ? "0 0 18px rgba(255,196,0,0.5), 0 3px 8px rgba(0,0,0,0.7)"
              : "0 3px 8px rgba(0,0,0,0.7)";

          return (
            <span
              key={i}
              style={{
                position: "relative",
                fontFamily,
                fontWeight: active || hero ? 900 : 800,
                fontSize,
                lineHeight: 1.04,
                color,
                textShadow: glow,
                transform: `scale(${pop})`,
                display: "inline-block",
                letterSpacing: "-0.012em",
              }}
            >
              {w.w}
              {/* underline sweep grows in as the word is sung */}
              {active && (
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: "-0.14em",
                    height: 4,
                    transformOrigin: "left center",
                    transform: `scaleX(${interpolate(t, [w.start, w.end], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    })})`,
                    borderRadius: 2,
                    background: "linear-gradient(90deg, rgba(255,196,0,0), #FFC500 30%, #fff3c8)",
                    boxShadow: "0 0 12px rgba(255,196,0,0.8)",
                  }}
                />
              )}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
