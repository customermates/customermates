import type { Client } from "pg";

import { afterAll, describe, expect, it } from "vitest";
import { presetId } from "@/features/records/crm-preset";
import { RecordModelSchema } from "@/features/records/record-model.schema";
import { duplicateNameIssues } from "@/features/records/record-names";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { populateLegacyWorkspace } from "@/tests/helpers/legacy-crm-fixture";
import {
  applyConfigurableRecordsMigration,
  createLegacyMigrationDatabase,
} from "@/tests/helpers/legacy-migration-database";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const databases: Awaited<ReturnType<typeof createLegacyMigrationDatabase>>[] = [];

async function stored(client: Client, companyId: string) {
  const [{ snapshot }] = (
    await client.query<{ snapshot: { fields: Array<{ id: string }> } }>(
      'SELECT revision.snapshot FROM "RecordSchemaRevision" revision JOIN "RecordSchemaState" state ON state."companyId" = revision."companyId" AND state.revision = revision.revision WHERE revision."companyId" = $1',
      [companyId],
    )
  ).rows;
  const definitions = (
    await client.query<{ id: string; definition: unknown }>(
      'SELECT id, definition FROM "RecordFieldDefinition" WHERE "companyId" = $1',
      [companyId],
    )
  ).rows;
  return {
    snapshot,
    model: RecordModelSchema.parse(snapshot),
    definitions: Object.fromEntries(definitions.map(({ id, definition }) => [id, definition])),
  };
}

describeDatabase("unique configuration names migration", { timeout: 240000 }, () => {
  afterAll(async () => {
    for (const database of databases) await database.close();
  });

  it("keeps the starter field name and gives later duplicate columns and options the first free suffix", async () => {
    const database = await createLegacyMigrationDatabase(databaseUrl);
    databases.push(database);
    const { client } = database;
    const workspace = await populateLegacyWorkspace(client);
    const untouched = await populateLegacyWorkspace(client);
    const create = async (entityType: string, label: string, createdAt: string) => {
      const { rows } = await client.query<{ id: string }>(
        'INSERT INTO "CustomColumn" (id, "companyId", "entityType", type, label, "createdAt", "updatedAt") VALUES (gen_random_uuid()::text, $1, $2::"EntityType", \'plain\', $3, $4, $4) RETURNING id',
        [workspace.companyId, entityType, label, createdAt],
      );
      return rows[0].id;
    };
    const first = await create("contact", "First name", "2025-06-01T00:00:00Z");
    const second = await create("contact", "FIRST   NAME", "2025-06-02T00:00:00Z");
    const third = await create("contact", "Fírst name", "2025-06-03T00:00:00Z");
    const emoji = String.fromCodePoint(0x1f600).repeat(100);
    const longFirst = await create("organization", emoji, "2025-06-04T00:00:00Z");
    const longSecond = await create("organization", emoji, "2025-06-05T00:00:00Z");
    await client.query(
      `UPDATE "CustomColumn" SET options = jsonb_set(options, '{options,1,label}', '" PROPOSAL "') WHERE id = $1`,
      [workspace.columns.stage],
    );

    await applyConfigurableRecordsMigration(client);

    const converted = await stored(client, workspace.companyId);
    const other = await stored(client, untouched.companyId);
    for (const { snapshot, model, definitions } of [converted, other]) {
      expect(duplicateNameIssues(model, { ...model, types: [], fields: [], relationships: [] })).toEqual([]);
      expect(definitions).toEqual(Object.fromEntries(snapshot.fields.map((field) => [field.id, field])));
    }
    const label = (id: string) => converted.model.fields.find((field) => field.id === id)?.label;
    expect(label(presetId(workspace.companyId, "contact.firstName"))).toBe("First name");
    expect(label(first)).toBe("First name (2)");
    expect(label(second)).toBe("FIRST NAME (3)");
    expect(label(third)).toBe("Fírst name (4)");
    expect(label(longFirst)).toBe(emoji);
    expect(label(longSecond)).toBe(`${String.fromCodePoint(0x1f600).repeat(98)} (2)`);
    const stage = converted.model.fields.find((field) => field.id === workspace.columns.stage);
    expect(stage?.options.map((option) => option.label)).toEqual(["Proposal", "PROPOSAL (2)", "No probability"]);
    const otherLabels = Object.fromEntries(other.model.fields.map((field) => [field.id, field.label]));
    expect(otherLabels).toMatchObject({
      [presetId(untouched.companyId, "contact.firstName")]: "First name",
      [untouched.columns.budget]: "Budget",
      [untouched.columns.stage]: "Stage",
    });
    expect(
      other.model.fields.find((field) => field.id === untouched.columns.stage)?.options.map((option) => option.label),
    ).toEqual(["Proposal", "Zero", "No probability"]);
  });
});
