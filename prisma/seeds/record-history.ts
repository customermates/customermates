import { calculationDependencyHash } from "@/features/records/configuration.service";
import { recordChannelsField } from "@/features/records/record-channels";
import { recordEventChanges, historyPublications } from "@/features/records/record-journal";
import { compareRecordKey } from "@/features/records/record-json";
import { type RecordModel, type RecordRef, type RecordScalar } from "@/features/records/record-model.schema";
import type { RecordHistorySnapshot } from "@/features/records/record-event.schema";
import { decodeRecordValue } from "@/features/records/record-storage";
import type { Prisma, PrismaClient } from "@/generated/prisma";

const factsByModel = new WeakMap<RecordModel, Map<string, { publications: unknown; dependencyHash: unknown }>>();

/** Publications and dependency hash of a field, computed once per model. */
function fieldFacts(field: RecordModel["fields"][number], model: RecordModel) {
  const facts = factsByModel.get(model) ?? new Map();
  factsByModel.set(model, facts);
  if (!facts.has(field.id)) {
    facts.set(field.id, {
      publications: historyPublications(field, model),
      dependencyHash: calculationDependencyHash(field, model),
    });
  }
  return facts.get(field.id) as {
    publications: ReturnType<typeof historyPublications>;
    dependencyHash: ReturnType<typeof calculationDependencyHash>;
  };
}

async function readSnapshot(
  prisma: Prisma.TransactionClient | PrismaClient,
  companyId: string,
  model: RecordModel,
  ref: RecordRef,
  version: number,
  overrides: ReadonlyMap<string, RecordScalar>,
): Promise<RecordHistorySnapshot> {
  const row = await prisma.crmRecord.findUniqueOrThrow({
    where: { companyId_typeId_id: { companyId, typeId: ref.typeId, id: ref.recordId } },
    include: { values: true, assignments: true },
  });
  const dependencies = await prisma.recordValueDependency.findMany({
    where: { companyId, typeId: ref.typeId, recordId: ref.recordId },
  });
  const identities = recordChannelsField(model, ref.typeId)
    ? await prisma.recordIdentity.findMany({
        where: { companyId, records: { some: { companyId, typeId: ref.typeId, recordId: ref.recordId } } },
      })
    : [];
  return {
    version,
    assignedUserIds: row.assignments.map((assignment) => assignment.userId).sort(),
    values: model.fields
      .filter(
        (field) =>
          field.typeId === ref.typeId &&
          (overrides.has(field.id) || row.values.some((value) => value.fieldId === field.id)),
      )
      .sort((a, b) => compareRecordKey(a.id, b.id))
      .map((field) => {
        const override = overrides.get(field.id);
        return {
          fieldId: field.id,
          label: field.label,
          valueType: field.valueType,
          format: field.format,
          options: field.options,
          value: override
            ? { state: "value" as const, value: override }
            : decodeRecordValue(
                row.values.find((value) => value.fieldId === field.id),
                field,
              ),
          sources: dependencies
            .filter((dependency) => dependency.fieldId === field.id)
            .map((dependency) => ({ typeId: dependency.sourceTypeId, recordId: dependency.sourceId }))
            .sort((a, b) => compareRecordKey(`${a.typeId}:${a.recordId}`, `${b.typeId}:${b.recordId}`)),
          ...fieldFacts(field, model),
          publishedSummary: field.publishedSummary,
        };
      }),
    identities: identities
      .map(({ id, provider, value, messagingId, displayName, profileUrl }) => ({
        id,
        provider,
        value,
        messagingId,
        displayName,
        profileUrl,
      }))
      .sort((a, b) => compareRecordKey(a.id, b.id)),
  };
}

export async function writeRecordChange(
  prisma: Prisma.TransactionClient | PrismaClient,
  companyId: string,
  model: RecordModel,
  entry: {
    id: string;
    ref: RecordRef;
    actorId: string;
    at: Date;
    before: ReadonlyMap<string, RecordScalar> | null;
    after: ReadonlyMap<string, RecordScalar>;
  },
): Promise<void> {
  const before = entry.before ? await readSnapshot(prisma, companyId, model, entry.ref, 1, entry.before) : null;
  const after = await readSnapshot(prisma, companyId, model, entry.ref, before ? 2 : 1, entry.after);
  const change = recordEventChanges({ ref: entry.ref, before, links: [] }, after, model, { kind: "mutation" });
  if (!change) throw new Error(`Synthetic history ${entry.id} carries no change`);
  const data = {
    companyId,
    subjectKind: "record",
    subjectTypeId: entry.ref.typeId,
    subjectId: entry.ref.recordId,
    actorId: entry.actorId,
    causeId: entry.id,
    kind: change.kind,
    payload: change.payload as Prisma.InputJsonValue,
    createdAt: entry.at,
    deliveredAt: entry.at,
    nextAttemptAt: entry.at,
    attempts: 0,
    lastFailureCode: null,
  };
  await prisma.eventLog.upsert({
    where: { companyId_id: { companyId, id: entry.id } },
    create: { id: entry.id, ...data },
    update: data,
  });
}

const HISTORY_CONCURRENCY = 50;

/**
 * Reads the workspace's records, dependencies and identities once and serves the three lookups
 * `writeRecordChange` makes, collecting the events instead of writing them one by one.
 */
async function historyReader(prisma: PrismaClient, companyId: string) {
  const [records, dependencies, identities] = await Promise.all([
    prisma.crmRecord.findMany({ where: { companyId }, include: { values: true, assignments: true } }),
    prisma.recordValueDependency.findMany({ where: { companyId } }),
    prisma.recordIdentity.findMany({ where: { companyId }, include: { records: true } }),
  ]);
  const key = (typeId: string, recordId: string) => `${typeId}:${recordId}`;
  const byRef = new Map(records.map((record) => [key(record.typeId, record.id), record]));
  const dependenciesByRef = new Map<string, typeof dependencies>();
  for (const row of dependencies) {
    dependenciesByRef.set(key(row.typeId, row.recordId), [
      ...(dependenciesByRef.get(key(row.typeId, row.recordId)) ?? []),
      row,
    ]);
  }
  const identitiesByRef = new Map<string, typeof identities>();
  for (const identity of identities) {
    for (const link of identity.records) {
      identitiesByRef.set(key(link.typeId, link.recordId), [
        ...(identitiesByRef.get(key(link.typeId, link.recordId)) ?? []),
        identity,
      ]);
    }
  }
  const events: Prisma.EventLogCreateManyInput[] = [];
  type RecordWhere = { companyId_typeId_id: { typeId: string; id: string } };
  type RefWhere = { typeId: string; recordId: string };
  type IdentityWhere = { records: { some: RefWhere } };
  const client = {
    crmRecord: {
      findUniqueOrThrow: ({ where }: { where: RecordWhere }) => {
        const record = byRef.get(key(where.companyId_typeId_id.typeId, where.companyId_typeId_id.id));
        if (!record) throw new Error(`Missing synthetic history record ${where.companyId_typeId_id.id}`);
        return Promise.resolve(record);
      },
    },
    recordValueDependency: {
      findMany: ({ where }: { where: RefWhere }) =>
        Promise.resolve(dependenciesByRef.get(key(where.typeId, where.recordId)) ?? []),
    },
    recordIdentity: {
      findMany: ({ where }: { where: IdentityWhere }) =>
        Promise.resolve(identitiesByRef.get(key(where.records.some.typeId, where.records.some.recordId)) ?? []),
    },
    eventLog: {
      upsert: ({ create }: { create: Prisma.EventLogCreateManyInput }) => {
        events.push(create);
        return Promise.resolve(create);
      },
    },
  } as unknown as PrismaClient;
  return { client, events };
}

export type SyntheticHistoryEntry = {
  id: string;
  typeId: string;
  recordId: string;
  kind: "record.created" | "record.updated";
  at: Date;
  actorId: string;
  /** Created: the values at creation that differ from today. Updated: the values before the change. */
  values: ReadonlyMap<string, RecordScalar>;
};

/**
 * Writes a workspace's record history: every creation and the authored changes, at their story times, replacing the
 * events under `prefix`. Records with updates get the matching version.
 */
export async function writeSyntheticRecordHistory(
  prisma: PrismaClient,
  companyId: string,
  model: RecordModel,
  entries: readonly SyntheticHistoryEntry[],
  prefix: string,
): Promise<void> {
  const memory = await historyReader(prisma, companyId);
  const versions = new Map<string, { typeId: string; recordId: string; version: number }>();
  for (const entry of entries) {
    const key = `${entry.typeId}:${entry.recordId}`;
    const current = versions.get(key) ?? { typeId: entry.typeId, recordId: entry.recordId, version: 0 };
    versions.set(key, { ...current, version: current.version + 1 });
  }
  for (let start = 0; start < entries.length; start += HISTORY_CONCURRENCY) {
    await Promise.all(
      entries.slice(start, start + HISTORY_CONCURRENCY).map((entry) => {
        const created = entry.kind === "record.created";
        return writeRecordChange(memory.client, companyId, model, {
          id: entry.id,
          ref: { typeId: entry.typeId, recordId: entry.recordId },
          actorId: entry.actorId,
          at: entry.at,
          before: created ? null : entry.values,
          after: created ? entry.values : new Map(),
        });
      }),
    );
  }
  await prisma.$transaction(
    async (tx) => {
      await tx.eventLog.deleteMany({ where: { companyId, id: { startsWith: `${prefix}-` } } });
      for (let start = 0; start < memory.events.length; start += 1000)
        await tx.eventLog.createMany({ data: memory.events.slice(start, start + 1000) });
      const rows = [...versions.values()];
      if (rows.length) {
        const typeIds = rows.map((entry) => entry.typeId);
        const recordIds = rows.map((entry) => entry.recordId);
        const counts = rows.map((entry) => entry.version);
        await tx.$executeRaw`
          UPDATE "CrmRecord" AS record SET "version" = row.version
          FROM unnest(${typeIds}::text[], ${recordIds}::text[], ${counts}::int[]) AS row(type_id, id, version)
          WHERE record."companyId" = ${companyId} AND record."typeId" = row.type_id AND record."id" = row.id`;
      }
    },
    { maxWait: 60000, timeout: 600000 },
  );
}
