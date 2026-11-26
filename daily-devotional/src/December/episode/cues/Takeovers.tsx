/**
 * Takeovers that are not scripture/chapter/art: FILM cutaway, RESPONSE, PRAYER, DECLARE, RECAP, NEXT (end card).
 * Every one enters through the door of light and leaves the same way.
 */
import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import { BRAND, C, FONT, L } from "../../theme";
import { T } from "../../timing";
import type { Cue, DayMeta } from "../../types";
import { CandleRoom, Motes } from "../kit/Candle";
import { Dial } from "../kit/Dial";
import { Door, doorContent, doorFor } from "../kit/Door";
import { Doorway } from "../kit/Doorway";
import { alpha, clamp01, eBack, eInOut, eOut, eOutQuint, mix, ramp } from "../kit/ease";
import { YouTubeMark } from "../kit/Icons";
import { CandleRule } from "../kit/Lines";
import { balanceLines, fitSize, parseRich } from "../kit/rich";

const Chip: React.FC<{ text: string; k: number; style?: React.CSSProperties }> = ({ text, k, style }) => (
  <div style={{ display: "inline-flex", alignItems: "center", padding: "8px 18px 8px 14px", borderRadius: 999, background: alpha(C.night, 0.85), boxShadow: `inset 0 0 0 1.5px ${alpha(C.candle, 0.6)}`, opacity: k, transform: `translateY(${(1 - k) * -14}px)`, ...style }}>
    <Dial size={34} minute={0.0} face={0.4} weight={2.2} />
    <div style={{ marginLeft: 12, fontFamily: FONT.sans, fontWeight: 800, fontSize: 26, letterSpacing: "0.14em", color: C.candle, whiteSpace: "nowrap" }}>{text}</div>
  </div>
);

export const FilmTag: React.FC<{ k: number }> = ({ k }) => (
  <div style={{ position: "absolute", left: L.safeX, top: L.safeTop, display: "flex", alignItems: "center", opacity: 0.85 * k, padding: "6px 14px 6px 10px", borderRadius: 999, background: alpha(C.ink, 0.45) }}>
    <Dial size={34} minute={0} face={0.4} weight={2.2} />
    <div style={{ marginLeft: 10, fontFamily: FONT.sans, fontWeight: 800, fontSize: 26, letterSpacing: "0.14em", color: C.cream, whiteSpace: "nowrap" }}>
      EIGHT O&apos;CLOCK <span style={{ color: C.candle }}>· THE FILM</span>
    </div>
  </div>
);

export const FilmCut: React.FC<{ cue: Extract<Cue, { kind: "film" }>; src: string }> = ({ cue, src }) => {
  const f = useCurrentFrame();
  const open = doorFor(f, cue.dur);
  const push = 1.02 + 0.04 * ramp(f, 0, cue.dur);
  return (
    <Door open={open}>
      <AbsoluteFill style={{ background: C.ink, overflow: "hidden" }}>
        <AbsoluteFill style={{ transform: `scale(${push})` }}>
          <OffthreadVideo src={src} trimBefore={cue.srcFrom || undefined} muted volume={0} style={{ width: "100%", height: "100%" }} />
        </AbsoluteFill>
        <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 80% at 50% 50%, transparent 55%, ${alpha(C.ink, 0.45)} 100%)` }} />
        <FilmTag k={doorContent(open)} />
      </AbsoluteFill>
    </Door>
  );
};

// ───────────────────────────────────────────── RESPONSE: two leaves of paper, sentences write on as he says them

/** wrap for Fraunces 500 at `size` in `width` px (conservative advance: 0.53 em per character) */
const wrap = (text: string, size: number, width: number) => {
  const max = Math.floor(width / (size * 0.53));
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/)) {
    if (cur && (cur + " " + w).length > max) {
      out.push(cur);
      cur = w;
    } else cur = cur ? cur + " " + w : w;
  }
  if (cur) out.push(cur);
  return out;
};

const LEAF_W = 700;
const LEAF_PAD_X = 50;
const TEXT_W = LEAF_W - 2 * LEAF_PAD_X;
const TEXT_H = 430;
/** one size for both leaves: the largest (≤ 44, ≥ 34) at which every line fits the leaf */
const fitLeaves = (texts: string[]) => {
  for (let s = 44; s >= 34; s -= 1) {
    if (texts.every((t) => wrap(t, s, TEXT_W).length * s * 1.3 <= TEXT_H)) return s;
  }
  return 34;
};

const Leaf: React.FC<{ label: string; text: string; size: number; lines: number; from: number; to: number; f: number; tilt: number; enter: number; seed: number }> = ({ label, text, size, lines: nLines, from, to, f, tilt, enter, seed }) => {
  const lines = wrap(text, size, TEXT_W);
  const words = lines.map((ln) => ln.split(" "));
  const total = text.replace(/\s+/g, " ").length;
  // write-on: whole words appear in reading order across [from, to] (a touch ahead so it is done as he finishes)
  const p = ramp(f, from - 4, Math.max(from + 10, to - 6));
  const budget = p * total;
  const k = eOut(ramp(f, enter, enter + 16));
  const done = ramp(f, to - 6, to + 10);
  let pos = 0;
  return (
    <div
      style={{
        width: LEAF_W,
        padding: `40px ${LEAF_PAD_X}px 50px`,
        borderRadius: 10,
        background: `linear-gradient(160deg, #FFF8E8 0%, ${C.cream} 45%, #F3E3C2 100%)`,
        boxShadow: `0 30px 70px ${alpha(C.ink, 0.6)}, 0 0 ${30 + 30 * done}px ${alpha(C.candle, 0.25 + 0.2 * done)}, inset 0 0 60px ${alpha("#C9A46A", 0.35)}`,
        transform: `translateY(${(1 - k) * 70}px) rotate(${tilt * (0.6 + 0.4 * k)}deg)`,
        opacity: clamp01(k * 1.4),
        position: "relative",
      }}
    >
      <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 26, letterSpacing: "0.14em", color: C.wall }}>{label}</div>
      <div style={{ width: 120, height: 3, background: C.candle, margin: "12px 0 22px", borderRadius: 2 }} />
      <div style={{ height: nLines * size * 1.3 }}>
        {words.map((ln, i) => (
          <div key={i} style={{ fontFamily: FONT.serif, fontWeight: 500, fontSize: size, lineHeight: 1.3, color: C.night, whiteSpace: "nowrap" }}>
            {ln.map((w, j) => {
              const start = pos;
              pos += w.length + 1;
              const v = clamp01((budget - start) / Math.max(4, w.length));
              const show = eOut(clamp01(v * 1.6));
              return (
                <span key={j} style={{ display: "inline-block", marginRight: j < ln.length - 1 ? "0.26em" : 0, opacity: show, transform: `translateY(${(1 - show) * 6}px)`, textShadow: show > 0 && show < 1 ? `0 0 12px ${alpha(C.candle, 0.6)}` : undefined }}>
                  {w}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", right: 28, bottom: 18, opacity: done }}>
        <Dial size={46} minute={0} face={0.85} weight={2} hours={[8]} hoursLit={[1]} />
      </div>
      {/* a faint paper grain */}
      <div style={{ position: "absolute", inset: 0, borderRadius: 10, background: `repeating-linear-gradient(${seed * 37}deg, ${alpha("#8A6A3A", 0.03)} 0px, transparent 2px, transparent 5px)` }} />
    </div>
  );
};

export const Response: React.FC<{ cue: Extract<Cue, { kind: "response" }> }> = ({ cue }) => {
  const f = useCurrentFrame();
  const open = doorFor(f, cue.dur);
  const both = !!(cue.child && cue.father);
  const rel = (x: number) => x - cue.from;
  const drift = ramp(f, 0, cue.dur);
  const texts = [cue.child?.text, cue.father?.text].filter((t): t is string => !!t);
  const size = fitLeaves(texts);
  const nLines = Math.max(...texts.map((t) => wrap(t, size, TEXT_W).length));
  return (
    <Door open={open}>
      <CandleRoom glowX={0.5} glowY={0.5} glowR={0.7} seed={31} motes={30} />
      <AbsoluteFill style={{ display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "center", paddingBottom: L.captionBand, transform: `translateY(${-6 * drift}px)` }}>
        {cue.child ? (
          <div style={{ marginRight: both ? 48 : 0 }}>
            <Leaf label="FOR A CHILD" text={cue.child.text} size={size} lines={nLines} from={rel(cue.child.from)} to={rel(cue.child.to)} f={f} tilt={-2.2} enter={both ? 6 : 8} seed={1} />
          </div>
        ) : null}
        {cue.father ? <Leaf label="FOR A FATHER" text={cue.father.text} size={size} lines={nLines} from={rel(cue.father.from)} to={rel(cue.father.to)} f={f} tilt={1.6} enter={both ? Math.max(14, rel(cue.father.from) - 24) : 8} seed={2} /> : null}
      </AbsoluteFill>
    </Door>
  );
};

// ───────────────────────────────────────────── PRAYER: the picture stays as recorded; each line rides its own night plate

export const Prayer: React.FC<{ cue: Extract<Cue, { kind: "prayer" }> }> = ({ cue }) => {
  const f = useCurrentFrame();
  const open = doorFor(f, cue.dur);
  const lines = cue.lines.map((l) => ({ ...l, a: l.from - cue.from, b: l.to - cue.from, rows: prayerRows(l.text) }));
  const chip = eOut(ramp(f, 8, 22));
  return (
    <Door open={open} light={0.8}>
      {/* nothing is laid over the recorded picture (no veil, no floor of shade): the words carry their own plate,
          like the captions do. Until 2026-11-25 the lower 42 % fell to 86 % ink here. */}
      <AbsoluteFill style={{ opacity: doorContent(open) }}>
        <div style={{ position: "absolute", top: L.safeTop + 10, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <Chip text={"LET'S PRAY"} k={chip} />
        </div>
        {lines.map((l, i) => {
          const next = lines[i + 1];
          const inK = eInOut(ramp(f, l.a - 6, l.a + 12));
          const endAt = next ? next.a - 4 : cue.dur - T.DOOR_OUT;
          const outK = eInOut(ramp(f, endAt - 10, endAt + 4));
          const op = inK * (1 - outK);
          if (op <= 0.001) return null;
          const lift = ramp(f, l.a, endAt);
          return (
            <div key={i} style={{ position: "absolute", left: 0, right: 0, bottom: 132, display: "flex", justifyContent: "center", opacity: op, transform: `translateY(${(1 - inK) * 16 - lift * 8 - outK * 18}px)` }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 44px 20px", borderRadius: 18, background: alpha(C.night, 0.86), boxShadow: `0 10px 34px ${alpha(C.ink, 0.28)}, inset 0 2px 0 ${alpha(C.candle, 0.55)}` }}>
              {l.rows.map((r, j) => (
                <div key={j} style={{ fontFamily: FONT.serif, fontWeight: 460, fontSize: 52, lineHeight: 1.3, color: C.cream, whiteSpace: "nowrap", textShadow: `0 0 30px ${alpha(C.candle, 0.3)}, 0 3px 16px ${alpha(C.ink, 0.85)}` }}>
                  {r}
                </div>
              ))}
              </div>
            </div>
          );
        })}
      </AbsoluteFill>
    </Door>
  );
};

/** a prayer line as ≤ 2 balanced rows of ≤ 46 characters */
const prayerRows = (text: string) => {
  if (text.length <= 46) return [text];
  const ws = text.split(/\s+/);
  let best = [text];
  let score = Infinity;
  for (let c = 1; c < ws.length; c++) {
    const a = ws.slice(0, c).join(" ");
    const b = ws.slice(c).join(" ");
    const sc = Math.max(a.length, b.length) + (/[,;:]$/.test(ws[c - 1]) ? -4 : 0);
    if (sc < score) {
      score = sc;
      best = [a, b];
    }
  }
  return best;
};

// ───────────────────────────────────────────── DECLARE: SAY IT WITH US → word by word, the door bursts open behind it

export const Declare: React.FC<{ cue: Extract<Cue, { kind: "declare" }> }> = ({ cue }) => {
  const f = useCurrentFrame();
  const open = doorFor(f, cue.dur);
  const words = parseRich(cue.text.toUpperCase().replace(/\*\*/g, "*"));
  const at = (i: number) => (cue.lit[i] ?? cue.from + T.DOOR_IN + i * 11) - cue.from;
  const first = at(0);
  const last = at(words.length - 1);
  const lines = balanceLines(words, 16, 3);
  const longest = Math.max(...lines.map((l) => l.map((w) => w.text).join(" ").length));
  const size = Math.round(fitSize(longest, 1560, 136, 80));
  const doorOpenK = ramp(f, first - 4, first + 18);
  const burst = eOut(ramp(f, last - 2, last + 16)) * (1 - 0.35 * ramp(f, last + 16, cue.dur));
  const chip = eOut(ramp(f, 4, 16)) * (1 - ramp(f, first + 30, first + 44) * 0.0);
  const hold = ramp(f, last, cue.dur);
  return (
    <Door open={open}>
      <CandleRoom glowX={0.5} glowY={0.6} glowR={0.5} seed={51} motes={0} intensity={0.8} />
      <Doorway open={doorOpenK} burst={burst} w={300} h={600} floor={0.86} />
      <Motes count={46} seed={52} x={0.25} w={0.5} speed={30} opacity={0.4 + 0.6 * burst} />
      {/* a soft night halo behind the letters so they stay perfectly legible over the bright opening */}
      <AbsoluteFill style={{ opacity: eOut(ramp(f, first - 6, first + 4)), background: `radial-gradient(ellipse 58% 26% at 50% 53%, ${alpha(C.ink, 0.74)} 0%, ${alpha(C.ink, 0.45)} 55%, transparent 100%)` }} />
      <AbsoluteFill style={{ opacity: doorContent(open) }}>
        <div style={{ position: "absolute", top: L.safeTop + 10, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <Chip text="SAY IT WITH US" k={chip} />
        </div>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", paddingTop: 30, transform: `scale(${1 + 0.025 * hold})` }}>
          {lines.map((line, li) => (
            <div key={li} style={{ display: "flex", whiteSpace: "nowrap" }}>
              {line.map((w, i) => {
                const a = at(w.i);
                const k = eOutQuint(ramp(f, a - 2, a + 6));
                const flash = Math.max(0, 1 - Math.abs(f - a - 2) / 10);
                return (
                  <span
                    key={i}
                    style={{
                      display: "inline-block",
                      fontFamily: FONT.sans,
                      fontWeight: 900,
                      fontSize: size,
                      lineHeight: 1.04,
                      letterSpacing: "-0.01em",
                      marginRight: i < line.length - 1 ? "0.22em" : 0,
                      color: w.gold ? C.gold : C.cream,
                      opacity: k,
                      transform: `scale(${1.22 - 0.22 * k}) translateY(${(1 - k) * 12}px)`,
                      textShadow: `0 0 ${18 + 36 * flash}px ${alpha(w.gold ? C.gold : C.candle, 0.4 + 0.4 * flash)}, 0 6px 30px ${alpha(C.ink, 0.85)}, 0 2px 4px ${alpha(C.ink, 0.6)}`,
                    }}
                  >
                    {w.text}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </Door>
  );
};

// ───────────────────────────────────────────── RECAP: TONIGHT + the three truths, a tick lighting per line

export const Recap: React.FC<{ cue: Extract<Cue, { kind: "recap" }>; day: number }> = ({ cue, day }) => {
  const f = useCurrentFrame();
  const open = doorFor(f, cue.dur);
  const at = (i: number) => T.RECAP_LINES[i] ?? 30 + i * 40;
  const hours = [4, 8, 0];
  const lit = cue.items.map((_, i) => eOut(ramp(f, at(i), at(i) + 8)));
  // minute hand steps to each lit tick
  let minute = 0;
  cue.items.forEach((_, i) => {
    minute += (1 / 3) * eInOut(ramp(f, at(i) - 6, at(i) + 4));
  });
  const drift = ramp(f, 0, cue.dur);
  return (
    <Door open={open}>
      <CandleRoom glowX={0.24} glowY={0.52} glowR={0.55} seed={61} motes={34} />
      <AbsoluteFill style={{ opacity: doorContent(open), transform: `translateY(${-6 * drift}px)` }}>
        <div style={{ position: "absolute", left: 150, top: 240 }}>
          <Dial size={400} day={day} marks={0} minute={minute} hours={hours} hoursLit={lit} glow={0.35 + 0.25 * lit.reduce((a, b) => a + b, 0) / 3} />
        </div>
        <div style={{ position: "absolute", left: 680, right: L.safeX, top: 0, bottom: 60, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 32, letterSpacing: "0.14em", color: C.candle, opacity: eOut(ramp(f, 6, 18)) }}>{(cue.title || "TONIGHT").toUpperCase()}</div>
          <CandleRule width={380} progress={eOut(ramp(f, 8, 28))} glint={((f % 90) / 90) * 1.3} style={{ margin: "16px 0 30px" }} />
          {cue.items.map((it, i) => {
            const k = eOut(ramp(f, at(i) - 2, at(i) + 12));
            const words = balanceLines(parseRich(it), 26, 2);
            return (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", marginBottom: 30, opacity: k, transform: `translateX(${(1 - k) * 30}px)` }}>
                <div style={{ marginTop: 10, marginRight: 22 }}>
                  <svg width={36} height={36} viewBox="0 0 36 36">
                    <circle cx={18} cy={18} r={15} fill="none" stroke={alpha(C.candle, 0.6)} strokeWidth={2} />
                    <line x1={18} y1={5} x2={18} y2={13} stroke={mix(C.cream, C.gold, lit[i])} strokeWidth={4} strokeLinecap="round" />
                    <circle cx={18} cy={18} r={4} fill={mix(C.candle, C.gold, lit[i])} />
                  </svg>
                </div>
                <div>
                  {words.map((ln, j) => (
                    <div key={j} style={{ fontFamily: FONT.sans, fontWeight: 900, fontSize: 54, lineHeight: 1.12, color: C.cream, whiteSpace: "nowrap" }}>
                      {ln.map((w, wi) => (
                        <span key={wi} style={{ color: w.gold ? C.gold : C.cream, marginRight: wi < ln.length - 1 ? "0.24em" : 0 }}>
                          {w.text}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </Door>
  );
};

// ───────────────────────────────────────────── NEXT: the end card (opaque — covers the frames after the body video ends)

export const Next: React.FC<{ cue: Extract<Cue, { kind: "next" }>; meta: DayMeta }> = ({ cue, meta }) => {
  const f = useCurrentFrame();
  const open = Math.min(ramp(f, 0, T.DOOR_IN), 1 - ramp(f, cue.dur - T.DOOR_OUT, cue.dur));
  const H = T.NEXT_HIT;
  const nx = meta.next;
  const k = (d: number) => eOut(ramp(f, H - 8 + d, H + 8 + d));
  const loader = (f / 90) % 1;
  const safeguard = !!(cue as { safeguard?: boolean }).safeguard;
  const titleWords = balanceLines(parseRich((nx?.title ?? "See you tomorrow").toUpperCase()), 18, 2);
  const longest = Math.max(...titleWords.map((l) => l.map((w) => w.text).join(" ").length));
  const tSize = Math.round(fitSize(longest, 1060, 92, 60));
  const press = f >= H + 70 && f < H + 76 ? 0.94 : 1;
  const drift = ramp(f, 0, cue.dur);
  return (
    <Door open={open} solid={f > cue.dur / 2}>
      <CandleRoom glowX={0.2} glowY={0.45} glowR={0.6} seed={71} motes={40} />
      <AbsoluteFill style={{ transform: `translateY(${-6 * drift}px)` }}>
        {/* the dial as loader */}
        <div style={{ position: "absolute", left: 150, top: 200, opacity: k(0), transform: `scale(${0.85 + 0.15 * eBack(ramp(f, H - 10, H + 6))})` }}>
          <Dial size={360} day={nx?.day ?? meta.day + 1} marks={(nx?.day ?? meta.day + 1) * eInOut(ramp(f, H, H + 30))} minute={loader} glow={0.4} />
        </div>
        <div style={{ position: "absolute", left: 640, right: L.safeX, top: 190 }}>
          <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 32, letterSpacing: "0.14em", color: C.candle, opacity: k(0), whiteSpace: "nowrap" }}>
            TOMORROW · DAY {nx?.day ?? meta.day + 1}
            {nx?.dateLabel ? <span style={{ color: alpha(C.cream, 0.7) }}> · {nx.dateLabel}</span> : null}
          </div>
          <CandleRule width={460} progress={k(2)} glint={((f % 100) / 100) * 1.3} style={{ margin: "16px 0 22px" }} />
          {titleWords.map((ln, i) => (
            <div key={i} style={{ fontFamily: FONT.sans, fontWeight: 900, fontSize: tSize, lineHeight: 1.04, letterSpacing: "-0.01em", color: C.cream, whiteSpace: "nowrap", opacity: k(4 + i * 4), transform: `translateY(${(1 - k(4 + i * 4)) * 30}px)` }}>
              {ln.map((w) => w.text).join(" ")}
            </div>
          ))}
          {nx?.ref ? <div style={{ marginTop: 20, fontFamily: FONT.sans, fontWeight: 800, fontSize: 36, letterSpacing: "0.12em", color: C.gold, opacity: k(12) }}>{nx.ref.toUpperCase()}</div> : null}
          {/* subscribe */}
          <div style={{ marginTop: 40, display: "flex", alignItems: "center", opacity: k(20), transform: `translateY(${(1 - k(20)) * 20}px)` }}>
            <YouTubeMark size={64} />
            <div style={{ marginLeft: 16, marginRight: 24, fontFamily: FONT.sans, fontWeight: 800, fontSize: 36, color: C.cream }}>{BRAND.handle}</div>
            <div style={{ padding: "12px 24px 11px", borderRadius: 12, background: f >= H + 72 ? alpha(C.cream, 0.16) : C.ember, transform: `scale(${press})`, boxShadow: f >= H + 72 ? `inset 0 0 0 2px ${alpha(C.cream, 0.4)}` : `0 6px 22px ${alpha(C.ember, 0.5)}`, fontFamily: FONT.sans, fontWeight: 800, fontSize: 28, letterSpacing: "0.06em", color: C.cream }}>
              {f >= H + 72 ? "SUBSCRIBED" : "SUBSCRIBE"}
            </div>
          </div>
        </div>
        {/* the prayer ribbon + site */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: safeguard ? 118 : 84, display: "flex", justifyContent: "center", opacity: k(28) }}>
          <div style={{ display: "flex", alignItems: "center", padding: "12px 30px", borderRadius: 999, background: alpha(C.wall, 0.5), boxShadow: `inset 0 0 0 1.5px ${alpha(C.candle, 0.45)}` }}>
            <Img src={staticFile(BRAND.telegram)} style={{ width: 30, height: 30, marginRight: 14 }} />
            <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 28, color: C.cream, whiteSpace: "nowrap" }}>{BRAND.prayer}</div>
            <div style={{ width: 2, height: 30, background: alpha(C.candle, 0.6), margin: "0 22px" }} />
            <Img src={staticFile(BRAND.web)} style={{ width: 28, height: 28, marginRight: 12 }} />
            <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 28, color: C.gold, whiteSpace: "nowrap" }}>{BRAND.site}</div>
          </div>
        </div>
        {safeguard ? (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 52, textAlign: "center", fontFamily: FONT.sans, fontWeight: 800, fontSize: 26, color: alpha(C.cream, 0.72), opacity: k(36) }}>{BRAND.safeguard}</div>
        ) : null}
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: 0 }} />
    </Door>
  );
};
