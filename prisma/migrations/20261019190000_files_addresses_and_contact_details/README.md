# Record files, addresses, calendars and contact details

`migration.sql` brings a database from the previous release to this one in a single migration. It is an ordinary
Prisma migration that runs with `prisma migrate deploy` as one implicit transaction: a refusal or an interruption
leaves the database as it was. It runs on PostgreSQL 16 and 17; pgvector is optional. To run it by hand:
`psql --single-transaction --set ON_ERROR_STOP=1 -f migration.sql`.

## Steps

| Step | Work |
| --- | --- |
| Locks | Takes the record engine's lock of every workspace (in id order) before it locks any table, so a write of the previous release that already holds its workspace's lock finishes first instead of deadlocking with the migration. A lock that is not granted within 60 seconds rolls everything back. |
| 1 Record files | `RecordFile` (metadata, lifecycle and indexing state of uploaded files, also the files given to Mate in a chat, which stay pending without a field until they are filed onto a record), `RecordFileContent` (the parts the database storage driver writes) and `RecordFileChunk` (extracted text for search, with an optional pgvector embedding); `Subscription.enterpriseFileStorageBytesPerUser` and the `fileIndexing` usage purpose. |
| 2 Addresses and postal codes | `RecordValue_shape_check` accepts an address: its parts in `jsonValue`, its formatted line in `textValue`. `PostalCodeCountry` and `PostalCode`, loaded per country from GeoNames on first use. They are shared by every workspace and hold no workspace data. |
| 3 Calendars | `DataView.calendar` and `P13n.calendar`; the widget kinds `calendar` and `map` with their own query columns; `CalendarSubscription`, which stores the SHA-256 hash of a subscription URL's token, its member and the validated calendar configuration, and is deleted with the member or the workspace. |
| 4 Contact details | `RecordIdentity.provider` gets its own enum `RecordIdentityProvider` with `phone`; every phone and email field of every workspace's current record model moves into its list's contact details field as described below, in one new configuration revision per affected workspace; contact details fields that still carry a former default name get the new one; the check constraint `RecordFieldDefinition_valueType_not_retired` keeps an older application version from creating a phone or email field afterwards. |

Enum labels added by `ALTER TYPE … ADD VALUE` (`fileIndexing`, `calendar`, `map`) are never used as a value in this
file, which PostgreSQL requires inside a transaction. `RecordIdentityProvider` is a new type, so its values can be
used at once.

## Contact details

The field type with the internal value type `channels` holds a record's phone numbers, email addresses and social
profiles as identities. The app calls the type "Phone, email & social" and names a new field of it "Contact details"
("Kontaktdaten", "Datos de contacto", "Coordonnées", "Recapiti"). The phone and email field types are retired: their
values become identities of the contact details field, where they can be called or emailed, match WhatsApp chats and
emails from the same number or address, and one number or address is one identity of the workspace, linked to every
record that has it.

### What moves into contact details

For every phone or email field the contact details field can take over:

- Every value (single or multiple values, records in Trash included) becomes an identity linked to the record: a
  phone number as provider `phone`, an email address in lowercase as provider `mail`. A number or address that already
  exists in the workspace is reused and keeps its provider, so a number WhatsApp knows stays WhatsApp and an address
  of a Gmail or Outlook conversation stays Gmail or Outlook. Identities are per workspace: a login that belongs to
  several workspaces never shares an identity between them.
- A list without a contact details field gets one after its other fields, named in the language of the workspace's
  first administrator (English when that administrator follows the browser language), or the first free
  `<name> (n)` from 2 on when a field (also one in Trash) has that name. Provider avatar is off; a click action all
  moved fields of the list agree on (`copy` or `open`) carries over.
- The phone or email field is removed with its values. Saved views (also those in Trash), personal layouts, record
  detail layouts and widget measures that referred to it refer to the contact details field instead where it can
  stand in for it:

  | Reference | After the move |
  | --- | --- |
  | Column, column width, record detail field order, starred detail field | The contact details field takes the place of the first moved field, unless the view or layout already has it. |
  | Hidden column, hidden detail field | Removed; the contact details field keeps its own visibility. |
  | Filter "contains", "starts with", "has a value" | Applies to the contact details field. |
  | Filter "is" | Becomes "contains" on the contact details field. |
  | Any other filter, sort, grouping, related filter and group filter, widget grouping | Removed the way a field deletion removes it (a widget grouped by the field shows the total). |

- A required setting or a default value of the phone or email field does not carry over: contact details have neither.

The workspace's configuration history shows one entry by the system (`system:contact-details-upgrade`) naming each
change: each renamed contact details field, the new contact details field, each removed field and each field kept as
text. No record events are written, so no routine or webhook runs. A background record operation of an affected
workspace that was still running ends as failed with `recordSchemaChanged`; its owner can start it again.

### What stays a text field

A phone or email field the contact details field cannot take over becomes a text field with all its values and loses
its click action. The reason is the first that applies:

| Reason (in the inventory) | Case |
| --- | --- |
| field in Trash | The field is in Trash; as text it stays restorable. |
| list in Trash | Its list is in Trash. |
| sub-list | Its list is a sub-list (embedded), where contact details are not allowed. |
| calculated field | It is a formula, lookup, rollup or snapshot. |
| name field of the list | It names the list's records. |
| used by a calculation | A calculation (also one in Trash) or a snapshot trigger uses it. |
| used by a binding | A capability binding uses it. |
| used by a routine or webhook | A record trigger of a routine or webhook uses it, or a webhook's body template names its id. |
| contact details field in Trash | The list's contact details field is in Trash, and a list has at most one. |
| values that are not phone numbers | A stored value of a phone field is not an E.164 number. |
| values that are not email addresses | A stored value of an email field is not an email address the app accepts. |

### Renamed contact details fields

A contact details field named with the former default name of the type in any app language (`Channels`, `Kanäle`,
`Canales`, `Canaux`, `Canali`, compared like field names, also followed by ` (n)` as the configurable records upgrade
named it when the list already had a field called `Channels`) gets the new default name of the same language, unless
another field of the list (also one in Trash) already has it. A field with any other name keeps it.

### What API consumers notice

The REST API, MCP tools, exports and webhooks address fields by id. A moved phone or email field disappears with its
id: its values are read and written through the record's `identities` on the contact details field from then on. A
`valueType` of `phone` or `email` is refused with a message that points to the contact details field. Record history
from before the move still reads these fields, shown as text.

### Counts

The migration is plain SQL and reports nothing itself. The read-only inventory below lists before deploying which
fields move and which stay text, with the reason and how many records hold a value; it names ids only, never labels
or values.

### Before deploying

This read-only inventory lists every phone and email field of the current record models with the reason it would
stay a text field (empty when it moves into contact details) and how many records hold a value. Count the rows per
reason for the figures the deployment will report.

```sql
WITH current AS (
  SELECT state."companyId" AS company_id, revision.snapshot
  FROM "RecordSchemaState" state
  JOIN "RecordSchemaRevision" revision ON revision."companyId" = state."companyId" AND revision.revision = state.revision
), contact AS (
  SELECT current.company_id, current.snapshot, field.value AS field, list.value AS list
  FROM current
  CROSS JOIN LATERAL jsonb_array_elements(current.snapshot -> 'fields') AS field(value)
  LEFT JOIN LATERAL (
    SELECT list.value FROM jsonb_array_elements(current.snapshot -> 'types') AS list(value)
    WHERE list.value ->> 'id' = field.value ->> 'typeId'
  ) list ON true
  WHERE field.value ->> 'valueType' IN ('phone', 'email')
)
SELECT contact.company_id, contact.field ->> 'typeId' AS list_id, contact.field ->> 'id' AS field_id,
  contact.field ->> 'valueType' AS value_type,
  CASE
    WHEN coalesce((contact.field ->> 'archived')::boolean, false) THEN 'field in Trash'
    WHEN contact.list IS NULL OR coalesce((contact.list ->> 'archived')::boolean, false) THEN 'list in Trash'
    WHEN coalesce((contact.list ->> 'embedded')::boolean, false) THEN 'sub-list'
    WHEN contact.field #>> '{behavior,kind}' IS DISTINCT FROM 'input' THEN 'calculated field'
    WHEN contact.list ->> 'primaryFieldId' = contact.field ->> 'id' THEN 'name field of the list'
    WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(contact.snapshot -> 'fields') AS other(value)
      WHERE other.value ->> 'id' <> contact.field ->> 'id'
        AND (other.value -> 'behavior')::text LIKE '%' || (contact.field ->> 'id') || '%'
    ) THEN 'used by a calculation'
    WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(contact.snapshot -> 'capabilities', '[]'::jsonb)) AS binding(value)
      CROSS JOIN LATERAL jsonb_array_elements(binding.value -> 'fields') AS entry(value)
      WHERE entry.value ->> 'fieldId' = contact.field ->> 'id'
    ) THEN 'used by a binding'
    WHEN EXISTS (
      SELECT 1 FROM "RecordEventSubscription" subscription
      WHERE subscription."companyId" = contact.company_id
        AND (contact.field ->> 'id' = ANY (subscription."changedFieldIds")
          OR subscription.query::text LIKE '%' || (contact.field ->> 'id') || '%'
          OR subscription.sources::text LIKE '%' || (contact.field ->> 'id') || '%')
    ) OR EXISTS (
      SELECT 1 FROM "Routine" routine
      WHERE routine."companyId" = contact.company_id
        AND routine."triggerFilters"::text LIKE '%' || (contact.field ->> 'id') || '%'
    ) OR EXISTS (
      SELECT 1 FROM "Webhook" webhook
      WHERE webhook."companyId" = contact.company_id
        AND webhook."bodyTemplate" LIKE '%' || (contact.field ->> 'id') || '%'
    ) THEN 'used by a routine or webhook'
    WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(contact.snapshot -> 'fields') AS other(value)
      WHERE other.value ->> 'typeId' = contact.field ->> 'typeId' AND other.value ->> 'valueType' = 'channels'
        AND coalesce((other.value ->> 'archived')::boolean, false)
    ) THEN 'contact details field in Trash'
    WHEN EXISTS (
      SELECT 1 FROM "RecordValue" value
      CROSS JOIN LATERAL unnest(CASE WHEN value."textValue" IS NOT NULL THEN ARRAY[value."textValue"] ELSE value."textListValue" END) AS entry
      WHERE value."companyId" = contact.company_id AND value."typeId" = contact.field ->> 'typeId'
        AND value."fieldId" = contact.field ->> 'id' AND value.state = 'value'
        AND NOT CASE contact.field ->> 'valueType'
          WHEN 'phone' THEN btrim(entry) ~ '^\+[1-9][0-9]{6,14}$'
          ELSE length(btrim(entry)) <= 2000
            AND btrim(entry) ~ '^(?!\.)(?!.*\.\.)([A-Za-z0-9_''+.-]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$'
        END
    ) THEN CASE contact.field ->> 'valueType'
      WHEN 'phone' THEN 'values that are not phone numbers'
      ELSE 'values that are not email addresses'
    END
  END AS kept_as_text_because,
  (
    SELECT count(*)::integer FROM "RecordValue" value
    WHERE value."companyId" = contact.company_id AND value."typeId" = contact.field ->> 'typeId'
      AND value."fieldId" = contact.field ->> 'id' AND value.state = 'value'
  ) AS records_with_values
FROM contact
ORDER BY contact.company_id, list_id, field_id;
```

### Lock timeout

A lock that is not granted within 60 seconds rolls the migration back, for example while a long import holds its
workspace. The database then stays as it was, but Prisma records the migration as failed and refuses every further
`prisma migrate deploy` (P3009) until it is marked as rolled back. Mark it once, then deploy again, after a lock
timeout preferably while fewer people work:

```bash
npx prisma migrate resolve --rolled-back 20261019190000_files_addresses_and_contact_details
```

### After deploying

The migration stores every number as its phone field held it, but earlier releases normalised numbers differently
from this one: a phone field value typed as `+49 (0)30 1234567` was stored as `+490301234567`, and a number typed into
Channels as `0049 30 1234567` became `+0049301234567`. This release stores both as `+49301234567`, the form in which
WhatsApp chats arrive. SQL cannot apply the phone number rules of `libphonenumber-js`, so the application finishes the
job: the daily lifecycle call (`/api/cron/lifecycle`) reads every phone identity, and for each workspace that still
has numbers in an earlier format it starts the background job `normalize-phone-identities`. Under the workspace's
record engine lock it gives such an identity the current number, or, when another identity of the workspace already
has that number, merges it into that one: the other identity takes over every record link, keeps the earlier values
as aliases, fills in a missing WhatsApp id, name or profile link and stays WhatsApp when either was. No identity loses
a record, numbers the current rules cannot read stay as they are, and no record event is written. A workspace with a
running background record operation is checked again the next day. Until the first daily run after the deployment, a
WhatsApp chat can miss a record whose number is still in an earlier format.

Email addresses need no such pass: the migration applies the same check and lowercasing as the application.

Once emails are identities, the inbox matches conversations to records by them: a workspace whose email fields held
addresses of existing conversations sees those conversations on the records from then on, subject to the usual
record and message permissions.

### The previous release

`scripts/vercel-build.sh` migrates before the new release is built, so the previous release keeps serving requests on
the migrated database until the new one takes over, and an instant rollback runs it again. It writes identity
providers as `MessagingProvider` values: its record writes cast them with `::"MessagingProvider"` and its Prisma client
with `CAST(… AS "MessagingProvider")`. The cast `MessagingProvider → RecordIdentityProvider` (`WITH INOUT AS
ASSIGNMENT`, created by step 4) converts such a value when it is stored; every messaging provider is also an identity
provider. The previous release never compares providers, so it needs no other cast, and it cannot create phone or
email fields (step 4). It cannot read a `phone` identity, though: its identity schema refuses the provider, so
opening, listing, exporting or saving a record that has a phone number in its contact details fails there. It also
does not know the new tables, columns and widget kinds, which it never reads. Deploy while few people work, and roll
back past this release only together with a database backup from before the migration.

Drop the cast in a later migration once no deployment older than this release can run against the database again, at
the latest in the migration that removes a value from `MessagingProvider` or drops the type:

```sql
DROP CAST IF EXISTS ("MessagingProvider" AS "RecordIdentityProvider");
```
