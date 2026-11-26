// Kinetic captions for the trailer (both formats) and the shorts. Pages come paged from the plan
// (CaptionPage, piece frames). Each word wipes up on its first frame (never earlier than 2 frames
// before it is spoken); the word being spoken is gold with a 2 px lift and a soft glow; `stress`
// words keep their gold. Each line sits on its own dark box that GROWS with the words already said,
// so it reads over the busy shirt without an empty box waiting for words.
import React from "react";
import { Easing, useCurrentFrame } from "remotion";
import { C, FONT, P } from "../theme";
import type { CaptionPage, Word } from "../types";
import { goldStyle, textWidth } from "./text";

export type CaptionStyle = "16x9" | "9x16" | "short";

const STYLE: Record<CaptionStyle, { size: number; weight: number; maxW: number; centreX: number; centreY?: number; bottom?: number; pad: [number, number]; radius: number }> = {
  // 16:9: the caption band (bottom 150 px), block bottom ≈ 60 px
  "16x9": { size: 50, weight: 800, maxW: 1240, centreX: 960, bottom: 60, pad: [8, 22], radius: 14 },
  // 9:16 trailer and shorts: centred at y ≈ 1320, clear of the right rail (x ≤ 930)
  "9x16": { size: 68, weight: 900, maxW: 800, centreX: 528, centreY: P.captionCentreY, pad: [10, 24], radius: 18 },
  short: { size: 74, weight: 900, maxW: 800, centreX: 528, centreY: P.captionCentreY, pad: [10, 24], radius: 20 },
};
const GAP = 0.24; // em between words

const outC = Easing.out(Easing.cubic);

/** Re-flow a page's words into the same number of lines, balanced by width (no lone word on line 2). */
const balance = (lines: Word[][], measure: (s: string) => number): Word[][] => {
  const words = lines.flat();
  if (lines.length < 2 || words.length < 3) return lines;
  let best = lines;
  let bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i);
    const b = words.slice(i);
    const wd = Math.max(measure(a.map((x) => x.text).join(" ")), measure(b.map((x) => x.text).join(" ")));
    // prefer breaking after punctuation
    const bonus = /[.,;:!?]$/.test(a[a.length - 1].text) ? 0.92 : 1;
    if (wd * bonus < bestW) {
      bestW = wd * bonus;
      best = [a, b];
    }
  }
  return best;
};

export const Captions: React.FC<{ pages: CaptionPage[]; style: CaptionStyle; show: [number, number][] }> = ({ pages, style, show }) => {
  const f = useCurrentFrame();
  const win = show.find(([a, b]) => f >= a && f < b);
  if (!win) return null;
  const page = pages.find((p) => f >= p.from && f < p.to);
  if (!page) return null;
  const base = STYLE[style];
  const upper = style !== "16x9";
  const txt = (s: string) => (upper ? s.toUpperCase() : s);
  const lines = balance(page.lines, (s) => textWidth(txt(s), base.size, base.weight));
  // shrink a page whose widest line would overflow the column (uppercase heavy type runs wide)
  const lineW = (l: Word[]) => l.reduce((n, w) => n + textWidth(txt(w.text), base.size, base.weight), 0) + GAP * base.size * (l.length - 1);
  const widest = Math.max(...lines.map(lineW));
  const fit = Math.min(1, (base.maxW - 2 * base.pad[1]) / Math.max(1, widest));
  const size = base.size * fit;
  const end = Math.min(page.to, win[1]);
  const outP = Math.min(1, Math.max(0, (end - f) / 4));
  const words = lines.flat();
  let active = -1;
  words.forEach((w, i) => {
    if (f >= w.from && f < Math.max(w.to, w.from + 6)) active = i;
  });
  let k = 0;
  return (
    <div
      style={{
        position: "absolute",
        left: base.centreX - base.maxW / 2,
        width: base.maxW,
        ...(base.centreY !== undefined ? { top: base.centreY, transform: "translateY(-50%)" } : { bottom: base.bottom }),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: size * 0.08,
        pointerEvents: "none",
        opacity: outP,
        fontFamily: FONT.sans,
        fontWeight: base.weight,
        fontSize: size,
        lineHeight: 1.16,
        letterSpacing: upper ? "0" : "-0.01em",
        color: C.cream,
        textTransform: upper ? "uppercase" : undefined,
      }}
    >
      {lines.map((line, li) => {
        // the box grows with the words already on screen (each word's wipe drives its share)
        let shown = 0;
        line.forEach((w, wi) => {
          const p = outC(Math.min(1, Math.max(0, (f - (w.from - 2)) / 6)));
          if (p <= 0) return;
          shown += (textWidth(txt(w.text), size, base.weight) + (wi > 0 ? GAP * size : 0)) * (wi > 0 ? p : 1);
        });
        const full = lineW(line) * fit;
        return (
          <div key={li} style={{ position: "relative", display: "flex", whiteSpace: "nowrap", padding: `${base.pad[0]}px ${base.pad[1]}px` }}>
            {shown > 0 ? (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: Math.min(full, shown) + 2 * base.pad[1],
                  borderRadius: base.radius,
                  background: "rgba(0,0,0,0.55)",
                  boxShadow: "0 6px 26px rgba(0,0,0,0.22)",
                }}
              />
            ) : null}
            {line.map((w, wi) => {
              const i = k++;
              const last = wi === line.length - 1;
              const appear = w.from - 2;
              const p = outC(Math.min(1, Math.max(0, (f - appear) / 6)));
              const on = i === active;
              const gold = w.stress && f >= w.from;
              return (
                <span key={wi} style={{ position: "relative", display: "inline-block", overflow: "hidden", padding: "0.04em 0.04em 0.08em", margin: "-0.04em -0.04em -0.08em", marginRight: last ? "-0.04em" : `${GAP - 0.04}em` }}>
                  <span
                    style={{
                      display: "inline-block",
                      visibility: f < appear ? "hidden" : "visible",
                      transform: `translateY(calc(${(1 - p) * 100}% - ${on ? 2 * (size / 36) : 0}px))`,
                      color: on ? C.gold : C.cream,
                      textShadow: on ? `0 0 ${size * 0.35}px rgba(255,197,0,0.45)` : undefined,
                      ...(gold && !on ? goldStyle(f, w.from) : null),
                    }}
                  >
                    {w.text}
                  </span>
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
