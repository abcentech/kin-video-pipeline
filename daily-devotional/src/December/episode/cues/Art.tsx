/**
 * ART — paintings that are alive. A slow push or drift (one axis), the plate's named lights live (flicker for
 * flames/lanterns, twinkle for stars, glow for windows/doors, rays for a door of light), motes in the light, a
 * breathing vignette. The painting itself never wobbles: only one monotonic, eased transform moves it.
 *   full → the door opens to the plate full-frame (+ optional Fraunces caption in the plate's empty `space`)
 *   side → a rounded window (36 px radius, 6° tilt settling to 2°, soft shadow) on the open side of the wall
 */
import React from "react";
import { AbsoluteFill, Img, useCurrentFrame } from "remotion";
import { C, FONT, L } from "../../theme";
import type { ArtPlate, Cue, Light } from "../../types";
import { Door, doorContent, doorFor } from "../kit/Door";
import { alpha, breath, clamp01, eInOut, eOut, flicker, ramp } from "../kit/ease";
import { Motes } from "../kit/Candle";
import { parseRich } from "../kit/rich";
import { SIDE_W, sideLeft } from "./Side";
import { noise2D } from "@remotion/noise";

type ArtCue = Extract<Cue, { kind: "art" }>;

const moveTransform = (move: NonNullable<ArtPlate["move"]>, t: number) => {
  const e = eInOut(t) * 0.35 + t * 0.65; // nearly linear: a slow, constant camera
  switch (move) {
    case "push":
      return `scale(${1.04 + 0.08 * e})`;
    case "pull":
      return `scale(${1.12 - 0.08 * e})`;
    case "left":
      return `scale(1.1) translateX(${3 - 6 * e}%)`;
    case "right":
      return `scale(1.1) translateX(${-3 + 6 * e}%)`;
    case "up":
      return `scale(1.1) translateY(${3 - 6 * e}%)`;
    case "down":
      return `scale(1.1) translateY(${-3 + 6 * e}%)`;
  }
};

const LightFx: React.FC<{ l: Light; i: number; f: number; w: number; h: number }> = ({ l, i, f, w, h }) => {
  const x = l.x * w;
  const y = l.y * h;
  const R = Math.max(6, l.r * w);
  if (l.kind === "flicker") {
    const k = flicker(f, i * 13 + 1);
    const jx = noise2D(`fx${i}`, f / 9, 0) * R * 0.05;
    return (
      <>
        <div style={{ position: "absolute", left: x - R * 4, top: y - R * 4, width: R * 8, height: R * 8, borderRadius: "50%", background: `radial-gradient(circle, ${alpha(C.candle, 0.32 * k)} 0%, ${alpha(C.candle, 0.12 * k)} 35%, transparent 70%)`, mixBlendMode: "screen" }} />
        <div style={{ position: "absolute", left: x - R + jx, top: y - R * 1.2, width: R * 2, height: R * 2.4, borderRadius: "50%", background: `radial-gradient(ellipse 50% 50% at 50% 55%, ${alpha("#FFF6DA", 0.85 * k)} 0%, ${alpha(C.goldLight, 0.55 * k)} 35%, transparent 72%)`, mixBlendMode: "screen" }} />
      </>
    );
  }
  if (l.kind === "twinkle") {
    const t = f / 30;
    const k = clamp01(0.62 + 0.25 * Math.sin(t * 2.4 + i) + 0.13 * noise2D(`tw${i}`, t * 1.6, 0));
    const rot = 6 * Math.sin(t * 0.35 + i);
    const len = R * (5 + 1.6 * k);
    return (
      <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0, transform: `rotate(${rot}deg)`, mixBlendMode: "screen" }}>
        <div style={{ position: "absolute", left: -R * 3, top: -R * 3, width: R * 6, height: R * 6, borderRadius: "50%", background: `radial-gradient(circle, ${alpha("#FFFDF2", 0.95 * k)} 0%, ${alpha(C.goldLight, 0.45 * k)} 22%, transparent 65%)` }} />
        <div style={{ position: "absolute", left: -len, top: -1.5, width: len * 2, height: 3, background: `linear-gradient(to right, transparent, ${alpha("#FFFDF2", 0.9 * k)}, transparent)` }} />
        <div style={{ position: "absolute", top: -len, left: -1.5, height: len * 2, width: 3, background: `linear-gradient(to bottom, transparent, ${alpha("#FFFDF2", 0.9 * k)}, transparent)` }} />
        <div style={{ position: "absolute", left: -len * 0.45, top: -1, width: len * 0.9, height: 2, transform: "rotate(45deg)", background: `linear-gradient(to right, transparent, ${alpha(C.goldLight, 0.5 * k)}, transparent)` }} />
        <div style={{ position: "absolute", left: -len * 0.45, top: -1, width: len * 0.9, height: 2, transform: "rotate(-45deg)", background: `linear-gradient(to right, transparent, ${alpha(C.goldLight, 0.5 * k)}, transparent)` }} />
      </div>
    );
  }
  if (l.kind === "glow") {
    const k = breath(f, i * 7 + 3, 0.12, 120);
    return <div style={{ position: "absolute", left: x - R * 2.2, top: y - R * 2.2, width: R * 4.4, height: R * 4.4, borderRadius: "50%", background: `radial-gradient(circle, ${alpha(C.goldLight, 0.42 * k)} 0%, ${alpha(C.candle, 0.18 * k)} 40%, transparent 70%)`, mixBlendMode: "screen" }} />;
  }
  // rays: a fan of soft beams from the opening, slowly breathing and turning
  const k = breath(f, i * 5 + 9, 0.12, 110);
  const rot = 4 * Math.sin(f / 70 + i);
  const S = R * 9;
  return (
    <div
      style={{
        position: "absolute",
        left: x - S,
        top: y - S,
        width: S * 2,
        height: S * 2,
        mixBlendMode: "screen",
        opacity: 0.85 * k,
        background: `repeating-conic-gradient(from ${rot}deg at 50% 50%, ${alpha(C.goldLight, 0)} 0deg, ${alpha(C.goldLight, 0.24)} 5deg, ${alpha(C.goldLight, 0)} 11deg, ${alpha(C.goldLight, 0)} 19deg)`,
        WebkitMaskImage: "radial-gradient(circle, black 0%, rgba(0,0,0,0.55) 25%, transparent 62%)",
        maskImage: "radial-gradient(circle, black 0%, rgba(0,0,0,0.55) 25%, transparent 62%)",
      }}
    />
  );
};

/** the living plate at w×h (painting + lights move together; motes and vignette stay on the glass) */
export const LivingPlate: React.FC<{ src: string; lights: Light[]; move: NonNullable<ArtPlate["move"]>; w: number; h: number; t: number; seed?: number }> = ({ src, lights, move, w, h, t, seed = 1 }) => {
  const f = useCurrentFrame();
  const vig = breath(f, seed + 40, 0.1, 140);
  // motes gather around the plate's lights
  const main = lights[0] ?? { x: 0.5, y: 0.6, r: 0.05, kind: "glow" as const };
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: C.ink }}>
      <div style={{ position: "absolute", inset: 0, transform: moveTransform(move, t), transformOrigin: "50% 50%" }}>
        <Img src={src} style={{ width: w, height: h, objectFit: "cover", display: "block" }} />
        {lights.map((l, i) => (
          <LightFx key={i} l={l} i={i} f={f} w={w} h={h} />
        ))}
      </div>
      <div style={{ position: "absolute", inset: 0 }}>
        <Motes count={22} seed={seed + 5} x={Math.max(0, main.x - 0.18) * (w / L.w)} w={0.36 * (w / L.w)} y={0.1 * (h / L.h)} h={0.85 * (h / L.h)} speed={16} opacity={0.75} />
        {lights.slice(1, 3).map((l, i) => (
          <Motes key={i} count={10} seed={seed + 9 + i} x={Math.max(0, l.x - 0.1) * (w / L.w)} w={0.2 * (w / L.w)} y={Math.max(0, l.y - 0.35) * (h / L.h)} h={0.45 * (h / L.h)} speed={12} opacity={0.6} />
        ))}
      </div>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 80% 80% at 50% 50%, transparent 52%, ${alpha(C.ink, 0.42 * vig)} 100%)` }} />
    </div>
  );
};

export const ArtFull: React.FC<{ cue: ArtCue; src: string }> = ({ cue, src }) => {
  const f = useCurrentFrame();
  const open = doorFor(f, cue.dur);
  const t = ramp(f, 0, cue.dur);
  const words = cue.caption ? parseRich(cue.caption) : [];
  const capIn = eOut(ramp(f, 22, 44));
  const capOut = 1 - ramp(f, cue.dur - 18, cue.dur - 6);
  const space = cue.space === "none" ? "top" : cue.space;
  return (
    <Door open={open}>
      <LivingPlate src={src} lights={cue.lights} move={cue.move} w={L.w} h={L.h} t={t} seed={7} />
      {words.length ? (
        <AbsoluteFill style={{ opacity: capIn * capOut * doorContent(open) }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                space === "top"
                  ? `linear-gradient(to bottom, ${alpha(C.ink, 0.55)}, transparent 38%)`
                  : `linear-gradient(${space === "left" ? "to right" : "to left"}, ${alpha(C.ink, 0.6)}, transparent 45%)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: space === "top" ? 110 : 0,
              bottom: space === "top" ? undefined : 0,
              left: space === "right" ? L.w - L.safeX - 760 : L.safeX + 20,
              width: space === "top" ? L.w - 2 * L.safeX - 40 : 760,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: space === "top" ? "center" : "flex-start",
              transform: `translateY(${(1 - capIn) * 14}px)`,
            }}
          >
            <div style={{ fontFamily: FONT.serif, fontWeight: 480, fontSize: 56, lineHeight: 1.25, color: C.cream, textAlign: space === "top" ? "center" : "left", textShadow: `0 3px 18px ${alpha(C.ink, 0.8)}` }}>
              {words.map((w, i) => (
                <span key={i} style={{ color: w.gold ? C.gold : C.cream }}>
                  {w.text}
                  {i < words.length - 1 ? " " : ""}
                </span>
              ))}
            </div>
          </div>
        </AbsoluteFill>
      ) : null}
    </Door>
  );
};

export const ArtSide: React.FC<{ cue: ArtCue; src: string }> = ({ cue, src }) => {
  const f = useCurrentFrame();
  const inK = eOut(ramp(f, 0, 18));
  const settle = eInOut(ramp(f, 4, 40));
  const outK = eInOut(ramp(f, cue.dur - 12, cue.dur));
  const t = ramp(f, 0, cue.dur);
  const w = SIDE_W - 20;
  const h = Math.round(w * (941 / 1672));
  const left = sideLeft(cue.side) + (cue.side === "left" ? 0 : 20);
  const tilt = (cue.side === "left" ? -1 : 1) * (6 - 4 * settle);
  // clear of the day dial + chapter chip above, and of the caption band below
  const top = Math.max(272, (L.h - L.captionBand - h) / 2 + 20);
  const glow = breath(f, 3, 0.08, 96);
  return (
    <AbsoluteFill>
      {/* no night gradient behind the side plate: the recorded wall stays as it is (the plate has its own frame) */}
      <div
        style={{
          position: "absolute",
          left,
          top,
          width: w,
          height: h,
          borderRadius: 36,
          overflow: "hidden",
          opacity: clamp01(inK * 1.3) * (1 - outK),
          transform: `translateY(${(1 - inK) * 60 + outK * 30}px) rotate(${tilt}deg) scale(${0.92 + 0.08 * inK - 0.04 * outK})`,
          boxShadow: `0 30px 70px ${alpha(C.ink, 0.55)}, 0 0 ${50 * glow}px ${alpha(C.candle, 0.28)}, inset 0 0 0 2px ${alpha(C.candle, 0.4)}`,
          clipPath: `inset(0 round 36px)`,
        }}
      >
        <LivingPlate src={src} lights={cue.lights.map((l) => ({ ...l }))} move={cue.move} w={w} h={h} t={t} seed={9} />
        <div style={{ position: "absolute", inset: 0, borderRadius: 36, boxShadow: `inset 0 0 0 2px ${alpha(C.goldLight, 0.35)}` }} />
      </div>
    </AbsoluteFill>
  );
};
