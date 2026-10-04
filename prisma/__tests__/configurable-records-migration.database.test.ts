import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { identityLookupValue } from "@/ee/messaging/identity-lookup";
import { presetId } from "@/features/records/crm-preset";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { LEGACY_TIMESTAMPS, populateLegacyWorkspace, type LegacyWorkspace } from "@/tests/helpers/legacy-crm-fixture";
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
  const [value] = await rows<{ state: string; value: string | null; currency: string | null }>(
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

async function noDrift(url: string) {
  const scratch = resolve(".runs/migration-tests");
  await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(resolve(scratch, "diff-"));
  try {
    const config = resolve(directory, "prisma.config.ts");
    await writeFile(
      config,
      `export default { schema: ${JSON.stringify(resolve("prisma/schema.prisma"))}, datasource: { url: ${JSON.stringify(url)} } };\n`,
    );
    return await prismaCli(
      [
        "migrate",
        "diff",
        "--config",
        config,
        "--from-config-datasource",
        "--to-schema",
        resolve("prisma/schema.prisma"),
        "--exit-code",
      ],
      url,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describeDatabase("configurable records migration", { timeout: 240000 }, () => {
  afterAll(async () => {
    for (const database of databases) await database.close();
  }, 120000);

  it("converts a populated legacy workspace with exact values, identities, history and presentation", async () => {
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
    ).toEqual([{ protectedKind: "membershipAuthorization", systemData: { relatedUserId: f.member.id } }]);

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
      jsonValue: { start: "2026-09-28T12:34:56.123456+02:00", end: "2026-09-28T16:34:56.654321+02:00" },
      start: "2026-09-28T10:34:56.123456",
      end: "2026-09-28T14:34:56.654321",
    });
    expect(await custom(f.contacts.solo, f.columns.emails)).toMatchObject({
      textListValue: ["one@example.test", " two@example.test"],
    });
    expect(await custom(f.contacts.solo, f.columns.phone)).toMatchObject({ state: "missing", textValue: null });
    expect(await custom(f.services.a, f.columns.note)).toMatchObject({ textValue: "with, comma" });
    expect(await custom(f.deals.weighted, f.columns.stage)).toMatchObject({ textValue: "proposal" });
    expect(await custom(f.contacts.solo, id("contact.notes"))).toMatchObject({
      jsonValue: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "A retained note" }] }],
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
        { fieldId: id("deal.totalValue"), sourceTypeId: id("lineItem"), count: 2 },
        { fieldId: id("deal.totalValue"), sourceTypeId: id("service"), count: 2 },
        { fieldId: id("deal.totalQuantity"), sourceTypeId: id("lineItem"), count: 2 },
      ].sort((a, b) => (`${a.fieldId}${a.sourceTypeId}` < `${b.fieldId}${b.sourceTypeId}` ? -1 : 1)),
    );

    // Channel identities keep IDs, aliases and timestamps and are associated with their contact.
    expect(
      await rows(
        client,
        'SELECT value, "messagingId", "createdAt" FROM "RecordIdentity" WHERE "companyId"=$1 AND id=$2',
        [f.companyId, f.identities.linkedin],
      ),
    ).toEqual([{ value: "person", messagingId: "provider-person", createdAt: new Date("2021-02-03T04:05:06.789Z") }]);
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

    // Configuration history: legacy model, activity paths, presentation, German terminology, channels.
    expect(
      await rows(
        client,
        'SELECT revision, "actorId" FROM "RecordSchemaRevision" WHERE "companyId"=$1 ORDER BY revision',
        [f.companyId],
      ),
    ).toEqual([
      { revision: 1, actorId: f.admin.id },
      { revision: 2, actorId: "system:record-migration:v4" },
      { revision: 3, actorId: "system:record-migration:v5" },
      { revision: 4, actorId: "migration:legacy-terminology" },
      { revision: 5, actorId: "system:shared-channel-migration" },
    ]);
    expect(
      await rows(
        client,
        'SELECT revision, "storageMode", "activeOperationId" FROM "RecordSchemaState" WHERE "companyId"=$1',
        [f.companyId],
      ),
    ).toEqual([{ revision: 5, storageMode: "generic", activeOperationId: null }]);
    const [latest] = await rows<{
      snapshot: {
        revision: number;
        types: { id: string; label: string; pluralLabel: string }[];
        fields: { id: string; label: string }[];
        capabilities: { kind: string }[];
      };
    }>(client, 'SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1 AND revision=5', [f.companyId]);
    expect(latest.snapshot.revision).toBe(5);
    expect(latest.snapshot.types.find((type) => type.id === id("contact"))).toMatchObject({
      label: "Person",
      pluralLabel: "Personen",
    });
    expect(latest.snapshot.fields.find((field) => field.id === f.columns.budget)?.label).toBe("Budget");
    expect(latest.snapshot.capabilities).toContainEqual(
      expect.objectContaining({ kind: "channels", enabled: true, providerAvatar: true }),
    );
    expect(
      await rows(client, 'SELECT label, "pluralLabel" FROM "RecordTypeDefinition" WHERE "companyId"=$1 AND id=$2', [
        f.companyId,
        id("contact"),
      ]),
    ).toEqual([{ label: "Person", pluralLabel: "Personen" }]);
    expect(
      (
        await rows<{ definition: { label: string } }>(
          client,
          'SELECT definition FROM "RecordFieldDefinition" WHERE "companyId"=$1 AND id=$2',
          [f.companyId, f.columns.budget],
        )
      )[0].definition.label,
    ).toBe("  Budget  ");

    // Presentation state.
    const board = (
      await rows<Record<string, unknown>>(client, 'SELECT * FROM "DataView" WHERE id=$1', [f.views.board])
    )[0];
    expect(board).toMatchObject({
      surfaceKey: `records:${id("deal")}`,
      filters: [
        { field: "system:assignedTo", operator: "in", value: [f.admin.id] },
        { field: id("deal.totalValue"), operator: "gt", value: "100" },
      ],
      sortDescriptor: { field: id("deal.name"), direction: "asc" },
      grouping: { field: f.columns.stage },
      groupingColumnId: f.columns.stage,
      columnOrder: [id("deal.name"), f.columns.stage, `path:${id("deal.services.path")}`],
      hiddenColumns: ["system:updatedAt", `relationship:${id("lineItem.deal")}:incoming`],
      columnWidths: { [id("deal.name")]: 220.5 },
    });
    expect(
      (
        await rows(client, 'SELECT "p13nId","viewStateKeys","activeViewKey","columnOrder" FROM "P13n" WHERE id=$1', [
          f.preferences.list,
        ])
      )[0],
    ).toEqual({
      p13nId: `records:${id("deal")}`,
      viewStateKeys: [
        "filters",
        "sortDescriptor",
        "pageSize",
        "viewMode",
        "columnOrder",
        "columnWidths",
        "hiddenColumns",
      ],
      activeViewKey: f.views.board,
      columnOrder: [id("deal.name")],
    });
    expect(
      (
        await rows(client, 'SELECT "p13nId","columnOrder","detailOptions" FROM "P13n" WHERE id=$1', [
          f.preferences.detail,
        ])
      )[0],
    ).toEqual({
      p13nId: `record-detail:${id("contact")}`,
      columnOrder: [id("contact.name"), "system:assignedTo"],
      detailOptions: {
        starredFieldIds: [id("contact.name")],
        hiddenFieldIds: ["system:createdAt"],
        collapsedSectionIds: ["relations"],
      },
    });
    expect(
      (await rows<{ filters: unknown }>(client, 'SELECT filters FROM "P13n" WHERE id=$1', [f.preferences.timeline]))[0]
        .filters,
    ).toEqual([
      { field: `records:${id("contact")}`, operator: "in", value: [f.contacts.solo] },
      { field: "timelineKind", operator: "in", value: ["changes"] },
    ]);
    const value = (
      await rows<{ measure: Record<string, unknown>; displayOptions: unknown; version: number }>(
        client,
        'SELECT measure, "displayOptions", version FROM "Widget" WHERE id=$1',
        [f.widgets.value],
      )
    )[0];
    expect(value).toEqual({
      measure: {
        source: { typeId: id("deal"), filters: [], relationships: [], relatedFilters: [] },
        aggregation: "sum",
        valueFieldId: id("deal.totalValue"),
        groupBy: { path: [], fieldId: f.columns.stage },
        groupLimit: 1000,
      },
      displayOptions: { displayType: "horizontalBarChart", showLegend: false },
      version: 1,
    });
    expect(
      (
        await rows<{ activityQuery: unknown; displayOptions: unknown }>(
          client,
          'SELECT "activityQuery","displayOptions" FROM "Widget" WHERE id=$1',
          [f.widgets.activity],
        )
      )[0],
    ).toEqual({
      activityQuery: {
        scope: { records: [], typeIds: [] },
        kinds: ["audit", "message", "activity", "calendar_event"],
        filters: [
          { kind: "record", typeId: id("contact"), operator: "in", recordIds: [f.contacts.solo] },
          { kind: "source", operator: "in", values: ["audit", "activity", "calendar_event"] },
        ],
      },
      displayOptions: { showFilters: true },
    });

    // Triggers: generic events, one subscription each; converted routines keep no legacy field names.
    expect(
      await rows(client, 'SELECT "triggerEvents","changedFields","triggerFilters" FROM "Routine" WHERE id=$1', [
        f.routine,
      ]),
    ).toEqual([
      { triggerEvents: ["messaging.message.received", "record.updated"], changedFields: [], triggerFilters: [] },
    ]);
    const [routine] = await rows<{ ownerUserId: string; events: string[]; sources: unknown[] }>(
      client,
      'SELECT "ownerUserId", events, sources FROM "RecordEventSubscription" WHERE id=$1',
      [f.routine],
    );
    expect(routine).toEqual({
      ownerUserId: f.admin.id,
      events: ["record.updated"],
      sources: [
        {
          query: {
            typeId: id("contact"),
            filters: [{ fieldId: id("contact.lastName"), operator: "notEmpty", value: null }],
            relationships: [],
            relatedFilters: [],
          },
          changedFieldIds: [id("contact.firstName"), f.columns.emails],
          events: ["record.updated"],
        },
      ],
    });
    expect(await rows(client, 'SELECT events, enabled FROM "Webhook" WHERE id=$1', [f.webhook])).toEqual([
      { events: ["messaging.message.received", "record.created", "record.updated"], enabled: true },
    ]);
    expect(
      await rows(client, 'SELECT kind, enabled, events FROM "RecordEventSubscription" WHERE id=$1', [f.webhook]),
    ).toEqual([{ kind: "webhook", enabled: true, events: ["record.created", "record.updated"] }]);
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
  });

  it("applies the documented repairs and reconciles them", async () => {
    const { client } = await legacyDatabase();
    const f = await populateLegacyWorkspace(client);
    const id = (key: string) => presetId(f.companyId, key);
    const deleted = randomUUID();
    const inactive = await f.db.user.create({
      data: {
        companyId: f.companyId,
        roleId: f.adminRole.id,
        firstName: "Gone",
        lastName: "User",
        status: "inactive",
        email: `${randomUUID()}@example.test`,
      },
    });
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
    const view = await f.db.dataView.create({
      data: {
        companyId: f.companyId,
        userId: f.admin.id,
        surfaceKey: "deals-card-store",
        name: "Stale",
        position: 2,
        pageSize: 1000,
        filters: [
          { field: deleted, operator: "isNull" },
          { field: f.columns.stage, operator: "in", value: ["removed"] },
          { field: f.columns.stage, operator: "notIn", value: ["proposal", "removed"] },
        ],
        sortDescriptor: { field: deleted, direction: "desc" },
        grouping: { field: deleted },
        groupingColumnId: deleted,
        columnOrder: ["name", deleted],
        hiddenColumns: [deleted],
        columnWidths: { [deleted]: 100, name: 150 },
      },
    });
    await client.query('UPDATE "P13n" SET pagination = $2, "activeViewKey" = $3 WHERE id = $1', [
      f.preferences.list,
      JSON.stringify({ page: 1, pageSize: 1000 }),
      randomUUID(),
    ]);
    const small = await f.db.p13n.create({
      data: {
        companyId: f.companyId,
        userId: f.member.id,
        p13nId: "deals-card-store",
        pagination: { pageSize: 3 },
        columnOrder: [],
        hiddenColumns: [],
      },
    });
    const widget = await f.db.widget.create({
      data: {
        companyId: f.companyId,
        userId: f.admin.id,
        name: "Filtered",
        kind: "chart",
        entityType: "deal",
        aggregationType: "count",
        groupByType: "none",
        entityFilters: [
          { field: f.columns.stage, operator: "notIn", value: ["removed"] },
          { field: f.columns.stage, operator: "in", value: ["removed"] },
        ],
      },
    });
    const disabled = await f.db.webhook.create({
      data: { companyId: f.companyId, url: "https://receiver.example.test/x", events: ["deal.created"], enabled: true },
    });
    await f.db.auditLog.create({
      data: {
        companyId: f.companyId,
        userId: inactive.id,
        entityId: disabled.id,
        event: "webhook.created",
        eventData: {},
      },
    });
    const orphan = await f.db.webhook.create({
      data: { companyId: f.companyId, url: "https://receiver.example.test/y", events: ["task.updated"], enabled: true },
    });
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
    ).toEqual({ textListValue: ["https://Acme.Example/team", " https://ok.test"] });
    expect(
      (
        await rows(client, 'SELECT "textListValue" FROM "RecordValue" WHERE "fieldId"=$1 AND "recordId"=$2', [
          f.columns.sites,
          f.organizations.shared,
        ])
      )[0],
    ).toEqual({ textListValue: ["https://example.test/a", "https://example.test/b"] });
    expect(
      (
        await rows(
          client,
          'SELECT filters, "sortDescriptor", grouping, "groupingColumnId", "columnOrder", "hiddenColumns", "columnWidths", "pageSize" FROM "DataView" WHERE id=$1',
          [view.id],
        )
      )[0],
    ).toEqual({
      filters: [
        { field: f.columns.stage, operator: "in", value: [] },
        { field: f.columns.stage, operator: "notIn", value: ["proposal"] },
      ],
      sortDescriptor: null,
      grouping: null,
      groupingColumnId: null,
      columnOrder: [id("deal.name")],
      hiddenColumns: [`relationship:${id("lineItem.deal")}:incoming`],
      columnWidths: { [id("deal.name")]: 150 },
      pageSize: 100,
    });
    expect(
      (await rows(client, 'SELECT pagination, "activeViewKey" FROM "P13n" WHERE id=$1', [f.preferences.list]))[0],
    ).toEqual({ pagination: { page: 1, pageSize: 100 }, activeViewKey: null });
    expect((await rows(client, 'SELECT pagination FROM "P13n" WHERE id=$1', [small.id]))[0]).toEqual({
      pagination: { pageSize: 5 },
    });
    expect(
      (
        await rows<{ measure: { source: { filters: unknown[] } } }>(
          client,
          'SELECT measure FROM "Widget" WHERE id=$1',
          [widget.id],
        )
      )[0].measure.source.filters,
    ).toEqual([{ fieldId: f.columns.stage, operator: "in", value: null, values: [] }]);
    expect(
      await rows(
        client,
        'SELECT w.enabled, s."ownerUserId", s.enabled AS subscribed FROM "Webhook" w JOIN "RecordEventSubscription" s ON s.id = w.id WHERE w.id=$1',
        [disabled.id],
      ),
    ).toEqual([{ enabled: false, ownerUserId: inactive.id, subscribed: false }]);
    expect(
      await rows(
        client,
        'SELECT w.enabled, s."ownerUserId", s.enabled AS subscribed FROM "Webhook" w JOIN "RecordEventSubscription" s ON s.id = w.id WHERE w.id=$1',
        [orphan.id],
      ),
    ).toEqual([{ enabled: true, ownerUserId: f.admin.id, subscribed: true }]);
  });

  it("disables a webhook without provable creator and without an active administrator", async () => {
    const { client } = await legacyDatabase();
    const f = await populateLegacyWorkspace(client);
    await client.query("UPDATE \"User\" SET status = 'inactive' WHERE id = $1", [f.admin.id]);
    await client.query('UPDATE "Routine" SET "ownerUserId" = $2 WHERE id = $1', [f.routine, f.member.id]);
    await client.query('DELETE FROM "AuditLog" WHERE "entityId" = $1', [f.webhook]);
    await applyConfigurableRecordsMigration(client);
    expect(await rows(client, 'SELECT enabled, events FROM "Webhook" WHERE id=$1', [f.webhook])).toEqual([
      { enabled: false, events: ["messaging.message.received", "record.created", "record.updated"] },
    ]);
    expect(await rows(client, 'SELECT id FROM "RecordEventSubscription" WHERE id=$1', [f.webhook])).toEqual([]);
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
    expect((await noDrift(database.url)).code).toBe(0);
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
          "SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state = 'active' AND query LIKE '%Configurable records: the complete, one-step upgrade%' AND now() - query_start > interval '1 second'",
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
    expect((await noDrift(empty.url)).code).toBe(0);
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
    expect((await noDrift(production.url)).code).toBe(0);
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
