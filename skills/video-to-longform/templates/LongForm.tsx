import React from "react";
import {
  AbsoluteFill, OffthreadVideo, Img, Audio, Sequence, staticFile,
  useCurrentFrame, useVideoConfig, interpolate, spring, Easing,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Poppins";
import { z } from "zod";
import { Depth3D, SlideKenBurns, Motion3D } from "./Depth3D";
import { SoundLayer, soundSchema } from "./SoundLayer";
import { CinematicGrade } from "./CinematicGrade";
import { Scripture } from "./Scripture";
import { BodyCaptions } from "./BodyCaptions";

const { fontFamily } = loadFont("normal", { weights: ["600", "700", "800", "900"], subsets: ["latin"] });

const NAVY = "#0C1330";
const NAVY2 = "#1A2450";
const GOLD = "#FFC500";

export const sceneSchema = z.object({
  start: z.number(), end: z.number(),
  section: z.string(), point: z.string(),
  ref: z.string().optional(), emoji: z.string().optional(),
  image: z.string().optional(), imagePrompt: z.string().optional(),
  depth: z.string().nullable().optional(), // depth map for the b-roll still → Depth3D camera move
  motion: z.enum(["push-in", "pull-back", "dolly-left", "dolly-right", "crane-up", "orbit"]).optional(),
  teaser: z.string().optional(), // re-hook: "still ahead…" tease shown mid-scene
  noSplit: z.boolean().optional(), // short clean gap: skip the split, show the point immediately
  full: z.boolean().optional(), // full-screen b-roll cutaway (the designed slide fills the frame, Ken-Burns) instead of the side panel
});
// Opt-in immersion layer (July "Secrets of Longevity" standard). Absent on the
// June FIH comps → none of it mounts → those render byte-identical.
export const immersionSchema = z.object({
  enabled: z.boolean().default(false),
  bed: z.string().optional(),           // staticFile path of the full-length ambient bed (e.g. "audio/sol_e1_bed.mp3")
  bedVolume: z.number().default(0.14),  // low constant level under the continuous VO
  voiceEnd: z.number().optional(),      // sec the VO ends → bed swells into the CTA tail (≈ outro.at)
  grade: z.boolean().default(true),     // layer CinematicGrade (grain + warm + light-leak) over the whole video
  particles: z.boolean().default(true), // GodRays + embers, only in clean talking-head gaps
  sfx: z.boolean().default(true),       // auto-emit swoosh/impact/riser/swell on existing markers
  scriptures: z.array(z.object({
    at: z.number(),                     // sec (must land in a verified clean gap — no editor card here)
    ref: z.string(),                    // "Psalm 91:16"
    text: z.string(),                   // the verse line
    place: z.enum(["lower", "center"]).default("lower"),
    hold: z.number().default(5),        // seconds on screen
  })).default([]),
}).optional();

export const longFormSchema = z.object({
  source: z.string(), title: z.string(), handle: z.string(),
  scenes: z.array(sceneSchema),
  captions: z.array(z.object({ w: z.string(), start: z.number(), end: z.number(), emp: z.boolean().optional() })).optional(), // full word-for-word karaoke band (raw videos with no burned-in captions)
  sound: soundSchema, // optional bed + timed SFX cues (assign_sound.mjs)
  immersion: immersionSchema, // opt-in July immersion layer
  openLoop: z.string().optional(),   // curiosity promise shown early in the body
  showHook: z.boolean().optional(),  // animated title hook over the first ~3.4s (off when a locked intro exists)
  showWatermark: z.boolean().optional(), // off for already-branded edited videos
  videoSeconds: z.number().optional(),
  subscribeEvery: z.number().optional(), // fire an animated SUBSCRIBE bug every N seconds across the whole video
  wordmarkFill: z.boolean().optional(),  // bottom "KIDSINSPIRING NATION" wordmark that fills L→R as a progress gauge
  hookAt: z.number().optional(),         // seconds: drop a curiosity title-hook card at this time (e.g. right after a locked intro)
  hookText: z.string().optional(),       // the curiosity line for that hook (falls back to title)
  keywords: z.array(z.object({ at: z.number(), text: z.string() })).optional(), // short emphasis pops during talking-head motion
  teasers: z.array(z.object({ at: z.number(), text: z.string(), label: z.string().optional() })).optional(), // "still ahead / next" re-hook pills in the talking-head gaps
  recap: z.object({ at: z.number(), title: z.string().optional(), items: z.array(z.string()) }).optional(), // end-of-video points breakdown
  outro: z.object({                       // series-connected end card, layered over the editor's outro tail
    at: z.number(),                       // seconds: when to bring the card in
    day: z.number().optional(),           // "DAY 2 OF 5"
    total: z.number().optional(),
    next: z.string(),                     // tomorrow's tease, e.g. "How faith moves God's hand"
    label: z.string().optional(),         // overrides "Tomorrow · same time" (e.g. finale CTA "Join us live")
    url: z.string().optional(),           // small link line under `next` (e.g. KidsInspiringNation.t.me)
  }).optional(),
});
type Scene = z.infer<typeof sceneSchema>;
type Props = z.infer<typeof longFormSchema>;

const HOOK = 3.4;
const SP_IN = 1.0, SP_RAMP = 0.6, SP_HOLD = 2.6, SP_OUT = 0.7;
const SP_END = SP_IN + SP_RAMP + SP_HOLD + SP_OUT;

const sceneStartF = (scenes: Scene[], i: number, fps: number, showHook: boolean) =>
  i === 0 && showHook ? Math.round(HOOK * fps) : Math.round(scenes[i].start * fps);

const splitAmt = (localSec: number) =>
  interpolate(localSec, [SP_IN, SP_IN + SP_RAMP, SP_IN + SP_RAMP + SP_HOLD, SP_END], [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });

// Pure: the split-panel amount (0..1) at frame f. Extracted from Stage so the
// immersion "clean gap" gate can reuse the exact same value. Behavior-preserving.
const splitAt = (scenes: Scene[], f: number, fps: number, showHook: boolean, bodyStart: number, bodyEnd: number) => {
  const t = f / fps;
  const inBody = t >= bodyStart && t < bodyEnd;
  let i = 0;
  for (let k = 0; k < scenes.length; k++) if (sceneStartF(scenes, k, fps, showHook) <= f) i = k;
  const sc = scenes[i];
  const local = (f - sceneStartF(scenes, i, fps, showHook)) / fps;
  return inBody && !sc.noSplit && !sc.full ? splitAmt(local) : 0;
};

/* ====================================================== VIDEO + SPLIT ===== */
const Stage: React.FC<{ source: string; scenes: Scene[]; fps: number; showHook: boolean; bodyStart: number; bodyEnd: number }> =
  ({ source, scenes, fps, showHook, bodyStart, bodyEnd }) => {
  const f = useCurrentFrame();
  let i = 0;
  for (let k = 0; k < scenes.length; k++) if (sceneStartF(scenes, k, fps, showHook) <= f) i = k;
  const sc = scenes[i];
  const split = splitAt(scenes, f, fps, showHook, bodyStart, bodyEnd); // no split outside body, or for point-only scenes

  // NO zoom: the video plays at its natural framing. When the side panel shows,
  // the video keeps full height (face same size, centered) and only the far edges
  // are cropped to make room — never a zoom, push-in, or Ken-Burns.
  const vidW = 100 - 36 * split; // panel takes at most ~36%, so the face stays almost fully visible

  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${vidW}%`, overflow: "hidden" }}>
        <OffthreadVideo src={staticFile(source)}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 50%" }} />
      </div>
      {split > 0.001 ? <SplitPanel scene={sc} split={split} vidW={vidW} /> : null}
    </AbsoluteFill>
  );
};

const SplitPanel: React.FC<{ scene: Scene; split: number; vidW: number }> = ({ scene, split, vidW }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const x = (1 - split) * 60;
  const kb = 1.05 + (f % 90) * 0.0006;
  const panelW = Math.round((width * (100 - vidW)) / 100);
  const sceneMotion = (scene.motion as Motion3D | undefined) ?? ((scene.start | 0) % 2 ? "dolly-left" : "push-in");
  return (
    <div style={{ position: "absolute", right: 0, top: 0, height: "100%", width: `${100 - vidW}%`, overflow: "hidden",
      borderLeft: `4px solid ${GOLD}`, opacity: Math.min(1, split * 1.4), transform: `translateX(${x}px)`, background: NAVY }}>
      {scene.image ? (
        // moving b-roll: real depth-3D camera over the still (Ken-Burns fallback if no depth map)
        <Depth3D src={scene.image} depth={scene.depth} motion={sceneMotion} intensity={0.8} width={panelW} height={height} />
      ) : (
        <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 38%, ${NAVY2}, ${NAVY})`, justifyContent: "center", alignItems: "center", transform: `scale(${kb})` }}>
          <div style={{ fontSize: 220 }}>{scene.emoji || "✨"}</div>
        </AbsoluteFill>
      )}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "60px 44px 40px",
        background: "linear-gradient(to top, rgba(8,10,24,0.95), rgba(8,10,24,0))" }}>
        {scene.ref ? <span style={{ fontFamily, fontWeight: 800, fontSize: 28, color: NAVY, background: GOLD, padding: "6px 16px", borderRadius: 999 }}>{scene.ref}</span> : null}
        <div style={{ fontFamily, fontWeight: 900, fontSize: 52, color: "#fff", textTransform: "uppercase", lineHeight: 1, marginTop: 12, textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}>{scene.section}</div>
      </div>
    </div>
  );
};

/* Full-screen b-roll cutaway: the designed slide fills the whole frame with a real
   depth-3D / Ken-Burns move while the host keeps talking underneath (audio only).
   Used for the text-rich designed slides so none of the baked-in verse text is cropped.
   Wrapped in a <Sequence> by LongForm → frame rebases to 0; `frames` is its length. */
const FullBroll: React.FC<{ scene: Scene; frames: number; fps: number }> = ({ scene, frames, fps }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const fadeF = Math.round(0.45 * fps);
  const inn = interpolate(f, [0, fadeF], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const out = interpolate(f, [frames - fadeF, frames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const op = Math.min(inn, out);
  const motion = (scene.motion as Motion3D | undefined) ?? "push-in";
  return (
    <AbsoluteFill style={{ opacity: op, background: "#000" }}>
      {scene.image ? (
        // Designed slides are text-rich → contain-fit Ken-Burns (no crop, no warp).
        // Photographic b-roll can still opt into the depth mesh via scene.depth3d.
        (scene as { depth3d?: boolean }).depth3d && scene.depth ? (
          <Depth3D src={scene.image} depth={scene.depth} motion={motion} intensity={0.7} width={width} height={height} />
        ) : (
          <SlideKenBurns src={scene.image} motion={motion} width={width} height={height} />
        )
      ) : (
        <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 40%, ${NAVY2}, ${NAVY})`, justifyContent: "center", alignItems: "center" }}>
          <div style={{ fontSize: 280 }}>{scene.emoji || "✨"}</div>
        </AbsoluteFill>
      )}
      {/* gentle cinematic edge vignette so the full-frame slide reads as a deliberate cutaway */}
      <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(ellipse at 50% 50%, transparent 62%, rgba(0,0,0,0.42) 100%)" }} />
      {/* small gold reference chip for scripture cutaways (the slide carries the rest) */}
      {scene.ref ? (
        <div style={{ position: "absolute", left: 56, bottom: 130, fontFamily, fontWeight: 800, fontSize: 30, color: NAVY, background: GOLD, padding: "8px 20px", borderRadius: 999, boxShadow: "0 0 24px rgba(255,197,0,0.5)" }}>{scene.ref}</div>
      ) : null}
    </AbsoluteFill>
  );
};

const Grade: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none",
    background: "radial-gradient(ellipse at 50% 46%, transparent 56%, rgba(0,0,0,0.4) 100%)" }} />
);

const SceneFlash: React.FC<{ atFrames: number[] }> = ({ atFrames }) => {
  const f = useCurrentFrame();
  let o = 0;
  for (const a of atFrames) { const d = f - a; if (d >= 0 && d < 10) o = Math.max(o, interpolate(d, [0, 3, 10], [0, 0.55, 0])); }
  if (o <= 0) return null;
  return <AbsoluteFill style={{ background: "white", opacity: o, mixBlendMode: "screen" }} />;
};

/* ===================================================== SECTION TITLE ===== */
const SectionTitle: React.FC<{ scene: Scene; fps: number }> = ({ scene, fps }) => {
  const f = useCurrentFrame();
  const inn = spring({ frame: f, fps, config: { damping: 14, mass: 0.8 } });
  const hold = 3.2 * fps;
  const out = interpolate(f, [hold, hold + 12], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const op = Math.min(inn, out);
  if (op <= 0) return null;
  const x = interpolate(inn, [0, 1], [-90, 0]);
  const bar = interpolate(inn, [0.2, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const size = scene.section.length > 30 ? 52 : scene.section.length > 22 ? 62 : scene.section.length > 16 ? 72 : 86;
  return (
    <div style={{ position: "absolute", left: 90, top: 120, opacity: op, transform: `translateX(${x}px)`, maxWidth: 1180 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 16, background: "rgba(12,19,48,0.8)", borderLeft: `${10 * bar}px solid ${GOLD}`, borderRadius: 12, padding: "16px 30px", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        {scene.emoji ? <span style={{ fontSize: size * 0.78 }}>{scene.emoji}</span> : null}
        <span style={{ fontFamily, fontWeight: 900, fontSize: size, color: "#fff", letterSpacing: -1, textTransform: "uppercase", lineHeight: 0.98, textShadow: "0 0 24px rgba(255,197,0,0.35)" }}>{scene.section}</span>
      </div>
    </div>
  );
};

/* ============================================ KINETIC POINT LOWER-THIRD === */
const PointLowerThird: React.FC<{ scene: Scene; sceneFrames: number; fps: number }> = ({ scene, sceneFrames, fps }) => {
  const f = useCurrentFrame();
  const showFrom = (scene.noSplit ? 0.5 : SP_END) * fps; // point-only scenes show the point right away
  if (f < showFrom) return null;
  const inn = spring({ frame: f - showFrom, fps, config: { damping: 16, mass: 0.8 } });
  const out = interpolate(f, [sceneFrames - 14, sceneFrames - 2], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const op = Math.min(inn, out);
  if (op <= 0) return null;
  const y = interpolate(inn, [0, 1], [120, 0]);
  const words = scene.point.split(" ");
  const scan = ((f - showFrom) % (2.6 * fps)) / (2.6 * fps);
  const chipPulse = 1 + 0.06 * Math.sin(f * 0.18);
  return (
    <div style={{ position: "absolute", left: 90, right: 90, bottom: 180, opacity: op, transform: `translateY(${y}px)`, display: "flex", justifyContent: "center" }}>
      <div style={{ maxWidth: 1550, background: "linear-gradient(90deg, rgba(12,19,48,0.94), rgba(26,36,80,0.94))", border: "2px solid rgba(255,197,0,0.45)", borderRadius: 20, padding: "22px 40px", boxShadow: "0 18px 50px rgba(0,0,0,0.55)", display: "flex", alignItems: "center", gap: 22 }}>
        {scene.ref ? <span style={{ fontFamily, fontWeight: 800, fontSize: 32, color: NAVY, background: GOLD, padding: "8px 18px", borderRadius: 999, whiteSpace: "nowrap", transform: `scale(${chipPulse})`, boxShadow: "0 0 22px rgba(255,197,0,0.55)" }}>{scene.ref}</span> : null}
        <span style={{ fontFamily, fontWeight: 900, fontSize: 54, lineHeight: 1.06, display: "flex", flexWrap: "wrap", letterSpacing: -0.5 }}>
          {words.map((wd, i2) => {
            const t = words.length <= 1 ? 1 : i2 / (words.length - 1);
            const wIn = spring({ frame: f - showFrom - i2 * 2.4, fps, config: { damping: 14, mass: 0.5, stiffness: 140 } });
            const dist = Math.abs(t - scan);
            const lit = interpolate(dist, [0, 0.12], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            // bolder word entrance: pop up + slight overshoot scale, then the gold scan re-lights key words
            const pop = interpolate(wIn, [0, 0.7, 1], [0.7, 1.08, 1], { extrapolateRight: "clamp" });
            return (
              <span key={i2} style={{
                // marginRight holds the gap; keep the lit scale-up small + bottom-anchored
                // so a highlighted word never grows into its neighbour (word-jam fix).
                display: "inline-block", opacity: wIn, marginRight: "0.34em",
                transformOrigin: "center bottom",
                transform: `translateY(${(1 - wIn) * 28}px) scale(${pop * (1 + 0.06 * lit)})`,
                color: lit > 0.05 ? GOLD : "#fff",
                textShadow: lit > 0.05 ? "0 0 22px rgba(255,197,0,0.75)" : "0 3px 10px rgba(0,0,0,0.65)",
              }}>{wd}</span>
            );
          })}
        </span>
      </div>
    </div>
  );
};

/* ============================================ RE-HOOK ("still ahead…") ===
   Tiny curiosity tease at a scene's start, top-center, ~2.6s — keeps viewers
   anticipating what's coming so they don't drop. Only when scene.teaser set. */
const Teaser: React.FC<{ text: string; fps: number; label?: string; delay?: number }> = ({ text, fps, label, delay = 0 }) => {
  const f = useCurrentFrame();
  const start = delay * fps; // 0 for standalone timed teasers; ~4s when bound inside a scene
  const inn = spring({ frame: f - start, fps, config: { damping: 16 } });
  const out = interpolate(f, [start + 4.0 * fps, start + 4.5 * fps], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }); // hold ~4.5s
  const op = Math.min(inn, out);
  if (op <= 0) return null;
  const y = interpolate(inn, [0, 1], [-30, 0]);
  return (
    <div style={{ position: "absolute", top: 44, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: op, transform: `translateY(${y}px)` }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 12, maxWidth: "88%", background: "rgba(12,19,48,0.9)", border: `1px solid rgba(255,197,0,0.55)`, borderRadius: 999, padding: "9px 20px", boxShadow: "0 8px 30px rgba(0,0,0,0.5)" }}>
        <span style={{ fontFamily, fontWeight: 800, fontSize: 15, color: NAVY, background: GOLD, padding: "4px 13px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 1.5, whiteSpace: "nowrap" }}>{label || "Still ahead"}</span>
        <span style={{ fontFamily, fontWeight: 700, fontSize: 25, color: "#fff", lineHeight: 1.1, textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}>{text}</span>
      </div>
    </div>
  );
};

/* ============================================ OPEN LOOP (curiosity promise) ===
   Shown once, early in the body — the single biggest anti-drop tool. */
const OpenLoop: React.FC<{ text: string; fps: number }> = ({ text, fps }) => {
  const f = useCurrentFrame();
  const start = (SP_END + 0.6) * fps, life = 6 * fps; // after the split returns
  if (f < start || f > start + life) return null;
  const lf = f - start;
  const inn = spring({ frame: lf, fps, config: { damping: 15, mass: 0.8 } });
  const out = interpolate(lf, [life - 16, life], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const op = Math.min(inn, out);
  const y = interpolate(inn, [0, 1], [30, 0]);
  return (
    <div style={{ position: "absolute", left: 90, right: 90, bottom: 250, display: "flex", justifyContent: "center", opacity: op, transform: `translateY(${y}px)` }}>
      {/* compact single-line banner: solid navy + gold border, in the lower third (clear of the slide's baked title) */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 14, maxWidth: "88%", background: "rgba(12,19,48,0.92)", border: `1px solid ${GOLD}`, borderRadius: 999, padding: "9px 20px", boxShadow: "0 12px 34px rgba(0,0,0,0.55)" }}>
        <span style={{ fontFamily, fontWeight: 800, fontSize: 15, color: NAVY, background: GOLD, padding: "4px 13px", borderRadius: 999, letterSpacing: 1.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>Stay to the end</span>
        <span style={{ fontFamily, fontWeight: 700, fontSize: 26, color: "#fff", lineHeight: 1.1, textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}>{text}</span>
      </div>
    </div>
  );
};

/* ============================================ SUBSCRIBE BUG =============
   Animated "subscribe" reminder that fires every `everySec` across the WHOLE
   video. Sits at the bottom-left, RAISED above the editor's burned-in captions
   so it never sits on top of them. Slides up, bell wiggles, holds ~5s, slides
   out. Compact + cornered so it can coexist with a centered point card. */
const SUB_LIFE = 5.2; // seconds visible per appearance
const SubscribeBug: React.FC<{ fps: number }> = ({ fps }) => {
  const f = useCurrentFrame();
  const life = SUB_LIFE * fps;
  const inn = spring({ frame: f, fps, config: { damping: 13, mass: 0.8 } });
  const out = interpolate(f, [life - 16, life], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const op = Math.min(inn, out);
  if (op <= 0) return null;
  const y = interpolate(inn, [0, 1], [80, 0]);
  const wiggle = Math.sin(f * 0.5) * 10 * Math.max(0, 1 - f / (life * 0.7)); // bell rings early
  const pulse = 1 + 0.05 * Math.sin(f * 0.3);
  return (
    <div style={{ position: "absolute", left: 64, bottom: 230, opacity: op, transform: `translateY(${y}px)`,
      display: "inline-flex", alignItems: "center", gap: 16, padding: "14px 24px 14px 16px",
      background: "rgba(12,19,48,0.92)", border: "2px solid rgba(255,255,255,0.14)", borderRadius: 999,
      boxShadow: "0 14px 44px rgba(0,0,0,0.55)" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "#FF0033", color: "#fff",
        fontFamily, fontWeight: 900, fontSize: 30, letterSpacing: 0.5, textTransform: "uppercase",
        padding: "10px 22px", borderRadius: 999, transform: `scale(${pulse})`, boxShadow: "0 0 26px rgba(255,0,51,0.6)" }}>
        <span style={{ fontSize: 26, transform: `rotate(${wiggle}deg)`, display: "inline-block" }}>🔔</span>
        Subscribe
      </div>
      <span style={{ fontFamily, fontWeight: 800, fontSize: 24, color: "#fff", opacity: 0.95 }}>new video every day</span>
    </div>
  );
};

/* ============================================ KEYWORD POP ===============
   Short 1-4 word emphasis that punches in while the speaker is mid-motion,
   between the main beats — keeps the screen alive without becoming captions.
   Distinct look from the point cards: no box, big outlined word, quick
   overshoot pop + gold underline wipe, ~2.4s, then out. Sits upper-center so
   it clears the section title, point lower-third and burned-in captions. */
const KW_LIFE = 2.6;
const KeywordPop: React.FC<{ text: string; fps: number }> = ({ text, fps }) => {
  const f = useCurrentFrame();
  const life = KW_LIFE * fps;
  const inn = spring({ frame: f, fps, config: { damping: 12, mass: 0.6, stiffness: 150 } });
  const out = interpolate(f, [life - 12, life], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const op = Math.min(inn, out);
  if (op <= 0) return null;
  const pop = interpolate(inn, [0, 0.6, 1], [0.55, 1.1, 1], { extrapolateRight: "clamp" });
  const under = interpolate(inn, [0.35, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rot = interpolate(inn, [0, 1], [-3, 0]);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: "34%", display: "flex", justifyContent: "center", opacity: op }}>
      <div style={{ transform: `scale(${pop}) rotate(${rot}deg)`, textAlign: "center" }}>
        <div style={{ fontFamily, fontWeight: 900, fontSize: 92, color: "#fff", textTransform: "uppercase", letterSpacing: -1,
          WebkitTextStroke: "2px rgba(12,19,48,0.85)", textShadow: "0 6px 24px rgba(0,0,0,0.6)" }}>{text}</div>
        <div style={{ height: 10, marginTop: 8, marginLeft: "auto", marginRight: "auto", width: `${under * 100}%`, maxWidth: 520,
          background: `linear-gradient(90deg, ${GOLD}, #FF0033)`, borderRadius: 999, boxShadow: "0 0 20px rgba(255,197,0,0.6)" }} />
      </div>
    </div>
  );
};

/* ============================================ DAY RECAP CARD ============
   End-of-video breakdown: the day's points checked off one by one. The
   "save this" payoff that drives re-watches + completion. Full center card,
   layered over the editor's closing animation. */
const DayRecap: React.FC<{ title?: string; items: string[]; fps: number }> = ({ title, items, fps }) => {
  const f = useCurrentFrame();
  const inn = spring({ frame: f, fps, config: { damping: 16, mass: 0.9 } });
  const y = interpolate(inn, [0, 1], [50, 0]);
  return (
    <AbsoluteFill style={{ background: `rgba(8,10,24,${0.93 * inn})`, justifyContent: "center", alignItems: "center", opacity: inn }}>
      <div style={{ transform: `translateY(${y}px)`, width: 1280, maxWidth: "86%" }}>
        <div style={{ fontFamily, fontWeight: 800, fontSize: 30, color: GOLD, letterSpacing: 5, textTransform: "uppercase", textAlign: "center", marginBottom: 8 }}>Save this</div>
        <div style={{ fontFamily, fontWeight: 900, fontSize: 64, color: "#fff", textAlign: "center", textTransform: "uppercase", letterSpacing: -1, marginBottom: 30, textShadow: "0 4px 18px rgba(0,0,0,0.6)" }}>{title || "Today's Breakdown"}</div>
        {items.map((it, i) => {
          const ks = spring({ frame: f - (10 + i * 7), fps, config: { damping: 15, mass: 0.7 } });
          const kx = interpolate(ks, [0, 1], [-50, 0]);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 22, opacity: ks, transform: `translateX(${kx}px)`,
              background: "linear-gradient(90deg, rgba(26,36,80,0.9), rgba(12,19,48,0.6))", borderLeft: `8px solid ${GOLD}`,
              borderRadius: 14, padding: "18px 28px", marginBottom: 14 }}>
              <span style={{ flexShrink: 0, width: 46, height: 46, borderRadius: "50%", background: GOLD, color: NAVY, fontFamily, fontWeight: 900, fontSize: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>
              <span style={{ fontFamily, fontWeight: 800, fontSize: 40, color: "#fff", lineHeight: 1.05 }}>{it}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ============================================ SERIES OUTRO CARD =========
   Layered over the editor's existing outro tail. Series-connected: shows which
   day of the run this is and teases tomorrow's episode so the viewer comes back
   (binge/return-viewer = the strongest channel-growth signal). Lower-third band
   so the editor's closing animation still breathes above it. */
const OutroCard: React.FC<{ day?: number; total?: number; next: string; handle: string; fps: number; label?: string; url?: string }> =
  ({ day, total, next, handle, fps, label, url }) => {
  const f = useCurrentFrame();
  const inn = spring({ frame: f, fps, config: { damping: 15, mass: 0.9 } });
  const y = interpolate(inn, [0, 1], [120, 0]);
  const barW = interpolate(inn, [0.3, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pulse = 1 + 0.05 * Math.sin(f * 0.22);
  return (
    <div style={{ position: "absolute", left: 80, right: 80, bottom: 140, opacity: inn, transform: `translateY(${y}px)` }}>
      <div style={{ background: "linear-gradient(90deg, rgba(12,19,48,0.96), rgba(26,36,80,0.96))", border: `2px solid ${GOLD}`, borderRadius: 22, padding: "26px 40px", boxShadow: "0 22px 60px rgba(0,0,0,0.6)", display: "flex", alignItems: "center", gap: 30 }}>
        {day && total ? (
          <div style={{ flexShrink: 0, textAlign: "center", background: GOLD, color: NAVY, borderRadius: 16, padding: "14px 22px", transform: `scale(${pulse})` }}>
            <div style={{ fontFamily, fontWeight: 900, fontSize: 54, lineHeight: 0.9 }}>{day}</div>
            <div style={{ fontFamily, fontWeight: 800, fontSize: 20, letterSpacing: 1 }}>OF {total}</div>
          </div>
        ) : null}
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily, fontWeight: 800, fontSize: 24, color: GOLD, letterSpacing: 3, textTransform: "uppercase", marginBottom: 6 }}>{label || "Tomorrow · same time"}</div>
          <div style={{ fontFamily, fontWeight: 900, fontSize: 44, color: "#fff", lineHeight: 1.05, textShadow: "0 3px 12px rgba(0,0,0,0.6)" }}>{next}</div>
          {url ? <div style={{ fontFamily, fontWeight: 800, fontSize: 26, color: GOLD, marginTop: 8, letterSpacing: 0.5 }}>{url}</div> : null}
          <div style={{ height: 6, marginTop: 14, borderRadius: 999, background: "rgba(255,255,255,0.12)" }}>
            <div style={{ width: `${barW * 100}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${GOLD}, #FF0033)` }} />
          </div>
        </div>
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ background: "#FF0033", color: "#fff", fontFamily, fontWeight: 900, fontSize: 28, textTransform: "uppercase", padding: "12px 26px", borderRadius: 999, transform: `scale(${pulse})`, boxShadow: "0 0 26px rgba(255,0,51,0.6)" }}>🔔 Subscribe</div>
          <div style={{ fontFamily, fontWeight: 800, fontSize: 22, color: "#fff", opacity: 0.9 }}>{handle}</div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================ HOOK ======= */
const TitleHook: React.FC<{ title: string; fps: number }> = ({ title, fps }) => {
  const f = useCurrentFrame();
  const dur = HOOK * fps;
  if (f > dur) return null;
  const inn = spring({ frame: f, fps, config: { damping: 13, mass: 0.9 } });
  const out = interpolate(f, [dur - 14, dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const op = Math.min(inn, out);
  const words = title.split(" ");
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", background: `radial-gradient(circle at 50% 50%, rgba(12,19,48,${0.55 * op}), rgba(0,0,0,${0.78 * op}))` }}>
      <div style={{ opacity: op, transform: `scale(${0.9 + 0.1 * inn})`, textAlign: "center", padding: "0 120px" }}>
        <div style={{ fontFamily, fontWeight: 700, fontSize: 34, color: GOLD, letterSpacing: 6, textTransform: "uppercase", marginBottom: 18 }}>Devotional</div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center" }}>
          {words.map((wd, i2) => {
            const wIn = spring({ frame: f - i2 * 3, fps, config: { damping: 15, mass: 0.7 } });
            return <span key={i2} style={{ fontFamily, fontWeight: 900, fontSize: 130, color: "#fff", textTransform: "uppercase", lineHeight: 0.96, letterSpacing: -2, opacity: wIn, transform: `translateY(${(1 - wIn) * 40}px)`, textShadow: "0 0 40px rgba(255,197,0,0.4)", marginRight: "0.3em" }}>{wd}</span>;
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Watermark: React.FC<{ handle: string }> = () => (
  // brand rule: always the full KIN wordmark PNG on file — never the emblem-only mark
  <div style={{ position: "absolute", top: 40, right: 52 }}>
    <Img src={staticFile("kin_logo_full.png")} style={{ height: 56, width: "auto", filter: "drop-shadow(0 2px 10px rgba(0,0,0,0.65))" }} />
  </div>
);

/* ============================================ WORDMARK FILL ============
   The channel name doubles as the progress gauge: gold sweeps L→R across the
   letters as the video advances, with a glowing leading edge. Sits just above
   the thin progress bar, in the clear bottom band below the burned captions. */
const WordmarkFill: React.FC<{ from: number; to: number; text?: string; shimmer?: boolean }> = ({ from, to, text, shimmer }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = Math.max(0, Math.min(1, (f - from) / (to - from)));
  const wm = text || "KIDSINSPIRING NATION";
  const fontStyle: React.CSSProperties = {
    fontFamily, fontWeight: 900, fontSize: 18, letterSpacing: 2, textTransform: "uppercase",
    whiteSpace: "nowrap", lineHeight: 1,
  };
  // premium: a specular highlight sweeps across the filled gold + a pulsing glow + brighter spark
  const sweep = (f % (2.4 * fps)) / (2.4 * fps);          // 0..1 every 2.4s
  const glow = shimmer ? 0.55 + 0.35 * Math.abs(Math.sin(f / 18)) : 0.55;
  const sparkW = shimmer ? 4 : 2.5;
  return (
    <div style={{ position: "absolute", left: 22, bottom: 16, display: "flex", pointerEvents: "none" }}>
      <div style={{ position: "relative", display: "inline-block" }}>
        <span style={{ ...fontStyle, color: "rgba(255,255,255,0.20)" }}>{wm}</span>
        <span style={{ ...fontStyle, position: "absolute", left: 0, top: 0, color: GOLD,
          textShadow: `0 0 ${shimmer ? 16 : 12}px rgba(255,197,0,${glow})`, clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` }}>{wm}</span>
        {shimmer ? (
          <span aria-hidden style={{ ...fontStyle, position: "absolute", left: 0, top: 0, color: "#FFF6D8",
            clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`,
            WebkitMaskImage: `linear-gradient(90deg, transparent ${sweep * 100 - 10}%, rgba(0,0,0,0.9) ${sweep * 100}%, transparent ${sweep * 100 + 10}%)`,
            maskImage: `linear-gradient(90deg, transparent ${sweep * 100 - 10}%, rgba(0,0,0,0.9) ${sweep * 100}%, transparent ${sweep * 100 + 10}%)` }}>{wm}</span>
        ) : null}
        <div style={{ position: "absolute", top: -4, bottom: -4, left: `${p * 100}%`, width: sparkW, borderRadius: 2,
          background: "#FFE08a", boxShadow: `0 0 ${shimmer ? 16 : 12}px rgba(255,197,0,0.95)`, opacity: p > 0.002 && p < 0.999 ? 1 : 0 }} />
      </div>
    </div>
  );
};

const Progress: React.FC<{ from: number; to: number; shimmer?: boolean }> = ({ from, to, shimmer }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = Math.max(0, Math.min(1, (f - from) / (to - from)));
  const pct = p * 100;
  const sweep = (f % (2.4 * fps)) / (2.4 * fps);
  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 8, background: "rgba(255,255,255,0.1)" }}>
      <div style={{ position: "relative", width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${GOLD}, #FF0033)`,
        boxShadow: shimmer ? "0 0 12px rgba(255,197,0,0.6)" : "none" }}>
        {shimmer ? (
          <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.85)",
            WebkitMaskImage: `linear-gradient(90deg, transparent ${sweep * 100 - 8}%, rgba(0,0,0,0.9) ${sweep * 100}%, transparent ${sweep * 100 + 8}%)`,
            maskImage: `linear-gradient(90deg, transparent ${sweep * 100 - 8}%, rgba(0,0,0,0.9) ${sweep * 100}%, transparent ${sweep * 100 + 8}%)` }} />
        ) : null}
        {shimmer ? (
          <div style={{ position: "absolute", top: -2, bottom: -2, right: -1.5, width: 3, borderRadius: 2,
            background: "#FFF0B0", boxShadow: "0 0 12px rgba(255,224,138,0.95)" }} />
        ) : null}
      </div>
    </div>
  );
};

/* ============================================ ATMOSPHERE (immersion) =====
   Procedural god-rays + floating embers (adapted from PixarIntro), gated to the
   clean talking-head gaps so they never sit over a card/point/recap/outro. */
const GodRays: React.FC<{ speed: number }> = ({ speed }) => {
  const f = useCurrentFrame();
  const drift = Math.sin(f / (40 / speed)) * 18;
  const op = 0.18 + Math.sin(f / 30) * 0.06;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen", opacity: op,
      transform: `translateX(${drift}px) rotate(${drift * 0.05}deg)`,
      background: "repeating-conic-gradient(from 90deg at 50% -10%, rgba(245,222,150,0.0) 0deg, rgba(245,222,150,0.55) 2deg, rgba(245,222,150,0.0) 6deg)",
      maskImage: "radial-gradient(70% 80% at 50% 0%, #000 30%, transparent 75%)" }} />
  );
};
const Particles: React.FC<{ n: number; speed: number }> = ({ n, speed }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen" }}>
      {Array.from({ length: n }).map((_, k) => {
        const seed = (k * 97.13) % 100;
        const x = seed % 100;
        const y = (100 + 100 * Math.sin((f * speed) / 200 + k) - (f * speed * 0.08)) % 100;
        const yy = ((y % 100) + 100) % 100;
        const s = 1.5 + (seed % 3);
        const op = 0.25 + 0.35 * Math.abs(Math.sin(f / 25 + k));
        return <div key={k} style={{ position: "absolute", left: `${x}%`, top: `${yy}%`, width: s, height: s,
          borderRadius: "50%", background: "rgba(255,240,200,1)", boxShadow: "0 0 6px 2px rgba(245,200,120,0.7)", opacity: op }} />;
      })}
    </AbsoluteFill>
  );
};
// Embers/god-rays only inside the VERIFIED-clean scene windows (where we know the
// editor has no card/b-roll), and only while none of our own overlays cover the
// frame. A short ease in/out at each window edge keeps it from popping.
const Atmosphere: React.FC<{ busy: (f: number) => number; windows: ReadonlyArray<readonly [number, number]>; fps: number }> = ({ busy, windows, fps }) => {
  const f = useCurrentFrame();
  const ease = Math.round(0.5 * fps);
  let win = 0;
  for (const [a, b] of windows) {
    if (f >= a && f < b) win = Math.max(win, Math.min(1, (f - a) / ease, (b - f) / ease));
  }
  const gate = win * (1 - busy(f));
  if (gate <= 0.01) return null;
  return (
    <AbsoluteFill style={{ opacity: gate, pointerEvents: "none" }}>
      <GodRays speed={0.6} />
      <Particles n={26} speed={0.7} />
    </AbsoluteFill>
  );
};

/* ============================================================ ROOT ======= */
export const LongForm: React.FC<Props> = ({ source, title, handle, scenes, captions, openLoop, showHook, showWatermark, subscribeEvery, outro, hookAt, hookText, keywords, teasers, recap, wordmarkFill, sound, immersion }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const hook = showHook ?? true;
  const wm = showWatermark ?? true;
  const bodyStart = scenes[0].start;
  const bodyEnd = scenes[scenes.length - 1].end;
  const inBodyNow = (f: number) => { const t = f / fps; return t >= bodyStart && t < bodyEnd; };
  const boundaries = scenes.map((s) => Math.round(s.start * fps));

  // ----- immersion (opt-in; null on the June comps → nothing below mounts) -----
  const imm = immersion?.enabled ? immersion : null;
  const HOOKF = Math.round(HOOK * fps);
  const recapWin = recap ? (() => {
    const RECAP_HOLD = 9;
    const rFrom = Math.round(recap.at * fps);
    const rCap = outro ? Math.round((outro.at - 1) * fps) : durationInFrames;
    const rEnd = Math.min(rCap, rFrom + Math.round(RECAP_HOLD * fps));
    return [rFrom, rEnd] as const;
  })() : null;
  // captions hide whenever one of our cards covers the frame: any scene window
  // (section title / point / split-panel slide / scripture side-roll), recap, outro, or a hook.
  const captionHidden = (f: number) => {
    const t = f / fps;
    if (hook && f < HOOKF) return true;
    if (hookAt) { const hf = hookAt; if (t >= hf && t < hf + HOOK) return true; }
    if (recap && t >= recap.at - 0.4) return true;
    if (outro && t >= outro.at - 0.4) return true;
    // Captions are burned-in and CONTINUOUS (like the edited videos): they sit on their
    // own transparent-black pill at the very bottom and never hide for point cards,
    // scriptures, or slide cutaways — those all sit in the lower-third ABOVE the pill.
    // Only full-screen takeovers (hook / recap / outro) suppress them.
    return false;
  };
  // 0 = clean talking-head gap, 1 = one of our cards/overlays is covering the frame
  const overlayBusy = (f: number) => {
    let busy = Math.min(1, splitAt(scenes, f, fps, hook, bodyStart, bodyEnd) * 2);
    if (recapWin && f >= recapWin[0] && f < recapWin[1]) busy = 1;
    if (outro && f >= Math.round(outro.at * fps)) busy = 1;
    if (hook && f < HOOKF) busy = 1;
    if (hookAt) { const hf = Math.round(hookAt * fps); if (f >= hf && f < hf + HOOKF) busy = 1; }
    return busy;
  };
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily }}>
      <SoundLayer sound={sound} />
      <Stage source={source} scenes={scenes} fps={fps} showHook={hook} bodyStart={bodyStart} bodyEnd={bodyEnd} />
      <Grade />
      {/* immersion: cinematic finish + atmosphere (above the video, below the text overlays) */}
      {imm?.grade ? <CinematicGrade flare /> : null}
      {imm?.particles ? <Atmosphere busy={overlayBusy} windows={scenes.map((s) => [Math.round(s.start * fps), Math.round(s.end * fps)] as const)} fps={fps} /> : null}
      {/* immersion: ambient bed ducked under the VO, swelling into the CTA tail */}
      {imm?.bed ? <SoundLayer sound={{ bed: imm.bed, bedVolume: imm.bedVolume ?? 0.14, cues: [] }} voiceEnd={imm.voiceEnd} duck={0.5} /> : null}
      {/* immersion: auto-emitted SFX on existing markers (swoosh on topic hook, impact on
          keyword pops, riser into recap, swell on outro) — no hand-authoring in JSON */}
      {imm?.sfx ? (() => {
        const cues: { at: number; file: string; volume: number }[] = [];
        if (hookAt) cues.push({ at: hookAt, file: "whoosh.mp3", volume: 0.55 });
        (keywords ?? []).forEach((kw) => cues.push({ at: kw.at, file: "impact.mp3", volume: 0.4 }));
        if (recap) cues.push({ at: Math.max(0, recap.at - 1.2), file: "audio/riser.mp3", volume: 0.5 });
        if (outro) cues.push({ at: outro.at, file: "audio/swell.mp3", volume: 0.5 });
        return <SoundLayer sound={{ bedVolume: 0, cues }} />;
      })() : null}
      <SceneFlash atFrames={boundaries} />

      {boundaries.map((b, i2) => (
        <Sequence key={`w${i2}`} from={Math.max(0, b - 3)} durationInFrames={Math.round(0.9 * fps)} name={`whoosh ${i2}`}>
          <Audio src={staticFile("whoosh.mp3")} volume={0.32} />
        </Sequence>
      ))}

      {scenes.map((sc, i2) => {
        const from = sceneStartF(scenes, i2, fps, hook);
        const frames = Math.round(sc.end * fps) - from;
        return (
          <Sequence key={i2} from={from} durationInFrames={frames} name={`Scene ${i2 + 1}: ${sc.section}`}>
            {sc.full ? (
              <FullBroll scene={sc} frames={frames} fps={fps} />
            ) : (
              <>
                <SectionTitle scene={sc} fps={fps} />
                <PointLowerThird scene={sc} sceneFrames={frames} fps={fps} />
              </>
            )}
            {sc.teaser ? <Teaser text={sc.teaser} fps={fps} delay={4.0} /> : null}
            {i2 === 0 && openLoop ? <OpenLoop text={openLoop} fps={fps} /> : null}
          </Sequence>
        );
      })}

      {/* subscribe bug every `subscribeEvery` seconds — but never during the recap/outro
          end-card sequence (the outro card already carries a Subscribe button) */}
      {subscribeEvery ? Array.from({ length: Math.floor((durationInFrames / fps) / subscribeEvery) }, (_, k) => {
        const at = Math.round((k + 1) * subscribeEvery * fps);
        const endZone = (recap ? recap.at : outro ? outro.at : durationInFrames / fps) * fps;
        if (at + SUB_LIFE * fps > durationInFrames || at >= endZone - fps) return null;
        return (
          <Sequence key={`sub${k}`} from={at} durationInFrames={Math.round(SUB_LIFE * fps)} name={`Subscribe ${k + 1}`}>
            <SubscribeBug fps={fps} />
          </Sequence>
        );
      }) : null}

      {/* short keyword pops during talking-head motion (between the main beats) */}
      {keywords ? keywords.map((kw, k) => (
        <Sequence key={`kw${k}`} from={Math.round(kw.at * fps)} durationInFrames={Math.round(KW_LIFE * fps)} name={`Keyword: ${kw.text}`}>
          <KeywordPop text={kw.text} fps={fps} />
        </Sequence>
      )) : null}

      {/* "still ahead / next" re-hook pills, timed into the talking-head gaps */}
      {teasers ? teasers.map((tz, k) => (
        <Sequence key={`tz${k}`} from={Math.round(tz.at * fps)} durationInFrames={Math.round(5.0 * fps)} name={`Teaser: ${tz.text}`}>
          <Teaser text={tz.text} label={tz.label} delay={0} fps={fps} />
        </Sequence>
      )) : null}

      {/* immersion: elegant serif scripture reveals (only verses the editor didn't card) */}
      {imm?.scriptures?.length ? imm.scriptures.map((s, k) => (
        <Sequence key={`scr${k}`} from={Math.round(s.at * fps)} durationInFrames={Math.round((s.hold ?? 5) * fps)} name={`Scripture: ${s.ref}`}>
          <Scripture reference={s.ref} text={s.text} place={s.place} hold={s.hold ?? 5} fps={fps} />
        </Sequence>
      )) : null}

      {/* end-of-video points breakdown — bounded to END before the outro card starts,
          so the two never stack (recap during the prayer, outro after) */}
      {recap ? (() => {
        const RECAP_HOLD = 9; // seconds: full-screen recap is static, so cap it (long freezes hurt retention)
        const rFrom = Math.round(recap.at * fps);
        const rCap = outro ? Math.round((outro.at - 1) * fps) : durationInFrames;
        const rEnd = Math.min(rCap, rFrom + Math.round(RECAP_HOLD * fps));
        return (
          <Sequence from={rFrom} durationInFrames={Math.max(1, rEnd - rFrom)} name="Day recap">
            <DayRecap title={recap.title} items={recap.items} fps={fps} />
          </Sequence>
        );
      })() : null}

      {/* series-connected outro card over the editor's closing tail */}
      {outro ? (
        <Sequence from={Math.round(outro.at * fps)} durationInFrames={durationInFrames - Math.round(outro.at * fps)} name="Outro card">
          <OutroCard day={outro.day} total={outro.total} next={outro.next} handle={handle} fps={fps} label={(outro as any).label} url={(outro as any).url} />
        </Sequence>
      ) : null}

      {hook ? <TitleHook title={title} fps={fps} /> : null}
      {/* curiosity title-hook dropped just after a locked intro (Sequence rebases frame to 0) */}
      {hookAt ? (
        <Sequence from={Math.round(hookAt * fps)} durationInFrames={Math.round(HOOK * fps)} name="Body hook">
          <TitleHook title={hookText || title} fps={fps} />
        </Sequence>
      ) : null}
      {/* full word-for-word karaoke band (raw videos w/o burned captions); auto-hides under any card */}
      {captions?.length ? <BodyCaptions words={captions} hide={captionHidden} /> : null}
      {/* watermark only over the body (keep any locked intro/outro clean) */}
      {wm ? <BodyOnly inBody={inBodyNow}><Watermark handle={handle} /></BodyOnly> : null}
      {/* progress bar spans the whole video, start to end (premium shimmer when immersion on) */}
      <Progress from={0} to={durationInFrames} shimmer={!!imm} />
      {/* optional: channel wordmark that fills L→R as a progress gauge, above the bar */}
      {wordmarkFill ? <WordmarkFill from={0} to={durationInFrames} shimmer={!!imm} /> : null}
    </AbsoluteFill>
  );
};

const BodyOnly: React.FC<{ inBody: (f: number) => boolean; children: React.ReactNode }> = ({ inBody, children }) => {
  const f = useCurrentFrame();
  if (!inBody(f)) return null;
  return <>{children}</>;
};
