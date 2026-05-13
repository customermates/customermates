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

if [ ! -f ".env" ]; then
  if [ ! -f ".env.selfhost.template" ]; then
    echo "ERROR: .env.selfhost.template is missing."
    exit 1
  fi
  cp ".env.selfhost.template" ".env"
  echo "Created .env from .env.selfhost.template"
fi

set -a
source ".env"
set +a

REQUIRED_VARS=(
  BASE_URL
  POSTGRES_USER
  POSTGRES_PASSWORD
  POSTGRES_DB
  BETTER_AUTH_SECRET
  RESEND_API_KEY
  RESEND_OPERATOR_EMAIL
  TRIGGER_SECRET_KEY
  TRIGGER_PROJECT_REF
)

for VAR in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!VAR:-}" ]; then
    echo "ERROR: $VAR is required in .env"
    exit 1
  fi
done

docker compose pull app
docker compose up -d postgres
docker compose run --rm app npx prisma migrate deploy
docker compose up -d app
docker compose ps
echo "Setup completed. Open ${BASE_URL}"
