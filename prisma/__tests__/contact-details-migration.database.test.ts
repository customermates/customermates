import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";

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

const CONTACT_DETAILS_MIGRATION = "20261019190000_files_addresses_and_contact_details";
const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const databases: Awaited<ReturnType<typeof createLegacyMigrationDatabase>>[] = [];

type Json = Record<string, unknown>;
type FixtureField = Json & { id: string; typeId: string; archived: boolean };
type Model = { revision: number; types: Json[]; fields: Json[]; relationships: Json[] } & Json;

async function previousReleaseDatabase() {
  const database = await createLegacyMigrationDatabase(databaseUrl ?? undefined);
  databases.push(database);
  for (const migration of await migrationDirectories(
    (entry) => entry >= DYNAMIC_RECORD_MODEL_MIGRATION && entry < CONTACT_DETAILS_MIGRATION,
  ))
    await database.client.query(await readMigration(migration));
  return database;
}

async function previousRelease() {
  return (await previousReleaseDatabase()).client;
}

async function migrate(client: Client) {
  await client.query(await readMigration(CONTACT_DETAILS_MIGRATION));
}

async function fieldTypes(client: Client, companyId: string, ids: string[]) {
  const model = await currentModel(client, companyId);
  return Object.fromEntries(ids.map((id) => [id, model.fields.find((field) => field.id === id)?.valueType ?? null]));
}

async function inventory(client: Client) {
  const readme = await readFile(resolve("prisma/migrations", CONTACT_DETAILS_MIGRATION, "README.md"), "utf8");
  const query = /```sql\n([\s\S]*?)\n```/.exec(readme)?.[1];
  if (!query) throw new Error("The pre-deploy inventory must contain a SQL query.");
  await client.query("BEGIN READ ONLY");
  try {
    return (await client.query(query)).rows as Array<{
      company_id: string;
      list_id: string;
      field_id: string;
      value_type: string;
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

type WorkspaceOptions = { language?: string; channelsLabel?: string; email?: string };

async function workspace(
  client: Client,
  extend: (model: Model, id: (key: string) => string) => void = () => {},
  options: WorkspaceOptions = {},
) {
  const companyId = randomUUID();
  const admin = randomUUID();
  const role = randomUUID();
  await client.query('INSERT INTO "Company" (id, "updatedAt") VALUES ($1, now())', [companyId]);
  await client.query(
    'INSERT INTO "UserRole" (id, name, "isSystemRole", "companyId", "updatedAt") VALUES ($1, $2, true, $3, now())',
    [role, "Admin", companyId],
  );
  await client.query(
    'INSERT INTO "User" (id, email, "firstName", "lastName", "companyId", "roleId", "displayLanguage", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7::"Locale", now())',
    [admin, options.email ?? `${admin}@example.test`, "Ada", "Admin", companyId, role, options.language ?? "system"],
  );
  const id = (key: string) => presetId(companyId, key);
  const model = JSON.parse(JSON.stringify(createCrmPreset(companyId))) as Model;
  const starter = model.fields.find((field) => field.id === id("capability.identity"));
  if (starter) starter.label = options.channelsLabel ?? "Channels";
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

async function identityOf(client: Client, companyId: string, value: string, channelClass = "phone") {
  const [identity] = await rows<{ id: string; provider: string; channelClass: string }>(
    client,
    'SELECT identity.id, identity.provider::text AS provider, identity."channelClass" FROM "RecordIdentityKey" key JOIN "RecordIdentity" identity ON identity."companyId" = key."companyId" AND identity.id = key."identityId" WHERE key."companyId" = $1 AND key."channelClass" = $2 AND key.value = $3',
    [companyId, channelClass, value],
  );
  if (!identity) return null;
  const links = await rows<{ typeId: string; recordId: string }>(
    client,
    'SELECT "typeId", "recordId" FROM "RecordIdentityLink" WHERE "companyId" = $1 AND "identityId" = $2 ORDER BY "typeId", "recordId"',
    [companyId, identity.id],
  );
  return { ...identity, links };
}

function contactField(
  valueType: "phone" | "email",
  typeId: string,
  label: string,
  position: number,
  extra: Json = {},
): FixtureField {
  return {
    id: randomUUID(),
    typeId,
    label,
    valueType,
    behavior: { kind: "input" },
    required: false,
    archived: false,
    publishedSummary: false,
    options: [],
    position,
    ...extra,
  };
}

const phoneField = (typeId: string, label: string, position: number, extra: Json = {}) =>
  contactField("phone", typeId, label, position, extra);
const emailField = (typeId: string, label: string, position: number, extra: Json = {}) =>
  contactField("email", typeId, label, position, extra);

async function currentModel(client: Client, companyId: string) {
  const [current] = await rows<{ snapshot: unknown }>(
    client,
    'SELECT revision.snapshot FROM "RecordSchemaState" state JOIN "RecordSchemaRevision" revision ON revision."companyId" = state."companyId" AND revision.revision = state.revision WHERE state."companyId" = $1',
    [companyId],
  );
  return RecordModelSchema.parse(current.snapshot);
}

describeDatabase("contact details migration", { timeout: 240000 }, () => {
  afterAll(async () => {
    for (const database of databases) await database.close();
  }, 120000);

  it("moves phone fields into contact details, keeps the cases it cannot take over as text and repoints references", async () => {
    const client = await previousRelease();
    const fields: Record<string, FixtureField> = {};
    const desk = randomUUID();
    const a = await workspace(client, (model, id) => {
      fields.mobile = phoneField(id("contact"), "Mobile", 40, { format: { onClick: "copy" } });
      fields.oldPhone = phoneField(id("contact"), "Old phone", 41, { archived: true, format: { onClick: "open" } });
      fields.orgPhones = phoneField(id("organization"), "Phones", 40, { multiple: true });
      fields.orgChannelsText = { ...phoneField(id("organization"), "Channels", 41), valueType: "text" };
      fields.orgContactText = { ...phoneField(id("organization"), "Contact details", 43), valueType: "text" };
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

    const b = await workspace(client, undefined, { channelsLabel: "Messaging" });
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
    await migrate(client);

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
          value_type: "phone",
          kept_as_text_because: reason,
          records_with_values: count,
        })),
      ),
    );
    expect(predicted).toHaveLength(8);

    const kept = [fields.oldPhone, fields.itemPhone, fields.hotline, fields.fax, fields.supportLine, fields.deskNumber];
    expect(
      await fieldTypes(client, companyId, [...kept.map((field) => field.id), fields.mobile.id, fields.orgPhones.id]),
    ).toEqual(
      Object.fromEntries([
        ...kept.map((field) => [field.id, "text"]),
        [fields.mobile.id, null],
        [fields.orgPhones.id, null],
      ]),
    );
    expect(
      await rows(client, 'SELECT state::text AS state, "errorCode" FROM "RecordOperation" WHERE id = $1', [operation]),
    ).toEqual([{ state: "failed", errorCode: "recordSchemaChanged" }]);

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
    expect(current).toMatchObject({ revision: 2, actorId: "system:contact-details-upgrade" });
    const model = RecordModelSchema.parse(current.snapshot);
    expect(validateRecordModel(model).issues).toEqual([]);
    expect(model.revision).toBe(2);
    const change = RecordRevisionChangeSchema.parse(current.change);
    const before = RecordModelSchema.parse(historicalRecordModel(previous.snapshot));
    expect(configurationActivity(change, [model, before], new Map()).changes.map((entry) => entry.current)).toEqual([
      "Contacts · Contact details",
      "Organizations · Contact details (2)",
      "Contacts · Mobile",
      "Contacts · Old phone",
      "Organizations · Phones",
      "Line items · Supplier phone",
      "Deals · Hotline",
      "Deals · Fax",
      "Services · Support line",
      "Desks · Number",
    ]);

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
      label: "Contact details (2)",
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
      "Contact details",
    );
    expect(model.fields.find((field) => field.id === fields.orgChannelsText.id)?.label).toBe("Channels");

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

    const target = orgChannels?.id ?? "";
    const [savedOrgView] = await rows<Json>(client, 'SELECT * FROM "DataView" WHERE id = $1', [orgView]);
    expect(savedOrgView).toMatchObject({
      filters: [
        { field: target, operator: "isNotNull" },
        { field: orgName, operator: "isNotNull" },
      ],
      sortDescriptor: {},
      columnOrder: [orgName, target, fields.orgChannelsText.id],
      columnWidths: { [orgName]: 240, [target]: 120 },
      hiddenColumns: [],
    });
    expect(recordViewStateIsValid(org, readStoredState(savedOrgView as never), model)).toBe(true);
    expect(await rows(client, 'SELECT "columnOrder" FROM "DataView" WHERE id = $1', [trashedView])).toEqual([
      { columnOrder: [orgName, target] },
    ]);
    expect(await rows(client, 'SELECT "sortDescriptor" FROM "DataView" WHERE id = $1', [contactView])).toEqual([
      { sortDescriptor: {} },
    ]);
    expect(await rows(client, 'SELECT "columnOrder" FROM "DataView" WHERE id = $1', [dealView])).toEqual([
      { columnOrder: [fields.hotline.id, fields.fax.id] },
    ]);
    const [layout] = await rows<Json>(client, 'SELECT * FROM "P13n" WHERE id = $1', [orgLayout]);
    expect(layout).toMatchObject({
      filters: [{ field: target, operator: "isNotNull" }],
      grouping: null,
      groupingColumnId: null,
      columnOrder: [orgName, target],
      hiddenColumns: [],
    });
    expect(recordViewStateIsValid(org, readStoredPersonalizationState(layout as never), model)).toBe(true);
    const [detail] = await rows<{ detailOptions: { starredFieldIds: string[]; fieldOrder: string[] } }>(
      client,
      'SELECT "detailOptions" FROM "P13n" WHERE id = $1',
      [orgDetail],
    );
    expect(detail.detailOptions).toEqual({
      starredFieldIds: [target],
      hiddenFieldIds: [],
      fieldOrder: [orgName, target],
      collapsedSectionIds: [],
    });
    expect(
      recordDetailLayoutIsValid(
        org,
        {
          pinnedFields: detail.detailOptions.starredFieldIds,
          hiddenFields: [],
          fieldOrder: detail.detailOptions.fieldOrder,
        },
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
          fieldOrder: [id("capability.identity"), id("contact.firstName")],
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
      measure: {
        source: {
          filters: [
            { fieldId: target, operator: "notEmpty", value: null },
            { fieldId: orgName, operator: "notEmpty", value: null },
          ],
        },
      },
    });
    expect(widgets.get(contactWidget)).toMatchObject({ version: 2, measure: { groupBy: null } });
    expect(widgets.get(dealWidget)?.version).toBe(1);
    for (const key of [orgWidget, contactWidget])
      expect(recordMeasureIsValid(RecordMeasureSchema.parse(widgets.get(key)?.measure), model)).toBe(true);

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

    for (const valueType of ["phone", "email"]) {
      await expect(
        client.query(
          'INSERT INTO "RecordFieldDefinition" ("companyId", "typeId", id, "valueType", behavior, definition, "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, now())',
          [companyId, org, randomUUID(), valueType, "input", "{}"],
        ),
      ).rejects.toThrow(/RecordFieldDefinition_valueType_not_retired/);
    }
  });

  it("lets the previous release keep writing identity providers as MessagingProvider values", async () => {
    const client = await previousRelease();
    const { companyId } = await workspace(client);
    await migrate(client);
    const staged = randomUUID();
    const created = randomUUID();
    await client.query(
      `INSERT INTO "RecordIdentity" ("companyId", id, provider, "channelClass", value, "messagingId", "displayName", "profileUrl", "createdAt", "updatedAt")
       SELECT $1, item.data->>'id', (item.data->>'provider')::"MessagingProvider", item.data->>'channelClass', item.data->>'value', NULL, NULL, NULL, now(), now()
       FROM jsonb_array_elements($2::jsonb) AS item(data)`,
      [companyId, JSON.stringify([{ id: staged, provider: "whatsapp", channelClass: "phone", value: "+4930111111" }])],
    );
    await client.query(
      'INSERT INTO "RecordIdentity" ("companyId", id, provider, "channelClass", value, "updatedAt") VALUES ($1, $2, CAST($3::text AS "public"."MessagingProvider"), $4, $5, now())',
      [companyId, created, "mail", "email", "ada@example.test"],
    );
    await client.query(
      'UPDATE "RecordIdentity" SET provider = CAST($1::text AS "public"."MessagingProvider") WHERE "companyId" = $2 AND id = $3',
      ["outlook", companyId, created],
    );
    expect(
      await rows(
        client,
        'SELECT id, provider::text AS provider FROM "RecordIdentity" WHERE "companyId" = $1 ORDER BY "channelClass"',
        [companyId],
      ),
    ).toEqual([
      { id: created, provider: "outlook" },
      { id: staged, provider: "whatsapp" },
    ]);
  });

  it("waits for a write of the previous release that holds its workspace lock instead of deadlocking with it", async () => {
    const database = await previousReleaseDatabase();
    const { companyId } = await workspace(database.client);
    const writer = new Client({ connectionString: database.url });
    await writer.connect();
    try {
      await writer.query("BEGIN");
      await writer.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [companyId]);
      const migration = migrate(database.client);
      const deadline = Date.now() + 20_000;
      while (
        !(
          await writer.query(
            "SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())",
          )
        ).rowCount
      ) {
        if (Date.now() > deadline) throw new Error("The migration never waited for the workspace lock");
        await new Promise((done) => setTimeout(done, 50));
      }
      const identity = randomUUID();
      await writer.query(
        'INSERT INTO "RecordIdentity" ("companyId", id, provider, "channelClass", value, "updatedAt") VALUES ($1, $2, $3::"MessagingProvider", $4, $5, now())',
        [companyId, identity, "whatsapp", "phone", "+4930222222"],
      );
      await writer.query("COMMIT");
      await migration;
      expect(
        await rows(database.client, 'SELECT provider::text AS provider FROM "RecordIdentity" WHERE id = $1', [
          identity,
        ]),
      ).toEqual([{ provider: "whatsapp" }]);
    } finally {
      await writer.end();
    }
  });

  it("names the history entry when a list already has a contact details field and only moves numbers", async () => {
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
      {
        operation: "putField",
        field: expect.objectContaining({ id: a.id("capability.identity"), label: "Contact details" }),
      },
      { operation: "deletePermanently", target: { kind: "field", id: mobile.id } },
    ]);
    expect(model.fields.filter((field) => field.typeId === contact && field.valueType === "channels")).toHaveLength(1);
    expect((await identityOf(client, a.companyId, "+4930111111"))?.links).toEqual(
      expect.arrayContaining(records.map(({ typeId, recordId }) => ({ typeId, recordId }))),
    );
  });
  it("moves email fields into contact details as lowercase mail identities, reusing addresses the inbox knows", async () => {
    const client = await previousRelease();
    const fields: Record<string, FixtureField> = {};
    const a = await workspace(
      client,
      (model, id) => {
        fields.email = emailField(id("contact"), "E-Mail", 40, { format: { onClick: "copy" } });
        fields.workEmails = emailField(id("contact"), "Work emails", 41, { multiple: true });
        fields.billing = emailField(id("organization"), "Billing email", 40);
        fields.dealEmail = emailField(id("deal"), "Contact email", 40);
        fields.oldEmail = emailField(id("task"), "Old email", 40, { archived: true });
        fields.notifyEmail = emailField(id("service"), "Notify email", 40);
        model.fields.push(...Object.values(fields));
      },
      { language: "de", channelsLabel: "Kanäle" },
    );
    const { companyId, admin, id } = a;
    const contact = id("contact");
    const channels = id("capability.identity");
    const c1 = await a.record(contact, {
      [fields.email.id]: "Ada@Example.test",
      [fields.workEmails.id]: ["ada@example.test", "ada.work@example.test"],
    });
    const c2 = await a.record(contact, { [fields.email.id]: "grace@example.test" });
    const c3 = await a.record(contact, { [fields.email.id]: " linus@example.test " }, true);
    const d1 = await a.record(id("deal"), { [fields.dealEmail.id]: "Ada@example.TEST" });
    await a.record(id("organization"), { [fields.billing.id]: "billing at acme" });
    await a.record(id("organization"), { [fields.billing.id]: "billing@acme.test" });
    await a.record(id("task"), { [fields.oldEmail.id]: "old@example.test" });
    await a.record(id("service"), { [fields.notifyEmail.id]: "notify@example.test" });
    await client.query(
      'INSERT INTO "Webhook" (id, url, "companyId", "bodyTemplate", "updatedAt") VALUES ($1, $2, $3, $4, now())',
      [
        randomUUID(),
        "https://hooks.example.invalid/notify",
        companyId,
        `{"to":"{{data.fields.${fields.notifyEmail.id}}}"}`,
      ],
    );

    const gmail = randomUUID();
    await client.query(
      'INSERT INTO "RecordIdentity" ("companyId", id, provider, "channelClass", value, "displayName", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, now())',
      [companyId, gmail, "google", "email", "grace@example.test", "Grace Hopper"],
    );
    await client.query(
      'INSERT INTO "RecordIdentityKey" ("companyId", "channelClass", value, "identityId") VALUES ($1, $2, $3, $4)',
      [companyId, "email", "grace@example.test", gmail],
    );

    const [{ id: contactView }] = await rows<{ id: string }>(
      client,
      'INSERT INTO "DataView" (id, "companyId", "userId", "surfaceKey", name, filters, "sortDescriptor", "columnOrder", "columnWidths", "hiddenColumns", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now()) RETURNING id',
      [
        randomUUID(),
        companyId,
        admin,
        `records:${contact}`,
        "Ada",
        JSON.stringify([
          { field: fields.email.id, operator: "equals", value: "ada@example.test" },
          { field: fields.workEmails.id, operator: "isNull" },
          { field: id("contact.firstName"), operator: "contains", value: "A" },
          { field: fields.workEmails.id, operator: "startsWith", value: "ada" },
        ]),
        JSON.stringify({ field: fields.email.id, direction: "asc" }),
        JSON.stringify([id("contact.name"), fields.email.id, fields.workEmails.id, channels]),
        JSON.stringify({ [fields.email.id]: 200 }),
        JSON.stringify([fields.workEmails.id]),
      ],
    );
    const [{ id: dealWidget }] = await rows<{ id: string }>(
      client,
      'INSERT INTO "Widget" (id, "userId", "companyId", name, measure, "updatedAt") VALUES ($1, $2, $3, $4, $5, now()) RETURNING id',
      [
        randomUUID(),
        admin,
        companyId,
        "Deals with Ada",
        JSON.stringify({
          source: {
            typeId: id("deal"),
            filters: [
              { fieldId: fields.dealEmail.id, operator: "eq", value: { kind: "text", value: "ada@example.test" } },
              { fieldId: fields.dealEmail.id, operator: "startsWith", value: { kind: "text", value: "ada" } },
              { fieldId: fields.dealEmail.id, operator: "empty", value: null },
            ],
            relationships: [],
          },
          aggregation: "count",
          valueFieldId: null,
          groupBy: { path: [], fieldId: fields.dealEmail.id },
          groupLimit: 100,
        }),
      ],
    );

    const predicted = await inventory(client);
    await migrate(client);

    expect(predicted.filter((row) => row.company_id === companyId)).toEqual(
      expect.arrayContaining(
        (
          [
            [fields.email, null, 3],
            [fields.workEmails, null, 1],
            [fields.billing, "values that are not email addresses", 2],
            [fields.dealEmail, null, 1],
            [fields.oldEmail, "field in Trash", 1],
            [fields.notifyEmail, "used by a routine or webhook", 1],
          ] as const
        ).map(([field, reason, count]) => ({
          company_id: companyId,
          list_id: field.typeId,
          field_id: field.id,
          value_type: "email",
          kept_as_text_because: reason,
          records_with_values: count,
        })),
      ),
    );
    expect(
      await fieldTypes(client, companyId, [
        fields.billing.id,
        fields.oldEmail.id,
        fields.notifyEmail.id,
        fields.email.id,
      ]),
    ).toEqual({
      [fields.billing.id]: "text",
      [fields.oldEmail.id]: "text",
      [fields.notifyEmail.id]: "text",
      [fields.email.id]: null,
    });

    const model = await currentModel(client, companyId);
    expect(validateRecordModel(model).issues).toEqual([]);
    expect(model.fields.find((field) => field.id === channels)?.label).toBe("Kontaktdaten");
    const dealChannels = model.fields.find((field) => field.typeId === id("deal") && field.valueType === "channels");
    expect(dealChannels).toMatchObject({ label: "Kontaktdaten", format: { providerAvatar: false } });
    expect(dealChannels?.format?.onClick).toBeUndefined();
    for (const moved of [fields.email, fields.workEmails, fields.dealEmail]) {
      expect(model.fields.some((field) => field.id === moved.id)).toBe(false);
      expect(await rows(client, 'SELECT 1 FROM "RecordValue" WHERE "fieldId" = $1', [moved.id])).toEqual([]);
    }
    for (const kept of [fields.billing, fields.oldEmail, fields.notifyEmail])
      expect(model.fields.find((field) => field.id === kept.id)).toMatchObject({ valueType: "text" });
    expect(
      (
        await rows<{ textValue: string }>(client, 'SELECT "textValue" FROM "RecordValue" WHERE "fieldId" = $1', [
          fields.billing.id,
        ])
      )
        .map((row) => row.textValue)
        .sort(),
    ).toEqual(["billing at acme", "billing@acme.test"]);

    const ada = await identityOf(client, companyId, "ada@example.test", "email");
    expect(ada).toMatchObject({ provider: "mail", channelClass: "email" });
    expect(ada?.links).toEqual(expect.arrayContaining([c1, d1]));
    expect(ada?.links).toHaveLength(2);
    expect(await identityOf(client, companyId, "ada.work@example.test", "email")).toMatchObject({ links: [c1] });
    expect(await identityOf(client, companyId, "grace@example.test", "email")).toMatchObject({
      id: gmail,
      provider: "google",
      links: [c2],
    });
    expect(await identityOf(client, companyId, "linus@example.test", "email")).toMatchObject({ links: [c3] });
    expect(await identityOf(client, companyId, "billing@acme.test", "email")).toBeNull();
    expect(await identityOf(client, companyId, "old@example.test", "email")).toBeNull();
    expect(
      await rows(client, 'SELECT count(*)::int AS count FROM "RecordIdentity" WHERE "companyId" = $1', [companyId]),
    ).toEqual([{ count: 4 }]);

    const [view] = await rows<Json>(client, 'SELECT * FROM "DataView" WHERE id = $1', [contactView]);
    expect(view).toMatchObject({
      filters: [
        { field: channels, operator: "contains", value: "ada@example.test" },
        { field: id("contact.firstName"), operator: "contains", value: "A" },
        { field: channels, operator: "startsWith", value: "ada" },
      ],
      sortDescriptor: {},
      columnOrder: [id("contact.name"), channels],
      columnWidths: { [channels]: 200 },
      hiddenColumns: [],
    });
    expect(recordViewStateIsValid(contact, readStoredState(view as never), model)).toBe(true);
    const [widget] = await rows<{ measure: unknown; version: number }>(
      client,
      'SELECT measure, version FROM "Widget" WHERE id = $1',
      [dealWidget],
    );
    expect(widget).toMatchObject({
      version: 2,
      measure: {
        groupBy: null,
        source: {
          filters: [
            { fieldId: dealChannels?.id, operator: "contains", value: { kind: "text", value: "ada@example.test" } },
            { fieldId: dealChannels?.id, operator: "startsWith", value: { kind: "text", value: "ada" } },
          ],
        },
      },
    });
    expect(recordMeasureIsValid(RecordMeasureSchema.parse(widget.measure), model)).toBe(true);
  });

  it("keeps an email field as text exactly when one of its values is not an address the app accepts", async () => {
    const client = await previousRelease();
    const samples = [
      "ada@example.test",
      " Ada.Lovelace+crm@Mail.Example.co ",
      "o'neil_x-y@sub-domain.example.org",
      "a..b@example.test",
      ".ada@example.test",
      "ada.@example.test",
      "ada@example.t",
      "ada@-example.test",
      "ada@example",
      "ada example@example.test",
      "ädä@example.test",
      "ada@exa_mple.test",
    ];
    const fields: FixtureField[] = [];
    const a = await workspace(client, (model, id) => {
      samples.forEach((_, index) => fields.push(emailField(id("contact"), `Email ${index + 1}`, 40 + index)));
      model.fields.push(...fields);
    });
    for (const [index, value] of samples.entries()) await a.record(a.id("contact"), { [fields[index].id]: value });
    await migrate(client);
    const model = await currentModel(client, a.companyId);
    for (const [index, value] of samples.entries()) {
      const accepted = z.email().safeParse(value.trim()).success;
      expect({ value, kept: model.fields.some((field) => field.id === fields[index].id) }).toEqual({
        value,
        kept: !accepted,
      });
      if (accepted) {
        expect(await identityOf(client, a.companyId, value.trim().toLowerCase(), "email")).toMatchObject({
          provider: "mail",
        });
      }
    }
  });

  it("keeps each workspace's identities apart when one login belongs to several workspaces", async () => {
    const client = await previousRelease();
    const login = `shared-${randomUUID()}@example.test`;
    const workspaces: Array<Awaited<ReturnType<typeof workspace>> & { ref: { typeId: string; recordId: string } }> = [];
    for (const { language, former } of [
      { language: "en", former: "Channels" },
      { language: "it", former: "Canali" },
    ]) {
      let email: FixtureField = { id: "", typeId: "", archived: false };
      const created = await workspace(
        client,
        (model, id) => {
          email = emailField(id("contact"), "Email", 40);
          model.fields.push(email);
        },
        { email: login, language, channelsLabel: former },
      );
      const ref = await created.record(created.id("contact"), { [email.id]: "Partner@Example.test" });
      workspaces.push({ ...created, ref });
    }
    await migrate(client);
    const identities: Array<string | undefined> = [];
    for (const created of workspaces) {
      const identity = await identityOf(client, created.companyId, "partner@example.test", "email");
      expect(identity?.links).toEqual([created.ref]);
      identities.push(identity?.id);
    }
    expect(new Set(identities).size).toBe(2);
    expect(
      (await currentModel(client, workspaces[1].companyId)).fields.find(
        (field) => field.id === workspaces[1].id("capability.identity"),
      )?.label,
    ).toBe("Recapiti");
  });

  it("renames only contact details fields that still carry a former default name, also without phone or email fields", async () => {
    const client = await previousRelease();
    const french = await workspace(client, undefined, { channelsLabel: "Canaux", language: "fr" });
    const custom = await workspace(client, undefined, { channelsLabel: "Messaging" });
    const numbered = await workspace(client, undefined, { channelsLabel: "Channels (2)" });
    const taken = await workspace(client, (model, id) => {
      model.fields.push({ ...phoneField(id("contact"), "Contact details", 40), valueType: "text" });
    });
    const customFields = JSON.stringify(
      await rows(client, 'SELECT * FROM "RecordFieldDefinition" WHERE "companyId" = $1 ORDER BY id', [
        custom.companyId,
      ]),
    );
    await migrate(client);
    expect(
      (await currentModel(client, numbered.companyId)).fields.find(
        (field) => field.id === numbered.id("capability.identity"),
      )?.label,
    ).toBe("Contact details");
    expect((await currentModel(client, custom.companyId)).revision).toBe(1);

    const renamed = await currentModel(client, french.companyId);
    expect(renamed.revision).toBe(2);
    expect(validateRecordModel(renamed).issues).toEqual([]);
    expect(renamed.fields.find((field) => field.id === french.id("capability.identity"))?.label).toBe("Coordonnées");
    expect(
      await rows(
        client,
        'SELECT definition ->> \'label\' AS label FROM "RecordFieldDefinition" WHERE "companyId" = $1 AND id = $2',
        [french.companyId, french.id("capability.identity")],
      ),
    ).toEqual([{ label: "Coordonnées" }]);
    const [history] = await rows<{ actorId: string; change: unknown }>(
      client,
      'SELECT "actorId", change FROM "RecordSchemaRevision" WHERE "companyId" = $1 AND revision = 2',
      [french.companyId],
    );
    expect(history.actorId).toBe("system:contact-details-upgrade");
    expect(RecordRevisionChangeSchema.parse(history.change).configuration?.operations).toEqual([
      { operation: "putField", field: expect.objectContaining({ label: "Coordonnées", valueType: "channels" }) },
    ]);
    expect(
      (await currentModel(client, numbered.companyId)).fields.find(
        (field) => field.id === numbered.id("capability.identity"),
      )?.label,
    ).toBe("Contact details");
    expect((await currentModel(client, custom.companyId)).revision).toBe(1);
    expect(
      JSON.stringify(
        await rows(client, 'SELECT * FROM "RecordFieldDefinition" WHERE "companyId" = $1 ORDER BY id', [
          custom.companyId,
        ]),
      ),
    ).toBe(customFields);
    expect((await currentModel(client, taken.companyId)).revision).toBe(1);
  });
});
