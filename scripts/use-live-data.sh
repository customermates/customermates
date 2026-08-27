#!/usr/bin/env bash

set -euo pipefail

expected_postgres_major=17
apply_migrations=false
if [[ $# -eq 1 && "$1" == "--apply-migrations" ]]; then
  apply_migrations=true
elif [[ $# -ne 0 ]]; then
  echo "Usage: yarn db:use-live-data [--apply-migrations]" >&2
  exit 1
fi

production_url=""
temporary_directory=""
cleanup() {
  unset production_url
  if [[ -n "$temporary_directory" ]]; then
    rm -rf "$temporary_directory"
  fi
}
trap cleanup EXIT

retry_argument=""
if [[ "$apply_migrations" == "true" ]]; then
  retry_argument=" --apply-migrations"
fi

postgres_client_fix() {
  local postgres_bin=""
  local detected_prefix
  local homebrew_prefix

  if command -v brew >/dev/null 2>&1; then
    detected_prefix="$(brew --prefix postgresql@17 2>/dev/null || true)"
    if [[ -z "$detected_prefix" ]]; then
      homebrew_prefix="$(brew --prefix 2>/dev/null || true)"
      detected_prefix="$homebrew_prefix/opt/postgresql@17"
    fi
    postgres_bin="$detected_prefix/bin"
    echo "Install/use the PostgreSQL 17 clients, then retry:" >&2
    echo "  brew install postgresql@17" >&2
    printf '  PATH="%s:$PATH" yarn db:use-live-data%s\n' "$postgres_bin" "$retry_argument" >&2
  elif [[ -d /usr/lib/postgresql/17/bin ]]; then
    echo "Use the installed PostgreSQL 17 clients, then retry:" >&2
    printf '  PATH="/usr/lib/postgresql/17/bin:$PATH" yarn db:use-live-data%s\n' "$retry_argument" >&2
  else
    echo "Install PostgreSQL 17 client tools with the system package manager, put pg_dump and pg_restore 17 or newer on PATH, then retry:" >&2
    printf '  yarn db:use-live-data%s\n' "$retry_argument" >&2
  fi
}

for required_command in psql pg_dump pg_restore dropdb createdb; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "PostgreSQL client preflight failed: $required_command is not installed. No export was taken and the local database was not changed." >&2
    postgres_client_fix
    exit 1
  fi
done

database_major() {
  local label="$1"
  local url="$2"
  local read_only="$3"
  local version_number

  if [[ "$read_only" == "true" ]]; then
    if ! version_number="$(PGOPTIONS='-c default_transaction_read_only=on' psql "$url" --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 -c 'SHOW server_version_num;')"; then
      echo "Could not read the $label PostgreSQL version. No export was taken and the local database was not changed." >&2
      return 1
    fi
  elif ! version_number="$(psql "$url" --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 -c 'SHOW server_version_num;')"; then
    echo "Could not read the $label PostgreSQL version. No export was taken and the local database was not changed." >&2
    return 1
  fi

  version_number="$(printf '%s' "$version_number" | tr -d '[:space:]')"
  if [[ ! "$version_number" =~ ^[0-9]+$ ]]; then
    echo "Could not parse the $label PostgreSQL server_version_num. No export was taken and the local database was not changed." >&2
    return 1
  fi
  printf '%s\n' "$((10#$version_number / 10000))"
}

client_major() {
  local command="$1"
  local version_output

  if ! version_output="$("$command" --version)" || [[ ! "$version_output" =~ ([0-9]+)(\.[0-9]+)? ]]; then
    echo "Could not parse $command --version. No export was taken and the local database was not changed." >&2
    return 1
  fi
  printf '%s\n' "${BASH_REMATCH[1]}"
}

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

if [[ "$destination_url" == *"?"* || "$destination_url" == *"#"* ]]; then
  echo "Refusing a local destination URL with query parameters or a fragment because libpq connection options can override its host. Use the exact URL printed by yarn db:provision." >&2
  exit 1
fi

for routing_variable in PGHOST PGHOSTADDR PGPORT PGDATABASE PGSERVICE PGSERVICEFILE; do
  if [[ -n "${!routing_variable:-}" ]]; then
    echo "Refusing to replace a local destination while $routing_variable is set because libpq environment options can redirect the connection. Unset it and use the exact URL printed by yarn db:provision." >&2
    exit 1
  fi
done

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

production_major="$(database_major "Production" "$production_url" true)"
destination_major="$(database_major "destination" "$destination_url" false)"
dump_major="$(client_major pg_dump)"
restore_major="$(client_major pg_restore)"

if [[ "$production_major" != "$expected_postgres_major" ]]; then
  unset production_url
  echo "Production version contract drift: expected PostgreSQL $expected_postgres_major but found $production_major. No export was taken and the local database was not changed." >&2
  exit 1
fi

if [[ "$destination_major" != "$production_major" ]]; then
  unset production_url
  echo "PostgreSQL version mismatch: Production is $production_major but the local destination is $destination_major. Run yarn db:provision --recreate, update .env with its printed URL, and retry. No export was taken and the local database was not changed." >&2
  exit 1
fi

if (( dump_major < production_major || restore_major < production_major || restore_major < dump_major )); then
  unset production_url
  echo "PostgreSQL client preflight failed: Production is PostgreSQL $production_major, but pg_dump is $dump_major and pg_restore is $restore_major." >&2
  echo "Both tools must be at least PostgreSQL $production_major, and pg_restore must not be older than pg_dump. No export was taken and the local database was not changed." >&2
  postgres_client_fix
  exit 1
fi

echo "Preflight: Production and destination are PostgreSQL $production_major; pg_dump $dump_major and pg_restore $restore_major are compatible."

temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/customermates-live-data.XXXXXX")"
archive="$temporary_directory/snapshot.dump"

echo "[1/6] Exporting Production over a read-only session. Nothing is written to Production."
PGOPTIONS='-c default_transaction_read_only=on' pg_dump "$production_url" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --schema=public \
  --file "$archive"
unset production_url
echo "      Export finished: $(du -h "$archive" | cut -f1) archive written to a temporary file."

echo "[2/6] Verifying the archive before anything is destroyed."
archive_tables="$(pg_restore --list "$archive" | grep -c 'TABLE DATA' || true)"
echo "      Archive is readable and contains $archive_tables tables with data."

echo "[3/6] Dropping and recreating the local database \"$database_name\"."
dropdb --if-exists --force --maintenance-db="$admin_url" "$database_name"
createdb --maintenance-db="$admin_url" "$database_name"
psql "$destination_url" --no-psqlrc --quiet --set=ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS public CASCADE;'
echo "      Recreated. Any data previously in \"$database_name\" is gone."

echo "[4/6] Restoring the snapshot into \"$database_name\". This is the slow step."
pg_restore \
  --exit-on-error \
  --single-transaction \
  --no-owner \
  --no-privileges \
  --dbname "$destination_url" \
  "$archive"
echo "      Restore complete."

echo "[5/6] Disabling webhooks so the copy cannot call customer endpoints."
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

echo "[6/6] Sanitizing stored credentials so the copy cannot authenticate anywhere."
psql "$destination_url" --no-psqlrc --quiet --set=ON_ERROR_STOP=1 <<'SQL'
UPDATE "AuthAccount"
SET "accessToken" = NULL,
    "refreshToken" = NULL,
    "idToken" = NULL,
    "password" = NULL;
UPDATE "OauthApplication" SET "clientSecret" = NULL;
UPDATE "Subscription" SET "lemonSqueezyId" = NULL;
UPDATE "AuthSession" SET "token" = 'disabled-' || "id";
UPDATE "InviteToken" SET "token" = 'disabled-' || "id";
UPDATE "OauthAccessToken"
SET "accessToken" = 'disabled-access-' || "id",
    "refreshToken" = 'disabled-refresh-' || "id";
UPDATE "ConnectedAccount" SET "unipileAccountId" = 'disabled-' || "id";
SQL

live_credentials="$(psql "$destination_url" --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 <<'SQL'
SELECT (SELECT count(*) FROM "AuthAccount" WHERE "accessToken" IS NOT NULL OR "refreshToken" IS NOT NULL OR "idToken" IS NOT NULL OR "password" IS NOT NULL)
     + (SELECT count(*) FROM "OauthApplication" WHERE "clientSecret" IS NOT NULL)
     + (SELECT count(*) FROM "Subscription" WHERE "lemonSqueezyId" IS NOT NULL)
     + (SELECT count(*) FROM "AuthSession" WHERE "token" NOT LIKE 'disabled-%')
     + (SELECT count(*) FROM "InviteToken" WHERE "token" NOT LIKE 'disabled-%')
     + (SELECT count(*) FROM "OauthAccessToken" WHERE "accessToken" NOT LIKE 'disabled-%' OR "refreshToken" NOT LIKE 'disabled-%')
     + (SELECT count(*) FROM "ConnectedAccount" WHERE "unipileAccountId" NOT LIKE 'disabled-%');
SQL
)"
echo "      Provider tokens, session and invite tokens, OAuth secrets, billing and messaging account ids replaced."
echo "      Verification: $live_credentials usable credentials remain in the copy."

if [[ "$live_credentials" != "0" ]]; then
  echo "Sanitization did not clear every credential. Refusing to leave the copy in that state." >&2
  exit 1
fi

if [[ "$apply_migrations" == "true" ]]; then
  echo "Applying migrations the snapshot has not seen yet."
  DATABASE_URL="$destination_url" DIRECT_URL="$destination_url" npx --no-install prisma migrate deploy
fi

rm -rf .next/workflow-data
echo ""
echo "Done. \"$database_name\" on $destination_hostport now holds a copy of Production."
echo "Restart the dev server so it reconnects, then destroy this database when the investigation ends."
