#!/usr/bin/env bash

set -euo pipefail

if [[ -n "${DATABASE_URL_UNPOOLED:-}" ]]; then
  export DIRECT_URL="$DATABASE_URL_UNPOOLED"
fi

npx --no-install prisma migrate deploy
if [[ "${VERCEL_ENV:-}" == "preview" ]]; then
  npx --no-install tsx prisma/seed.ts
fi
yarn build
