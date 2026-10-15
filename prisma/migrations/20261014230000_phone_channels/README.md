# Phone numbers become channel identities

`migration.sql` retires the `phone` field type. Phone numbers live in a list's Channels field as phone identities
(provider `phone`, channel class `phone`): they can be called, they match WhatsApp conversations from the same number,
and one number is one identity of the workspace, linked to every record that has it. It is an ordinary Prisma
migration that runs with `prisma migrate deploy` as one implicit transaction; a refusal or an interruption leaves the
database as it was. Re-running it changes nothing. It runs on PostgreSQL 16 and 17 and does not need pgvector. To run it
by hand: `psql --single-transaction --set ON_ERROR_STOP=1 -f migration.sql`.

## Steps

| Step | Work |
| --- | --- |
| Locks | Takes the record engine's lock of every workspace (in id order) before it locks any table, so a write of the previous release that already holds its workspace's lock finishes first instead of deadlocking with the migration. |
| 1 Identity providers | `RecordIdentity.provider` gets its own enum `RecordIdentityProvider`: the messaging providers plus `phone`, so `phone` can never become a connectable messaging account. An assignment cast from `MessagingProvider` keeps the previous release's identity writes working, see [The previous release](#the-previous-release). |
| 2 Phone fields | Converts every phone field of every workspace's current record model as described below, in one new configuration revision per affected workspace. |
| 3 Guard | Adds the check constraint `RecordFieldDefinition_valueType_not_phone`, so an older application version that still serves requests during the deployment cannot create a phone field afterwards. |

## What moves into Channels

For every phone field Channels can take over:

- Every number (single or multiple values, records in Trash included) becomes a phone identity linked to the record.
  A number that already exists in the workspace, also as a WhatsApp identity, is reused; it keeps its provider.
- A list without a Channels field gets one after its other fields: named `Channels`, or the first free
  `Channels (n)` from 2 on when a field (also one in Trash) has that name, input behavior, provider avatar off.
- The phone field is removed with its values. Saved views (also those in Trash), personal layouts, record detail
  layouts and widget measures lose their references to it the way a field deletion cleans them: columns, widths and
  hidden columns, filters, the sort, a grouping by the field, related filters and group filters that use it, and a
  widget grouping by the field (the widget then shows the total).
- A required setting or a default value of the phone field does not carry over: Channels has neither.

The workspace's configuration history shows one entry by the system (`system:phone-channels-upgrade`) naming each
change: the new Channels field, each removed phone field and each phone field kept as text. No record events are
written, so no routine or webhook runs. A background record operation of an affected workspace that was still running
ends as failed with `recordSchemaChanged`; its owner can start it again.

## What stays a text field

A phone field Channels cannot take over becomes a text field with all its values and loses its click action. The
reason is the first that applies:

| Reason (in the notice) | Case |
| --- | --- |
| field in Trash | The phone field is in Trash; as text it stays restorable. |
| list in Trash | Its list is in Trash. |
| sub-list | Its list is a sub-list (embedded), where Channels is not allowed. |
| calculated field | It is a formula, lookup, rollup or snapshot. |
| name field of the list | It names the list's records. |
| used by a calculation | A calculation (also one in Trash) or a snapshot trigger uses it. |
| used by a binding | A capability binding uses it. |
| used by a routine or webhook | A record trigger of a routine or webhook uses it. |
| Channels field in Trash | The list's Channels field is in Trash, and a list has at most one. |
| values that are not phone numbers | A stored value is not an E.164 number. |

## Notices and counts

The deployment log shows one notice per field kept as text and a summary with the counts:

```text
NOTICE:  Phone field <field id> of list <list id> in workspace <workspace id> stays a text field: <reason>
NOTICE:  Phone fields: <n> moved into Channels with <n> numbers on <n> records (<n> new Channels fields), <n> kept as text
```

Notices name ids only, never labels or values.

## Before deploying

This read-only inventory lists every phone field of the current record models with the reason it would stay a text
field (empty when it moves into Channels) and how many records hold a value. Count the rows per reason for the
figures the deployment will report.

```sql
WITH current AS (
  SELECT state."companyId" AS company_id, revision.snapshot
  FROM "RecordSchemaState" state
  JOIN "RecordSchemaRevision" revision ON revision."companyId" = state."companyId" AND revision.revision = state.revision
), phone AS (
  SELECT current.company_id, current.snapshot, field.value AS field, list.value AS list
  FROM current
  CROSS JOIN LATERAL jsonb_array_elements(current.snapshot -> 'fields') AS field(value)
  LEFT JOIN LATERAL (
    SELECT list.value FROM jsonb_array_elements(current.snapshot -> 'types') AS list(value)
    WHERE list.value ->> 'id' = field.value ->> 'typeId'
  ) list ON true
  WHERE field.value ->> 'valueType' = 'phone'
)
SELECT phone.company_id, phone.field ->> 'typeId' AS list_id, phone.field ->> 'id' AS field_id,
  CASE
    WHEN coalesce((phone.field ->> 'archived')::boolean, false) THEN 'field in Trash'
    WHEN phone.list IS NULL OR coalesce((phone.list ->> 'archived')::boolean, false) THEN 'list in Trash'
    WHEN coalesce((phone.list ->> 'embedded')::boolean, false) THEN 'sub-list'
    WHEN phone.field #>> '{behavior,kind}' IS DISTINCT FROM 'input' THEN 'calculated field'
    WHEN phone.list ->> 'primaryFieldId' = phone.field ->> 'id' THEN 'name field of the list'
    WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(phone.snapshot -> 'fields') AS other(value)
      WHERE other.value ->> 'id' <> phone.field ->> 'id'
        AND (other.value -> 'behavior')::text LIKE '%' || (phone.field ->> 'id') || '%'
    ) THEN 'used by a calculation'
    WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(phone.snapshot -> 'capabilities', '[]'::jsonb)) AS binding(value)
      CROSS JOIN LATERAL jsonb_array_elements(binding.value -> 'fields') AS entry(value)
      WHERE entry.value ->> 'fieldId' = phone.field ->> 'id'
    ) THEN 'used by a binding'
    WHEN EXISTS (
      SELECT 1 FROM "RecordEventSubscription" subscription
      WHERE subscription."companyId" = phone.company_id
        AND (phone.field ->> 'id' = ANY (subscription."changedFieldIds")
          OR subscription.query::text LIKE '%' || (phone.field ->> 'id') || '%'
          OR subscription.sources::text LIKE '%' || (phone.field ->> 'id') || '%')
    ) OR EXISTS (
      SELECT 1 FROM "Routine" routine
      WHERE routine."companyId" = phone.company_id
        AND routine."triggerFilters"::text LIKE '%' || (phone.field ->> 'id') || '%'
    ) THEN 'used by a routine or webhook'
    WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(phone.snapshot -> 'fields') AS other(value)
      WHERE other.value ->> 'typeId' = phone.field ->> 'typeId' AND other.value ->> 'valueType' = 'channels'
        AND coalesce((other.value ->> 'archived')::boolean, false)
    ) THEN 'Channels field in Trash'
    WHEN EXISTS (
      SELECT 1 FROM "RecordValue" value
      CROSS JOIN LATERAL unnest(CASE WHEN value."textValue" IS NOT NULL THEN ARRAY[value."textValue"] ELSE value."textListValue" END) AS number
      WHERE value."companyId" = phone.company_id AND value."typeId" = phone.field ->> 'typeId'
        AND value."fieldId" = phone.field ->> 'id' AND value.state = 'value'
        AND btrim(number) !~ '^\+[1-9][0-9]{6,14}$'
    ) THEN 'values that are not phone numbers'
  END AS kept_as_text_because,
  (
    SELECT count(*)::integer FROM "RecordValue" value
    WHERE value."companyId" = phone.company_id AND value."typeId" = phone.field ->> 'typeId'
      AND value."fieldId" = phone.field ->> 'id' AND value.state = 'value'
  ) AS records_with_values
FROM phone
ORDER BY phone.company_id, list_id, field_id;
```

## Refusals

The migration checks its own result before it commits and rolls everything back with one of these messages, which
point to a defect of the migration rather than to the data. Report them:

- `A phone number was not linked to its record`
- `A phone field is still stored`
- `A changed field definition does not match its record model`

A lock that is not granted within 60 seconds also rolls the migration back, for example while a long import holds its
workspace. The database then stays as it was, but Prisma records the migration as failed and refuses every further
`prisma migrate deploy` (P3009) until it is marked as rolled back. Mark it once, then deploy again, after a lock
timeout preferably while fewer people work:

```bash
npx prisma migrate resolve --rolled-back 20261014230000_phone_channels
```

## The previous release

`scripts/vercel-build.sh` migrates before the new release is built, so the previous release keeps serving requests on
the migrated database until the new one takes over, and an instant rollback runs it again. It writes identity
providers as `MessagingProvider` values: its record writes cast them with `::"MessagingProvider"` and its Prisma client
with `CAST(… AS "MessagingProvider")`. The cast `MessagingProvider → RecordIdentityProvider` (`WITH INOUT AS
ASSIGNMENT`, created by step 1) converts such a value when it is stored; every messaging provider is also an identity
provider. The previous release never compares providers, so it needs no other cast, and it cannot create phone fields
(step 3). It cannot read a `phone` identity, though: its identity schema refuses the provider, so opening, listing,
exporting or saving a record that has a phone number in Channels fails there. Deploy while few people work, and roll
back past this release only together with a database backup from before the migration.

Drop the cast in a later migration once no deployment older than this release can run against the database again, at
the latest in the migration that removes a value from `MessagingProvider` or drops the type:

```sql
DROP CAST IF EXISTS ("MessagingProvider" AS "RecordIdentityProvider");
```
