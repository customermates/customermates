import { randomUUID } from "node:crypto";
import type { Client } from "pg";

import { afterAll, describe, expect, it } from "vitest";
import { presetId } from "@/features/records/crm-preset";
import { recordChannelsField } from "@/features/records/record-channels";
import { recordDefaults } from "@/features/records/record-presentation";
import { RecordModelSchema } from "@/features/records/record-model.schema";
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

async function current(client: Client, companyId: string) {
  const [row] = await rows<{ snapshot: unknown }>(
    client,
    'SELECT revision.snapshot FROM "RecordSchemaState" state JOIN "RecordSchemaRevision" revision ON revision."companyId" = state."companyId" AND revision.revision = state.revision WHERE state."companyId" = $1',
    [companyId],
  );
  return RecordModelSchema.parse(row.snapshot);
}

function byId<T extends { id: string }>(items: T[]) {
  return [...items].sort((left, right) => (left.id < right.id ? -1 : 1));
}

describeDatabase("channels field migration", { timeout: 240000 }, () => {
  afterAll(async () => {
    for (const database of databases) await database.close();
  });

  it("adds the Channels field after the contact fields, re-keys kept layouts and keeps every identity", async () => {
    const database = await createLegacyMigrationDatabase(databaseUrl);
    databases.push(database);
    const { client } = database;
    const starter = await populateLegacyWorkspace(client);
    const clashing = await populateLegacyWorkspace(client, { currency: "chf" });
    const clash = await clashing.db.customColumn.create({
      data: { companyId: clashing.companyId, entityType: "contact", type: "plain", label: " channels ", options: null },
    });
    const id = (key: string) => presetId(starter.companyId, key);
    const view = randomUUID();
    await client.query(
      'INSERT INTO "DataView" (id, "companyId", "userId", "surfaceKey", name, "columnOrder", "hiddenColumns", "columnWidths", "groupingColumnId", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())',
      [
        view,
        starter.companyId,
        starter.admin.id,
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
        starter.admin.id,
        starter.companyId,
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
    const identities = await rows<{ id: string }>(
      client,
      'SELECT id, "companyId", "contactId", provider, "channelClass", value FROM "ContactIdentifier"',
    );
    expect(identities.length).toBeGreaterThan(0);

    await applyConfigurableRecordsMigration(client);

    for (const [workspace, label] of [
      [starter, "Channels"],
      [clashing, "Channels (2)"],
    ] as const) {
      const model = await current(client, workspace.companyId);
      const contact = presetId(workspace.companyId, "contact");
      expect(validateRecordModel(model).issues).toEqual([]);
      expect(model.capabilities.map((capability) => capability.kind)).not.toContain("channels");
      expect(model.types.some((type) => "defaults" in type)).toBe(false);
      const channels = recordChannelsField(model, contact);
      expect(channels).toEqual({
        id: presetId(workspace.companyId, "capability.identity"),
        typeId: contact,
        label,
        valueType: "channels",
        behavior: { kind: "input" },
        required: false,
        format: { providerAvatar: true },
        archived: false,
        publishedSummary: false,
        options: [],
        position:
          Math.max(
            ...model.fields
              .filter((field) => field.typeId === contact && field !== channels)
              .map((field) => field.position),
          ) + 1,
      });
      expect(model.fields.filter((field) => field.valueType === "channels")).toEqual([channels]);
      expect(recordDefaults(contact, model.fields).columnOrder).toContain(channels?.id);
      expect(
        await rows(
          client,
          'SELECT definition FROM "RecordFieldDefinition" WHERE "companyId" = $1 AND "valueType" = $2',
          [workspace.companyId, "channels"],
        ),
      ).toEqual([{ definition: channels }]);
    }
    expect((await current(client, clashing.companyId)).fields.find((field) => field.id === clash.id)?.label).toBe(
      "channels",
    );

    const channels = id("capability.identity");
    expect(
      await rows(
        client,
        'SELECT name, "columnOrder", "hiddenColumns", "columnWidths", "groupingColumnId" FROM "DataView" WHERE id = $1',
        [view],
      ),
    ).toEqual([
      {
        name: "system:channels stays in the name",
        columnOrder: [id("contact.name"), channels],
        hiddenColumns: [],
        columnWidths: { [channels]: 180 },
        groupingColumnId: channels,
      },
    ]);
    expect(
      byId(
        await rows<{ id: string }>(
          client,
          'SELECT id, "columnOrder", "hiddenColumns", "detailOptions" FROM "P13n" WHERE id = ANY($1)',
          [[listLayout, detailLayout, organizationLayout]],
        ),
      ),
    ).toEqual(
      byId([
        { id: listLayout, columnOrder: [channels, id("contact.name")], hiddenColumns: [], detailOptions: null },
        {
          id: detailLayout,
          columnOrder: [],
          hiddenColumns: [channels],
          detailOptions: { starredFieldIds: [channels], fieldOrder: [channels, id("contact.name")] },
        },
        { id: organizationLayout, columnOrder: [id("organization.name")], hiddenColumns: [], detailOptions: null },
      ]),
    );
    expect(
      byId(
        await rows<{ id: string }>(
          client,
          'SELECT identity.id, identity."companyId", link."recordId" AS "contactId", identity.provider, identity."channelClass", identity.value FROM "RecordIdentity" identity JOIN "RecordIdentityLink" link ON link."companyId" = identity."companyId" AND link."identityId" = identity.id',
        ),
      ),
    ).toEqual(byId(identities));
    expect(await rows(client, 'SELECT count(*)::int AS count FROM "TrashItem"')).toEqual([{ count: 0 }]);
    expect(
      (
        await rows<{ enumlabel: string }>(
          client,
          `SELECT enumlabel FROM pg_enum WHERE enumtypid = '"TrashKind"'::regtype ORDER BY enumsortorder`,
        )
      ).map((row) => row.enumlabel),
    ).toEqual(["record", "list", "field", "relationship", "view", "widget", "routine", "wikiPage"]);
  });
});
