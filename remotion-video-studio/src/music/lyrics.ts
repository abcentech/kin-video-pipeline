// Word-level timing → display lines for karaoke. Words come from
// build/transcribe_words.mjs as { words: [{ w, start, end }] }.

export type Word = { w: string; start: number; end: number };
export type Line = { words: Word[]; start: number; end: number };

// Break into phrases on a vocal gap or after enough words, so the screen shows
// one singable line at a time while still highlighting the active word.
export const groupLines = (
  words: Word[],
  { maxWords = 7, gap = 0.6 }: { maxWords?: number; gap?: number } = {},
): Line[] => {
  const lines: Line[] = [];
  let cur: Word[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prev = words[i - 1];
    const bigGap = prev && w.start - prev.end > gap;
    if (cur.length && (bigGap || cur.length >= maxWords)) {
      lines.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length)
    lines.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
  return lines;
};

// Which line is active at time t (seconds). Holds the last line through short gaps.
export const lineAt = (lines: Line[], t: number): number => {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (t >= lines[i].start - 0.3) idx = i;
    else break;
  }
  if (idx >= 0 && t > lines[idx].end + 1.2) {
    // fade out after a line ends unless the next one is about to start
    const next = lines[idx + 1];
    if (!next || next.start - t > 0.6) return -1;
  }
  return idx;
};
