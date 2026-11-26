/**
 * Rich text (types.ts `Rich`): `*word*` = gold emphasis, `|` = forced line break, `**…**` = the phrase the teaching hangs on.
 * `parseRich` returns one token per WORD with the markers stripped — the same words `lit[]` counts.
 */
export type RichWord = { text: string; gold: boolean; phrase: boolean; brk: boolean; i: number };

export const parseRich = (rich: string): RichWord[] => {
  const raw = rich.replace(/\|/g, " | ").split(/\s+/).filter(Boolean);
  const out: RichWord[] = [];
  let gold = false;
  let phrase = false;
  let brk = false;
  for (let tok of raw) {
    if (tok === "|") {
      brk = true;
      continue;
    }
    let openP = false;
    let openG = false;
    // leading markers (possibly after opening punctuation like “ or ()
    const lead = tok.match(/^([“"'(‘]*)(\*{1,2})/);
    if (lead) {
      if (lead[2] === "**") openP = true;
      else openG = true;
      tok = lead[1] + tok.slice(lead[0].length);
    }
    if (openP) phrase = true;
    if (openG) gold = true;
    let closeP = false;
    let closeG = false;
    const tail = tok.match(/(\*{1,2})([^\w*]*)$/);
    if (tail) {
      if (tail[1] === "**") closeP = true;
      else closeG = true;
      tok = tok.slice(0, tok.length - tail[0].length) + tail[2];
    }
    tok = tok.replace(/\*/g, "");
    if (tok) out.push({ text: tok, gold, phrase, brk, i: out.length });
    brk = false;
    if (closeP) phrase = false;
    if (closeG) gold = false;
  }
  return out;
};

/** plain text of a Rich string */
export const plainRich = (rich: string) => parseRich(rich).map((w) => w.text).join(" ");

/** Split rich words into lines: forced `|` breaks first; otherwise greedy fill to `maxChars`. */
export const richLines = (words: RichWord[], maxChars: number): RichWord[][] => {
  const lines: RichWord[][] = [];
  let cur: RichWord[] = [];
  let len = 0;
  const hasBreaks = words.some((w) => w.brk);
  for (const w of words) {
    const add = w.text.length + (cur.length ? 1 : 0);
    if (cur.length && (w.brk || (!hasBreaks && len + add > maxChars))) {
      lines.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(w);
    len += cur.length === 1 ? w.text.length : add;
  }
  if (cur.length) lines.push(cur);
  return lines;
};

/**
 * Sense-lines for scripture: break at `|` if given, else after commas/semicolons/colons once a line has
 * ≥ 14 characters, and never let a line pass `maxChars`.
 */
export const senseLines = (words: RichWord[], maxChars: number): RichWord[][] => {
  if (words.some((w) => w.brk)) return richLines(words, 999);
  const lines: RichWord[][] = [];
  let cur: RichWord[] = [];
  let len = 0;
  for (const w of words) {
    const add = w.text.length + (cur.length ? 1 : 0);
    if (cur.length && len + add > maxChars) {
      lines.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(w);
    len += cur.length === 1 ? w.text.length : add;
    if (/[,;:.]$/.test(w.text) && len >= 14) {
      lines.push(cur);
      cur = [];
      len = 0;
    }
  }
  if (cur.length) lines.push(cur);
  // merge a dangling short line into its neighbour when it fits
  for (let i = lines.length - 1; i > 0; i--) {
    const a = lines[i - 1];
    const b = lines[i];
    const la = a.map((w) => w.text).join(" ").length;
    const lb = b.map((w) => w.text).join(" ").length;
    if (lb < 12 && la + lb + 1 <= maxChars) {
      lines.splice(i - 1, 2, [...a, ...b]);
    }
  }
  return lines;
};

/**
 * Balanced wrap: the fewest lines (≤ maxLines) whose longest line is ≤ maxChars, then the break points that make the
 * lines most even — so the last line is never a lone orphan word when it can be avoided. Forced `|` breaks are kept.
 */
export const balanceLines = (words: RichWord[], maxChars: number, maxLines = 3): RichWord[][] => {
  if (!words.length) return [];
  if (words.some((w) => w.brk)) return richLines(words, 999);
  const len = (a: number, b: number) => words.slice(a, b).map((w) => w.text).join(" ").length;
  const n = words.length;
  let best: { cuts: number[]; score: number } | null = null;
  for (let lines = 1; lines <= Math.min(maxLines, n); lines++) {
    // enumerate cut positions (n is small: ≤ ~25 words)
    const rec = (start: number, left: number, cuts: number[]) => {
      if (left === 1) {
        const all = [...cuts, n];
        let prev = 0;
        const ls: number[] = [];
        for (const c of all) {
          ls.push(len(prev, c));
          prev = c;
        }
        const mx = Math.max(...ls);
        if (mx > maxChars && lines < Math.min(maxLines, n)) return;
        const mn = Math.min(...ls);
        // prefer even lines; punish a 1-word last line and lines ending mid-phrase less than raggedness
        const lastWords = n - (cuts[cuts.length - 1] ?? 0);
        const score = mx * 10 + (mx - mn) * 3 + (lines > 1 && lastWords === 1 ? 400 : 0) + (mx > maxChars ? 10000 : 0);
        if (!best || score < best.score) best = { cuts: [...cuts], score };
        return;
      }
      for (let c = start + 1; c <= n - (left - 1); c++) rec(c, left - 1, [...cuts, c]);
    };
    rec(0, lines, []);
    if (best && (best as { score: number }).score < 10000) break;
  }
  const cuts = [...(best as unknown as { cuts: number[] }).cuts, n];
  const out: RichWord[][] = [];
  let prev = 0;
  for (const c of cuts) {
    out.push(words.slice(prev, c));
    prev = c;
  }
  return out;
};

/** rough Poppins 900 uppercase advance per char in em (for fitting without measuring) */
export const POPPINS_BLACK_EM = 0.68;
/** fit a font size so `chars` uppercase Poppins Black characters fit `width` */
export const fitSize = (chars: number, width: number, max: number, min = 34) => Math.max(min, Math.min(max, width / Math.max(1, chars * POPPINS_BLACK_EM)));
