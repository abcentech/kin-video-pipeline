import { AbsoluteFill, Img, staticFile } from "remotion";
import { z } from "zod";
import { loadFont } from "@remotion/google-fonts/Poppins";

const { fontFamily } = loadFont("normal", { weights: ["700", "800", "900"], subsets: ["latin"] });

const GOLD = "#FFC500";
const NAVY = "#0C1330";

export const thumbSchema = z.object({
  bg: z.string(),        // staticFile name, e.g. "thumbbg_e5.png"
  title: z.string(),     // small line above the word
  word: z.string(),      // the big curiosity word
});

/* 1280x720 YouTube thumbnail: full-bleed speaker (captions cropped off the bottom),
   navy scrim sweeping from the right, one huge gold curiosity word + small series tag.
   CTR is carried by the single word — keep it 1-3 words, weight 900. */
export const Thumbnail: React.FC<z.infer<typeof thumbSchema>> = ({ bg, title, word }) => {
  const words = word.split(" ");
  return (
    <AbsoluteFill style={{ backgroundColor: NAVY, overflow: "hidden" }}>
      {/* speaker — scaled up + nudged up so the burned caption band falls off-frame */}
      <Img
        src={staticFile(bg)}
        style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover",
          objectPosition: "32% 20%", transform: "scale(1.1)", transformOrigin: "30% 20%" }}
      />
      {/* readability scrim from the right */}
      <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(12,19,48,0) 30%, rgba(12,19,48,0.62) 56%, rgba(12,19,48,0.9) 100%)" }} />
      <AbsoluteFill style={{ background: "linear-gradient(0deg, rgba(12,19,48,0.55) 0%, rgba(12,19,48,0) 28%)" }} />

      {/* series tag top-right */}
      <div style={{ position: "absolute", top: 30, right: 36, display: "flex", alignItems: "center", gap: 12,
        background: "rgba(12,19,48,0.6)", border: `2px solid ${GOLD}`, borderRadius: 999, padding: "8px 20px" }}>
        <span style={{ fontFamily, fontWeight: 800, fontSize: 26, color: GOLD, letterSpacing: 2, textTransform: "uppercase" }}>Faith In His Name</span>
      </div>

      {/* right-side text block */}
      <div style={{ position: "absolute", right: 46, top: 0, bottom: 0, width: 720, display: "flex",
        flexDirection: "column", justifyContent: "center", alignItems: "flex-end", textAlign: "right" }}>
        <div style={{ fontFamily, fontWeight: 800, fontSize: 34, color: "#fff", opacity: 0.92,
          letterSpacing: 1, marginBottom: 10, textShadow: "0 3px 10px rgba(0,0,0,0.7)" }}>{title}</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 0.92 }}>
          {words.map((w, i) => (
            <span key={i} style={{ fontFamily, fontWeight: 900, fontSize: 132, color: GOLD,
              textTransform: "uppercase", letterSpacing: -2, textShadow: "0 6px 24px rgba(0,0,0,0.75), 0 0 30px rgba(255,197,0,0.35)" }}>{w}</span>
          ))}
        </div>
        <div style={{ height: 8, width: 280, marginTop: 22, borderRadius: 999,
          background: `linear-gradient(90deg, ${GOLD}, #FF0033)` }} />
      </div>

      {/* handle bottom-left */}
      <div style={{ position: "absolute", left: 36, bottom: 28, fontFamily, fontWeight: 800, fontSize: 30,
        color: "#fff", opacity: 0.95, textShadow: "0 3px 10px rgba(0,0,0,0.8)" }}>@KidsInspiringNation</div>
    </AbsoluteFill>
  );
};
