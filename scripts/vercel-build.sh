#!/usr/bin/env bash
set -euo pipefail

# Migrations need a direct (session-mode) connection: the advisory lock Prisma takes
# is session-scoped and does not survive a transaction pooler, which times out as
# P1002. DIRECT_URL is the provider-neutral override; when it is not set explicitly,
# fall back to the unpooled URL the Neon integration provisions. The application
# config (prisma.config.ts) stays provider-neutral - this shim exists only here.
if [[ -z "${DIRECT_URL:-}" && -n "${DATABASE_URL_UNPOOLED:-}" ]]; then
  export DIRECT_URL="$DATABASE_URL_UNPOOLED"
fi

if [[ "${VERCEL_ENV:-}" == "preview" && "${VERCEL_TARGET_ENV:-}" == "demo" && "${APP_MODE:-}" == "demo" ]]; then
  # `prisma migrate reset` drops the schema BEFORE it reapplies migrations, and it
  # takes the advisory lock only in the reapply step. Over a pooled endpoint that
  # lock times out (P1002) after the drop has already run - which is exactly how the
  # Demo environment went down on 2026-07-20, leaving a database with no tables.
  # Fail closed while the database is still intact rather than reset over a pooler.
  if [[ -z "${DIRECT_URL:-}" ]]; then
    echo "ERROR: no direct database endpoint on the Demo environment." >&2
    echo "Neither DIRECT_URL nor DATABASE_URL_UNPOOLED is set, so the reset would run" >&2
    echo "over the pooled endpoint, where the migration advisory lock times out (P1002)" >&2
    echo "after the schema drop. Set DIRECT_URL or restore the Neon integration." >&2
    exit 1
  fi

  npx --no-install prisma migrate reset --force
  npx --no-install tsx prisma/seed.ts
else
  if [[ -z "${DIRECT_URL:-}" ]]; then
    echo "WARNING: no direct database endpoint (DIRECT_URL / DATABASE_URL_UNPOOLED);" >&2
    echo "migrating over the DATABASE_URL endpoint. If that is a transaction pooler," >&2
    echo "the advisory lock this takes can time out (P1002)." >&2
  fi
  npx --no-install prisma migrate deploy
  if [[ "${VERCEL_ENV:-}" == "preview" ]]; then
    npx --no-install tsx prisma/seed.ts
  fi
fi
yarn build
