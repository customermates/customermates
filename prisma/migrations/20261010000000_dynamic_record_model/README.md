# Dynamic record model migration

`migration.sql` is the one migration of the dynamic record model release (PR #203). It contains every migration
of the release as one section each, in their original order, so the release applies or rolls back as a whole.

```sh
prisma migrate deploy
```

Prisma sends the file to PostgreSQL as one batch, which PostgreSQL executes as one implicit transaction: a refusal,
an error or an interruption anywhere leaves the database exactly at the previous release, with no partial section
applied. There is no `BEGIN`/`COMMIT` in the file. Run by hand with
`psql --single-transaction --set ON_ERROR_STOP=1 -f migration.sql`.

## Sections

| # | Former migration | Work |
| --- | --- | --- |
| 1 | `20261004000000_configurable_records` | Configurable records: convert the legacy CRM tables into generic records (validation, expansion, data, configuration, calculations, reconciliation, removal) |
| 2 | `20261006130000_remove_legacy_record_permissions` | Remove the legacy per-entity role permissions and normalise the remaining grants |
| 3 | `20261006200000_p13n_settings` | Personalisation settings column |
| 4 | `20261007000000_field_currency` | Field currency: store the currency on every money field definition |
| 5 | `20261007010000_widget_dashboard_views` | Widget dashboard views |
| 6 | `20261007020000_unique_config_names` | Unique configuration names: make list, field and relationship names unique per workspace |
| 7 | `20261007040000_activity_sources` | Activity sources: per-relationship switches for messages on the source and target record |
| 8 | `20261009000000_trash` | Trash: TrashItem table, deletedAt columns and partial indexes (schema only) |
| 9 | `20261009010000_search_catalog` | Search catalog for the command palette (names only, optional pgvector embedding) |
| 10 | `20261009020000_search_catalog_claims` | Search catalog indexing claims |
| 11 | `20261009030000_trash_configuration_backfill` | Trash configuration backfill: one Trash item for every list, field, relationship and Channels field already deleted (data only) |
| 12 | `20261009120000_channels_field` | Channels field: turn every Channels capability into a field of its list and re-key layouts, views and Trash entries (data, plus the TrashKind enum) |
| 13 | `20261009150000_record_rank` | Manual record order (CrmRecord.rank) |
| 14 | `20261009180000_calculation_draft_usage` | Agent usage purpose: calculation drafts |
| 15 | `20261009200000_command_resolve_usage` | Agent usage purpose: command resolution |
| 16 | `20261010000000_sidebar_entries` | Sidebar entries: convert each saved sidebar layout from sections to one entry list (data only) |
| 17 | `20261010000000_webhook_paused_reason` | Webhook paused reason: why a webhook was paused, shown when its only trigger field is deleted |

Each section starts with a `-- @section <former migration name>` line. Section 1 sets the transaction time zone to
UTC, which also applies to the later sections. Section 8 is additive (new table, nullable columns, partial indexes)
and changes no existing row. Section 9 creates the search catalog table; it creates the `vector` extension and the
`embedding vector(768)` column when pgvector is available, and without pgvector it skips the column so command
search stays keyword only. Section 10 adds one nullable column. Section 11 inserts one Trash item for every list,
field, relationship and Channels field that is already deleted, as the former Recently deleted page listed them,
expiring 30 days after the migration; a second run inserts nothing. Section 12 turns every Channels capability into
a Channels field of its list (same id, appended last, archived when disabled), re-keys `system:channels` in
snapshots, changes, type defaults, saved views and personal layouts, turns Trash entries of the retired kind
channels into field entries and recreates `TrashKind` without channels; it leaves identities untouched and a second
run changes nothing. Section 13 adds one nullable column. Section 14 adds an enum value that nothing in this file
uses, so adding it inside the transaction is safe. Section 15 adds an enum value that nothing in this file uses, so
adding it inside the transaction is safe. Section 16 rewrites saved sidebar layouts (`P13n` rows with `p13nId =
sidebar`) from `sections` to `entries`, dropping the retired workspace and admin sections; a second run changes
nothing. Section 17 adds one nullable column.

## Recovery

After a refusal, fix the reported rows, mark the failed attempt as rolled back and deploy again:

```sh
prisma migrate resolve --rolled-back 20261010000000_dynamic_record_model
prisma migrate deploy
```

## Databases that applied the former migrations

Development, slot and test databases created from the integration branch before this file existed recorded the
former migrations in `_prisma_migrations` and already have their schema. `prisma migrate deploy` would try to apply
this file again on them and fail. Recreate them from scratch (`prisma migrate reset`, or drop and deploy), or, if the
database already matches `prisma/schema.prisma`, record this file as applied:

```sh
prisma migrate resolve --applied 20261010000000_dynamic_record_model
```

Production and self-hosted installations of the previous release have none of the former migrations and apply this
file normally.

## Section 1: configurable records

`migration.sql` converts the legacy CRM tables (contacts, organizations, deals, services, tasks, their custom columns, links, assignments, identifiers and line items) into configurable records, then removes the legacy storage. It preserves the CRM data only. It is an ordinary Prisma migration: there is no separate tool, script or manual step.

```sh
prisma migrate deploy
```

The production build (`scripts/vercel-build.sh`) and the self-hosted image (`Dockerfile`) already run this command. Prisma sends the file to PostgreSQL as one batch, which PostgreSQL executes as one implicit transaction, so the upgrade is all-or-nothing. The file intentionally has no `BEGIN`/`COMMIT`: an explicit block would leave Prisma's connection aborted after a refusal and hide the refusal message. To run the file by hand, use `psql --single-transaction --set ON_ERROR_STOP=1 -f migration.sql`.

It runs on PostgreSQL 16 and 17. It requires the `pg_trgm` extension (created if missing) and ICU collations.

### What is preserved

| Legacy data | Result |
| --- | --- |
| Contacts, organizations, deals, services, tasks | Records of the five starter types with their IDs, `createdAt` and `updatedAt`. One ID may exist in several types. |
| Pending membership authorisation tasks | Protected tasks (`protectedKind = membershipAuthorization`) that keep their related member |
| Names, contact name parts, avatars, notes, service prices | Typed values; notes keep their document, prices their exact decimal |
| Custom columns and their values | Fields of their type with the same IDs, trimmed labels, options, default option, format and currency; values with exact decimals, dates with their lexical form and ranges with both endpoints |
| Links between records | Record links with their IDs and timestamps |
| Deal services (`ServiceDeal`) | Embedded line items with the same IDs, their exact quantity and live pricing (no saved price) |
| Assignees | Record assignments with their creation time |
| Contact identifiers | Channel identities with the same IDs, their lookup aliases and their contact association |
| Role permissions on the five legacy resources | Per-type grants |
| Conversation participants | The normalised lookup key that matches them to channel identities |

Every workspace gets the starter record model with deterministic preset IDs as configuration revision 1 (actor `system:configurable-records-upgrade`): the five starter types and line items, without the preset stage field because legacy stages are custom columns. The weighted value reads the probability of the option selected in `Company.dealWeightingColumnId`, which also groups the deal list by default. Deal value, quantity and weighted value are published summaries, so whoever can read a deal keeps seeing its totals without access to the services behind them, as before. Explicit conversation-to-record links start empty: the legacy schema had none.

### What is not carried over

- Saved views and personalisation of the legacy record surfaces (`<type>s-card-store`, `<type>-detail`), of the entity timeline and of the audit log page (`audit-logs-card-store`). Views and personalisation of other surfaces stay.
- Every dashboard widget.
- The audit log (`AuditLog`). Record, configuration and administrative history starts at the upgrade in the new event log (`EventLog`). The exceptions are the legal-consent evidence (every `legal.documents_accepted` and `legal.notice_sent` row) and the connected account history (every `connected_account.*` row, which the operator console's channel usage reads): they move into `EventLog` with their id, actor (`actorId` = `userId`), entity (`subjectId` = `entityId`), time and payload (`eventData.payload`), with the event prefix as subject kind (`legal`, `connected_account`) and already delivered, so they never reach a webhook or routine. The reconciliation compares every copied row with its source before `AuditLog` is dropped.
- Legacy record event triggers. Every webhook and every event-triggered routine is disabled. Legacy record events (`contact.created` and so on) are removed from every webhook and routine, and a routine that had such events also loses its filters. Watched fields (`Routine.changedFields`) only applied to legacy events and are dropped from every routine. Scheduled routines keep their schedule and enabled state; a schedule never read their leftover events. Past routine runs triggered by a legacy event keep their outcome and charge but lose the legacy trigger event, record ID and payload. No routine or webhook subscribes to record events after the upgrade; re-enable them after choosing record triggers again.
- Entity terminology presets: types keep their starter labels.

No record events are written, so no routine run or webhook delivery is emitted. Existing webhook delivery rows stay with their status, code and time, but they are not bound to an event: their stored legacy body is no longer shown and they cannot be resent, and completed deliveries are never replayed.

### What the sections do

| Section | Work |
| --- | --- |
| 0 Locks | Takes every workspace's record advisory lock, locks the legacy tables exclusively and the other changed tables against writes, and refreshes planner statistics. Refuses a database that already has generic record storage. |
| 1 Validation | Builds each workspace's record model and checks every legacy row the conversion depends on. All refusals are collected and reported together as `Table.field code xCOUNT` with the number of affected workspaces; row contents are never printed. Converted custom values are staged in a temporary table. |
| 2 Expansion | Creates the generic storage in its final shape and the new columns of existing tables. |
| 3 Data | Copies records, typed values, notes, links, assignments, channel identities with aliases and record associations, and participant lookup keys. |
| 4 Configuration | Writes revision 1, the schema state and the grants, removes the legacy presentation state, widgets and history, and disables the automations as described above. Section 4b builds the secondary indexes. |
| 5 Calculations | Materialises contact names, line prices and amounts, deal value and quantity rollups and weighted values with exact decimals, plus their provenance rows. Section 5b adds the foreign keys, which validates every converted row. |
| 6 Reconciliation | Recomputes the CRM data independently from the legacy rows (records, timestamps, protected tasks, assignments, built-in and custom values, prices, quantities, totals, weighted values, links, identities, aliases, provenance, workspace state, the link repair and the carried-over legal-consent and connected account events) and refuses on any mismatch. |
| 7 Removal | Drops the 22 legacy tables and `AuditLog`, `Company.dealWeightingColumnId`, `Routine.changedFields`, the legacy widget columns, the legacy enums and range functions, and the temporary helpers, never with `CASCADE`. |

An empty database (a new installation) passes the data sections without work and ends with exactly the schema in `prisma/schema.prisma`. A second `prisma migrate deploy` applies nothing.

### Calculations

| Field | Value |
| --- | --- |
| Contact name | `trim(firstName + " " + lastName)` with JavaScript whitespace trimming |
| Line unit price | the linked service's price (every migrated line item is priced live; saved prices start empty) |
| Line amount | quantity × unit price |
| Deal value | sum of its line amounts; 0 in the workspace currency without lines |
| Deal quantity | sum of its line quantities; 0 without lines |
| Weighted value | value × probability / 100 of the stage option selected in `Company.dealWeightingColumnId`; missing (not 0) without a weighting column, a stage value or a probability; 0 for probability 0 |

Legacy prices and quantities are binary floating point; they are converted through their shortest exact decimal text (`0.1 + 0.2` stays `0.30000000000000004`). A result of 10^35 or more, or with more than 30 decimals, is refused.

### Documented repair

A `link` custom value (each comma-separated part of a multi-value link) that is not an http(s) URL but matches `^[a-z0-9-]+(\.[a-z0-9-]+)+(/\S*)?$` (case-insensitive, after trimming spaces) becomes `https://` followed by the trimmed text. Any other invalid link is refused. The reconciliation recounts the repaired values independently.

### Before deploying

Deployment logs may not show which automations change. Run this read-only inventory before deploying so their owners can review the disabled triggers and removed configuration:

```sql
WITH planned AS (
  SELECT 'Webhook' AS kind, w."companyId", w.id, w.enabled AS enabled_before,
    false AS enabled_after, true AS disabled_by_upgrade,
    ARRAY(SELECT e FROM unnest(w.events) WITH ORDINALITY AS e(e, position)
      WHERE e ~ '^(contact|organization|deal|service|task)\.' ORDER BY position) AS legacy_events_removed,
    ARRAY[]::text[] AS watched_fields_removed, false AS filters_cleared
  FROM "Webhook" w
  UNION ALL
  SELECT 'Routine', r."companyId", r.id, r.enabled,
    r.enabled AND r."triggerKind"::text <> 'event', r."triggerKind"::text = 'event',
    ARRAY(SELECT e FROM unnest(r."triggerEvents") WITH ORDINALITY AS e(e, position)
      WHERE e ~ '^(contact|organization|deal|service|task)\.' ORDER BY position),
    coalesce(r."changedFields", ARRAY[]::text[]),
    EXISTS (SELECT 1 FROM unnest(r."triggerEvents") e
      WHERE e ~ '^(contact|organization|deal|service|task)\.') AND r."triggerFilters" IS DISTINCT FROM '[]'::jsonb
  FROM "Routine" r
  WHERE r."triggerKind"::text = 'event'
    OR cardinality(r."changedFields") > 0
    OR EXISTS (SELECT 1 FROM unnest(r."triggerEvents") e
      WHERE e ~ '^(contact|organization|deal|service|task)\.')
)
SELECT *, enabled_before IS DISTINCT FROM enabled_after
  OR cardinality(legacy_events_removed) > 0
  OR cardinality(watched_fields_removed) > 0
  OR filters_cleared AS state_changes
FROM planned
ORDER BY kind, "companyId", id;
```

`disabled_by_upgrade` identifies every webhook and event-triggered routine, including ones already disabled. `enabled_after` preserves the enabled state of scheduled routines. Scheduled routines are also listed when they lose legacy events or watched fields; their schedules keep running. `legacy_events_removed`, `watched_fields_removed` and `filters_cleared` describe that cleanup. `state_changes` distinguishes rows whose automation state actually changes from an already-disabled webhook with no legacy events. Unchanged scheduled routines are omitted.

### Refusals

Refusals (error code `CRM01`) name the owning table and field, for example `CustomFieldValue.value invalid_typed_value x3`. They cover malformed or unrepresentable decimals, dates and ranges, invalid emails, phone numbers and URLs, unknown select options, invalid column options and definitions, references to records, members or roles of another (or no) workspace, duplicate custom values or identity keys and noncanonical identities.

### Internal errors

Only validated data refusals become the grouped `Table.field code xCOUNT` report. Any other failure during validation is a defect of the migration, not of the data, and is raised as `Configurable record upgrade internal error in <step> (SQLSTATE <code>): <message>` with error code `CRM02` and the PL/pgSQL call chain as detail. Messages of data exceptions (SQLSTATE class 22) are replaced by `data exception` because they can quote a value. Report such errors; they cannot be fixed by changing legacy data.

### Recovery

A refusal, a failed reconciliation, a lock timeout (60 seconds per lock) or an interrupted connection rolls the whole migration back; no legacy row is changed. Prisma then records the migration as failed and refuses further deployments until it is resolved:

1. Read the refusal in the deployment log.
2. Correct the reported legacy rows.
3. `prisma migrate resolve --rolled-back 20261010000000_dynamic_record_model`
4. `prisma migrate deploy`

### Rehearsal

Rehearse on a disposable copy of the production database before deploying:

1. Restore the copy into a disposable PostgreSQL database of the production major version.
2. Run `prisma migrate deploy` against it and keep the log.
3. On a refusal, follow the recovery steps on the copy until the deployment succeeds; apply the same corrections to production before deploying there.

The migration holds the locks above for its whole transaction, so CRM writes wait until it finishes. It disables just-in-time compilation for its transaction (`SET LOCAL jit = off`): the conversion runs many small statements per workspace, and compiling each of them costs far more than it saves.
