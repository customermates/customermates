#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DIRECT_URL:-}" && -n "${DATABASE_URL_UNPOOLED:-}" ]]; then
  export DIRECT_URL="$DATABASE_URL_UNPOOLED"
fi

npx --no-install prisma migrate deploy
yarn build
