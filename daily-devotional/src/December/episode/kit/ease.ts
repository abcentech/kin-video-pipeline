/**
 * Frame maths shared by every December piece. Pure functions of the frame — no time, no randomness.
 */
import { Easing } from "remotion";
import { noise2D } from "@remotion/noise";

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** 0..1 ramp of `f` across [a, b] (linear, clamped) */
export const ramp = (f: number, a: number, b: number) => (b === a ? (f >= b ? 1 : 0) : clamp01((f - a) / (b - a)));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const eOut = Easing.out(Easing.cubic);
export const eOutQuint = Easing.out(Easing.poly(5));
export const eIn = Easing.in(Easing.cubic);
export const eInOut = Easing.inOut(Easing.cubic);
export const eSine = Easing.inOut(Easing.sin);
export const eBack = Easing.out(Easing.back(1.6));

/** eased ramp */
export const rampE = (f: number, a: number, b: number, ease: (t: number) => number = eOut) => ease(ramp(f, a, b));

/**
 * In/out envelope of a cue on its own local frame: rises over `inF` frames from 0, falls over the last `outF` frames of `dur`.
 * Returns 0..1 (eased).
 */
export const envelope = (f: number, dur: number, inF: number, outF: number, easeIn = eOut, easeOut = eIn) => {
  const a = easeIn(ramp(f, 0, inF));
  const b = 1 - easeOut(ramp(f, dur - outF, dur));
  return Math.min(a, b);
};

/** noise-driven 'breath' around 1: ±amp, period in frames, deterministic from the frame and a seed */
export const breath = (frame: number, seed = 0, amp = 0.06, period = 96) => {
  const s = Math.sin((2 * Math.PI * frame) / period + seed * 1.7);
  const n = noise2D(`breath-${seed}`, frame / (period * 0.55), seed * 0.37);
  return 1 + amp * (0.62 * s + 0.38 * n);
};

/** fast flicker 0..1 (flames, lanterns) */
export const flicker = (frame: number, seed = 0) => {
  const a = noise2D(`flk-${seed}`, frame / 7.5, 0.3);
  const b = noise2D(`flk2-${seed}`, frame / 2.6, 1.7);
  return clamp01(0.72 + 0.2 * a + 0.08 * b);
};

/** a hold that is never still: tiny slow drift, -1..1 */
export const drift = (frame: number, seed = 0, period = 150) => noise2D(`drift-${seed}`, frame / period, seed * 0.11);

/** rgba() from a #RRGGBB token */
export const alpha = (hex: string, a: number) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
};

/** colour mix of two #RRGGBB tokens */
export const mix = (h1: string, h2: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(h1);
  const b = p(h2);
  const k = clamp01(t);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(",")})`;
};
