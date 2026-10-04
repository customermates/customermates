# Configurable records upgrade

`migration.sql` converts the legacy CRM tables (contacts, organizations, deals, services, tasks, their custom columns, links, assignments, identifiers, line items, saved views, personalisation, dashboard widgets, routine and webhook triggers and terminology) into configurable records, then removes the legacy storage. It is an ordinary Prisma migration: there is no separate tool, script or manual step.

```sh
prisma migrate deploy
```

The production build (`scripts/vercel-build.sh`) and the self-hosted image (`Dockerfile`) already run this command. Prisma sends the file to PostgreSQL as one batch, which PostgreSQL executes as one implicit transaction, so the upgrade is all-or-nothing. The file intentionally has no `BEGIN`/`COMMIT`: an explicit block would leave Prisma's connection aborted after a refusal and hide the refusal message. To run the file by hand, use `psql --single-transaction --set ON_ERROR_STOP=1 -f migration.sql`.

It runs on PostgreSQL 16 and 17. It requires the `pg_trgm` extension (created if missing) and ICU collations.

## What the sections do

| Section | Work |
| --- | --- |
| 0 Locks | Takes every workspace's record advisory lock, locks the legacy tables exclusively and the converted presentation, trigger and messaging tables against writes, and refreshes planner statistics. Refuses a database that already has generic record storage. |
| 1 Validation | Builds each workspace's record model and checks every legacy row the conversion depends on. All refusals are collected and reported together as `Table.field code xCOUNT` with the number of affected workspaces; row contents are never printed. Converted values and presentation rows are staged in temporary tables. |
| 2 Expansion | Creates the generic storage in its final shape (types, fields, relationships, records, typed values, provenance, links, assignments, grants, revisions, operations, events, subscriptions, identities, conversation links) and the new columns of existing tables. |
| 3 Data | Copies records with their IDs and timestamps (line items keep their `ServiceDeal` IDs; one ID may exist in several types), typed values, notes, links, assignments, channel identities with aliases and record associations, and participant lookup keys. No record events are written, so no routine or webhook delivery is emitted. |
| 4 Configuration | Writes the configuration history (revision 1 legacy model, 2 activity paths, 3 presentation, 4 terminology when it changes a label, then Channels), grants, converted saved views, personalisation, widgets, timeline views, routine and webhook subscriptions, and sets every workspace to `storageMode = generic`. Section 4b builds the secondary indexes. |
| 5 Calculations | Materialises contact names, line prices and amounts, deal value and quantity rollups and weighted values with exact decimals, plus their provenance rows. Section 5b adds the foreign keys, which validates every converted row. |
| 6 Reconciliation | Recomputes the result independently from the legacy rows (records, timestamps, protected tasks, assignments, built-in and custom values, prices, quantities, totals, weighted values, links, identities, aliases, provenance, workspace state, triggers, presentation, repairs) and refuses on any mismatch. |
| 7 Removal | Drops the 22 legacy tables, `Company.dealWeightingColumnId`, the legacy widget columns, the legacy enums and range functions, and the temporary helpers, never with `CASCADE`. |

An empty database (a new installation) passes the data sections without work and ends with exactly the schema in `prisma/schema.prisma`. A second `prisma migrate deploy` applies nothing.

## Calculations

| Field | Value |
| --- | --- |
| Contact name | `trim(firstName + " " + lastName)` with JavaScript whitespace trimming |
| Line unit price | the linked service's price (every migrated line item is priced live; saved prices start empty) |
| Line amount | quantity × unit price |
| Deal value | sum of its line amounts; 0 in the workspace currency without lines |
| Deal quantity | sum of its line quantities; 0 without lines |
| Weighted value | value × probability / 100 of the stage option selected in `Company.dealWeightingColumnId`; missing (not 0) without a weighting column, a stage value or a probability; 0 for probability 0 |

Legacy prices and quantities are binary floating point; they are converted through their shortest exact decimal text (`0.1 + 0.2` stays `0.30000000000000004`). A result of 10^35 or more, or with more than 30 decimals, is refused.

## Documented repairs

The retired multi-step upgrade refused the following data. This migration converts it deterministically instead; each repair is recounted independently during reconciliation.

1. **Links without scheme.** A `link` custom value (each comma-separated part of a multi-value link) that is not an http(s) URL but matches `^[a-z0-9-]+(\.[a-z0-9-]+)+(/\S*)?$` (case-insensitive, after trimming spaces) becomes `https://` followed by the trimmed text. Any other invalid link is still refused.
2. **Page sizes.** A saved list page size (`P13n.pagination.pageSize`, `DataView.pageSize`) outside 5, 10, 25 and 100 becomes the largest supported size not above it (1000 becomes 100; anything below 5 becomes 5).
3. **Deleted columns in views.** A UUID that resolves to no field of its record type (a deleted custom column) is removed from saved views and personalisation: filters on it are dropped, columns and widths lose it, and a sort or grouping on it falls back to the default (`null`). Detail layouts drop it from starred, hidden and ordered fields.
4. **Unknown active views.** A list personalisation whose active view is not a converted view of the same member and surface returns to the default view (`activeViewKey = null`).
5. **Deleted select options in filters.** Option values that no longer exist are removed from `in`/`notIn` filters on select fields (views, widgets and routines). A `notIn` left empty is dropped (no record holds a deleted option); an `in` left empty stays and still matches nothing.
6. **Webhook owners.** A webhook whose creator (the single `webhook.created` audit row) is inactive keeps that creator as its subscription owner but is disabled. Without a provable creator, the oldest active system-role member becomes the owner; without one, the webhook is disabled and gets no subscription. No arbitrary other user is chosen.

## Intentional differences from the retired upgrade

- Converted routines keep their watched fields (as field IDs) and filters only in their record event subscription; `Routine.changedFields` and `Routine.triggerFilters` are cleared, because legacy names there would never match generic record events.
- Custom column labels with surrounding whitespace are converted (trimmed from revision 3 on); the retired upgrade refused them through a consistency check between its separately committed steps, which cannot drift in one transaction.
- The migration bookkeeping table `RecordMigrationCheckpoint` and the legacy `custom_field_range_*` functions are not kept.
- Grant actions are stored in enum order.

## Refusals

Refusal codes name the owning table and field, for example `CustomFieldValue.value invalid_typed_value x3` or `Widget.configuration unresolved_presentation_field x1`. They include malformed or unrepresentable decimals, dates and ranges, invalid emails, phone numbers and URLs, unknown select options, invalid column options and definitions, references to records, members, accounts or threads of another (or no) workspace, duplicate custom values or identity keys, noncanonical identities, unsupported legacy filters, sorts, groupings and widget measures, unknown terminology presets, and routines with legacy events but a schedule trigger or an inactive owner.

## Recovery

A refusal, a failed reconciliation, a lock timeout (60 seconds per lock) or an interrupted connection rolls the whole migration back; no legacy row is changed. Prisma then records the migration as failed and refuses further deployments until it is resolved:

1. Read the refusal in the deployment log.
2. Correct the reported legacy rows.
3. `prisma migrate resolve --rolled-back 20261004000000_configurable_records`
4. `prisma migrate deploy`

## Rehearsal

Rehearse on a disposable copy of the production database before deploying:

1. Restore the copy into a disposable PostgreSQL database of the production major version.
2. Run `prisma migrate deploy` against it and keep the log.
3. On a refusal, follow the recovery steps on the copy until the deployment succeeds; apply the same corrections to production before deploying there.
4. Optionally run with `SET crm_upgrade.debug = on` in the session (for example via `psql`) to print the error message of an unexpected conversion failure as a notice. Those messages may quote row contents and must not be shared.

The migration holds the locks above for its whole transaction, so CRM writes wait until it finishes. On the rehearsal hardware a workspace with 50,000 contacts, 20,000 deals, 40,000 line items and 70,000 custom values converted in about three minutes.
