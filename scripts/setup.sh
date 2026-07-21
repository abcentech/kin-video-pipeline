#!/bin/zsh
# One-time setup on a fresh clone / new machine.
#   zsh scripts/setup.sh
set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

echo "==> Checking prerequisites (ffmpeg, node, whisper-cli)..."
command -v ffmpeg >/dev/null || echo "  ! ffmpeg missing — install: brew install ffmpeg"
command -v node   >/dev/null || echo "  ! node missing — install Node 20+ (nvm recommended: v24.14.1 tested)"
command -v whisper-cli >/dev/null || echo "  ! whisper-cli missing — install whisper.cpp (brew install whisper-cpp)"
command -v pdftoppm >/dev/null || echo "  ! pdftoppm missing (slide decks) — install: brew install poppler"

echo "==> Installing Remotion studio dependencies..."
( cd longform-studio && npm install )
( cd remotion-video-studio && npm install )

echo "==> Fetching ML models..."
zsh scripts/fetch_models.sh

echo "==> Configuring env..."
[ -f .env ] || { cp .env.example .env; echo "  created .env — add your GKEY."; }

cat <<EOF

==> Setup complete.
  Skills live in ./skills — copy them into a project's .claude/skills/ (or symlink)
  to use with Claude Code. Studios render at 1920x1080/30 (longform) and 1080x1920 (shorts).
  Brand rule: logo on file (kin_logo_full.png), real social icons, website KidsInspiringNation.org.
  Next: open README.md for the per-skill workflow.
EOF
