import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  staticFile,
  Sequence,
  useVideoConfig,
  interpolate,
  useCurrentFrame,
  Easing,
} from "remotion";
import { Depth3D, type Motion3D } from "./Depth3D";

// Sequences the Flow/Veo story clips as the full-bleed visual bed, timed to the
// song's lyric sections (from flow_acts3_beats.json). Each clip fills its section;
// if the section is longer than the clip it slows the clip to fit (so no freeze),
// and adjacent clips crossfade. The karaoke + grade render on top in MusicVideo.

export type BedClip = {
  src: string; // file in public/flow/
  start: number; // seconds in the song
  end: number; // seconds in the song
  clipSeconds: number; // real duration of the source clip
  // optional 2.5D depth beat: a clean still + its depth map drive a real parallax camera
  // move (Depth3D) instead of the flat video — used for the quiet story beats.
  depthStill?: string;
  depth?: string;
  motion?: Motion3D;
};

const XFADE = 12; // frames

// Ken Burns: a slow eased move per clip, direction varied by index so adjacent shots
// don't drift the same way. [startScale, endScale, startX%, endX%, startY%, endY%].
const KB: [number, number, number, number, number, number][] = [
  [1.06, 1.0, 0, 0, 1.5, -1.5], // settle, tilt down
  [1.0, 1.08, -2, 2, 0, 0], // push + pan right
  [1.07, 1.0, 1.5, -1.5, 0, 0], // ease left
  [1.0, 1.07, 0, 0, 2, -2], // rise
];

const Clip: React.FC<{ clip: BedClip; index: number; total: number }> = ({ clip, index, total }) => {
  const { fps, width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const dur = Math.round((clip.end - clip.start) * fps);
  // slow (or speed) the source so it exactly fills the section, never freezing
  const rate = Math.max(0.35, Math.min(2, clip.clipSeconds / (clip.end - clip.start)));
  const first = index === 0;
  const last = index === total - 1;
  const fadeIn = first ? 1 : XFADE;
  const fadeOut = last ? 1 : XFADE;
  const opacity = interpolate(
    frame,
    [0, fadeIn, Math.max(fadeIn + 1, dur - fadeOut), dur],
    [first ? 1 : 0, 1, 1, last ? 1 : 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // eased Ken Burns drift across the clip
  const [s0, s1, x0, x1, y0, y1] = KB[index % KB.length];
  const p = interpolate(frame, [0, dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.sin),
  });
  const sc = s0 + (s1 - s0) * p;
  const tx = x0 + (x1 - x0) * p;
  const ty = y0 + (y1 - y0) * p;

  // warm light-leak flash on entry (skip the first clip)
  const leak = first
    ? 0
    : interpolate(frame, [0, XFADE * 0.5, XFADE * 1.6], [0, 0.5, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  return (
    <AbsoluteFill style={{ opacity }}>
      {clip.depthStill ? (
        // 2.5D parallax story beat: clean still + depth map, real camera move
        <Depth3D
          src={clip.depthStill}
          depth={clip.depth}
          motion={clip.motion}
          intensity={1}
          width={width}
          height={height}
        />
      ) : (
        <OffthreadVideo
          src={staticFile(`flow/${clip.src}`)}
          playbackRate={rate}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${sc}) translate(${tx}%, ${ty}%)`,
          }}
        />
      )}
      {leak > 0 && (
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(ellipse at 70% 40%, rgba(255,224,160,0.9), rgba(255,180,90,0) 60%)",
            mixBlendMode: "screen",
            opacity: leak,
          }}
        />
      )}
    </AbsoluteFill>
  );
};

export const ClipBed: React.FC<{ clips: BedClip[] }> = ({ clips }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {clips.map((c, i) => {
        const from = Math.round(c.start * fps) - (i === 0 ? 0 : XFADE);
        const dur = Math.round((c.end - c.start) * fps) + (i === 0 ? 0 : XFADE);
        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            <Clip clip={c} index={i} total={clips.length} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
