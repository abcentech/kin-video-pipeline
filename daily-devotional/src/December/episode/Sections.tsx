/**
 * The non-body sections: COLD OPEN, TITLE STING, FILM, OUTRO.
 */
import React from "react";
import { AbsoluteFill, OffthreadVideo, useCurrentFrame } from "remotion";
import { BRAND, C, FONT, L } from "../theme";
import { T } from "../timing";
import type { DayMeta, Plan, Section } from "../types";
import { CameraVideo } from "./CameraVideo";
import { Captions, pageWords } from "./Captions";
import { FilmTag } from "./cues/Takeovers";
import { SideScrim } from "./cues/Side";
import { CandleRoom } from "./kit/Candle";
import { Dial } from "./kit/Dial";
import { Door } from "./kit/Door";
import { alpha, clamp01, eIn, eInOut, eOut, eOutQuint, ramp } from "./kit/ease";
import { CandleRule } from "./kit/Lines";
import { balanceLines, parseRich } from "./kit/rich";

// ───────────────────────────────────────────── COLD OPEN: hard in, tight, giant words in the free wall

export const ColdOpen: React.FC<{ sec: Extract<Section, { kind: "cold" }>; plan: Plan; src: string; audible: boolean }> = ({ sec, plan, src, audible }) => {
  const f = useCurrentFrame();
  const pages = React.useMemo(() => pageWords(sec.words), [sec.words]);
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <CameraVideo src={src} cam={sec.cam} face={plan.face} trimBefore={sec.bodyFrom} muted={!audible} />
      {sec.big.map((b, bi) => {
        const words = parseRich(b.text.toUpperCase().replace(/\*\*/g, "*"));
        const lines = words.map((w) => [w]);
        const longest = Math.max(...words.map((w) => w.text.length));
        const size = Math.round(Math.max(100, Math.min(180, 500 / (longest * 0.68))));
        const next = sec.big[bi + 1];
        const until = next && next.side === b.side ? next.from - 2 : sec.dur + 10;
        if (f < b.from - 2 || f > until) return null;
        const hold = ramp(f, b.from, sec.dur);
        const outK = next && next.side === b.side ? ramp(f, next.from - 6, next.from - 1) : 0;
        return (
          <AbsoluteFill key={bi}>
            <SideScrim side={b.side} k={eOut(ramp(f, b.from - 2, b.from + 3)) * (1 - outK)} strength={0.78} />
            <div style={{ position: "absolute", top: 0, bottom: 170, [b.side === "left" ? "left" : "right"]: L.safeX, width: 600, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: b.side === "left" ? "flex-start" : "flex-end" }}>
              {lines.map((ln, li) => {
                const a = b.from + li * 3;
                const k = eOutQuint(ramp(f, a - 1, a + 4));
                const flash = Math.max(0, 1 - Math.abs(f - a - 1) / 8);
                return (
                  <div
                    key={li}
                    style={{
                      fontFamily: FONT.sans,
                      fontWeight: 900,
                      fontSize: size,
                      lineHeight: 0.96,
                      letterSpacing: "-0.01em",
                      color: ln[0].gold ? C.gold : C.cream,
                      opacity: k * (1 - outK),
                      transformOrigin: b.side === "left" ? "left center" : "right center",
                      transform: `scale(${1.35 - 0.35 * k + 0.04 * hold})`,
                      textShadow: `0 0 ${20 + 40 * flash}px ${alpha(ln[0].gold ? C.gold : C.candle, 0.35 + 0.4 * flash)}, 0 2px 3px ${alpha(C.ink, 0.75)}, 0 0 18px ${alpha(C.ink, 0.8)}, 0 8px 34px ${alpha(C.ink, 0.7)}`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {ln[0].text}
                  </div>
                );
              })}
            </div>
          </AbsoluteFill>
        );
      })}
      <Captions pages={pages} />
    </AbsoluteFill>
  );
};

// ───────────────────────────────────────────── TITLE STING: black breath, the door, series name, the day's title, the dial winding to day N

export const TitleSting: React.FC<{ sec: Extract<Section, { kind: "title" }>; meta: DayMeta }> = ({ sec, meta }) => {
  const f = useCurrentFrame();
  const D = T.TITLE_DOOR;
  const H = T.TITLE_HIT;
  const open = Math.min(ramp(f, D, D + T.DOOR_IN), 1 - ramp(f, sec.dur - T.DOOR_OUT, sec.dur));
  if (f < D) return <AbsoluteFill style={{ background: C.ink }} />;
  const words = parseRich(meta.title.toUpperCase());
  const lines = balanceLines(words, 16, 2);
  const longest = Math.max(...lines.map((l) => l.map((w) => w.text).join(" ").length));
  const size = Math.round(Math.max(90, Math.min(128, 1500 / (longest * 0.68))));
  const land = eOutQuint(ramp(f, H - 8, H + 2));
  const flash = Math.max(0, 1 - Math.abs(f - H) / 14);
  const seriesK = eOut(ramp(f, H - 12, H + 4));
  // the dial winds: minute hand spins and the marks fill to day N, landing ~1.3 s after the title
  const wind = eInOut(ramp(f, H, H + 44));
  const dateK = eOut(ramp(f, H + 18, H + 32));
  const push = ramp(f, D, sec.dur);
  const fade = eIn(ramp(f, sec.dur - T.DOOR_OUT - 6, sec.dur - T.DOOR_OUT + 4));
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Door open={open} solid>
        <CandleRoom glowX={0.5} glowY={0.5} glowR={0.62} seed={81} motes={44} bloom={flash * 0.7} />
        <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: `scale(${1 + 0.035 * push})`, opacity: 1 - fade }}>
          <div style={{ opacity: eOut(ramp(f, D + 6, D + 20)), transform: `rotate(${(1 - wind) * -30}deg)` }}>
            <Dial size={150} day={meta.day} marks={meta.day * wind} minute={wind * 2 + (meta.day / meta.total) * wind} glow={0.3 + flash * 0.6} />
          </div>
          <div style={{ marginTop: 26, fontFamily: FONT.sans, fontWeight: 800, fontSize: 34, letterSpacing: `${0.14 + 0.2 * (1 - seriesK)}em`, color: C.gold, opacity: seriesK, textShadow: `0 0 20px ${alpha(C.gold, 0.4)}` }}>{BRAND.series}</div>
          <CandleRule width={360} progress={eOut(ramp(f, H - 4, H + 14))} glint={((f % 80) / 80) * 1.3} style={{ margin: "18px 0 22px" }} />
          {lines.map((ln, li) => (
            <div
              key={li}
              style={{
                fontFamily: FONT.sans,
                fontWeight: 900,
                fontSize: size,
                lineHeight: 1.0,
                letterSpacing: `${-0.01 + 0.06 * (1 - land)}em`,
                color: C.cream,
                whiteSpace: "nowrap",
                opacity: clamp01(land * 1.2),
                transform: `scale(${1.08 - 0.08 * land}) translateY(${(1 - land) * (20 + li * 10)}px)`,
                textShadow: `0 0 ${24 + 50 * flash}px ${alpha(C.candle, 0.3 + 0.45 * flash)}, 0 6px 30px ${alpha(C.ink, 0.6)}`,
              }}
            >
              {ln.map((w) => w.text).join(" ")}
            </div>
          ))}
          <div style={{ marginTop: 30, fontFamily: FONT.sans, fontWeight: 800, fontSize: 32, letterSpacing: "0.14em", color: C.candle, opacity: dateK, transform: `translateY(${(1 - dateK) * 12}px)` }}>
            {meta.dateLabel.toUpperCase()} <span style={{ color: alpha(C.cream, 0.6) }}>·</span> {meta.ref.toUpperCase()}
          </div>
        </AbsoluteFill>
      </Door>
    </AbsoluteFill>
  );
};

// ───────────────────────────────────────────── FILM SECTION: slate chip that becomes the corner tag; door closes into the body

export const FilmSection: React.FC<{ sec: Extract<Section, { kind: "film" }>; src: string; audible: boolean }> = ({ sec, src, audible }) => {
  const f = useCurrentFrame();
  const open = Math.min(ramp(f, 0, T.DOOR_IN), 1 - ramp(f, sec.dur - T.DOOR_OUT, sec.dur));
  const S = T.SLATE;
  const slateIn = eOut(ramp(f, 4, 18));
  const slateOut = eInOut(ramp(f, S - 14, S));
  const veil = 0.5 * (1 - eInOut(ramp(f, S - 18, S + 6)));
  const tag = eOut(ramp(f, S - 4, S + 10)) * (1 - ramp(f, sec.dur - T.DOOR_OUT - 8, sec.dur - T.DOOR_OUT));
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Door open={open} solid>
        <AbsoluteFill style={{ background: C.ink }}>
          <OffthreadVideo src={src} trimBefore={sec.srcFrom || undefined} muted={!audible} volume={audible ? 1 : 0} style={{ width: "100%", height: "100%" }} />
        </AbsoluteFill>
        <AbsoluteFill style={{ background: alpha(C.ink, veil) }} />
        {f < S + 2 ? (
          <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", paddingTop: 110, opacity: slateIn * (1 - slateOut), transform: `scale(${0.96 + 0.04 * slateIn + 0.02 * ramp(f, 0, S)})` }}>
            <div style={{ display: "flex", alignItems: "center", padding: "18px 34px 18px 22px", borderRadius: 999, background: alpha(C.night, 0.88), boxShadow: `inset 0 0 0 2px ${alpha(C.candle, 0.6)}, 0 20px 60px ${alpha(C.ink, 0.5)}` }}>
              <Dial size={64} minute={ramp(f, 0, S) * 0.2} face={0.5} weight={1.8} />
              <div style={{ marginLeft: 18, fontFamily: FONT.sans, fontWeight: 800, fontSize: 36, letterSpacing: "0.14em", color: C.candle, whiteSpace: "nowrap" }}>
                FROM THE FILM <span style={{ color: alpha(C.cream, 0.6) }}>·</span> <span style={{ color: C.cream }}>EIGHT O&apos;CLOCK</span>
              </div>
            </div>
          </AbsoluteFill>
        ) : null}
        <FilmTag k={tag} />
      </Door>
    </AbsoluteFill>
  );
};

export const Outro: React.FC<{ src: string; audible: boolean }> = ({ src, audible }) => (
  <AbsoluteFill style={{ background: C.ink }}>
    <OffthreadVideo src={src} muted={!audible} volume={audible ? 1 : 0} style={{ width: "100%", height: "100%" }} />
  </AbsoluteFill>
);
