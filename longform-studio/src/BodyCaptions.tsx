import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { loadFont } from "@remotion/google-fonts/Poppins";

const { fontFamily } = loadFont("normal", { weights: ["700", "800", "900"], subsets: ["latin"] });

const GOLD = "#FFC500";
const GOLD_LT = "#FFE08A";

export type CWord = { w: string; start: number; end: number; emp?: boolean };

// Group into short readable phrases on pauses / sentence ends / length.
function groupPhrases(words: CWord[], maxWords = 4, gap = 0.45): CWord[][] {
  const out: CWord[][] = [];
  let cur: CWord[] = [];
  for (const w of words) {
    if (cur.length === 0) { cur = [w]; continue; }
    const prev = cur[cur.length - 1];
    const tooLong = cur.length >= maxWords;
    const bigGap = w.start - prev.end > gap;
    const endsSentence = /[.!?]$/.test(prev.w);
    if (tooLong || bigGap || endsSentence) { out.push(cur); cur = [w]; }
    else cur.push(w);
  }
  if (cur.length) out.push(cur);
  return out;
}

/* Full word-for-word karaoke band for the long-form body. A stable lower-third
   (clear of the editor-free talking head), Poppins, the spoken word punched up in
   gold, theme words always gold. `hide(frame)` returns true while one of our cards
   (scene split / point / scripture slide / recap / outro / hook) covers the frame —
   the band fades out so captions never stack on a card. */
export const BodyCaptions: React.FC<{ words: CWord[]; hide?: (f: number) => boolean }> = ({ words, hide }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const phrases = React.useMemo(() => groupPhrases(words), [words]);

  // active phrase: the one whose [start-0.2 .. end+0.35] window contains t
  let active: CWord[] | null = null;
  for (const ph of phrases) {
    if (t >= ph[0].start - 0.2 && t <= ph[ph.length - 1].end + 0.35) { active = ph; break; }
  }
  if (!active) return null;
  if (hide && hide(frame)) return null;

  const pStart = active[0].start;
  const pEnd = active[active.length - 1].end;
  const appear = interpolate(t, [pStart - 0.2, pStart], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const vanish = interpolate(t, [pEnd + 0.1, pEnd + 0.35], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const op = Math.min(appear, vanish);

  return (
    <div style={{
      position: "absolute", left: 0, right: 0, bottom: 12,
      display: "flex", justifyContent: "center",
      padding: "0 6%", opacity: op, pointerEvents: "none", zIndex: 46,
    }}>
      {/* transparent-black pill that hugs the text and sits right on the slider */}
      <div style={{
        display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "baseline",
        background: "rgba(0,0,0,0.55)", borderRadius: 10, padding: "5px 18px",
        maxWidth: "88%",
      }}>
        {active.map((w, i) => {
          const isActive = t >= w.start - 0.04 && t <= w.end + 0.06;
          const pop = isActive ? interpolate(t, [w.start - 0.05, w.start + 0.12], [0.86, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(2.2)) }) : 1;
          const gold = w.emp || isActive;
          return (
            <span key={i} style={{
              fontFamily,
              fontWeight: w.emp ? 900 : 800,
              fontSize: w.emp ? 34 : 30,
              lineHeight: 1.16,
              letterSpacing: 0.2,
              marginRight: "0.3em",
              color: gold ? GOLD : "#FFFFFF",
              transform: `translateY(${isActive ? -2 : 0}px) scale(${pop})`,
              display: "inline-block",
              textShadow: gold
                ? `0 0 12px rgba(255,197,0,${isActive ? 0.6 : 0.35}), 0 2px 6px rgba(0,0,0,0.9)`
                : "0 2px 6px rgba(0,0,0,0.9)",
              WebkitTextStroke: gold && isActive ? `0.5px ${GOLD_LT}` : undefined,
            }}>{w.w}</span>
          );
        })}
      </div>
    </div>
  );
};
