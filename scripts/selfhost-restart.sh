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

docker compose restart app
docker compose ps
echo "Logs:"
echo "  docker compose logs -f app"
