#!/bin/bash

set -e  # Exit on error

# Check if company ID is provided as argument
if [[ $# -ne 1 ]]; then
  echo "❌ Error: Company ID is required."
  echo "Usage: $0 <company_id>"
  echo "Example: $0 19389c8e-db5d-4c6e-bf45-7cd04a8e8842"
  exit 1
fi

COMPANY_ID="$1"
echo "🎯 Cleaning local database to keep only data for company: $COMPANY_ID"

if [[ -f .env ]]; then
  export $(grep -v '^#' .env | xargs)
else
  echo "Error: .env file not found."
  exit 1
fi

if [[ -z "$DATABASE_URL" ]]; then
  echo "Error: DATABASE_URL is not set."
  exit 1
fi

if ! command -v psql &> /dev/null; then
  echo "Error: psql command not found. Make sure PostgreSQL is installed."
  exit 1
fi

echo "🧹 Cleaning local database..."

# Get all tables that have a companyId column
echo "🔍 Discovering tables with companyId column..."
TABLES_WITH_COMPANY_ID=$(psql "$DATABASE_URL" -t -c "
  SELECT table_name 
  FROM information_schema.columns 
  WHERE column_name = 'companyId' 
    AND table_schema = 'public'
  ORDER BY table_name;
" | tr -d ' ')

echo "📋 Found tables with companyId:"
echo "$TABLES_WITH_COMPANY_ID" | while read -r table; do
  if [[ -n "$table" ]]; then
    echo "  - $table"
  fi
done

# Disable foreign key constraints using a more effective method
echo "🔓 Disabling foreign key constraints for force delete..."
psql "$DATABASE_URL" -c "SET session_replication_role = 'replica';"

# Also disable triggers on all tables to be extra safe
echo "🔓 Disabling triggers on all tables..."
psql "$DATABASE_URL" -c "
  DO \$\$
  DECLARE
    r RECORD;
  BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
      EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' DISABLE TRIGGER ALL';
    END LOOP;
  END \$\$;
"

# Force delete from all tables with companyId (ignoring constraints)
echo "🗑️  Force deleting data from tables with companyId..."
echo "$TABLES_WITH_COMPANY_ID" | while read -r table; do
  if [[ -n "$table" ]]; then
    echo "  Force deleting from $table..."
    psql "$DATABASE_URL" -c "DELETE FROM \"$table\" WHERE \"companyId\" != '$COMPANY_ID';" || true
  fi
done

# Delete other companies (this should work now since all related data is gone)
echo "🗑️  Deleting other companies..."
psql "$DATABASE_URL" -c "DELETE FROM \"Company\" WHERE \"id\" != '$COMPANY_ID';"

# Re-enable triggers and constraints
echo "🔒 Re-enabling foreign key constraints and triggers..."
psql "$DATABASE_URL" -c "SET session_replication_role = 'origin';"

# Re-enable triggers on all tables
psql "$DATABASE_URL" -c "
  DO \$\$
  DECLARE
    r RECORD;
  BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
      EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ENABLE TRIGGER ALL';
    END LOOP;
  END \$\$;
"

echo "🔑 Updating all users' oAuthProvider to 'oauth-mock-provider'..."
psql "$DATABASE_URL" -c "UPDATE \"User\" SET \"oAuthProvider\" = 'oauth-mock-provider';"

echo ""
echo "✅ Database cleaned successfully!"
echo "🎯 Contains only data for company: $COMPANY_ID"
echo "🚀 Database is ready for use!"
