// Offline Poppins — injected as a base64 @font-face via a <style> tag. We deliberately do
// NOT use @remotion/fonts loadFont(): its delayRender() font wait intermittently times out
// (~28s) on long renders and crashes the frame. The data URI is embedded in the bundle so the
// font is available with no network/file fetch; font-display:block avoids fallback flashes.
import { POPPINS_800, POPPINS_900 } from "./fontData";

export const fontFamily = "Poppins";

if (typeof document !== "undefined" && !document.getElementById("poppins-embedded")) {
  const style = document.createElement("style");
  style.id = "poppins-embedded";
  style.textContent = `
@font-face{font-family:"Poppins";font-style:normal;font-weight:800;font-display:block;src:url(${POPPINS_800}) format("woff2");}
@font-face{font-family:"Poppins";font-style:normal;font-weight:900;font-display:block;src:url(${POPPINS_900}) format("woff2");}
`;
  document.head.appendChild(style);
}
