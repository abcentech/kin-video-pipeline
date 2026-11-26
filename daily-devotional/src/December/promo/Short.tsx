// THE FATHER SHOWED UP — a vertical short (1080x1920), plan.shorts[index]. One complete thought that
// stands alone with the sound off (december/DESIGN.md §Shorts): a top band with the series chip and the
// two-line hook on screen from frame 0, the presenter window (4:5, camera keys), big captions, an
// optional verse page inside the window, the 2.5 s end card, a candle progress hairline at the top.
import React from "react";
import { AbsoluteFill, Audio, Easing, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND, C, FONT, P } from "../theme";
import type { ShortProps } from "../load";
import { Captions } from "./Captions";
import { Door } from "./kit";
import { Finish, NightPage } from "./Page";
import { Beats, lineWindows } from "./Trailer";
import { fitSize, goldStyle, label, richLines, useFontsReady } from "./text";

export type ShortCompProps = ShortProps & { hasAudio?: boolean };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const TopBand: React.FC<{ title: string; day: number; f: number; out: number }> = ({ title, day, f, out }) => {
  const lines = richLines(title);
  const strs = lines.map((l) => l.map((t) => t.text).join(" ").toUpperCase());
  const size = fitSize(strs, P.w - 2 * P.safeX, 88, 900, FONT.sans, -0.01);
  // the gold word's sheen crosses in the first third of a second (motion on frame 1)
  return (
    <div style={{ position: "absolute", left: 0, width: P.w, top: P.titleTop, height: P.titleBottom - P.titleTop, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, opacity: 1 - out }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 20px", borderRadius: 40, border: `1.5px solid rgba(242,163,58,0.7)`, background: "rgba(7,36,42,0.75)" }}>
        <div style={{ ...label(26, C.candle), marginRight: "-0.14em" }}>{`${BRAND.series} · DAY ${day}`}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", fontFamily: FONT.sans, fontWeight: 900, fontSize: size, lineHeight: 1.04, letterSpacing: "-0.01em", color: C.cream, textTransform: "uppercase", filter: "drop-shadow(0 4px 16px rgba(5,6,13,0.7))" }}>
        {lines.map((l, i) => (
          <div key={i} style={{ whiteSpace: "nowrap", transform: `translateY(${(1 - Easing.out(Easing.cubic)(clamp01((f + 6 - i * 2) / 10))) * 10}px)` }}>
            {l.map((t, j) => (
              <span key={j} style={{ marginRight: j < l.length - 1 ? "0.24em" : 0, ...(t.gold ? goldStyle(f, 2) : null) }}>
                {t.text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export const Short: React.FC<ShortCompProps> = ({ plan, index, hasAudio }) => {
  const f = useCurrentFrame();
  const { width: w, height: h } = useVideoConfig();
  const ok = useFontsReady();
  if (!plan || !ok) return <AbsoluteFill style={{ backgroundColor: C.ink }} />;
  const promo = plan.shorts[index];
  if (!promo) throw new Error(`December: day ${plan.meta.day} has no short #${index}`);
  const withSound = hasAudio === false || !promo.audio;
  const end = promo.beats.find((b) => b.kind === "end");
  const endAt = end ? end.from : promo.durationInFrames;
  const out = clamp01((f - endAt) / 6);
  const winH = P.windowH;
  // the door of light opens on the window from frame 0 (already ajar, so frame 0 shows his face)
  const open = clamp01((f + 8) / 14);
  return (
    <AbsoluteFill style={{ backgroundColor: C.ink }}>
      <NightPage w={w} h={h} glow={{ x: 0.5, y: 0.08, r: 0.55, s: 0.55 }} motes={24} seed={5} />
      <div style={{ position: "absolute", left: 0, top: P.windowTop, width: w, height: winH, overflow: "hidden" }}>
        <Door solid open={open} w={w} h={winH}>
          <Beats plan={plan} promo={promo} w={w} h={winH} withSound={withSound} endVariant="short" only={(k) => k !== "end"} />
        </Door>
        {/* the pale wall falls off toward night at the sides; the window melts into the night at both ends
            (below y 1500 belongs to the platform UI) */}
        {/* v2: no night falling in from the sides: the recorded wall stays as it is */}
        <div style={{ position: "absolute", left: 0, top: 0, width: w, height: 70, background: `linear-gradient(180deg, ${C.ink}, transparent)` }} />
        <div style={{ position: "absolute", left: 0, top: winH - 330, width: w, height: 330, background: `linear-gradient(0deg, ${C.ink} 0%, rgba(5,6,13,0.85) 35%, transparent 100%)` }} />
      </div>
      <Captions pages={promo.captions} style="short" show={lineWindows(promo)} />
      <TopBand title={promo.title ?? plan.meta.title} day={plan.meta.day} f={f} out={out} />
      <Beats plan={plan} promo={promo} w={w} h={h} withSound={withSound} endVariant="short" only={(k) => k === "end"} />
      <Finish f={f} w={w} h={h} grain={0.06} />
      {/* progress hairline */}
      <div style={{ position: "absolute", left: 0, top: 0, height: 5, width: (w * (f + 1)) / promo.durationInFrames, background: C.candle, boxShadow: "0 0 10px rgba(242,163,58,0.8)" }} />
      {withSound ? null : <Audio src={staticFile(promo.audio)} />}
    </AbsoluteFill>
  );
};
