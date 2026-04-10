#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$([ -f "$SCRIPT_DIR/docker-compose.yml" ] && echo "$SCRIPT_DIR" || echo "$SCRIPT_DIR/..")"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose is not available."
  exit 1
fi

echo "WARNING: This will permanently delete your self-hosted database data."
echo "This runs: docker compose down --volumes --remove-orphans"
echo
read -r -p "Type RESET to continue: " CONFIRMATION

if [ "$CONFIRMATION" != "RESET" ]; then
  echo "Reset cancelled."
  exit 0
fi

docker compose down --volumes --remove-orphans
docker compose ps
echo "Self-host data reset completed."
