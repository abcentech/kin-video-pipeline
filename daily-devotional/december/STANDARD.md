# THE FATHER SHOWED UP — the editorial standard (how to write `edits/dayNN.json`)

You are the editor. The scripts do the cutting, the grading, the drawing and the sound; this file is
where the judgment goes. Read the day's block in `series.json` and the whole of
`.tmp/dec/dayNN/draft.md` before you write a line. Reference edit: `edits/day01.json`.
Types: `src/December/types.ts` (`Edit`). Compile rules: `COMPILE.md`. Look: `DESIGN.md`.

The presenter teaches from the Teacher's Edition, in his own words. Each recording runs: greeting →
the day's scripture read aloud → what it means → the three truths → the response → the prayers →
the declaration. Nothing in the recording mentions the film; the film clip is ours to place.

## 1. Proof-read first (`fix`)

Whisper mis-hears this voice often ("God is never needed" = "God has never once been late").
For every phrase, compare the draft's hearing with the guide sentence beside it:
- If the guide sentence explains the mis-hearing, write what he actually said (his words, not the
  guide's — he paraphrases; keep his paraphrase when it is clear).
- Scripture he reads aloud is captioned in KJV wording wherever his reading follows it; where he
  departs from the KJV (skips a word, says "fullness of time"), caption what he says — the scripture
  PAGE always shows the exact KJV.
- If you cannot tell what a word is from the draft, the guide and the sound-alike, do not guess:
  cut around the phrase if it can go, otherwise fix it to the most conservative reading and list it
  under `NOTES: check` in your hand-off so the producer can confirm. Never caption a word you made up.
- `fix` is word-level: `"w123": "fulness"`; `""` removes a token (a stutter, "uh").

## 2. Cut (`keep`, `maxPause`)

- Cut every retake (keep the LAST complete take unless an earlier one is clearly better), false
  starts, "um/uh", slate chatter before the greeting and after the last word, coughs, glances off camera.
- Keep his rhythm: he is a slow, deliberate speaker and the pauses are part of the tenderness.
  `maxPause` 0.75 for teaching; never tighten inside a prayer or before the declaration (give those
  their own `keep` span and leave long pauses by ending a span and starting the next one where you want the join).
- Never cut meaning to save seconds. A day runs as long as its teaching (4–8 minutes of body).
- A span boundary is a visible reframe. Put one at EVERY thought change (a new sentence group, each
  truth, the song, the declaration, the prayer, the sign-off) — about one every 8–12 s — never
  mid-sentence. A boundary between adjacent spans keeps the pause; only dropped words tighten the join.
- `pace` keeps his rhythm where it matters: `{ span, maxPause }` — the pause before each truth (1.5),
  anything he SINGS (2.0), the declaration (1.0), the prayer (2.0).
- `air` makes room for a silent card: `{ after, dur, lead? }` stretches the pause after a word to `dur`
  seconds (real silence first, then a held frame hidden under the card). Use it for the recap after the
  last truth and for the response when he does not speak it.
- A second hearing is cheap: for any stretch the draft marks UNRELIABLE, re-run whisper on that clip
  with a prompt of the guide's sentences and compare the three hearings before you write `fix`.

## 3. The cold open (`hook`)

One line (rarely two), 4–10 s, lifted from later in the teaching: the most arresting thing he says —
a line a child would repeat, or one that names the ache ("it was never your job to fix the money").
It must make sense alone and end on a strong word. `big` = its 2–4 key words, one `*gold*`.
Not the greeting, not a scripture reference, not the declaration (save that for the end).

## 4. The film (`film`)

`play: true` runs the day's clip after the title (the guide's "Watch the film"). Trim with `from`/`to`
(seconds of the clip) so it ends on a finished line of its narration. Use individual shots again later
as `film` cues (silent b-roll) only where he is describing exactly that moment of the story.

## 5. Cues — the grammar of a day

In order of appearance; times are word anchors.
1. `ident` on his first full sentence after the greeting.
2. `chapter` "THE WORD" as he announces the scripture; the main text as a `scripture` **page** with
   `read` on his reading, `flourish: true`, and `**…**` on the phrase the day hangs on (it is the phrase
   he comes back to when he explains). Other verses he reads in full: pages. Passing references: cards.
3. `teaser` once, in the explanation, naming what is still to come ("three truths for every child who has waited").
4. Each truth: `chapter` (`label` "TRUTH 1 OF 3", `numeral`, the guide's title) on the sentence where he
   names it; then ONE strong visual: an `art` plate (the story of that truth happening) or a `film`
   cutaway when he refers to the film; plus a `point` on the sentence a child should remember
   (his words, ≤ 12 words). A `keyword` only for a phrase he hits hard.
5. `subscribe` in a breath between truth 1 and truth 2; the share variant between truth 3 and the response.
6. `response` over the response section (`child` / `father` text from the guide, `sync` to his words).
   If he never speaks it (Day 1), give it an `air` right after the declaration (≈ 10 s, silent, the
   guide's words) — the declaration is what the child is asked to write.
7. `prayer` over each prayer he prays, lines from the guide where he follows it (his words where he doesn't).
8. `recap` (the three truths, title `TODAY'S THREE TRUTHS`) in an `air` of ≈ 8 s right after the last
   truth's final sentence — the summary card the producer asked for, and a breath before the close.
9. `declare` on the declaration (`sync` to his words; show what HE says, the guide's wording goes on the
   end card). The end card and sign-off are automatic.
10. `snap` on at most 4 words in the episode — the ones he punches.
11. `hush` over anything he sings: the music bed must be out (it is in another key).
12. No `ident` until the producer supplies the presenter's name (a lower third that only repeats the
    logo is noise). No `chapter` for THE WORD when he opens straight into the reading: the page is the chapter.
13. A third nudge is allowed where he himself asks for likes and shares in his sign-off.
`safeguard: true` when the day speaks about harm or unsafe homes.

Density: something changes at least every 18 s; takeovers ≤ 45% of the body; let his face carry the
most personal sentences with nothing on screen but captions.

## 6. Illustrations (`art`)

Two to four plates a day. Each is ONE moment of story from that truth, described literally and
concretely: who, doing what, where, the light source, where the empty space is. A child, a father,
a mother; a door, a watch, a pot, a road, Bethlehem — the world of the film and of the scripture.
Never abstract ("hope"), never a crowd, never text. Name the lights (`lights`) after you have looked
at the generated plate (positions 0..1), and give it a slow `move`. Regenerate a plate that has
garbled hands/faces or letters in it.

## 7. Trailer (`trailer`)

35–50 s: cold → title → tension (3–5 short lines + 1–2 film shots) → verse → turn (1–2 lines) →
button → end. Tease, don't teach: the trailer names the ache and promises the answer; it does not
give the three truths. Use different lines from the episode's cold open where possible. `big` words
2–4 in the whole trailer (≤ 12 letters each; short words pair up), one gold hero in the turn.
The button is a line TO the viewer ("So if you are still waiting at a door — watch this.") — if he
never says one, end on the turn line and let the end card ask.

## 8. Shorts (`shorts`)

Three: `word` (the scripture and its one-sentence meaning), `truth` (the strongest truth — the one a
father or a child would forward), `prayer` (a prayer + the declaration). Each 20–55 s, a complete
thought with a beginning and an end, no "as I said". `title` = the hook in ≤ 8 words on two lines,
written for someone scrolling with the sound off. `post` = one sentence + the scripture ref +
"Full devotional on YouTube @KidsInspiringNation" + 4–6 hashtags.

## 9. Social copy (`social`)

Three title options (≤ 60 characters, the day's promise, no clickbait the teaching doesn't keep);
a description (two sentences + the scripture + the declaration + the standing lines); a pinned comment
that asks ONE question a child or parent can answer; the thumbnail line (2–4 words) and the word
anchor of a frame where his eyes are open and his face is alive.

## 10. Before you hand over

Run `plan.mjs` and read the printed running order top to bottom as a viewer would. Fix every warning
or justify it. Then stills; then the checklist.
