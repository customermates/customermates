#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${1:-$ROOT/ee/agent-runtime/skills/orthogonal}"
OUT_FILE="$OUT_DIR/SKILL.md"
ORTHOGONAL_SKILL_URL="https://www.orthogonal.com/skill.md"

mkdir -p "$OUT_DIR"

curl -fsSL "$ORTHOGONAL_SKILL_URL" -o "$OUT_FILE"

echo "Synced Orthogonal skill into $OUT_FILE"
