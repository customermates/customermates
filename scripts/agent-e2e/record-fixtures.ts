import type { RecordModel, RecordScalar } from "@/features/records/record-model.schema";
import type { E2eFieldDeclaration } from "./record-fixture-model";

import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@/generated/prisma";
import { presetId } from "@/features/records/crm-preset";
import { RecordModelSchema } from "@/features/records/record-model.schema";
import { RecordCalculationService } from "@/features/records/record-calculation.service";
import { decodeRecordValue, recordJson } from "@/features/records/record-storage";
import { identityKeys } from "@/features/records/record-identity";
import { syntheticCalculationRepo } from "@/prisma/seeds/records";

import { E2E_LINK_TABLES, E2E_RECORD_KINDS, e2eFieldScalar, e2eRecordModel } from "./record-fixture-model";

const FIXTURE_TABLES = [
  ...E2E_RECORD_KINDS,
  "customColumn",
  "customFieldValue",
  "contactIdentifier",
  ...E2E_RECORD_KINDS.map((kind) => `${kind}User`),
  ...E2E_LINK_TABLES.map((relation) => relation.table),
];
const INPUT_KEYS = ["name", "firstName", "lastName", "avatarUrl", "notes", "amount"];

type FixtureRow = Record<string, unknown> & { id: string; companyId: string };
type FixtureDelegate = {
  create<T extends Record<string, unknown>>(args: { data: T }): Promise<T & { id: string }>;
  createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }>;
};
export type E2eFixtureWriter = Prisma.TransactionClient & Record<string, FixtureDelegate>;

export type E2eRecordSnapshot = {
  contact: Array<{ id: string; firstName: string | null; lastName: string | null }>;
  organization: Array<{ id: string; name: string | null }>;
  deal: Array<{ id: string; name: string | null }>;
  customFieldValue: Array<{ columnId: string; recordId: string; value: string | null }>;
  contactIdentifier: Array<{ contactId: string; channelClass: string; value: string }>;
};

async function initialize(prisma: Prisma.TransactionClient, companyId: string, model: RecordModel) {
  for (const type of model.types)
    await prisma.recordTypeDefinition.create({
      data: {
        companyId,
        id: type.id,
        label: type.label,
        pluralLabel: type.pluralLabel,
        embedded: type.embedded,
        archived: type.archived,
        position: type.position,
        definition: recordJson(type),
      },
    });
  for (const field of model.fields)
    await prisma.recordFieldDefinition.create({
      data: {
        companyId,
        typeId: field.typeId,
        id: field.id,
        behavior: field.behavior.kind,
        valueType: field.valueType,
        archived: field.archived,
        definition: recordJson(field),
      },
    });
  for (const relation of model.relationships)
    await prisma.recordRelationshipDefinition.create({
      data: {
        companyId,
        id: relation.id,
        sourceTypeId: relation.sourceTypeId,
        targetTypeId: relation.targetTypeId,
        definition: recordJson(relation),
      },
    });
  await prisma.recordSchemaState.create({ data: { companyId, revision: model.revision } });
  await prisma.recordSchemaRevision.create({
    data: { companyId, revision: model.revision, actorId: "system:agent-e2e-fixture", snapshot: recordJson(model) },
  });
  const permissions = await prisma.rolePermission.findMany({ where: { companyId } });
  for (const roleId of new Set(permissions.map((permission) => permission.roleId))) {
    const actions = [
      ...new Set(
        permissions.filter((permission) => permission.roleId === roleId).map((permission) => permission.action),
      ),
    ];
    for (const kind of E2E_RECORD_KINDS)
      await prisma.recordTypeGrant.create({ data: { companyId, typeId: presetId(companyId, kind), roleId, actions } });
  }
}

function inputScalar(raw: unknown, valueType: string): RecordScalar {
  if (valueType === "number" || valueType === "currency")
    return { kind: "decimal", value: String(raw), currency: valueType === "currency" ? "EUR" : null };
  if (valueType === "select") return { kind: "select", value: String(raw) };
  return { kind: "text", value: String(raw) };
}

export function e2eRecordFixtures(prisma: Prisma.TransactionClient, companyId: string) {
  const pending = new Map<string, FixtureRow[]>();
  const fixtureDelegate = (table: string): FixtureDelegate => ({
    create<T extends Record<string, unknown>>({ data }: { data: T }) {
      const row = { id: randomUUID(), ...data };
      if (row.companyId !== companyId) throw new Error("Unexpected agent e2e workspace");
      pending.set(table, [...(pending.get(table) ?? []), row as unknown as FixtureRow]);
      return Promise.resolve(row);
    },
    async createMany({ data }) {
      for (const row of data) await fixtureDelegate(table).create({ data: row });
      return { count: data.length };
    },
  });
  const writer = new Proxy(prisma, {
    get(target, key: string) {
      return FIXTURE_TABLES.includes(key) ? fixtureDelegate(key) : Reflect.get(target, key);
    },
  }) as E2eFixtureWriter;
  const rows = (table: string) => pending.get(table) ?? [];
  const flush = async () => {
    const model = e2eRecordModel(companyId, rows("customColumn") as unknown as E2eFieldDeclaration[]);
    await initialize(prisma, companyId, model);
    const values = syntheticCalculationRepo(prisma, companyId);
    for (const kind of E2E_RECORD_KINDS) {
      for (const row of rows(kind)) {
        const ref = { typeId: presetId(companyId, kind), recordId: row.id };
        await prisma.crmRecord.create({ data: { companyId, typeId: ref.typeId, id: row.id } });
        for (const field of model.fields.filter(
          (candidate) => candidate.typeId === ref.typeId && candidate.behavior.kind === "input",
        )) {
          const key = INPUT_KEYS.find((candidate) => presetId(companyId, `${kind}.${candidate}`) === field.id);
          const raw = key ? row[key] : undefined;
          const value =
            raw != null
              ? inputScalar(raw, field.valueType)
              : field.behavior.kind === "input"
                ? (field.behavior.defaultValue ?? null)
                : null;
          if (value) await values.setValue(ref, field.id, { state: "value", value }, model.revision);
        }
      }
    }
    for (const row of rows("customFieldValue")) {
      const field = model.fields.find((candidate) => candidate.id === row.columnId);
      if (!field) throw new Error("Agent e2e field is missing");
      const value = e2eFieldScalar(row.value as string | null, field);
      await values.setValue(
        { typeId: field.typeId, recordId: String(row[`${String(row.entityType)}Id`]) },
        field.id,
        value ? { state: "value", value } : { state: "missing" },
        model.revision,
      );
    }
    for (const kind of E2E_RECORD_KINDS)
      for (const row of rows(`${kind}User`))
        await prisma.recordAssignment.create({
          data: {
            companyId,
            typeId: presetId(companyId, kind),
            recordId: String(row[`${kind}Id`]),
            userId: String(row.userId),
          },
        });
    for (const relation of E2E_LINK_TABLES)
      for (const row of rows(relation.table))
        await prisma.recordLink.create({
          data: {
            companyId,
            id: row.id,
            relationId: presetId(companyId, relation.key),
            sourceTypeId: presetId(companyId, relation.source),
            sourceId: String(row[`${relation.source}Id`]),
            targetTypeId: presetId(companyId, relation.target),
            targetId: String(row[`${relation.target}Id`]),
          },
        });
    for (const row of rows("contactIdentifier"))
      await prisma.recordIdentity.create({
        data: {
          id: row.id,
          companyId,
          records: { create: { typeId: presetId(companyId, "contact"), recordId: String(row.contactId) } },
          provider: row.provider as Prisma.RecordIdentityCreateInput["provider"],
          channelClass: String(row.channelClass),
          value: String(row.value),
          keys: {
            create: identityKeys({ value: String(row.value), messagingId: null }).map((value) => ({ value })),
          },
        },
      });
    const refs = (await prisma.crmRecord.findMany({ where: { companyId }, select: { id: true, typeId: true } })).map(
      (row) => ({ typeId: row.typeId, recordId: row.id }),
    );
    const result = await new RecordCalculationService(values).recalculate(model, refs, new Map(), 10000);
    if (!result.complete) throw new Error("Agent e2e fixture calculation exceeded its budget");
  };
  return { writer, flush };
}

function scalarText(value: RecordScalar | null): string | null {
  if (!value) return null;
  if (value.kind === "richText") return value.documentJson;
  if (value.kind === "range") return `${value.start ?? ""},${value.end ?? ""}`;
  if (value.kind === "textList") return value.value.join(",");
  return String(value.value);
}

export async function e2eRecordSnapshot(prisma: PrismaClient, companyId: string): Promise<E2eRecordSnapshot> {
  const state = await prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId } });
  const model = RecordModelSchema.parse(
    (
      await prisma.recordSchemaRevision.findUniqueOrThrow({
        where: { companyId_revision: { companyId, revision: state.revision } },
      })
    ).snapshot,
  );
  const records = await prisma.crmRecord.findMany({
    where: { companyId, deletedAt: null },
    include: { values: true },
    orderBy: { id: "asc" },
  });
  const identities = await prisma.recordIdentity.findMany({
    where: { companyId },
    include: { records: true },
    orderBy: { id: "asc" },
  });
  const read = (row: (typeof records)[number], fieldId: string) => {
    const field = model.fields.find((candidate) => candidate.id === fieldId);
    if (!field) return null;
    const value = decodeRecordValue(
      row.values.find((candidate) => candidate.fieldId === fieldId),
      field,
    );
    return value.state === "value" ? scalarText(value.value) : null;
  };
  const ofKind = (kind: string) => records.filter((row) => row.typeId === presetId(companyId, kind));
  const builtin = new Set(
    model.fields
      .filter((field) =>
        E2E_RECORD_KINDS.some((kind) =>
          [...INPUT_KEYS, "stage", "totalValue", "totalQuantity", "weightedValue"].some(
            (key) => field.id === presetId(companyId, `${kind}.${key}`),
          ),
        ),
      )
      .map((field) => field.id),
  );
  const customFields = model.fields.filter(
    (field) => !builtin.has(field.id) && E2E_RECORD_KINDS.some((kind) => field.typeId === presetId(companyId, kind)),
  );
  return {
    contact: ofKind("contact").map((row) => ({
      id: row.id,
      firstName: read(row, presetId(companyId, "contact.firstName")),
      lastName: read(row, presetId(companyId, "contact.lastName")),
    })),
    organization: ofKind("organization").map((row) => ({
      id: row.id,
      name: read(row, presetId(companyId, "organization.name")),
    })),
    deal: ofKind("deal").map((row) => ({ id: row.id, name: read(row, presetId(companyId, "deal.name")) })),
    customFieldValue: records.flatMap((row) =>
      customFields
        .filter((field) => field.typeId === row.typeId)
        .flatMap((field) => {
          const value = read(row, field.id);
          return value === null ? [] : [{ columnId: field.id, recordId: row.id, value }];
        }),
    ),
    contactIdentifier: identities.flatMap(({ records: associations, channelClass, value }) =>
      associations
        .filter((link) => link.typeId === presetId(companyId, "contact"))
        .map((link) => ({ contactId: link.recordId, channelClass, value })),
    ),
  };
}
