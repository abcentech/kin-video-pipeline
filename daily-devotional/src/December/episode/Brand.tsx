/**
 * Brand layer over the body: KIN lockup top-right (62 px, 90 %), the day dial + `DAY N · 30` top-left with the
 * chapter chip under it, and the wordmark gauge bottom-left (18 px; letters turn gold with episode progress).
 * Under full takeovers everything but the logo fades (`under` 0..1).
 */
import React from "react";
import { Img, staticFile } from "remotion";
import { BRAND, C, FONT, L } from "../theme";
import { T } from "../timing";
import type { Cue, DayMeta } from "../types";
import { Dial } from "./kit/Dial";
import { alpha, clamp01, eInOut, eOut, mix, ramp } from "./kit/ease";
import { parseRich, plainRich } from "./kit/rich";

const DIAL = 84;

/** The on-file logo has cream lettering, so over the pale recorded wall it sits on its own night plate (the same
 *  plate as the day badge). The wall itself carries no vignette or scrim, so the plate is what keeps it readable.
 *  `plate` 0 = bare logo: over a full-screen night page the plate would show as a paler box. */
export const Logo: React.FC<{ opacity?: number; plate?: number }> = ({ opacity = 1, plate = 1 }) => (
  <div style={{ position: "absolute", top: L.safeTop - 9, right: L.safeX - 16, padding: "9px 16px", borderRadius: 10, background: alpha(C.night, 0.62 * plate), opacity }}>
    <Img src={staticFile(BRAND.logo)} style={{ display: "block", height: 62, width: "auto" }} />
  </div>
);

export const DayBadge: React.FC<{ meta: DayMeta; minute: number; opacity: number; x?: number; y?: number }> = ({ meta, minute, opacity, x = L.safeX, y = L.safeTop }) => (
  <div style={{ position: "absolute", left: x, top: y, display: "flex", alignItems: "center", opacity }}>
    <div style={{ filter: "drop-shadow(0 3px 10px rgba(0,0,0,0.5))" }}>
      <Dial size={DIAL} day={meta.day} total={meta.total} minute={minute} />
    </div>
    <div style={{ marginLeft: 16, padding: "6px 14px", borderRadius: 8, background: alpha(C.night, 0.62) }}>
      <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 28, letterSpacing: "0.14em", color: C.cream, lineHeight: 1.1, whiteSpace: "nowrap" }}>
        DAY {meta.day} <span style={{ color: C.candle }}>· {meta.total}</span>
      </div>
    </div>
  </div>
);

const ChapterChip: React.FC<{ cue: Extract<Cue, { kind: "chapter" }>; f: number }> = ({ cue, f }) => {
  const start = cue.from + cue.dur - T.DOOR_OUT - 2;
  const end = cue.chipTo;
  if (f < start || f >= end) return null;
  const grow = eOut(ramp(f, start, start + 18));
  const fold = eInOut(ramp(f, end - 12, end));
  const k = grow * (1 - fold);
  // the chip carries the whole title when it is short, else its gold phrase (the part the truth hangs on)
  const full = plainRich(cue.title);
  const goldPart = parseRich(cue.title).filter((w) => w.gold).map((w) => w.text).join(" ");
  const raw = full.length <= 34 ? full : goldPart;
  const title = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
  const showTitle = title.length > 0 && title.length <= 34;
  // the dial ticks once as the chip lands
  return (
    <div style={{ position: "absolute", left: L.safeX + 6, top: L.safeTop + DIAL + 8, display: "flex", alignItems: "stretch", opacity: clamp01(k * 1.4) }}>
      <div style={{ width: 3, background: C.candle, transformOrigin: "top", transform: `scaleY(${k})`, borderRadius: 2, boxShadow: `0 0 10px ${alpha(C.candle, 0.7)}` }} />
      <div style={{ overflow: "hidden", clipPath: `inset(0 ${(1 - k) * 100}% 0 0)` }}>
        <div style={{ marginLeft: 0, padding: "8px 16px 9px", background: `linear-gradient(to right, ${alpha(C.night, 0.86)}, ${alpha(C.night, 0.62)})`, borderRadius: "0 8px 8px 0" }}>
          <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 26, letterSpacing: "0.14em", color: C.candle, lineHeight: 1.15, whiteSpace: "nowrap" }}>{cue.label.toUpperCase()}</div>
          {showTitle ? <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 26, color: C.cream, lineHeight: 1.2, whiteSpace: "nowrap" }}>{title}</div> : null}
        </div>
      </div>
    </div>
  );
};

export const WordmarkGauge: React.FC<{ progress: number; opacity: number }> = ({ progress, opacity }) => {
  const letters = BRAND.wordmark.split("");
  const n = letters.length;
  return (
    <div style={{ position: "absolute", left: L.safeX, bottom: 22, display: "flex", opacity, fontFamily: FONT.sans, fontWeight: 800, fontSize: 18, letterSpacing: "0.22em" }}>
      {letters.map((ch, i) => {
        const k = clamp01(progress * n - i);
        return (
          <span key={i} style={{ color: k > 0 ? mix(C.cream, C.gold, k) : alpha(C.cream, 0.5), textShadow: k > 0 && k < 1 ? `0 0 10px ${alpha(C.gold, 0.9)}` : "0 1px 4px rgba(0,0,0,0.7)" }}>
            {ch}
          </span>
        );
      })}
    </div>
  );
};

export const BrandLayer: React.FC<{ meta: DayMeta; cues: Cue[]; f: number; progress: number; under: number; page?: number; open: number }> = ({ meta, cues, f, progress, under, page = under, open }) => {
  const k = (1 - under) * open;
  const chapters = cues.filter((c): c is Extract<Cue, { kind: "chapter" }> => c.kind === "chapter");
  return (
    <>
      <Logo opacity={open} plate={1 - page} />
      {k > 0.01 ? (
        <>
          <DayBadge meta={meta} minute={progress} opacity={k} />
          <div style={{ opacity: k }}>
            {chapters.map((c) => (
              <ChapterChip key={c.id} cue={c} f={f} />
            ))}
          </div>
          <WordmarkGauge progress={progress} opacity={k} />
        </>
      ) : null}
    </>
  );
};
