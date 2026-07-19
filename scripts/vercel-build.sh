#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${DATABASE_URL_UNPOOLED:-}" ]]; then
  export DIRECT_URL="$DATABASE_URL_UNPOOLED"
fi

if [[ "${VERCEL_ENV:-}" == "preview" && "${VERCEL_TARGET_ENV:-}" == "demo" && "${APP_MODE:-}" == "demo" ]]; then
  npx --no-install prisma migrate reset --force
  npx --no-install tsx prisma/seed.ts
else
  npx --no-install prisma migrate deploy
  if [[ "${VERCEL_ENV:-}" == "preview" ]]; then
    npx --no-install tsx prisma/seed.ts
  fi
fi
yarn build
