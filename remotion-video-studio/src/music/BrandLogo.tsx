import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate } from "remotion";

// Burned-in KidsInspiringNation logo, top-right, with a gentle fade-in and a soft
// drop shadow so it reads on any background. Kept on a ~3% safe-margin inset.
// corner: "tr" (top-right, default) or "br" (bottom-right — used to mask the Veo
// watermark with an opaque branded badge instead of a blur).
export const BrandLogo: React.FC<{ src?: string; size?: number; corner?: "tr" | "br" }> = ({
  src = "logo.svg",
  size = 132,
  corner = "tr",
}) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [6, 24], [0, 0.92], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // bottom-right is positioned to fully cover the Veo watermark sparkle (~x1750,y900 at
  // 1080p), so it sits a touch more inset and larger than the top-right brand placement.
  const vpos = corner === "br"
    ? { bottom: "4.2%" as const, right: "2.0%" as const }
    : { top: "3.2%" as const, right: "2.4%" as const };
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", ...vpos, width: size, height: size, opacity: op }}>
        {/* bottom-right: a soft dark radial backing reliably hides the faint Veo sparkle
            (which can sit just outside the round badge) without a hard box edge. */}
        {corner === "br" && (
          <div
            style={{
              position: "absolute",
              inset: "-46%",
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 50% 38%, rgba(8,10,20,0.97) 64%, rgba(8,10,20,0.55) 80%, rgba(8,10,20,0) 92%)",
            }}
          />
        )}
        <Img
          src={staticFile(src)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            filter: "drop-shadow(0 4px 14px rgba(0,0,0,0.55))",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
