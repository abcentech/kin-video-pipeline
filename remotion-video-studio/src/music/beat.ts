// Beat-grid helpers. The grid (seconds) is detected offline by scripts/detect_beats.mjs
// and stored in movie.json as `beats` / `downbeats`. These turn a time into a smooth
// "pulse" that spikes on each beat and decays — used to drive punch-zoom, grade pulse,
// caption pop and particle bursts so the whole frame moves to the music.

// last index with grid[i] <= t (binary search; grid is ascending)
const lastBeatIdx = (grid: number[], t: number): number => {
  let lo = 0, hi = grid.length - 1, k = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (grid[m] <= t) { k = m; lo = m + 1; } else hi = m - 1;
  }
  return k;
};

// 1 exactly on a beat, decaying to 0 with time-constant tau (seconds). Smaller tau = snappier.
export const beatPulse = (grid: number[] | undefined, t: number, tau = 0.1): number => {
  if (!grid || grid.length === 0) return 0;
  const k = lastBeatIdx(grid, t);
  if (k < 0) return 0;
  const dt = t - grid[k];
  return Math.exp(-dt / tau);
};

// phase within the current beat interval, 0..1 (for continuous sway)
export const beatPhase = (grid: number[] | undefined, t: number): number => {
  if (!grid || grid.length < 2) return 0;
  const k = lastBeatIdx(grid, t);
  if (k < 0 || k >= grid.length - 1) return 0;
  const span = grid[k + 1] - grid[k];
  return span > 0 ? (t - grid[k]) / span : 0;
};
