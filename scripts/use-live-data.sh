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

parse_destination() {
  local url="$1"
  local hostport

  destination_base="${url%%\?*}"
  destination_query="${url#"$destination_base"}"
  database_name="${destination_base##*/}"
  admin_url="${destination_base%/*}/postgres${destination_query}"

  hostport="${url#*://}"
  hostport="${hostport#*@}"
  hostport="${hostport%%/*}"
  destination_hostport="${hostport%%\?*}"
  destination_host="${destination_hostport%:*}"
}

default_destination="${DIRECT_URL:-${DATABASE_URL:-}}"

if [[ -n "$default_destination" ]]; then
  parse_destination "$default_destination"
  read -r -p "Destination [$database_name on $destination_hostport]. Press Enter to accept, or paste another URL: " typed_destination
  destination_url="${typed_destination:-$default_destination}"
else
  read -r -p "Paste the local destination database URL: " destination_url
fi

if [[ -z "$destination_url" ]]; then
  echo "A destination database URL is required." >&2
  exit 1
fi

parse_destination "$destination_url"

case "$destination_host" in
  localhost | 127.0.0.1 | ::1 | "[::1]") ;;
  *)
    echo "Refusing to replace a non-local destination (host $destination_host)." >&2
    exit 1
    ;;
esac

echo "Destination: database $database_name on $destination_hostport will be dropped and replaced."

read -r -s -p "Paste the Production direct database URL (input hidden): " production_url
printf '\n'

if [[ -z "$production_url" ]]; then
  echo "A Production database URL is required." >&2
  exit 1
fi

if [[ "$production_url" == *-pooler.* ]]; then
  unset production_url
  echo "That is a pooled endpoint. A connection pooler rejects the read-only startup option this export relies on, and cannot hold the consistent snapshot pg_dump needs. Use the direct connection string instead: the same host with '-pooler' removed." >&2
  exit 1
fi

temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/customermates-live-data.XXXXXX")"
trap 'rm -rf "$temporary_directory"' EXIT
archive="$temporary_directory/snapshot.dump"

echo "[1/5] Exporting Production over a read-only session. Nothing is written to Production."
PGOPTIONS='-c default_transaction_read_only=on' pg_dump "$production_url" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --schema=public \
  --file "$archive"
unset production_url
echo "      Export finished: $(du -h "$archive" | cut -f1) archive written to a temporary file."

echo "[2/5] Verifying the archive before anything is destroyed."
archive_tables="$(pg_restore --list "$archive" | grep -c 'TABLE DATA' || true)"
echo "      Archive is readable and contains $archive_tables tables with data."

echo "[3/5] Dropping and recreating the local database \"$database_name\"."
dropdb --if-exists --force --maintenance-db="$admin_url" "$database_name"
createdb --maintenance-db="$admin_url" "$database_name"
psql "$destination_url" --no-psqlrc --quiet --set=ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS public CASCADE;'
echo "      Recreated. Any data previously in \"$database_name\" is gone."

echo "[4/5] Restoring the snapshot into \"$database_name\". This is the slow step."
pg_restore \
  --exit-on-error \
  --single-transaction \
  --no-owner \
  --no-privileges \
  --dbname "$destination_url" \
  "$archive"
echo "      Restore complete."

echo "[5/5] Disabling webhooks so the copy cannot call customer endpoints."
disabled_endpoints="$(psql "$destination_url" --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 -c '
UPDATE "Webhook"
SET "enabled" = false,
    "secret" = NULL,
    "url" = '"'"'https://disabled.invalid/webhooks/'"'"' || "id"
RETURNING 1;' | grep -c 1 || true)"
echo "      $disabled_endpoints webhook endpoints disabled, secrets cleared, URLs pointed at disabled.invalid."

rewritten_deliveries="$(psql "$destination_url" --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 -c '
UPDATE "WebhookDelivery"
SET "url" = '"'"'https://disabled.invalid/webhooks/'"'"' || "id"
RETURNING 1;' | grep -c 1 || true)"
echo "      $rewritten_deliveries delivery records rewritten so no customer endpoint URL remains in the history."

failed_in_flight="$(psql "$destination_url" --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 -c '
UPDATE "WebhookDelivery"
SET "status" = '"'"'failed'"'"',
    "success" = false,
    "statusCode" = NULL,
    "responseMessage" = '"'"'Disabled in imported copy'"'"',
    "deliveredAt" = COALESCE("deliveredAt", NOW())
WHERE "status" IN ('"'"'pending'"'"', '"'"'processing'"'"')
RETURNING 1;' | grep -c 1 || true)"
echo "      $failed_in_flight deliveries were in flight at export time and were marked failed."

if [[ "$apply_migrations" == "true" ]]; then
  echo "Applying migrations the snapshot has not seen yet."
  DATABASE_URL="$destination_url" DIRECT_URL="$destination_url" npx --no-install prisma migrate deploy
fi

rm -rf .next/workflow-data
echo ""
echo "Done. \"$database_name\" on $destination_hostport now holds a copy of Production."
echo "Restart the dev server so it reconnects, then destroy this database when the investigation ends."
