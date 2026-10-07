import { calculationDependencyHash } from "@/features/records/configuration.service";
import { presetId } from "@/features/records/crm-preset";
import { recordEventChanges, historyPublications } from "@/features/records/record-journal";
import { compareRecordKey } from "@/features/records/record-json";
import { readRecordModelSnapshot } from "@/features/records/record-model-snapshot";
import type { RecordModel, RecordRef, RecordScalar } from "@/features/records/record-model.schema";
import type { RecordHistorySnapshot } from "@/features/records/record-event.schema";
import { decodeRecordValue } from "@/features/records/record-storage";
import type { Prisma, PrismaClient } from "@/generated/prisma";

import type { SeedContext } from "./context";
import type { SyntheticRecordType } from "./custom-fields";
import { fixtureId } from "./helpers";
import type { RelationshipSeedInput } from "./relationships";
import {
  SYNTHETIC_CONTACT_UPDATE_INDEXES,
  SYNTHETIC_DEAL_UPDATE_INDEXES,
  SYNTHETIC_ORGANIZATION_UPDATE_INDEXES,
  SYNTHETIC_TASK_UPDATE_INDEXES,
} from "./timeline";

export const SYNTHETIC_RECORD_EVENT_ID_PREFIX = "3a000000";

export const SYNTHETIC_PREVIOUS_ORGANIZATION_NAMES = new Map<number, string>([
  [5, "ASM Lithography"],
  [10, "PricewaterhouseCoopers"],
  [12, "NRW Bank"],
  [13, "Hoffmann-La Roche"],
]);

export const SYNTHETIC_PREVIOUS_CONTACT_FIRST_NAMES = new Map<number, string>([
  [0, "Leo"],
  [6, "Johannes"],
  [7, "Ayman"],
  [19, "Sophia"],
  [22, "Annika"],
  [23, "Jasmin"],
  [26, "Rachid"],
]);

export const SYNTHETIC_PREVIOUS_DEAL_NAMES = new Map<number, string>([
  [0, "Workflow Automation Program"],
  [1, "Business Intelligence Transformation"],
  [2, "CRM Implementation"],
]);

export const SYNTHETIC_PREVIOUS_TASK_NAMES = new Map<number, string>([
  [0, "Draft the Wavestone proposal"],
  [4, "Arrange a discovery call with BMW"],
  [7, "Follow up with Roche legal"],
  [8, "Arrange a discovery call with PwC"],
  [13, "Review notes from the Roche demo"],
]);

export const SYNTHETIC_RECENT_TASK_HISTORY_OFFSETS_MINUTES = {
  created: new Map<number, number>([
    [10, 156],
    [11, 126],
    [12, 66],
    [13, 96],
    [14, 12],
  ]),
  updated: new Map<number, number>([[13, 38]]),
} as const;

export type SyntheticHistoryEntry = {
  id: string;
  type: SyntheticRecordType;
  index: number;
  recordId: string;
  kind: "record.created" | "record.updated";
  at: Date;
  actorId: string;
  previous: Array<[key: string, value: string]>;
};

export function buildSyntheticRecordHistory(args: {
  entities: RelationshipSeedInput;
  primaryUserId: string;
  taskActorIds: string[];
  messagingSyncAt: Date;
}): SyntheticHistoryEntry[] {
  const { entities, primaryUserId, taskActorIds, messagingSyncAt } = args;
  const entries: SyntheticHistoryEntry[] = [];
  const push = (entry: Omit<SyntheticHistoryEntry, "id">) =>
    entries.push({ id: fixtureId(SYNTHETIC_RECORD_EVENT_ID_PREFIX, entries.length + 1), ...entry });
  const recentTaskTime = (phase: "created" | "updated", index: number, fallback: Date) => {
    const offset = SYNTHETIC_RECENT_TASK_HISTORY_OFFSETS_MINUTES[phase].get(index);
    return offset === undefined ? fallback : new Date(messagingSyncAt.getTime() - offset * 60_000);
  };
  const renamed = (
    type: SyntheticRecordType,
    rows: ReadonlyArray<{ id: string; createdAt: Date; updatedAt: Date }>,
    key: string,
    previousValues: ReadonlyMap<number, string>,
    updates: readonly number[],
    actorId: (index: number) => string = () => primaryUserId,
    time: (phase: "created" | "updated", index: number, fallback: Date) => Date = (_phase, _index, fallback) =>
      fallback,
  ) => {
    for (const [index, row] of rows.entries()) {
      const previous = previousValues.get(index);
      push({
        type,
        index,
        recordId: row.id,
        kind: "record.created",
        at: time("created", index, row.createdAt),
        actorId: actorId(index),
        previous: previous === undefined ? [] : [[key, previous]],
      });
    }
    for (const index of updates) {
      const row = rows[index];
      const previous = previousValues.get(index);
      if (!row || previous === undefined) throw new Error(`Missing ${type} history update ${index}`);
      if (row.updatedAt.getTime() <= row.createdAt.getTime())
        throw new Error(`Synthetic ${type} update ${index} must follow its creation`);
      push({
        type,
        index,
        recordId: row.id,
        kind: "record.updated",
        at: time("updated", index, row.updatedAt),
        actorId: actorId(index),
        previous: [[key, previous]],
      });
    }
  };

  renamed(
    "organization",
    entities.organizations,
    "name",
    SYNTHETIC_PREVIOUS_ORGANIZATION_NAMES,
    SYNTHETIC_ORGANIZATION_UPDATE_INDEXES,
  );
  renamed(
    "contact",
    entities.contacts,
    "firstName",
    SYNTHETIC_PREVIOUS_CONTACT_FIRST_NAMES,
    SYNTHETIC_CONTACT_UPDATE_INDEXES,
  );
  renamed("service", entities.services, "name", new Map(), []);
  renamed("deal", entities.deals, "name", SYNTHETIC_PREVIOUS_DEAL_NAMES, SYNTHETIC_DEAL_UPDATE_INDEXES);
  renamed(
    "task",
    entities.tasks,
    "name",
    SYNTHETIC_PREVIOUS_TASK_NAMES,
    SYNTHETIC_TASK_UPDATE_INDEXES,
    (index) => taskActorIds[index % taskActorIds.length],
    recentTaskTime,
  );
  return entries;
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
  const identities = model.capabilities.some((binding) => binding.typeId === ref.typeId && binding.kind === "channels")
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
          publications: historyPublications(field, model),
          dependencyHash: calculationDependencyHash(field, model),
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

export async function seedRecordHistory(context: SeedContext, entities: RelationshipSeedInput): Promise<void> {
  const { prisma, ids } = context;
  const companyId = ids.company;
  const state = await prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId } });
  const model = readRecordModelSnapshot(
    (
      await prisma.recordSchemaRevision.findUniqueOrThrow({
        where: { companyId_revision: { companyId, revision: state.revision } },
      })
    ).snapshot,
  );
  const accounts = await prisma.connectedAccount.findMany({
    where: { companyId, lastSyncedAt: { not: null } },
    select: { lastSyncedAt: true },
  });
  const syncTimes = accounts.flatMap(({ lastSyncedAt }) => (lastSyncedAt ? [lastSyncedAt.getTime()] : []));
  if (!syncTimes.length) throw new Error("Missing synthetic messaging sync anchor for recent record history");
  const users = await prisma.user.findMany({
    where: { companyId, id: { in: [ids.user, ids.sofiaRossiUser, ids.elenaHoffmannUser] } },
    select: { id: true },
  });
  const entries = buildSyntheticRecordHistory({
    entities,
    primaryUserId: ids.user,
    taskActorIds: [
      ids.user,
      ...users
        .map(({ id }) => id)
        .filter((id) => id !== ids.user)
        .sort(),
    ],
    messagingSyncAt: new Date(Math.max(...syncTimes)),
  });
  for (const entry of entries) {
    const ref = { typeId: presetId(companyId, entry.type), recordId: entry.recordId };
    const overrides = new Map<string, RecordScalar>(
      entry.previous.map(([key, value]) => [presetId(companyId, `${entry.type}.${key}`), { kind: "text", value }]),
    );
    const previousFirstName = entry.previous.find(([key]) => key === "firstName")?.[1];
    if (entry.type === "contact" && previousFirstName !== undefined) {
      overrides.set(presetId(companyId, "contact.name"), {
        kind: "text",
        value: `${previousFirstName} ${entities.contacts[entry.index].lastName}`.trim(),
      });
    }
    await writeRecordChange(prisma, companyId, model, {
      id: entry.id,
      ref,
      actorId: entry.actorId,
      at: entry.at,
      before: entry.kind === "record.updated" ? overrides : null,
      after: entry.kind === "record.updated" ? new Map() : overrides,
    });
  }
  for (const entry of entries.filter((candidate) => candidate.kind === "record.updated")) {
    const row = entities[`${entry.type}s`][entry.index];
    await prisma.crmRecord.update({
      where: { companyId_typeId_id: { companyId, typeId: presetId(companyId, entry.type), id: entry.recordId } },
      data: { version: 2, updatedAt: row.updatedAt },
    });
  }
  await prisma.eventLog.deleteMany({
    where: {
      companyId,
      id: { startsWith: `${SYNTHETIC_RECORD_EVENT_ID_PREFIX}-`, notIn: entries.map(({ id }) => id) },
    },
  });
}
