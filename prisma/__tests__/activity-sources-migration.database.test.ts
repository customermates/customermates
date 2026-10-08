import { randomUUID } from "node:crypto";
import type { Client } from "pg";

import { afterAll, describe, expect, it } from "vitest";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
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

const ACTIVITY_SOURCES_MIGRATION = "20261007040000_activity_sources";
const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const databases: Awaited<ReturnType<typeof createLegacyMigrationDatabase>>[] = [];

type StoredPath = {
  id: string;
  typeId: string;
  label: string;
  path: Array<{ relationId: string; direction: "incoming" | "outgoing" }>;
  includeMessages: boolean;
  includeAudit: boolean;
  archived: boolean;
};
type StoredSnapshot = Omit<RecordModel, "relationships"> & {
  relationships: Array<Record<string, unknown> & { id: string }>;
  activityPaths?: StoredPath[];
};

async function rows<T = Record<string, unknown>>(client: Client, sql: string, params: unknown[] = []) {
  return (await client.query(sql, params)).rows as T[];
}

async function revisions(client: Client, companyId: string) {
  return rows<{ revision: number; snapshot: StoredSnapshot; change: unknown }>(
    client,
    'SELECT revision, snapshot, change FROM "RecordSchemaRevision" WHERE "companyId" = $1 ORDER BY revision',
    [companyId],
  );
}

async function current(client: Client, companyId: string) {
  return RecordModelSchema.parse((await revisions(client, companyId)).at(-1)?.snapshot);
}

function switches(model: Pick<RecordModel, "relationships">) {
  return Object.fromEntries(
    model.relationships.map((relationship) => [
      relationship.id,
      { messagesOnSource: relationship.messagesOnSource, messagesOnTarget: relationship.messagesOnTarget },
    ]),
  );
}

async function everyStoredState(client: Client) {
  return rows(
    client,
    'SELECT "companyId", revision, snapshot, change FROM "RecordSchemaRevision" ORDER BY "companyId", revision',
  ).then(async (revisionRows) => ({
    revisions: revisionRows,
    definitions: await rows(
      client,
      'SELECT "companyId", id, definition FROM "RecordRelationshipDefinition" ORDER BY "companyId", id',
    ),
  }));
}

async function customizeWorkspace(client: Client, companyId: string) {
  const id = (key: string) => presetId(companyId, key);
  const [latest] = await rows<{ revision: number; snapshot: StoredSnapshot; actorId: string }>(
    client,
    'SELECT revision, snapshot, "actorId" FROM "RecordSchemaRevision" WHERE "companyId" = $1 ORDER BY revision DESC LIMIT 1',
    [companyId],
  );
  const snapshot = structuredClone(latest.snapshot);
  const parentId = randomUUID();
  const parent = {
    id: parentId,
    sourceTypeId: id("organization"),
    targetTypeId: id("organization"),
    sourceLabel: "Parent organization",
    targetLabel: "Subsidiaries",
    sourceCardinality: "one",
    targetCardinality: "many",
    onSourceDelete: "unlink",
    onTargetDelete: "unlink",
    archived: false,
  };
  snapshot.relationships.push(parent);
  const path = (key: string, typeId: string, steps: StoredPath["path"], options: Partial<StoredPath> = {}) => ({
    id: presetId(companyId, `custom:${key}`),
    typeId,
    label: key,
    path: steps,
    includeMessages: true,
    includeAudit: false,
    archived: false,
    ...options,
  });
  snapshot.activityPaths = [
    ...(snapshot.activityPaths ?? []),
    path("subsidiaries", id("organization"), [{ relationId: parentId, direction: "incoming" }]),
    path("archived deal organizations", id("deal"), [{ relationId: id("deal.organizations"), direction: "outgoing" }], {
      archived: true,
    }),
    path("task organization audit", id("task"), [{ relationId: id("task.organizations"), direction: "outgoing" }], {
      includeMessages: false,
      includeAudit: true,
    }),
    path("wrong side", id("organization"), [{ relationId: id("contact.organizations"), direction: "outgoing" }]),
  ];
  const revision = latest.revision + 1;
  const change = {
    version: 1,
    source: { kind: "configuration" },
    causeId: randomUUID(),
    expectedRevision: latest.revision,
    configuration: {
      expectedRevision: latest.revision,
      idempotencyKey: randomUUID(),
      operations: [
        { operation: "putRelationship", relationship: { ...parent, id: "$parent" } },
        {
          operation: "putActivityPath",
          activityPath: path("subsidiaries", id("organization"), [{ relationId: "$parent", direction: "incoming" }]),
        },
      ],
    },
    references: [{ reference: "$parent", id: parentId }],
    grants: [],
  };
  const pathOnly = {
    ...change,
    causeId: randomUUID(),
    expectedRevision: revision,
    configuration: {
      expectedRevision: revision,
      idempotencyKey: randomUUID(),
      operations: [change.configuration.operations[1]],
    },
  };
  const subsidiaries = presetId(companyId, "custom:subsidiaries");
  const lifecycle = {
    ...change,
    causeId: randomUUID(),
    expectedRevision: revision + 1,
    configuration: {
      expectedRevision: revision + 1,
      idempotencyKey: randomUUID(),
      operations: [
        { operation: "delete", target: { kind: "activityPath", id: subsidiaries } },
        { operation: "delete", target: { kind: "type", id: id("service") } },
      ],
    },
    deletions: [
      { target: { kind: "activityPath", id: subsidiaries }, cascade: [] },
      {
        target: { kind: "type", id: id("service") },
        cascade: [
          { kind: "activityPath", id: subsidiaries },
          { kind: "relationship", id: id("lineItem.service") },
        ],
      },
    ],
  };
  await client.query(
    'INSERT INTO "RecordSchemaRevision" ("companyId", revision, "actorId", snapshot, change) VALUES ($1, $2, $3, $4, $5), ($1, $6, $3, $4, $7), ($1, $8, $3, $4, $9)',
    [companyId, revision, latest.actorId, snapshot, change, revision + 1, pathOnly, revision + 2, lifecycle],
  );
  await client.query(
    'INSERT INTO "RecordRelationshipDefinition" ("companyId", id, "sourceTypeId", "targetTypeId", definition, "updatedAt") VALUES ($1, $2, $3, $3, $4, now())',
    [companyId, parentId, id("organization"), parent],
  );
  await client.query('UPDATE "RecordSchemaState" SET revision = $2 WHERE "companyId" = $1', [companyId, revision + 2]);
  return { parentId, revision };
}

describeDatabase("activity sources migration", { timeout: 240000 }, () => {
  afterAll(async () => {
    for (const database of databases) await database.close();
  });

  it("turns one-hop message paths into relationship switches and removes every activity path", async () => {
    const database = await createLegacyMigrationDatabase(databaseUrl);
    databases.push(database);
    const { client } = database;
    const starter = await populateLegacyWorkspace(client);
    const customized = await populateLegacyWorkspace(client, { currency: "chf" });
    for (const migration of await migrationNames(
      (name) => name >= CONFIGURABLE_RECORDS_MIGRATION && name < ACTIVITY_SOURCES_MIGRATION,
    ))
      await client.query(await readMigration(migration));
    const { parentId, revision } = await customizeWorkspace(client, customized.companyId);
    const storedPaths = await rows<{ paths: string }>(
      client,
      `SELECT count(*)::text AS paths FROM "RecordSchemaRevision" revision, jsonb_array_elements(revision.snapshot -> 'activityPaths')`,
    );
    expect(Number(storedPaths[0].paths)).toBeGreaterThan(0);

    await client.query(await readMigration(ACTIVITY_SOURCES_MIGRATION));
    const converted = await everyStoredState(client);
    await client.query(await readMigration(ACTIVITY_SOURCES_MIGRATION));
    expect(await everyStoredState(client)).toEqual(converted);

    for (const row of converted.revisions as Array<{ snapshot: StoredSnapshot; change: unknown }>) {
      expect(row.snapshot).not.toHaveProperty("activityPaths");
      RecordModelSchema.parse(row.snapshot);
      if (row.change) RecordRevisionChangeSchema.parse(row.change);
    }

    const starterModel = await current(client, starter.companyId);
    expect(validateRecordModel(starterModel).issues).toEqual([]);
    expect(switches(starterModel)).toEqual(switches(createCrmPreset(starter.companyId)));
    const id = (key: string) => presetId(starter.companyId, key);
    expect(switches(starterModel)).toMatchObject({
      [id("contact.organizations")]: { messagesOnSource: false, messagesOnTarget: true },
      [id("deal.contacts")]: { messagesOnSource: true, messagesOnTarget: false },
      [id("task.contacts")]: { messagesOnSource: false, messagesOnTarget: false },
    });
    expect(
      starterModel.relationships.filter(
        (relationship) => relationship.messagesOnSource || relationship.messagesOnTarget,
      ),
    ).toHaveLength(2);

    const customizedModel = await current(client, customized.companyId);
    const customId = (key: string) => presetId(customized.companyId, key);
    expect(validateRecordModel(customizedModel).issues).toEqual([]);
    expect(switches(customizedModel)).toEqual({
      ...switches(createCrmPreset(customized.companyId)),
      [parentId]: { messagesOnSource: false, messagesOnTarget: true },
    });
    expect(switches(customizedModel)[customId("deal.organizations")]).toEqual({
      messagesOnSource: false,
      messagesOnTarget: false,
    });
    expect(switches(customizedModel)[customId("task.organizations")]).toEqual({
      messagesOnSource: false,
      messagesOnTarget: false,
    });

    const history = await revisions(client, customized.companyId);
    const relationshipChange = RecordRevisionChangeSchema.parse(
      history.find((row) => row.revision === revision)?.change,
    );
    expect(relationshipChange.configuration?.operations).toEqual([
      {
        operation: "putRelationship",
        relationship: expect.objectContaining({ id: "$parent", messagesOnSource: false, messagesOnTarget: true }),
      },
    ]);
    const pathOnlyChange = RecordRevisionChangeSchema.parse(
      history.find((row) => row.revision === revision + 1)?.change,
    );
    expect(pathOnlyChange.configuration).toBeUndefined();
    const lifecycleChange = RecordRevisionChangeSchema.parse(
      history.find((row) => row.revision === revision + 2)?.change,
    );
    expect(lifecycleChange.configuration?.operations).toEqual([
      { operation: "delete", target: { kind: "type", id: customId("service") } },
    ]);
    expect(lifecycleChange.deletions).toEqual([
      {
        target: { kind: "type", id: customId("service") },
        cascade: [{ kind: "relationship", id: customId("lineItem.service") }],
      },
    ]);
    expect(RecordModelSchema.parse(history[0].snapshot).relationships.every((item) => item.id !== parentId)).toBe(true);

    for (const workspace of [starter, customized]) {
      const definitions = await rows<{ id: string; definition: Record<string, unknown> }>(
        client,
        'SELECT id, definition FROM "RecordRelationshipDefinition" WHERE "companyId" = $1',
        [workspace.companyId],
      );
      const model = await current(client, workspace.companyId);
      expect(
        Object.fromEntries(
          definitions.map(({ id, definition }) => [
            id,
            { messagesOnSource: definition.messagesOnSource, messagesOnTarget: definition.messagesOnTarget },
          ]),
        ),
      ).toEqual(switches(model));
    }
  });
});
