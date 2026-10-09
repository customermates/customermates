import { recordInvariant } from "./record-invariant";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { Prisma, RecordValue } from "@/generated/prisma";
import type { RecordRepo, StoredRecord } from "./record.repo";
import type { RecordRef } from "./record-model.schema";

import { RecordModelSchema, RecordRefSchema, CalculatedValueSchema } from "./record-model.schema";
import { encodeRecordValue } from "./record-storage";
import { recordKey } from "./record-calculation.service";
import { RecordIdentitySchema } from "./record-identity.schema";
import { identityAssociations, identityKeys } from "./record-identity";
import { channelClass } from "@/ee/messaging/provider";

export const StagedRecordSchema = z.object({
  ref: RecordRefSchema,
  deleted: z.boolean(),
  trashItemId: z.string().nullable().default(null),
  version: z.number().int().positive(),
  protectedKind: z.string().nullable(),
  systemData: z.unknown(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  assignedUserIds: z.array(z.uuid()),
});
export const StagedValueSchema = z.object({
  ref: RecordRefSchema,
  fieldId: z.uuid(),
  result: CalculatedValueSchema,
  revision: z.number().int(),
});
const StagedLinkSchema = z.object({
  id: z.uuid(),
  relationId: z.uuid(),
  source: RecordRefSchema,
  target: RecordRefSchema,
  deleted: z.boolean(),
});

export function createRecordStagingRepo(base: RecordRepo, operationId: string, companyId: string): RecordRepo {
  const overrides: Partial<RecordRepo> = {};
  const staged = new Proxy(base, {
    get(target, property) {
      const key = property as keyof RecordRepo;
      if (key in overrides) return overrides[key];
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      if (!/^(get|query|receipt|linked|valid|count)/.test(String(property)))
        throw new Error(`Unstaged record operation: ${String(property)}`);
      return value.bind(target);
    },
  });
  const stageRecord = (row: StoredRecord, deleted = false, trashItemId: string | null = null) =>
    base.stageRow(operationId, "record", recordKey({ typeId: row.typeId, recordId: row.id }), {
      ref: { typeId: row.typeId, recordId: row.id },
      deleted,
      trashItemId,
      version: row.version,
      protectedKind: row.protectedKind,
      systemData: row.systemData,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      assignedUserIds: row.assignments.map((assignment) => assignment.userId),
    });
  overrides.getModel = async () => {
    const schema = await base.getStageRow(operationId, "schema", "model");
    return schema ? RecordModelSchema.parse(schema) : base.getModel();
  };
  overrides.saveModel = async (model, _actorId, change) => {
    await base.stageRow(operationId, "schema", "model", model);
    if (change) await base.stageRow(operationId, "schema", "change", change);
  };
  overrides.setGrants = (typeId, grants) => base.stageRow(operationId, "grants", typeId, { typeId, grants });
  overrides.getIdentitiesCompanyWide = async (ref) => {
    const row = await base.getStageRow(operationId, "identity", recordKey(ref));
    return row
      ? z.object({ identities: z.array(RecordIdentitySchema) }).parse(row).identities
      : base.getIdentitiesCompanyWide(ref);
  };
  overrides.getIdentityChannelsCompanyWide = async (keys) => {
    const found = new Map((await base.getIdentityChannelsCompanyWide(keys)).map((row) => [row.id, row]));
    for (const row of await base.getStagedIdentityChannelsCompanyWide(operationId, keys)) found.set(row.id, row);
    return [...found.values()];
  };
  overrides.setIdentities = async (ref, inputs) => {
    const keys = inputs.flatMap((input) =>
      identityKeys(input).map((value) => ({
        channelClass: channelClass(input.provider),
        value,
      })),
    );
    const identities = identityAssociations(inputs, await staged.getIdentityChannelsCompanyWide(keys));
    await base.stageIdentityChannelsCompanyWide(operationId, identities);
    await base.stageRow(operationId, "identity", recordKey(ref), { ref, identities });
  };
  overrides.getRecordCompanyWide = async (ref, options = {}) => {
    const [record, overlay, values] = await Promise.all([
      base.getRecordCompanyWide(ref, { includeTrash: true }),
      base.getStageRow(operationId, "record", recordKey(ref)),
      base.getStageRowsByPrefix(operationId, "value", `${recordKey(ref)}:`),
    ]);
    const row = overlay ? StagedRecordSchema.parse(overlay) : null;
    if (row?.deleted || (!record && !row)) return null;
    if (record?.deletedAt && !options.includeTrash) return null;
    const result: StoredRecord = row
      ? {
          companyId,
          id: ref.recordId,
          typeId: ref.typeId,
          version: row.version,
          protectedKind: row.protectedKind,
          systemData: row.systemData as Prisma.JsonValue,
          rank: record?.rank ?? null,
          deletedAt: record?.deletedAt ?? null,
          trashItemId: record?.trashItemId ?? null,
          createdAt: new Date(row.createdAt),
          updatedAt: new Date(row.updatedAt),
          assignments: row.assignedUserIds.map((userId) => ({ userId })),
          values: record?.values ?? [],
        }
      : recordInvariant(record);
    const merged = new Map(result.values.map((value) => [value.fieldId, value]));
    for (const entry of values) {
      const value = StagedValueSchema.parse(entry.payload);
      const encoded = encodeRecordValue(value.result);
      const stored = {
        ...encoded,
        jsonValue:
          value.result.state === "value" && ["range", "richText"].includes(value.result.value.kind)
            ? encoded.jsonValue
            : null,
        companyId,
        typeId: ref.typeId,
        recordId: ref.recordId,
        fieldId: value.fieldId,
        schemaRevision: value.revision,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      } as RecordValue;
      merged.set(value.fieldId, stored);
    }
    return { ...result, values: [...merged.values()] };
  };
  overrides.getRecordsCompanyWide = async (refs, options) =>
    (await Promise.all(refs.map((ref) => staged.getRecordCompanyWide(ref, options)))).filter(
      (record): record is StoredRecord => record !== null,
    );
  overrides.getRecordRefsCompanyWide = (typeId, afterId, take, options) =>
    base.getStageRecordRefsCompanyWide(operationId, typeId, afterId, take, options);
  overrides.linkedRecordsCompanyWide = (ref, relationId, direction, take) =>
    base.linkedStageRecordsCompanyWide(operationId, ref, relationId, direction, take);
  overrides.create = async (ref, assignedUserIds) => {
    const now = new Date();
    await stageRecord({
      companyId,
      id: ref.recordId,
      typeId: ref.typeId,
      version: 1,
      protectedKind: null,
      systemData: null,
      rank: null,
      deletedAt: null,
      trashItemId: null,
      createdAt: now,
      updatedAt: now,
      assignments: assignedUserIds.map((userId) => ({ userId })),
      values: [],
    });
  };
  overrides.touch = async (ref) => {
    const record = await staged.getRecordCompanyWide(ref);
    if (record) {
      await stageRecord({
        ...record,
        version: record.version + 1,
        updatedAt: new Date(),
      });
    }
  };
  overrides.delete = async (ref) => {
    const record = await staged.getRecordCompanyWide(ref);
    if (record) await stageRecord(record, true);
  };
  overrides.addTrashItems = async (items) => {
    for (const item of items) await base.stageRow(operationId, "trash-item", item.id, item);
  };
  overrides.moveToTrash = async (ref, trashItemId) => {
    const record = await staged.getRecordCompanyWide(ref);
    if (record) await stageRecord(record, true, trashItemId);
  };
  overrides.setAssignments = async (ref, ids) => {
    const record = await staged.getRecordCompanyWide(ref);
    if (record) {
      await stageRecord({
        ...record,
        assignments: [...new Set(ids)].map((userId) => ({ userId })),
      });
    }
  };
  overrides.setValue = (ref, fieldId, result, revision) =>
    base.stageRow(operationId, "value", `${recordKey(ref)}:${fieldId}`, {
      ref,
      fieldId,
      result,
      revision,
    });
  overrides.setValueDependencies = (ref, fieldId, sources) =>
    base.stageRow(operationId, "dependency", `${recordKey(ref)}:${fieldId}`, {
      ref,
      fieldId,
      sources,
    });
  overrides.getValueDependencies = async (ref, fieldId) => {
    const row = await base.getStageRow(operationId, "dependency", `${recordKey(ref)}:${fieldId}`);
    return row
      ? z.object({ sources: z.array(RecordRefSchema) }).parse(row).sources
      : base.getValueDependencies(ref, fieldId);
  };
  overrides.getRecordDependenciesCompanyWide = async (ref) => {
    const merged = new Map(
      (await base.getRecordDependenciesCompanyWide(ref)).map((entry) => [entry.fieldId, entry.sources]),
    );
    for (const row of await base.getStageRowsByPrefix(operationId, "dependency", `${recordKey(ref)}:`)) {
      const entry = z.object({ fieldId: z.uuid(), sources: z.array(RecordRefSchema) }).parse(row.payload);
      merged.set(entry.fieldId, entry.sources);
    }
    return [...merged].map(([fieldId, sources]) => ({ fieldId, sources }));
  };
  const linkKey = (relationId: string, source: RecordRef, target: RecordRef) =>
    `${relationId}:${source.recordId}:${target.recordId}`;
  overrides.link = (relationId, source, target) =>
    base.stageRow(operationId, "link", linkKey(relationId, source, target), {
      id: randomUUID(),
      relationId,
      source,
      target,
      deleted: false,
    });
  overrides.unlink = (relationId, source, target) =>
    base.stageRow(operationId, "link", linkKey(relationId, source, target), {
      id: randomUUID(),
      relationId,
      source,
      target,
      deleted: true,
    });
  overrides.getLinksCompanyWide = async (ref, take) => {
    const existing = await base.getLinksCompanyWide(ref, take);
    if (take !== undefined && existing.length >= take) return existing;
    const edges = new Map(existing.map((edge) => [linkKey(edge.relationId, edge.source, edge.target), edge]));
    for (const row of await base.getStageRows(operationId, "link")) {
      const link = StagedLinkSchema.parse(row.payload);
      if (link.deleted) edges.delete(row.key);
      else if (recordKey(link.source) === recordKey(ref) || recordKey(link.target) === recordKey(ref))
        edges.set(row.key, link);
    }
    return [...edges.values()].slice(0, take);
  };
  overrides.appendEvent = (ref, actorId, causeId, kind, payload) =>
    base.stageRow(operationId, "event", `${recordKey(ref)}:${kind}`, {
      id: randomUUID(),
      ref,
      actorId,
      causeId,
      kind,
      payload,
    });
  return staged;
}
