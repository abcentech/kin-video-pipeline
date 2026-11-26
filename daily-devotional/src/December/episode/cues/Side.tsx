/**
 * Side class (the camera has already moved him to the opposite third): POINT and KEYWORD.
 * Type sits directly on the wall over a night gradient scrim (no box).
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, FONT, L } from "../../theme";
import type { Cue, Side } from "../../types";
import { alpha, clamp01, eIn, eOut, eOutQuint, ramp } from "../kit/ease";
import { CandleRule } from "../kit/Lines";
import { balanceLines, parseRich, richLines } from "../kit/rich";

/** column the side content lives in */
export const SIDE_W = 740;
export const sideLeft = (side: Side) => (side === "left" ? L.safeX : L.w - L.safeX - SIDE_W);

/** v2: the producer wants the recorded wall left alone, so there is no scrim any more (kept as a no-op for callers). */
export const SideScrim: React.FC<{ side: Side; k: number; strength?: number }> = () => null;

export const OldSideScrim: React.FC<{ side: Side; k: number; strength?: number }> = ({ side, k, strength = 0.8 }) => (
  <AbsoluteFill
    style={{
      opacity: k,
      background: `linear-gradient(${side === "left" ? "to right" : "to left"}, ${alpha(C.night, strength)} 0%, ${alpha(C.night, strength * 0.72)} 34%, ${alpha(C.night, strength * 0.25)} 52%, transparent 64%)`,
    }}
  />
);

export const Point: React.FC<{ cue: Extract<Cue, { kind: "point" }> }> = ({ cue }) => {
  const f = useCurrentFrame();
  const words = parseRich(cue.text);
  const lines = balanceLines(words, 20, 3);
  const longest = Math.max(...lines.map((l) => l.map((w) => w.text).join(" ").length));
  const size = Math.round(Math.max(54, Math.min(64, SIDE_W / (longest * 0.6))));
  const at = (i: number) => (cue.lit?.[i] !== undefined ? cue.lit[i] - cue.from : 6 + i * 4);
  const lastAt = at(words.length - 1);
  const out0 = cue.dur - 12;
  const outK = eIn(ramp(f, out0, cue.dur));
  const scrim = Math.min(eOut(ramp(f, 0, 12)), 1 - outK);
  const rule = eOut(ramp(f, lastAt, lastAt + 18));
  const drift = ramp(f, 0, cue.dur);
  const left = sideLeft(cue.side);
  return (
    <AbsoluteFill>
      <SideScrim side={cue.side} k={scrim} />
      <div style={{ position: "absolute", left, width: SIDE_W, top: 0, bottom: L.captionBand + 40, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: cue.side === "left" ? "flex-start" : "flex-end", transform: `translateY(${-10 * drift}px)` }}>
        {lines.map((line, li) => (
          <div key={li} style={{ display: "flex", whiteSpace: "nowrap" }}>
            {line.map((w, i) => {
              const k = eOutQuint(ramp(f, at(w.i) - 2, at(w.i) + 7));
              const gone = clamp01(outK * 1.2 - (li * 0.1));
              return (
                <span
                  key={i}
                  style={{
                    display: "inline-block",
                    fontFamily: FONT.sans,
                    fontWeight: 900,
                    fontSize: size,
                    lineHeight: 1.08,
                    letterSpacing: "-0.01em",
                    marginRight: i < line.length - 1 ? "0.24em" : 0,
                    color: w.gold ? C.gold : C.cream,
                    opacity: k * (1 - gone),
                    transform: `translateY(${(1 - k) * 26 - gone * 14}px)`,
                    // the tight 5 px edge keeps cream letters readable where the wall is near-white (no vignette or scrim helps them any more)
                    textShadow: w.gold ? `0 0 26px ${alpha(C.gold, 0.35)}, 0 0 5px ${alpha(C.ink, 0.85)}, 0 2px 3px ${alpha(C.ink, 0.75)}, 0 0 18px ${alpha(C.ink, 0.8)}, 0 8px 34px ${alpha(C.ink, 0.7)}` : `0 0 5px ${alpha(C.ink, 0.85)}, 0 2px 3px ${alpha(C.ink, 0.75)}, 0 0 18px ${alpha(C.ink, 0.8)}, 0 8px 34px ${alpha(C.ink, 0.7)}`,
                  }}
                >
                  {w.text}
                </span>
              );
            })}
          </div>
        ))}
        <CandleRule width={Math.min(SIDE_W, longest * size * 0.56)} progress={rule} retract={outK} thickness={3} glint={((f % 70) / 70) * 1.3} style={{ marginTop: 18 }} />
      </div>
    </AbsoluteFill>
  );
};

export const Keyword: React.FC<{ cue: Extract<Cue, { kind: "keyword" }> }> = ({ cue }) => {
  const f = useCurrentFrame();
  const words = parseRich(cue.text.toUpperCase().replace(/\*\*/g, "*"));
  // one word a line when it helps the size
  const lines = words.length <= 3 ? words.map((w) => [w]) : richLines(words, 10);
  const longest = Math.max(...lines.map((l) => l.map((w) => w.text).join(" ").length));
  const size = Math.round(Math.max(90, Math.min(190, SIDE_W / (longest * 0.7))));
  const outK = eIn(ramp(f, cue.dur - 9, cue.dur));
  const scrim = Math.min(eOut(ramp(f, -2, 6)), 1 - outK);
  const hold = ramp(f, 6, cue.dur);
  const left = sideLeft(cue.side);
  return (
    <AbsoluteFill>
      <SideScrim side={cue.side} k={scrim} strength={0.85} />
      <div style={{ position: "absolute", left, width: SIDE_W, top: 0, bottom: L.captionBand + 30, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: cue.side === "left" ? "flex-start" : "flex-end" }}>
        {lines.map((line, li) => {
          // lands ON its frame: line 0 at +0, the next 3 frames later
          const t0 = li * 3;
          const k = eOutQuint(ramp(f, t0 - 1, t0 + 5));
          const flash = Math.max(0, 1 - Math.abs(f - t0 - 2) / 8);
          return (
            <div
              key={li}
              style={{
                display: "flex",
                whiteSpace: "nowrap",
                opacity: k * (1 - outK),
                transformOrigin: cue.side === "left" ? "left center" : "right center",
                transform: `scale(${1.32 - 0.32 * k + 0.035 * hold + 0.06 * outK})`,
              }}
            >
              {line.map((w, i) => (
                <span
                  key={i}
                  style={{
                    fontFamily: FONT.sans,
                    fontWeight: 900,
                    fontSize: size,
                    lineHeight: 0.98,
                    letterSpacing: "-0.01em",
                    marginRight: i < line.length - 1 ? "0.2em" : 0,
                    color: w.gold ? C.gold : C.cream,
                    textShadow: `0 0 ${20 + 40 * flash}px ${alpha(w.gold ? C.gold : C.candle, 0.35 + 0.4 * flash)}, 0 2px 3px ${alpha(C.ink, 0.75)}, 0 0 18px ${alpha(C.ink, 0.8)}, 0 8px 34px ${alpha(C.ink, 0.7)}`,
                  }}
                >
                  {w.text}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
