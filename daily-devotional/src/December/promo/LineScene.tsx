// A presenter line. Matted (trailer): his wall → candle-lit night behind him, a giant word standing
// BETWEEN the night and him, candle rim light on his edges. Plain (shorts): the clip itself under the
// virtual camera with a candle wash. Captions are drawn by the piece, not here.
import React from "react";
import { Easing, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import { C, FONT } from "../theme";
import type { Plan, PromoBeat, View } from "../types";
import { baseSize, lineView, toScreen, trackAt, viewTransform, type HeadTrack } from "./camera";
import { CandleGlow, Doorway, Motes } from "./kit";
import { MatteVideo, Presenter, useFrameSource, type Look } from "./Presenter";
import { fitSize, goldStyle, plain, rich, textWidth } from "./text";

export type LineBeat = Extract<PromoBeat, { kind: "line" }>;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** How far the wall has fallen to night at beat frame f (0 = his real wall, 1 = candle-lit night). */
/** v2 (producer): the recorded wall is never replaced or darkened. The night look is kept below but switched off. */
export const nightAt = (_b: LineBeat, _f: number) => 0;

export const nightAtV1 = (b: LineBeat, f: number) => {
  const fall = (at: number) => Easing.inOut(Easing.cubic)(clamp01((f - at) / 12));
  switch (b.mood) {
    case "cold":
      return b.big ? 0.12 + 0.88 * fall(b.big.from - 3) : 0.12;
    case "button":
      return 0.42;
    case "tension":
    case "turn":
      return 1;
    default:
      return 0.7;
  }
};

const look = (night: number, mood: string, portrait: boolean): Look => {
  const warm = mood === "turn" ? 1 : 0.75;
  // night 0 = the picture exactly as graded: no relight, no rim, the wall behind the big word untouched
  if (night <= 0.001) return { exposure: 1, contrast: 1, saturation: 1, warmth: 0, rim: [1, 0.74, 0.4, 0], rimDir: portrait ? [-1, 0.25] : [-1, 0.2], wrap: [0.03, 0.15, 0.17, 0], bg: [1, 1, 0, 0] };
  return {
    exposure: 1.02 - 0.03 * night,
    contrast: 1.05 + 0.05 * night,
    saturation: 1.0 - 0.04 * night,
    warmth: 0.25 + 0.55 * night * warm,
    rim: [1, 0.74, 0.4, 0.75 * night * warm],
    // the candle sits low on the left: light arrives from the left, a little below
    rimDir: portrait ? [-1, 0.25] : [-1, 0.2],
    wrap: [0.03, 0.15, 0.17, 0.28 * night],
    bg: [0.7, 0.75, 0.35, 5],
  };
};

/** The giant word behind him: slams on its word, then drifts in depth at half the camera's motion. */
const Behind: React.FC<{ text: string; at: number; view: View; land: View; w: number; h: number; capY: number; faceX: number; faceNowX: number; headW: number }> = ({ text, at, view, land, w, h, capY, faceX, faceNowX, headW }) => {
  const f = useCurrentFrame();
  if (f < at - 1) return null;
  const portrait = h > w;
  const toks = rich(text);
  const gold = toks.some((t) => t.gold);
  const str = plain(text).toUpperCase();
  const k = f - at;
  const p = Easing.out(Easing.exp)(clamp01(k / 12));
  // depth: the word moves at a fraction of the camera — little sideways (the camera follows his head, so
  // the head stays in the word's gap), more in zoom and height
  const z = Math.pow(view.s / land.s, 0.55);
  // sideways it follows his head on screen (the camera may stop at the frame edge while he keeps moving)
  const dx = (faceNowX - faceX) * w * 0.9;
  const dy = -(view.y - land.y) * h * 0.45 * view.s;
  const safe = portrait ? 40 : 70;
  const maxW = w * (portrait ? 0.88 : 0.82);
  const maxH = portrait ? h * 0.13 : h * 0.34;
  // Several words PART around his head: the gap nearest his head opens to the head's width, so every letter
  // stays readable (a short word never loses its middle). One word stands above the cap instead.
  // (in a tall frame his head is half the width: the words stand above the cap instead)
  const parts = toks.length > 1 && headW < maxW * 0.3;
  let size = fitSize([str], parts ? maxW - headW : maxW, maxH, 900, FONT.sans, -0.01);
  let split = -1;
  let gapHead = 0;
  let nudge = 0;
  let lo = -Infinity;
  let hi = Infinity;
  for (let attempt = 0; attempt < 5 && parts; attempt++) {
    const widths = toks.map((t) => textWidth(t.text.toUpperCase(), size, 900, FONT.sans, -0.01));
    const g = 0.22 * size;
    gapHead = Math.max(g, headW * 1.08);
    let best = Infinity;
    let bestNudge = 0;
    for (let i = 0; i < toks.length - 1; i++) {
      const total = widths.reduce((x, y) => x + y, 0) + g * (toks.length - 2) + gapHead;
      const left0 = (w - total) / 2;
      const before = widths.slice(0, i + 1).reduce((x, y) => x + y, 0) + g * i;
      const centre = left0 + before + gapHead / 2;
      const want = faceX * w - centre;
      const l = safe - left0;
      const r = w - safe - (left0 + total);
      const got = Math.max(l, Math.min(r, want));
      const miss = Math.abs(want - got);
      if (miss < best) {
        best = miss;
        split = i;
        bestNudge = got;
        lo = l;
        hi = r;
      }
    }
    nudge = bestNudge;
    if (best < gapHead * 0.2) break;
    size *= 0.88; // shrink until the gap can reach his head
  }
  if (split < 0) {
    const total = textWidth(str, size, 900, FONT.sans, -0.01) + 0.22 * size * (toks.length - 1);
    lo = safe - (w - total) / 2;
    hi = -lo;
  }
  // following his head never pushes the word past the title-safe margins
  const shift = Math.max(lo, Math.min(hi, nudge + dx));
  // the cap covers the lower part of the letters when the word is split round him; a single word sits higher
  const top = Math.max(h * (portrait ? 0.055 : 0.05), capY * h - size * (split >= 0 ? 0.72 : portrait ? 1.14 : 0.98));
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          width: w,
          top,
          display: "flex",
          justifyContent: "center",
          transform: `translate(${shift}px, ${dy + (1 - p) * size * 0.18}px) scale(${(1.16 - 0.16 * p) * z})`,
          transformOrigin: `50% ${size * 0.6}px`,
          opacity: clamp01((k + 1) / 4),
        }}
      >
        <div
          style={{
            fontFamily: FONT.sans,
            fontWeight: 900,
            fontSize: size,
            lineHeight: 1,
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
            color: C.cream,
            filter: gold
              ? `drop-shadow(0 2px 3px rgba(5,6,13,0.8)) drop-shadow(0 0 ${size * 0.1}px rgba(5,6,13,0.55)) drop-shadow(0 ${size * 0.04}px ${size * 0.1}px rgba(5,6,13,0.6))`
              : `drop-shadow(0 2px 3px rgba(5,6,13,0.8)) drop-shadow(0 0 ${size * 0.1}px rgba(5,6,13,0.55)) drop-shadow(0 ${size * 0.04}px ${size * 0.14}px rgba(5,6,13,0.6))`,
          }}
        >
          {toks.map((t, i) => (
            <span key={i} style={{ marginRight: i === split ? gapHead : i < toks.length - 1 ? "0.22em" : 0, ...(t.gold ? goldStyle(f, at + 6) : { color: "rgba(255,244,222,0.94)" }) }}>
              {t.text.toUpperCase()}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export const LineScene: React.FC<{ b: LineBeat; plan: Plan; w: number; h: number }> = ({ b, plan, w, h }) => {
  const f = useCurrentFrame();
  const portrait = h > w;
  const aspect = w / h;
  // optional head track (proposed contract field, read defensively)
  const track = (b as LineBeat & { track?: HeadTrack }).track;
  const view = lineView(b.cam, b.snaps, f, b.dur, aspect, b.from, track);
  const night = b.matte ? nightAt(b, f) : 0;
  const lk = look(night, b.mood, portrait);
  const source = useFrameSource();
  // track entries are [beat frame, head x, cap top]; without one the plan's median face
  const capAt = (fr: number) => (track && track.length > 1 ? trackAt(track, fr)[1] : plan.face.y - plan.face.h / 2);
  const candle = { x: portrait ? 0.04 : 0.05, y: portrait ? 0.86 : 0.94 };

  if (!b.matte) {
    const vt = viewTransform(view, w, h);
    return (
      <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, overflow: "hidden", background: C.night }}>
        <OffthreadVideo
          src={staticFile(b.clip)}
          trimBefore={b.clipFrom}
          muted
          style={{ position: "absolute", left: vt.left, top: vt.top, width: vt.w, height: vt.h, transform: vt.transform }}
        />
        {/* candle wash from the low left, night pooling at the edges */}
      </div>
    );
  }

  // the cap top on screen at the frame the big word lands (the word is placed once, then drifts)
  const landAt = b.big ? b.big.from : 0;
  const land = lineView(b.cam, b.snaps, landAt, b.dur, aspect, b.from, track);
  // the views are centred on his head: its source x eases between the two keys
  const headX = (fr: number) => (track && track.length > 1 ? trackAt(track, fr)[0] : b.cam[0].x + (b.cam[1].x - b.cam[0].x) * Easing.inOut(Easing.sin)(clamp01(fr / Math.max(1, b.dur - 1))));
  const [, capY] = toScreen(land, aspect, headX(landAt), capAt(landAt));
  const [faceLandX] = toScreen(land, aspect, headX(landAt), plan.face.y);
  const [faceSX] = toScreen(view, aspect, headX(f), plan.face.y);
  const glowStrength = b.mood === "turn" ? 1.25 : 1;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, overflow: "hidden", background: C.ink }}>
      <MatteVideo src={b.clip} clipFrom={b.clipFrom} source={source} />
      <Presenter source={source} view={view} layer="bg" look={lk} w={w} h={h} />
      {night > 0.001 ? (
        <div style={{ position: "absolute", inset: 0, opacity: night }}>
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 95% 85% at ${candle.x * 100 + 20}% ${candle.y * 100 - 15}%, #0D3A42 0%, ${C.night} 45%, ${C.ink} 100%)` }} />
          <CandleGlow x={candle.x} y={candle.y} r={((portrait ? 0.62 : 0.52) * Math.max(w, h)) / w} intensity={glowStrength} seed={2} />
          <Motes count={portrait ? 34 : 42} seed={3} x={0} w={0.8} opacity={0.9} />
        </div>
      ) : null}
      {night > 0.001 && b.mood === "turn" ? <Doorway open={clamp01((f - 2) / 20)} x={faceSX} w={w * (portrait ? 0.4 : 0.17)} h={h * (portrait ? 0.62 : 0.84)} floor={portrait ? 0.7 : 0.97} seed={b.from} /> : null}
      {b.big ? <Behind text={b.big.text} at={b.big.from} view={view} land={land} w={w} h={h} capY={capY} faceX={faceLandX} faceNowX={faceSX} headW={(0.135 * w * land.s) / baseSize(aspect)[0]} /> : null}
      <Presenter source={source} view={view} layer="fg" look={lk} w={w} h={h} />
    </div>
  );
};
