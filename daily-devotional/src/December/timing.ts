/**
 * Shared timing constants, frames at 30 fps — december/COMPILE.md is the source of truth.
 * The compiler (scripts/december/lib.mjs `T`), the sound stage and the picture all use these numbers,
 * so an animation that the score must hit lands on the same frame everywhere.
 * Owner: the lead.
 */
export const T = {
  DOOR_IN: 16, // door of light opening (content readable from frame 10)
  DOOR_OUT: 10,
  TITLE_DUR: 165, // episode sting: black breath 0–10, door at 10, title lands at 26
  TITLE_DOOR: 10,
  TITLE_HIT: 26,
  TITLE_DUR_TRAILER: 84, // door at 4, title lands at 16
  TITLE_DOOR_TRAILER: 4,
  TITLE_HIT_TRAILER: 16,
  SLATE: 60,
  IDENT_DUR: 135,
  CHAPTER_DUR: 84,
  CHAPTER_HIT: 12,
  SUB_DUR: 135,
  SUB_PRESS: 40,
  SUB_BELL: 52,
  TEASER_DUR: 120,
  KEYWORD_DUR: 54,
  RECAP_DUR: 200,
  RECAP_LINES: [30, 70, 110],
  NEXT_DUR: 270,
  NEXT_HIT: 26,
  END_DUR_TRAILER: 102,
  END_HIT_TRAILER: 10,
  END_DUR_SHORT: 75,
  OUTRO_DUR: 219,
  LEAD: 2,
} as const;
