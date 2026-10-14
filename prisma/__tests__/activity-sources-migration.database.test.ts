import type { Client } from "pg";

import { afterAll, describe, expect, it } from "vitest";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { RecordModelSchema, type RecordModel } from "@/features/records/record-model.schema";
import { validateRecordModel } from "@/features/records/record-model-validation";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { populateLegacyWorkspace } from "@/tests/helpers/legacy-crm-fixture";
import {
  applyConfigurableRecordsMigration,
  createLegacyMigrationDatabase,
} from "@/tests/helpers/legacy-migration-database";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const databases: Awaited<ReturnType<typeof createLegacyMigrationDatabase>>[] = [];

async function rows<T = Record<string, unknown>>(client: Client, sql: string, params: unknown[] = []) {
  return (await client.query(sql, params)).rows as T[];
}

function switches(model: Pick<RecordModel, "relationships">) {
  return Object.fromEntries(
    model.relationships.map((relationship) => [
      relationship.id,
      { messagesOnSource: relationship.messagesOnSource, messagesOnTarget: relationship.messagesOnTarget },
    ]),
  );
}

describeDatabase("activity sources migration", { timeout: 240000 }, () => {
  afterAll(async () => {
    for (const database of databases) await database.close();
  });

  it("writes the message switches of the starter relationships and stores no activity path", async () => {
    const database = await createLegacyMigrationDatabase(databaseUrl);
    databases.push(database);
    const { client } = database;
    const starter = await populateLegacyWorkspace(client);
    const swiss = await populateLegacyWorkspace(client, { currency: "chf" });

    await applyConfigurableRecordsMigration(client);

    for (const { companyId } of [starter, swiss]) {
      const revisions = await rows<{
        revision: number;
        snapshot: { relationships: Array<{ id: string }> };
        change: unknown;
      }>(
        client,
        'SELECT revision, snapshot, change FROM "RecordSchemaRevision" WHERE "companyId" = $1 ORDER BY revision',
        [companyId],
      );
      expect(revisions.map(({ revision, change }) => ({ revision, change }))).toEqual([{ revision: 1, change: null }]);
      const [{ snapshot }] = revisions;
      expect(snapshot).not.toHaveProperty("activityPaths");
      const model = RecordModelSchema.parse(snapshot);
      expect(validateRecordModel(model).issues).toEqual([]);
      expect(switches(model)).toEqual(switches(createCrmPreset(companyId)));
      const id = (key: string) => presetId(companyId, key);
      expect(switches(model)).toMatchObject({
        [id("contact.organizations")]: { messagesOnSource: false, messagesOnTarget: true },
        [id("deal.contacts")]: { messagesOnSource: true, messagesOnTarget: false },
        [id("task.contacts")]: { messagesOnSource: false, messagesOnTarget: false },
      });
      expect(
        model.relationships.filter((relationship) => relationship.messagesOnSource || relationship.messagesOnTarget),
      ).toHaveLength(2);
      const definitions = await rows<{ id: string; definition: unknown }>(
        client,
        'SELECT id, definition FROM "RecordRelationshipDefinition" WHERE "companyId" = $1',
        [companyId],
      );
      expect(Object.fromEntries(definitions.map(({ id, definition }) => [id, definition]))).toEqual(
        Object.fromEntries(snapshot.relationships.map((relationship) => [relationship.id, relationship])),
      );
    }
  });
});
