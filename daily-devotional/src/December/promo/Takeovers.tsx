// The takeover beats of the promo pieces: the title sting, a film shot, the verse page, the end card.
// All arrive through the door of light and land on the shared frames in ../timing (the score hits them).
import React from "react";
import { Easing, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import { BRAND, C, FONT } from "../theme";
import { T } from "../timing";
import type { DayMeta, Plan, PromoBeat } from "../types";
import { clampView, viewTransform } from "./camera";
import { Dial, Door, Doorway, YouTubeMark, doorClose, doorOpen } from "./kit";
import { NightPage } from "./Page";
import { fitSize, goldStyle, label, rich, richLines, textWidth, type Tok } from "./text";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const outC = Easing.out(Easing.cubic);
const rise = (f: number, at: number, d = 12) => outC(clamp01((f - at) / d));

/** One line of words, each wiping up out of its own mask from `at` (staggered). */
const Wipe: React.FC<{ toks: Tok[]; at: number; stagger?: number; size: number; style?: React.CSSProperties; gold?: boolean }> = ({ toks, at, stagger = 2, size, style, gold }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ display: "flex", justifyContent: "center", whiteSpace: "nowrap", fontSize: size, ...style }}>
      {toks.map((t, i) => {
        const p = rise(f, at + i * stagger, 12);
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", padding: "0.06em 0.03em 0.1em", margin: "-0.06em -0.03em -0.1em", marginRight: i < toks.length - 1 ? "0.24em" : "-0.03em" }}>
            <span style={{ display: "inline-block", transform: `translateY(${(1 - p) * 110}%)`, ...(t.gold || gold ? goldStyle(f, at + i * stagger + 8) : null) }}>{t.text}</span>
          </span>
        );
      })}
    </div>
  );
};

const titleLines = (title: string, portrait: boolean): string[] => {
  const ws = title.toUpperCase().split(/\s+/);
  if (ws.length < 3) return [ws.join(" ")];
  // two lines, balanced by length (three in a tall frame if long)
  let best = 1;
  let bestD = Infinity;
  for (let i = 1; i < ws.length; i++) {
    const d = Math.abs(ws.slice(0, i).join(" ").length - ws.slice(i).join(" ").length);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const two = [ws.slice(0, best).join(" "), ws.slice(best).join(" ")];
  return portrait && Math.max(...two.map((l) => l.length)) > 14 && ws.length >= 4 ? [ws.slice(0, 2).join(" "), ws.slice(2, 4).join(" "), ws.slice(4).join(" ")].filter(Boolean) : two;
};

// ─────────────────────────────────────────────── title sting (T.TITLE_DUR_TRAILER)

export const TitleScene: React.FC<{ meta: DayMeta; w: number; h: number; dur: number }> = ({ meta, w, h, dur }) => {
  const f = useCurrentFrame();
  const portrait = h > w;
  const hit = T.TITLE_HIT_TRAILER;
  const open = doorOpen(f, T.TITLE_DOOR_TRAILER, T.DOOR_IN);
  const close = doorClose(f, dur, T.DOOR_OUT);
  const lines = titleLines(meta.title, portrait);
  const size = fitSize(lines, w * (portrait ? 0.86 : 0.76), portrait ? 132 : 150, 900, FONT.sans, -0.01);
  const dialSize = portrait ? 170 : 136;
  const wind = Easing.inOut(Easing.cubic)(clamp01((f - 6) / 34));
  const push = 1 + f * 0.0006;
  const series = BRAND.series;
  const track = 0.34 + 0.2 * (1 - rise(f, hit - 4, 18));
  const seriesSize = portrait ? 40 : 38;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, overflow: "hidden", background: C.ink }}>
      <Door solid open={Math.min(open, close)} w={w} h={h}>
      <NightPage w={w} h={h} glow={{ x: 0.5, y: portrait ? 0.46 : 0.5, r: portrait ? 0.5 : 0.55, s: 0.6 + 0.6 * rise(f, hit - 6, 20) }} motes={46} seed={7} />
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: portrait ? 34 : 22, transform: `scale(${push})` }}>
        <div style={{ opacity: rise(f, 8, 10), transform: `scale(${0.9 + 0.1 * rise(f, 8, 14)})` }}>
          <Dial size={dialSize} day={meta.day} wind={wind} minute={-1 + wind * 1.62} bloom={Math.exp(-Math.max(0, f - hit) / 10) * (f >= hit ? 1 : 0)} />
        </div>
        <div style={{ ...label(seriesSize, C.gold), letterSpacing: `${track}em`, marginRight: `-${track}em`, opacity: rise(f, hit - 4, 10), ...goldStyle(f, hit + 4) }}>{series}</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", fontFamily: FONT.sans, fontWeight: 900, letterSpacing: "-0.01em", lineHeight: 1.02, color: C.cream, filter: "drop-shadow(0 8px 30px rgba(5,6,13,0.6))" }}>
          {lines.map((l, i) => (
            <Wipe key={l} toks={rich(l)} at={hit + i * 4} size={size} />
          ))}
        </div>
        <div style={{ ...label(portrait ? 28 : 26, C.candle), opacity: rise(f, hit + 14, 10), marginRight: "-0.14em" }}>
          {`DAY ${meta.day} · ${meta.dateLabel} · ${meta.ref.toUpperCase()}`}
        </div>
      </div>
      </Door>
    </div>
  );
};

// ─────────────────────────────────────────────── a film shot

export const FilmScene: React.FC<{ b: Extract<PromoBeat, { kind: "film" }>; w: number; h: number; withSound: boolean }> = ({ b, w, h, withSound }) => {
  const f = useCurrentFrame();
  const portrait = h > w;
  // the motion-picture film carries its own subtitles low in the frame: in 9:16 (where the sides are cropped and a
  // subtitle would be cut mid-word) frame the upper 84 % so they fall outside the picture
  // (b.top9 lowers that share when the subtitle runs to three lines)
  const top = b.top9 ?? 0.8;
  const s = (portrait ? 1 / top : 1.03) + (f / Math.max(1, b.dur)) * 0.05;
  const view = clampView({ s, x: portrait ? b.focusX / 100 : 0.5, y: portrait ? top / 2 : 0.5 }, w / h);
  const vt = viewTransform(view, w, h);
  // a breath of candle light flares through on the cut in
  const flare = Math.exp(-f / 5) * (1 - Math.exp(-(f + 1) / 1.2));
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, overflow: "hidden", background: C.ink }}>
      <OffthreadVideo src={staticFile(b.src)} trimBefore={portrait && b.srcFrom9 != null ? b.srcFrom9 : b.srcFrom} muted={!withSound} style={{ position: "absolute", left: vt.left, top: vt.top, width: vt.w, height: vt.h, transform: vt.transform, filter: "contrast(1.04) saturate(0.96)" }} />
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 60% 80% at 20% 50%, rgba(255,210,140,${0.45 * flare}), transparent 70%)`, mixBlendMode: "screen" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: portrait ? 420 : 200, background: "linear-gradient(180deg, rgba(5,6,13,0.55), transparent)" }} />
      <div
        style={{
          position: "absolute",
          left: portrait ? 64 : 96,
          top: portrait ? 230 : 64,
          ...label(26, "rgba(255,244,222,0.9)"),
          opacity: rise(f, 4, 10),
          textShadow: "0 2px 12px rgba(0,0,0,0.6)",
        }}
      >
        <span style={{ color: C.candle }}>FROM THE FILM</span> · EIGHT O&apos;CLOCK
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────── the verse page

export const VerseScene: React.FC<{ b: Extract<PromoBeat, { kind: "verse" }>; meta: DayMeta; plan: Plan; w: number; h: number; withSound: boolean }> = ({ b, meta, plan, w, h, withSound }) => {
  const f = useCurrentFrame();
  const portrait = h > w;
  // a full 9:16 frame, or the short's 4:5 presenter window
  const tall = h > 1600;
  const open = doorOpen(f, 0, T.DOOR_IN);
  const close = doorClose(f, b.dur, T.DOOR_OUT);
  const toks = rich(b.text);
  const lit = (i: number) => b.lit[i] ?? b.lit[b.lit.length - 1] ?? 20 + i * 11;
  const lastLit = lit(toks.length - 1);
  const settled = rise(f, lastLit + 14, 16); // reading ended: the rest falls back, the phrase holds alone
  const hit = b.hit ?? (toks.findIndex((t) => t.em) >= 0 ? lit(toks.findIndex((t) => t.em)) : undefined);
  const maxW = portrait ? 860 : 1420;
  // as large as the longest sense-line allows (60–84 px; the tall frame wraps instead of shrinking below 64)
  const sense = richLines(b.text).map((l) => l.map((t) => t.text).join(" "));
  const size = portrait ? Math.max(64, Math.min(84, fitSize(sense, maxW / 1.08, 84, 500, FONT.serif))) : Math.max(60, Math.min(98, fitSize(sense, maxW / 1.1, 98, 500, FONT.serif)));
  // sense-lines from `|`; in the tall frame a sense-line still wraps if it is wider than the column
  const lines: Tok[][] = [];
  for (const line of richLines(b.text)) {
    let cur: Tok[] = [];
    let wd = 0;
    for (const t of line) {
      const tw = textWidth(t.text + " ", size, 500, FONT.serif);
      if (cur.length && wd + tw > maxW) {
        lines.push(cur);
        cur = [];
        wd = 0;
      }
      cur.push(t);
      wd += tw;
    }
    if (cur.length) lines.push(cur);
  }
  const minute = hit === undefined ? 0.62 : 0.62 + 0.38 * Easing.inOut(Easing.cubic)(clamp01((f - (hit - 24)) / 24));
  const bloom = hit === undefined ? 0 : f >= hit ? Math.exp(-(f - hit) / 18) : 0;
  const face = plan.face;
  let idx = 0;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, overflow: "hidden", background: C.ink }}>
      <Door solid open={Math.min(open, close)} w={w} h={h}>
      <NightPage w={w} h={h} glow={{ x: portrait ? 0.12 : 0.08, y: portrait ? 0.6 : 0.62, r: portrait ? 0.55 : 0.5, s: 1 + 0.5 * bloom }} motes={38} seed={11} />
      {b.read ? (
        // he stays ~18 % visible behind the Word: it is spoken by a person
        <Sequence from={b.read.at} durationInFrames={b.read.frames} layout="none">
          <ReaderGhost src={b.read.clip} clipFrom={b.read.clipFrom} w={w} h={h} face={face} withSound={withSound} />
        </Sequence>
      ) : null}
      <div style={{ position: "absolute", left: portrait ? 64 : 96, top: portrait ? (tall ? 250 : 80) : 70, display: "flex", alignItems: "center", gap: portrait ? 22 : 18, opacity: rise(f, 8, 10) }}>
        <Dial size={portrait ? 104 : 96} day={meta.day} minute={minute} bloom={bloom} />
        <div style={{ ...label(portrait ? 34 : 32, C.gold), ...goldStyle(f, 10) }}>{b.ref.toUpperCase()}</div>
      </div>
      <div
        style={{
          position: "absolute",
          left: portrait ? 80 : 250,
          width: portrait ? 900 : 1440,
          top: portrait ? (tall ? 400 : 190) : 0,
          height: portrait ? (tall ? 900 : 800) : h,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: size * 0.18,
          fontFamily: FONT.serif,
          fontWeight: 500,
          fontSize: size,
          lineHeight: 1.16,
          color: C.cream,
          transform: `translateY(${(1 - rise(f, 6, 18)) * 18}px)`,
        }}
      >
        {lines.map((line, li) => (
          <div key={li} style={{ display: "flex", flexWrap: "nowrap", whiteSpace: "nowrap" }}>
            {line.map((t, wi) => {
              const i = idx++;
              const at = lit(i);
              const on = clamp01((f - at + 2) / 6);
              const em = t.em;
              const land = em && hit !== undefined ? rise(f, hit, 10) : 0;
              const base = 0.34 + 0.66 * on;
              const op = em ? base : base * (1 - settled) + 0.22 * settled;
              const ul = em && hit !== undefined ? clamp01((f - hit - 2 - (i - toks.findIndex((x) => x.em)) * 2) / 10) : 0;
              return (
                <span key={wi} style={{ position: "relative", display: "inline-block", marginRight: wi < line.length - 1 ? "0.26em" : 0, fontSize: `${1 + 0.12 * land}em`, opacity: op, ...(em && land > 0 ? goldStyle(f, hit! + 2) : null) }}>
                  {t.text}
                  {em && ul > 0 ? (
                    <svg style={{ position: "absolute", left: "-2%", bottom: "-0.1em", width: wi < line.length - 1 && line[wi + 1].em ? "calc(100% + 0.3em)" : "104%", height: "0.2em", overflow: "visible" }} viewBox="0 0 100 10" preserveAspectRatio="none">
                      <path d="M1 6 C 20 3, 45 8, 70 5 S 95 4, 99 6" stroke={C.gold} strokeWidth={2.6} fill="none" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - ul} vectorEffect="non-scaling-stroke" />
                    </svg>
                  ) : null}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      </Door>
    </div>
  );
};

const ReaderGhost: React.FC<{ src: string; clipFrom: number; w: number; h: number; face: Plan["face"]; withSound: boolean }> = ({ src, clipFrom, w, h, face, withSound }) => {
  const f = useCurrentFrame();
  const portrait = h > w;
  const view = clampView({ s: portrait ? 1.0 : 1.12, x: portrait ? face.x : Math.min(0.62, face.x + 0.12), y: 0.5 }, w / h);
  const vt = viewTransform(view, w, h);
  const a = 0.16 * rise(f, 0, 14);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: a, filter: "grayscale(0.7) sepia(0.3) brightness(0.7) blur(2px)" }}>
      <OffthreadVideo src={staticFile(src)} trimBefore={clipFrom} muted={!withSound} style={{ position: "absolute", left: vt.left, top: vt.top, width: vt.w, height: vt.h, transform: vt.transform }} />
    </div>
  );
};

// ─────────────────────────────────────────────── the end cards

export const EndScene: React.FC<{ meta: DayMeta; w: number; h: number; dur: number; variant: "trailer" | "short" }> = ({ meta, w, h, dur, variant }) => {
  const f = useCurrentFrame();
  const portrait = h > w;
  const hit = variant === "trailer" ? T.END_HIT_TRAILER : 6;
  const open = doorOpen(f, 0, variant === "trailer" ? T.DOOR_IN : 10);
  const lines = titleLines(meta.title, portrait);
  const size = fitSize(lines, w * (portrait ? 0.8 : 0.6), portrait ? 104 : 104, 900, FONT.sans, -0.01);
  const fade = variant === "short" ? 1 : 1 - clamp01((f - (dur - 8)) / 8);
  const doorW = (portrait ? 0.3 : 0.2) * w;
  // tall frame: the door stands in the upper half, the card sits on its floor light below (clear of the UI below y 1500)
  const top = portrait ? h * 0.5 : 0;
  const bottom = portrait ? h - 1480 : 0;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, overflow: "hidden", background: C.ink, opacity: fade }}>
      <Door solid open={open} w={w} h={h}>
      <NightPage w={w} h={h} glow={{ x: 0.5, y: portrait ? 0.42 : 0.42, r: 0.5, s: 0.8 }} motes={44} seed={19} />
      {/* the door stands open behind the title, light pouring out */}
      <Doorway open={rise(f, 2, 24)} x={0.5} w={doorW} h={portrait ? h * 0.32 : h * 0.62} floor={portrait ? 0.48 : 0.78} seed={9} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 55% at 50% 50%, rgba(5,6,13,0.45), transparent 75%)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top, bottom, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: portrait ? 30 : 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, opacity: rise(f, hit - 6, 10) }}>
          <Dial size={portrait ? 84 : 64} day={meta.day} minute={(f / 90) % 1} bloom={0.2} />
          <div style={{ ...label(portrait ? 34 : 30, C.gold), ...goldStyle(f, hit) }}>{`DAY ${meta.day} · ${meta.dateLabel}`}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", fontFamily: FONT.sans, fontWeight: 900, lineHeight: 1.02, letterSpacing: "-0.01em", color: C.cream, filter: "drop-shadow(0 8px 30px rgba(5,6,13,0.6))" }}>
          {lines.map((l, i) => (
            <Wipe key={l} toks={rich(l)} at={hit + i * 3} size={size} />
          ))}
        </div>
        <div style={{ width: (portrait ? 520 : 560) * rise(f, hit + 8, 14), height: 2, background: `linear-gradient(90deg, transparent, ${C.candle}, transparent)` }} />
        <div style={{ fontFamily: FONT.serif, fontWeight: 500, fontSize: portrait ? 52 : 46, color: C.cream, opacity: rise(f, hit + 12, 12), transform: `translateY(${(1 - rise(f, hit + 12, 12)) * 12}px)` }}>
          {variant === "trailer" ? "Watch tonight’s devotional" : "Full devotional on YouTube"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: portrait ? 18 : 10, opacity: rise(f, hit + 18, 12), transform: `translateY(${(1 - rise(f, hit + 18, 12)) * 12}px)` }}>
          <YouTubeMark size={portrait ? 74 : 60} />
          <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: portrait ? 44 : 38, color: C.cream, letterSpacing: "0.005em" }}>{BRAND.handle}</div>
        </div>
      </div>
      <Img src={staticFile(BRAND.logo)} style={{ position: "absolute", height: portrait ? 70 : 62, ...(portrait ? { left: w / 2, top: 140, transform: "translateX(-50%)" } : { right: 96, top: 60 }), opacity: 0.9 * rise(f, hit + 4, 14) }} />
      </Door>
    </div>
  );
};
