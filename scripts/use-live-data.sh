#!/usr/bin/env bash

set -euo pipefail

apply_migrations=false
if [[ $# -eq 1 && "$1" == "--apply-migrations" ]]; then
  apply_migrations=true
elif [[ $# -ne 0 ]]; then
  echo "Usage: yarn db:use-live-data [--apply-migrations]" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL must be configured." >&2
  exit 1
fi

destination_url="${DIRECT_URL:-$DATABASE_URL}"

read -r -s -p "Paste the Production direct database URL (input hidden): " production_url
printf '\n'

temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/customermates-live-data.XXXXXX")"
trap 'rm -rf "$temporary_directory"' EXIT
archive="$temporary_directory/snapshot.dump"

echo "Exporting Production data..."
PGOPTIONS='-c default_transaction_read_only=on' pg_dump "$production_url" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --schema=public \
  --file "$archive"
unset production_url
pg_restore --list "$archive" >/dev/null

destination_base="${destination_url%%\?*}"
destination_query="${destination_url#"$destination_base"}"
database_name="${destination_base##*/}"
admin_url="${destination_base%/*}/postgres${destination_query}"

echo "Replacing the configured $database_name database..."
PGDATABASE="$admin_url" dropdb --if-exists --force "$database_name"
PGDATABASE="$admin_url" createdb "$database_name"
pg_restore \
  --exit-on-error \
  --single-transaction \
  --no-owner \
  --no-privileges \
  --dbname "$destination_url" \
  "$archive"

echo "Disabling webhooks in the imported copy..."
PGDATABASE="$destination_url" psql --no-psqlrc --set=ON_ERROR_STOP=1 <<'SQL'
UPDATE "Webhook"
SET "enabled" = false,
    "secret" = NULL,
    "url" = 'https://disabled.invalid/webhooks/' || "id";
UPDATE "WebhookDelivery"
SET "url" = 'https://disabled.invalid/webhooks/' || "id";
UPDATE "WebhookDelivery"
SET "status" = 'failed',
    "success" = false,
    "statusCode" = NULL,
    "responseMessage" = 'Disabled in imported copy',
    "deliveredAt" = COALESCE("deliveredAt", NOW())
WHERE "status" IN ('pending', 'processing');
SQL

if [[ "$apply_migrations" == "true" ]]; then
  echo "Applying pending migrations..."
  DATABASE_URL="$destination_url" DIRECT_URL="$destination_url" npx --no-install prisma migrate deploy
fi

rm -rf .next/workflow-data
echo "Live-data import complete."
