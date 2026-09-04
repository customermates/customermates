import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const SURFACE = "tasks-card-store";
const CHECK_NAME = "DataViewOverride_viewKey_matches_viewId";

describeDatabase("DataViewOverride viewKey check constraint", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const userId = randomUUID();
  const firstViewId = randomUUID();
  const secondViewId = randomUUID();

  function insertOverride(viewKey: string, viewId: string | null) {
    return client.query(
      `INSERT INTO "DataViewOverride" ("id","companyId","userId","surfaceKey","viewKey","viewId","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)`,
      [randomUUID(), companyId, userId, SURFACE, viewKey, viewId],
    );
  }

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [userId, `check-${userId}@example.invalid`, "Check", "Tester", companyId],
    );
    await client.query(
      `INSERT INTO "DataView" ("id","companyId","userId","surfaceKey","name","updatedAt")
       VALUES ($1,$3,$4,$5,'First',CURRENT_TIMESTAMP), ($2,$3,$4,$5,'Second',CURRENT_TIMESTAMP)`,
      [firstViewId, secondViewId, companyId, userId, SURFACE],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "DataViewOverride" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "DataView" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("still carries the constraint the schema file cannot express", async () => {
    const res = await client.query(
      `SELECT 1 FROM pg_constraint WHERE conname = $1 AND conrelid = '"DataViewOverride"'::regclass`,
      [CHECK_NAME],
    );

    expect(res.rowCount).toBe(1);
  });

  it("rejects an All override that names a view", async () => {
    await expect(insertOverride("__all__", firstViewId)).rejects.toThrow(CHECK_NAME);
  });

  it("rejects an override whose viewId differs from its viewKey", async () => {
    await expect(insertOverride(firstViewId, secondViewId)).rejects.toThrow(CHECK_NAME);
  });

  it("rejects a view override with no viewId", async () => {
    await expect(insertOverride(firstViewId, null)).rejects.toThrow(CHECK_NAME);
  });

  it("accepts the two shapes the repository writes", async () => {
    await expect(insertOverride("__all__", null)).resolves.toMatchObject({ rowCount: 1 });
    await expect(insertOverride(firstViewId, firstViewId)).resolves.toMatchObject({ rowCount: 1 });
  });
});
