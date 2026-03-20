#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "ERROR: cloudflared is not installed. Install it via: brew install cloudflared"
  exit 1
fi

set -a
source "$ROOT/.env"
set +a

LOG_FILE=$(mktemp)
trap "rm -f $LOG_FILE" EXIT

echo "Starting cloudflared tunnel on port 4000..."
cloudflared tunnel --url http://localhost:4000 2>"$LOG_FILE" &
CLOUDFLARED_PID=$!
trap "kill $CLOUDFLARED_PID 2>/dev/null || true; rm -f $LOG_FILE" EXIT

for i in $(seq 1 15); do
  TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_FILE" 2>/dev/null | head -1) || true
  if [ -n "${TUNNEL_URL:-}" ]; then
    break
  fi
  sleep 1
done

if [ -z "${TUNNEL_URL:-}" ]; then
  echo "ERROR: Failed to get tunnel URL after 15 seconds"
  exit 1
fi

echo "Tunnel URL: $TUNNEL_URL"
export BASE_URL="$TUNNEL_URL"

echo "Deploying to Fly.io with BASE_URL=$BASE_URL..."
bash "$ROOT/ee/scripts/fly-deploy.sh" --reset

echo "Starting dev server..."
cd "$ROOT"
prisma generate && yarn openapi:generate && next dev --turbopack -p 4000
