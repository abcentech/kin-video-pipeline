import React from "react";
import {
  AbsoluteFill, OffthreadVideo, Img, Audio, Sequence, staticFile,
  useCurrentFrame, useVideoConfig, interpolate, spring, Easing,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Poppins";
import { z } from "zod";

const { fontFamily } = loadFont("normal", { weights: ["600", "700", "800", "900"], subsets: ["latin"] });

const NAVY = "#0C1330";
const NAVY2 = "#1A2450";
const GOLD = "#FFC500";

export const sceneSchema = z.object({
  start: z.number(), end: z.number(),
  section: z.string(), point: z.string(),
  ref: z.string().optional(), emoji: z.string().optional(),
  image: z.string().optional(), imagePrompt: z.string().optional(),
  teaser: z.string().optional(), // re-hook: "still ahead…" tease shown mid-scene
  noSplit: z.boolean().optional(), // short clean gap: skip the split, show the point immediately
});
export const longFormSchema = z.object({
  source: z.string(), title: z.string(), handle: z.string(),
  scenes: z.array(sceneSchema),
  openLoop: z.string().optional(),   // curiosity promise shown early in the body
  showHook: z.boolean().optional(),  // animated title hook over the first ~3.4s (off when a locked intro exists)
  showWatermark: z.boolean().optional(), // off for already-branded edited videos
  videoSeconds: z.number().optional(),
  subscribeEvery: z.number().optional(), // fire an animated SUBSCRIBE bug every N seconds across the whole video
  hookAt: z.number().optional(),         // seconds: drop a curiosity title-hook card at this time (e.g. right after a locked intro)
  hookText: z.string().optional(),       // the curiosity line for that hook (falls back to title)
  keywords: z.array(z.object({ at: z.number(), text: z.string() })).optional(), // short emphasis pops during talking-head motion
  recap: z.object({ at: z.number(), title: z.string().optional(), items: z.array(z.string()) }).optional(), // end-of-video points breakdown
  outro: z.object({                       // series-connected end card, layered over the editor's outro tail
    at: z.number(),                       // seconds: when to bring the card in
    day: z.number().optional(),           // "DAY 2 OF 5"
    total: z.number().optional(),
    next: z.string(),                     // tomorrow's tease, e.g. "How faith moves God's hand"
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

/* ====================================================== VIDEO + SPLIT ===== */
const Stage: React.FC<{ source: string; scenes: Scene[]; fps: number; showHook: boolean; bodyStart: number; bodyEnd: number }> =
  ({ source, scenes, fps, showHook, bodyStart, bodyEnd }) => {
  const f = useCurrentFrame();
  const t = f / fps;
  const inBody = t >= bodyStart && t < bodyEnd;
  let i = 0;
  for (let k = 0; k < scenes.length; k++) if (sceneStartF(scenes, k, fps, showHook) <= f) i = k;
  const sc = scenes[i];
  const local = (f - sceneStartF(scenes, i, fps, showHook)) / fps;
  const split = inBody && !sc.noSplit ? splitAmt(local) : 0; // no split outside body, or for point-only scenes

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
  const x = (1 - split) * 60;
  const kb = 1.05 + (f % 90) * 0.0006;
  return (
    <div style={{ position: "absolute", right: 0, top: 0, height: "100%", width: `${100 - vidW}%`, overflow: "hidden",
      borderLeft: `4px solid ${GOLD}`, opacity: Math.min(1, split * 1.4), transform: `translateX(${x}px)`, background: NAVY }}>
      {scene.image ? (
        <Img src={staticFile(scene.image)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${kb})` }} />
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
    <div style={{ position: "absolute", left: 90, right: 90, bottom: 150, opacity: op, transform: `translateY(${y}px)`, display: "flex", justifyContent: "center" }}>
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
const Teaser: React.FC<{ text: string; fps: number }> = ({ text, fps }) => {
  const f = useCurrentFrame();
  const start = 4.0 * fps; // after the section title has swept out, so the top never double-stacks
  const inn = spring({ frame: f - start, fps, config: { damping: 16 } });
  const out = interpolate(f, [start + 5.0 * fps, start + 5.5 * fps], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }); // hold ~5s, was too fast
  const op = Math.min(inn, out);
  if (op <= 0) return null;
  const y = interpolate(inn, [0, 1], [-30, 0]);
  return (
    <div style={{ position: "absolute", top: 44, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: op, transform: `translateY(${y}px)` }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 12, background: "rgba(12,19,48,0.85)", border: `1px solid rgba(255,197,0,0.5)`, borderRadius: 999, padding: "10px 22px", boxShadow: "0 8px 30px rgba(0,0,0,0.5)" }}>
        <span style={{ fontFamily, fontWeight: 800, fontSize: 22, color: NAVY, background: GOLD, padding: "3px 12px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 1 }}>Still ahead</span>
        <span style={{ fontFamily, fontWeight: 700, fontSize: 26, color: "#fff" }}>{text}</span>
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
  const y = interpolate(inn, [0, 1], [40, 0]);
  return (
    <div style={{ position: "absolute", left: 90, right: 90, top: 250, display: "flex", justifyContent: "center", opacity: op, transform: `translateY(${y}px)` }}>
      <div style={{ maxWidth: 1100, textAlign: "center", background: "linear-gradient(90deg, rgba(255,197,0,0.16), rgba(255,197,0,0.05))", border: `2px solid ${GOLD}`, borderRadius: 18, padding: "20px 34px", boxShadow: "0 16px 50px rgba(0,0,0,0.5)" }}>
        <div style={{ fontFamily, fontWeight: 800, fontSize: 24, color: GOLD, letterSpacing: 3, textTransform: "uppercase", marginBottom: 8 }}>Stay to the end</div>
        <div style={{ fontFamily, fontWeight: 800, fontSize: 40, color: "#fff", lineHeight: 1.12, textShadow: "0 3px 10px rgba(0,0,0,0.6)" }}>{text}</div>
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
const OutroCard: React.FC<{ day?: number; total?: number; next: string; handle: string; fps: number }> =
  ({ day, total, next, handle, fps }) => {
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
          <div style={{ fontFamily, fontWeight: 800, fontSize: 24, color: GOLD, letterSpacing: 3, textTransform: "uppercase", marginBottom: 6 }}>Tomorrow · same time</div>
          <div style={{ fontFamily, fontWeight: 900, fontSize: 44, color: "#fff", lineHeight: 1.05, textShadow: "0 3px 12px rgba(0,0,0,0.6)" }}>{next}</div>
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

const Watermark: React.FC<{ handle: string }> = ({ handle }) => (
  <div style={{ position: "absolute", top: 44, right: 56, display: "flex", alignItems: "center", gap: 12, background: "rgba(12,19,48,0.5)", padding: "8px 16px 8px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)" }}>
    <Img src={staticFile("logoIcon.svg")} style={{ width: 44, height: 44 }} />
    <span style={{ fontFamily, fontWeight: 800, fontSize: 26, color: "#fff" }}>{handle}</span>
  </div>
);

const Progress: React.FC<{ from: number; to: number }> = ({ from, to }) => {
  const f = useCurrentFrame();
  const pct = Math.max(0, Math.min(100, ((f - from) / (to - from)) * 100));
  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 8, background: "rgba(255,255,255,0.1)" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${GOLD}, #FF0033)` }} />
    </div>
  );
};

/* ============================================================ ROOT ======= */
export const LongForm: React.FC<Props> = ({ source, title, handle, scenes, openLoop, showHook, showWatermark, subscribeEvery, outro, hookAt, hookText, keywords, recap }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const hook = showHook ?? true;
  const wm = showWatermark ?? true;
  const bodyStart = scenes[0].start;
  const bodyEnd = scenes[scenes.length - 1].end;
  const inBodyNow = (f: number) => { const t = f / fps; return t >= bodyStart && t < bodyEnd; };
  const boundaries = scenes.map((s) => Math.round(s.start * fps));
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily }}>
      <Stage source={source} scenes={scenes} fps={fps} showHook={hook} bodyStart={bodyStart} bodyEnd={bodyEnd} />
      <Grade />
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
            <SectionTitle scene={sc} fps={fps} />
            <PointLowerThird scene={sc} sceneFrames={frames} fps={fps} />
            {sc.teaser ? <Teaser text={sc.teaser} fps={fps} /> : null}
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

      {/* end-of-video points breakdown — bounded to END before the outro card starts,
          so the two never stack (recap during the prayer, outro after) */}
      {recap ? (() => {
        const rFrom = Math.round(recap.at * fps);
        const rEnd = outro ? Math.round((outro.at - 1) * fps) : durationInFrames;
        return (
          <Sequence from={rFrom} durationInFrames={Math.max(1, rEnd - rFrom)} name="Day recap">
            <DayRecap title={recap.title} items={recap.items} fps={fps} />
          </Sequence>
        );
      })() : null}

      {/* series-connected outro card over the editor's closing tail */}
      {outro ? (
        <Sequence from={Math.round(outro.at * fps)} durationInFrames={durationInFrames - Math.round(outro.at * fps)} name="Outro card">
          <OutroCard day={outro.day} total={outro.total} next={outro.next} handle={handle} fps={fps} />
        </Sequence>
      ) : null}

      {hook ? <TitleHook title={title} fps={fps} /> : null}
      {/* curiosity title-hook dropped just after a locked intro (Sequence rebases frame to 0) */}
      {hookAt ? (
        <Sequence from={Math.round(hookAt * fps)} durationInFrames={Math.round(HOOK * fps)} name="Body hook">
          <TitleHook title={hookText || title} fps={fps} />
        </Sequence>
      ) : null}
      {/* watermark only over the body (keep any locked intro/outro clean) */}
      {wm ? <BodyOnly inBody={inBodyNow}><Watermark handle={handle} /></BodyOnly> : null}
      {/* progress bar spans the whole video, start to end */}
      <Progress from={0} to={durationInFrames} />
    </AbsoluteFill>
  );
};

const BodyOnly: React.FC<{ inBody: (f: number) => boolean; children: React.ReactNode }> = ({ inBody, children }) => {
  const f = useCurrentFrame();
  if (!inBody(f)) return null;
  return <>{children}</>;
};
