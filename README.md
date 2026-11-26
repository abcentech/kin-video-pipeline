# KIN Video Pipeline

Reusable video-production pipeline for **Kids Inspiring Nation** — turn raw talking-head
shoots into polished long-form devotionals and viral vertical shorts, with karaoke captions,
full-page scriptures, designed-slide cutaways, kinetic teaching points, branding, and a
standing prayer-service call-to-action.

Built as a set of **Claude Code skills** + two **Remotion** studios + FFmpeg/whisper scripts.
Clone it on any machine or account, run setup, and produce on-brand episodes.

## What's inside

```
skills/                         Claude Code skills (copy into a project's .claude/skills/)
  weekly-devotional-longform/   Intake + orchestration for the recurring weekly episode
  video-to-longform/            Raw shoot → graded, scened, captioned long-form (+ scripts/)
  video-edited-overlay/         Layer kinetic points/hook/teasers onto an already-edited cut
  video-to-short/               Long video → 9:16 viral shorts with kinetic captions (+ scripts/)
longform-studio/                Remotion project — LongForm component (1920x1080/30)
remotion-video-studio/          Remotion project — Short/ShortC components (1080x1920/30)
build/                          FFmpeg/node scripts: grading, captions, clipping, shorts configs
scripts/                        setup.sh, fetch_models.sh
```

Episode media (shoots, graded sources, renders) and ML models are **not** committed — see
`.gitignore`. Scenes/captions JSON for past episodes are kept as working examples/templates.

## Setup (fresh clone)

```bash
zsh scripts/setup.sh          # installs studio deps, fetches models, creates .env
# then add your Gemini key:
cp .env.example .env          # if not already; set GKEY=...
```

Prerequisites: **ffmpeg**, **node 20+** (v24.14.1 tested), **whisper.cpp** (`whisper-cli`),
**poppler** (`pdftoppm`, for slide decks). macOS: `brew install ffmpeg whisper-cpp poppler`.

## Using the skills with Claude Code

Copy or symlink `skills/*` into your working project's `.claude/skills/`. Then invoke the
matching skill (e.g. "prepare this week's devotional"). Each skill's `SKILL.md` documents its
STEP 0 inputs checklist and the exact script invocations.

### Two production paths
- **Raw shoot → full build** (`weekly-devotional-longform` → `video-to-longform`): grade the
  body, karaoke captions from the corrected SRT, designed-deck PDF pages as full-screen
  SlideKenBurns cutaways, full-page scripture reveals, kinetic points, stitch intro(s)+body+outro.
- **Editor cut → overlay** (`video-edited-overlay`): keep the editor's colors; add only kinetic
  points/hook/teasers in the *clean talking-head gaps* so nothing collides with existing cards.
- **Any video → shorts** (`video-to-short`): crop 9:16, per-clip whisper captions, music bed,
  branded intro/closing.

## Daily devotional pipeline

`daily-devotional/` is a separate, self-contained project ("THE FATHER SHOWED UP"): raw daily
`Day_N.mp4` + the teaching guide → edited 16:9 episode, 16:9 + 9:16 trailer, three 9:16 shorts,
captions, thumbnail and social copy. It has its own install (`daily-devotional/scripts/setup.ps1`
or `setup.sh`) and does not use the studios above. See [`daily-devotional/README.md`](daily-devotional/README.md);
the matching Claude Code skill is `skills/daily-devotional/`.

## Standing brand & format rules (locked)
- **Branding:** logo on file (`kin_logo_full.png`) top-right, "KIDSINSPIRING NATION" wordmark
  progress gauge bottom-left, real social icons (never emoji), website **KidsInspiringNation.org**.
- **Scriptures** always render as **full-page takeovers**; `**emphasis**` only parses in full mode.
- **Every episode ends** with the standing CTA ribbon: *Prayer Service · Saturdays 7:30pm ·
  KidsInspiringNation.t.me* (`outro.prayer`).
- **Grade to the series** in play (don't blindly apply a skill's default grade).
- **Series socials:** each episode + its shorts get a socials doc; at series completion produce
  one consolidated `<SERIES>_ALL_socials.md`.
- Full-screen takeovers (hook / recap / outro / full-page scripture / full-slide) suppress the
  caption band; render heavy composites at `--concurrency=3` to avoid Chromium OOM crashes.

## Secrets
No keys are committed. `GKEY` (Gemini) is read from the environment / `.env` at runtime.

## License
Internal to Kids Inspiring Nation.
