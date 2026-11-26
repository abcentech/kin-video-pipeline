/**
 * MOTIF 1 — THE DOOR OF LIGHT.
 * Every takeover arrives the way the Father does: a vertical seam of warm light appears at centre, two dark
 * panels slide apart, light spills through the opening first, the page (children) after. It closes the
 * same way. `open` is LINEAR time 0..1 (drive it with `doorOpen()` / `doorFor()`); the easing lives here
 * so every door in the series moves identically.
 *
 *   <Door open={doorFor(frame, dur)}>{page}</Door>
 *   <Door open={p} solid />          // section joins: panels fully opaque (opens from / closes to darkness)
 *
 * Content is fully readable from open ≥ 0.62 (frame 10 of T.DOOR_IN = 16).
 */
import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { C } from "../../theme";
import { T } from "../../timing";
import { alpha, clamp01, eInOut, eOut, mix, ramp } from "./ease";

/** door state for a cue on its local frame: opens over T.DOOR_IN, closes over the last T.DOOR_OUT frames */
export const doorFor = (frame: number, dur: number, inF: number = T.DOOR_IN, outF: number = T.DOOR_OUT) =>
  Math.min(ramp(frame, 0, inF), 1 - ramp(frame, dur - outF, dur));

/** 1 → 0 over the last `outF` frames of a piece `len` long (linear; pair with doorOpen via Math.min) */
export const doorClose = (frame: number, len: number, outF: number = T.DOOR_OUT) => 1 - ramp(frame, len - outF, len);

/** door opening from `from` over T.DOOR_IN */
export const doorOpen = (frame: number, from = 0, inF: number = T.DOOR_IN) => ramp(frame, from, from + inF);

/** how readable the page behind the door is at `open` (0..1) — use it to fade content in step with the light */
export const doorContent = (open: number) => eOut(ramp(open, 0.26, 0.52));

const Panel: React.FC<{ side: "left" | "right"; w: number; h: number; shift: number; opacity: number; lit: number }> = ({ side, w, h, shift, opacity, lit }) => {
  const left = side === "left";
  const edgeTo = left ? "to right" : "to left";
  const warm = mix(C.night, C.candle, 0.16 + 0.22 * lit);
  // recessed panelling: reads as a door, not as a grey rectangle
  const inset = (top: number, bottom: number) => (
    <div
      style={{
        position: "absolute",
        top: `${top}%`,
        bottom: `${100 - bottom}%`,
        left: "16%",
        right: "16%",
        borderRadius: 6,
        border: `2px solid ${alpha(C.cream, 0.05 + 0.05 * lit)}`,
        boxShadow: `inset 0 0 40px ${alpha(C.ink, 0.55)}, inset ${left ? -6 : 6}px 0 18px ${alpha(C.candle, 0.06 + 0.16 * lit)}`,
        background: `linear-gradient(${edgeTo}, ${alpha(C.ink, 0.25)}, ${alpha(C.candle, 0.03 + 0.06 * lit)})`,
      }}
    />
  );
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        width: w / 2,
        height: h,
        [left ? "left" : "right"]: 0,
        transform: `translateX(${left ? -shift : shift}px)`,
        opacity,
        background: `linear-gradient(${edgeTo}, ${C.ink} 0%, ${mix(C.ink, C.night, 0.8)} 45%, ${warm} 100%)`,
      }}
    >
      {inset(7, 44)}
      {inset(51, 93)}
      {/* the lit rim on the opening edge */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          [left ? "right" : "left"]: 0,
          width: 3,
          background: `linear-gradient(to bottom, ${alpha(C.goldLight, 0.35 * lit)}, ${alpha(C.goldLight, 0.95 * lit)} 50%, ${alpha(C.goldLight, 0.35 * lit)})`,
          boxShadow: `0 0 ${18 + 40 * lit}px ${alpha(C.candle, 0.85 * lit)}`,
        }}
      />
      {/* light raking across the panel from the opening */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(${left ? "to left" : "to right"}, ${alpha(C.candle, 0.32 * lit)} 0%, ${alpha(C.candle, 0.08 * lit)} 22%, transparent 55%)`,
        }}
      />
    </div>
  );
};

export const Door: React.FC<{
  /** 0 = shut, 1 = fully open (linear time; easing is internal) */
  open: number;
  /** panels fully opaque — use at section joins so the door opens from / closes into darkness */
  solid?: boolean;
  /** light spill strength, default 1 */
  light?: number;
  /** size override (default: the composition) — e.g. a 9:16 presenter window */
  w?: number;
  h?: number;
  /** seam brightness multiplier (alias of light for the seam only) */
  seam?: number;
  children?: React.ReactNode;
}> = ({ open, solid = false, light: lightIn = 1, w, h, seam: seamMul = 1, children }) => {
  const vc = useVideoConfig();
  const W = w ?? vc.width;
  const H = h ?? vc.height;
  const light = lightIn * seamMul;
  const p = clamp01(open);
  if (p >= 1) {
    // same tree shape as the animated state, so children (videos) never remount
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <AbsoluteFill>
          {null}
          <AbsoluteFill>{children}</AbsoluteFill>
          {null}
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  const seam = eOut(ramp(p, 0, 0.26));
  const gap = eInOut(ramp(p, 0.18, 1)) * 0.25 + eOut(ramp(p, 0.18, 1)) * 0.75;
  const half = 1.5 + gap * (W / 2 + 60);
  const panelOpacity = solid ? 1 : 0.95 * eOut(ramp(p, 0, 0.22));
  // the flood of light belongs to the narrow opening; once the page is readable it recedes to the edges
  const spill = light * (1 - ramp(p, 0.2, 0.52));
  const lit = light * Math.min(1, seam * 1.2) * (0.55 + 0.45 * (1 - ramp(p, 0.6, 1)));
  const content = doorContent(p);
  const cx = W / 2;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* the opening: light first, the page after */}
      {p > 0.17 ? (
        <AbsoluteFill style={{ clipPath: `inset(0px ${Math.max(0, cx - half)}px 0px ${Math.max(0, cx - half)}px)` }}>
          {/* a shaft of light, hottest at the seam, falling off toward the panel edges */}
          <AbsoluteFill
            style={{
              background: `radial-gradient(ellipse ${Math.max(40, half * 0.75)}px 75% at 50% 52%, #FFF6DC 0%, ${C.goldLight} 22%, ${alpha(C.candle, 0.85)} 50%, ${mix(C.candle, C.ink, 0.6)} 100%)`,
              opacity: 0.12 + 0.88 * spill,
            }}
          />
          <AbsoluteFill style={{ opacity: content < 1 ? content : undefined }}>{children}</AbsoluteFill>
          {/* spill hugging the edges of the opening */}
          <AbsoluteFill
            style={{
              background: `linear-gradient(to right, transparent ${((cx - half) / W) * 100}%, ${alpha(C.goldLight, 0.55 * spill)} ${((cx - half) / W) * 100 + 0.4}%, ${alpha(C.candle, 0.16 * spill)} ${((cx - half * 0.55) / W) * 100}%, transparent 50%, ${alpha(C.candle, 0.16 * spill)} ${((cx + half * 0.55) / W) * 100}%, ${alpha(C.goldLight, 0.55 * spill)} ${((cx + half) / W) * 100 - 0.4}%, transparent ${((cx + half) / W) * 100}%)`,
              mixBlendMode: "screen",
            }}
          />
        </AbsoluteFill>
      ) : null}
      <Panel side="left" w={W} h={H} shift={half} opacity={panelOpacity} lit={lit} />
      <Panel side="right" w={W} h={H} shift={half} opacity={panelOpacity} lit={lit} />
      {/* the seam itself, before the panels part */}
      <div
        style={{
          position: "absolute",
          left: cx - 1.5 - 3 * seam,
          width: 3 + 6 * seam,
          top: H * (0.5 - 0.5 * (0.25 + 0.75 * seam)),
          height: H * (0.25 + 0.75 * seam),
          background: `linear-gradient(to bottom, transparent, ${C.goldLight} 18%, #FFFDF5 50%, ${C.goldLight} 82%, transparent)`,
          opacity: seam * (1 - ramp(p, 0.22, 0.4)) * light,
          boxShadow: `0 0 24px ${alpha(C.candle, 0.9)}, 0 0 70px ${alpha(C.candle, 0.6)}`,
        }}
      />
      {/* bloom: the room fills with warm light for a moment */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse ${16 + 50 * gap}% 75% at 50% 52%, ${alpha(C.candle, 0.5 * lit * (0.4 + spill))}, transparent 70%)`,
          mixBlendMode: "screen",
        }}
      />
    </AbsoluteFill>
  );
};
