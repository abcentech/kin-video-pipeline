import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as loadSerif } from "@remotion/google-fonts/CormorantGaramond";

const { fontFamily: SANS } = loadPoppins("normal", { weights: ["800"], subsets: ["latin"] });
const { fontFamily: SERIF } = loadSerif("italic", { weights: ["500", "600"], subsets: ["latin"] });

const NAVY = "#0C1330";
const GOLD = "#FFC500";

/* Elegant serif scripture reveal — used ONLY for verses the editor didn't already
   card. Word-by-word rise/fade in Cormorant Garamond with a gold reference chip.
   place="lower" sits in the clear band ABOVE the editor's burned captions (like the
   subscribe bug); place="center" floats mid-frame. Wrapped in a <Sequence> by
   LongForm so `frame` here rebases to 0 and `hold` is the sequence duration. */
export const Scripture: React.FC<{
  reference: string;
  text: string;
  place?: "lower" | "center" | "full";
  hold?: number;
  fps?: number;
}> = ({ reference, text, place = "lower", hold = 5, fps: fpsProp }) => {
  const f = useCurrentFrame();
  const { fps: cfgFps } = useVideoConfig();
  const fps = fpsProp ?? cfgFps;
  const life = hold * fps;
  const words = text.split(" ");

  /* place="full" = a full-screen scripture PAGE showing the WHOLE verse over a
     SEMI-TRANSPARENT veil (the talking head stays faintly visible behind it). The
     portion the speaker actually quoted is wrapped in **double asterisks** in the
     JSON text — that span renders BIG + BOLD + gold; the rest of the verse is smaller,
     dimmed context. Captions are suppressed for the window (LongForm handles that). */
  if (place === "full") {
    const enter = interpolate(f, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const exitF = interpolate(f, [life - 16, life], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const op = Math.min(enter, exitF);
    if (op <= 0) return null;
    const chipIn = spring({ frame: f, fps, config: { damping: 16, mass: 0.8 } });
    const ruleW = interpolate(spring({ frame: f - 8, fps, config: { damping: 18, mass: 0.9 } }), [0, 1], [0, 320]);
    // Split the verse on **…** markers → alternating [plain, emphasized, plain, …]
    // then flatten to per-word tokens carrying an `emp` flag for the rise animation.
    const segs = text.split("**");
    let wi = 0;
    const tokens: { wd: string; emp: boolean }[] = [];
    segs.forEach((seg, si) => {
      const emp = si % 2 === 1; // odd segments were between ** pairs
      seg.split(/\s+/).filter(Boolean).forEach((wd) => tokens.push({ wd, emp }));
    });
    return (
      <AbsoluteFill style={{ opacity: op, zIndex: 120, pointerEvents: "none" }}>
        {/* subtle veil: ~62% dark scrim + gentle blur so the verse stays crisp while the
            speaker shows through faintly; radial edge-darken keeps text legible */}
        <AbsoluteFill style={{ backgroundColor: "rgba(7,11,30,0.62)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }} />
        <AbsoluteFill style={{ background: "radial-gradient(120% 90% at 50% 42%, rgba(0,0,0,0) 42%, rgba(4,6,18,0.55) 100%)" }} />
        <AbsoluteFill style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 140px" }}>
          <div style={{
            fontFamily: SANS, fontWeight: 800, fontSize: 34, color: NAVY, background: GOLD,
            padding: "9px 28px", borderRadius: 999, letterSpacing: 1.5, marginBottom: 40,
            transform: `translateY(${interpolate(chipIn, [0, 1], [26, 0])}px) scale(${interpolate(chipIn, [0, 1], [0.85, 1])})`,
            boxShadow: "0 0 34px rgba(255,197,0,0.5)", whiteSpace: "nowrap",
          }}>{reference}</div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "baseline", maxWidth: 1620 }}>
            {tokens.map((t, i) => {
              const wIn = spring({ frame: f - 8 - i * 1.8, fps, config: { damping: 16, mass: 0.6, stiffness: 120 } });
              return (
                <span key={i} style={{
                  fontFamily: SERIF, fontStyle: "italic",
                  fontWeight: t.emp ? 800 : 500,
                  fontSize: t.emp ? 84 : 46,
                  color: t.emp ? GOLD : "#fff",
                  opacity: (t.emp ? 1 : 0.72) * wIn,
                  lineHeight: 1.22, marginRight: "0.28em", display: "inline-block",
                  transform: `translateY(${(1 - wIn) * 28}px)`,
                  textShadow: t.emp ? "0 3px 22px rgba(0,0,0,0.7), 0 0 30px rgba(255,197,0,0.25)" : "0 3px 18px rgba(0,0,0,0.75)",
                }}>{t.wd}</span>
              );
            })}
          </div>
          <div style={{ marginTop: 46, height: 3, width: ruleW, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`, borderRadius: 2 }} />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  const out = interpolate(f, [life - 16, life], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (out <= 0) return null;
  const chipIn = spring({ frame: f, fps, config: { damping: 16, mass: 0.8 } });
  const panelIn = spring({ frame: f, fps, config: { damping: 16, mass: 0.8 } });
  const lower = place !== "center";

  // "lower" = a lower-third card with a navy underlay + gold border (matches the point
  // "market text" cards, sits ABOVE the burned caption pill). "center" keeps the old float.
  const wrap: React.CSSProperties = lower
    ? { position: "absolute", left: 120, right: 120, bottom: 188, display: "flex", justifyContent: "center" }
    : { position: "absolute", left: 120, right: 120, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" };

  const verse = (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", maxWidth: 1500 }}>
      {words.map((wd, i) => {
        const wIn = spring({ frame: f - 6 - i * 2.0, fps, config: { damping: 16, mass: 0.6, stiffness: 130 } });
        return (
          <span key={i} style={{
            fontFamily: SERIF, fontStyle: "italic", fontWeight: 600, fontSize: lower ? 46 : 72, color: "#fff",
            lineHeight: 1.16, marginRight: "0.28em", display: "inline-block",
            opacity: wIn, transform: `translateY(${(1 - wIn) * 22}px)`,
            textShadow: "0 0 24px rgba(0,0,0,0.6), 0 3px 12px rgba(0,0,0,0.6)",
          }}>{wd}</span>
        );
      })}
    </div>
  );

  const chip = (
    <div style={{
      fontFamily: SANS, fontWeight: 800, fontSize: lower ? 26 : 30, color: NAVY, background: GOLD,
      padding: lower ? "5px 18px" : "7px 22px", borderRadius: 999, letterSpacing: 1,
      transform: `translateY(${interpolate(chipIn, [0, 1], [20, 0])}px) scale(${interpolate(chipIn, [0, 1], [0.85, 1])})`,
      boxShadow: "0 0 22px rgba(255,197,0,0.5)", whiteSpace: "nowrap",
    }}>{reference}</div>
  );

  if (lower) {
    return (
      <div style={{ ...wrap, opacity: out, pointerEvents: "none", zIndex: 50, textAlign: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: `translateY(${interpolate(panelIn, [0, 1], [40, 0])}px)` }}>
          <div style={{ marginBottom: -13, zIndex: 2 }}>{chip}</div>
          <div style={{
            background: "linear-gradient(90deg, rgba(12,19,48,0.94), rgba(26,36,80,0.94))",
            border: "2px solid rgba(255,197,0,0.5)", borderRadius: 18, padding: "24px 34px 18px",
            boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
          }}>{verse}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...wrap, opacity: out, pointerEvents: "none", zIndex: 50, textAlign: "center" }}>
      <div style={{ marginBottom: 22 }}>{chip}</div>
      {verse}
    </div>
  );
};
