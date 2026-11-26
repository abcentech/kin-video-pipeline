/**
 * Lower-third class: IDENT, TEASER, SUBSCRIBE / SHARE. Bottom edges at ≥ 170 px; one at a time.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { BRAND, C, FONT, L } from "../../theme";
import { T } from "../../timing";
import type { Cue, DayMeta } from "../../types";
import { Dial } from "../kit/Dial";
import { alpha, clamp01, eBack, eIn, eInOut, eOut, ramp } from "../kit/ease";
import { Bell, ShareArrow, YouTubeMark } from "../kit/Icons";
import { CandleRule } from "../kit/Lines";

// no scrim behind a lower third: its own plate carries the text, the recorded wall stays as it is (producer rule)

export const Ident: React.FC<{ cue: Extract<Cue, { kind: "ident" }>; meta: DayMeta }> = ({ cue, meta }) => {
  const f = useCurrentFrame();
  const out0 = cue.dur - 16;
  const rule = eOut(ramp(f, 0, 16));
  const retract = eIn(ramp(f, out0 + 4, cue.dur));
  const nameIn = eOut(ramp(f, 6, 22));
  const roleIn = eOut(ramp(f, 14, 28));
  const sink = eIn(ramp(f, out0, out0 + 10));
  const drift = ramp(f, 0, cue.dur);
  const name = (meta.presenter.name || "").toUpperCase();
  const role = (meta.presenter.role || "Kids Inspiring Nation").toUpperCase();
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: L.safeX, bottom: L.lowerThirdBottom + 10, transform: `translateX(${drift * 8}px)` }}>
        {name ? (
          <div style={{ overflow: "hidden", paddingBottom: 4 }}>
            <div style={{ fontFamily: FONT.sans, fontWeight: 900, fontSize: Math.round(Math.max(44, Math.min(66, 540 / (name.length * 0.68)))), lineHeight: 1.05, letterSpacing: "-0.01em", color: C.cream, whiteSpace: "nowrap", transform: `translateY(${(1 - nameIn) * 80 + sink * 80}px)`, textShadow: `0 4px 20px ${alpha(C.ink, 0.55)}` }}>{name}</div>
          </div>
        ) : null}
        <CandleRule width={560} progress={rule} retract={retract} thickness={3} glint={((f % 75) / 75) * 1.3} style={{ margin: "10px 0 12px" }} />
        <div style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", transform: `translateY(${(1 - roleIn) * -44 + sink * -44}px)`, opacity: roleIn }}>
            <Dial size={40} day={meta.day} minute={drift} face={0.7} weight={2} />
            <div style={{ marginLeft: 12, fontFamily: FONT.sans, fontWeight: 800, fontSize: 28, letterSpacing: "0.14em", color: C.candle, whiteSpace: "nowrap" }}>{role}</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Teaser: React.FC<{ cue: Extract<Cue, { kind: "teaser" }> }> = ({ cue }) => {
  const f = useCurrentFrame();
  const inK = eOut(ramp(f, 0, 14));
  const outK = eIn(ramp(f, cue.dur - 10, cue.dur));
  const k = inK * (1 - outK);
  const sweep = ramp(f, 10, cue.dur - 10);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", top: L.safeTop, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: clamp01(k * 1.4), transform: `translateY(${(1 - inK) * -40 - outK * 20}px)` }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center", padding: "12px 28px 12px 20px", borderRadius: 999, background: alpha(C.night, 0.9), boxShadow: `0 10px 40px ${alpha(C.ink, 0.45)}, inset 0 0 0 1.5px ${alpha(C.candle, 0.55)}`, overflow: "hidden", clipPath: `inset(0 ${(1 - inK) * 50}% 0 ${(1 - inK) * 50}% round 999px)` }}>
          {/* a candle glint travelling round the pill */}
          <div style={{ position: "absolute", top: 0, bottom: 0, width: 160, left: `${-20 + sweep * 120}%`, background: `linear-gradient(to right, transparent, ${alpha(C.candle, 0.22)}, transparent)` }} />
          <Dial size={44} minute={sweep} face={0.5} weight={2} />
          <div style={{ marginLeft: 14, fontFamily: FONT.sans, fontWeight: 800, fontSize: 26, letterSpacing: "0.14em", color: C.candle, whiteSpace: "nowrap" }}>STILL AHEAD</div>
          <div style={{ width: 2, height: 34, background: alpha(C.candle, 0.5), margin: "0 18px" }} />
          <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 34, color: C.cream, whiteSpace: "nowrap" }}>{cue.text}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Subscribe: React.FC<{ cue: Extract<Cue, { kind: "subscribe" }> }> = ({ cue }) => {
  const f = useCurrentFrame();
  const share = cue.variant === "share";
  const P = T.SUB_PRESS;
  const B = T.SUB_BELL;
  const plate = eOut(ramp(f, 0, 14));
  const fold = eInOut(ramp(f, cue.dur - 14, cue.dur));
  const rule = eOut(ramp(f, 0, 12));
  const markIn = eBack(ramp(f, 4, 18));
  const textIn = eOut(ramp(f, 8, 22));
  const btnIn = eBack(ramp(f, 12, 26));
  // press: 0.94 over 3 frames, back over 5
  const press = f < P ? 1 : f < P + 3 ? 1 - 0.06 * ramp(f, P, P + 3) : 0.94 + 0.06 * eOut(ramp(f, P + 3, P + 9));
  const done = f >= P + 2;
  // bell swings twice (damped)
  const bt = f - B;
  const swing = bt >= 0 && bt < 36 ? 26 * Math.sin((bt / 9) * Math.PI) * Math.exp(-bt / 16) : 0;
  const ring = bt >= 0 && bt < 24 ? 1 - bt / 24 : 0;
  const drift = ramp(f, 0, cue.dur);
  const scale = share ? 0.86 : 1;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: L.safeX, bottom: L.lowerThirdBottom, transformOrigin: "left bottom", transform: `scale(${scale}) translateX(${drift * 6}px)` }}>
        {/* folds away along the candle rule */}
        <div style={{ clipPath: `inset(${fold * 100}% 0 0 0)`, transform: `translateY(${fold * 30}px)` }}>
          {/* the line above, on a tab of the plate so it never sits bare on the pale wall */}
          <div style={{ display: "inline-block", padding: "8px 18px 7px", borderRadius: "12px 12px 0 0", background: alpha(C.night, 0.9), opacity: textIn * plate, clipPath: `inset(0 ${(1 - textIn) * 100}% 0 0)` }}>
            <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 26, letterSpacing: "0.12em", color: C.candle, whiteSpace: "nowrap" }}>{share ? "PASS IT ON" : "A NEW DEVOTIONAL EVERY DAY THIS DECEMBER"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", padding: "14px 18px 14px 16px", borderRadius: "0 16px 16px 16px", background: alpha(C.night, 0.9), boxShadow: `0 14px 44px ${alpha(C.ink, 0.5)}, inset 0 0 0 1.5px ${alpha(C.candle, 0.35)}`, opacity: plate, transform: `translateY(${(1 - plate) * 30}px)` }}>
            {share ? (
              <div style={{ width: 74, height: 74, borderRadius: 999, background: C.candle, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${markIn}) rotate(${(1 - markIn) * -40}deg)` }}>
                <ShareArrow size={44} color={C.ink} />
              </div>
            ) : (
              <div style={{ transform: `scale(${markIn})` }}>
                <YouTubeMark size={84} />
              </div>
            )}
            <div style={{ marginLeft: 18, marginRight: 22, opacity: textIn, transform: `translateX(${(1 - textIn) * -16}px)` }}>
              <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: share ? 40 : 38, color: C.cream, whiteSpace: "nowrap", lineHeight: 1.1 }}>{share ? "Share this with a father" : BRAND.handle}</div>
              {share ? <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 28, color: alpha(C.cream, 0.75), whiteSpace: "nowrap", marginTop: 2 }}>{BRAND.handle}</div> : null}
            </div>
            {share ? null : (
              <>
                <div
                  style={{
                    transform: `scale(${btnIn * press})`,
                    padding: "14px 26px 13px",
                    borderRadius: 12,
                    background: done ? alpha(C.cream, 0.16) : C.ember,
                    boxShadow: done ? `inset 0 0 0 2px ${alpha(C.cream, 0.4)}` : `0 6px 22px ${alpha(C.ember, 0.55)}`,
                    fontFamily: FONT.sans,
                    fontWeight: 800,
                    fontSize: 30,
                    letterSpacing: "0.06em",
                    color: C.cream,
                    whiteSpace: "nowrap",
                    minWidth: 236,
                    textAlign: "center",
                  }}
                >
                  {done ? "SUBSCRIBED" : "SUBSCRIBE"}
                </div>
                <div style={{ marginLeft: 16, position: "relative", opacity: eOut(ramp(f, P, P + 8)), transform: `scale(${0.6 + 0.4 * eBack(ramp(f, P, P + 10))})` }}>
                  <div style={{ position: "absolute", inset: -16, borderRadius: 999, background: `radial-gradient(circle, ${alpha(C.gold, 0.5 * ring)}, transparent 70%)` }} />
                  <Bell size={50} rotate={swing} color={ring > 0 ? C.gold : C.cream} />
                </div>
              </>
            )}
          </div>
          <CandleRule width={share ? 640 : 860} progress={rule} glint={((f % 80) / 80) * 1.3} thickness={3} style={{ marginTop: 10 }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
