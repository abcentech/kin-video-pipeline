/**
 * SCRIPTURE — the Word must breathe.
 * Page (takeover): the door opens on a night veil (he stays 18 % visible), candle glow breathing at the left margin,
 * motes rising; top-left the dial + the ref in gold caps; the verse in Fraunces, sense-lines (≤ 5 a page; long
 * readings cross-push). Every word starts at 34 % and lights on its `lit` frame; the **phrase** turns gold, grows to
 * 112 % and a hand-drawn underline strokes in at `hit`. When the reading ends the rest falls to 22 % and the phrase
 * holds alone 1.2 s, then the door closes. Flourish: the dial's minute hand sweeps to twelve as the phrase lands.
 * Card (lower third): ref chip + ≤ 14 words on a night plate with a candle hairline; words light the same way.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, FONT, L } from "../../theme";
import { T } from "../../timing";
import type { Cue } from "../../types";
import { CandleRoom } from "../kit/Candle";
import { Dial } from "../kit/Dial";
import { Door, doorContent, doorFor } from "../kit/Door";
import { alpha, clamp01, eInOut, eOut, mix, ramp } from "../kit/ease";
import { CandleRule } from "../kit/Lines";
import { parseRich, senseLines, type RichWord } from "../kit/rich";

type ScriptureCue = Extract<Cue, { kind: "scripture" }>;
const MAX_LINES = 6;

/** fluid hand-drawn underline (fills its parent's width) */
const FluidUnderline: React.FC<{ progress: number; seed?: number }> = ({ progress, seed = 3 }) => {
  const p = clamp01(progress);
  const d = `M 0 ${12 + (seed % 3)} C 220 ${6 + (seed % 4)}, 480 ${16 - (seed % 3)}, 700 ${10 + (seed % 2)} S 930 ${8 + (seed % 3)}, 1000 ${11}`;
  return (
    <svg viewBox="0 0 1000 22" preserveAspectRatio="none" style={{ position: "absolute", left: -6, right: -6, bottom: -14, width: "calc(100% + 12px)", height: 22, overflow: "visible" }}>
      <path d={d} fill="none" stroke={alpha(C.candle, 0.5)} strokeWidth={11} strokeLinecap="round" vectorEffect="non-scaling-stroke" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
      <path d={d} fill="none" stroke={C.gold} strokeWidth={5} strokeLinecap="round" vectorEffect="non-scaling-stroke" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
    </svg>
  );
};

type WordState = { w: RichWord; litAt: number };

const wordLook = (f: number, s: WordState, fall: number, phraseK: number) => {
  const on = eOut(ramp(f, s.litAt - 1, s.litAt + 5));
  const flash = s.litAt <= f ? 1 - ramp(f, s.litAt, s.litAt + 16) : 0;
  let op = 0.34 + 0.66 * on;
  if (!s.w.phrase) op = op * (1 - fall) + 0.22 * fall;
  const gold = s.w.phrase ? phraseK : 0;
  return { op, flash: flash * on, gold };
};

/** groups a line's words into runs so the phrase can carry one underline */
const runs = (line: WordState[]) => {
  const out: { phrase: boolean; words: WordState[] }[] = [];
  for (const s of line) {
    const last = out[out.length - 1];
    if (last && last.phrase === s.w.phrase) last.words.push(s);
    else out.push({ phrase: s.w.phrase, words: [s] });
  }
  return out;
};

const VerseLine: React.FC<{ line: WordState[]; f: number; size: number; fall: number; phraseK: number; underline: number; serifWeight?: number }> = ({ line, f, size, fall, phraseK, underline, serifWeight = 460 }) => (
  <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "baseline", whiteSpace: "nowrap", height: size * 1.36 }}>
    {runs(line).map((r, ri, all) => (
      <span key={ri} style={{ position: "relative", display: "inline-flex", alignItems: "baseline", marginRight: ri < all.length - 1 ? size * 0.26 : 0 }}>
        {r.words.map((s, i) => {
          const L0 = wordLook(f, s, fall, phraseK);
          const grow = s.w.phrase ? 1 + 0.12 * eOut(phraseK) : 1;
          return (
            <span
              key={i}
              style={{
                fontFamily: FONT.serif,
                fontWeight: s.w.phrase ? Math.round(serifWeight + 140 * phraseK) : serifWeight,
                fontSize: size * grow,
                lineHeight: 1,
                marginRight: i < r.words.length - 1 ? size * 0.26 * grow : 0,
                color: L0.gold > 0 ? mix(C.cream, C.gold, L0.gold) : C.cream,
                opacity: L0.op,
                textShadow: `0 0 ${10 + 26 * L0.flash}px ${alpha(C.candle, 0.25 + 0.55 * L0.flash + 0.35 * L0.gold)}, 0 3px 14px ${alpha(C.ink, 0.75)}`,
              }}
            >
              {s.w.text}
            </span>
          );
        })}
        {r.phrase && underline > 0 ? <FluidUnderline progress={underline} seed={ri + 2} /> : null}
      </span>
    ))}
  </div>
);

const layout = (cue: ScriptureCue, maxChars: number) => {
  const words = parseRich(cue.text);
  const states: WordState[] = words.map((w, i) => ({ w, litAt: (cue.lit[i] ?? cue.from + 20 + i * 11.5) - cue.from }));
  const lines = senseLines(words, maxChars).map((l) => l.map((w) => states[w.i]));
  const pages: WordState[][][] = [];
  for (let i = 0; i < lines.length; i += MAX_LINES) pages.push(lines.slice(i, i + MAX_LINES));
  return { states, lines, pages };
};

export const ScripturePage: React.FC<{ cue: ScriptureCue }> = ({ cue }) => {
  const f = useCurrentFrame();
  const open = doorFor(f, cue.dur);
  const { states, lines, pages } = layout(cue, 44);
  const longest = Math.max(...lines.map((l) => l.map((s) => s.w.text).join(" ").length));
  const size = Math.round(Math.max(60, Math.min(72, 1500 / (longest * 0.5))));
  const phraseWords = states.filter((s) => s.w.phrase);
  const hit = (cue.hit ?? (phraseWords.length ? phraseWords[0].litAt + cue.from : cue.from + cue.dur * 0.5)) - cue.from;
  const phraseEnd = phraseWords.length ? phraseWords[phraseWords.length - 1].litAt : hit;
  const phraseK = eOut(ramp(f, hit - 2, Math.max(hit + 8, phraseEnd + 6)));
  const underline = eInOut(ramp(f, Math.max(hit + 4, phraseEnd - 4), Math.max(hit + 4, phraseEnd - 4) + 16));
  const closeAt = cue.dur - T.DOOR_OUT;
  const fallAt = Math.max(closeAt - 36, (states[states.length - 1]?.litAt ?? 0) + 10);
  const fall = eInOut(ramp(f, fallAt, fallAt + 12));
  // which page: by the first lit word of each page; after the reading, the phrase page holds
  const firstLit = pages.map((p) => p[0][0].litAt);
  let pi = 0;
  firstLit.forEach((fl, i) => {
    if (f >= fl - 10) pi = i;
  });
  const phrasePage = pages.findIndex((p) => p.some((l) => l.some((s) => s.w.phrase)));
  const showPage = f >= fallAt && phrasePage >= 0 ? phrasePage : pi;
  // flourish: minute hand sweeps to twelve as the phrase lands; glow blooms
  const sweep = cue.flourish ? eInOut(ramp(f, hit - 30, hit + 2)) : 0;
  const minute = cue.flourish ? 0.58 + 0.42 * sweep : 0.58 + f / 3000;
  const bloom = cue.flourish ? Math.max(0, 1 - Math.abs(f - hit - 4) / 22) : 0;
  const content = doorContent(open);
  const drift = ramp(f, 0, cue.dur);
  return (
    <Door open={open}>
      <CandleRoom veil={0.85} glowX={0.1} glowY={0.56} glowR={0.62} bloom={bloom} seed={11} motes={36} />
      <AbsoluteFill style={{ opacity: content }}>
        {/* dial + ref */}
        <div style={{ position: "absolute", left: L.safeX, top: L.safeTop, display: "flex", alignItems: "center", transform: `translateY(${(1 - content) * -10}px)` }}>
          <Dial size={118} day={undefined} marks={0} minute={minute} glow={0.25 + bloom} face={0.6} />
          <div style={{ marginLeft: 22 }}>
            <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 34, letterSpacing: "0.14em", color: C.gold, lineHeight: 1.1, textShadow: `0 0 18px ${alpha(C.gold, 0.35)}` }}>{cue.ref.toUpperCase()}</div>
            <CandleRule width={260} progress={eOut(ramp(f, 6, 26))} style={{ marginTop: 10 }} glint={((f % 120) / 120) * 1.2} />
          </div>
        </div>
        {/* the verse */}
        {pages.map((page, i) => {
          const k = i === showPage ? 1 : 0;
          // cross-push: arriving pages slide in from the right, leaving pages to the left
          const enterAt = i === 0 ? -100 : f >= fallAt && i === phrasePage ? fallAt : firstLit[i] - 10;
          const t = eOut(ramp(f, enterAt, enterAt + 14));
          const x = k ? (1 - t) * 70 : i < showPage ? -70 : 70;
          const op = k ? t : 0;
          if (op <= 0.001 && !k) return null;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 236,
                right: L.safeX,
                top: 0,
                bottom: 0,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                paddingTop: 40,
                opacity: op,
                transform: `translate(${x - 6 * drift}px, ${-8 * drift}px)`,
              }}
            >
              {page.map((line, li) => (
                <VerseLine key={li} line={line} f={f} size={size} fall={fall} phraseK={phraseK} underline={underline} />
              ))}
            </div>
          );
        })}
        {/* a faint candle hairline down the left margin, the verse's spine */}
        <div style={{ position: "absolute", left: 196, top: 300, bottom: 300, width: 2, background: `linear-gradient(to bottom, transparent, ${alpha(C.candle, 0.55)}, transparent)`, transform: `scaleY(${eOut(ramp(f, 8, 30))})` }} />
      </AbsoluteFill>
    </Door>
  );
};

export const ScriptureCard: React.FC<{ cue: ScriptureCue }> = ({ cue }) => {
  const f = useCurrentFrame();
  const words = parseRich(cue.text);
  const states: WordState[] = words.map((w, i) => ({ w, litAt: (cue.lit[i] ?? cue.from + 14 + i * 11.5) - cue.from }));
  const lines = senseLines(words, 30).map((l) => l.map((w) => states[w.i]));
  const inK = eOut(ramp(f, 0, 14));
  const outK = eInOut(ramp(f, cue.dur - 12, cue.dur));
  const k = inK * (1 - outK);
  const hit = cue.hit !== undefined ? cue.hit - cue.from : (states.find((s) => s.w.phrase)?.litAt ?? 9999);
  const phraseK = eOut(ramp(f, hit - 2, hit + 10));
  const drift = ramp(f, 0, cue.dur);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: L.safeX, bottom: L.lowerThirdBottom, opacity: clamp01(k * 1.3), transform: `translateY(${(1 - inK) * 24 + outK * 10 - drift * 4}px)` }}>
        <CandleRule width={Math.min(980, 60 + lines.reduce((m, l) => Math.max(m, l.map((s) => s.w.text).join(" ").length), 0) * 42 * 0.47)} progress={eOut(ramp(f, 0, 16))} retract={outK} glint={((f % 90) / 90) * 1.3} />
        <div style={{ clipPath: `inset(0 0 ${(1 - inK) * 100}% 0)`, background: `linear-gradient(to bottom, ${alpha(C.night, 0.92)}, ${alpha(C.night, 0.8)})`, borderRadius: "0 0 14px 14px", padding: "16px 30px 22px 26px", boxShadow: `0 18px 50px ${alpha(C.ink, 0.5)}` }}>
          <div style={{ display: "inline-block", fontFamily: FONT.sans, fontWeight: 800, fontSize: 26, letterSpacing: "0.14em", color: C.ink, background: C.gold, borderRadius: 6, padding: "3px 12px 2px", marginBottom: 10 }}>{cue.ref.toUpperCase()}</div>
          {lines.map((line, li) => (
            <VerseLine key={li} line={line} f={f} size={42} fall={0} phraseK={phraseK} underline={0} serifWeight={480} />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
