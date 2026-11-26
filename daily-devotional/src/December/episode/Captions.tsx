/**
 * Burned-in captions — the house "golden frame": Poppins 800 36 px cream on a rgba(0,0,0,0.55) rounded box
 * hugging the text, ≤ 2 lines, bottom-centre in the 150 px band (block bottom at 56 px); the spoken word turns
 * gold with a 2 px lift and a soft glow. `hide` (0..1) fades the block out under takeovers that carry the words.
 */
import React from "react";
import { useCurrentFrame } from "remotion";
import { C, FONT, L } from "../theme";
import type { CaptionPage, Word } from "../types";
import { alpha, clamp01, eOut, ramp } from "./kit/ease";

const SIZE = 36;
const LH = 1.15;
const FADE = 4;

export const Captions: React.FC<{ pages: CaptionPage[]; hide?: number }> = ({ pages, hide = 0 }) => {
  const f = useCurrentFrame();
  if (hide >= 0.999 || !pages.length) return null;
  let page: CaptionPage | undefined;
  for (const p of pages) {
    if (f >= p.from - FADE && f < p.to + FADE) {
      if (!page || f >= p.from) page = p;
    }
    if (p.from - FADE > f) break;
  }
  if (!page) return null;
  const inA = ramp(f, page.from - FADE, page.from);
  const outA = 1 - ramp(f, page.to, page.to + FADE);
  // the next page takes over without a dip
  const opacity = Math.min(inA, outA) * (1 - hide);
  if (opacity <= 0.01) return null;
  const rise = (1 - eOut(inA)) * 8;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: L.captionBottom, display: "flex", justifyContent: "center", padding: `0 ${L.safeX}px`, opacity, transform: `translateY(${rise}px)` }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "rgba(0,0,0,0.55)", borderRadius: 12, padding: "5px 20px" }}>
        {page.lines.map((line, li) => (
          <div key={li} style={{ display: "flex", whiteSpace: "nowrap", alignItems: "baseline" }}>
            {line.map((w, i) => (
              <CapWord key={i} w={w} f={f} last={i === line.length - 1} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

const CapWord: React.FC<{ w: Word; f: number; last: boolean }> = ({ w, f, last }) => {
  const live = f >= w.from - 1 && f < Math.max(w.to, w.from + 4) + 1;
  const k = live ? clamp01(ramp(f, w.from - 1, w.from + 2)) * (1 - ramp(f, w.to, w.to + 3)) : 0;
  return (
    <span
      style={{
        fontFamily: FONT.sans,
        fontWeight: 800,
        fontSize: SIZE,
        lineHeight: LH,
        marginRight: last ? 0 : "0.28em",
        display: "inline-block",
        color: k > 0.5 ? C.gold : C.cream,
        transform: `translateY(${-2 * k}px)`,
        textShadow: k > 0 ? `0 0 ${14 * k}px ${alpha(C.gold, 0.55 * k)}, 0 2px 6px rgba(0,0,0,0.85)` : "0 2px 6px rgba(0,0,0,0.85)",
      }}
    >
      {w.text}
    </span>
  );
};

/** Page a run of words (cold open) the way the compiler does: ≤ 2 lines × `maxChars`, break at punctuation / pauses. */
export const pageWords = (words: Word[], maxChars = 38): CaptionPage[] => {
  // phrases: split after punctuation or a pause; pages end at sentence ends / long pauses
  type Chunk = { words: Word[]; end: boolean };
  const chunks: Chunk[] = [];
  let cur: Word[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    const end = !next || /[.!?]$/.test(w.text) || next.from - w.to >= 14;
    if (end || /[,;:]$/.test(w.text) || (next && next.from - w.to >= 8)) {
      chunks.push({ words: cur, end });
      cur = [];
    }
  });
  const len = (ws: Word[]) => ws.map((w) => w.text).join(" ").length;
  // a pause inside a phrase ("even … when it feels") is not a phrase break: fold short unpunctuated chunks forward
  for (let i = 0; i < chunks.length - 1; i++) {
    const ch = chunks[i];
    const lastW = ch.words[ch.words.length - 1];
    if (!ch.end && ch.words.length < 3 && !/[,;:.!?]$/.test(lastW.text)) {
      chunks[i + 1] = { words: [...ch.words, ...chunks[i + 1].words], end: chunks[i + 1].end };
      chunks.splice(i, 1);
      i--;
    }
  }
  // a phrase longer than a line is cut into balanced halves/thirds, not filled greedily
  for (let i = 0; i < chunks.length; i++) {
    const ch = chunks[i];
    const total = len(ch.words);
    if (total <= maxChars) continue;
    const n = Math.ceil(total / maxChars);
    const target = total / n;
    const parts: Word[][] = [[]];
    for (const w of ch.words) {
      const cur = parts[parts.length - 1];
      if (cur.length && parts.length < n && len([...cur, w]) > target + 4) parts.push([]);
      parts[parts.length - 1].push(w);
    }
    chunks.splice(i, 1, ...parts.map((p, k) => ({ words: p, end: k === parts.length - 1 ? ch.end : false })));
    i += parts.length - 1;
  }
  const pages: CaptionPage[] = [];
  let lines: Word[][] = [[]];
  const flush = () => {
    const ls = lines.filter((l) => l.length);
    if (ls.length) {
      const lastL = ls[ls.length - 1];
      pages.push({ from: Math.max(0, ls[0][0].from - 4), to: lastL[lastL.length - 1].to + 8, lines: ls });
    }
    lines = [[]];
  };
  const place = (w: Word) => {
    const line = lines[lines.length - 1];
    if (line.length && len([...line, w]) > maxChars) {
      if (lines.length >= 2) flush();
      else lines.push([]);
    }
    lines[lines.length - 1].push(w);
  };
  for (const ch of chunks) {
    const line = lines[lines.length - 1];
    // a whole phrase that does not fit the current line starts the next line (never split mid-phrase if avoidable)
    if (line.length && len([...line, ...ch.words]) > maxChars && len(ch.words) <= maxChars) {
      if (lines.length >= 2) flush();
      else lines.push([]);
    }
    ch.words.forEach(place);
    if (ch.end) flush();
  }
  flush();
  for (let i = 0; i < pages.length - 1; i++) pages[i].to = Math.min(pages[i].to, pages[i + 1].from);
  return pages;
};
