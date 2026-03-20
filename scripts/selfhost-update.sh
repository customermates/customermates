#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PULL_LATEST=false

for ARG in "$@"; do
  case "$ARG" in
    --pull)
      PULL_LATEST=true
      ;;
    --help|-h)
      echo "Usage: $0 [--pull]"
      exit 0
      ;;
    *)
      echo "ERROR: Unknown argument '$ARG'"
      echo "Usage: $0 [--pull]"
      exit 1
      ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose is not available."
  exit 1
fi

if [ "$PULL_LATEST" = true ]; then
  git pull --rebase
fi

docker compose build app
docker compose run --rm app npx prisma migrate deploy
docker compose up -d --no-deps app
docker compose ps
