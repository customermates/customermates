import type { Client } from "pg";

import { afterAll, describe, expect, it } from "vitest";
import { presetId } from "@/features/records/crm-preset";
import { RecordModelSchema, type RecordModel } from "@/features/records/record-model.schema";
import { duplicateNameIssues } from "@/features/records/record-names";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { populateLegacyWorkspace } from "@/tests/helpers/legacy-crm-fixture";
import {
  CONFIGURABLE_RECORDS_MIGRATION,
  createLegacyMigrationDatabase,
  migrationNames,
  readMigration,
} from "@/tests/helpers/legacy-migration-database";

const UNIQUE_NAMES_MIGRATION = "20261007020000_unique_config_names";
const SELF_RELATION = "6b1f9c58-3f4d-4f7a-9a43-0d9e7a2f1c11";
const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const databases: Awaited<ReturnType<typeof createLegacyMigrationDatabase>>[] = [];

async function currentModel(client: Client, companyId: string): Promise<RecordModel> {
  const { rows } = await client.query(
    'SELECT revision.snapshot FROM "RecordSchemaRevision" revision JOIN "RecordSchemaState" state ON state."companyId" = revision."companyId" AND state.revision = revision.revision WHERE revision."companyId" = $1',
    [companyId],
  );
  return rows[0].snapshot as RecordModel;
}

async function writeModel(client: Client, companyId: string, model: RecordModel) {
  await client.query(
    'UPDATE "RecordSchemaRevision" revision SET snapshot = $2 FROM "RecordSchemaState" state WHERE state."companyId" = revision."companyId" AND state.revision = revision.revision AND revision."companyId" = $1',
    [companyId, JSON.stringify(model)],
  );
  for (const type of model.types) {
    await client.query(
      'UPDATE "RecordTypeDefinition" SET label = $3, "pluralLabel" = $4, definition = $5 WHERE "companyId" = $1 AND id = $2',
      [companyId, type.id, type.label, type.pluralLabel, JSON.stringify(type)],
    );
  }
  for (const field of model.fields) {
    await client.query(
      'UPDATE "RecordFieldDefinition" SET archived = $3, definition = $4 WHERE "companyId" = $1 AND id = $2',
      [companyId, field.id, field.archived, JSON.stringify(field)],
    );
  }
  for (const relation of model.relationships) {
    await client.query('UPDATE "RecordRelationshipDefinition" SET definition = $3 WHERE "companyId" = $1 AND id = $2', [
      companyId,
      relation.id,
      JSON.stringify(relation),
    ]);
  }
}

async function created(client: Client, table: string, companyId: string, ids: string[]) {
  for (const [index, id] of ids.entries()) {
    await client.query(`UPDATE "${table}" SET "createdAt" = $3 WHERE "companyId" = $1 AND id = $2`, [
      companyId,
      id,
      new Date(Date.UTC(2020, 0, index + 1)),
    ]);
  }
}

async function definitionLabels(client: Client, companyId: string) {
  const query = async (sql: string) => (await client.query(sql, [companyId])).rows;
  return {
    types: await query(
      `SELECT id, label, "pluralLabel", definition ->> 'label' AS "definitionLabel" FROM "RecordTypeDefinition" WHERE "companyId" = $1 ORDER BY id`,
    ),
    fields: await query(
      `SELECT id, definition ->> 'label' AS label, definition -> 'options' AS options FROM "RecordFieldDefinition" WHERE "companyId" = $1 ORDER BY id`,
    ),
    relationships: await query(
      `SELECT id, definition ->> 'sourceLabel' AS "sourceLabel", definition ->> 'targetLabel' AS "targetLabel" FROM "RecordRelationshipDefinition" WHERE "companyId" = $1 ORDER BY id`,
    ),
  };
}

function mirrored(model: RecordModel) {
  const sorted = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => (a.id < b.id ? -1 : 1));
  return {
    types: sorted(model.types).map((type) => ({
      id: type.id,
      label: type.label,
      pluralLabel: type.pluralLabel,
      definitionLabel: type.label,
    })),
    fields: sorted(model.fields).map((field) => ({ id: field.id, label: field.label, options: field.options })),
    relationships: sorted(model.relationships.filter((relation) => relation.id !== SELF_RELATION)).map((relation) => ({
      id: relation.id,
      sourceLabel: relation.sourceLabel,
      targetLabel: relation.targetLabel,
    })),
  };
}

describeDatabase("unique configuration names migration", { timeout: 240000 }, () => {
  afterAll(async () => {
    for (const database of databases) await database.close();
  });

  it("renames later duplicates with the first free suffix, keeps the oldest and changes nothing on a second run", async () => {
    const database = await createLegacyMigrationDatabase(databaseUrl);
    databases.push(database);
    const { client } = database;
    const workspace = await populateLegacyWorkspace(client);
    const untouched = await populateLegacyWorkspace(client);
    for (const migration of await migrationNames(
      (entry) => entry >= CONFIGURABLE_RECORDS_MIGRATION && entry < UNIQUE_NAMES_MIGRATION,
    ))
      await client.query(await readMigration(migration));
    const { companyId } = workspace;
    const id = (key: string) => presetId(companyId, key);
    const find = <T extends { id: string }>(items: T[], key: string) => {
      const found = items.find((item) => item.id === id(key));
      if (!found) throw new Error(key);
      return found;
    };

    const model = await currentModel(client, companyId);
    find(model.types, "contact").label = "Contact";
    find(model.fields, "contact.firstName").label = "First name";
    find(model.relationships, "lineItem.deal").sourceLabel = "Deal";
    find(model.types, "organization").label = "  CONTACT ";
    find(model.types, "task").pluralLabel = "Contact (2)";
    find(model.types, "service").pluralLabel = find(model.types, "service").label;
    find(model.fields, "contact.notes").label = "First   NAME";
    Object.assign(find(model.fields, "contact.avatarUrl"), { label: "Fírst name", archived: true });
    find(model.fields, "deal.notes").label = "First name";
    const stage = model.fields.find((field) => field.options.length > 1);
    if (!stage) throw new Error("A field with options is missing");
    stage.options[1] = { ...stage.options[1], label: ` ${stage.options[0].label.toUpperCase()}` };
    find(model.relationships, "lineItem.service").sourceLabel = find(model.relationships, "lineItem.deal").sourceLabel;
    model.relationships.push({
      ...find(model.relationships, "contact.organizations"),
      id: SELF_RELATION,
      sourceTypeId: id("contact"),
      targetTypeId: id("contact"),
      sourceLabel: "Referrals",
      targetLabel: "Referrals",
    });
    await writeModel(client, companyId, model);
    await created(client, "RecordTypeDefinition", companyId, [id("contact"), id("organization"), id("task")]);
    await created(client, "RecordFieldDefinition", companyId, [
      id("contact.firstName"),
      id("contact.notes"),
      id("contact.avatarUrl"),
    ]);
    await created(client, "RecordRelationshipDefinition", companyId, [id("lineItem.deal"), id("lineItem.service")]);
    const otherBefore = await currentModel(client, untouched.companyId);

    await client.query(await readMigration(UNIQUE_NAMES_MIGRATION));

    const after = await currentModel(client, companyId);
    expect(RecordModelSchema.safeParse(after).success).toBe(true);
    expect(duplicateNameIssues(after, { ...after, types: [], fields: [], relationships: [] })).toEqual([]);
    expect(find(after.types, "contact").label).toBe("Contact");
    expect(find(after.types, "organization").label).toBe("CONTACT (3)");
    expect(find(after.types, "task").pluralLabel).toBe("Contact (2)");
    expect(find(after.types, "service").pluralLabel).toBe(find(after.types, "service").label);
    expect(find(after.fields, "contact.firstName").label).toBe("First name");
    expect(find(after.fields, "contact.notes").label).toBe("First NAME (2)");
    expect(find(after.fields, "contact.avatarUrl").label).toBe("Fírst name (3)");
    expect(find(after.fields, "deal.notes").label).toBe("First name");
    const stageAfter = after.fields.find((field) => field.id === stage.id);
    if (!stageAfter) throw new Error(stage.id);
    expect(stageAfter.options[0].label).toBe(stage.options[0].label);
    expect(stageAfter.options[1].label).toBe(`${stage.options[0].label.toUpperCase()} (2)`);
    expect(find(after.relationships, "lineItem.deal").sourceLabel).toBe("Deal");
    expect(find(after.relationships, "lineItem.service").sourceLabel).toBe("Deal (2)");
    expect(after.relationships.find((relation) => relation.id === SELF_RELATION)).toMatchObject({
      sourceLabel: "Referrals",
      targetLabel: "Referrals",
    });
    expect(await definitionLabels(client, companyId)).toEqual(mirrored(after));
    expect(await currentModel(client, untouched.companyId)).toEqual(otherBefore);

    await client.query(await readMigration(UNIQUE_NAMES_MIGRATION));
    expect(await currentModel(client, companyId)).toEqual(after);
  });
});
