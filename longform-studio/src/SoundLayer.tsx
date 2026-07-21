import React from "react";
import { Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import { z } from "zod";

// Auto-timed sound: one music bed (low volume under the VO) + cue one-shots
// (whoosh on camera-move starts, swell on hero beats). Driven by the `sound`
// block that assign_sound.mjs writes into the scenes/beats JSON.
export const soundSchema = z.object({
  bed: z.string().optional(),
  bedVolume: z.number().default(0.18),
  cues: z.array(z.object({
    at: z.number(),                 // seconds
    file: z.string(),               // staticFile path, e.g. "audio/whoosh.mp3"
    volume: z.number().default(0.6),
  })).default([]),
}).optional();
export type SoundProps = z.infer<typeof soundSchema>;

// `voiceEnd` (seconds): while narration is playing (t < voiceEnd) the bed is
// ducked down so it never crowds the voice; after the VO ends (CTA tail) it
// swells back up to full bedVolume. `duck` is the multiplier applied during VO.
export const SoundLayer: React.FC<{ sound?: SoundProps; voiceEnd?: number; duck?: number }> = ({ sound, voiceEnd, duck }) => {
  const { fps, durationInFrames } = useVideoConfig();
  if (!sound) return null;
  const full = sound.bedVolume ?? 0.18;
  const duckMul = duck ?? 0.34;          // bed sits at ~34% of full under the voice
  const FADE = 0.6;                       // edge fade seconds
  const SWELL = 0.8;                      // ramp back up after VO ends
  const bedVol = (frame: number) => {
    const t = frame / fps;
    const dur = durationInFrames / fps;
    let v = full;
    if (voiceEnd && t < voiceEnd) {
      // ducked under the voice, easing back up over SWELL before VO ends
      const lift = Math.max(0, (t - (voiceEnd - SWELL)) / SWELL); // 0→1 in last SWELL s
      v = full * (duckMul + (1 - duckMul) * Math.min(1, Math.max(0, lift)));
    }
    const fadeIn = Math.min(1, t / FADE);
    const fadeOut = Math.min(1, Math.max(0, (dur - t) / FADE));
    return Math.max(0, v * fadeIn * fadeOut);
  };
  return (
    <>
      {sound.bed ? <Audio src={staticFile(sound.bed)} volume={bedVol} loop /> : null}
      {(sound.cues ?? []).map((c, i) => (
        <Sequence key={i} from={Math.round(c.at * fps)} name={`cue-${i}`}>
          <Audio src={staticFile(c.file)} volume={c.volume ?? 0.6} />
        </Sequence>
      ))}
    </>
  );
};
