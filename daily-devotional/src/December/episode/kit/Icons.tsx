/**
 * Icons. The YouTube mark is the real one — the exact path of december-public/brand/icons/youtube.svg,
 * drawn in two colours (body + play triangle) so it reads as the logo, not a white glyph.
 */
import React from "react";
import { C } from "../../theme";

const YT_PATH =
  "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z";

export const YouTubeMark: React.FC<{ size: number; color?: string; play?: string; style?: React.CSSProperties }> = ({ size, color = "#FF0000", play = "#FFFFFF", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={style}>
    <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill={play} />
    <path d={YT_PATH} fill={color} />
  </svg>
);

/** bell with a pivot at the top (swing it with `rotate`) */
export const Bell: React.FC<{ size: number; rotate?: number; color?: string }> = ({ size, rotate = 0, color = C.cream }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ overflow: "visible" }}>
    <g transform={`rotate(${rotate} 12 3)`}>
      <path d="M12 3c-3.3 0-5.6 2.6-5.6 5.9v3.6L4.6 15.6c-.4.7.1 1.4.9 1.4h13c.8 0 1.3-.7.9-1.4l-1.8-3.1V8.9C17.6 5.6 15.3 3 12 3z" fill={color} />
      <circle cx={12} cy={19.4} r={2} fill={color} />
      <rect x={11} y={1.2} width={2} height={2.6} rx={1} fill={color} />
    </g>
  </svg>
);

export const ShareArrow: React.FC<{ size: number; color?: string }> = ({ size, color = C.cream }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M14 4l8 7.5-8 7.5v-4.6c-5.6 0-9.3 1.7-12 5.6 1-5.6 4.1-10.6 12-11.7V4z" fill={color} />
  </svg>
);
