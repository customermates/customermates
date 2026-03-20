#!/bin/bash

set -e  # Exit on error

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
else
  echo "Error: .env file not found."
  exit 1
fi

if [[ -z "$DATABASE_URL_PROD" || -z "$DATABASE_DIRECT_URL_PROD" || -z "$DATABASE_URL" ]]; then
  echo "Error: DATABASE_URL_PROD, DATABASE_DIRECT_URL_PROD, or DATABASE_URL is not set."
  exit 1
fi

if ! command -v pg_dump &> /dev/null || ! command -v psql &> /dev/null; then
  echo "Error: pg_dump or psql command not found. Make sure PostgreSQL is installed."
  exit 1
fi

DB_NAME=$(echo $DATABASE_URL | sed -E 's/.*\/([^?]*).*/\1/')

# Create dumps directory if it doesn't exist
mkdir -p dumps

# Check if there are existing dumps
EXISTING_DUMPS=$(ls dumps/*_prod_schema.sql 2>/dev/null | wc -l)

USE_EXISTING=false
if [ "$EXISTING_DUMPS" -gt 0 ]; then
  # Find the latest dump files
  LATEST_SCHEMA=$(ls -t dumps/*_prod_schema.sql 2>/dev/null | head -n 1)
  LATEST_DATA=$(ls -t dumps/*_prod_data.sql 2>/dev/null | head -n 1)
  LATEST_TIMESTAMP=$(basename "$LATEST_SCHEMA" | sed 's/_prod_schema.sql//')
  
  echo "📁 Found existing dumps. Latest: $LATEST_TIMESTAMP"
  echo "🤔 Do you want to:"
  echo "  1) Use existing dumps (faster)"
  echo "  2) Download fresh dumps from production"
  echo ""
  read -p "Enter your choice (1 or 2): " choice
  
  case $choice in
    1)
      USE_EXISTING=true
      SCHEMA_FILE="$LATEST_SCHEMA"
      DATA_FILE="$LATEST_DATA"
      echo "✅ Using existing dumps from $LATEST_TIMESTAMP"
      ;;
    2)
      USE_EXISTING=false
      echo "📡 Will download fresh dumps from production"
      ;;
    *)
      echo "❌ Invalid choice. Defaulting to download fresh dumps."
      USE_EXISTING=false
      ;;
  esac
else
  echo "📁 No existing dumps found. Will download fresh dumps from production."
fi

# Generate timestamp for new dump files (only if not using existing)
if [ "$USE_EXISTING" = false ]; then
  TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
  SCHEMA_FILE="dumps/${TIMESTAMP}_prod_schema.sql"
  DATA_FILE="dumps/${TIMESTAMP}_prod_data.sql"
fi

echo "🧹 Recreating local database..."
psql $(echo $DATABASE_URL | sed -E 's/\/[^\/]*(\?.*)?$/\/postgres\1/') -c "DROP DATABASE IF EXISTS \"$DB_NAME\";"
psql $(echo $DATABASE_URL | sed -E 's/\/[^\/]*(\?.*)?$/\/postgres\1/') -c "CREATE DATABASE \"$DB_NAME\";"

if [ "$USE_EXISTING" = false ]; then
  echo "📊 Exporting schema from production database..."
  pg_dump "$DATABASE_URL_PROD" --schema-only --no-owner --no-comments \
    --schema=public \
    --no-privileges \
    -f "$SCHEMA_FILE"

  echo "📡 Exporting data from Supabase production database..."
  pg_dump "$DATABASE_URL_PROD" --data-only --no-owner --no-comments \
    --schema=public \
    --column-inserts \
    -f "$DATA_FILE"
else
  echo "📁 Using existing dump files..."
fi

echo "🔄 Applying production schema to local database..."
psql "$DATABASE_URL" -f "$SCHEMA_FILE"

echo "📥 Importing data into local database..."
# Disable triggers temporarily to avoid foreign key issues
psql "$DATABASE_URL" -c "SET session_replication_role = 'replica';"
# Import data with error handling
psql "$DATABASE_URL" -f "$DATA_FILE" || echo "⚠️ Some data couldn't be imported, but continuing..."
# Re-enable triggers
psql "$DATABASE_URL" -c "SET session_replication_role = 'origin';"

echo "⚙️ Applying only pending migrations..."
npx prisma migrate deploy

if [ "$USE_EXISTING" = false ]; then
  echo "💾 New database dumps saved:"
  echo "  Schema: $SCHEMA_FILE"
  echo "  Data: $DATA_FILE"
else
  echo "💾 Used existing database dumps:"
  echo "  Schema: $SCHEMA_FILE"
  echo "  Data: $DATA_FILE"
fi

echo "✅ Database sync complete! 🎉"
