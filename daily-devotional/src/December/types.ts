/**
 * THE FATHER SHOWED UP — December 2026 daily devotional.
 * The two contracts of the pipeline (see december/PIPELINE.md and december/DESIGN.md):
 *
 *   Edit  — december/edits/dayNN.json, written by the editor (the lead model). Human-sized: anchors
 *           are WORD IDS of the raw recording ("w123") so nothing has to be timed by hand.
 *   Plan  — december-public/dayNN/plan.json, compiled by scripts/december/plan.mjs. Machine-sized:
 *           everything resolved to FRAMES at 30 fps on the timeline of the piece. The picture
 *           (src/December) and the sound (scripts/december/sound.*) read ONLY the plan.
 *
 * Owner: the lead. Builders may propose additions; they do not change existing fields.
 */

export const FPS = 30;

// ───────────────────────────────────────────────────────────── shared

/** "w123" = word 123 of .tmp/dec/dayNN/words.json (SOURCE). "w123+0.4" / "w123-0.2" = seconds after/before it starts. "end:w123" = where it ends. */
export type Anchor = string;
/** An inclusive run of spoken words, e.g. ["w40","w61"]. */
export type Span = [Anchor, Anchor];

export type Framing = "wide" | "medium" | "tight";
export type Side = "left" | "right";

/** Rich text: `*word*` = gold emphasis, `|` = forced line break, `**…**` (scripture only) = the phrase the teaching hangs on. */
export type Rich = string;

export type Light = {
  /** 0..1 across / down the plate */
  x: number;
  y: number;
  /** radius as a fraction of plate width */
  r: number;
  kind: "flicker" | "twinkle" | "glow" | "rays";
};

export type ArtPlate = {
  id: string; // "truth2-bethlehem" → december-public/dayNN/art/<id>.jpg
  /** what is in the picture (the style suffix is added by art.mjs — do not repeat it here) */
  prompt: string;
  lights?: Light[];
  /** slow camera move over the plate */
  move?: "push" | "pull" | "left" | "right" | "up" | "down";
  /** where the empty area for a caption is */
  space?: "top" | "left" | "right" | "none";
};

// ───────────────────────────────────────────────────────────── Edit (authoring)

export type EditCue =
  | { kind: "ident"; at: Anchor }
  | { kind: "chapter"; at: Anchor; label: string; title: Rich; numeral?: 1 | 2 | 3 }
  | {
      kind: "scripture";
      at: Anchor;
      mode: "page" | "card";
      ref: string; // "Galatians 4:4–5"
      text: Rich; // KJV
      /** the words of the recording where he reads it aloud (word-synced lighting); omit = lights at reading speed */
      read?: Span;
      /** seconds on screen when there is no `read` (default: by length) */
      dur?: number;
      /** the once-per-episode dial flourish on the day's main text */
      flourish?: boolean;
    }
  | { kind: "point"; at: Anchor; to?: Anchor; dur?: number; text: Rich; side?: Side; sync?: Span }
  | { kind: "keyword"; at: Anchor; text: Rich; side?: Side; dur?: number }
  | { kind: "art"; at: Anchor; to?: Anchor; dur?: number; plate: string; mode: "full" | "side"; caption?: Rich; side?: Side }
  | { kind: "film"; at: Anchor; to?: Anchor; dur?: number; /** seconds into the day's film clip */ from: number; side?: never }
  | { kind: "subscribe"; at: Anchor; variant?: "subscribe" | "share" }
  | { kind: "teaser"; at: Anchor; text: string }
  | { kind: "response"; at: Anchor; to: Anchor; child?: { text: string; sync?: Span }; father?: { text: string; sync?: Span } }
  | { kind: "prayer"; at: Anchor; to: Anchor; lines: { text: string; sync?: Span }[] }
  | { kind: "declare"; at: Anchor; text: Rich; sync?: Span; to?: Anchor }
  | { kind: "recap"; at: Anchor; dur?: number; title?: string; items: string[] }
  /** camera only: +6% snap-in on this word */
  | { kind: "snap"; at: Anchor }
  /** sound only: the music bed is OUT over this stretch (he sings; a bed in another key would clash). Compiles to a music section, never to a Cue. */
  | { kind: "hush"; at: Anchor; to: Anchor };

export type EditLine = {
  /** the words spoken (cut on silence around them) */
  span: Span;
  /** exactly what he says, proof-read; `*word*` = stressed (gold caption) ; ` | ` = caption page break */
  say?: Rich;
  cam?: [Framing, Framing];
  /** giant word behind the matted presenter (trailer) or beside him (cold open) */
  big?: { text: Rich; on?: Anchor };
  hold?: number; // seconds after the last word (default 0.25)
};

export type TrailerBeat =
  | ({ kind: "line"; mood: "cold" | "tension" | "turn" | "button" } & EditLine)
  | { kind: "title" }
  | { kind: "film"; from: number; dur: number; focusX?: number; /** 9:16 only: seconds into the film clip for the vertical cut, when the shot does not survive the side crop (a face close-up) */ from9?: number; /** 9:16 only: the share of the film frame's height shown, from the top (default 0.8). Lower it (0.73) when the film's own subtitle runs to three lines and would be cut by the bottom edge */ top9?: number }
  | { kind: "verse"; ref: string; text: Rich; read?: Span }
  | { kind: "end" };

export type ShortEdit = {
  id: string; // "word" | "truth" | "prayer" …
  /** two-line hook title, on screen from frame 0 (`|` = line break, `*gold*`) */
  title: Rich;
  /** the pieces of the recording, in order (each cut on silence; joins get a reframe) */
  lines: EditLine[];
  /** optional scripture page inside the short */
  verse?: { ref: string; text: Rich; read?: Span };
  /** social caption + hashtags for the post */
  post: string;
};

export type Edit = {
  day: number;
  /** what he says of himself; leave "" until the producer supplies the name */
  presenter: { name: string; role: string };
  /** proof-reading: word id → corrected text ("" removes the token from captions). Scripture read aloud is corrected to KJV. */
  fix: Record<string, string>;
  /** what stays, in order, as word runs. Everything else (retakes, dead air, slate chatter) is cut. */
  keep: Span[];
  /** pauses inside kept runs longer than this are shortened to it (seconds; default 0.7) */
  maxPause?: number;
  /** pauses BETWEEN words inside `span` are shortened to this instead of `maxPause` (singing, prayer: keep his rhythm) */
  pace?: { span: Span; maxPause: number }[];
  /**
   * Room for a silent takeover (recap, response): the pause after this word lasts `dur` seconds in the body.
   * cut.mjs keeps the real pause whole and, if it is shorter than `dur`, holds the frame at its MIDDLE
   * (room tone under it), so both ends of the air are real moving picture. Cues reach it with an offset
   * anchor: `"end:w482+0.3"`.
   */
  air?: { after: Anchor; dur: number; /** seconds of the real pause before the held frame (default: half of it) */ lead?: number }[];
  /** the cold open: 1–2 lines replayed before the title */
  hook: EditLine[];
  /** play the day's film clip after the title (seconds of the clip to use; default: all of it); false = no film segment */
  film: { play: boolean; from?: number; to?: number };
  cues: EditCue[];
  art: ArtPlate[];
  /** show the safeguarding line on the end card */
  safeguard?: boolean;
  trailer: TrailerBeat[];
  shorts: ShortEdit[];
  /** YouTube copy the editor wrote (post.mjs lays it out) */
  social: { titles: string[]; description: string; pinned: string; hashtags: string[]; thumbnail: { line: Rich; frame: Anchor } };
};

// ───────────────────────────────────────────────────────────── Plan (compiled, frames)

export type Word = { text: string; from: number; to: number; stress?: boolean };
export type CaptionPage = { from: number; to: number; lines: Word[][] };

/** Camera view onto the 16:9 body: zoom (1 = cover) and the source point (0..1, y down) at screen centre. */
export type View = { s: number; x: number; y: number };
/** `ease` describes how the camera ARRIVES at this key from the previous one ("linear" = follow-cam samples). */
export type CamKey = { f: number; view: View; ease: "cut" | "in-out" | "out" | "linear" };

export type DayMeta = {
  day: number; // 1..30 (0 = opener)
  total: 30;
  title: string; // "The Father Who Is Never Late"
  dateLabel: string; // "TUE 1 DEC"
  ref: string; // "Galatians 4:4–5"
  verse: string; // KJV main text
  declaration: string; // "My Father in heaven is never late."
  truths: string[]; // three titles
  next?: { day: number; title: string; ref: string; dateLabel: string };
  presenter: { name: string; role: string };
  /** thumbnail: the line and the body frame of his face (from `edit.social.thumbnail`) */
  thumb?: { line: Rich; bodyFrame: number; /** his head on that frame (0..1) */ face?: { x: number; y: number } };
};

type CueBase = { id: string; from: number; dur: number };
export type Cue =
  | (CueBase & { kind: "ident" })
  | (CueBase & { kind: "chapter"; label: string; title: Rich; numeral?: 1 | 2 | 3; /** frame the chip under the dial disappears */ chipTo: number })
  | (CueBase & { kind: "scripture"; mode: "page" | "card"; ref: string; text: Rich; /** one entry per word of `text` (markers stripped): the frame it lights */ lit: number[]; flourish?: boolean; /** frame the emphasised phrase lands */ hit?: number })
  | (CueBase & { kind: "point"; text: Rich; side: Side; lit?: number[] })
  | (CueBase & { kind: "keyword"; text: Rich; side: Side })
  | (CueBase & { kind: "art"; src: string; mode: "full" | "side"; side: Side; caption?: Rich; lights: Light[]; move: NonNullable<ArtPlate["move"]>; space: NonNullable<ArtPlate["space"]> })
  | (CueBase & { kind: "film"; src: string; /** frames into the film clip */ srcFrom: number })
  | (CueBase & { kind: "subscribe"; variant: "subscribe" | "share" })
  | (CueBase & { kind: "teaser"; text: string })
  | (CueBase & { kind: "response"; child?: { text: string; from: number; to: number }; father?: { text: string; from: number; to: number } })
  | (CueBase & { kind: "prayer"; lines: { text: string; from: number; to: number }[] })
  | (CueBase & { kind: "declare"; text: Rich; lit: number[] })
  | (CueBase & { kind: "recap"; title: string; items: string[] })
  | (CueBase & { kind: "next"; /** show the safeguarding line */ safeguard?: boolean });

export type Section =
  | { kind: "cold"; from: number; dur: number; /** frame of body.mp4 shown at section frame 0 */ bodyFrom: number; words: Word[]; big: { text: Rich; from: number; side: Side }[]; cam: CamKey[] }
  | { kind: "title"; from: number; dur: number }
  | { kind: "film"; from: number; dur: number; src: string; srcFrom: number }
  | { kind: "body"; from: number; dur: number }
  | { kind: "outro"; from: number; dur: number; src: string };

/** A sound-design moment; the score reads these, the picture never does. */
export type SoundCue = {
  f: number;
  type: "tick" | "tickStop" | "door" | "doorClose" | "paper" | "hit" | "drum" | "click" | "bell" | "swell" | "silence";
  /** for swell / silence: frames */
  dur?: number;
  weight?: 1 | 2 | 3;
};
export type MusicSection = { from: number; to: number; mood: "cold" | "theme" | "teach" | "word" | "story" | "pray" | "lift" | "out" };

export type EpisodePlan = {
  durationInFrames: number;
  sections: Section[];
  /** body.mp4 plays from frame 0 at this timeline frame */
  bodyAt: number;
  bodyFrames: number;
  /** joins in the body (body frames) — where the camera flips */
  cuts: number[];
  /** camera keys over the body (body frames) */
  cam: CamKey[];
  /** captions over the body (body frames) */
  captions: CaptionPage[];
  /** all cues, body frames, sorted */
  cues: Cue[];
  music: MusicSection[];
  sound: SoundCue[];
  /** staticFile path of the final mix for the whole episode timeline */
  audio: string;
};

export type PromoBeat =
  | { kind: "line"; mood: string; from: number; dur: number; /** stacked colour-over-matte clip (dayNN/matte/…) or plain clip when `matte` is false */ clip: string; matte: boolean; clipFrom: number; words: Word[]; cam: [View, View]; big?: { text: Rich; from: number }; snaps: number[] }
  | { kind: "title"; from: number; dur: number }
  | { kind: "film"; from: number; dur: number; src: string; srcFrom: number; focusX: number; /** 9:16 only: another moment of the clip */ srcFrom9?: number; /** 9:16 only: share of the frame height shown from the top (default 0.8) */ top9?: number }
  | { kind: "verse"; from: number; dur: number; ref: string; text: Rich; lit: number[]; hit?: number; /** his voice reading it: audio of `clip` from frame `clipFrom` for `frames` frames, starting at beat frame `at` */ read?: { clip: string; clipFrom: number; frames: number; at: number } }
  | { kind: "end"; from: number; dur: number };

export type PromoPlan = {
  id: string; // "trailer" | "short1" …
  format: "16x9" | "9x16";
  durationInFrames: number;
  /** shorts only */
  title?: Rich;
  beats: PromoBeat[];
  captions: CaptionPage[];
  music: MusicSection[];
  sound: SoundCue[];
  audio: string;
  post?: string;
  /**
   * Matted clips this piece needs (trailer only), built by scripts/december/matte.mjs from body.mp4:
   * `frames` frames starting at body frame `bodyFrom` (handles included) → `out` (public-relative).
   */
  mattes?: { out: string; bodyFrom: number; frames: number }[];
};

export type Plan = {
  meta: DayMeta;
  fps: 30;
  /** median face box in the body, 0..1: centre x/y and height (chin to top of cap) */
  face: { x: number; y: number; h: number };
  episode: EpisodePlan;
  trailer: { "16x9": PromoPlan; "9x16": PromoPlan };
  shorts: PromoPlan[];
};
