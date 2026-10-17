# Rounding the money calculations of upgraded workspaces

`migration.sql` stores the calculated money values that `20261010000000_dynamic_record_model` materialised with
exact decimals as the record engine rounds them: line unit prices and amounts, deal values and weighted values of
the upgraded workspaces whose record model is still the one the upgrade wrote. The comment at the top of the file
lists what it recomputes and what it leaves alone. It is an ordinary Prisma migration, applied by
`prisma migrate deploy` in the production build and when the self-hosted image starts, and PostgreSQL runs it as one
implicit transaction.

## Locks

The migration tries the record engine's advisory lock of each candidate workspace without waiting for it. A
workspace whose lock a running application transaction holds at that moment is skipped: it keeps the exact values of
the upgrade until its records are next recalculated. The locks it takes are held until it commits, so record writes
in those workspaces wait for it and fail after their usual 5 seconds if it runs longer. Any other lock it needs, such
as a row the application is writing, it waits for at most 5 seconds (`lock_timeout`) and then fails.

## Recovery

A lock timeout, an error or an interrupted connection rolls the whole migration back; no value is changed. Prisma then
records the migration as failed and refuses every further deployment with `P3009` until it is resolved:

1. Read the error in the deployment log.
2. `prisma migrate resolve --rolled-back 20261015100000_round_upgraded_money_calculations`
3. `prisma migrate deploy`

On a self-hosted instance the app container stops at the failed migration. Run the second step as
`docker compose run --rm app npx prisma migrate resolve --rolled-back 20261015100000_round_upgraded_money_calculations`,
then `docker compose up -d` deploys it again. A second run is safe: it rewrites only values that still differ from
the rounded ones.
