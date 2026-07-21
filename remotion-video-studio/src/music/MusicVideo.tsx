import React from "react";
import {
  AbsoluteFill,
  Audio,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
} from "remotion";
import { z } from "zod";
import { MusicScene3D } from "./MusicScene3D";
import { ClipBed, type BedClip } from "./ClipBed";
import { LyricKaraoke } from "./LyricKaraoke";
import { BrandLogo } from "./BrandLogo";
import { WordmarkProgress } from "./WordmarkProgress";
import { SchoolSign } from "./SchoolSign";
import { BeatParticles } from "./BeatParticles";
import { ScriptureChip } from "./ScriptureChip";
import { beatPulse } from "./beat";
import { fontFamily } from "../font";
import type { Word } from "./lyrics";

export const musicSchema = z.object({
  audio: z.string(),
  words: z.array(z.object({ w: z.string(), start: z.number(), end: z.number() })),
  title: z.string(),
  subtitle: z.string(),
  format: z.enum(["16x9", "9x16"]),
  clips: z
    .array(
      z.object({
        src: z.string(),
        start: z.number(),
        end: z.number(),
        clipSeconds: z.number(),
        depthStill: z.string().optional(),
        depth: z.string().optional(),
        motion: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
  sfx: z
    .array(z.object({ name: z.string(), atSeconds: z.number(), gainDb: z.number() }))
    .optional()
    .default([]),
  branded: z.boolean().optional().default(false),
  school: z.string().optional(),
  motto: z.string().optional(),
  beats: z.array(z.number()).optional().default([]),
  downbeats: z.array(z.number()).optional().default([]),
  bpm: z.number().optional(),
});

// Fine film grain as a static SVG turbulence tile, blended subtly over the picture.
const GRAIN =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>",
  );

// Evolving color script + filmic finish. Drives tint / bloom / grain by song time so
// the film moves cool (solitude) → warm (faith) → radiant gold (the standing) → luminous
// (jubilation). The saturate/brightness/contrast are applied to the picture wrapper.
const ColorScript: React.FC<{ downbeats?: number[] }> = ({ downbeats }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const coolOp = interpolate(t, [0, 54, 92], [0.24, 0.1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // warm gold, with a sharp KEY LIFT at the quiz-win drop (~106s)
  const warmBase = interpolate(t, [80, 126, 180, 198], [0.04, 0.13, 0.22, 0.18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const keyLift = interpolate(t, [104, 106.5, 120], [0, 0.16, 0.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const warmOp = warmBase + keyLift;
  const bloomBase = interpolate(t, [120, 162, 180, 198], [0, 0.12, 0.24, 0.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // bass-reactive bloom flash on each downbeat (replaces the old fake sine)
  const beat = beatPulse(downbeats, t, 0.13);
  const bloomOp = bloomBase + keyLift * 0.6 + beat * 0.07;
  const pulse = 0.5 + 0.5 * beat;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* cool mood (early) */}
      <AbsoluteFill
        style={{
          background: "linear-gradient(180deg, rgba(70,110,170,1), rgba(40,60,110,1))",
          mixBlendMode: "soft-light",
          opacity: coolOp,
        }}
      />
      {/* warm gold (faith → jubilation) */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 42%, rgba(255,190,110,1), rgba(220,140,60,1))",
          mixBlendMode: "soft-light",
          opacity: warmOp,
        }}
      />
      {/* highlight bloom toward the climax */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 44%, rgba(255,245,220,1), rgba(255,245,220,0) 60%)",
          mixBlendMode: "screen",
          opacity: bloomOp,
        }}
      />
      {/* warm top light */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 38%, rgba(255,200,140,0.10), rgba(0,0,0,0) 55%)",
        }}
      />
      {/* breathing vignette / halation */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) ${
            46 + pulse * 4
          }%, rgba(0,0,0,0.6) 100%)`,
        }}
      />
      {/* fine grain */}
      <AbsoluteFill
        style={{
          backgroundImage: `url("${GRAIN}")`,
          backgroundSize: "160px 160px",
          mixBlendMode: "overlay",
          opacity: 0.06,
        }}
      />
    </AbsoluteFill>
  );
};

const TitleCard: React.FC<{ title: string; subtitle: string; format: "16x9" | "9x16" }> = ({
  title,
  subtitle,
  format,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const inP = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 24 });
  const out = interpolate(frame, [durationInFrames - 18, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });
  const op = inP * out;
  const big = format === "9x16" ? 96 : 110;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ opacity: op, textAlign: "center", transform: `translateY(${(1 - inP) * 20}px)` }}>
        <div
          style={{
            fontFamily,
            fontWeight: 900,
            fontSize: big,
            color: "#fff",
            letterSpacing: "-0.02em",
            textShadow: "0 0 40px rgba(255,200,120,0.55), 0 6px 18px rgba(0,0,0,0.7)",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: big * 0.32,
            color: "#ffd9a6",
            marginTop: 14,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          {subtitle}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Sparse, ducked sound-design cues placed by song time, sitting under the song.
const SfxCues: React.FC<{ sfx: { name: string; atSeconds: number; gainDb: number }[] }> = ({
  sfx,
}) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {sfx.map((c, i) => (
        <Sequence key={i} from={Math.round(c.atSeconds * fps)}>
          <Audio src={staticFile(`audio/${c.name}.mp3`)} volume={Math.pow(10, c.gainDb / 20)} />
        </Sequence>
      ))}
    </>
  );
};

export const MusicVideo: React.FC<z.infer<typeof musicSchema>> = ({
  audio,
  words,
  title,
  subtitle,
  format,
  clips = [],
  sfx = [],
  branded = false,
  school,
  motto,
  beats = [],
  downbeats = [],
}) => {
  const { width, height, durationInFrames, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const t = frame / fps;
  const introLen = Math.round(4.2 * fps);
  const outroStart = durationInFrames - Math.round(4 * fps);

  // color-script grade applied to the picture itself
  const sat = interpolate(t, [0, 54, 126, 180], [0.9, 1.0, 1.12, 1.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bri = interpolate(t, [0, 54, 126, 180], [0.97, 1.0, 1.04, 1.09], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const con = interpolate(t, [0, 54, 180], [1.05, 1.02, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Watermark removal (Option 1 — crop & re-pan): when the picture is Flow/Veo footage
  // (branded movie mode), scale the image up and push it right so Veo's burned lower-right
  // sparkle (~x1755,y895 @1080p) falls OFF-frame entirely — no blur, no masking badge, no
  // dark patch. Only the picture wrapper is transformed; captions/overlays stay full-frame.
  const cropWatermark = branded && clips.length > 0;
  // beat punch-zoom rides on top of the crop so the picture "kicks" on every downbeat
  const punch = beatPulse(downbeats, t, 0.09) * 0.018;
  const pictureTransform = cropWatermark
    ? `scale(${(1.22 + punch).toFixed(4)}) translateX(130px)`
    : undefined;

  return (
    <AbsoluteFill style={{ backgroundColor: "#05060d" }}>
      <AbsoluteFill
        style={{
          filter: `saturate(${sat}) brightness(${bri}) contrast(${con})`,
          transform: pictureTransform,
          transformOrigin: "center center",
        }}
      >
        {clips.length > 0 ? (
          <ClipBed clips={clips as BedClip[]} />
        ) : (
          <MusicScene3D audioSrc={audio} width={width} height={height} />
        )}
      </AbsoluteFill>
      <ColorScript downbeats={downbeats} />
      {branded && <BeatParticles downbeats={downbeats} />}
      {branded && school && (
        <ScriptureChip reference="Daniel 1:17" line="God gave them knowledge and skill" fromSec={31} toSec={37} />
      )}
      <LyricKaraoke words={words as Word[]} format={format} beats={beats} />
      {/* When a school name is provided (movie mode w/ on-scene signage), skip the movie
          title card and brand the establishing shots with SchoolSign instead. The Veo
          watermark is removed by the crop above, so the logo stays a clean top-right brand
          mark (no masking badge); the wordmark sits top-center. */}
      {!school && (
        <>
          <Sequence durationInFrames={introLen}>
            <TitleCard title={title} subtitle={subtitle} format={format} />
          </Sequence>
          <Sequence from={outroStart}>
            <TitleCard title={title} subtitle={subtitle} format={format} />
          </Sequence>
        </>
      )}
      {branded && school && <SchoolSign name={school} title={title} motto={motto} />}
      {branded && (
        <>
          <BrandLogo corner="tr" size={132} />
          <WordmarkProgress placement={school ? "top" : "bottom"} />
        </>
      )}
      <Audio src={staticFile(audio)} />
      <SfxCues sfx={sfx} />
    </AbsoluteFill>
  );
};
