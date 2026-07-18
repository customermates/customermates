#!/usr/bin/env bash

set -euo pipefail

echo "Resetting and seeding the configured database..."
npx --no-install prisma migrate reset --force
npx --no-install prisma db seed
rm -rf .next/workflow-data

echo "Database reset complete. Restart a running dev server."
