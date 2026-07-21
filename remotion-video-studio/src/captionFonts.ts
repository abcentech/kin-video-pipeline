// Caption fonts, embedded offline as base64 woff2 (same approach as font.ts — no
// loadFont()/network so long renders never time out waiting on a font fetch).
//   capFont      = Montserrat (variable 700–900) — the caption body text
//   keywordFont  = Anton — heavy condensed display for emphasis/keywords
import { MONTSERRAT_VAR, ANTON_400 } from "./fontCaption";

export const capFont = "MontserratCap";
export const keywordFont = "AntonKw";

if (typeof document !== "undefined" && !document.getElementById("caption-fonts-embedded")) {
  const style = document.createElement("style");
  style.id = "caption-fonts-embedded";
  style.textContent = `
@font-face{font-family:"MontserratCap";font-style:normal;font-weight:700 900;font-display:block;src:url(${MONTSERRAT_VAR}) format("woff2");}
@font-face{font-family:"AntonKw";font-style:normal;font-weight:400;font-display:block;src:url(${ANTON_400}) format("woff2");}
`;
  document.head.appendChild(style);
}
