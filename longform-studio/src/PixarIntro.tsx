import React from "react";
import {
  AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile,
  interpolate, useCurrentFrame, useVideoConfig,
} from "remotion";
import { z } from "zod";
import { Depth3D } from "./Depth3D";
import { SoundLayer, soundSchema } from "./SoundLayer";
import { KineticCaptions } from "./KineticCaptions";
import { TitleCard } from "./TitleCard";
import { CinematicGrade } from "./CinematicGrade";

export const CTA_TAIL_SEC = 6; // extra seconds after the last beat for the tagline + CTA button

// 2.5D "Pixar" intro: each beat is a generated hero frame given REAL depth via a
// Three.js displacement plane + a flying 3D camera (Depth3D), plus a faster-moving
// procedural god-ray/particle overlay + a warm cinematic grade. If a beat has a Veo
// clip, it plays that instead.
export const beatSchema = z.object({
  i: z.number(), start: z.number(), end: z.number(), vo: z.string(),
  hero: z.string(), depth: z.string().nullable().optional(), veo: z.string().nullable().optional(),
  motion: z.enum(["push-in", "pull-back", "dolly-left", "dolly-right", "crane-up", "orbit"]).default("push-in"),
});
export const wordSchema = z.object({
  w: z.string(), start: z.number(), end: z.number(), emp: z.boolean().optional(),
});
export const pixarSchema = z.object({
  audio: z.string().optional(),
  title: z.string().optional(),
  titleMain: z.string().default("THE SECRETS OF LONGEVITY"),
  titleSub: z.string().default("SEVEN DECADES OF SERVICE"),
  tagline: z.string().default("Your days are numbered. Make them count."),
  cta: z.string().default("Begins this July · @KidsInspiringNation"),
  words: z.array(wordSchema).default([]),
  titleAt: z.number().optional(), // when the TitleCard takes over (default: last beat start)
  tail: z.number().optional(), // seconds after last beat for the CTA card; <1 = no CTA, just a brief fade
  slider: z.enum(["top", "bottom"]).optional(), // KIN wordmark progress gauge (omit = none)
  progressBar: z.boolean().optional(), // thin gold→red progress slider at the very bottom
  beats: z.array(beatSchema),
  sound: soundSchema,
});
export type PixarProps = z.infer<typeof pixarSchema>;

const FONT = "Poppins, system-ui, sans-serif";
const XFADE = 0.5; // seconds of crossfade between beats

const Grade: React.FC = () => (
  <>
    {/* warm divine wash */}
    <AbsoluteFill style={{
      background: "radial-gradient(120% 90% at 50% 18%, rgba(245,182,66,0.28), rgba(0,0,0,0) 55%)",
      mixBlendMode: "screen", pointerEvents: "none",
    }} />
    {/* midnight-blue shadow lift for the 'before' mood */}
    <AbsoluteFill style={{
      background: "linear-gradient(180deg, rgba(27,42,74,0.18) 0%, rgba(0,0,0,0) 35%, rgba(27,42,74,0.30) 100%)",
      mixBlendMode: "multiply", pointerEvents: "none",
    }} />
    {/* vignette */}
    <AbsoluteFill style={{
      boxShadow: "inset 0 0 320px 80px rgba(0,0,0,0.55)", pointerEvents: "none",
    }} />
  </>
);

const GodRays: React.FC<{ speed: number }> = ({ speed }) => {
  const f = useCurrentFrame();
  const drift = Math.sin(f / (40 / speed)) * 18;
  const op = 0.18 + Math.sin(f / 30) * 0.06;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen", opacity: op,
      transform: `translateX(${drift}px) rotate(${drift * 0.05}deg)`,
      background:
        "repeating-conic-gradient(from 90deg at 50% -10%, rgba(245,222,150,0.0) 0deg, rgba(245,222,150,0.55) 2deg, rgba(245,222,150,0.0) 6deg)",
      maskImage: "radial-gradient(70% 80% at 50% 0%, #000 30%, transparent 75%)",
    }} />
  );
};

const Particles: React.FC<{ n: number; speed: number }> = ({ n, speed }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen" }}>
      {Array.from({ length: n }).map((_, k) => {
        const seed = (k * 97.13) % 100;
        const x = (seed) % 100;
        const y = (100 + 100 * Math.sin((f * speed) / 200 + k) - (f * speed * 0.08)) % 100;
        const yy = ((y % 100) + 100) % 100;
        const s = 1.5 + (seed % 3);
        const op = 0.25 + 0.35 * Math.abs(Math.sin(f / 25 + k));
        return <div key={k} style={{
          position: "absolute", left: `${x}%`, top: `${yy}%`, width: s, height: s,
          borderRadius: "50%", background: "rgba(255,240,200,1)",
          boxShadow: "0 0 6px 2px rgba(245,200,120,0.7)", opacity: op,
        }} />;
      })}
    </AbsoluteFill>
  );
};

const Beat: React.FC<{ b: PixarProps["beats"][number]; durF: number; flare: boolean }> = ({ b, durF, flare }) => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const xf = Math.round(XFADE * fps);
  const opacity = interpolate(f, [0, xf, durF - xf, durF], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: "#0a0e18" }}>
      {b.veo ? (
        // Flow clips are 8s; stretch to fill the beat so there's no freeze-frame (slow-mo suits the dreamlike motion).
        // The Veo/Gemini sparkle watermark sits in the BOTTOM-RIGHT corner — anchor the zoom at the
        // top-left and scale up so the bottom-right ~19% (and the watermark with it) is cropped off-frame.
        <OffthreadVideo src={staticFile(b.veo)} playbackRate={Math.min(1.1, 8 / (durF / fps))} style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.24)", transformOrigin: "0% 0%" }} muted />
      ) : (
        // REAL 2.5D: depth-displaced plane + flying 3D camera (falls back to Ken-Burns if no depth map)
        <Depth3D src={b.hero} depth={b.depth} motion={b.motion} intensity={1} width={width} height={height} />
      )}
      {/* faster parallax planes for depth */}
      <GodRays speed={1.4} />
      <Particles n={26} speed={1} />
      <Grade />
      <CinematicGrade flare={flare} />
      {/* captions are rendered once at the root (KineticCaptions) so words flow across beats */}
    </AbsoluteFill>
  );
};

// KIN "video slider": the channel name doubles as a progress gauge — gold sweeps L→R across the
// letters as the piece advances, with a glowing leading knob. Ported from LongForm's WordmarkFill.
const WM_GOLD = "#FFC500";
const WordmarkFill: React.FC<{ placement: "top" | "bottom" }> = ({ placement }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const portrait = height > width;
  const p = Math.max(0, Math.min(1, frame / Math.max(1, durationInFrames - 1)));
  const wm = "KIDSINSPIRING NATION";
  const fontStyle: React.CSSProperties = {
    fontFamily: FONT, fontWeight: 900, fontSize: portrait ? 22 : 18, letterSpacing: 2,
    textTransform: "uppercase", whiteSpace: "nowrap", lineHeight: 1,
  };
  const pos: React.CSSProperties = placement === "top"
    ? { top: portrait ? 36 : 26 }
    : { bottom: portrait ? 40 : 22 };
  return (
    <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", pointerEvents: "none", ...pos }}>
      <div style={{ position: "relative", display: "inline-block" }}>
        <span style={{ ...fontStyle, color: "rgba(255,255,255,0.22)", textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>{wm}</span>
        <span style={{ ...fontStyle, position: "absolute", left: 0, top: 0, color: WM_GOLD,
          textShadow: "0 0 12px rgba(255,197,0,0.6)", clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` }}>{wm}</span>
        <div style={{ position: "absolute", top: -4, bottom: -4, left: `${p * 100}%`, width: 2.5, borderRadius: 2,
          background: "#FFE08a", boxShadow: "0 0 12px rgba(255,197,0,0.95)", opacity: p > 0.002 && p < 0.999 ? 1 : 0 }} />
      </div>
    </div>
  );
};

// Thin bottom progress slider — gold→red gradient bar that fills L→R as the piece advances.
// Ported from LongForm's <Progress />. Sits flush at the very bottom edge.
const ProgressBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pct = Math.max(0, Math.min(100, (frame / Math.max(1, durationInFrames - 1)) * 100));
  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 8, background: "rgba(255,255,255,0.1)", pointerEvents: "none" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${WM_GOLD}, #FF0033)`, boxShadow: "0 0 10px rgba(255,197,0,0.6)" }} />
    </div>
  );
};

// Persistent KidsInspiringNation logo watermark, bottom-right (clear of the cropped Flow corner).
const Watermark: React.FC = () => {
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  return (
    <Img src={staticFile("kin_logo_full.png")} style={{
      position: "absolute", right: portrait ? 28 : 40, top: portrait ? 30 : 28,
      width: portrait ? 184 : 168, height: "auto", opacity: 0.95,
      filter: "drop-shadow(0 2px 10px rgba(0,0,0,0.85))", pointerEvents: "none",
    }} />
  );
};

// Fade up from near-black at the very start (cinematic cold open).
const ColdOpen: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const op = interpolate(f, [0, Math.round(1.2 * fps)], [1, 0], { extrapolateRight: "clamp" });
  if (op <= 0.01) return null;
  return <AbsoluteFill style={{ background: "#05070d", opacity: op, pointerEvents: "none" }} />;
};

// Tagline + logo + CTA "button" shown in the tail after the last beat.
const CtaCard: React.FC<{ tagline: string; cta: string }> = ({ tagline, cta }) => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = f / fps;
  const portrait = height > width;
  const tagOp = interpolate(t, [0.2, 1.0, CTA_TAIL_SEC - 0.6, CTA_TAIL_SEC - 0.1], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ctaOp = interpolate(t, [1.6, 2.4, CTA_TAIL_SEC - 0.6, CTA_TAIL_SEC - 0.1], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: "#05070d", justifyContent: "center", alignItems: "center" }}>
      <CinematicGrade flare />
      <div style={{ textAlign: "center", width: "90%" }}>
        <div style={{
          fontFamily: "Cormorant Garamond, serif", fontStyle: "italic", fontWeight: 600,
          fontSize: portrait ? 34 : 40, color: "#f6eed6", textShadow: "0 2px 12px rgba(0,0,0,0.9)",
          opacity: tagOp, marginBottom: 28,
        }}>{tagline}</div>
        <div style={{ opacity: ctaOp, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <Img src={staticFile("kin_emblem.png")} style={{ width: portrait ? 120 : 104, filter: "drop-shadow(0 0 14px rgba(255,180,60,0.4))" }} />
          <div style={{
            fontFamily: "Grenze Gotisch, serif", fontWeight: 700, fontSize: portrait ? 22 : 24,
            letterSpacing: 4, color: "#FFC861", textShadow: "0 2px 10px rgba(0,0,0,0.9)",
          }}>{cta}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const PixarIntro: React.FC<PixarProps> = ({
  audio, beats, sound, words, tail, titleAt, slider, progressBar,
  titleMain = "THE SECRETS OF LONGEVITY",
  titleSub = "SEVEN DECADES OF SERVICE",
  tagline = "Your days are numbered. Make them count.",
  cta = "Begins this July · @KidsInspiringNation",
}) => {
  const { fps } = useVideoConfig();
  const xf = Math.round(XFADE * fps);
  const lastBeat = beats[beats.length - 1];
  const titleStart = titleAt ?? lastBeat.start; // running captions stop here; TitleCard takes the center
  const lastEnd = lastBeat.end;
  const tailSec = tail ?? CTA_TAIL_SEC;
  const showCta = tailSec >= 1;
  return (
    <AbsoluteFill style={{ backgroundColor: "#05070d" }}>
      {audio ? <Audio src={staticFile(audio)} /> : null}
      <SoundLayer sound={sound} voiceEnd={lastEnd} />
      {beats.map((b, idx) => {
        const fromBase = Math.round(b.start * fps);
        const from = Math.max(0, fromBase - (idx === 0 ? 0 : xf)); // overlap into prev for crossfade
        const to = Math.round(b.end * fps);
        const durF = to - from;
        const flare = b.motion === "crane-up" || idx === beats.length - 1; // divine-light reveals
        return (
          <Sequence key={b.i} from={from} durationInFrames={durF}>
            <Beat b={b} durF={durF} flare={flare} />
          </Sequence>
        );
      })}

      {/* word-for-word kinetic captions, flowing across beats (stops before the title) */}
      <KineticCaptions words={words ?? []} titleStart={titleStart} />

      {/* the title owns the center of the screen on the final beat */}
      <Sequence from={Math.round(titleStart * fps)} durationInFrames={Math.round((lastEnd - titleStart) * fps)} name="title">
        <TitleCard pre="Welcome to" title={titleMain} subtitle={titleSub} localFrom={Math.round(0.3 * fps)} />
      </Sequence>

      {/* tagline + logo + CTA button after the last beat (skipped when tail < 1s) */}
      {showCta ? (
        <Sequence from={Math.round(lastEnd * fps)} durationInFrames={Math.round(tailSec * fps)} name="cta">
          <CtaCard tagline={tagline} cta={cta} />
        </Sequence>
      ) : null}

      <Watermark />
      {slider ? <WordmarkFill placement={slider} /> : null}
      {progressBar ? <ProgressBar /> : null}
      <ColdOpen />
    </AbsoluteFill>
  );
};
