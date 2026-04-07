#!/bin/bash
set -euo pipefail

# OpenClaw CLI and gateway should always read/write the persisted workspace config.
export OPENCLAW_CONFIG_PATH=/data/workspace/config/openclaw.json

# Seed workspace assets once; user edits in /data must survive restarts.
mkdir -p /data/workspace/skills /data/workspace/config /data/agents/main/agent /data/agents/main/sessions /data/runtime

for template in BOOTSTRAP.md SOUL.md IDENTITY.md AGENTS.md TOOLS.md; do
  if [ ! -f "/data/workspace/$template" ]; then
    cp "/app/templates/$template" "/data/workspace/$template"
  fi
done

if [ ! -f "/data/workspace/avatar.svg" ]; then
  cp /app/avatar.svg /data/workspace/avatar.svg
fi

cp -R -n /app/skills/. /data/workspace/skills/

if [ -z "${CRM_API_URL:-}" ] || [ -z "${CRM_API_KEY:-}" ]; then
  echo "[entrypoint] WARN: CRM_API_URL/CRM_API_KEY missing, treating as stray machine and skipping startup"
  exit 0
fi

# Pick default model from available provider keys, then render initial gateway config.
MODEL="anthropic/claude-opus-4-6"
if [ -n "${OPENAI_API_KEY:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  MODEL="openai/gpt-5.2"
fi

if [ ! -f /data/workspace/config/openclaw.json ]; then
  MODEL="$MODEL" CONTROL_UI_ALLOWED_ORIGIN="${CRM_API_URL}" AGENT_BASE_URL="${AGENT_BASE_URL:-}" envsubst < /app/openclaw.json > /data/workspace/config/openclaw.json
fi

if [ ! -f /data/workspace/config/mcporter.json ]; then
  cat > /data/workspace/config/mcporter.json <<EOF
{
  "mcpServers": {
    "customermates": {
      "url": "${CRM_API_URL}/api/v1/mcp",
      "headers": {
        "x-api-key": "${CRM_API_KEY}"
      }
    }
  }
}
EOF
fi

# Pin mcporter to one canonical config location.
export MCPORTER_CONFIG=/data/workspace/config/mcporter.json

# WEBHOOK_URL is exposed to the running agent so it can configure external webhooks.
if [ -n "${AGENT_BASE_URL:-}" ] && [ -n "${FLY_MACHINE_ID:-}" ] && [ -n "${OPENCLAW_HOOKS_TOKEN:-}" ]; then
  export WEBHOOK_URL="${AGENT_BASE_URL}/hooks/agent?machine=${FLY_MACHINE_ID}&token=${OPENCLAW_HOOKS_TOKEN}"
fi

# Router is the public ingress (:3000). Gateway stays loopback-only (:3001).
node /app/router.cjs &
ROUTER_PID=$!

node dist/index.js gateway run --port 3001 --bind loopback &
GATEWAY_PID=$!

cleanup() {
  # Newer OpenClaw can stop unmanaged/container foreground gateways gracefully.
  openclaw gateway stop >/dev/null 2>&1 || true
  kill "$ROUTER_PID" 2>/dev/null || true
  wait "$ROUTER_PID" 2>/dev/null || true
}

trap cleanup TERM INT EXIT

i=1
while [ $i -le 90 ]; do
  curl -sf http://127.0.0.1:3001/healthz >/dev/null 2>&1 && break
  i=$((i + 1))
  sleep 2
done

# Bootstrap local device approval once gateway is healthy so RPC-style CLI calls can work.
if [ $i -le 90 ]; then
  openclaw devices list --json >/dev/null 2>&1 || true
  openclaw devices approve --latest >/dev/null 2>&1 || true
fi

# If gateway restarts itself, keep container alive while router is still running.
wait "$GATEWAY_PID" || true
wait "$ROUTER_PID"
