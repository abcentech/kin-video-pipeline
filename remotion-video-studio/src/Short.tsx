import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Audio,
  Img,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { z } from "zod";
import { fontFamily } from "./font";
import { capFont, keywordFont } from "./captionFonts";
// Offline Poppins (./font embeds woff2 as base64) — the Google-Fonts loader fetches
// from gstatic at module load and breaks every render (incl. music/movie comps) when
// the compositor has no network. ./font is the same Poppins, fully offline.

const NAVY = "#0C1330";
const NAVY2 = "#1A2450";
const GOLD = "#FFC500";
const GOLD_LT = "#FFD43B";

/* ---------- zod schema: makes captions editable in Remotion Studio ----------
   Every prop is plain JSON (filenames, not staticFile() calls) so Studio's
   Props panel renders editable fields and the "Save" button writes edits back
   to src/Root.tsx. Edit a word's `w` (text) or toggle `emp` right in Studio. */

export const wordSchema = z.object({
  w: z.string(),
  start: z.number(),
  end: z.number(),
  emp: z.boolean().optional(),
});
export const insertSchema = z.object({
  start: z.number(),
  end: z.number(),
  title: z.string(),
  sub: z.string().optional(),
  emoji: z.string().optional(),
  video: z.string().optional(),
});
export const channelSchema = z.object({
  glyph: z.string().optional(),
  icon: z.string().optional(),
  label: z.string(),
  color: z.string(),
});

export const shortSchema = z.object({
  video: z.string(),
  music: z.string(),
  closing: z.string(),
  words: z.array(wordSchema),
  handle: z.string(),
  hook: z.string(),
  reHook: z.string().optional(),
  payoffSec: z.number().nullable().optional(),
  channels: z.array(channelSchema),
  inserts: z.array(insertSchema).optional(),
  capY: z.string().nullable().optional(),
  introSeconds: z.number(),
  clipSeconds: z.number(),
  closingSeconds: z.number(),
});

export type Word = z.infer<typeof wordSchema>;
export type Insert = z.infer<typeof insertSchema>;
type Channel = z.infer<typeof channelSchema>;
type Props = z.infer<typeof shortSchema>;

/* ---------- v4-style captions: per-word highlight + emphasis ---------- */

function buildPages(words: Word[], maxWords = 3): Word[][] {
  const pages: Word[][] = [];
  let cur: Word[] = [];
  for (const word of words) {
    cur.push(word);
    if (cur.length >= maxWords || /[.!?]$/.test(word.w.trim())) {
      pages.push(cur);
      cur = [];
    }
  }
  if (cur.length) pages.push(cur);
  return pages;
}

const CaptionWord: React.FC<{ word: Word; pageStartFrame: number; index: number }> = ({
  word,
  pageStartFrame,
  index,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const ts = frame / fps; // seconds clock for cyclic motion

  const emp = !!word.emp;
  const active = t >= word.start && t <= word.end + 0.08;
  const spoken = t > word.end + 0.08;

  // ---- entrance: blur-in + rise + overshoot scale, staggered per word ----
  const enter = spring({
    frame: frame - pageStartFrame - index * 3,
    fps,
    config: { damping: 11, mass: 0.7, stiffness: 130 },
  });
  const blurIn = interpolate(enter, [0, 1], [16, 0], { extrapolateRight: "clamp" });
  const yIn = interpolate(enter, [0, 1], [58, 0]);
  const sIn = interpolate(enter, [0, 0.55, 1], [0.32, 1.14, 1], { extrapolateRight: "clamp" });

  // ---- active punch (slams in when the word is spoken) ----
  const punch = spring({
    frame: frame - Math.round(word.start * fps),
    fps,
    config: { damping: 8, mass: 0.4, stiffness: 210 },
  });
  const punchS = active ? interpolate(punch, [0, 1], [emp ? 1.36 : 1.22, 1], { extrapolateRight: "clamp" }) : 1;

  // ---- living motion: breathing pulse + organic per-word float + active tilt ----
  const breath = 0.5 + 0.5 * Math.sin(ts * (emp ? 4.2 : 5.6) + index);
  const pulseS = active ? 1 + breath * (emp ? 0.06 : 0.04) : emp ? 1 + breath * 0.02 : 1;
  const bob = Math.sin(ts * 2 + index * 1.3) * (active ? 6 : emp ? 4 : 2.5);
  const tilt = active ? Math.sin(ts * 3.1) * 2.4 : emp ? Math.sin(ts * 2.2) * 1.2 : 0;
  // cinematic focus-pull: upcoming words sit back (dim + soft), active blazes forward
  const upcoming = !active && !spoken;
  const stateScale = active ? 1 : spoken ? 0.9 : 0.88;
  const focusBlur = upcoming ? 2.4 : 0;
  const op = enter * (active ? 1 : spoken ? 0.66 : 0.46);
  const size = emp ? 112 : 80;

  // ---- animated gold-gradient glyph fill (shimmer sweeps across via bg-position) ----
  const sweep = (ts * 60 + index * 40) % 200; // moving highlight band
  const grad = active
    ? `linear-gradient(108deg, #FFFBEA 0%, #FFE38A ${sweep * 0.18}%, #FFC500 ${sweep * 0.18 + 18}%, #FF9D00 ${sweep * 0.18 + 34}%, #FFF3BF 100%)`
    : emp
    ? `linear-gradient(108deg, #FFEFB0, #FFC500, #FF8A00)`
    : spoken
    ? `linear-gradient(108deg, #E7E7F0, #BFC0CE)`
    : `linear-gradient(108deg, #FFFFFF, #D7D8E6)`;

  const auraRGB = active || emp ? "255,197,0" : "150,178,255";
  const auraStrength = active ? 0.95 : emp ? 0.7 : spoken ? 0.12 : 0.3;
  const haloBlur = active ? 26 : emp ? 16 : 10;
  const haloOp = auraStrength * (0.55 + 0.45 * breath);

  const typo: React.CSSProperties = {
    fontFamily: emp ? keywordFont : capFont,
    fontWeight: emp ? 400 : active ? 900 : 800, // Anton is a single heavy weight (400)
    fontSize: emp ? size : size,
    lineHeight: 1.04,
    letterSpacing: emp ? 0.5 : -1,
    textTransform: emp ? "uppercase" : "none",
    whiteSpace: "pre",
  };

  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        opacity: op,
        filter: blurIn + focusBlur > 0.2 ? `blur(${blurIn + focusBlur}px)` : undefined,
        transform: `translateY(${yIn + bob}px) scale(${sIn * punchS * pulseS * stateScale}) rotate(${tilt}deg)`,
        transformOrigin: "center bottom",
        willChange: "transform, opacity",
      }}
    >
      {/* bloom halo — a blurred duplicate behind the glyphs that breathes */}
      <span
        aria-hidden
        style={{
          ...typo,
          position: "absolute",
          left: 0,
          top: 0,
          color: `rgba(${auraRGB},1)`,
          filter: `blur(${haloBlur}px)`,
          opacity: haloOp,
          transform: `scale(${active ? 1.08 : 1.03})`,
          zIndex: 0,
          pointerEvents: "none",
        }}
      >
        {word.w}
      </span>
      {/* crisp gradient glyph with dark stroke for legibility on any footage */}
      <span
        style={{
          ...typo,
          position: "relative",
          zIndex: 1,
          backgroundImage: grad,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          WebkitTextStroke: `${active ? 2.4 : 2}px rgba(8,10,22,0.82)`,
          paintOrder: "stroke fill",
          filter: `drop-shadow(0 4px 10px rgba(0,0,0,0.6)) drop-shadow(0 0 ${active ? 16 : 6}px rgba(${auraRGB},${auraStrength * 0.6}))`,
        }}
      >
        {word.w}
      </span>
      {/* glowing shimmer underline that wipes in under the active word */}
      {(active || (emp && t >= word.start)) && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: "6%",
            right: "6%",
            bottom: -10,
            height: active ? 9 : 6,
            borderRadius: 9,
            backgroundImage: `linear-gradient(90deg, rgba(255,197,0,0) 0%, ${GOLD_LT} ${sweep / 2}%, #FFFFFF ${sweep / 2 + 8}%, ${GOLD} ${sweep / 2 + 16}%, rgba(255,197,0,0) 100%)`,
            transform: `scaleX(${interpolate(punch, [0, 1], [0, 1], { extrapolateRight: "clamp" })})`,
            transformOrigin: "center",
            boxShadow: `0 0 18px rgba(255,197,0,${0.6 + 0.4 * breath}), 0 0 36px rgba(255,197,0,0.4)`,
            zIndex: 2,
          }}
        />
      )}
    </span>
  );
};

const Captions: React.FC<{ words: Word[]; capY?: string | null }> = ({ words, capY }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const pages = React.useMemo(() => buildPages(words), [words]);
  const page = pages.find((p) => t >= p[0].start - 0.12 && t <= p[p.length - 1].end + 0.2);
  if (!page) return null;
  const pageStartFrame = Math.round(page[0].start * fps);
  const drift = Math.sin((frame / fps) * 1.3) * 5;
  const sway = Math.cos((frame / fps) * 0.9) * 4;
  const pageIn = spring({ frame: frame - pageStartFrame, fps, config: { damping: 16, mass: 0.8 } });
  return (
    <div
      style={{
        position: "absolute",
        left: 40,
        right: 40,
        top: capY ?? "44%",
        transform: `translate(${sway}px, ${drift}px)`,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        gap: "10px 20px",
      }}
    >
      {/* soft radial bloom that lifts the line off the footage */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 1000,
          height: 360,
          transform: `translate(-50%, -50%) scale(${interpolate(pageIn, [0, 1], [0.7, 1])})`,
          background:
            "radial-gradient(ellipse at center, rgba(8,10,22,0.55) 0%, rgba(8,10,22,0.32) 38%, rgba(255,197,0,0.06) 58%, rgba(0,0,0,0) 75%)",
          filter: "blur(14px)",
          opacity: pageIn,
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      {page.map((word, i) => (
        <CaptionWord key={i} word={word} pageStartFrame={pageStartFrame} index={i} />
      ))}
    </div>
  );
};

/* ---------- Watermark + progress + lower third ---------- */

const Watermark: React.FC<{ handle: string }> = ({ handle }) => (
  <div style={{ position: "absolute", top: 44, left: 36, display: "flex", alignItems: "center" }}>
    <Img src={staticFile("kin_logo_full.png")} style={{ height: 72, width: "auto", filter: "drop-shadow(0 4px 14px rgba(0,0,0,0.65))" }} />
  </div>
);

const ProgressBar: React.FC<{ totalFrames: number }> = ({ totalFrames }) => {
  const frame = useCurrentFrame();
  const pct = Math.min(100, (frame / totalFrames) * 100);
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 10, background: "rgba(255,255,255,0.12)" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${GOLD}, #FF0033)`, boxShadow: `0 0 12px ${GOLD}` }} />
    </div>
  );
};

const LowerThird: React.FC<{ handle: string }> = ({ handle }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame: frame - 12, fps, config: { damping: 14, mass: 0.7 } });
  const exit = interpolate(frame, [durationInFrames - 16, durationInFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const y = interpolate(enter, [0, 1], [240, 0]) + exit * 240;
  const pulse = 1 + 0.06 * Math.sin((frame / fps) * Math.PI * 2 * 1.1);
  return (
    <div style={{ position: "absolute", bottom: 140, left: 0, right: 0, display: "flex", justifyContent: "center", transform: `translateY(${y}px)`, opacity: 1 - exit }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, background: "rgba(12,19,48,0.86)", border: "2px solid rgba(255,197,0,0.35)", borderRadius: 26, padding: "18px 26px", boxShadow: "0 18px 50px rgba(0,0,0,0.5)" }}>
        <Img src={staticFile("kin_logo_full.png")} style={{ height: 66, width: "auto" }} />
        <div style={{ transform: `scale(${pulse})`, background: "#FF0033", color: "#fff", fontFamily, fontWeight: 700, fontSize: 36, padding: "14px 28px", borderRadius: 999, display: "flex", alignItems: "center", gap: 10, boxShadow: "0 6px 22px rgba(255,0,51,0.55)" }}>
          <span style={{ fontSize: 34 }}>▶</span> SUBSCRIBE
        </div>
        <span style={{ fontFamily, fontWeight: 800, fontSize: 34, color: "#fff" }}>{handle}</span>
      </div>
    </div>
  );
};

/* ---------- HOOK BANNER: curiosity gap on frame 1, over the live video ----------
   Hook-first (2026 algorithm): no pre-roll logo. The open-loop headline rides on
   top of the speaking clip for the first ~2.7s, then clears so captions take over. */

const HookBanner: React.FC<{ hook: string }> = ({ hook }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const HOLD = 2.7; // seconds on screen
  const outF = Math.round(HOLD * fps);
  if (frame > outF) return null;
  const inS = spring({ frame, fps, config: { damping: 13, mass: 0.6, stiffness: 170 } });
  const out = interpolate(frame, [outF - 8, outF], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const size = hook.length > 30 ? 84 : hook.length > 18 ? 104 : 124;
  const y = interpolate(inS, [0, 1], [-70, 0]) - (1 - out) * 40;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 150, opacity: out, pointerEvents: "none" }}>
      <Sequence from={0} durationInFrames={20} layout="none"><Audio src={staticFile("whoosh.mp3")} volume={0.5} /></Sequence>
      <Sequence from={2} durationInFrames={20} layout="none"><Audio src={staticFile("impact.mp3")} volume={0.55} /></Sequence>
      <div style={{ maxWidth: 980, margin: "0 40px", background: "rgba(12,19,48,0.66)", border: `3px solid ${GOLD}`, borderRadius: 28, padding: "26px 34px", transform: `translateY(${y}px) scale(${interpolate(inS, [0, 1], [0.8, 1])})`, boxShadow: "0 20px 60px rgba(0,0,0,0.55)" }}>
        <div style={{ fontFamily, fontWeight: 900, fontSize: size, lineHeight: 1.0, color: "#fff", textTransform: "uppercase", letterSpacing: -2, textAlign: "center", textShadow: `0 0 28px rgba(255,197,0,0.5), 3px 3px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000` }}>
          {hook}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ---------- END CARD: subscribe + hook echo, built to LOOP ----------
   Last ~2.3s overlaid on the still-running clip. Echoing the hook makes the jump
   back to frame 0 (hook again) feel seamless → drives rewatches / watch-time. */

const EndCardLoop: React.FC<{ handle: string; hook: string; channels: Channel[] }> = ({ handle, hook, channels }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const DUR = 2.3;
  const startF = durationInFrames - Math.round(DUR * fps);
  if (frame < startF) return null;
  const local = frame - startF;
  const inS = spring({ frame: local, fps, config: { damping: 14, mass: 0.7, stiffness: 150 } });
  const pulse = 1 + 0.05 * Math.sin((frame / fps) * Math.PI * 2 * 1.3);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", background: "rgba(8,10,24,0.6)", opacity: inS }}>
      <Sequence from={startF} durationInFrames={20} layout="none"><Audio src={staticFile("whoosh.mp3")} volume={0.4} /></Sequence>
      <Img src={staticFile("kin_logo_full.png")} style={{ height: 120, width: "auto", marginBottom: 26, filter: "drop-shadow(0 4px 14px rgba(0,0,0,0.6))", transform: `translateY(${interpolate(inS, [0, 1], [-30, 0])}px)` }} />
      {/* hook echo for the loop */}
      <div style={{ fontFamily, fontWeight: 900, fontSize: 64, color: "#fff", textTransform: "uppercase", letterSpacing: -1.5, textAlign: "center", margin: "0 50px 30px", textShadow: "0 0 24px rgba(255,197,0,0.4), 0 6px 20px rgba(0,0,0,0.6)", transform: `translateY(${interpolate(inS, [0, 1], [40, 0])}px)` }}>
        {hook}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18, transform: `scale(${pulse})`, background: "#FF0033", color: "#fff", fontFamily, fontWeight: 800, fontSize: 52, padding: "20px 40px", borderRadius: 999, boxShadow: "0 10px 30px rgba(255,0,51,0.55)" }}>
        <span style={{ fontSize: 50 }}>▶</span> SUBSCRIBE
      </div>
      <div style={{ fontFamily, fontWeight: 800, fontSize: 44, color: GOLD, marginTop: 24 }}>{handle}</div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14, marginTop: 22, maxWidth: 900 }}>
        {channels.map((c) => (
          <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.08)", border: `2px solid ${c.color}`, borderRadius: 999, padding: "8px 18px" }}>
            {c.icon ? (
              <span style={{ width: 30, height: 30, borderRadius: 999, background: c.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Img src={staticFile(c.icon)} style={{ width: 19, height: 19 }} />
              </span>
            ) : (
              <span style={{ fontSize: 30 }}>{c.glyph}</span>
            )}
            <span style={{ fontFamily, fontWeight: 700, fontSize: 26, color: "#fff" }}>{c.label}</span>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/* ---------- B-roll insert cards (drive home the point) ---------- */

const InsertCard: React.FC<{ ins: Insert }> = ({ ins }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < ins.start - 0.4 || t > ins.end + 0.4) return null;
  const startF = Math.round(ins.start * fps);
  const endF = Math.round(ins.end * fps);
  const inP = spring({ frame: frame - startF, fps, config: { damping: 13, mass: 0.7, stiffness: 130 } });
  const outP = interpolate(frame, [endF - 8, endF], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const op = Math.min(inP, 1 - outP);
  // HyperFrames-rendered b-roll card overlay (GSAP motion graphics)
  if (ins.video) {
    return (
      <Sequence from={startF} durationInFrames={Math.max(1, endF - startF)} layout="none">
        <AbsoluteFill style={{ opacity: 1 - outP }}>
          <OffthreadVideo src={staticFile(ins.video)} muted />
        </AbsoluteFill>
      </Sequence>
    );
  }
  const rot = frame * 0.5;
  const kb = 1 + (frame - startF) * 0.0008; // slow ken-burns push on the card
  const titleSize = ins.title.length > 30 ? 96 : ins.title.length > 18 ? 120 : 150;
  return (
    <AbsoluteFill style={{ opacity: op, justifyContent: "center", alignItems: "center", padding: 70 }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 40%, ${NAVY2} 0%, ${NAVY} 78%)`, transform: `scale(${kb})` }} />
      <div style={{ position: "absolute", width: 1100, height: 1100, top: "44%", left: "50%", transform: `translate(-50%,-50%) rotate(${rot}deg)`, background: "repeating-conic-gradient(rgba(255,197,0,0.10) 0deg 8deg, transparent 8deg 16deg)", borderRadius: "50%", WebkitMaskImage: "radial-gradient(circle, #000 26%, transparent 66%)" }} />
      {ins.emoji && (
        <div style={{ fontSize: 150, marginBottom: 20, transform: `scale(${interpolate(inP, [0, 1], [0.4, 1])})`, filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.5))" }}>{ins.emoji}</div>
      )}
      <div style={{ fontFamily, fontWeight: 900, fontSize: titleSize, lineHeight: 0.98, color: "#fff", textTransform: "uppercase", letterSpacing: -2, textAlign: "center", transform: `translateY(${interpolate(inP, [0, 1], [60, 0])}px)`, textShadow: `0 0 34px rgba(255,197,0,0.4), 0 10px 36px rgba(0,0,0,0.6)` }}>
        {ins.title}
      </div>
      {ins.sub && (
        <div style={{ fontFamily, fontWeight: 800, fontSize: 52, color: GOLD, marginTop: 30, letterSpacing: 1, textAlign: "center", opacity: interpolate(inP, [0.3, 1], [0, 1], { extrapolateLeft: "clamp" }), textShadow: "0 0 22px rgba(255,197,0,0.5)" }}>
          {ins.sub}
        </div>
      )}
    </AbsoluteFill>
  );
};

const Inserts: React.FC<{ inserts: Insert[] }> = ({ inserts }) => (
  <>{inserts.map((ins, i) => <InsertCard key={i} ins={ins} />)}</>
);

/* ---------- RE-HOOK: mid-point pattern interrupt (clears the 2nd retention gate) ----------
   A bold teaser band SLAMS across the center ~46% through, video + speech still
   running behind a light scrim, then snaps out. Opens a new curiosity loop so the
   viewer can't leave at the mid-point drop-off. */

const ReHookCard: React.FC<{ text: string; atFrame: number }> = ({ text, atFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const DUR = Math.round(1.0 * fps);
  if (frame < atFrame - 6 || frame > atFrame + DUR + 6) return null;
  const local = frame - atFrame;
  const inS = spring({ frame: local, fps, config: { damping: 13, mass: 0.5, stiffness: 220 } });
  const out = interpolate(local, [DUR - 7, DUR], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const x = interpolate(inS, [0, 1], [-1100, 0]);
  const skew = interpolate(inS, [0, 1], [-12, 0]);
  const size = text.length > 22 ? 86 : text.length > 12 ? 110 : 132;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: out, pointerEvents: "none" }}>
      <Sequence from={atFrame - 6} durationInFrames={26} layout="none"><Audio src={staticFile("whoosh.mp3")} volume={0.5} /></Sequence>
      <Sequence from={atFrame} durationInFrames={20} layout="none"><Audio src={staticFile("impact.mp3")} volume={0.6} /></Sequence>
      <div style={{ width: "100%", background: "linear-gradient(90deg, rgba(255,0,51,0.92), rgba(12,19,48,0.92))", borderTop: `4px solid ${GOLD}`, borderBottom: `4px solid ${GOLD}`, padding: "30px 0", transform: `translateX(${x}px) skewX(${skew}deg)`, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ fontFamily, fontWeight: 900, fontSize: size, lineHeight: 1.0, color: "#fff", textTransform: "uppercase", letterSpacing: -2, textAlign: "center", textShadow: `0 0 26px rgba(255,197,0,0.55), 3px 3px 0 #000, -2px -2px 0 #000` }}>
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ---------- Sound design: whoosh transitions + impact hits ---------- */

const SoundFX: React.FC<{ inserts: Insert[] }> = ({ inserts }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {inserts.map((ins, i) => {
        const f = Math.round(ins.start * fps);
        return (
          <React.Fragment key={i}>
            <Sequence from={Math.max(0, f - 8)} durationInFrames={30} layout="none">
              <Audio src={staticFile("whoosh.mp3")} volume={0.42} />
            </Sequence>
            <Sequence from={f} durationInFrames={20} layout="none">
              <Audio src={staticFile("impact.mp3")} volume={0.55} />
            </Sequence>
          </React.Fragment>
        );
      })}
    </>
  );
};

/* ---------- Clip stage ---------- */

const ClipStage: React.FC<{ videoSrc: string; musicSrc: string; words: Word[]; handle: string; hook: string; reHook?: string; payoffSec?: number | null; channels: Channel[]; totalFrames: number; inserts: Insert[]; capY?: string | null }> = ({
  videoSrc,
  musicSrc,
  words,
  handle,
  hook,
  reHook,
  payoffSec,
  channels,
  totalFrames,
  inserts,
  capY,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const dur = totalFrames / fps;

  // emphasis punch (existing)
  let pulse = 0;
  for (const w of words) {
    if (w.emp) {
      const dt = t - w.start;
      if (dt >= 0 && dt < 0.55) pulse = Math.max(pulse, Math.sin((Math.PI * dt) / 0.55));
    }
  }
  // guaranteed rhythmic punch-beat every 3.4s so the frame never sits still <4s
  let beat = 0;
  for (let b = 3.4; b < dur - 2.4; b += 3.4) {
    const dt = t - b;
    if (dt >= 0 && dt < 0.5) beat = Math.max(beat, Math.sin((Math.PI * dt) / 0.5));
  }
  // payoff beat-drop: zoom hit + (music duck below) right on the punchline
  const payoffT = (payoffSec != null ? payoffSec : (words.length ? words[words.length - 1].start : dur - 1));
  const pf = Math.round(payoffT * fps);
  const payoffDt = t - payoffT;
  const payoffPulse = payoffDt >= 0 && payoffDt < 0.6 ? Math.sin((Math.PI * payoffDt) / 0.6) : 0;

  const breathe = 0.012 * Math.sin((frame / fps) * 0.5);
  const intro = interpolate(frame, [0, 10], [1.10, 1.05], { extrapolateRight: "clamp" });
  const scale = intro + breathe + pulse * 0.035 + beat * 0.028 + payoffPulse * 0.06;
  // camera shake on emphasis + payoff punches
  const shakeAmt = Math.max(pulse, payoffPulse);
  const shakeX = shakeAmt > 0.02 ? Math.sin(frame * 2.3) * shakeAmt * 7 : 0;
  const shakeY = shakeAmt > 0.02 ? Math.cos(frame * 2.7) * shakeAmt * 6 : 0;

  // dynamic music: duck to near-silence ~0.35s before the payoff, snap back after
  const musicVol = (f: number) => {
    const d0 = pf - Math.round(0.35 * fps), d1 = pf - 2, rec = pf + Math.round(0.4 * fps);
    if (f < d0 || f > rec) return 0.16;
    if (f < d1) return interpolate(f, [d0, d1], [0.16, 0.03]);
    return interpolate(f, [d1, rec], [0.03, 0.16]);
  };

  // inject the mid-point re-hook as a sound beat too (whoosh/impact handled in card)
  const reHookFrame = Math.round(dur * 0.46 * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Audio src={musicSrc} volume={musicVol} />
      <SoundFX inserts={inserts} />
      <Sequence from={pf} durationInFrames={20} layout="none"><Audio src={staticFile("impact.mp3")} volume={0.6} /></Sequence>
      <AbsoluteFill style={{ transform: `translate(${shakeX}px, ${shakeY}px) scale(${scale})` }}>
        <OffthreadVideo src={videoSrc} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 42%, transparent 44%, rgba(0,0,0,0.45) 100%), linear-gradient(to top, rgba(8,10,24,0.78) 0%, rgba(8,10,24,0.18) 16%, rgba(0,0,0,0) 30%)" }} />
      <ProgressBar totalFrames={totalFrames} />
      <Captions words={words} capY={capY} />
      <Inserts inserts={inserts} />
      {reHook ? <ReHookCard text={reHook} atFrame={reHookFrame} /> : null}
      <Watermark handle={handle} />
      <HookBanner hook={hook} />
      <EndCardLoop handle={handle} hook={hook} channels={channels} />
    </AbsoluteFill>
  );
};

/* ---------- Root short ---------- */

export const Short: React.FC<Props> = ({
  video,
  music,
  words,
  handle,
  hook,
  reHook,
  payoffSec,
  channels,
  inserts = [],
  capY,
}) => {
  // Hook-first: the whole timeline IS the clip. HookBanner (frame 1) and
  // EndCardLoop (last ~2.3s) are overlays inside ClipStage — no pre-roll intro,
  // no dead-air outro. introSeconds/closing* still accepted in the schema (set to
  // 0 in config) so the make_root generator's duration math stays unchanged.
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <ClipStage
        videoSrc={staticFile(video)}
        musicSrc={staticFile(music)}
        words={words}
        handle={handle}
        hook={hook}
        reHook={reHook}
        payoffSec={payoffSec}
        channels={channels}
        totalFrames={durationInFrames}
        inserts={inserts}
        capY={capY}
      />
    </AbsoluteFill>
  );
};
