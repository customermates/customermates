import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createLegacyMigrationDatabase } from "@/tests/helpers/legacy-migration-database";
import { CRM_CONTRACTION_MIGRATION, expandRecordStorage } from "../expand";
import { migrateRecordWorkspace } from "../run";
import { finalizeReconciledRecordWorkspace } from "../v7/finalize";
import { prepareLegacyContraction } from "../v8/prepare";
import { LEGACY_CRM_TABLES } from "../v8/tables";
import { presentationFixture } from "../v5/__tests__/fixture";

const database = getLocalDatabaseTestUrl();
const suite = database ? describe : describe.skip;

async function deploy(environment: NodeJS.ProcessEnv) {
  await new Promise<void>((complete, reject) => {
    const child = spawn(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
      env: environment,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? complete() : reject(new Error("Native migration failed"))));
  });
}

suite("native configurable record upgrade", { timeout: 120000 }, () => {
  it("expands twice, preserves a populated upgrade, and contracts twice through Prisma's migration ledger", async () => {
    const fixture = await createLegacyMigrationDatabase(database, false);
    const environment = { ...process.env, DATABASE_URL: fixture.url, DIRECT_URL: fixture.url };
    try {
      await expandRecordStorage(environment);
      await expandRecordStorage(environment);
      expect(
        (
          await fixture.client.query('SELECT migration_name FROM "_prisma_migrations" WHERE migration_name=$1', [
            CRM_CONTRACTION_MIGRATION,
          ])
        ).rows,
      ).toHaveLength(0);
      const source = await presentationFixture(fixture.client);
      expect((await migrateRecordWorkspace(fixture.client, source.companyId, "backfill", 6)).ok).toBe(true);
      expect((await migrateRecordWorkspace(fixture.client, source.companyId, "reconcile", 6)).ok).toBe(true);
      await finalizeReconciledRecordWorkspace(fixture.client, source.companyId);
      await prepareLegacyContraction(fixture.client);
      const before = (
        await fixture.client.query(
          'SELECT "typeId",id,version,"createdAt","updatedAt" FROM "CrmRecord" WHERE "companyId"=$1 ORDER BY "typeId",id',
          [source.companyId],
        )
      ).rows;
      expect(before.length).toBeGreaterThan(0);
      const previous = (
        await fixture.client.query(
          'SELECT revision,snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1 ORDER BY revision',
          [source.companyId],
        )
      ).rows;
      const previousRevision = previous.at(-1).revision;
      expect(previous.at(-1).snapshot.capabilities).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: "personIdentity" })]),
      );
      await deploy(environment);
      await deploy(environment);
      const after = (
        await fixture.client.query(
          'SELECT "typeId",id,version,"createdAt","updatedAt" FROM "CrmRecord" WHERE "companyId"=$1 ORDER BY "typeId",id',
          [source.companyId],
        )
      ).rows;
      expect(after).toEqual(before);
      const snapshots = (
        await fixture.client.query(
          'SELECT revision,snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1 ORDER BY revision',
          [source.companyId],
        )
      ).rows;
      expect(snapshots.slice(0, -1)).toEqual(previous);
      expect(snapshots.at(-1)).toMatchObject({
        revision: previousRevision + 1,
        snapshot: {
          revision: previousRevision + 1,
          capabilities: expect.arrayContaining([
            expect.objectContaining({
              kind: "channels",
              enabled: true,
              providerAvatar: true,
            }),
          ]),
        },
      });
      expect(
        (
          await fixture.client.query('SELECT revision FROM "RecordSchemaState" WHERE "companyId"=$1', [
            source.companyId,
          ])
        ).rows[0].revision,
      ).toBe(previousRevision + 1);
      expect(
        (
          await fixture.client.query(
            "SELECT name,to_regclass(format('%I',name)) AS table FROM unnest($1::text[]) name",
            [LEGACY_CRM_TABLES],
          )
        ).rows.every((row) => row.table === null),
      ).toBe(true);
      expect(
        (
          await fixture.client.query("SELECT typname FROM pg_type WHERE typname=ANY($1::text[])", [
            ["EntityType", "TaskType", "CustomColumnType", "AggregationType", "WidgetGroupByType"],
          ])
        ).rows,
      ).toHaveLength(0);
      expect(await prepareLegacyContraction(fixture.client)).toMatchObject({ alreadyContracted: true });
    } finally {
      await fixture.close();
    }
  });
});
