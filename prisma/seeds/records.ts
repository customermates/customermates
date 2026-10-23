import { isDeepStrictEqual } from "node:util";

import { SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS } from "./hosted-ai-operator";
import { Prisma, type PrismaClient } from "@/generated/prisma";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { RecordModelSchema, type RecordModel, type RecordRef } from "@/features/records/record-model.schema";
import { RecordCalculationService, type CalculationRecordRepo } from "@/features/records/record-calculation.service";
import { encodeRecordValue, recordJson } from "@/features/records/record-storage";
import type { SeedContext } from "./context";
import { SYNTHETIC_CUSTOM_ROLES } from "./roles";

/**
 * The seed builds each demo workspace on its exact record model. A workspace stored on another model (an older seed,
 * or an older synthetic company converted by the release migration) lacks the types, fields and relationships its
 * fixtures need, so the company is removed (cascading only to its own rows) and seeded fresh. A workspace already on
 * the current model is left alone, which keeps a repeated seed a no-op.
 */
export async function resetOutdatedSyntheticWorkspace(
  prisma: PrismaClient,
  companyId: string,
  proposed: RecordModel,
): Promise<boolean> {
  return prisma.$transaction(
    async (tx) => {
      const state = await tx.recordSchemaState.findUnique({ where: { companyId } });
      if (!state) return false;
      if (state.activeOperationId) throw new Error("Cannot seed records while a CRM operation is active");
      const revision = await tx.recordSchemaRevision.findUnique({
        where: { companyId_revision: { companyId, revision: state.revision } },
      });
      const stored = revision && RecordModelSchema.safeParse(revision.snapshot);
      if (stored?.success && isDeepStrictEqual(stored.data, RecordModelSchema.parse(recordJson(proposed))))
        return false;
      // Record event subscriptions restrict deleting their record type, so they go before the company cascade.
      await tx.recordEventSubscription.deleteMany({ where: { companyId } });
      await tx.company.delete({ where: { id: companyId } });
      return true;
    },
    { maxWait: 60000, timeout: 600000 },
  );
}

export async function initializeRecordModel(
  prisma: Prisma.TransactionClient,
  companyId: string,
  proposed: RecordModel,
): Promise<RecordModel> {
  const current = await prisma.recordSchemaState.findUnique({ where: { companyId } });
  if (current?.activeOperationId) throw new Error("Cannot seed records while a CRM operation is active");
  if (current) {
    const revision = await prisma.recordSchemaRevision.findUniqueOrThrow({
      where: { companyId_revision: { companyId, revision: current.revision } },
    });
    return RecordModelSchema.parse(revision.snapshot);
  }
  for (const type of proposed.types) {
    await prisma.recordTypeDefinition.create({
      data: {
        companyId,
        id: type.id,
        label: type.label,
        pluralLabel: type.pluralLabel,
        archived: type.archived,
        embedded: type.embedded,
        position: type.position,
        definition: recordJson(type),
      },
    });
  }
  for (const field of proposed.fields) {
    await prisma.recordFieldDefinition.create({
      data: {
        companyId,
        typeId: field.typeId,
        id: field.id,
        valueType: field.valueType,
        behavior: field.behavior.kind,
        archived: field.archived,
        definition: recordJson(field),
      },
    });
  }
  for (const relation of proposed.relationships) {
    await prisma.recordRelationshipDefinition.create({
      data: {
        companyId,
        id: relation.id,
        sourceTypeId: relation.sourceTypeId,
        targetTypeId: relation.targetTypeId,
        archived: relation.archived,
        definition: recordJson(relation),
      },
    });
  }
  await prisma.recordSchemaState.create({ data: { companyId, revision: proposed.revision } });
  await prisma.recordSchemaRevision.create({
    data: { companyId, revision: proposed.revision, actorId: "system:synthetic-seed", snapshot: recordJson(proposed) },
  });
  for (const role of SYNTHETIC_CUSTOM_ROLES.filter((entry) => entry.companyId === companyId)) {
    for (const [kind, actions] of role.recordGrants) {
      await prisma.recordTypeGrant.create({
        data: { companyId, typeId: presetId(companyId, kind), roleId: role.id, actions: [...actions] },
      });
    }
  }
  return proposed;
}

export function syntheticCalculationRepo(prisma: Prisma.TransactionClient, companyId: string): CalculationRecordRepo {
  return {
    getRecordCompanyWide: (ref) =>
      prisma.crmRecord.findUnique({
        where: { companyId_typeId_id: { companyId, typeId: ref.typeId, id: ref.recordId } },
        include: { values: true, assignments: true },
      }),
    linkedRecordsCompanyWide: async (ref, relationId, direction, take = 501) => {
      const rows = await prisma.recordLink.findMany({
        where: {
          companyId,
          relationId,
          ...(direction === "outgoing"
            ? { sourceTypeId: ref.typeId, sourceId: ref.recordId }
            : { targetTypeId: ref.typeId, targetId: ref.recordId }),
        },
        orderBy: { id: "asc" },
        take,
      });
      return rows.map((row) =>
        direction === "outgoing"
          ? { typeId: row.targetTypeId, recordId: row.targetId }
          : { typeId: row.sourceTypeId, recordId: row.sourceId },
      );
    },
    setValue: async (ref, fieldId, result, schemaRevision) => {
      const encoded = encodeRecordValue(result),
        key = { companyId, typeId: ref.typeId, recordId: ref.recordId, fieldId };
      const data = { ...key, ...encoded, jsonValue: encoded.jsonValue ?? Prisma.DbNull, schemaRevision };
      await prisma.recordValue.upsert({
        where: { companyId_typeId_recordId_fieldId: key },
        create: data,
        update: data,
      });
    },
    getValueDependencies: async (ref, fieldId) =>
      (
        await prisma.recordValueDependency.findMany({
          where: { companyId, typeId: ref.typeId, recordId: ref.recordId, fieldId },
        })
      ).map((row) => ({ typeId: row.sourceTypeId, recordId: row.sourceId })),
    setValueDependencies: async (ref, fieldId, sources) => {
      await prisma.recordValueDependency.deleteMany({
        where: { companyId, typeId: ref.typeId, recordId: ref.recordId, fieldId },
      });
      if (sources.length) {
        await prisma.recordValueDependency.createMany({
          data: sources.map((source) => ({
            companyId,
            typeId: ref.typeId,
            recordId: ref.recordId,
            fieldId,
            sourceTypeId: source.typeId,
            sourceId: source.recordId,
          })),
        });
      }
    },
  };
}

/** Operator-only fixture workspaces initialize the starter model directly on generic storage. */
export async function initializeOperatorFixtureModels(context: SeedContext): Promise<void> {
  const companies = await context.prisma.company.findMany({
    where: {
      id: {
        in: [
          context.ids.hostedAiFixtureCompany,
          ...SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.map((fixture) => fixture.companyId),
        ],
      },
      recordSchemaState: null,
    },
    select: { id: true },
  });
  for (const company of companies) {
    await context.prisma.$transaction(
      (prisma) => initializeRecordModel(prisma, company.id, createCrmPreset(company.id)).then(() => undefined),
      { maxWait: 60000, timeout: 600000 },
    );
  }
}

type BufferedRecord = NonNullable<Awaited<ReturnType<CalculationRecordRepo["getRecordCompanyWide"]>>>;

/**
 * A calculation repository over an in-memory copy of the workspace's records, links and dependencies. The seed
 * calculates thousands of records at once; reading them once and writing the changed values in bulk keeps that to a
 * few seconds instead of one round trip per value.
 */
async function bufferedCalculationRepo(prisma: Prisma.TransactionClient, companyId: string) {
  const [records, links, dependencies] = await Promise.all([
    prisma.crmRecord.findMany({ where: { companyId }, include: { values: true, assignments: true } }),
    prisma.recordLink.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
    prisma.recordValueDependency.findMany({ where: { companyId } }),
  ]);
  const refKey = (typeId: string, recordId: string) => `${typeId}:${recordId}`;
  const valueKey = (ref: RecordRef, fieldId: string) => `${ref.typeId}:${ref.recordId}:${fieldId}`;
  const byRef = new Map<string, BufferedRecord>(records.map((record) => [refKey(record.typeId, record.id), record]));
  const related = new Map<string, RecordRef[]>();
  const relate = (key: string, ref: RecordRef) => related.set(key, [...(related.get(key) ?? []), ref]);
  for (const link of links) {
    relate(`outgoing:${link.relationId}:${link.sourceTypeId}:${link.sourceId}`, {
      typeId: link.targetTypeId,
      recordId: link.targetId,
    });
    relate(`incoming:${link.relationId}:${link.targetTypeId}:${link.targetId}`, {
      typeId: link.sourceTypeId,
      recordId: link.sourceId,
    });
  }
  const sources = new Map<string, RecordRef[]>();
  for (const row of dependencies) {
    sources.set(valueKey({ typeId: row.typeId, recordId: row.recordId }, row.fieldId), [
      ...(sources.get(valueKey({ typeId: row.typeId, recordId: row.recordId }, row.fieldId)) ?? []),
      { typeId: row.sourceTypeId, recordId: row.sourceId },
    ]);
  }
  const dirtyValues = new Map<string, Prisma.RecordValueCreateManyInput>();
  const dirtySources = new Map<string, { ref: RecordRef; fieldId: string }>();
  const repo: CalculationRecordRepo = {
    getRecordCompanyWide: (ref) => Promise.resolve(byRef.get(refKey(ref.typeId, ref.recordId)) ?? null),
    linkedRecordsCompanyWide: (ref, relationId, direction, take = 501) =>
      Promise.resolve((related.get(`${direction}:${relationId}:${ref.typeId}:${ref.recordId}`) ?? []).slice(0, take)),
    setValue: (ref, fieldId, result, schemaRevision) => {
      const encoded = encodeRecordValue(result);
      const now = new Date();
      const row = { companyId, typeId: ref.typeId, recordId: ref.recordId, fieldId, ...encoded, schemaRevision };
      dirtyValues.set(valueKey(ref, fieldId), { ...row, jsonValue: encoded.jsonValue ?? Prisma.DbNull });
      const record = byRef.get(refKey(ref.typeId, ref.recordId));
      if (record) {
        const stored = { ...row, createdAt: now, updatedAt: now } as unknown as BufferedRecord["values"][number];
        record.values = [...record.values.filter((value) => value.fieldId !== fieldId), stored];
      }
      return Promise.resolve();
    },
    getValueDependencies: (ref, fieldId) => Promise.resolve(sources.get(valueKey(ref, fieldId)) ?? []),
    setValueDependencies: (ref, fieldId, refs) => {
      sources.set(valueKey(ref, fieldId), [...refs]);
      dirtySources.set(valueKey(ref, fieldId), { ref, fieldId });
      return Promise.resolve();
    },
  };
  const deleteKeys = async (
    table: "RecordValue" | "RecordValueDependency",
    keys: Array<{ ref: RecordRef; fieldId: string }>,
  ) => {
    for (let start = 0; start < keys.length; start += 2000) {
      const batch = keys.slice(start, start + 2000);
      const typeIds = batch.map(({ ref }) => ref.typeId);
      const recordIds = batch.map(({ ref }) => ref.recordId);
      const fieldIds = batch.map(({ fieldId }) => fieldId);
      if (table === "RecordValue")
        await prisma.$executeRaw`DELETE FROM "RecordValue" AS row USING unnest(${typeIds}::text[], ${recordIds}::text[], ${fieldIds}::text[]) AS key(type_id, record_id, field_id) WHERE row."companyId" = ${companyId} AND row."typeId" = key.type_id AND row."recordId" = key.record_id AND row."fieldId" = key.field_id`;
      else
        await prisma.$executeRaw`DELETE FROM "RecordValueDependency" AS row USING unnest(${typeIds}::text[], ${recordIds}::text[], ${fieldIds}::text[]) AS key(type_id, record_id, field_id) WHERE row."companyId" = ${companyId} AND row."typeId" = key.type_id AND row."recordId" = key.record_id AND row."fieldId" = key.field_id`;
    }
  };
  const flush = async () => {
    const values = [...dirtyValues.values()];
    await deleteKeys("RecordValueDependency", [...dirtySources.values()]);
    await deleteKeys(
      "RecordValue",
      values.map((row) => ({ ref: { typeId: row.typeId, recordId: row.recordId }, fieldId: row.fieldId })),
    );
    for (let start = 0; start < values.length; start += 2000)
      await prisma.recordValue.createMany({ data: values.slice(start, start + 2000) });
    const rows = [...dirtySources.entries()].flatMap(([key, { ref, fieldId }]) =>
      (sources.get(key) ?? []).map((source) => ({
        companyId,
        typeId: ref.typeId,
        recordId: ref.recordId,
        fieldId,
        sourceTypeId: source.typeId,
        sourceId: source.recordId,
      })),
    );
    for (let start = 0; start < rows.length; start += 2000)
      await prisma.recordValueDependency.createMany({ data: rows.slice(start, start + 2000), skipDuplicates: true });
  };
  return { repo, flush, refs: records.map((record) => ({ typeId: record.typeId, recordId: record.id })) };
}

export async function calculateSyntheticRecords(prisma: PrismaClient, companyId: string): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${companyId}, 0))`;
      const state = await tx.recordSchemaState.findUniqueOrThrow({ where: { companyId } });
      if (state.activeOperationId) throw new Error("Cannot seed calculations during a CRM operation");
      const revision = await tx.recordSchemaRevision.findUniqueOrThrow({
        where: { companyId_revision: { companyId, revision: state.revision } },
      });
      const model = RecordModelSchema.parse(revision.snapshot);
      const buffered = await bufferedCalculationRepo(tx, companyId);
      const result = await new RecordCalculationService(buffered.repo).recalculate(
        model,
        buffered.refs,
        new Map(),
        10000,
      );
      if (!result.complete) throw new Error("Synthetic calculation exceeded its record budget");
      await buffered.flush();
    },
    { maxWait: 60000, timeout: 600000 },
  );
}
