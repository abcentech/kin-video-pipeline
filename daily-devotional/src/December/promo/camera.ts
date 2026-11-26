// The virtual camera over the locked 16:9 body. A View is { s, x, y }: zoom (1 = the source covers the
// frame — in 9:16 / 4:5 that means the source HEIGHT fills it) and the source point (0..1, y down) at
// screen centre. A line eases from cam[0] to cam[1] over its length; a snap word pushes +6 % in 5
// frames and settles back over 20 (december/DESIGN.md §Camera).
import { Easing } from "remotion";
import type { View } from "../types";

const SRC = 16 / 9;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Visible source area (uv units) at zoom 1 for a frame aspect: cover fit. */
export const baseSize = (aspect: number): [number, number] => (aspect >= SRC ? [1, SRC / aspect] : [aspect / SRC, 1]);

/** Keep a view inside the source so no edge ever shows. */
export const clampView = (v: View, aspect: number): View => {
  const [bw, bh] = baseSize(aspect);
  const s = Math.max(1, v.s);
  const w = bw / s;
  const h = bh / s;
  return { s, x: Math.min(1 - w / 2, Math.max(w / 2, v.x)), y: Math.min(1 - h / 2, Math.max(h / 2, v.y)) };
};

export const SNAP_IN = 5;
export const SNAP_OUT = 20;
export const SNAP_AMT = 0.06;

/** Snap multiplier and a motion-blur amount (0..1) at beat frame f. */
export const snapAt = (snaps: number[], f: number): { k: number; blur: number } => {
  let k = 1;
  let blur = 0;
  for (const at of snaps) {
    const d = f - at;
    if (d < 0 || d > SNAP_IN + SNAP_OUT) continue;
    const amt = d < SNAP_IN ? Easing.out(Easing.cubic)(d / SNAP_IN) : 1 - Easing.inOut(Easing.sin)((d - SNAP_IN) / SNAP_OUT);
    k *= 1 + SNAP_AMT * amt;
    if (d < SNAP_IN) blur = Math.max(blur, Math.sin((d / SNAP_IN) * Math.PI));
  }
  return { k, blur };
};

/** Optional field on a line beat (PROPOSED for the plan; filled from the matte sidecar today): the head through
 *  the beat, [beat frame, head centre x, cap top y] (source 0..1). */
export type HeadTrack = [number, number, number][];
export const trackAt = (track: HeadTrack, f: number): [number, number] => {
  let i = 0;
  while (i < track.length - 2 && track[i + 1][0] <= f) i++;
  const p = track[i];
  const q = track[Math.min(track.length - 1, i + 1)];
  const k = q[0] > p[0] ? clamp01((f - p[0]) / (q[0] - p[0])) : 0;
  return [p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
};

/** The view of a line at beat frame f (with a hair of operator drift so no frame is ever dead still).
 *  With a head track the camera follows his head sideways (an operator, eased by the 6-frame sampling);
 *  without one it eases between the two keys. */
export const lineView = (cam: [View, View], snaps: number[], f: number, dur: number, aspect: number, seed = 0, track?: HeadTrack): View & { blur: number } => {
  const p = Easing.inOut(Easing.sin)(clamp01(f / Math.max(1, dur - 1)));
  const [a, b] = cam;
  const { k, blur } = snapAt(snaps, f);
  const s = (a.s + (b.s - a.s) * p) * k;
  const drift = 0.0016 / s;
  const baseX = track && track.length > 1 ? trackAt(track, f)[0] : a.x + (b.x - a.x) * p;
  const x = baseX + drift * Math.sin(f * 0.047 + seed * 1.3) + drift * 0.4 * Math.sin(f * 0.13 + seed);
  const y = a.y + (b.y - a.y) * p + drift * 0.8 * Math.sin(f * 0.039 + seed * 0.7 + 2.1);
  return { ...clampView({ s, x, y }, aspect), blur };
};

/** CSS box + transform that shows view `v` of a cover-fitted 16:9 element in a W×H box. */
export const viewTransform = (v: View, width: number, height: number) => {
  const [bw, bh] = baseSize(width / height);
  const w = width / bw;
  const h = height / bh;
  const tx = -(v.x - 0.5) * w * v.s;
  const ty = -(v.y - 0.5) * h * v.s;
  return { left: (width - w) / 2, top: (height - h) / 2, w, h, transform: `translate(${tx}px, ${ty}px) scale(${v.s})` };
};

/** Screen position (0..1 of the box) of a source point under view v. */
export const toScreen = (v: View, aspect: number, sx: number, sy: number): [number, number] => {
  const [bw, bh] = baseSize(aspect);
  return [0.5 + (sx - v.x) / (bw / v.s), 0.5 + (sy - v.y) / (bh / v.s)];
};
