/**
 * THE FATHER SHOWED UP — the shared motif kit (episode + promo). Stable, simple props.
 *   Door / doorFor / doorOpen / doorContent   — motif 1, the door of light (transition)
 *   Doorway                                   — the door as an object, light pouring out
 *   Dial                                      — motif 2, the watch face (hour hand on eight)
 *   CandleRoom / CandleGlow / Motes           — motif 3, candle light
 *   CandleRule / Underline                    — line-work
 *   YouTubeMark / Bell / ShareArrow           — icons
 *   parseRich / richLines / senseLines        — Rich text helpers
 *   ease helpers                              — ramp, envelope, breath, flicker, alpha, mix …
 */
export { Door, doorFor, doorOpen, doorClose, doorContent } from "./Door";
export { Doorway } from "./Doorway";
export { Dial, type DialProps } from "./Dial";
export { CandleRoom, CandleGlow, Motes } from "./Candle";
export { CandleRule, Underline } from "./Lines";
export { YouTubeMark, Bell, ShareArrow } from "./Icons";
export { parseRich, plainRich, richLines, balanceLines, senseLines, fitSize, type RichWord } from "./rich";
export * from "./ease";
