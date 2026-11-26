/**
 * THE FATHER SHOWED UP — shared design tokens (december/DESIGN.md is the source of truth).
 * Owner: the lead. Everything in src/December imports colours, fonts and safe zones from here.
 */
import { continueRender, delayRender, staticFile } from "remotion";

export const C = {
  ink: "#05060D",
  night: "#07242A",
  wall: "#12505A",
  candle: "#F2A33A",
  gold: "#FFC500",
  goldLight: "#FFE08A",
  cream: "#FFF4DE",
  ember: "#E0392B",
} as const;

// Self-hosted (december-public/fonts). Fraunces is the upright variable face only — there is NO italic:
// never set fontStyle italic on it (a synthesised slant looks broken). Poppins files are the upright full TTFs.
const loadFont = (family: string, file: string, weight: string, format: string) => {
  if (typeof document === "undefined") return;
  const handle = delayRender(`Loading ${family} ${weight}`);
  const face = new FontFace(family, `url(${staticFile(file)}) format("${format}")`, { weight, style: "normal" });
  face
    .load()
    .then(() => {
      document.fonts.add(face);
      continueRender(handle);
    })
    .catch((err) => {
      console.error(`font ${family} ${weight} failed`, err);
      continueRender(handle);
    });
};
loadFont("Dec Poppins", "fonts/Poppins-800.ttf", "800", "truetype");
loadFont("Dec Poppins", "fonts/Poppins-900.ttf", "900", "truetype");
loadFont("Dec Fraunces", "fonts/Fraunces-latin.woff2", "100 900", "woff2");

export const FONT = {
  /** titles / hero words: weight 900 · captions and labels: weight 800 */
  sans: '"Dec Poppins", "Segoe UI", sans-serif',
  /** scripture, prayers, quiet lines: weights 400–600, upright only */
  serif: '"Dec Fraunces", Georgia, serif',
} as const;

/** 16:9 layout, px at 1920×1080 */
export const L = {
  w: 1920,
  h: 1080,
  safeX: 96,
  safeTop: 60,
  /** bottom band reserved for captions */
  captionBand: 150,
  captionBottom: 56,
  /** lower-third class overlays keep their bottom edge at or above this */
  lowerThirdBottom: 170,
} as const;

/** 9:16 layout, px at 1080×1920 */
export const P = {
  w: 1080,
  h: 1920,
  safeX: 64,
  titleTop: 90,
  titleBottom: 330,
  /** presenter window */
  windowTop: 350,
  windowH: 1350,
  captionCentreY: 1320,
  /** nothing important below this (platform UI) */
  uiBottom: 1500,
} as const;

export const ZOOM = { wide: 1.0, medium: 1.12, tight: 1.25, max: 1.3 } as const;

export const BRAND = {
  logo: "brand/kin_logo_full.png",
  logoLight: "brand/logoLight.svg",
  icon: "brand/logoIcon.svg",
  youtube: "brand/icons/youtube.svg",
  telegram: "brand/icons/telegram.svg",
  web: "brand/icons/web.svg",
  handle: "@KidsInspiringNation",
  site: "KidsInspiringNation.org",
  wordmark: "KIDSINSPIRINGNATION",
  series: "THE FATHER SHOWED UP",
  prayer: "Prayer Service · Saturdays 7:30pm · KidsInspiringNation.t.me",
  safeguard: "If someone is hurting you, tell a safe adult. KIN line +234 812 267 3417",
} as const;

/** Deterministic 0..1 noise from an integer seed (never Math.random in a composition). */
export const rnd = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
