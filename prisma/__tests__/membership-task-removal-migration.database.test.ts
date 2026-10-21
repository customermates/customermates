import type { Client } from "pg";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { presetId } from "@/features/records/crm-preset";
import { RecordModelSchema } from "@/features/records/record-model.schema";
import { historicalRecordModel } from "@/features/records/historical-record-model";
import { validateRecordModel } from "@/features/records/record-model-validation";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { populateLegacyWorkspace } from "@/tests/helpers/legacy-crm-fixture";
import {
  createLegacyMigrationDatabase,
  DYNAMIC_RECORD_MODEL_MIGRATION,
  migrationDirectories,
  readMigration,
} from "@/tests/helpers/legacy-migration-database";

const MIGRATION = "20261019180000_draft_sends_activity_log_money_rounding_and_membership_tasks";
const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const databases: Awaited<ReturnType<typeof createLegacyMigrationDatabase>>[] = [];

async function rows<T = Record<string, unknown>>(client: Client, sql: string, params: unknown[] = []) {
  return (await client.query(sql, params)).rows as T[];
}

async function count(client: Client, sql: string, params: unknown[] = []) {
  return (await rows<{ count: number }>(client, `SELECT COUNT(*)::integer AS count FROM ${sql}`, params))[0].count;
}

async function applyMigrations(client: Client, include: (name: string) => boolean) {
  for (const migration of await migrationDirectories(include)) await client.query(await readMigration(migration));
}

type Capability = { id: string; kind: string; typeId: string; fields: unknown[] };
type Snapshot = { revision: number; capabilities: Capability[] };

describeDatabase("membership task removal migration", { timeout: 240000 }, () => {
  afterAll(async () => {
    for (const database of databases) await database.close();
  });

  it("removes the protected tasks as the engine deletes a record, the capability from every model read back and the column", async () => {
    const database = await createLegacyMigrationDatabase(databaseUrl);
    databases.push(database);
    const { client } = database;
    const f = await populateLegacyWorkspace(client);
    await applyMigrations(client, (name) => name >= DYNAMIC_RECORD_MODEL_MIGRATION && name < MIGRATION);

    // What the upgrade and the former membership task service left behind: a protected task with a value, a link,
    // an assignment, a channel identity, a record event and a value that another record calculated from it, and the
    // capability in the upgraded model, in a later revision with its recorded configuration and in a staged operation.
    const companyId = f.companyId;
    const id = (key: string) => presetId(companyId, key);
    const task = { typeId: id("task"), recordId: f.tasks.protected };
    expect(
      await rows(client, 'SELECT "protectedKind", "systemData" FROM "CrmRecord" WHERE "companyId"=$1 AND id=$2', [
        companyId,
        task.recordId,
      ]),
    ).toEqual([{ protectedKind: "membershipAuthorization", systemData: { relatedUserId: f.member.id } }]);
    const [upgraded] = await rows<{ snapshot: Snapshot }>(
      client,
      'SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1 AND revision=1',
      [companyId],
    );
    const membership = upgraded.snapshot.capabilities.find(
      (capability) => capability.kind === "membershipAuthorization",
    );
    expect(membership).toMatchObject({ typeId: task.typeId, fields: [] });
    const putMembership = { operation: "putCapability", capability: membership };
    const renamed = { operation: "putType", type: { id: id("contact"), label: "Person" } };
    await client.query(
      'INSERT INTO "RecordSchemaRevision" ("companyId", revision, "actorId", snapshot, change) VALUES ($1, 2, $2, $3, $4)',
      [
        companyId,
        f.admin.id,
        { ...upgraded.snapshot, revision: 2 },
        {
          version: 1,
          source: { kind: "configuration" },
          causeId: randomUUID(),
          expectedRevision: 1,
          configuration: { expectedRevision: 1, idempotencyKey: randomUUID(), operations: [renamed, putMembership] },
          grants: [],
        },
      ],
    );
    await client.query('UPDATE "RecordSchemaState" SET revision = 2 WHERE "companyId"=$1', [companyId]);
    const operationId = randomUUID();
    await client.query(
      `INSERT INTO "RecordOperation" ("companyId", id, "userId", kind, state, "expectedRevision", request, "updatedAt")
       VALUES ($1, $2, $3, 'configuration', 'failed', 2, $4, NOW())`,
      [
        companyId,
        operationId,
        f.admin.id,
        { expectedRevision: 2, idempotencyKey: randomUUID(), operations: [putMembership] },
      ],
    );
    await client.query(
      `INSERT INTO "RecordStageRow" ("companyId", "operationId", kind, key, payload) VALUES ($1, $2, 'schema', 'model', $3)`,
      [companyId, operationId, { ...upgraded.snapshot, revision: 3 }],
    );
    const linkId = randomUUID();
    await client.query(
      `INSERT INTO "RecordLink" ("companyId", id, "relationId", "sourceTypeId", "sourceId", "targetTypeId", "targetId", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [companyId, linkId, id("task.contacts"), task.typeId, task.recordId, id("contact"), f.contacts.solo],
    );
    await client.query(
      'INSERT INTO "RecordAssignment" ("companyId", "typeId", "recordId", "userId") VALUES ($1, $2, $3, $4)',
      [companyId, task.typeId, task.recordId, f.admin.id],
    );
    const identityId = randomUUID();
    await client.query(
      `INSERT INTO "RecordIdentity" ("companyId", id, provider, "channelClass", value, "updatedAt")
       VALUES ($1, $2, 'mail', 'email', 'pending-member@example.test', NOW())`,
      [companyId, identityId],
    );
    await client.query(
      'INSERT INTO "RecordIdentityLink" ("companyId", "identityId", "typeId", "recordId") VALUES ($1, $2, $3, $4)',
      [companyId, identityId, task.typeId, task.recordId],
    );
    const eventId = randomUUID();
    await client.query(
      `INSERT INTO "EventLog" ("companyId", id, "subjectKind", "subjectTypeId", "subjectId", kind, payload)
       VALUES ($1, $2, 'record', $3, $4, 'record.created', '{}')`,
      [companyId, eventId, task.typeId, task.recordId],
    );
    await client.query(
      `INSERT INTO "RecordValueDependency" ("companyId", "typeId", "recordId", "fieldId", "sourceTypeId", "sourceId")
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [companyId, id("contact"), f.contacts.solo, id("contact.firstName"), task.typeId, task.recordId],
    );
    const values = () =>
      count(client, '"RecordValue" WHERE "companyId"=$1 AND "recordId"=$2 AND "typeId"=$3', [
        companyId,
        task.recordId,
        task.typeId,
      ]);
    expect(await values()).toBeGreaterThan(0);
    const ordinaryTasks = await count(
      client,
      '"CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2 AND "protectedKind" IS NULL',
      [companyId, task.typeId],
    );
    expect(ordinaryTasks).toBeGreaterThan(0);

    const member = () =>
      rows(client, 'SELECT status::text, "roleId", "leftAt" FROM "User" WHERE "companyId"=$1 AND id=$2', [
        companyId,
        f.member.id,
      ]);
    const memberBefore = await member();

    await applyMigrations(client, (name) => name === MIGRATION);

    expect(
      await count(client, '"CrmRecord" WHERE "companyId"=$1 AND id=$2 AND "typeId"=$3', [
        companyId,
        task.recordId,
        task.typeId,
      ]),
    ).toBe(0);
    expect(await values()).toBe(0);
    expect(await count(client, '"RecordLink" WHERE "companyId"=$1 AND id=$2', [companyId, linkId])).toBe(0);
    expect(
      await count(client, '"RecordAssignment" WHERE "companyId"=$1 AND "recordId"=$2', [companyId, task.recordId]),
    ).toBe(0);
    expect(await count(client, '"RecordIdentity" WHERE "companyId"=$1 AND id=$2', [companyId, identityId])).toBe(0);
    expect(await count(client, '"EventLog" WHERE "companyId"=$1 AND id=$2', [companyId, eventId])).toBe(1);
    expect(
      await count(client, '"RecordValueDependency" WHERE "companyId"=$1 AND "sourceId"=$2', [companyId, task.recordId]),
    ).toBe(0);
    expect(await count(client, '"CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2', [companyId, task.typeId])).toBe(
      ordinaryTasks,
    );
    expect(
      await count(client, '"CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2 AND id=$3', [
        companyId,
        id("contact"),
        f.contacts.solo,
      ]),
    ).toBe(1);
    expect(await member()).toEqual(memberBefore);
    expect(
      await rows(
        client,
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'CrmRecord' AND column_name = 'protectedKind'`,
      ),
    ).toEqual([]);

    const revisions = await rows<{
      revision: number;
      snapshot: Snapshot;
      change: { configuration?: { operations: unknown[] } } | null;
    }>(client, 'SELECT revision, snapshot, change FROM "RecordSchemaRevision" WHERE "companyId"=$1 ORDER BY revision', [
      companyId,
    ]);
    expect(revisions.map((revision) => revision.revision)).toEqual([1, 2]);
    for (const revision of revisions) {
      const model = RecordModelSchema.parse(historicalRecordModel(revision.snapshot));
      expect(model.capabilities.map((capability) => capability.kind)).toEqual(["avatar"]);
      expect(validateRecordModel(model).issues).toEqual([]);
    }
    expect(revisions[1].change?.configuration?.operations).toEqual([renamed]);
    const [operation] = await rows<{ request: { operations: unknown[] } }>(
      client,
      'SELECT request FROM "RecordOperation" WHERE "companyId"=$1 AND id=$2',
      [companyId, operationId],
    );
    expect(operation.request.operations).toEqual([]);
    const [staged] = await rows<{ payload: Snapshot }>(
      client,
      `SELECT payload FROM "RecordStageRow" WHERE "companyId"=$1 AND "operationId"=$2 AND kind='schema' AND key='model'`,
      [companyId, operationId],
    );
    expect(
      RecordModelSchema.parse(historicalRecordModel(staged.payload)).capabilities.map((capability) => capability.kind),
    ).toEqual(["avatar"]);
    expect(await rows(client, 'SELECT revision FROM "RecordSchemaState" WHERE "companyId"=$1', [companyId])).toEqual([
      { revision: 2 },
    ]);
  });
});
