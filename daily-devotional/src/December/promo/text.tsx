// Text helpers for the promo pieces: Rich parsing, font readiness, width measuring, the gold style.
import React, { useEffect, useState } from "react";
import { continueRender, delayRender, interpolate } from "remotion";
import { C, FONT } from "../theme";
import type { Rich } from "../types";

export type Tok = { text: string; gold: boolean; em: boolean; br: boolean };

/** `*word*` gold · `**phrase**` emphasised (scripture) · `|` line break before the next word. */
export const rich = (s: Rich): Tok[] => {
  const out: Tok[] = [];
  let gold = false;
  let em = false;
  let cur = "";
  let cg = false;
  let ce = false;
  let br = false;
  const flush = () => {
    if (!cur) return;
    out.push({ text: cur, gold: cg, em: ce, br });
    cur = "";
    br = false;
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "*" && s[i + 1] === "*") {
      em = !em;
      i++;
      continue;
    }
    if (c === "*") {
      gold = !gold;
      continue;
    }
    if (c === "|") {
      flush();
      br = true;
      continue;
    }
    if (/\s/.test(c)) {
      flush();
      continue;
    }
    if (!cur) {
      cg = gold;
      ce = em;
    } else {
      cg = cg || gold;
      ce = ce || em;
    }
    cur += c;
  }
  flush();
  return out;
};

export const plain = (s: Rich) => rich(s).map((t) => t.text).join(" ");

/** Lines of a Rich text: split at `|`. */
export const richLines = (s: Rich): Tok[][] => {
  const lines: Tok[][] = [];
  for (const t of rich(s)) {
    if (t.br || !lines.length) lines.push([]);
    lines[lines.length - 1].push(t);
  }
  return lines;
};

let ctx: CanvasRenderingContext2D | null = null;
/** Width in px of `text` at `size` px (no cache: fonts may load after the first call). */
export const textWidth = (text: string, size: number, weight = 900, family: string = FONT.sans, tracking = 0) => {
  if (typeof document === "undefined") return text.length * size * 0.62;
  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * size * 0.62;
  ctx.font = `${weight} ${size}px ${family}`;
  return ctx.measureText(text).width + tracking * size * Math.max(0, text.length - 1);
};

/** Largest size (≤ max) at which every line fits in maxW. */
export const fitSize = (lines: string[], maxW: number, max: number, weight = 900, family: string = FONT.sans, tracking = 0) => {
  const widest = Math.max(...lines.map((l) => textWidth(l, 100, weight, family, tracking)));
  return Math.min(max, (maxW / Math.max(1, widest)) * 100);
};

const ready = () => {
  if (typeof document === "undefined") return true;
  let n = 0;
  document.fonts.forEach((f) => {
    if ((f.family === "Dec Poppins" || f.family === '"Dec Poppins"' || f.family.includes("Dec Fraunces")) && f.status === "loaded") n++;
  });
  return n >= 3;
};

/** Holds the render until the three self-hosted faces are in document.fonts, then re-renders. */
export const useFontsReady = () => {
  const [ok, setOk] = useState(ready);
  const [handle] = useState(() => (ok ? null : delayRender("December promo fonts")));
  useEffect(() => {
    if (ok) return;
    let alive = true;
    const t0 = Date.now();
    const poll = () => {
      if (!alive) return;
      if (ready() || Date.now() - t0 > 15000) {
        setOk(true);
        if (handle !== null) continueRender(handle);
      } else setTimeout(poll, 30);
    };
    poll();
    return () => {
      alive = false;
    };
  }, [ok, handle]);
  return ok;
};

/** Metallic KIN gold with one sheen crossing at `sweepAt` (EMPHASIS ONLY). */
export const goldStyle = (frame: number, sweepAt = 0): React.CSSProperties => {
  const pass = interpolate(frame - sweepAt, [0, 24], [120, -20], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return {
    backgroundImage: `linear-gradient(105deg, transparent 38%, rgba(255,250,232,0.9) 50%, transparent 62%), linear-gradient(180deg, ${C.goldLight} 0%, ${C.gold} 45%, #E0A000 75%, #B9780E 100%)`,
    backgroundSize: "300% 100%, 100% 100%",
    backgroundPosition: `${pass}% 50%, 0 0`,
    backgroundRepeat: "no-repeat",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  };
};

/** Label style: Poppins 800 uppercase, +14 % tracking. */
export const label = (size: number, color: string = C.candle): React.CSSProperties => ({
  fontFamily: FONT.sans,
  fontWeight: 800,
  fontSize: size,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color,
  whiteSpace: "nowrap",
});
