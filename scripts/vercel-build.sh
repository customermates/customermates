#!/usr/bin/env bash
set -euo pipefail

# Host and database of the endpoint Prisma will actually migrate against, with the
# scheme and credentials stripped off. Mirrors the precedence in prisma.config.ts:
# DIRECT_URL wins, DATABASE_URL is the fallback.
migration_target() {
  local url stripped hostport path
  url="${DIRECT_URL:-${DATABASE_URL:-}}"
  stripped="${url#*://}"
  stripped="${stripped#*@}"
  hostport="${stripped%%[/?]*}"
  path="${stripped#"$hostport"}"
  path="${path#/}"
  printf '%s/%s' "${hostport%%:*}" "${path%%\?*}"
}

if [[ "${VERCEL_ENV:-}" == "preview" && "${VERCEL_TARGET_ENV:-}" == "demo" && "${APP_MODE:-}" == "demo" ]]; then
  # `prisma migrate reset` drops the schema BEFORE it reapplies migrations, and it takes
  # the advisory lock only in the reapply step. A failure in between leaves the database
  # with no tables at all - which is exactly how the Demo environment went down on
  # 2026-07-20 (P1002, lock wait timed out after the drop had already run).
  #
  # So every check below fails closed: a missing or mismatched variable aborts the build
  # while the database is still intact. VERCEL_ENV/VERCEL_TARGET_ENV/APP_MODE above are
  # only labels - none of them says anything about which database we are pointed at.
  if [[ -z "${DIRECT_URL:-}" ]]; then
    echo "ERROR: DIRECT_URL is not set on the Demo environment." >&2
    echo "Migrations take a session-scoped advisory lock, which does not survive a" >&2
    echo "transaction pooler. Point DIRECT_URL at the unpooled Demo endpoint." >&2
    exit 1
  fi

  if [[ -z "${DEMO_DATABASE_HOST:-}" ]]; then
    echo "ERROR: DEMO_DATABASE_HOST is not set; refusing to run a destructive reset." >&2
    echo "Set it on the Demo environment only, to the host of DIRECT_URL." >&2
    exit 1
  fi

  target="$(migration_target)"
  if [[ "$target" != "$DEMO_DATABASE_HOST"/* ]]; then
    echo "ERROR: refusing to reset ${target}." >&2
    echo "It does not match DEMO_DATABASE_HOST, so this is not the Demo database." >&2
    exit 1
  fi

  npx --no-install prisma migrate reset --force
  npx --no-install tsx prisma/seed.ts
else
  if [[ -z "${DIRECT_URL:-}" ]]; then
    echo "WARNING: DIRECT_URL is not set; migrating over the DATABASE_URL endpoint." >&2
    echo "If that endpoint is a transaction pooler, the advisory lock this takes can" >&2
    echo "time out (P1002). Point DIRECT_URL at the unpooled endpoint." >&2
  fi
  npx --no-install prisma migrate deploy
  if [[ "${VERCEL_ENV:-}" == "preview" ]]; then
    npx --no-install tsx prisma/seed.ts
  fi
fi
yarn build
