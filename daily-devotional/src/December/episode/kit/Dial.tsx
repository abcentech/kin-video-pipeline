/**
 * MOTIF 2 — THE DIAL. A fine watch face: ring, twelve ticks, two hands; the hour hand rests on EIGHT.
 * Day badge (thirty minute-marks, day N lit), list bullet, "fulness of time" device, end-card loader.
 *
 *   <Dial size={120} day={1} />                       // badge: day 1 of 30 lit
 *   <Dial size={300} minute={0.75} marks={12.4} />    // winding: marks lit up to 12.4 (fractional = the one lighting)
 *   <Dial size={380} hours={[4, 8, 0]} hoursLit={[1, 1, 0.3]} />   // recap bullets
 *
 * Purely presentational: pass frame-derived numbers in; it never reads the frame itself (except `glow` you pass).
 */
import React from "react";
import { C } from "../../theme";
import { alpha, clamp01 } from "./ease";

export type DialProps = {
  /** px */
  size: number;
  /** the day this dial marks (gold mark) */
  day?: number;
  total?: number;
  /** marks lit (default = day). Fractional: the last one is fading in */
  marks?: number;
  /** minute hand 0..1 (0 = twelve). Default 0 */
  minute?: number;
  /** hour hand position in hours (default 8 — it rests on eight) */
  hour?: number;
  /** hour ticks (0..11, 0 = twelve) that light, with 0..1 amounts */
  hours?: number[];
  hoursLit?: number[];
  /** extra bloom 0..1 */
  glow?: number;
  /** face fill opacity (0 = transparent face) */
  face?: number;
  /** stroke weight multiplier (thicker reads better small) */
  weight?: number;
  style?: React.CSSProperties;
  /** aliases for the promo pieces: wind 0..1 lights the marks up to `day`; bloom = glow; f is ignored */
  wind?: number;
  bloom?: number;
  f?: number;
};

const polar = (r: number, turn: number) => {
  const a = turn * Math.PI * 2 - Math.PI / 2;
  return [100 + r * Math.cos(a), 100 + r * Math.sin(a)] as const;
};

export const Dial: React.FC<DialProps> = ({ size, day, total = 30, marks, minute = 0, hour = 8, hours = [], hoursLit = [], glow: glowIn = 0, face = 0.88, weight, style, wind, bloom }) => {
  const glow = Math.max(glowIn, bloom ?? 0);
  const lit = marks ?? (wind !== undefined && day ? day * clamp01(wind) : (day ?? 0));
  const k = weight ?? (size < 140 ? 1.6 : size < 260 ? 1.2 : 1);
  const uid = `dial-${Math.round(size)}-${Math.round(glow * 100)}-${Math.round(face * 100)}`;
  const minuteTurn = minute % 1;
  const hourTurn = (hour % 12) / 12;
  const [mx, my] = polar(64, minuteTurn);
  const [hx, hy] = polar(42, hourTurn);
  const [tx, ty] = polar(-12, minuteTurn);
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ overflow: "visible", ...style }}>
      <defs>
        <radialGradient id={`${uid}-face`} cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor={C.night} stopOpacity={face} />
          <stop offset="100%" stopColor={C.ink} stopOpacity={face} />
        </radialGradient>
        <radialGradient id={`${uid}-bloom`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={C.candle} stopOpacity={0.55 * glow} />
          <stop offset="100%" stopColor={C.candle} stopOpacity={0} />
        </radialGradient>
      </defs>
      {glow > 0 ? <circle cx={100} cy={100} r={150} fill={`url(#${uid}-bloom)`} /> : null}
      <circle cx={100} cy={100} r={94} fill={`url(#${uid}-face)`} />
      <circle cx={100} cy={100} r={94} fill="none" stroke={C.candle} strokeWidth={2.4 * k} opacity={0.95} />
      <circle cx={100} cy={100} r={89} fill="none" stroke={C.candle} strokeWidth={0.8 * k} opacity={0.35} />
      {/* thirty minute-marks: the days of December */}
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const turn = n / total;
        const isDay = day === n;
        const on = clamp01(lit - i);
        const [x1, y1] = polar(isDay ? 72 : 78, turn);
        const [x2, y2] = polar(86, turn);
        const col = isDay ? C.gold : C.candle;
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={alpha(C.cream, 0.22)} strokeWidth={1.6 * k} strokeLinecap="round" />
            {on > 0 ? (
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth={(isDay ? 4.2 : 2.4) * k} strokeLinecap="round" opacity={on} />
            ) : null}
            {isDay && on > 0 ? <circle cx={polar(79, turn)[0]} cy={polar(79, turn)[1]} r={9 * k} fill={alpha(C.gold, 0.22 * on)} /> : null}
          </g>
        );
      })}
      {/* twelve hour ticks */}
      {Array.from({ length: 12 }, (_, i) => {
        const [x1, y1] = polar(i % 3 === 0 ? 54 : 58, i / 12);
        const [x2, y2] = polar(66, i / 12);
        const li = hours.indexOf(i);
        const amt = li >= 0 ? clamp01(hoursLit[li] ?? 0) : 0;
        return (
          <g key={`h${i}`}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={alpha(C.cream, 0.7)} strokeWidth={(i % 3 === 0 ? 3.4 : 2) * k} strokeLinecap="round" />
            {amt > 0 ? (
              <>
                <circle cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r={10} fill={alpha(C.gold, 0.35 * amt)} />
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.gold} strokeWidth={4.6 * k} strokeLinecap="round" opacity={amt} />
              </>
            ) : null}
          </g>
        );
      })}
      {/* hands: hour on eight, minute free */}
      <line x1={100} y1={100} x2={hx} y2={hy} stroke={C.cream} strokeWidth={6 * k} strokeLinecap="round" />
      <line x1={tx} y1={ty} x2={mx} y2={my} stroke={C.candle} strokeWidth={2.8 * k} strokeLinecap="round" />
      <circle cx={100} cy={100} r={6 * Math.min(k, 1.3)} fill={C.gold} />
      <circle cx={100} cy={100} r={2.2} fill={C.ink} />
    </svg>
  );
};
