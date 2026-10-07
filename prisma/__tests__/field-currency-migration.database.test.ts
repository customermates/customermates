import type { Client } from "pg";

import { afterAll, describe, expect, it } from "vitest";
import { presetId } from "@/features/records/crm-preset";
import { RecordModelSchema } from "@/features/records/record-model.schema";
import { validateRecordModel } from "@/features/records/record-model-validation";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { populateLegacyWorkspace } from "@/tests/helpers/legacy-crm-fixture";
import {
  applyConfigurableRecordsMigration,
  createLegacyMigrationDatabase,
  readMigration,
} from "@/tests/helpers/legacy-migration-database";

const FIELD_CURRENCY_MIGRATION = "20261007000000_field_currency";
const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const databases: Awaited<ReturnType<typeof createLegacyMigrationDatabase>>[] = [];

async function rows<T = Record<string, unknown>>(client: Client, sql: string, params: unknown[] = []) {
  return (await client.query(sql, params)).rows as T[];
}

async function currencyFields(client: Client, companyId: string) {
  const definitions = await rows<{ id: string; currency: string | null }>(
    client,
    `SELECT id, definition #>> '{format,currency}' AS currency FROM "RecordFieldDefinition" WHERE "companyId" = $1 AND "valueType" = 'currency' ORDER BY id`,
    [companyId],
  );
  const [revision] = await rows<{ snapshot: unknown }>(
    client,
    'SELECT revision.snapshot FROM "RecordSchemaRevision" revision JOIN "RecordSchemaState" state ON state."companyId" = revision."companyId" AND state.revision = revision.revision WHERE revision."companyId" = $1',
    [companyId],
  );
  const snapshot = (
    revision.snapshot as {
      fields: Array<{ id: string; valueType: string; format?: unknown }>;
    }
  ).fields
    .filter((field) => field.valueType === "currency")
    .map((field) => ({
      id: field.id,
      currency: (field.format as { currency?: string } | undefined)?.currency ?? null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return {
    definitions,
    snapshot,
    model: RecordModelSchema.parse(revision.snapshot),
  };
}

describeDatabase("field currency migration", { timeout: 240000 }, () => {
  afterAll(async () => {
    for (const database of databases) await database.close();
  });

  it("copies each workspace currency into its money fields without one, then drops the workspace currency", async () => {
    const database = await createLegacyMigrationDatabase(databaseUrl);
    databases.push(database);
    const { client } = database;
    const swiss = await populateLegacyWorkspace(client, { currency: "chf" });
    const euro = await populateLegacyWorkspace(client);
    await applyConfigurableRecordsMigration(client, { later: false });
    const audit = (event: string) =>
      client.query(
        `INSERT INTO "AuditLog" (id, event, "eventData", "companyId", "userId", "entityId") VALUES (gen_random_uuid(), $1, '{}', $2, $3, $2)`,
        [event, swiss.companyId, swiss.admin.id],
      );
    await audit("company.updated");
    await audit("role.created");
    const starter = ["service.amount", "lineItem.savedPrice", "lineItem.effectivePrice", "lineItem.amount"]
      .concat(["deal.totalValue", "deal.weightedValue"])
      .map((key) => presetId(swiss.companyId, key));

    const before = await currencyFields(client, swiss.companyId);
    expect(
      before.definitions
        .filter((field) => field.currency === null)
        .map((field) => field.id)
        .sort(),
    ).toEqual([...starter].sort());
    expect(before.definitions.find((field) => field.id === swiss.columns.budget)?.currency).toBe("USD");

    await client.query(await readMigration(FIELD_CURRENCY_MIGRATION));

    const after = await currencyFields(client, swiss.companyId);
    expect(after.definitions).toEqual(after.snapshot);
    for (const id of starter) expect(after.definitions.find((field) => field.id === id)?.currency, id).toBe("CHF");
    expect(after.definitions.find((field) => field.id === swiss.columns.budget)?.currency).toBe("USD");
    expect(validateRecordModel(after.model).issues).toEqual([]);
    const euroFields = await currencyFields(client, euro.companyId);
    expect(
      new Set(euroFields.definitions.filter((field) => field.id !== euro.columns.budget).map((f) => f.currency)),
    ).toEqual(new Set(["EUR"]));
    expect(validateRecordModel(euroFields.model).issues).toEqual([]);
    expect(
      await rows(
        client,
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'Company' AND column_name = 'currency'`,
      ),
    ).toEqual([]);
    expect(await rows(client, `SELECT to_regtype('"Currency"') AS type`)).toEqual([{ type: null }]);
    expect(
      await rows(
        client,
        `SELECT event FROM "AuditLog" WHERE "companyId" = $1 AND event IN ('company.updated', 'role.created')`,
        [swiss.companyId],
      ),
    ).toEqual([{ event: "role.created" }]);
  });
});
