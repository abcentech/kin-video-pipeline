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
import { loadFont } from "@remotion/google-fonts/Poppins";
import { z } from "zod";

const { fontFamily } = loadFont("normal", { weights: ["700", "800", "900"], subsets: ["latin"] });

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
  glyph: z.string(),
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
  channels: z.array(channelSchema),
  inserts: z.array(insertSchema).optional(),
  introSeconds: z.number(),
  clipSeconds: z.number(),
  closingSeconds: z.number(),
});

export type Word = z.infer<typeof wordSchema>;
export type Insert = z.infer<typeof insertSchema>;
type Channel = z.infer<typeof channelSchema>;
type Props = z.infer<typeof shortSchema>;

/* ---------- v4-style captions: per-word highlight + emphasis ---------- */

function buildPages(words: Word[], maxWords = 4): Word[][] {
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

  const enter = spring({
    frame: frame - pageStartFrame - index * 2,
    fps,
    config: { damping: 12, mass: 0.6, stiffness: 140 },
  });
  const active = t >= word.start && t <= word.end + 0.06;
  const spoken = t > word.end;
  const emp = !!word.emp;

  const punch = spring({
    frame: frame - Math.round(word.start * fps),
    fps,
    config: { damping: 9, mass: 0.4, stiffness: 200 },
  });
  const punchScale = active ? 1 + interpolate(punch, [0, 1], [emp ? 0.3 : 0.16, 0]) : 1;
  const wobble = emp ? Math.sin((frame / fps) * 6) * (active ? 4 : 1.5) : 0;
  const baseScale = interpolate(enter, [0, 1], [0.4, 1]);
  const y = interpolate(enter, [0, 1], [40, 0]);
  const color = active ? (emp ? "#FFF3BF" : GOLD_LT) : emp ? GOLD : spoken ? "#FFFFFF" : "#E4E4EC";
  const size = emp ? 100 : 82;
  const glow = emp ? 0.4 + 0.35 * (0.5 + 0.5 * Math.sin((frame / fps) * 5)) : 0;

  return (
    <span
      style={{
        position: "relative",
        fontFamily,
        fontWeight: emp ? 900 : 800,
        fontSize: size,
        lineHeight: 1.02,
        color,
        opacity: enter,
        display: "inline-block",
        transform: `translateY(${y}px) scale(${baseScale * punchScale}) rotate(${wobble}deg)`,
        letterSpacing: -1.5,
        textTransform: emp ? "uppercase" : "none",
        padding: active ? "0 8px" : 0,
        borderRadius: 14,
        background: active ? "rgba(255,197,0,0.16)" : "transparent",
        textShadow: emp
          ? `0 0 ${18 + glow * 20}px rgba(255,197,0,${0.55 + glow}), 4px 4px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000`
          : `4px 4px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 0 6px 16px rgba(0,0,0,0.6)`,
      }}
    >
      {word.w}
      {active && (
        <span
          style={{
            position: "absolute",
            left: "8%",
            right: "8%",
            bottom: -8,
            height: 8,
            borderRadius: 8,
            background: emp ? GOLD : GOLD_LT,
            transform: `scaleX(${interpolate(punch, [0, 1], [0, 1])})`,
            transformOrigin: "left",
            boxShadow: `0 0 12px ${GOLD}`,
          }}
        />
      )}
    </span>
  );
};

const Captions: React.FC<{ words: Word[] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const pages = React.useMemo(() => buildPages(words), [words]);
  const page = pages.find((p) => t >= p[0].start - 0.12 && t <= p[p.length - 1].end + 0.2);
  if (!page) return null;
  const pageStartFrame = Math.round(page[0].start * fps);
  const float = Math.sin((frame / fps) * 1.5) * 6;
  return (
    <div
      style={{
        position: "absolute",
        left: 55,
        right: 55,
        top: "44%",
        transform: `translateY(${float}px)`,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        gap: "14px 18px",
      }}
    >
      {page.map((word, i) => (
        <CaptionWord key={i} word={word} pageStartFrame={pageStartFrame} index={i} />
      ))}
    </div>
  );
};

/* ---------- Watermark + progress + lower third ---------- */

const Watermark: React.FC<{ handle: string }> = ({ handle }) => (
  <div style={{ position: "absolute", top: 56, right: 40, display: "flex", alignItems: "center", gap: 12, background: "rgba(12,19,48,0.55)", padding: "10px 18px 10px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)" }}>
    <Img src={staticFile("logoIcon.svg")} style={{ width: 50, height: 50 }} />
    <span style={{ fontFamily, fontWeight: 800, fontSize: 24, color: "#fff" }}>{handle}</span>
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
        <Img src={staticFile("logoIcon.svg")} style={{ width: 76, height: 76 }} />
        <div style={{ transform: `scale(${pulse})`, background: "#FF0033", color: "#fff", fontFamily, fontWeight: 700, fontSize: 36, padding: "14px 28px", borderRadius: 999, display: "flex", alignItems: "center", gap: 10, boxShadow: "0 6px 22px rgba(255,0,51,0.55)" }}>
          <span style={{ fontSize: 34 }}>▶</span> SUBSCRIBE
        </div>
        <span style={{ fontFamily, fontWeight: 800, fontSize: 34, color: "#fff" }}>{handle}</span>
      </div>
    </div>
  );
};

/* ---------- v4-style branded FOLLOW intro ---------- */

const FollowIntro: React.FC<{ handle: string; hook: string; channels: Channel[] }> = ({ handle, hook, channels }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const logoS = spring({ frame, fps, config: { damping: 12, mass: 0.5, stiffness: 180 } });
  const s1 = spring({ frame: frame - 3, fps, config: { damping: 11, mass: 0.6, stiffness: 200 } });
  const s2 = spring({ frame: frame - 13, fps, config: { damping: 13, mass: 0.7 } });
  const s3 = spring({ frame: frame - 20, fps, config: { damping: 14, mass: 0.7 } });
  const out = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rot = frame * 0.5;
  // size the hook so long lines still fit
  const hookSize = hook.length > 26 ? 96 : hook.length > 16 ? 120 : 150;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 38%, ${NAVY2} 0%, ${NAVY} 72%)`, justifyContent: "center", alignItems: "center", opacity: out, padding: 60 }}>
      <Sequence from={0} durationInFrames={20} layout="none"><Audio src={staticFile("whoosh.mp3")} volume={0.5} /></Sequence>
      <Sequence from={3} durationInFrames={20} layout="none"><Audio src={staticFile("impact.mp3")} volume={0.6} /></Sequence>
      <div style={{ position: "absolute", width: 1000, height: 1000, top: "42%", left: "50%", transform: `translate(-50%,-50%) rotate(${rot}deg)`, background: "repeating-conic-gradient(rgba(255,197,0,0.10) 0deg 8deg, transparent 8deg 16deg)", borderRadius: "50%", WebkitMaskImage: "radial-gradient(circle, #000 28%, transparent 68%)" }} />
      <Img src={staticFile("logoLight.svg")} style={{ width: 470, transform: `scale(${logoS})`, marginBottom: 30 }} />
      {/* per-short HOOK */}
      <div style={{ fontFamily, fontWeight: 900, fontSize: hookSize, lineHeight: 0.98, color: "#fff", textTransform: "uppercase", letterSpacing: -2, textAlign: "center", transform: `translateY(${interpolate(s1, [0, 1], [70, 0])}px) scale(${interpolate(s1, [0, 1], [0.7, 1])})`, opacity: s1, textShadow: "0 0 30px rgba(255,197,0,0.35), 0 8px 30px rgba(0,0,0,0.6)" }}>
        {hook}
      </div>
      {/* subscribe across all channels */}
      <div style={{ fontFamily, fontWeight: 800, fontSize: 40, color: GOLD, marginTop: 44, letterSpacing: 1, opacity: s2, transform: `translateY(${interpolate(s2, [0, 1], [40, 0])}px)`, textShadow: "0 0 22px rgba(255,197,0,0.5)" }}>
        SUBSCRIBE ON ALL CHANNELS
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16, marginTop: 26, maxWidth: 940 }}>
        {channels.map((c, i) => {
          const cs = spring({ frame: frame - 30 - i * 4, fps, config: { damping: 14, mass: 0.6 } });
          return (
            <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.07)", border: `2px solid ${c.color}`, borderRadius: 999, padding: "12px 24px", opacity: cs, transform: `translateY(${interpolate(cs, [0, 1], [30, 0])}px) scale(${cs})` }}>
              <span style={{ fontSize: 40 }}>{c.glyph}</span>
              <span style={{ fontFamily, fontWeight: 700, fontSize: 34, color: "#fff" }}>{c.label}</span>
            </div>
          );
        })}
      </div>
      <div style={{ fontFamily, fontWeight: 800, fontSize: 40, color: "#fff", marginTop: 30, opacity: s3 }}>{handle}</div>
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

/* ---------- Sound design: whoosh transitions + impact hits ---------- */

const SoundFX: React.FC<{ inserts: Insert[] }> = ({ inserts }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {/* whoosh as the clip opens (transition from intro) */}
      <Sequence from={0} durationInFrames={30} layout="none">
        <Audio src={staticFile("whoosh.mp3")} volume={0.5} />
      </Sequence>
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

const ClipStage: React.FC<{ videoSrc: string; musicSrc: string; words: Word[]; handle: string; totalFrames: number; inserts: Insert[] }> = ({
  videoSrc,
  musicSrc,
  words,
  handle,
  totalFrames,
  inserts,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  let pulse = 0;
  for (const w of words) {
    if (w.emp) {
      const dt = t - w.start;
      if (dt >= 0 && dt < 0.55) pulse = Math.max(pulse, Math.sin((Math.PI * dt) / 0.55));
    }
  }
  const breathe = 0.012 * Math.sin((frame / fps) * 0.5);
  const intro = interpolate(frame, [0, 10], [1.10, 1.05], { extrapolateRight: "clamp" });
  const scale = intro + breathe + pulse * 0.035;
  // camera shake on emphasis punches
  const shakeX = pulse > 0.02 ? Math.sin(frame * 2.3) * pulse * 7 : 0;
  const shakeY = pulse > 0.02 ? Math.cos(frame * 2.7) * pulse * 6 : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Audio src={musicSrc} volume={0.16} />
      <SoundFX inserts={inserts} />
      <AbsoluteFill style={{ transform: `translate(${shakeX}px, ${shakeY}px) scale(${scale})` }}>
        <OffthreadVideo src={videoSrc} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 42%, transparent 44%, rgba(0,0,0,0.45) 100%), linear-gradient(to top, rgba(8,10,24,0.78) 0%, rgba(8,10,24,0.18) 16%, rgba(0,0,0,0) 30%)" }} />
      <ProgressBar totalFrames={totalFrames} />
      <Captions words={words} />
      <Inserts inserts={inserts} />
      <Watermark handle={handle} />
      <LowerThird handle={handle} />
    </AbsoluteFill>
  );
};

/* ---------- Root short ---------- */

export const Short: React.FC<Props> = ({
  video,
  music,
  closing,
  words,
  handle,
  hook,
  channels,
  inserts = [],
  introSeconds,
  clipSeconds,
  closingSeconds,
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  const introF = Math.round(introSeconds * fps);
  const clipF = Math.round(clipSeconds * fps);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Sequence durationInFrames={introF} name="Intro">
        <FollowIntro handle={handle} hook={hook} channels={channels} />
      </Sequence>
      <Sequence from={introF} durationInFrames={clipF} name="Clip">
        <ClipStage videoSrc={staticFile(video)} musicSrc={staticFile(music)} words={words} handle={handle} totalFrames={durationInFrames} inserts={inserts} />
      </Sequence>
      <Sequence from={introF + clipF} name="Closing">
        <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }}>
          <OffthreadVideo src={staticFile(closing)} />
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
