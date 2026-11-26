import { staticFile } from "remotion";
import { dayFile } from "../load";
import { T } from "../timing";
import type { CamKey, Cue, View } from "../types";
import { eInOut, eOut, ramp } from "./kit/ease";

/**
 * Plan paths: public-relative (`day01/film.mp4`, `outro/LikeShare_16x9.mp4`) are used as is; anything else
 * (`film.mp4`, `art/x.jpg`) is taken as relative to the day folder.
 */
export const resolveSrc = (day: number, src: string) => {
  const s = src.replace(/^\/+/, "");
  if (/^(day\d+|outro|brand|fonts|fixture)\//.test(s)) return staticFile(s);
  return dayFile(day, s);
};

export const TAKEOVERS = new Set<Cue["kind"]>(["chapter", "art", "film", "response", "prayer", "declare", "recap", "next", "scripture"]);
export const isTakeover = (c: Cue) => {
  if (c.kind === "scripture") return c.mode === "page";
  if (c.kind === "art") return c.mode === "full";
  return TAKEOVERS.has(c.kind);
};
/** takeovers that carry the spoken words themselves → captions hide */
export const hidesCaptions = (c: Cue) => (c.kind === "scripture" && c.mode === "page") || c.kind === "prayer" || c.kind === "declare" || c.kind === "recap" || c.kind === "response" || c.kind === "chapter" || c.kind === "next";

/** 0..1 how much a set of cues covers frame f (door-timed ramps) */
export const coverAt = (cues: Cue[], f: number, pick: (c: Cue) => boolean, inF = 8, outF = 8) => {
  let v = 0;
  for (const c of cues) {
    if (!pick(c)) continue;
    if (f < c.from - 2 || f > c.from + c.dur + 2) continue;
    const a = ramp(f, c.from, c.from + inF);
    const b = 1 - ramp(f, c.from + c.dur - outF, c.from + c.dur);
    v = Math.max(v, Math.min(a, b));
  }
  return v;
};

const easeOf = (e: CamKey["ease"]) => (e === "out" ? eOut : eInOut);
const AX = ["s", "x", "y"] as const;

/**
 * Camera view at frame f. A key's `ease` is how the camera ARRIVES at it from the previous key: `cut` = jump on its
 * frame, `in-out` / `out` = eased move, `linear` = follow-cam. Runs of `linear` keys are threaded with a
 * Catmull-Rom (Hermite) spline through the keys, so a dense follow track has continuous velocity — no kink or
 * stutter at every key.
 */
export const viewAt = (keys: CamKey[], f: number): View => {
  if (!keys.length) return { s: 1, x: 0.5, y: 0.5 };
  if (f <= keys[0].f) return keys[0].view;
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) {
      const a = keys[i - 1];
      if (k.ease === "cut") return a.view;
      if (k.ease === "linear") {
        // neighbours for the tangents: only across linear joins (a cut or an eased key breaks the spline)
        const p0 = a.ease === "linear" && i >= 2 ? keys[i - 2] : null;
        const p3 = keys[i + 1] && keys[i + 1].ease === "linear" ? keys[i + 1] : null;
        const h = k.f - a.f;
        const t = (f - a.f) / h;
        const t2 = t * t;
        const t3 = t2 * t;
        const out = {} as View;
        for (const ax of AX) {
          const v1 = a.view[ax];
          const v2 = k.view[ax];
          const m1 = p0 ? ((v2 - p0.view[ax]) / (k.f - p0.f)) * h : v2 - v1;
          const m2 = p3 ? ((p3.view[ax] - v1) / (p3.f - a.f)) * h : v2 - v1;
          out[ax] = (2 * t3 - 3 * t2 + 1) * v1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * v2 + (t3 - t2) * m2;
        }
        return out;
      }
      const t = easeOf(k.ease)(ramp(f, a.f, k.f));
      return { s: a.view.s + (k.view.s - a.view.s) * t, x: a.view.x + (k.view.x - a.view.x) * t, y: a.view.y + (k.view.y - a.view.y) * t };
    }
  }
  return keys[keys.length - 1].view;
};

/** keep the frame covered: zoom ≥ 1 and the centre inside [0.5/s, 1 − 0.5/s] */
export const clampView = (v: View): View => {
  const s = Math.max(1, Math.min(1.3, v.s));
  const lo = 0.5 / s;
  const hi = 1 - 0.5 / s;
  return { s, x: Math.max(lo, Math.min(hi, v.x)), y: Math.max(lo, Math.min(hi, v.y)) };
};

/** a point of the source (0..1) on screen (px) under view v */
export const toScreen = (v: View, px: number, py: number, W: number, H: number) => ({ x: W / 2 + v.s * (px - v.x) * W, y: H / 2 + v.s * (py - v.y) * H });

export { T };
