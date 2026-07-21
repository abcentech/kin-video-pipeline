import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, spring } from "remotion";
import { loadFont as loadGothic } from "@remotion/google-fonts/UnifrakturCook";
import { loadFont as loadGrenze } from "@remotion/google-fonts/GrenzeGotisch";
import { loadFont as loadSerif } from "@remotion/google-fonts/CormorantGaramond";

const { fontFamily: GOTHIC } = loadGothic("normal", { weights: ["700"], subsets: ["latin"] });
const { fontFamily: GRENZE } = loadGrenze("normal", { weights: ["600", "700"], subsets: ["latin"] });
const { fontFamily: SERIF } = loadSerif("italic", { weights: ["500"], subsets: ["latin"] });

// A bright travelling highlight band over gold — animated via backgroundPosition (safe with
// background-clip:text, unlike filter/transform).
const SHIMMER = "linear-gradient(105deg,#C9781A 0%,#FFC247 26%,#FFF7DA 46%,#FFEAA6 56%,#FFC247 74%,#C9781A 100%)";

const PRE_DELAY = 0.45;   // seconds before the first title word appears
const STAGGER = 0.32;     // seconds between words

// One title word: outer span animates entrance (scale/opacity), inner span carries the
// shimmering gradient text. Kept on separate elements so the clip survives the transform.
const TitleWord: React.FC<{ word: string; t: number; fps: number; idx: number; size: number }> = ({ word, t, fps, idx, size }) => {
  const wt = t - (PRE_DELAY + idx * STAGGER);            // local time since this word began
  const sp = spring({ frame: Math.round(wt * fps), fps, config: { damping: 14, stiffness: 130, mass: 0.7 } });
  const op = interpolate(wt, [0, 0.2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scale = 0.6 + 0.4 * sp;
  const rise = (1 - sp) * 26;
  // continuous shimmer sweep, cascading word to word
  const sweep = ((t * 55 + idx * 26) % 220) - 60;        // -60 → 160 %
  const glow = 16 + 16 * (0.5 + 0.5 * Math.sin((t / 1.7 + idx * 0.5) * Math.PI * 2));
  return (
    <span style={{ display: "inline-block", opacity: op, transform: `translateY(${rise}px) scale(${scale})`, margin: `0 ${size * 0.13}px` }}>
      <span style={{
        display: "inline-block",
        fontFamily: GOTHIC, fontWeight: 700, fontSize: size, lineHeight: 1.0, letterSpacing: 1,
        backgroundImage: SHIMMER, backgroundSize: "220% 100%", backgroundPosition: `${sweep}% 50%`,
        WebkitBackgroundClip: "text", backgroundClip: "text",
        color: "transparent", WebkitTextFillColor: "transparent",
        WebkitTextStroke: "1.2px rgba(120,66,8,0.45)",
        textShadow: `0 0 ${glow}px rgba(255,170,40,0.75), 0 4px 16px rgba(0,0,0,0.85)`,
      }}>{word}</span>
    </span>
  );
};

// Centered gothic-gold series title — the one caption that owns the main screen.
export const TitleCard: React.FC<{
  pre?: string; title: string; subtitle?: string; localFrom?: number;
}> = ({ pre = "Welcome to", title, subtitle, localFrom = 0 }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const f = Math.max(0, frame - localFrom);
  const t = f / fps;
  const portrait = height > width;

  const words = title.split(/\s+/).filter(Boolean);
  const titleSize = portrait ? 92 : 132;                  // large — fills ~70-75% of the frame
  const lastWordT = PRE_DELAY + (words.length - 1) * STAGGER + 0.6;

  const preOp = interpolate(t, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });
  const subOp = interpolate(t, [lastWordT, lastWordT + 0.6], [0, 1], { extrapolateRight: "clamp" });
  const scrimOp = interpolate(t, [0, 0.9], [0, 0.66], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <AbsoluteFill style={{
        background: "radial-gradient(80% 60% at 50% 50%, rgba(5,7,13,0.96) 0%, rgba(5,7,13,0.72) 48%, rgba(5,7,13,0) 82%)",
        opacity: scrimOp, pointerEvents: "none",
      }} />
      <div style={{ width: "92%", textAlign: "center", position: "relative", zIndex: 1 }}>
        <div style={{
          fontFamily: SERIF, fontStyle: "italic", fontWeight: 500,
          fontSize: portrait ? 28 : 26, letterSpacing: 4, color: "#f6eed6",
          textShadow: "0 2px 10px rgba(0,0,0,0.9)", opacity: preOp, marginBottom: portrait ? 14 : 18,
        }}>{pre}</div>
        <div style={{
          display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "baseline",
          width: portrait ? "94%" : "74%", margin: "0 auto", rowGap: portrait ? 4 : 6,
        }}>
          {words.map((w, i) => (
            <TitleWord key={i} word={w} t={t} fps={fps} idx={i} size={titleSize} />
          ))}
        </div>
        {subtitle ? (
          <div style={{
            fontFamily: GRENZE, fontWeight: 700,
            fontSize: portrait ? 22 : 26, letterSpacing: 8, color: "#f6eed6",
            textShadow: "0 2px 10px rgba(0,0,0,0.9)", opacity: subOp, marginTop: portrait ? 18 : 22,
          }}>{subtitle}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
