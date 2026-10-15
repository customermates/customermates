import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { configurationActivity } from "@/ee/messaging/activities/configuration-activity";
import { readStoredPersonalizationState, readStoredState } from "@/features/data-view/data-view-row-mapping";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { historicalRecordModel } from "@/features/records/historical-record-model";
import { recordDetailLayoutIsValid } from "@/features/records/record-detail-layout";
import { RecordMeasureSchema } from "@/features/records/record-measure.schema";
import { recordMeasureIsValid } from "@/features/records/record-measure-validation";
import { validateRecordModel } from "@/features/records/record-model-validation";
import { RecordModelSchema } from "@/features/records/record-model.schema";
import { RecordRevisionChangeSchema } from "@/features/records/record-revision.schema";
import { recordViewStateIsValid } from "@/features/records/record-view-state";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import {
  createLegacyMigrationDatabase,
  DYNAMIC_RECORD_MODEL_MIGRATION,
  migrationDirectories,
  readMigration,
} from "@/tests/helpers/legacy-migration-database";

const PHONE_CHANNELS_MIGRATION = "20261014230000_phone_channels";
const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const databases: Awaited<ReturnType<typeof createLegacyMigrationDatabase>>[] = [];

type Json = Record<string, unknown>;
type FixtureField = Json & { id: string; typeId: string; archived: boolean };
type Model = { revision: number; types: Json[]; fields: Json[]; relationships: Json[] } & Json;

async function previousRelease() {
  const database = await createLegacyMigrationDatabase(databaseUrl ?? undefined);
  databases.push(database);
  for (const migration of await migrationDirectories(
    (entry) => entry >= DYNAMIC_RECORD_MODEL_MIGRATION && entry < PHONE_CHANNELS_MIGRATION,
  ))
    await database.client.query(await readMigration(migration));
  return database.client;
}

async function migrate(client: Client) {
  const notices: string[] = [];
  const collect = (notice: { message?: string }) => notices.push(notice.message ?? "");
  client.on("notice", collect);
  try {
    await client.query(await readMigration(PHONE_CHANNELS_MIGRATION));
  } finally {
    client.off("notice", collect);
  }
  return notices;
}

async function inventory(client: Client) {
  const readme = await readFile(resolve("prisma/migrations", PHONE_CHANNELS_MIGRATION, "README.md"), "utf8");
  const query = /```sql\n([\s\S]*?)\n```/.exec(readme)?.[1];
  if (!query) throw new Error("The pre-deploy inventory must contain a SQL query.");
  await client.query("BEGIN READ ONLY");
  try {
    return (await client.query(query)).rows as Array<{
      company_id: string;
      list_id: string;
      field_id: string;
      kept_as_text_because: string | null;
      records_with_values: number;
    }>;
  } finally {
    await client.query("ROLLBACK");
  }
}

async function rows<T = Json>(client: Client, sql: string, params: unknown[] = []) {
  return (await client.query(sql, params)).rows as T[];
}

async function workspace(client: Client, extend: (model: Model, id: (key: string) => string) => void = () => {}) {
  const companyId = randomUUID();
  const admin = randomUUID();
  await client.query('INSERT INTO "Company" (id, "updatedAt") VALUES ($1, now())', [companyId]);
  await client.query(
    'INSERT INTO "User" (id, email, "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, now())',
    [admin, `${admin}@example.test`, "Ada", "Admin", companyId],
  );
  const id = (key: string) => presetId(companyId, key);
  const model = JSON.parse(JSON.stringify(createCrmPreset(companyId))) as Model;
  extend(model, id);
  for (const type of model.types) {
    await client.query(
      'INSERT INTO "RecordTypeDefinition" ("companyId", id, label, "pluralLabel", archived, embedded, position, definition, "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())',
      [companyId, type.id, type.label, type.pluralLabel, type.archived, type.embedded, type.position, type],
    );
  }
  for (const field of model.fields) {
    await client.query(
      'INSERT INTO "RecordFieldDefinition" ("companyId", "typeId", id, "valueType", behavior, archived, definition, "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, now())',
      [
        companyId,
        field.typeId,
        field.id,
        field.valueType,
        (field.behavior as { kind: string }).kind,
        field.archived,
        field,
      ],
    );
  }
  for (const relation of model.relationships) {
    await client.query(
      'INSERT INTO "RecordRelationshipDefinition" ("companyId", id, "sourceTypeId", "targetTypeId", definition, archived, "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, now())',
      [companyId, relation.id, relation.sourceTypeId, relation.targetTypeId, relation, relation.archived],
    );
  }
  await client.query('INSERT INTO "RecordSchemaState" ("companyId", revision) VALUES ($1, $2)', [
    companyId,
    model.revision,
  ]);
  await client.query(
    'INSERT INTO "RecordSchemaRevision" ("companyId", revision, "actorId", snapshot) VALUES ($1, $2, $3, $4)',
    [companyId, model.revision, "system:fixture", model],
  );
  const record = async (typeId: string, values: Record<string, string | string[]>, trashed = false) => {
    const recordId = randomUUID();
    await client.query(
      'INSERT INTO "CrmRecord" ("companyId", "typeId", id, "deletedAt", "updatedAt") VALUES ($1, $2, $3, $4, now())',
      [companyId, typeId, recordId, trashed ? new Date() : null],
    );
    for (const [fieldId, value] of Object.entries(values)) {
      await client.query(
        'INSERT INTO "RecordValue" ("companyId", "typeId", "recordId", "fieldId", state, "textValue", "textListValue", "schemaRevision", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, 1, now())',
        [
          companyId,
          typeId,
          recordId,
          fieldId,
          "value",
          Array.isArray(value) ? null : value,
          Array.isArray(value) ? value : [],
        ],
      );
    }
    return { typeId, recordId };
  };
  return { companyId, admin, id, model, record };
}

async function identityOf(client: Client, companyId: string, value: string) {
  const [identity] = await rows<{ id: string; provider: string; channelClass: string }>(
    client,
    'SELECT identity.id, identity.provider::text AS provider, identity."channelClass" FROM "RecordIdentityKey" key JOIN "RecordIdentity" identity ON identity."companyId" = key."companyId" AND identity.id = key."identityId" WHERE key."companyId" = $1 AND key."channelClass" = $2 AND key.value = $3',
    [companyId, "phone", value],
  );
  if (!identity) return null;
  const links = await rows<{ typeId: string; recordId: string }>(
    client,
    'SELECT "typeId", "recordId" FROM "RecordIdentityLink" WHERE "companyId" = $1 AND "identityId" = $2 ORDER BY "typeId", "recordId"',
    [companyId, identity.id],
  );
  return { ...identity, links };
}

async function storedState(client: Client) {
  const tables = [
    "RecordSchemaState",
    "RecordSchemaRevision",
    "RecordFieldDefinition",
    "RecordValue",
    "RecordIdentity",
    "RecordIdentityKey",
    "RecordIdentityLink",
    "DataView",
    "P13n",
    "Widget",
    "RecordOperation",
  ];
  const state: Record<string, unknown[]> = {};
  for (const table of tables) {
    state[table] = (await rows(client, `SELECT to_jsonb(t) AS row FROM "${table}" t`))
      .map((row) => JSON.stringify(row.row))
      .sort();
  }
  return JSON.stringify(state);
}

function phoneField(typeId: string, label: string, position: number, extra: Json = {}): FixtureField {
  return {
    id: randomUUID(),
    typeId,
    label,
    valueType: "phone",
    behavior: { kind: "input" },
    required: false,
    archived: false,
    publishedSummary: false,
    options: [],
    position,
    ...extra,
  };
}

describeDatabase("phone channels migration", { timeout: 240000 }, () => {
  afterAll(async () => {
    for (const database of databases) await database.close();
  }, 120000);

  it("moves phone fields into Channels, keeps the cases Channels cannot take over as text and cleans references", async () => {
    const client = await previousRelease();
    const fields: Record<string, FixtureField> = {};
    const desk = randomUUID();
    const a = await workspace(client, (model, id) => {
      fields.mobile = phoneField(id("contact"), "Mobile", 40, { format: { onClick: "copy" } });
      fields.oldPhone = phoneField(id("contact"), "Old phone", 41, { archived: true, format: { onClick: "open" } });
      fields.orgPhones = phoneField(id("organization"), "Phones", 40, { multiple: true });
      fields.orgChannelsText = { ...phoneField(id("organization"), "Channels", 41), valueType: "text" };
      fields.itemPhone = phoneField(id("lineItem"), "Supplier phone", 40);
      fields.hotline = phoneField(id("deal"), "Hotline", 40);
      fields.hotlineLabel = {
        ...phoneField(id("deal"), "Hotline label", 41),
        valueType: "text",
        behavior: {
          kind: "formula",
          expression: {
            kind: "operation",
            operator: "concat",
            arguments: [
              { kind: "literal", value: { kind: "text", value: "Call " } },
              { kind: "field", fieldId: fields.hotline.id },
            ],
          },
        },
      };
      fields.fax = phoneField(id("deal"), "Fax", 42);
      fields.supportLine = phoneField(id("service"), "Support line", 40);
      fields.deskNumber = phoneField(desk, "Number", 0);
      model.types.push({
        id: desk,
        label: "Desk",
        pluralLabel: "Desks",
        description: "",
        icon: "list",
        primaryFieldId: fields.deskNumber.id,
        parentRelationshipId: null,
        embedded: false,
        navigationVisible: true,
        archived: false,
        position: model.types.length,
      });
      model.fields.push(...Object.values(fields));
    });
    const { companyId, admin, id } = a;
    const nextPosition = (typeId: string) =>
      Math.max(...a.model.fields.filter((field) => field.typeId === typeId).map((field) => field.position as number)) +
      1;
    const org = id("organization");
    const contact = id("contact");

    const c1 = await a.record(contact, { [fields.mobile.id]: "+4930111111" });
    const c2 = await a.record(contact, {});
    const c3 = await a.record(
      contact,
      { [fields.mobile.id]: " +4930333333 ", [fields.oldPhone.id]: "+4930999999" },
      true,
    );
    const o1 = await a.record(org, {
      [id("organization.name")]: "Acme",
      [fields.orgPhones.id]: ["+4930111111", "+4930222222"],
    });
    const o2 = await a.record(org, { [fields.orgPhones.id]: ["+4915112345678"] });
    await a.record(id("lineItem"), { [fields.itemPhone.id]: "+4940123456" });
    await a.record(id("deal"), {
      [fields.hotline.id]: "+4989123456",
      [fields.fax.id]: "+4989654321",
    });
    await a.record(id("service"), { [fields.supportLine.id]: "+0049 621" });
    await a.record(desk, { [fields.deskNumber.id]: "+4969123456" });

    const whatsapp = randomUUID();
    await client.query(
      'INSERT INTO "RecordIdentity" ("companyId", id, provider, "channelClass", value, "updatedAt") VALUES ($1, $2, $3, $4, $5, now())',
      [companyId, whatsapp, "whatsapp", "phone", "+4915112345678"],
    );
    await client.query(
      'INSERT INTO "RecordIdentityKey" ("companyId", "channelClass", value, "identityId") VALUES ($1, $2, $3, $4)',
      [companyId, "phone", "+4915112345678", whatsapp],
    );
    await client.query(
      'INSERT INTO "RecordIdentityLink" ("companyId", "identityId", "typeId", "recordId") VALUES ($1, $2, $3, $4)',
      [companyId, whatsapp, contact, c2.recordId],
    );

    await client.query(
      'INSERT INTO "RecordEventSubscription" ("companyId", id, kind, "ownerUserId", "typeId", events, "changedFieldIds") VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [companyId, randomUUID(), "webhook", admin, id("deal"), ["record.updated"], [fields.fax.id]],
    );

    const orgName = id("organization.name");
    const phones = fields.orgPhones.id;
    const mobile = fields.mobile.id;
    const view = async (surface: string, state: Json, deletedAt: Date | null = null) =>
      (
        await rows<{ id: string }>(
          client,
          'INSERT INTO "DataView" (id, "companyId", "userId", "surfaceKey", name, filters, "sortDescriptor", grouping, "groupingColumnId", "columnOrder", "columnWidths", "hiddenColumns", "deletedAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now()) RETURNING id',
          [
            randomUUID(),
            companyId,
            admin,
            surface,
            `View ${phones}`,
            JSON.stringify(state.filters ?? null),
            JSON.stringify(state.sortDescriptor ?? null),
            JSON.stringify(state.grouping ?? null),
            null,
            JSON.stringify(state.columnOrder ?? null),
            JSON.stringify(state.columnWidths ?? null),
            JSON.stringify(state.hiddenColumns ?? null),
            deletedAt,
          ],
        )
      )[0].id;
    const orgView = await view(`records:${org}`, {
      filters: [
        { field: phones, operator: "isNotNull" },
        { field: orgName, operator: "isNotNull" },
      ],
      sortDescriptor: { field: phones, direction: "asc" },
      columnOrder: [orgName, phones, fields.orgChannelsText.id],
      columnWidths: { [phones]: 120, [orgName]: 240 },
      hiddenColumns: [phones],
    });
    const trashedView = await view(`records:${org}`, { columnOrder: [orgName, phones] }, new Date());
    const contactView = await view(`records:${contact}`, { sortDescriptor: { field: mobile, direction: "desc" } });
    const dealView = await view(`records:${id("deal")}`, { columnOrder: [fields.hotline.id, fields.fax.id] });

    const personalization = async (p13nId: string, values: Json) =>
      (
        await rows<{ id: string }>(
          client,
          'INSERT INTO "P13n" (id, "userId", "companyId", "p13nId", filters, grouping, "groupingColumnId", "columnOrder", "hiddenColumns", "detailOptions", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now()) RETURNING id',
          [
            randomUUID(),
            admin,
            companyId,
            p13nId,
            JSON.stringify(values.filters ?? null),
            JSON.stringify(values.grouping ?? null),
            values.groupingColumnId ?? null,
            values.columnOrder ?? [],
            values.hiddenColumns ?? [],
            JSON.stringify(values.detailOptions ?? null),
          ],
        )
      )[0].id;
    const orgLayout = await personalization(`records:${org}`, {
      filters: [{ field: phones, operator: "isNotNull" }],
      grouping: { field: phones },
      groupingColumnId: phones,
      columnOrder: [orgName, phones],
      hiddenColumns: [phones],
    });
    const orgDetail = await personalization(`record-detail:${org}`, {
      detailOptions: {
        starredFieldIds: [phones],
        hiddenFieldIds: [],
        fieldOrder: [orgName, phones],
        collapsedSectionIds: [],
      },
    });
    const contactDetail = await personalization(`record-detail:${contact}`, {
      detailOptions: { starredFieldIds: [], collapsedSectionIds: [] },
      columnOrder: [mobile, id("contact.firstName")],
    });

    const widget = async (measure: Json) =>
      (
        await rows<{ id: string }>(
          client,
          'INSERT INTO "Widget" (id, "userId", "companyId", name, measure, "updatedAt") VALUES ($1, $2, $3, $4, $5, now()) RETURNING id',
          [randomUUID(), admin, companyId, "Widget", JSON.stringify(measure)],
        )
      )[0].id;
    const orgWidget = await widget({
      source: {
        typeId: org,
        filters: [
          { fieldId: phones, operator: "notEmpty", value: null },
          { fieldId: orgName, operator: "notEmpty", value: null },
        ],
        relationships: [],
      },
      aggregation: "count",
      valueFieldId: null,
      groupBy: null,
      groupLimit: 100,
    });
    const contactWidget = await widget({
      source: { typeId: contact, filters: [], relationships: [] },
      aggregation: "count",
      valueFieldId: null,
      groupBy: { path: [], fieldId: mobile },
      groupLimit: 100,
    });
    const dealWidget = await widget({
      source: { typeId: id("deal"), filters: [], relationships: [] },
      aggregation: "count",
      valueFieldId: null,
      groupBy: null,
      groupLimit: 100,
    });

    const operation = randomUUID();
    await client.query(
      'INSERT INTO "RecordOperation" ("companyId", id, "userId", kind, state, "expectedRevision", request, "updatedAt") VALUES ($1, $2, $3, $4, $5, 1, $6, now())',
      [companyId, operation, admin, "configuration", "staging", "{}"],
    );
    await client.query(
      'INSERT INTO "RecordStageRow" ("companyId", "operationId", kind, key, payload) VALUES ($1, $2, $3, $4, $5)',
      [companyId, operation, "schema", "model", "{}"],
    );
    await client.query('UPDATE "RecordSchemaState" SET "activeOperationId" = $2 WHERE "companyId" = $1', [
      companyId,
      operation,
    ]);

    const b = await workspace(client);
    const pending = randomUUID();
    await client.query(
      'INSERT INTO "RecordOperation" ("companyId", id, "userId", kind, state, "expectedRevision", request, "updatedAt") VALUES ($1, $2, $3, $4, $5, 1, $6, now())',
      [b.companyId, pending, b.admin, "configuration", "pending", "{}"],
    );
    await client.query('UPDATE "RecordSchemaState" SET "activeOperationId" = $2 WHERE "companyId" = $1', [
      b.companyId,
      pending,
    ]);
    const untouched = JSON.stringify(
      await rows(client, 'SELECT * FROM "RecordFieldDefinition" WHERE "companyId" = $1 ORDER BY id', [b.companyId]),
    );

    const predicted = await inventory(client);
    const notices = await migrate(client);

    expect(predicted).toEqual(
      expect.arrayContaining(
        (
          [
            [fields.mobile, null, 2],
            [fields.oldPhone, "field in Trash", 1],
            [fields.orgPhones, null, 2],
            [fields.itemPhone, "sub-list", 1],
            [fields.hotline, "used by a calculation", 1],
            [fields.fax, "used by a routine or webhook", 1],
            [fields.supportLine, "values that are not phone numbers", 1],
            [fields.deskNumber, "name field of the list", 1],
          ] as const
        ).map(([field, reason, count]) => ({
          company_id: companyId,
          list_id: field.typeId,
          field_id: field.id,
          kept_as_text_because: reason,
          records_with_values: count,
        })),
      ),
    );
    expect(predicted).toHaveLength(8);

    for (const [field, reason] of [
      [fields.oldPhone, "field in Trash"],
      [fields.itemPhone, "sub-list"],
      [fields.hotline, "used by a calculation"],
      [fields.fax, "used by a routine or webhook"],
      [fields.supportLine, "values that are not phone numbers"],
      [fields.deskNumber, "name field of the list"],
    ] as const) {
      expect(notices).toContain(
        `Phone field ${field.id} of list ${field.typeId} in workspace ${companyId} stays a text field: ${reason}`,
      );
    }
    expect(notices).toContain(
      "Phone fields: 2 moved into Channels with 4 numbers on 4 records (1 new Channels fields), 6 kept as text",
    );
    expect(notices).toContain(
      `Background record operation ${operation} of workspace ${companyId} ended: the record model changed`,
    );

    // One configuration revision with a valid model and a readable history entry.
    expect(
      await rows(client, 'SELECT revision, "activeOperationId" FROM "RecordSchemaState" WHERE "companyId" = $1', [
        companyId,
      ]),
    ).toEqual([{ revision: 2, activeOperationId: null }]);
    const [current, previous] = await rows<{ revision: number; actorId: string; snapshot: unknown; change: unknown }>(
      client,
      'SELECT revision, "actorId", snapshot, change FROM "RecordSchemaRevision" WHERE "companyId" = $1 ORDER BY revision DESC',
      [companyId],
    );
    expect(current).toMatchObject({ revision: 2, actorId: "system:phone-channels-upgrade" });
    const model = RecordModelSchema.parse(current.snapshot);
    expect(validateRecordModel(model).issues).toEqual([]);
    expect(model.revision).toBe(2);
    const change = RecordRevisionChangeSchema.parse(current.change);
    const before = RecordModelSchema.parse(historicalRecordModel(previous.snapshot));
    expect(configurationActivity(change, [model, before], new Map()).changes.map((entry) => entry.current)).toEqual([
      "Organizations · Channels (2)",
      "Contacts · Mobile",
      "Contacts · Old phone",
      "Organizations · Phones",
      "Line items · Supplier phone",
      "Deals · Hotline",
      "Deals · Fax",
      "Services · Support line",
      "Desks · Number",
    ]);

    // (a) and (b): the moved fields are gone with their values; the organizations get a Channels field.
    for (const moved of [fields.mobile, fields.orgPhones]) {
      expect(model.fields.some((field) => field.id === moved.id)).toBe(false);
      expect(
        await rows(client, 'SELECT 1 FROM "RecordFieldDefinition" WHERE "companyId" = $1 AND id = $2', [
          companyId,
          moved.id,
        ]),
      ).toEqual([]);
      expect(
        await rows(client, 'SELECT 1 FROM "RecordValue" WHERE "companyId" = $1 AND "fieldId" = $2', [
          companyId,
          moved.id,
        ]),
      ).toEqual([]);
    }
    expect(model.fields.filter((field) => field.valueType === "channels").map((field) => field.typeId)).toEqual([
      contact,
      org,
    ]);
    const orgChannels = model.fields.find((field) => field.valueType === "channels" && field.typeId === org);
    expect(orgChannels).toMatchObject({
      label: "Channels (2)",
      behavior: { kind: "input" },
      required: false,
      archived: false,
      format: { providerAvatar: false },
      position: nextPosition(org),
    });
    expect(
      await rows(client, 'SELECT "valueType", behavior, definition FROM "RecordFieldDefinition" WHERE id = $1', [
        orgChannels?.id,
      ]),
    ).toEqual([{ valueType: "channels", behavior: "input", definition: orgChannels }]);
    expect(model.fields.find((field) => field.id === presetId(companyId, "capability.identity"))?.label).toBe(
      "Channels",
    );

    // (c) one identity per number, (d) a WhatsApp identity is reused, trashed records keep their numbers.
    expect(await identityOf(client, companyId, "+4930111111")).toMatchObject({
      provider: "phone",
      channelClass: "phone",
      links: expect.arrayContaining([c1, o1].map(({ typeId, recordId }) => ({ typeId, recordId }))),
    });
    expect((await identityOf(client, companyId, "+4930111111"))?.links).toHaveLength(2);
    expect(await identityOf(client, companyId, "+4930222222")).toMatchObject({ provider: "phone", links: [o1] });
    expect(await identityOf(client, companyId, "+4930333333")).toMatchObject({ provider: "phone", links: [c3] });
    expect(await identityOf(client, companyId, "+4915112345678")).toMatchObject({
      id: whatsapp,
      provider: "whatsapp",
      links: expect.arrayContaining([c2, o2]),
    });
    expect(
      await rows(client, 'SELECT count(*)::int AS count FROM "RecordIdentity" WHERE "companyId" = $1', [companyId]),
    ).toEqual([{ count: 4 }]);
    for (const number of ["+4930999999", "+4940123456", "+4989123456", "+4989654321", "+4969123456"])
      expect(await identityOf(client, companyId, number)).toBeNull();

    // (e), (f), (g) and the other fallbacks keep their values as text fields.
    for (const kept of [
      fields.oldPhone,
      fields.itemPhone,
      fields.hotline,
      fields.fax,
      fields.supportLine,
      fields.deskNumber,
    ]) {
      const field = model.fields.find((candidate) => candidate.id === kept.id);
      expect(field).toMatchObject({ valueType: "text", archived: kept.archived });
      expect(field?.format?.onClick).toBeUndefined();
      expect(
        await rows(client, 'SELECT "valueType", definition FROM "RecordFieldDefinition" WHERE id = $1', [kept.id]),
      ).toEqual([{ valueType: "text", definition: field }]);
    }
    expect(
      await rows(client, 'SELECT "textValue" FROM "RecordValue" WHERE "fieldId" = ANY ($1) ORDER BY "textValue"', [
        [fields.oldPhone.id, fields.itemPhone.id, fields.supportLine.id, fields.deskNumber.id],
      ]),
    ).toEqual([
      { textValue: "+0049 621" },
      { textValue: "+4930999999" },
      { textValue: "+4940123456" },
      { textValue: "+4969123456" },
    ]);
    expect(model.fields.find((field) => field.id === fields.hotlineLabel.id)?.behavior).toEqual(
      fields.hotlineLabel.behavior,
    );

    // (h) saved views, personal layouts, detail layouts and widgets lose the removed fields like a field deletion.
    const [savedOrgView] = await rows<Json>(client, 'SELECT * FROM "DataView" WHERE id = $1', [orgView]);
    expect(savedOrgView).toMatchObject({
      filters: [{ field: orgName, operator: "isNotNull" }],
      sortDescriptor: {},
      columnOrder: [orgName, fields.orgChannelsText.id],
      columnWidths: { [orgName]: 240 },
      hiddenColumns: [],
    });
    expect(recordViewStateIsValid(org, readStoredState(savedOrgView as never), model)).toBe(true);
    expect(await rows(client, 'SELECT "columnOrder" FROM "DataView" WHERE id = $1', [trashedView])).toEqual([
      { columnOrder: [orgName] },
    ]);
    expect(await rows(client, 'SELECT "sortDescriptor" FROM "DataView" WHERE id = $1', [contactView])).toEqual([
      { sortDescriptor: {} },
    ]);
    expect(await rows(client, 'SELECT "columnOrder" FROM "DataView" WHERE id = $1', [dealView])).toEqual([
      { columnOrder: [fields.hotline.id, fields.fax.id] },
    ]);
    const [layout] = await rows<Json>(client, 'SELECT * FROM "P13n" WHERE id = $1', [orgLayout]);
    expect(layout).toMatchObject({
      filters: [],
      grouping: null,
      groupingColumnId: null,
      columnOrder: [orgName],
      hiddenColumns: [],
    });
    expect(recordViewStateIsValid(org, readStoredPersonalizationState(layout as never), model)).toBe(true);
    const [detail] = await rows<{ detailOptions: { starredFieldIds: string[]; fieldOrder: string[] } }>(
      client,
      'SELECT "detailOptions" FROM "P13n" WHERE id = $1',
      [orgDetail],
    );
    expect(detail.detailOptions).toEqual({
      starredFieldIds: [],
      hiddenFieldIds: [],
      fieldOrder: [orgName],
      collapsedSectionIds: [],
    });
    expect(
      recordDetailLayoutIsValid(
        org,
        { pinnedFields: [], hiddenFields: [], fieldOrder: detail.detailOptions.fieldOrder },
        model,
      ),
    ).toBe(true);
    expect(
      await rows(client, 'SELECT "detailOptions", "columnOrder" FROM "P13n" WHERE id = $1', [contactDetail]),
    ).toEqual([
      {
        detailOptions: {
          starredFieldIds: [],
          hiddenFieldIds: [],
          fieldOrder: [id("contact.firstName")],
          collapsedSectionIds: [],
        },
        columnOrder: [mobile, id("contact.firstName")],
      },
    ]);
    const widgets = new Map(
      (
        await rows<{ id: string; measure: unknown; version: number }>(
          client,
          'SELECT id, measure, version FROM "Widget" WHERE "companyId" = $1',
          [companyId],
        )
      ).map((row) => [row.id, row]),
    );
    expect(widgets.get(orgWidget)).toMatchObject({
      version: 2,
      measure: { source: { filters: [{ fieldId: orgName, operator: "notEmpty", value: null }] } },
    });
    expect(widgets.get(contactWidget)).toMatchObject({ version: 2, measure: { groupBy: null } });
    expect(widgets.get(dealWidget)?.version).toBe(1);
    for (const key of [orgWidget, contactWidget])
      expect(recordMeasureIsValid(RecordMeasureSchema.parse(widgets.get(key)?.measure), model)).toBe(true);

    // Background work of the previous revision ends; other workspaces stay untouched.
    expect(
      await rows(client, 'SELECT state, "errorCode", "leaseUntil" FROM "RecordOperation" WHERE id = $1', [operation]),
    ).toEqual([{ state: "failed", errorCode: "recordSchemaChanged", leaseUntil: null }]);
    expect(await rows(client, 'SELECT 1 FROM "RecordStageRow" WHERE "operationId" = $1', [operation])).toEqual([]);
    expect(
      await rows(client, 'SELECT revision, "activeOperationId" FROM "RecordSchemaState" WHERE "companyId" = $1', [
        b.companyId,
      ]),
    ).toEqual([{ revision: 1, activeOperationId: pending }]);
    expect(await rows(client, 'SELECT state FROM "RecordOperation" WHERE id = $1', [pending])).toEqual([
      { state: "pending" },
    ]);
    expect(
      JSON.stringify(
        await rows(client, 'SELECT * FROM "RecordFieldDefinition" WHERE "companyId" = $1 ORDER BY id', [b.companyId]),
      ),
    ).toBe(untouched);

    // The database refuses new phone fields, and a second run changes nothing.
    await expect(
      client.query(
        'INSERT INTO "RecordFieldDefinition" ("companyId", "typeId", id, "valueType", behavior, definition, "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, now())',
        [companyId, org, randomUUID(), "phone", "input", "{}"],
      ),
    ).rejects.toThrow(/RecordFieldDefinition_valueType_not_phone/);
    const stored = await storedState(client);
    expect(await migrate(client)).toContain(
      "Phone fields: 0 moved into Channels with 0 numbers on 0 records (0 new Channels fields), 0 kept as text",
    );
    expect(await storedState(client)).toBe(stored);
  });

  it("names the history entry when a list already has a Channels field and only moves numbers", async () => {
    const client = await previousRelease();
    let mobile: FixtureField = { id: "", typeId: "", archived: false };
    const a = await workspace(client, (model, id) => {
      mobile = phoneField(id("contact"), "Mobile", 40, { required: true, behavior: { kind: "input" } });
      model.fields.push(mobile);
    });
    const contact = a.id("contact");
    const records = [
      await a.record(contact, { [mobile.id]: "+4930111111" }),
      await a.record(contact, { [mobile.id]: "+4930111111" }),
    ];
    await migrate(client);
    const [revision] = await rows<{ snapshot: unknown; change: unknown }>(
      client,
      'SELECT snapshot, change FROM "RecordSchemaRevision" WHERE "companyId" = $1 AND revision = 2',
      [a.companyId],
    );
    const model = RecordModelSchema.parse(revision.snapshot);
    expect(validateRecordModel(model).issues).toEqual([]);
    expect(RecordRevisionChangeSchema.parse(revision.change).configuration?.operations).toEqual([
      { operation: "deletePermanently", target: { kind: "field", id: mobile.id } },
    ]);
    expect(model.fields.filter((field) => field.typeId === contact && field.valueType === "channels")).toHaveLength(1);
    expect((await identityOf(client, a.companyId, "+4930111111"))?.links).toEqual(
      expect.arrayContaining(records.map(({ typeId, recordId }) => ({ typeId, recordId }))),
    );
  });
});
