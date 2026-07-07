#!/bin/bash

# Check if -f flag is provided
if [ "$1" == "-f" ]; then
    # Force push schema and run seed
    echo "Force pushing schema and running seed..."
    npx prisma db push --force-reset
    npx prisma db seed
else
    echo "Resetting the Prisma database..."
    npx prisma migrate reset --force
    npx prisma db seed
fi

# The workflow engine (workflow / @workflow/world-postgres + graphile-worker) lives in
# its own Postgres schemas that Prisma does not manage. `prisma migrate reset` only
# touches the public schema, so those are left stale and half-migrated across resets,
# which breaks the World (e.g. missing workflow_runs.status). Recreate them from scratch -
# including the World's public-schema enums (status/step_status/wait_status). migrate reset
# does NOT drop those enums, so a previously half-finished workflow:setup otherwise wedges the
# next run with `22P02 invalid input value for enum`.
# Only the Postgres World (local dev + self-hosters) uses these schemas; on Vercel the managed
# workflow runtime is used instead, so skip this there ($VERCEL is set on Vercel build/runtime).
if [ -z "$VERCEL" ]; then
  echo "Resetting the workflow schemas..."
  printf 'DROP SCHEMA IF EXISTS workflow CASCADE;\nDROP SCHEMA IF EXISTS workflow_drizzle CASCADE;\nDROP SCHEMA IF EXISTS graphile_worker CASCADE;\nDROP TYPE IF EXISTS status CASCADE;\nDROP TYPE IF EXISTS step_status CASCADE;\nDROP TYPE IF EXISTS wait_status CASCADE;\n' \
    | npx prisma db execute --stdin
  yarn workflow:setup
fi

echo "Database reset complete!"
echo ""
echo "WARNING: this reset dropped and recreated the workflow schemas. If a dev server was"
echo "running during the reset, its embedded workflow worker has crashed and will NOT recover."
echo "RESTART the dev server now, or backfills and webhook jobs will queue forever."
