#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "CRON_SECRET is not set"
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:4000}"
URL="${BASE_URL%/}/api/cron/webhook-deliveries"

curl -fsS -H "Authorization: Bearer ${CRON_SECRET}" "$URL"
