# Configurable-record upgrade

The versioned upgrade converts legacy contacts, organizations, deals, services, tasks, their links, presentation state, and event subscriptions into the configurable record model. It preserves legacy identities and keeps the old tables for historical reads and reconciliation. New workspaces initialize directly with `RecordSchemaState.storageMode = generic`.

Run this only against a disposable, loopback PostgreSQL database while validating the change. `scripts/migrate-records-local.ts` rejects other hosts and requires `--database` to match the database URL exactly. The application must not be serving the database during the initial backfill. The sequence is:

```sh
node --env-file=.env node_modules/.bin/tsx scripts/assert-local-database-url.ts
node --env-file=.env node_modules/.bin/tsx scripts/migrate-records-local.ts --mode preflight --database <local-database>
node --env-file=.env node_modules/.bin/tsx scripts/migrate-records-local.ts --mode backfill --database <local-database>
node --env-file=.env node_modules/.bin/tsx scripts/migrate-records-local.ts --mode reconcile --database <local-database>
node --env-file=.env node_modules/.bin/tsx scripts/migrate-records-local.ts --mode finalize --database <local-database>
```

Use `--output <path>` to keep each report separately. Stop if a report has `valid: false`; it names blocking rows and fields. The backfill and finalize steps are rerunnable. Finalization acquires a session-level workspace advisory lock, runs reconciliation under that lock, then changes `storageMode` from `backfilled` to `generic` and writes immutable checkpoint 7 in one transaction. It refuses an active operation, a changed schema revision, or missing checkpoints. A second finalize reports `alreadyGeneric` and does not repeat writes. Generic workspaces created after the rebuild are skipped by the legacy migration.

The finalization switch does not drop old tables. Contracting those tables requires an independent inventory of remaining historical readers and system consumers. Restoring a test snapshot requires its matching application commit; reverting only the application after new generic records have been created is not a valid rollback.
