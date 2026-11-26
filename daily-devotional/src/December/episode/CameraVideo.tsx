/**
 * The presenter on a virtual camera: CSS transform of the locked 1080p shot from View keys. NOTHING tonal is laid
 * over the recorded picture: no vignette, no scrim (the producer: "leave our background as it is from the raw video";
 * the N2 grade is approved without a vignette). Until 2026-11-25 a 0 → 38 % ink vignette rode here and darkened the
 * wall about 5 % on average: found by measuring a rendered frame against the same frame of the graded body.
 */
import React from "react";
import { AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";
import type { CamKey, Plan } from "../types";
import { clampView, viewAt } from "./util";

export const CameraVideo: React.FC<{
  src: string;
  cam: CamKey[];
  /** kept for callers; the camera keys already carry the framing */
  face?: Plan["face"];
  /** frame of the source shown at local frame 0 */
  trimBefore?: number;
  muted: boolean;
  /** extra zoom multiplier on top of the keys (rarely needed) */
  push?: number;
  /** px of blur on the picture (only under the scripture page, so the Word owns the frame) */
  blur?: number;
}> = ({ src, cam, trimBefore = 0, muted, push = 1, blur = 0 }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const raw = viewAt(cam, frame);
  const v = clampView({ ...raw, s: raw.s * push });
  const tx = W / 2 - v.s * v.x * W;
  const ty = H / 2 - v.s * v.y * H;
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: C.ink }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${v.s})`, filter: blur > 0.3 ? `blur(${(blur / v.s).toFixed(2)}px)` : undefined }}>
        <OffthreadVideo src={src} trimBefore={trimBefore || undefined} muted={muted} volume={muted ? 0 : 1} style={{ width: W, height: H, display: "block" }} />
      </div>
    </AbsoluteFill>
  );
};
