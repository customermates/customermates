# Configurable-record upgrade

The versioned upgrade converts contacts, organizations, deals, services, tasks, their links, presentation state, and event subscriptions into configurable records. It preserves record identities and timestamps, then removes all 22 obsolete CRM tables and their unused database enums. Historical audit payloads and assistant transcripts remain readable through frozen decoders; they do not depend on those tables or a legacy Prisma client. New workspaces initialize directly with `RecordSchemaState.storageMode = generic`.

Run this only against a disposable, loopback PostgreSQL database while validating the change. `scripts/migrate-records-local.ts` rejects other hosts and requires `--database` to match the database URL exactly. The application must not be serving the database during the initial backfill. The sequence is:

```sh
node --env-file=.env node_modules/.bin/tsx scripts/assert-local-database-url.ts
node --env-file=.env node_modules/.bin/tsx scripts/migrate-records-local.ts --mode expand --database <local-database>
node --env-file=.env node_modules/.bin/tsx scripts/migrate-records-local.ts --mode preflight --database <local-database>
node --env-file=.env node_modules/.bin/tsx scripts/migrate-records-local.ts --mode backfill --database <local-database>
node --env-file=.env node_modules/.bin/tsx scripts/migrate-records-local.ts --mode reconcile --database <local-database>
node --env-file=.env node_modules/.bin/tsx scripts/migrate-records-local.ts --mode finalize --database <local-database>
node --env-file=.env node_modules/.bin/tsx scripts/migrate-records-local.ts --mode prepare-contract --database <local-database>
node --env-file=.env node_modules/prisma/build/index.js migrate deploy
```

The expansion step uses Prisma's migration runner against an isolated temporary copy of the migrations preceding `20261001000000_retire_legacy_crm_storage`. It retains Prisma's normal checksums and migration ledger. Do not run the full migration chain against a populated legacy database before preparing its contraction receipts. An empty installation can run the full chain directly.

Use `--output <path>` to keep each report separately. Stop if a report has `valid: false`; it names blocking rows and fields. The expansion, backfill, finalize, preparation, and native deployment steps are rerunnable. Finalization acquires a session-level workspace advisory lock, runs reconciliation under that lock, then changes `storageMode` from `backfilled` to `generic` and writes immutable checkpoint 7 in one transaction. It refuses an active operation, a changed schema revision, or missing checkpoints. A second finalize reports `alreadyGeneric` and does not repeat writes. Generic workspaces created after the rebuild are skipped by the legacy backfill.

Preparation locks every workspace, verifies reconciliation, migrates naming preferences and timeline view references, and creates checkpoint 8 with a fingerprint of the source data. Native contraction rechecks that fingerprint and the finalized state under locks before removing tables in one transaction. Source drift, active staged operations, or unresolved views, widgets, routines, and webhooks block removal. The follow-up native migration removes the unused enums. Neither uses cascading removal to hide dependencies. Migration backfills do not emit routine or webhook deliveries.

Restoring a test snapshot requires its matching application commit; reverting only the application after new generic records have been created is not a valid rollback. Local synthetic verification does not authorize a production upgrade or establish the cleanliness of an unseen production database.
