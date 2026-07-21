import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { loadFont as loadGothic } from "@remotion/google-fonts/UnifrakturCook";
import { loadFont as loadSerif } from "@remotion/google-fonts/CormorantGaramond";

const { fontFamily: GOTHIC } = loadGothic("normal", { weights: ["700"], subsets: ["latin"] });
const { fontFamily: SERIF } = loadSerif("italic", { weights: ["500", "600"], subsets: ["latin"] });

export type CWord = { w: string; start: number; end: number; emp?: boolean };

// Group words into short phrases on pauses / length so each gets its own screen anchor.
function groupPhrases(words: CWord[], maxWords = 5, gap = 0.5): CWord[][] {
  const out: CWord[][] = [];
  let cur: CWord[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (cur.length === 0) cur = [w];
    else {
      const prev = cur[cur.length - 1];
      const tooLong = cur.length >= maxWords;
      const bigGap = w.start - prev.end > gap;
      const endsSentence = /[.!?]$/.test(prev.w);
      if (tooLong || bigGap || endsSentence) { out.push(cur); cur = [w]; }
      else cur.push(w);
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

// Safe-zone anchors — deliberately avoid dead center so the imagery stays clear.
const ANCHORS_169 = [
  { left: "7%", top: "15%", width: "46%", align: "left" as const },
  { right: "7%", bottom: "15%", width: "48%", align: "right" as const },
  { left: "7%", bottom: "14%", width: "46%", align: "left" as const },
  { right: "7%", top: "15%", width: "46%", align: "right" as const },
  { left: "50%", bottom: "11%", width: "74%", align: "center" as const, cx: true },
];
const ANCHORS_916 = [
  { left: "8%", top: "16%", width: "84%", align: "left" as const },
  { left: "8%", top: "30%", width: "80%", align: "left" as const },
  { right: "8%", bottom: "26%", width: "84%", align: "right" as const },
  { left: "8%", bottom: "15%", width: "84%", align: "left" as const },
  { left: "8%", top: "23%", width: "84%", align: "left" as const },
];

const GOLD = "linear-gradient(180deg,#FFEDB4 0%,#FFC247 52%,#DD8520 100%)";

const Word: React.FC<{ word: CWord; phraseEnd: number; portrait: boolean }> = ({ word, phraseEnd, portrait }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const inA = word.start - 0.1, inB = word.start + 0.22;          // bloom-in
  const outA = phraseEnd + 0.25, outB = phraseEnd + 0.75;          // dissolve as phrase ends
  if (t < inA - 0.05 || t > outB + 0.05) return null;

  const op = interpolate(t, [inA, inB, outA, outB], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sIn = interpolate(t, [inA, inB], [0.86, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.back(2)) });
  const blurIn = interpolate(t, [inA, inB], [7, 0], { extrapolateRight: "clamp" });
  const blurOut = interpolate(t, [outA, outB], [0, 9], { extrapolateLeft: "clamp" });
  const yIn = interpolate(t, [inA, inB], [10, 0], { extrapolateRight: "clamp" });
  const yOut = interpolate(t, [outA, outB], [0, -16], { extrapolateLeft: "clamp" });
  const pulse = word.emp ? 1 + 0.045 * Math.sin((t / 2.6) * Math.PI * 2) : 1;
  const glow = word.emp ? 12 + 10 * (0.5 + 0.5 * Math.sin((t / 2.6) * Math.PI * 2)) : 0;

  const base: React.CSSProperties = {
    display: "inline-block",
    margin: word.emp ? "0 0.16em" : "0 0.12em",
    opacity: op,
    transform: `translateY(${yIn + yOut}px) scale(${sIn * pulse})`,
    filter: `blur(${blurIn + blurOut}px)`,
    whiteSpace: "pre",
  };

  if (word.emp) {
    // Nest: the blur/transform live on the OUTER span; the gradient-clipped text lives
    // on the INNER span. A filter on a background-clip:text element renders nothing in
    // headless Chromium, so the two must be kept on separate elements. Glow via textShadow.
    return (
      <span style={base}>
        <span style={{
          display: "inline-block",
          fontFamily: GOTHIC,
          fontWeight: 700,
          fontSize: portrait ? 64 : 76,
          lineHeight: 1.0,
          letterSpacing: 2,
          backgroundImage: GOLD,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          WebkitTextFillColor: "transparent",
          textShadow: `0 0 ${glow}px rgba(255,170,40,0.85), 0 3px 10px rgba(0,0,0,0.7)`,
        }}>{word.w}</span>
      </span>
    );
  }
  return (
    <span style={{
      ...base,
      fontFamily: SERIF,
      fontStyle: "italic",
      fontWeight: 600,
      fontSize: portrait ? 34 : 40,
      lineHeight: 1.15,
      color: "#f6eed6",
      textShadow: "0 2px 10px rgba(0,0,0,0.92)",
    }}>{word.w}</span>
  );
};

// Running word-for-word captions. Words after `titleStart` are left to the TitleCard.
export const KineticCaptions: React.FC<{ words: CWord[]; titleStart?: number }> = ({ words, titleStart }) => {
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  const anchors = portrait ? ANCHORS_916 : ANCHORS_169;
  const shown = titleStart != null ? words.filter((w) => w.start < titleStart - 0.05) : words;
  const phrases = groupPhrases(shown);

  return (
    <>
      {phrases.map((ph, i) => {
        const a = anchors[i % anchors.length];
        const phraseEnd = ph[ph.length - 1].end;
        const style: React.CSSProperties = {
          position: "absolute",
          width: a.width,
          textAlign: a.align,
          left: (a as any).left,
          right: (a as any).right,
          top: (a as any).top,
          bottom: (a as any).bottom,
          transform: (a as any).cx ? "translateX(-50%)" : undefined,
          display: "flex",
          flexWrap: "wrap",
          gap: "0 0.05em",
          alignItems: "baseline",
          justifyContent: a.align === "right" ? "flex-end" : a.align === "center" ? "center" : "flex-start",
        };
        return (
          <div key={i} style={style}>
            {ph.map((w, j) => (
              <Word key={j} word={w} phraseEnd={phraseEnd} portrait={portrait} />
            ))}
          </div>
        );
      })}
    </>
  );
};
