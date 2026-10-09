import { randomUUID } from "node:crypto";
import type { Client } from "pg";

import { afterAll, describe, expect, it } from "vitest";
import { presetId } from "@/features/records/crm-preset";
import { recordChannelsField } from "@/features/records/record-channels";
import { RecordModelSchema, type RecordModel } from "@/features/records/record-model.schema";
import { validateRecordModel } from "@/features/records/record-model-validation";
import { RecordRevisionChangeSchema } from "@/features/records/record-revision.schema";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { populateLegacyWorkspace } from "@/tests/helpers/legacy-crm-fixture";
import {
  CONFIGURABLE_RECORDS_MIGRATION,
  createLegacyMigrationDatabase,
  migrationNames,
  readMigration,
} from "@/tests/helpers/legacy-migration-database";

const CHANNELS_FIELD_MIGRATION = "20261009120000_channels_field";
const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const databases: Awaited<ReturnType<typeof createLegacyMigrationDatabase>>[] = [];

type StoredSnapshot = Omit<RecordModel, "capabilities"> & { capabilities: Array<Record<string, unknown>> };

async function rows<T = Record<string, unknown>>(client: Client, sql: string, params: unknown[] = []) {
  return (await client.query(sql, params)).rows as T[];
}

async function current(client: Client, companyId: string) {
  const [row] = await rows<{ snapshot: unknown }>(
    client,
    'SELECT revision.snapshot FROM "RecordSchemaState" state JOIN "RecordSchemaRevision" revision ON revision."companyId" = state."companyId" AND revision.revision = state.revision WHERE state."companyId" = $1',
    [companyId],
  );
  return RecordModelSchema.parse(row.snapshot);
}

async function everyStoredState(client: Client) {
  return {
    revisions: await rows(
      client,
      'SELECT "companyId", revision, snapshot, change FROM "RecordSchemaRevision" ORDER BY "companyId", revision',
    ),
    fields: await rows(
      client,
      'SELECT "companyId", id, "valueType", archived, definition FROM "RecordFieldDefinition" ORDER BY "companyId", id',
    ),
    types: await rows(
      client,
      'SELECT "companyId", id, definition FROM "RecordTypeDefinition" ORDER BY "companyId", id',
    ),
    views: await rows(
      client,
      'SELECT id, "columnOrder", "hiddenColumns", "columnWidths", "groupingColumnId" FROM "DataView" ORDER BY id',
    ),
    personalizations: await rows(
      client,
      'SELECT id, "columnOrder", "hiddenColumns", "columnWidths", "detailOptions" FROM "P13n" ORDER BY id',
    ),
  };
}

async function identityLinks(client: Client) {
  return rows(
    client,
    'SELECT "companyId", "identityId", "typeId", "recordId" FROM "RecordIdentityLink" ORDER BY "companyId", "identityId", "typeId", "recordId"',
  );
}

async function customizeWorkspace(client: Client, companyId: string, userId: string) {
  const id = (key: string) => presetId(companyId, key);
  const [latest] = await rows<{ revision: number; snapshot: StoredSnapshot; actorId: string }>(
    client,
    'SELECT revision, snapshot, "actorId" FROM "RecordSchemaRevision" WHERE "companyId" = $1 ORDER BY revision DESC LIMIT 1',
    [companyId],
  );
  const snapshot = structuredClone(latest.snapshot);
  const organizationChannels = randomUUID();
  const dealChannels = randomUUID();
  const clash = randomUUID();
  snapshot.fields.push({
    id: clash,
    typeId: id("organization"),
    label: " channels ",
    valueType: "text",
    behavior: { kind: "input" },
    required: false,
    archived: true,
    publishedSummary: false,
    options: [],
    position: 40,
  });
  snapshot.capabilities.push(
    { id: organizationChannels, kind: "channels", typeId: id("organization"), fields: [], enabled: false },
    { id: dealChannels, kind: "personIdentity", typeId: id("deal"), fields: [] },
  );
  const organization = snapshot.types.find((type) => type.id === id("organization"));
  organization?.defaults.hiddenColumns.push("system:channels" as never);
  const revision = latest.revision + 1;
  const configuration = (operations: unknown[]) => ({
    version: 1,
    source: { kind: "configuration" },
    causeId: randomUUID(),
    expectedRevision: revision,
    configuration: { expectedRevision: revision, idempotencyKey: randomUUID(), operations },
    references: [{ reference: "$channels", id: organizationChannels }],
    grants: [],
  });
  const added = configuration([
    {
      operation: "putCapability",
      capability: { id: "$channels", kind: "channels", typeId: id("organization"), fields: [], enabled: true },
    },
  ]);
  const deleted = {
    ...configuration([{ operation: "delete", target: { kind: "channels", id: organizationChannels } }]),
    deletions: [
      { target: { kind: "channels", id: organizationChannels }, cascade: [] },
      { target: { kind: "type", id: id("service") }, cascade: [{ kind: "channels", id: organizationChannels }] },
    ],
  };
  await client.query(
    'INSERT INTO "RecordSchemaRevision" ("companyId", revision, "actorId", snapshot, change) VALUES ($1, $2, $3, $4, $5), ($1, $6, $3, $4, $7)',
    [companyId, revision, latest.actorId, snapshot, added, revision + 1, deleted],
  );
  await client.query('UPDATE "RecordSchemaState" SET revision = $2 WHERE "companyId" = $1', [companyId, revision + 1]);
  const view = randomUUID();
  await client.query(
    'INSERT INTO "DataView" (id, "companyId", "userId", "surfaceKey", name, "columnOrder", "hiddenColumns", "columnWidths", "groupingColumnId", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())',
    [
      view,
      companyId,
      userId,
      `records:${id("contact")}`,
      "system:channels stays in the name",
      JSON.stringify([id("contact.name"), "system:channels"]),
      JSON.stringify([]),
      JSON.stringify({ "system:channels": 180 }),
      "system:channels",
    ],
  );
  const listLayout = randomUUID();
  const detailLayout = randomUUID();
  const organizationLayout = randomUUID();
  await client.query(
    'INSERT INTO "P13n" (id, "userId", "companyId", "p13nId", "columnOrder", "hiddenColumns", "detailOptions", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, now()), ($8, $2, $3, $9, $10, $11, $12, now()), ($13, $2, $3, $14, $15, $16, NULL, now())',
    [
      listLayout,
      userId,
      companyId,
      `records:${id("contact")}`,
      ["system:channels", id("contact.name")],
      [],
      null,
      detailLayout,
      `record-detail:${id("contact")}`,
      [],
      ["system:channels"],
      JSON.stringify({ starredFieldIds: ["system:channels"], fieldOrder: ["system:channels", id("contact.name")] }),
      organizationLayout,
      `records:${id("organization")}`,
      ["system:channels", id("organization.name")],
      ["system:channels"],
    ],
  );
  return { organizationChannels, dealChannels, revision, view, listLayout, detailLayout, organizationLayout };
}

describeDatabase("channels field migration", { timeout: 240000 }, () => {
  afterAll(async () => {
    for (const database of databases) await database.close();
  });

  it("turns every channels capability into a field at the end of its list and keeps every identity", async () => {
    const database = await createLegacyMigrationDatabase(databaseUrl);
    databases.push(database);
    const { client } = database;
    const starter = await populateLegacyWorkspace(client);
    const customized = await populateLegacyWorkspace(client, { currency: "chf" });
    for (const migration of await migrationNames(
      (name) => name >= CONFIGURABLE_RECORDS_MIGRATION && name < CHANNELS_FIELD_MIGRATION,
    ))
      await client.query(await readMigration(migration));
    const custom = await customizeWorkspace(client, customized.companyId, customized.admin.id);
    const links = await identityLinks(client);
    expect(links.length).toBeGreaterThan(0);
    await expect(current(client, starter.companyId)).rejects.toThrow();

    await client.query(await readMigration(CHANNELS_FIELD_MIGRATION));
    const converted = await everyStoredState(client);
    await client.query(await readMigration(CHANNELS_FIELD_MIGRATION));
    expect(await everyStoredState(client)).toEqual(converted);
    expect(await identityLinks(client)).toEqual(links);

    for (const row of converted.revisions as Array<{ snapshot: unknown; change: unknown }>) {
      expect(JSON.stringify(row.snapshot)).not.toContain("system:channels");
      expect(JSON.stringify(row.snapshot)).not.toContain('"personIdentity"');
      RecordModelSchema.parse(row.snapshot);
      if (row.change) {
        expect(JSON.stringify(row.change)).not.toMatch(/"kind":\s*"channels"/);
        RecordRevisionChangeSchema.parse(row.change);
      }
    }

    const starterModel = await current(client, starter.companyId);
    const id = (key: string) => presetId(starter.companyId, key);
    expect(validateRecordModel(starterModel).issues).toEqual([]);
    expect(starterModel.capabilities.map((binding) => binding.kind)).not.toContain("channels");
    const contactFields = starterModel.fields.filter((field) => field.typeId === id("contact"));
    const contactChannels = recordChannelsField(starterModel, id("contact"));
    expect(contactChannels).toEqual({
      id: id("capability.identity"),
      typeId: id("contact"),
      label: "Channels",
      valueType: "channels",
      behavior: { kind: "input" },
      required: false,
      format: { providerAvatar: true },
      archived: false,
      publishedSummary: false,
      options: [],
      position:
        Math.max(...contactFields.filter((field) => field !== contactChannels).map((field) => field.position)) + 1,
    });
    expect(starterModel.types.find((type) => type.id === id("contact"))?.defaults.columns).toContain(
      id("capability.identity"),
    );

    const customId = (key: string) => presetId(customized.companyId, key);
    const customizedModel = await current(client, customized.companyId);
    expect(validateRecordModel(customizedModel).issues).toEqual([]);
    expect(recordChannelsField(customizedModel, customId("organization"))).toMatchObject({
      id: custom.organizationChannels,
      label: "Channels (2)",
      archived: true,
      format: { providerAvatar: false },
      position: 41,
    });
    expect(recordChannelsField(customizedModel, customId("deal"))).toMatchObject({
      id: custom.dealChannels,
      label: "Channels",
      archived: false,
      format: { providerAvatar: true },
    });
    expect(customizedModel.types.find((type) => type.id === customId("organization"))?.defaults.hiddenColumns).toEqual(
      expect.not.arrayContaining(["system:channels"]),
    );
    const definitions = converted.fields as Array<{
      companyId: string;
      id: string;
      valueType: string;
      archived: boolean;
    }>;
    expect(
      definitions
        .filter((field) => field.companyId === customized.companyId && field.valueType === "channels")
        .map((field) => [field.id, field.archived])
        .sort(),
    ).toEqual(
      [
        [customId("capability.identity"), false],
        [custom.organizationChannels, true],
        [custom.dealChannels, false],
      ].sort(),
    );

    const history = await rows<{ revision: number; change: unknown }>(
      client,
      'SELECT revision, change FROM "RecordSchemaRevision" WHERE "companyId" = $1 ORDER BY revision',
      [customized.companyId],
    );
    const added = RecordRevisionChangeSchema.parse(history.find((row) => row.revision === custom.revision)?.change);
    expect(added.configuration?.operations).toEqual([
      {
        operation: "putField",
        field: {
          id: "$channels",
          typeId: customId("organization"),
          label: "Channels (2)",
          valueType: "channels",
          behavior: { kind: "input" },
          required: false,
          format: { providerAvatar: false },
          options: [],
          position: 41,
        },
      },
    ]);
    const deleted = RecordRevisionChangeSchema.parse(
      history.find((row) => row.revision === custom.revision + 1)?.change,
    );
    expect(deleted.configuration?.operations).toEqual([
      { operation: "delete", target: { kind: "field", id: custom.organizationChannels } },
    ]);
    expect(deleted.deletions).toEqual([
      { target: { kind: "field", id: custom.organizationChannels }, cascade: [] },
      {
        target: { kind: "type", id: customId("service") },
        cascade: [{ kind: "field", id: custom.organizationChannels }],
      },
    ]);

    const channels = customId("capability.identity");
    expect(converted.views).toContainEqual({
      id: custom.view,
      columnOrder: [customId("contact.name"), channels],
      hiddenColumns: [],
      columnWidths: { [channels]: 180 },
      groupingColumnId: channels,
    });
    expect(converted.personalizations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: custom.listLayout, columnOrder: [channels, customId("contact.name")] }),
        expect.objectContaining({
          id: custom.detailLayout,
          hiddenColumns: [channels],
          detailOptions: { starredFieldIds: [channels], fieldOrder: [channels, customId("contact.name")] },
        }),
        expect.objectContaining({
          id: custom.organizationLayout,
          columnOrder: [customId("organization.name")],
          hiddenColumns: [],
        }),
      ]),
    );
    const [view] = await rows<{ name: string }>(client, 'SELECT name FROM "DataView" WHERE id = $1', [custom.view]);
    expect(view.name).toBe("system:channels stays in the name");
  });
});
