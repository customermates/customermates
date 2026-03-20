#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Ensure flyctl is available
FLY_DIR="${HOME:-/tmp}/.fly"
export PATH="$FLY_DIR/bin:$PATH"
if ! command -v fly >/dev/null 2>&1; then
  curl -sL https://fly.io/install.sh | sh -s -- -d "$FLY_DIR/bin"
  export PATH="$FLY_DIR/bin:$PATH"
fi

# Validate required env vars
REQUIRED_VARS=(FLY_APP_NAME)
for VAR in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!VAR:-}" ]; then
    echo "ERROR: $VAR is not set"
    exit 1
  fi
done

echo "Deploying to Fly.io: agents=$FLY_APP_NAME"

# Create app if it doesn't exist
if ! fly apps list --json | grep -q "\"$FLY_APP_NAME\""; then
  echo "Creating app $FLY_APP_NAME..."
  fly apps create "$FLY_APP_NAME"
fi

# Ensure public IPs are allocated (needed for fly-force-instance-id routing)
if ! fly ips list -a "$FLY_APP_NAME" --json | grep -q '"type"'; then
  echo "Allocating IPs for $FLY_APP_NAME..."
  fly ips allocate-v6 -a "$FLY_APP_NAME"
  fly ips allocate-v4 --shared -a "$FLY_APP_NAME"
fi

# Ensure TLS cert for custom agent domain (derived from BASE_URL)
if [ -n "${BASE_URL:-}" ]; then
  AGENT_HOST="agents.$(echo "$BASE_URL" | sed 's|https\?://||' | sed 's|/.*||')"
  if [[ "$AGENT_HOST" != *trycloudflare* && "$AGENT_HOST" != *localhost* ]]; then
    echo "Ensuring TLS cert for $AGENT_HOST..."
    fly certs add "$AGENT_HOST" -a "$FLY_APP_NAME" 2>/dev/null || true
  fi
fi

# On --reset: destroy all machines and volumes but keep the app/registry/IPs
if [ "${1:-}" = "--reset" ]; then
  echo "Cleaning up machines and volumes..."
  for MID in $(fly machines list -a "$FLY_APP_NAME" --json 2>/dev/null | python3 -c "import sys,json;[print(m['id']) for m in json.load(sys.stdin)]" 2>/dev/null); do
    echo "  Destroying machine $MID"
    fly machines destroy "$MID" -a "$FLY_APP_NAME" --force 2>/dev/null || true
  done
  for VID in $(fly volumes list -a "$FLY_APP_NAME" --json 2>/dev/null | python3 -c "import sys,json;[print(v['id']) for v in json.load(sys.stdin)]" 2>/dev/null); do
    echo "  Destroying volume $VID"
    fly volumes destroy "$VID" -a "$FLY_APP_NAME" -y 2>/dev/null || true
  done
fi

IMAGE="registry.fly.io/$FLY_APP_NAME:latest"

echo "Building and pushing agent image..."
cd "$ROOT"
fly deploy \
  --remote-only \
  --build-only \
  --push \
  --config ee/agent-runtime/fly.toml \
  --dockerfile ee/agent-runtime/Dockerfile.fly \
  --image-label latest \
  --app "$FLY_APP_NAME" \
  --ha=false

MACHINES_JSON=$(fly machines list -a "$FLY_APP_NAME" --json 2>/dev/null || echo "[]")

# Stop stray machines (no volume = not a per-user machine) to avoid compute charges
for MID in $(echo "$MACHINES_JSON" | python3 -c "
import sys, json
for m in json.load(sys.stdin):
    if not (m.get('config', {}).get('mounts') or []):
        print(m['id'])
" 2>/dev/null); do
  echo "  Stopping stray machine $MID (no volume attached)..."
  fly machines stop "$MID" -a "$FLY_APP_NAME" 2>/dev/null || true
done

# Roll out new image to all existing per-user machines
for MID in $(echo "$MACHINES_JSON" | python3 -c "
import sys, json
for m in json.load(sys.stdin):
    if m.get('config', {}).get('mounts') or []:
        print(m['id'])
" 2>/dev/null); do
  echo "  Updating machine $MID to $IMAGE..."
  fly machine update "$MID" --image "$IMAGE" -a "$FLY_APP_NAME" --yes 2>/dev/null || true
done

echo "Done. Agents: $FLY_APP_NAME"
