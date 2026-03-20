#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${1:-$ROOT/ee/agent-runtime/templates}"

mkdir -p "$OUT_DIR"

declare -a TEMPLATE_URLS=(
  "AGENTS.md|https://raw.githubusercontent.com/openclaw/openclaw/main/docs/reference/templates/AGENTS.md"
  "BOOTSTRAP.md|https://raw.githubusercontent.com/openclaw/openclaw/main/docs/reference/templates/BOOTSTRAP.md"
  "SOUL.md|https://raw.githubusercontent.com/openclaw/openclaw/main/docs/reference/templates/SOUL.md"
  "TOOLS.md|https://raw.githubusercontent.com/openclaw/openclaw/main/docs/reference/templates/TOOLS.md"
  "IDENTITY.md|https://raw.githubusercontent.com/openclaw/openclaw/main/docs/reference/templates/IDENTITY.md"
)

for item in "${TEMPLATE_URLS[@]}"; do
  name="${item%%|*}"
  url="${item#*|}"
  curl -fsSL "$url" -o "$OUT_DIR/$name"
done

echo "Synced OpenClaw templates into $OUT_DIR"
