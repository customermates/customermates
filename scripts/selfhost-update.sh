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

BACKUP="backups/customermates-$(date +%Y%m%d-%H%M%S).sql.gz"
mkdir -p backups
trap 'rm -f "$BACKUP.partial"' EXIT
if ! docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$BACKUP.partial"; then
  echo "ERROR: the database backup failed, so nothing was updated."
  exit 1
fi
mv "$BACKUP.partial" "$BACKUP"
echo "Backup written to $BACKUP"

docker compose pull
docker compose up -d
docker compose ps
