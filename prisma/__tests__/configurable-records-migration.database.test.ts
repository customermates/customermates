import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { identityLookupValue } from "@/ee/messaging/identity-lookup";
import { presetId } from "@/features/records/crm-preset";
import { RecordModelSchema } from "@/features/records/record-model.schema";
import { validateRecordModel } from "@/features/records/record-model-validation";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import {
  addEmptyLegacyStates,
  LEGACY_TIMESTAMPS,
  populateLegacyWorkspace,
  type LegacyWorkspace,
} from "@/tests/helpers/legacy-crm-fixture";
import {
  applyConfigurableRecordsMigration,
  CONFIGURABLE_RECORDS_MIGRATION,
  createLegacyMigrationDatabase,
  deployMigrations,
  LEGACY_CRM_TABLES,
  prismaCli,
  readMigration,
} from "@/tests/helpers/legacy-migration-database";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const databases: Awaited<ReturnType<typeof createLegacyMigrationDatabase>>[] = [];
const legacyOnly = (name: string) => name < CONFIGURABLE_RECORDS_MIGRATION;

async function legacyDatabase(applyMigrations = true) {
  const database = await createLegacyMigrationDatabase(databaseUrl, applyMigrations);
  databases.push(database);
  return database;
}

async function rows<T = Record<string, unknown>>(client: Client, sql: string, params: unknown[] = []) {
  return (await client.query(sql, params)).rows as T[];
}

/** The decimal of one stored value as text without trailing zeros, its state and currency. */
async function decimal(client: Client, f: LegacyWorkspace, kind: string, recordId: string, key: string) {
  const [value] = await rows<{
    state: string;
    value: string | null;
    currency: string | null;
  }>(
    client,
    'SELECT state, trim_scale("decimalValue")::text AS value, currency FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND "fieldId"=$4',
    [f.companyId, presetId(f.companyId, kind), recordId, key.includes(".") ? presetId(f.companyId, key) : key],
  );
  return value;
}

async function legacySnapshot(client: Client) {
  const snapshot: Record<string, unknown[]> = {};
  for (const table of LEGACY_CRM_TABLES)
    snapshot[table] = await rows(client, `SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY id`);

  for (const table of [
    "Company",
    "DataView",
    "P13n",
    "Widget",
    "Routine",
    "Webhook",
    "WebhookDelivery",
    "MessagingThreadParticipant",
  ])
    snapshot[table] = await rows(client, `SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY id`);

  return snapshot;
}

const OPTIONAL_VECTOR_COLUMNS = [
  'ALTER TABLE "DocsChunk" ADD COLUMN     "embedding" vector(768);',
  'ALTER TABLE "WikiPageChunk" ADD COLUMN     "embedding" vector(768);',
];

async function schemaDrift(url: string) {
  const scratch = resolve(".runs/migration-tests");
  await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(resolve(scratch, "diff-"));
  try {
    const config = resolve(directory, "prisma.config.ts");
    await writeFile(
      config,
      `export default { schema: ${JSON.stringify(resolve("prisma/schema.prisma"))}, datasource: { url: ${JSON.stringify(url)} } };\n`,
    );
    const result = await prismaCli(
      [
        "migrate",
        "diff",
        "--config",
        config,
        "--from-config-datasource",
        "--to-schema",
        resolve("prisma/schema.prisma"),
        "--script",
      ],
      url,
    );
    expect(result.code).toBe(0);
    return result.output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^(ALTER|CREATE|DROP|COMMENT)\b/.test(line));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function expectSchemaMatchesModel(url: string) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const vector = await client.query("SELECT 1 FROM pg_available_extensions WHERE name = 'vector'");
    expect(await schemaDrift(url)).toEqual(vector.rowCount ? [] : OPTIONAL_VECTOR_COLUMNS);
  } finally {
    await client.end();
  }
}

describeDatabase("configurable records migration", { timeout: 240000 }, () => {
  afterAll(async () => {
    for (const database of databases) await database.close();
  }, 120000);

  it("the read-only pre-deploy inventory predicts disabling and scheduled configuration cleanup", async () => {
    const { client } = await legacyDatabase();
    const f = await populateLegacyWorkspace(client);
    const empty = await addEmptyLegacyStates(client, f);
    const schedule = {
      ownerUserId: f.admin.id,
      companyId: f.companyId,
      prompt: "Inspect.",
      triggerKind: "schedule",
      cronExpression: "0 9 * * *",
    };
    const watched = await f.db.routine.create({
      data: {
        ...schedule,
        name: "Watched fields only",
        triggerEvents: ["messaging.message.received"],
        changedFields: ["subject"],
        triggerFilters: [{ field: "subject", operator: "isNotNull" }],
      },
    });
    const untouched = await f.db.routine.create({
      data: {
        ...schedule,
        name: "Unchanged schedule",
        triggerEvents: ["messaging.message.received"],
        changedFields: [],
        triggerFilters: [],
      },
    });
    const messaging = await f.db.routine.create({
      data: {
        companyId: f.companyId,
        ownerUserId: f.admin.id,
        name: "Message event",
        prompt: "Inspect.",
        triggerKind: "event",
        triggerEvents: ["messaging.message.received"],
        changedFields: [],
        triggerFilters: [],
      },
    });
    const sanitized = await f.db.webhook.create({
      data: {
        companyId: f.companyId,
        url: "http://127.0.0.1/disabled",
        enabled: false,
        events: [],
      },
    });
    const readme = await readFile(resolve("prisma/migrations", CONFIGURABLE_RECORDS_MIGRATION, "README.md"), "utf8");
    const query = /```sql\n([\s\S]*?)\n```/.exec(readme)?.[1];
    expect(query).toBeDefined();
    if (!query) throw new Error("The pre-deploy inventory must contain a SQL query.");
    type Prediction = {
      kind: "Routine" | "Webhook";
      companyId: string;
      id: string;
      enabled_before: boolean;
      enabled_after: boolean;
      disabled_by_upgrade: boolean;
      legacy_events_removed: string[];
      watched_fields_removed: string[];
      filters_cleared: boolean;
      state_changes: boolean;
    };
    await client.query("BEGIN READ ONLY");
    const predictions = await rows<Prediction>(client, query);
    await client.query("ROLLBACK");
    expect(predictions.map((p) => p.id).sort()).toEqual(
      [f.routine, f.webhook, empty.scheduled, watched.id, messaging.id, sanitized.id].sort(),
    );
    const predicted = (id: string) => predictions.find((p) => p.id === id);
    expect(predicted(empty.scheduled)).toMatchObject({
      kind: "Routine",
      enabled_before: true,
      enabled_after: true,
      disabled_by_upgrade: false,
      legacy_events_removed: ["deal.created"],
      watched_fields_removed: ["name"],
      filters_cleared: false,
      state_changes: true,
    });
    expect(predicted(watched.id)).toMatchObject({
      kind: "Routine",
      enabled_before: true,
      enabled_after: true,
      disabled_by_upgrade: false,
      legacy_events_removed: [],
      watched_fields_removed: ["subject"],
      filters_cleared: false,
      state_changes: true,
    });
    expect(predicted(messaging.id)).toMatchObject({
      kind: "Routine",
      enabled_before: true,
      enabled_after: false,
      disabled_by_upgrade: true,
      legacy_events_removed: [],
      watched_fields_removed: [],
      filters_cleared: false,
      state_changes: true,
    });
    expect(predicted(sanitized.id)).toMatchObject({
      kind: "Webhook",
      enabled_before: false,
      enabled_after: false,
      disabled_by_upgrade: true,
      legacy_events_removed: [],
      watched_fields_removed: [],
      filters_cleared: false,
      state_changes: false,
    });
    expect(predicted(f.routine)).toMatchObject({
      filters_cleared: true,
      state_changes: true,
    });
    const before = {
      webhooks: await rows<{ id: string; enabled: boolean; events: string[] }>(
        client,
        'SELECT id, enabled, events FROM "Webhook"',
      ),
      routines: await rows<{
        id: string;
        enabled: boolean;
        triggerEvents: string[];
        triggerFilters: unknown;
        changedFields: string[];
      }>(client, 'SELECT id, enabled, "triggerEvents", "triggerFilters", "changedFields" FROM "Routine"'),
    };
    await applyConfigurableRecordsMigration(client);
    const after = {
      webhooks: await rows<{ id: string; enabled: boolean; events: string[] }>(
        client,
        'SELECT id, enabled, events FROM "Webhook"',
      ),
      routines: await rows<{
        id: string;
        enabled: boolean;
        triggerEvents: string[];
        triggerFilters: unknown;
      }>(client, 'SELECT id, enabled, "triggerEvents", "triggerFilters" FROM "Routine"'),
    };
    const actualChanges = [
      ...before.webhooks.filter((old) => {
        const current = after.webhooks.find((w) => w.id === old.id);
        if (!current) throw new Error("The upgrade must preserve every webhook.");
        return old.enabled !== current.enabled || JSON.stringify(old.events) !== JSON.stringify(current.events);
      }),
      ...before.routines.filter((old) => {
        const current = after.routines.find((r) => r.id === old.id);
        if (!current) throw new Error("The upgrade must preserve every routine.");
        return (
          old.enabled !== current.enabled ||
          old.changedFields.length > 0 ||
          JSON.stringify(old.triggerEvents) !== JSON.stringify(current.triggerEvents) ||
          JSON.stringify(old.triggerFilters) !== JSON.stringify(current.triggerFilters)
        );
      }),
    ]
      .map((r) => r.id)
      .sort();
    expect(
      predictions
        .filter((p) => p.state_changes)
        .map((p) => p.id)
        .sort(),
    ).toEqual(actualChanges);
    for (const p of predictions) {
      const current =
        p.kind === "Webhook" ? after.webhooks.find((w) => w.id === p.id) : after.routines.find((r) => r.id === p.id);
      expect(current?.enabled).toBe(p.enabled_after);
    }
    expect(after.routines.find((r) => r.id === untouched.id)).toMatchObject({
      enabled: true,
      triggerEvents: ["messaging.message.received"],
      triggerFilters: [],
    });
    expect(after.routines.find((r) => r.id === watched.id)?.triggerFilters).toEqual([
      { field: "subject", operator: "isNotNull" },
    ]);
    expect(await rows(client, 'SELECT "cronExpression" FROM "Routine" WHERE id=$1', [empty.scheduled])).toEqual([
      { cronExpression: "0 9 * * *" },
    ]);
  });

  it("converts a populated legacy workspace with exact values, identities and links, and drops the rest", async () => {
    const { client } = await legacyDatabase();
    const f = await populateLegacyWorkspace(client);
    const id = (key: string) => presetId(f.companyId, key);
    await applyConfigurableRecordsMigration(client);

    // Records keep their IDs and timestamps; one legacy ID is shared by six record types.
    expect(
      await rows(client, 'SELECT "typeId" FROM "CrmRecord" WHERE "companyId"=$1 AND id=$2 ORDER BY "typeId"', [
        f.companyId,
        f.shared,
      ]),
    ).toHaveLength(6);
    expect(
      await rows(
        client,
        'SELECT "createdAt","updatedAt","protectedKind","systemData" FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2 AND id=$3',
        [f.companyId, id("deal"), f.shared],
      ),
    ).toEqual([
      {
        createdAt: LEGACY_TIMESTAMPS.createdAt,
        updatedAt: LEGACY_TIMESTAMPS.updatedAt,
        protectedKind: null,
        systemData: null,
      },
    ]);
    expect(
      await rows(
        client,
        'SELECT "protectedKind","systemData" FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2 AND id=$3',
        [f.companyId, id("task"), f.tasks.protected],
      ),
    ).toEqual([
      {
        protectedKind: "membershipAuthorization",
        systemData: { relatedUserId: f.member.id },
      },
    ]);

    // Line items and rollups: 2 x 1000 + 3 x 200 = 2600 over quantity 5; 60% weights 1560.
    expect(await decimal(client, f, "lineItem", f.lines.weightedA, "lineItem.amount")).toEqual({
      state: "value",
      value: "2000",
      currency: "EUR",
    });
    expect(await decimal(client, f, "lineItem", f.lines.weightedB, "lineItem.effectivePrice")).toEqual({
      state: "value",
      value: "200",
      currency: "EUR",
    });
    expect(await decimal(client, f, "deal", f.deals.weighted, "deal.totalValue")).toEqual({
      state: "value",
      value: "2600",
      currency: "EUR",
    });
    expect(await decimal(client, f, "deal", f.deals.weighted, "deal.totalQuantity")).toEqual({
      state: "value",
      value: "5",
      currency: null,
    });
    expect(await decimal(client, f, "deal", f.deals.weighted, "deal.weightedValue")).toEqual({
      state: "value",
      value: "1560",
      currency: "EUR",
    });
    // A zero probability weights to 0; no stage value or a stage without probability is missing (never 0).
    expect(await decimal(client, f, "deal", f.deals.zero, "deal.totalValue")).toEqual({
      state: "value",
      value: "500",
      currency: "EUR",
    });
    expect(await decimal(client, f, "deal", f.deals.zero, "deal.weightedValue")).toEqual({
      state: "value",
      value: "0",
      currency: "EUR",
    });
    expect(await decimal(client, f, "deal", f.deals.unstaged, "deal.weightedValue")).toEqual({
      state: "missing",
      value: null,
      currency: null,
    });
    expect(await decimal(client, f, "deal", f.deals.noWeight, "deal.weightedValue")).toEqual({
      state: "missing",
      value: null,
      currency: null,
    });
    // No lines: value 0 in the workspace currency, quantity 0.
    expect(await decimal(client, f, "deal", f.deals.empty, "deal.totalValue")).toEqual({
      state: "value",
      value: "0",
      currency: "EUR",
    });
    expect(await decimal(client, f, "deal", f.deals.empty, "deal.totalQuantity")).toEqual({
      state: "value",
      value: "0",
      currency: null,
    });
    // Exact decimals of binary legacy prices: 42.175 x 3 + 0.30000000000000004 x 10.
    expect(await decimal(client, f, "service", f.services.binary, "service.amount")).toEqual({
      state: "value",
      value: "0.30000000000000004",
      currency: "EUR",
    });
    expect(await decimal(client, f, "deal", f.deals.exact, "deal.totalValue")).toEqual({
      state: "value",
      value: "129.5250000000000004",
      currency: "EUR",
    });
    expect(await decimal(client, f, "deal", f.deals.exact, "deal.totalQuantity")).toEqual({
      state: "value",
      value: "13",
      currency: null,
    });
    expect(await decimal(client, f, "deal", f.deals.weighted, f.columns.budget)).toEqual({
      state: "value",
      value: "1234567890.1234567890123456789",
      currency: "USD",
    });
    expect(await decimal(client, f, "deal", f.deals.zero, f.columns.budget)).toEqual({
      state: "value",
      value: "1000",
      currency: "USD",
    });

    // Formula names use JavaScript trimming; every line is priced live.
    const names = await rows<{ id: string; textValue: string }>(
      client,
      'SELECT "recordId" AS id, "textValue" FROM "RecordValue" WHERE "companyId"=$1 AND "fieldId"=$2',
      [f.companyId, id("contact.name")],
    );
    expect(Object.fromEntries(names.map((row) => [row.id, row.textValue]))).toEqual({
      [f.contacts.solo]: "Solo",
      [f.contacts.spaced]: "Grace   Hopper",
      [f.contacts.empty]: "",
    });
    expect(
      await rows(client, 'SELECT DISTINCT "textValue" FROM "RecordValue" WHERE "companyId"=$1 AND "fieldId"=$2', [
        f.companyId,
        id("lineItem.pricingMode"),
      ]),
    ).toEqual([{ textValue: "live" }]);

    // Typed custom values with their lexical forms.
    const custom = async (recordId: string, fieldId: string) =>
      (
        await rows(
          client,
          'SELECT state,"textValue","textListValue","lexicalValue",to_char("instantValue",\'YYYY-MM-DD"T"HH24:MI:SS.US\') AS instant,"jsonValue",to_char("rangeStart",\'YYYY-MM-DD"T"HH24:MI:SS.US\') AS start,to_char("rangeEnd",\'YYYY-MM-DD"T"HH24:MI:SS.US\') AS "end" FROM "RecordValue" WHERE "companyId"=$1 AND "recordId"=$2 AND "fieldId"=$3',
          [f.companyId, recordId, fieldId],
        )
      )[0];
    expect(await custom(f.deals.weighted, f.columns.start)).toMatchObject({
      lexicalValue: "2026-09-28T12:34:56.123456+02:00",
      instant: "2026-09-28T10:34:56.123456",
    });
    expect(await custom(f.deals.weighted, f.columns.window)).toMatchObject({
      jsonValue: {
        start: "2026-09-28T12:34:56.123456+02:00",
        end: "2026-09-28T16:34:56.654321+02:00",
      },
      start: "2026-09-28T10:34:56.123456",
      end: "2026-09-28T14:34:56.654321",
    });
    expect(await custom(f.contacts.solo, f.columns.emails)).toMatchObject({
      textListValue: ["one@example.test", " two@example.test"],
    });
    expect(await custom(f.contacts.solo, f.columns.phone)).toMatchObject({
      state: "missing",
      textValue: null,
    });
    expect(await custom(f.services.a, f.columns.note)).toMatchObject({
      textValue: "with, comma",
    });
    expect(await custom(f.deals.weighted, f.columns.stage)).toMatchObject({
      textValue: "proposal",
    });
    expect(await custom(f.contacts.solo, id("contact.notes"))).toMatchObject({
      jsonValue: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "A retained note" }],
          },
        ],
      },
    });

    // Links keep IDs across tables; assignments and grants carry over.
    expect(
      await rows(client, 'SELECT count(*)::int AS count FROM "RecordLink" WHERE "companyId"=$1 AND id=$2', [
        f.companyId,
        f.shared,
      ]),
    ).toEqual([{ count: 9 }]);
    expect(
      await rows(client, 'SELECT count(*)::int AS count FROM "RecordAssignment" WHERE "companyId"=$1 AND "userId"=$2', [
        f.companyId,
        f.admin.id,
      ]),
    ).toEqual([{ count: 5 }]);
    expect(
      await rows(client, 'SELECT "typeId", actions FROM "RecordTypeGrant" WHERE "companyId"=$1 ORDER BY "typeId"', [
        f.companyId,
      ]),
    ).toEqual(
      [
        { typeId: id("contact"), actions: "{readOwn}" },
        { typeId: id("deal"), actions: "{readAll,update}" },
      ].sort((a, b) => (a.typeId < b.typeId ? -1 : 1)),
    );
    // Provenance: deal value depends on both lines and both services; quantity on both lines.
    expect(
      await rows(
        client,
        'SELECT "fieldId","sourceTypeId",count(*)::int AS count FROM "RecordValueDependency" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 GROUP BY 1,2 ORDER BY 1,2',
        [f.companyId, id("deal"), f.deals.weighted],
      ),
    ).toEqual(
      [
        {
          fieldId: id("deal.totalValue"),
          sourceTypeId: id("lineItem"),
          count: 2,
        },
        {
          fieldId: id("deal.totalValue"),
          sourceTypeId: id("service"),
          count: 2,
        },
        {
          fieldId: id("deal.totalQuantity"),
          sourceTypeId: id("lineItem"),
          count: 2,
        },
      ].sort((a, b) => (`${a.fieldId}${a.sourceTypeId}` < `${b.fieldId}${b.sourceTypeId}` ? -1 : 1)),
    );

    // Channel identities keep IDs, aliases and timestamps and are associated with their contact.
    expect(
      await rows(
        client,
        'SELECT value, "messagingId", "createdAt" FROM "RecordIdentity" WHERE "companyId"=$1 AND id=$2',
        [f.companyId, f.identities.linkedin],
      ),
    ).toEqual([
      {
        value: "person",
        messagingId: "provider-person",
        createdAt: new Date("2021-02-03T04:05:06.789Z"),
      },
    ]);
    expect(
      await rows(client, 'SELECT value FROM "RecordIdentityKey" WHERE "identityId"=$1 ORDER BY value', [
        f.identities.linkedin,
      ]),
    ).toEqual([{ value: "person" }, { value: "provider-person" }]);
    expect(
      await rows(client, 'SELECT "typeId","recordId" FROM "RecordIdentityLink" WHERE "identityId"=$1', [
        f.identities.linkedin,
      ]),
    ).toEqual([{ typeId: id("contact"), recordId: f.contacts.solo }]);
    // Participant lookups equal the runtime's normalisation.
    for (const participant of await rows<{
      provider: "mail";
      identifier: string | null;
      identityLookupValue: string | null;
    }>(
      client,
      'SELECT provider, identifier, "identityLookupValue" FROM "MessagingThreadParticipant" WHERE "companyId"=$1',
      [f.companyId],
    ))
      expect(participant.identityLookupValue).toBe(identityLookupValue(participant.provider, participant.identifier));

    // Configuration: one revision holding a valid record model with the legacy custom columns.
    expect(
      await rows(client, 'SELECT revision, "actorId" FROM "RecordSchemaRevision" WHERE "companyId"=$1', [f.companyId]),
    ).toEqual([{ revision: 1, actorId: "system:configurable-records-upgrade" }]);
    expect(
      await rows(
        client,
        'SELECT revision, "storageMode", "activeOperationId" FROM "RecordSchemaState" WHERE "companyId"=$1',
        [f.companyId],
      ),
    ).toEqual([{ revision: 1, storageMode: "generic", activeOperationId: null }]);
    const [revision] = await rows<{ snapshot: unknown }>(
      client,
      'SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1',
      [f.companyId],
    );
    const model = RecordModelSchema.parse(revision.snapshot);
    expect(validateRecordModel(model).issues).toEqual([]);
    expect(model.types.find((type) => type.id === id("contact"))).toMatchObject({
      label: "Contact",
      pluralLabel: "Contacts",
    });
    expect(model.fields.find((field) => field.id === f.columns.budget)).toMatchObject({
      label: "Budget",
      valueType: "currency",
      format: { currency: "USD" },
    });
    expect(model.fields.find((field) => field.id === f.columns.stage)).toMatchObject({
      behavior: {
        kind: "input",
        defaultValue: { kind: "select", value: "proposal" },
      },
      options: [
        expect.objectContaining({
          id: "proposal",
          attributes: [
            {
              key: "probability",
              value: expect.objectContaining({ value: "60" }),
            },
          ],
        }),
        expect.objectContaining({ id: "zero" }),
        expect.objectContaining({ id: "open", attributes: [] }),
      ],
    });
    expect(model.fields.some((field) => field.id === id("deal.stage"))).toBe(false);
    expect(
      model.fields
        .filter((field) => field.publishedSummary)
        .map((field) => field.id)
        .sort(),
    ).toEqual([id("deal.totalValue"), id("deal.totalQuantity"), id("deal.weightedValue")].sort());
    expect(model.types.find((type) => type.id === id("deal"))?.defaults.groupBy).toBe(f.columns.stage);
    expect(model.capabilities).toContainEqual(expect.objectContaining({ kind: "channels", providerAvatar: true }));
    expect(
      (
        await rows<{ definition: { label: string } }>(
          client,
          'SELECT definition FROM "RecordFieldDefinition" WHERE "companyId"=$1 AND id=$2',
          [f.companyId, f.columns.budget],
        )
      )[0].definition.label,
    ).toBe("Budget");

    // Legacy presentation state and history are not carried over; other surfaces keep theirs.
    expect(await rows(client, 'SELECT id FROM "DataView" WHERE "companyId"=$1 ORDER BY id', [f.companyId])).toEqual([
      { id: f.inbox.view },
    ]);
    expect(await rows(client, 'SELECT id FROM "P13n" WHERE "companyId"=$1 ORDER BY id', [f.companyId])).toEqual([
      { id: f.inbox.preference },
    ]);
    expect(await rows(client, 'SELECT id FROM "Widget" WHERE "companyId"=$1', [f.companyId])).toEqual([]);
    expect(
      await rows(client, 'SELECT event FROM "AuditLog" WHERE "companyId"=$1 ORDER BY event', [f.companyId]),
    ).toEqual([{ event: "webhook.created" }]);

    // Automations: webhooks and event routines are disabled without legacy events; nothing subscribes.
    expect(
      await rows(
        client,
        'SELECT enabled, "triggerEvents", "triggerFilters", "disabledReason" FROM "Routine" WHERE id=$1',
        [f.routine],
      ),
    ).toEqual([
      {
        enabled: false,
        triggerEvents: ["messaging.message.received"],
        triggerFilters: [],
        disabledReason: null,
      },
    ]);
    expect(await rows(client, 'SELECT events, enabled FROM "Webhook" WHERE id=$1', [f.webhook])).toEqual([
      { events: ["messaging.message.received"], enabled: false },
    ]);
    expect(
      await rows(client, 'SELECT "triggerEvent", "triggerEntityId", "triggerPayload" FROM "RoutineRun" WHERE id=$1', [
        f.run,
      ]),
    ).toEqual([{ triggerEvent: null, triggerEntityId: null, triggerPayload: null }]);
    expect(await rows(client, 'SELECT count(*)::int AS count FROM "RecordEventSubscription"')).toEqual([{ count: 0 }]);
    // Completed deliveries are never replayed; no record events (and so no deliveries) were emitted.
    expect(await rows(client, 'SELECT "nextAttemptAt" FROM "WebhookDelivery" WHERE id=$1', [f.delivery])).toEqual([
      { nextAttemptAt: null },
    ]);
    expect(await rows(client, 'SELECT count(*)::int AS count FROM "RecordEvent"')).toEqual([{ count: 0 }]);

    // Legacy storage, enums and helpers are gone.
    expect(
      await rows(client, "SELECT name FROM unnest($1::text[]) name WHERE to_regclass(format('%I', name)) IS NOT NULL", [
        LEGACY_CRM_TABLES,
      ]),
    ).toEqual([]);
    expect(
      await rows(client, "SELECT typname FROM pg_type WHERE typname = ANY($1::text[])", [
        ["EntityType", "TaskType", "CustomColumnType", "AggregationType", "WidgetGroupByType"],
      ]),
    ).toEqual([]);
    expect(await rows(client, "SELECT nspname FROM pg_namespace WHERE nspname = 'crm_upgrade'")).toEqual([]);
    expect(
      await rows(
        client,
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'Routine' AND column_name = 'changedFields'",
      ),
    ).toEqual([]);
  });

  it("converts columns without options and empty notes, and keeps scheduled routines running", async () => {
    const { client } = await legacyDatabase();
    const f = await populateLegacyWorkspace(client);
    const empty = await addEmptyLegacyStates(client, f);
    await applyConfigurableRecordsMigration(client);

    expect(
      await rows(
        client,
        'SELECT enabled, "triggerEvents", "triggerFilters", "cronExpression" FROM "Routine" WHERE id=$1',
        [empty.scheduled],
      ),
    ).toEqual([
      {
        enabled: true,
        triggerEvents: ["messaging.message.received"],
        triggerFilters: [],
        cronExpression: "0 9 * * *",
      },
    ]);
    for (const columnId of Object.values(empty.columns)) {
      expect(
        (
          await rows<{
            definition: {
              options: unknown;
              behavior: unknown;
              multiple: boolean;
            };
          }>(client, 'SELECT definition FROM "RecordFieldDefinition" WHERE id=$1', [columnId])
        )[0].definition,
      ).toMatchObject({
        options: [],
        behavior: { kind: "input" },
        multiple: false,
      });
    }
    const note = async (recordId: string) =>
      (
        await rows(client, 'SELECT state, "jsonValue" FROM "RecordValue" WHERE "recordId"=$1 AND "fieldId"=$2', [
          recordId,
          presetId(f.companyId, "organization.notes"),
        ])
      )[0];
    expect(await note(empty.notes.emptyObject)).toEqual({
      state: "value",
      jsonValue: {},
    });
    expect(await note(empty.notes.jsonNull)).toEqual({
      state: "missing",
      jsonValue: null,
    });
  });

  it("keeps Knowledge Base pages, their permissions and audit history", async () => {
    const { client } = await legacyDatabase();
    const f = await populateLegacyWorkspace(client);
    const pageId = randomUUID();
    for (const action of ["readAll", "update"]) {
      await client.query(
        'INSERT INTO "RolePermission" (id, "roleId", "companyId", resource, action) VALUES ($1, $2, $3, $4, $5)',
        [randomUUID(), f.memberRole.id, f.companyId, "wiki", action],
      );
    }
    await client.query(
      'INSERT INTO "WikiPage" (id, "companyId", title, markdown, kind, "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW())',
      [pageId, f.companyId, "Operating Guide", "# Operating Guide\n\nCall every new lead within a day.", "guide"],
    );
    await client.query(
      'INSERT INTO "AuditLog" (id, event, "eventData", "companyId", "userId", "entityId") VALUES ($1, $2, $3, $4, $5, $6)',
      [randomUUID(), "wiki_page.created", { title: "Operating Guide" }, f.companyId, f.admin.id, pageId],
    );
    const mateState = async () => ({
      pages: await rows(client, 'SELECT to_jsonb(p) AS row FROM "WikiPage" p WHERE "companyId"=$1', [f.companyId]),
      permissions: await rows(
        client,
        'SELECT resource::text, action::text FROM "RolePermission" WHERE "roleId"=$1 AND resource::text=$2 ORDER BY action',
        [f.memberRole.id, "wiki"],
      ),
      audit: await rows(client, 'SELECT to_jsonb(a) AS row FROM "AuditLog" a WHERE "entityId"=$1', [pageId]),
    });
    const before = await mateState();
    expect(before.permissions).toHaveLength(2);

    await applyConfigurableRecordsMigration(client);

    expect(await mateState()).toEqual(before);
  });

  it("reports an unexpected failure as an internal error, never as a data issue", async () => {
    const { client } = await legacyDatabase();
    await populateLegacyWorkspace(client);
    // Simulated defect: the identity validation can no longer read a column it checks.
    await client.query('ALTER TABLE "ContactIdentifier" RENAME COLUMN "displayName" TO "label"');
    const before = await legacySnapshot(client);
    const failure = await client.query(await readMigration(CONFIGURABLE_RECORDS_MIGRATION)).then(
      () => null,
      (error: Error & { code?: string; detail?: string }) => error,
    );
    expect(failure?.code).toBe("CRM02");
    expect(failure?.message).toBe(
      "Configurable record upgrade internal error in channel identities (SQLSTATE 42703): column i.displayName does not exist",
    );
    expect(failure?.detail).toContain("Context:");
    expect(failure?.message).not.toContain("refused");
    expect(await legacySnapshot(client)).toEqual(before);
    expect(await rows(client, "SELECT to_regclass('\"CrmRecord\"') AS table")).toEqual([{ table: null }]);
  });

  it("weights deal values with fractional probabilities exactly", async () => {
    const { client } = await legacyDatabase();
    const f = await populateLegacyWorkspace(client);
    await client.query(
      `UPDATE "CustomColumn" SET options = jsonb_set(options, '{options,0,weight}', '33.333333333333336') WHERE id = $1`,
      [f.columns.stage],
    );
    await client.query('UPDATE "Service" SET amount = 200.01 WHERE id = $1', [f.services.b]);
    await applyConfigurableRecordsMigration(client);
    // (2 x 1000 + 3 x 200.01) x 33.333333333333336 / 100, without rounding (rounded division gives ...736).
    expect(await decimal(client, f, "deal", f.deals.weighted, "deal.totalValue")).toEqual({
      state: "value",
      value: "2600.03",
      currency: "EUR",
    });
    expect(await decimal(client, f, "deal", f.deals.weighted, "deal.weightedValue")).toEqual({
      state: "value",
      value: "866.6766666666667360008",
      currency: "EUR",
    });
  });

  it("repairs links without scheme and reconciles them", async () => {
    const { client } = await legacyDatabase();
    const f = await populateLegacyWorkspace(client);
    const sites = await f.db.customFieldValue.create({
      data: {
        companyId: f.companyId,
        entityType: "organization",
        columnId: f.columns.sites,
        type: "link",
        organizationId: f.organizations.other,
        value: "Acme.Example/team, https://ok.test",
      },
    });
    await client.query('UPDATE "CustomFieldValue" SET value = $2 WHERE "columnId" = $1', [
      f.columns.website,
      " acme.example ",
    ]);
    await applyConfigurableRecordsMigration(client);

    expect(
      (
        await rows(client, 'SELECT "textValue" FROM "RecordValue" WHERE "fieldId"=$1 AND "recordId"=$2', [
          f.columns.website,
          f.organizations.shared,
        ])
      )[0],
    ).toEqual({ textValue: "https://acme.example" });
    expect(
      (
        await rows(client, 'SELECT "textListValue" FROM "RecordValue" WHERE "fieldId"=$1 AND "recordId"=$2', [
          f.columns.sites,
          sites.organizationId,
        ])
      )[0],
    ).toEqual({
      textListValue: ["https://Acme.Example/team", " https://ok.test"],
    });
    expect(
      (
        await rows(client, 'SELECT "textListValue" FROM "RecordValue" WHERE "fieldId"=$1 AND "recordId"=$2', [
          f.columns.sites,
          f.organizations.shared,
        ])
      )[0],
    ).toEqual({
      textListValue: ["https://example.test/a", "https://example.test/b"],
    });
  });

  it("disables every webhook and event routine, whatever their owners", async () => {
    const { client } = await legacyDatabase();
    const f = await populateLegacyWorkspace(client);
    await client.query("UPDATE \"User\" SET status = 'inactive' WHERE id = $1", [f.member.id]);
    const messaging = randomUUID();
    const orphaned = randomUUID();
    await client.query(
      `INSERT INTO "Routine" (id, "companyId", "ownerUserId", name, prompt, enabled, "triggerKind", "triggerEvents", "changedFields", "triggerFilters", "updatedAt")
       VALUES ($1, $3, $4, 'Messages', 'Inspect.', true, 'event', ARRAY['messaging.message.received'], ARRAY['subject'], '[]', now()),
              ($2, $3, NULL, 'Orphaned', 'Inspect.', false, 'event', ARRAY['contact.updated'], ARRAY['firstName'], '[]', now())`,
      [messaging, orphaned, f.companyId, f.member.id],
    );
    const quiet = await f.db.webhook.create({
      data: {
        companyId: f.companyId,
        url: "https://receiver.example.test/q",
        events: [],
        enabled: true,
      },
    });
    await applyConfigurableRecordsMigration(client);
    expect(
      await rows(client, 'SELECT id, enabled, "triggerEvents" FROM "Routine" WHERE id = ANY($1) ORDER BY name', [
        [messaging, orphaned],
      ]),
    ).toEqual([
      {
        id: messaging,
        enabled: false,
        triggerEvents: ["messaging.message.received"],
      },
      { id: orphaned, enabled: false, triggerEvents: [] },
    ]);
    expect(await rows(client, 'SELECT events, enabled FROM "Webhook" WHERE id=$1', [quiet.id])).toEqual([
      { events: [], enabled: false },
    ]);
  });

  it("refuses malformed data with grouped counts, leaves everything unchanged and deploys after resolve and repair", async () => {
    const database = await legacyDatabase(false);
    expect((await deployMigrations(database.url, legacyOnly)).code).toBe(0);
    const f = await populateLegacyWorkspace(database.client);
    await database.client.query('UPDATE "CustomFieldValue" SET value = $2 WHERE "columnId" = $1', [
      f.columns.budget,
      "12,5",
    ]);
    await database.client.query('UPDATE "ContactIdentifier" SET value = $2 WHERE id = $1', [
      f.identities.email,
      "Grace@Example.test",
    ]);
    const before = await legacySnapshot(database.client);
    const failed = await deployMigrations(database.url);
    expect(failed.code).not.toBe(0);
    expect(failed.output).toContain("CustomFieldValue.value invalid_decimal_lexeme x2");
    expect(failed.output).toContain("ContactIdentifier.value noncanonical_identity_value x1");
    expect(failed.output).not.toContain("12,5");
    expect(failed.output).not.toContain("Grace@Example.test");
    expect(await legacySnapshot(database.client)).toEqual(before);
    expect(await rows(database.client, "SELECT to_regclass('\"CrmRecord\"') AS table")).toEqual([{ table: null }]);
    expect(
      await rows(
        database.client,
        'SELECT finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = $1',
        [CONFIGURABLE_RECORDS_MIGRATION],
      ),
    ).toEqual([{ finished_at: null, rolled_back_at: null }]);
    expect((await deployMigrations(database.url)).code).not.toBe(0);
    expect(
      (await prismaCli(["migrate", "resolve", "--rolled-back", CONFIGURABLE_RECORDS_MIGRATION], database.url)).code,
    ).toBe(0);
    await database.client.query('UPDATE "CustomFieldValue" SET value = $2 WHERE "columnId" = $1', [
      f.columns.budget,
      "12.5",
    ]);
    await database.client.query('UPDATE "ContactIdentifier" SET value = $2 WHERE id = $1', [
      f.identities.email,
      "grace@example.test",
    ]);
    expect((await deployMigrations(database.url)).code).toBe(0);
    expect(await decimal(database.client, f, "deal", f.deals.weighted, f.columns.budget)).toEqual({
      state: "value",
      value: "12.5",
      currency: "USD",
    });
    const second = await deployMigrations(database.url);
    expect(second.code).toBe(0);
    expect(second.output).toContain("No pending migrations to apply");
    await expectSchemaMatchesModel(database.url);
  });

  it("rolls back completely when the migration backend is terminated, then succeeds on retry", async () => {
    const database = await legacyDatabase(false);
    expect((await deployMigrations(database.url, legacyOnly)).code).toBe(0);
    const f = await populateLegacyWorkspace(database.client);
    // Enough contacts that the conversion is still running when it is interrupted.
    await database.client.query(
      'INSERT INTO "Contact" (id, "firstName", "lastName", "companyId", "updatedAt") SELECT gen_random_uuid(), \'First\' || g, \'Last\' || g, $1, NOW() FROM generate_series(1, 40000) g',
      [f.companyId],
    );
    const before = await legacySnapshot(database.client);
    const observer = new Client({ connectionString: database.url });
    await observer.connect();
    try {
      const deployment = deployMigrations(database.url);
      let terminated = false;
      for (let attempt = 0; attempt < 600 && !terminated; attempt++) {
        await delay(100);
        const busy = await observer.query(
          "SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state = 'active' AND query LIKE '%Configurable records: the one-step upgrade%' AND now() - query_start > interval '1 second'",
        );
        if (busy.rowCount) {
          terminated = (await observer.query("SELECT pg_terminate_backend($1) AS done", [busy.rows[0].pid])).rows[0]
            .done;
        }
      }
      expect(terminated).toBe(true);
      expect((await deployment).code).not.toBe(0);
    } finally {
      await observer.end();
    }
    expect(await legacySnapshot(database.client)).toEqual(before);
    expect(
      await rows(
        database.client,
        "SELECT to_regclass('\"CrmRecord\"') AS table, to_regnamespace('crm_upgrade') AS helpers",
      ),
    ).toEqual([{ table: null, helpers: null }]);
    expect(
      (await prismaCli(["migrate", "resolve", "--rolled-back", CONFIGURABLE_RECORDS_MIGRATION], database.url)).code,
    ).toBe(0);
    expect((await deployMigrations(database.url)).code).toBe(0);
    expect(
      await rows(database.client, 'SELECT count(*)::int AS count FROM "CrmRecord" WHERE "typeId" = $1', [
        presetId(f.companyId, "contact"),
      ]),
    ).toEqual([{ count: 40003 }]);
  });

  it("installs an empty database without drift and deploys against a ledger with squashed historical migrations", async () => {
    const empty = await legacyDatabase(false);
    expect((await deployMigrations(empty.url)).code).toBe(0);
    await expectSchemaMatchesModel(empty.url);
    expect((await deployMigrations(empty.url)).output).toContain("No pending migrations to apply");

    const production = await legacyDatabase(false);
    expect((await deployMigrations(production.url, legacyOnly)).code).toBe(0);
    for (let index = 0; index < 68; index++) {
      await production.client.query(
        'INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count) VALUES ($1, $2, NOW(), $3, NOW(), 1)',
        [randomUUID(), "0".repeat(64), `2025${String(index).padStart(4, "0")}000000_historical_${index}`],
      );
    }
    const f = await populateLegacyWorkspace(production.client);
    const deployed = await deployMigrations(production.url);
    expect(deployed.code).toBe(0);
    expect(deployed.output).toContain(CONFIGURABLE_RECORDS_MIGRATION);
    expect(
      await rows(
        production.client,
        "SELECT migration_name FROM \"_prisma_migrations\" WHERE started_at > NOW() - interval '10 minutes' AND migration_name >= $1",
        [CONFIGURABLE_RECORDS_MIGRATION],
      ),
    ).toEqual([{ migration_name: CONFIGURABLE_RECORDS_MIGRATION }]);
    expect(
      await rows(production.client, 'SELECT "storageMode" FROM "RecordSchemaState" WHERE "companyId"=$1', [
        f.companyId,
      ]),
    ).toEqual([{ storageMode: "generic" }]);
    await expectSchemaMatchesModel(production.url);
  });

  it("refuses to run on a database that already has generic record storage", async () => {
    const { client } = await legacyDatabase();
    await populateLegacyWorkspace(client);
    await applyConfigurableRecordsMigration(client, { later: false });
    await expect(client.query(await readMigration(CONFIGURABLE_RECORDS_MIGRATION))).rejects.toThrow(
      "Configurable record storage already exists",
    );
    await client.query("ROLLBACK");
  });
});
