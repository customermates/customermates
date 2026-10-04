import { readRecordModelSnapshot } from "@/features/records/record-model-snapshot";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma";
import { presetId } from "@/features/records/crm-preset";
import { type RecordModel, type RecordScalar } from "@/features/records/record-model.schema";
import { validateRecordModel } from "@/features/records/record-model-validation";
import { RecordCalculationService } from "@/features/records/record-calculation.service";
import { decodeRecordValue, recordJson } from "@/features/records/record-storage";
import { identityKeys } from "@/features/records/record-identity";
import { buildLegacyFixtureModel, legacyFieldScalar, LEGACY_RELATIONSHIPS, type LegacyType } from "@/prisma/seeds/legacy-conversion/v2/legacy-model";
import { presentationMigrationModel } from "@/prisma/seeds/legacy-conversion/v5/model";
import { migratePresentationState } from "@/prisma/seeds/legacy-conversion/v5/state";
import { syntheticCalculationRepo } from "@/prisma/seeds/records";
import { SURFACE } from "@/core/data-view/data-view-keys";

const KINDS = ["contact", "organization", "deal", "service", "task"] as const;
const FIXTURE_TABLES = [...KINDS, "customColumn", "customFieldValue", "contactIdentifier", "serviceDeal", "dataView", "p13n", ...KINDS.map((kind) => `${kind}User`), ...LEGACY_RELATIONSHIPS.map((relation) => relation.table[0].toLowerCase() + relation.table.slice(1))];
type FixtureRow = Record<string, unknown> & { id: string; companyId: string };
type FixtureDelegate = { create<T extends Record<string, unknown>>(args: { data: T }): Promise<T & { id: string }>; createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }> };
export type BenchmarkFixtureWriter = Prisma.TransactionClient & Record<string, FixtureDelegate>;

/** Case declarations are held in memory, then written to generic tables. This is fixture code, never a production CRUD adapter. */
export function benchmarkRecordFixtures(prisma: Prisma.TransactionClient, companyIds: readonly string[]) {
  const pending = new Map<string, FixtureRow[]>();
  const fixtureDelegate = (table: string): FixtureDelegate => ({
    async create({ data }) {
      const row = { id: randomUUID(), ...data };
      if (!companyIds.includes(String(row.companyId))) throw new Error("Unexpected benchmark workspace");
      const records = pending.get(table) ?? []; records.push(row as FixtureRow); pending.set(table, records);
      return row;
    },
    async createMany({ data }) { for (const row of data) await fixtureDelegate(table).create({ data: row }); return { count: data.length }; },
  });
  const writer = new Proxy(prisma, { get(target, key: string) { return FIXTURE_TABLES.includes(key) ? fixtureDelegate(key) : Reflect.get(target, key); } }) as BenchmarkFixtureWriter;
  const rows = (table: string, companyId: string) => (pending.get(table) ?? []).filter((row) => row.companyId === companyId);
  const flush = async () => {
    for (const companyId of companyIds) {
      const columns = rows("customColumn", companyId);
      const source = buildLegacyFixtureModel(companyId, "eur", null, columns.map((row) => ({ ...row, createdAt: row.createdAt ?? new Date(0), updatedAt: row.updatedAt ?? new Date(0) })) as unknown as Parameters<typeof buildLegacyFixtureModel>[3]);
      if (source.issues.length) throw new Error(`Benchmark schema is invalid: ${JSON.stringify(source.issues)}`);
      const presentationModel = { ...presentationMigrationModel(source), revision: 1 };
      const model = readRecordModelSnapshot(presentationModel);
      const validation = validateRecordModel(model); if (validation.issues.length) throw new Error(`Invalid benchmark model: ${JSON.stringify(validation.issues)}`);
      await initialize(prisma, companyId, model);
      const values = syntheticCalculationRepo(prisma, companyId);
      const save = async (kind: string, row: FixtureRow) => {
        const ref = { typeId: presetId(companyId, kind), recordId: row.id };
        await prisma.crmRecord.create({ data: { companyId, typeId: ref.typeId, id: row.id, ...(row.createdAt ? { createdAt: row.createdAt as Date } : {}), ...(row.updatedAt ? { updatedAt: row.updatedAt as Date } : {}) } });
        for (const field of model.fields.filter((field) => field.typeId === ref.typeId && field.behavior.kind === "input")) {
          const key = ["name", "firstName", "lastName", "avatarUrl", "notes", "amount", "quantity", "pricingMode", "savedPrice"].find((key) => presetId(companyId, `${kind}.${key}`) === field.id);
          let value: RecordScalar | null = null;
          const raw = key ? row[key] : undefined;
          if (raw != null) {
            if (field.valueType === "richText") value = { kind: "richText", documentJson: JSON.stringify(raw) };
            else if (field.valueType === "number" || field.valueType === "currency") value = { kind: "decimal", value: String(raw), currency: field.valueType === "currency" ? "EUR" : null };
            else if (field.valueType === "select") value = { kind: "select", value: String(raw) };
            else value = { kind: "text", value: String(raw) };
          } else if (field.behavior.kind === "input") value = field.behavior.defaultValue ?? null;
          if (value) await values.setValue(ref, field.id, { state: "value", value }, model.revision);
        }
      };
      for (const kind of KINDS) for (const row of rows(kind, companyId)) await save(kind, row);
      for (const row of rows("customFieldValue", companyId)) {
        const field = model.fields.find((field) => field.id === row.columnId);
        if (!field) throw new Error("Benchmark field is missing");
        const value = legacyFieldScalar(row.value as string | null, field, "EUR");
        await values.setValue({ typeId: field.typeId, recordId: String(row[`${row.entityType}Id`]) }, field.id, value ? { state: "value", value } : { state: "missing" }, model.revision);
      }
      for (const kind of KINDS) for (const row of rows(`${kind}User`, companyId)) await prisma.recordAssignment.create({ data: { companyId, typeId: presetId(companyId, kind), recordId: String(row[`${kind}Id`]), userId: String(row.userId) } });
      for (const relation of LEGACY_RELATIONSHIPS) for (const row of rows(relation.table[0].toLowerCase() + relation.table.slice(1), companyId)) await prisma.recordLink.create({ data: { companyId, id: row.id, relationId: presetId(companyId, relation.key), sourceTypeId: presetId(companyId, relation.source), sourceId: String(row[`${relation.source}Id`]), targetTypeId: presetId(companyId, relation.target), targetId: String(row[`${relation.target}Id`]) } });
      for (const row of rows("serviceDeal", companyId)) {
        await save("lineItem", { ...row, name: "Line item", pricingMode: "live" });
        for (const kind of ["deal", "service"]) await prisma.recordLink.create({ data: { companyId, id: row.id, relationId: presetId(companyId, `lineItem.${kind}`), sourceTypeId: presetId(companyId, "lineItem"), sourceId: row.id, targetTypeId: presetId(companyId, kind), targetId: String(row[`${kind}Id`]) } });
      }
      for (const row of rows("contactIdentifier", companyId)) {
        await prisma.recordIdentity.create({ data: { id: row.id, companyId, records: { create: { typeId: presetId(companyId, "contact"), recordId: String(row.contactId) } }, provider: row.provider as Prisma.RecordIdentityCreateInput["provider"], channelClass: String(row.channelClass), value: String(row.value), displayName: row.displayName as string | null, messagingId: row.messagingId as string | null, profileUrl: row.profileUrl as string | null, keys: { create: identityKeys({ value: String(row.value), messagingId: row.messagingId as string | null }).map((value) => ({ value })) } } });
      }
      for (const table of ["dataView", "p13n"] as const) for (const row of rows(table, companyId)) {
        const surface = String(table === "dataView" ? row.surfaceKey : row.p13nId);
        const kind = KINDS.find((kind) => SURFACE[`${kind}s` as keyof typeof SURFACE] === surface);
        const state = kind ? migratePresentationState(source, kind, row, presentationModel, table === "p13n") : {};
        const data = { ...row, ...state, ...(kind ? { [table === "dataView" ? "surfaceKey" : "p13nId"]: `records:${presetId(companyId, kind)}` } : {}) };
        if (table === "dataView") await prisma.dataView.create({ data: data as unknown as Prisma.DataViewUncheckedCreateInput });
        else await prisma.p13n.create({ data: data as unknown as Prisma.P13nUncheckedCreateInput });
      }
      const refs = (await prisma.crmRecord.findMany({ where: { companyId }, select: { id: true, typeId: true } })).map((row) => ({ typeId: row.typeId, recordId: row.id }));
      const result = await new RecordCalculationService(values).recalculate(model, refs, "EUR", new Map(), 10000);
      if (!result.complete) throw new Error("Benchmark fixture calculation exceeded its budget");
    }
  };
  return { writer, flush };
}

async function initialize(prisma: Prisma.TransactionClient, companyId: string, model: RecordModel) {
  for (const type of model.types) await prisma.recordTypeDefinition.create({ data: { companyId, id: type.id, label: type.label, pluralLabel: type.pluralLabel, embedded: type.embedded, archived: type.archived, position: type.position, definition: recordJson(type) } });
  for (const field of model.fields) await prisma.recordFieldDefinition.create({ data: { companyId, typeId: field.typeId, id: field.id, behavior: field.behavior.kind, valueType: field.valueType, archived: field.archived, definition: recordJson(field) } });
  for (const relation of model.relationships) await prisma.recordRelationshipDefinition.create({ data: { companyId, id: relation.id, sourceTypeId: relation.sourceTypeId, targetTypeId: relation.targetTypeId, definition: recordJson(relation) } });
  await prisma.recordSchemaState.create({ data: { companyId, revision: model.revision, storageMode: "generic" } });
  await prisma.recordSchemaRevision.create({ data: { companyId, revision: model.revision, actorId: "system:benchmark-fixture", snapshot: recordJson(model) } });
  const permissions = await prisma.rolePermission.findMany({ where: { companyId } });
  for (const kind of KINDS) for (const roleId of new Set(permissions.map((permission) => permission.roleId))) {
    const actions = permissions.filter((permission) => permission.roleId === roleId && permission.resource === `${kind}s`).map((permission) => permission.action);
    if (actions.length) await prisma.recordTypeGrant.create({ data: { companyId, typeId: presetId(companyId, kind), roleId, actions } });
  }
}

const PHYSICAL_TABLES = ["recordTypeDefinition", "recordFieldDefinition", "recordRelationshipDefinition", "recordSchemaState", "recordSchemaRevision", "recordTypeGrant", "crmRecord", "recordValue", "recordValueDependency", "recordLink", "recordAssignment", "recordIdentity", "recordIdentityKey", "recordIdentityLink", "messagingThreadRecordLink"] as const;
const valueString = (value: RecordScalar | null) => !value ? null : value.kind === "richText" ? value.documentJson : value.kind === "range" ? `${value.start ?? ""},${value.end ?? ""}` : value.kind === "textList" ? value.value.join(",") : String(value.value);

/** The old case vocabulary is a read-only projection. Raw generic state additionally protects read-only and foreign-workspace oracles. */
export async function benchmarkRecordSnapshot(prisma: PrismaClient, companyId: string) {
  const state = await prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId } });
  const model = readRecordModelSnapshot((await prisma.recordSchemaRevision.findUniqueOrThrow({ where: { companyId_revision: { companyId, revision: state.revision } } })).snapshot);
  const records = await prisma.crmRecord.findMany({ where: { companyId }, include: { values: true }, orderBy: { id: "asc" } });
  const links = await prisma.recordLink.findMany({ where: { companyId }, orderBy: { id: "asc" } });
  const assignments = await prisma.recordAssignment.findMany({ where: { companyId }, orderBy: [{ typeId: "asc" }, { recordId: "asc" }, { userId: "asc" }] });
  const identities = await prisma.recordIdentity.findMany({ where: { companyId }, include: { records: true }, orderBy: { id: "asc" } });
  const result: Record<string, unknown[]> = {};
  result["generic:model"] = [model];
  const builtin = new Set([...KINDS, "lineItem"].flatMap((kind) => ["name", "firstName", "lastName", "notes", "avatarUrl", "amount", "quantity", "pricingMode", "savedPrice", "effectivePrice", "weightedValue", "totalValue", "totalQuantity", "stage", "type"].map((field) => presetId(companyId, `${kind}.${field}`))));
  const customFields = model.fields.filter((field) => !builtin.has(field.id));
  const read = (row: typeof records[number], fieldId: string) => {
    const field = model.fields.find((field) => field.id === fieldId);
    if (!field) return null;
    const value = decodeRecordValue(row.values.find((value) => value.fieldId === fieldId), field);
    if (value.state === "error" || value.state === "restricted") throw new Error("Benchmark oracle encountered an invalid calculated value");
    return value.state === "value" ? value.value : null;
  };
  for (const kind of KINDS) {
    const typeId = presetId(companyId, kind);
    result[kind] = records.filter((row) => row.typeId === typeId).map((row) => {
      const data: Record<string, unknown> = { id: row.id, companyId };
      for (const field of model.fields.filter((field) => field.typeId === typeId && builtin.has(field.id))) {
        const name = ["name", "firstName", "lastName", "notes", "avatarUrl", "amount", "totalValue", "totalQuantity", "weightedValue"].find((key) => presetId(companyId, `${kind}.${key}`) === field.id);
        if (!name) continue;
        const scalar = read(row, field.id);
        data[name] = scalar?.kind === "decimal" ? Number(scalar.value) : scalar?.kind === "richText" ? JSON.parse(scalar.documentJson) : valueString(scalar);
      }
      if (kind === "task") data.type = row.protectedKind === "membershipAuthorization" ? "userPendingAuthorization" : "custom";
      return data;
    });
    result[`${kind}User`] = assignments.filter((row) => row.typeId === typeId).map((row) => ({ id: `${row.recordId}:${row.userId}`, companyId, [`${kind}Id`]: row.recordId, userId: row.userId }));
  }
  for (const relation of LEGACY_RELATIONSHIPS) result[relation.table[0].toLowerCase() + relation.table.slice(1)] = links.filter((link) => link.relationId === presetId(companyId, relation.key)).map((link) => ({ id: link.id, companyId, [`${relation.source}Id`]: link.sourceId, [`${relation.target}Id`]: link.targetId }));
  result.serviceDeal = records.filter((row) => row.typeId === presetId(companyId, "lineItem")).map((row) => ({ id: row.id, companyId, dealId: links.find((link) => link.relationId === presetId(companyId, "lineItem.deal") && link.sourceId === row.id)?.targetId, serviceId: links.find((link) => link.relationId === presetId(companyId, "lineItem.service") && link.sourceId === row.id)?.targetId, quantity: Number(valueString(read(row, presetId(companyId, "lineItem.quantity")))) }));
  const typeOf = (typeId: string) => KINDS.find((kind) => presetId(companyId, kind) === typeId);
  result.customColumn = customFields.map((field) => ({ id: field.id, companyId, entityType: typeOf(field.typeId), label: field.label, type: ({ text: "plain", currency: "currency", select: "singleSelect", url: "link", email: "email", phone: "phone", dateTime: "dateTime", date: "date" } as Record<string, string>)[field.valueType] ?? field.valueType, options: field.valueType === "select" ? { options: field.options.map((option, index) => ({ value: option.id, label: option.label, color: option.color, index })) } : field.valueType === "currency" ? { currency: field.format?.currency?.toLowerCase() } : null }));
  result.customFieldValue = records.flatMap((row) => customFields.filter((field) => field.typeId === row.typeId).flatMap((field) => { const scalar = read(row, field.id); if (!scalar) return []; const entity = typeOf(row.typeId); return [{ id: `${row.typeId}:${row.id}:${field.id}`, companyId, columnId: field.id, entityType: entity, [`${entity}Id`]: row.id, value: valueString(scalar), numericValue: scalar.kind === "decimal" ? Number(scalar.value) : null }]; }));
  result.contactIdentifier = identities.flatMap(({ records: associations, ...row }) => associations.filter((link) => link.typeId === presetId(companyId, "contact")).map((link) => ({ ...row, contactId: link.recordId })));
  for (const table of PHYSICAL_TABLES) {
    const delegate = prisma[table] as unknown as { findMany(args: unknown): Promise<unknown[]> };
    result[`generic:${table}`] = (await delegate.findMany({ where: { companyId } })).toSorted((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0));
  }
  return result;
}
