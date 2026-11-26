/**
 * YouTube thumbnail (1920×1080, 1 frame). A tight, graded still of him on the left two-thirds, falling to
 * candle-lit night on the right, a 2–4 word line in Poppins 900, the day dial + DAY N, the KIN logo.
 * Built to read at 320 px wide (every element ≥ ~1/12 of the height).
 */
import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, staticFile, useVideoConfig } from "remotion";
import { BRAND, C, FONT } from "../theme";
import type { Plan } from "../types";
import { CandleGlow, Motes } from "./kit/Candle";
import { Dial } from "./kit/Dial";
import { alpha } from "./kit/ease";
import { resolveSrc } from "./util";

const SMALL = new Set(["the", "a", "an", "who", "is", "my", "when", "does", "of", "to", "in", "and", "your"]);

/** the 2–4 word thumbnail line from a title: the last strong words ("…Who Is Never Late" → NEVER LATE) */
export const thumbLine = (title: string) => {
  const w = title.replace(/[.,!?]/g, "").split(/\s+/).filter(Boolean);
  if (w.length <= 3) return w;
  let out = w.slice(-3);
  while (out.length > 2 && SMALL.has(out[0].toLowerCase())) out = out.slice(1);
  return out;
};

export const Thumbnail: React.FC<{ day: number; plan?: Plan }> = ({ day, plan }) => {
  const { width: W, height: H } = useVideoConfig();
  if (!plan) return <AbsoluteFill style={{ background: C.ink }} />;
  const cold = plan.episode.sections.find((s) => s.kind === "cold");
  const thumb = plan.meta.thumb;
  const frame = thumb ? thumb.bodyFrame : (cold && cold.kind === "cold" ? cold.bodyFrom : 30) + 10;
  const face = thumb?.face ? { ...plan.face, ...thumb.face } : plan.face;
  const s = 1.42;
  const tx = Math.min(0, Math.max(W * 0.72 - s * W, 0.33 * W - s * face.x * W));
  const ty = Math.min(0, Math.max(H - s * H, 0.4 * H - s * face.y * H));
  const words = (thumb?.line ? thumb.line.replace(/\*/g, "").split(/\s*\|\s*|\s+/).filter(Boolean) : thumbLine(plan.meta.title)).map((x) => x.toUpperCase());
  const longest = Math.max(...words.map((x) => x.length));
  const size = Math.round(Math.max(130, Math.min(210, 760 / (longest * 0.68))));
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${s})`, filter: "contrast(1.1) saturate(1.12) brightness(1.04)" }}>
        <OffthreadVideo src={resolveSrc(day, "body.mp4")} trimBefore={frame} muted style={{ width: W, height: H }} />
      </div>
      {/* warm key on his face side, night falling in from the right */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 40% 55% at 33% 40%, ${alpha(C.candle, 0.14)}, transparent 70%)`, mixBlendMode: "screen" }} />
      <AbsoluteFill style={{ background: `linear-gradient(to right, transparent 0%, transparent 38%, ${alpha(C.night, 0.75)} 52%, ${alpha(C.night, 0.97)} 62%, ${C.night} 100%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 90% 90% at 40% 45%, transparent 55%, ${alpha(C.ink, 0.6)} 100%)` }} />
      <CandleGlow x={0.78} y={0.55} r={0.42} intensity={1.2} seed={91} />
      <Motes count={26} seed={92} x={0.58} w={0.42} opacity={0.7} />
      <div style={{ position: "absolute", left: 1090, right: 80, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 34 }}>
          <Dial size={150} day={plan.meta.day} minute={0} glow={0.5} weight={1.6} />
          <div style={{ marginLeft: 26, fontFamily: FONT.sans, fontWeight: 900, fontSize: 96, letterSpacing: "0.02em", color: C.candle, lineHeight: 1 }}>DAY {plan.meta.day}</div>
        </div>
        {words.map((w, i) => (
          <div key={i} style={{ fontFamily: FONT.sans, fontWeight: 900, fontSize: size, lineHeight: 0.95, letterSpacing: "-0.015em", color: i === words.length - 1 ? C.gold : C.cream, textShadow: `0 0 40px ${alpha(i === words.length - 1 ? C.gold : C.candle, 0.35)}, 0 8px 30px ${alpha(C.ink, 0.7)}`, whiteSpace: "nowrap" }}>
            {w}
          </div>
        ))}
      </div>
      <Img src={staticFile(BRAND.logo)} style={{ position: "absolute", right: 70, bottom: 56, height: 96, width: "auto" }} />
    </AbsoluteFill>
  );
};
