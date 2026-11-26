/**
 * CHAPTER — short takeover. Door seam wipe; a giant outline numeral (candle, 420 px) lower-left lands at
 * T.CHAPTER_HIT, `TRUTH 1 OF 3`, the truth's title in cream 900 (≤ 2 lines). 2.8 s, then everything draws
 * toward the day dial (top-left) as the door closes and the chip (Brand.tsx) takes over.
 * Non-numbered sections show the dial in place of the numeral.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, FONT, L } from "../../theme";
import { T } from "../../timing";
import type { Cue } from "../../types";
import { CandleRoom } from "../kit/Candle";
import { Dial } from "../kit/Dial";
import { Door, doorFor } from "../kit/Door";
import { alpha, eBack, eIn, eInOut, eOut, mix, ramp } from "../kit/ease";
import { CandleRule } from "../kit/Lines";
import { balanceLines, fitSize, parseRich } from "../kit/rich";

type ChapterCue = Extract<Cue, { kind: "chapter" }>;

export const Chapter: React.FC<{ cue: ChapterCue; day: number }> = ({ cue, day }) => {
  const f = useCurrentFrame();
  const open = doorFor(f, cue.dur);
  const H = T.CHAPTER_HIT;
  const words = parseRich(cue.title.toUpperCase().replace(/\*\*/g, "*"));
  // balanced into ≤ 2 lines, never an orphan; the title block may use up to 1,250 px
  const lines = balanceLines(words, 20, 2);
  const longest = Math.max(...lines.map((l) => l.map((w) => w.text).join(" ").length));
  const size = Math.round(fitSize(longest, 1250, 136, 64));
  // numeral: outline draws in, lands at CHAPTER_HIT with a small overshoot
  const draw = eOut(ramp(f, 2, H + 4));
  const land = eBack(ramp(f, H - 6, H + 2));
  const fillGlow = Math.max(0, 1 - Math.abs(f - H) / 14);
  // exit: content leans toward the day dial while the door closes
  const exitT = eIn(ramp(f, cue.dur - T.DOOR_OUT - 8, cue.dur));
  const drift = ramp(f, 0, cue.dur);
  const outline = 2400;
  const textIn = (i: number) => eOut(ramp(f, H - 2 + i * 4, H + 12 + i * 4));
  return (
    <Door open={open}>
      <CandleRoom glowX={0.22} glowY={0.68} glowR={0.6} seed={21} motes={34} />
      <AbsoluteFill style={{ transformOrigin: `${L.safeX + 40}px ${L.safeTop + 40}px`, transform: `scale(${1 - 0.55 * exitT}) translateY(${-6 * drift}px)`, opacity: 1 - exitT }}>
        {cue.numeral ? (
          <svg width={460} height={480} viewBox="0 0 460 480" style={{ position: "absolute", left: L.safeX - 20, bottom: 150, overflow: "visible", transform: `scale(${0.9 + 0.1 * land})`, transformOrigin: "30% 80%" }}>
            <text
              x={20}
              y={430}
              fontFamily={FONT.sans}
              fontWeight={900}
              fontSize={420}
              fill={alpha(C.candle, 0.1 + 0.18 * fillGlow)}
              stroke={C.candle}
              strokeWidth={5}
              strokeDasharray={outline}
              strokeDashoffset={outline * (1 - draw)}
              style={{ filter: `drop-shadow(0 0 ${12 + 30 * fillGlow}px ${alpha(C.candle, 0.55)})` }}
            >
              {cue.numeral}
            </text>
          </svg>
        ) : (
          <div style={{ position: "absolute", left: L.safeX + 10, bottom: 200, transform: `scale(${0.9 + 0.1 * land})`, transformOrigin: "50% 50%" }}>
            <Dial size={330} day={day} minute={0.75 + 0.25 * eInOut(ramp(f, 0, H + 6))} glow={0.3 + fillGlow * 0.6} />
          </div>
        )}
        <div style={{ position: "absolute", left: !cue.numeral ? 500 : cue.numeral === 1 ? 360 : 420, right: L.safeX, bottom: 250, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", opacity: textIn(0), transform: `translateX(${(1 - textIn(0)) * -24}px)` }}>
            <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 30, letterSpacing: "0.14em", color: C.candle }}>{cue.label.toUpperCase()}</div>
          </div>
          <CandleRule width={420} progress={eOut(ramp(f, H - 4, H + 16))} glint={((f % 60) / 60) * 1.4} style={{ margin: "14px 0 18px" }} />
          {lines.map((line, li) => (
            <div key={li} style={{ display: "flex", whiteSpace: "nowrap", opacity: textIn(li + 1), transform: `translateY(${(1 - textIn(li + 1)) * 30}px)` }}>
              {line.map((w, i) => (
                <span key={i} style={{ fontFamily: FONT.sans, fontWeight: 900, fontSize: size, lineHeight: 1.02, letterSpacing: "-0.01em", marginRight: i < line.length - 1 ? "0.24em" : 0, color: w.gold ? C.gold : mix(C.cream, C.cream, 0), textShadow: `0 4px 24px ${alpha(C.ink, 0.6)}` }}>
                  {w.text}
                </span>
              ))}
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </Door>
  );
};
