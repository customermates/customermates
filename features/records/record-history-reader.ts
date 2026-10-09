import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { RecordModel, RecordRef } from "./record-model.schema";
import type { RecordEventPayload, RecordHistoryValue } from "./record-event.schema";
import type { RecordHistoryChangesSchema } from "./record-event.schema";
import type { z } from "zod";

import { calculationDependencyHash } from "./configuration.service";
import { recordKey } from "./record-calculation.service";

type Policy = Awaited<ReturnType<RecordAccessPolicy["load"]>>;

export class RecordHistoryReader {
  constructor(private records: RecordRepo) {}

  async redact(
    payload: RecordEventPayload,
    model: RecordModel,
    policy: Policy,
    mode: "history" | "delivery" = "history",
  ): Promise<RecordHistoryChanges> {
    if (!policy.actor || !model.types.some((type) => type.id === payload.ref.typeId && !type.archived)) return null;
    const owner = await this.records.getRecordCompanyWide(payload.ref, { includeTrash: true });
    const removedAssignedRecord =
      mode === "delivery" &&
      payload.afterVersion === null &&
      !model.types.find((type) => type.id === payload.ref.typeId)?.parentRelationshipId &&
      policy.allowed(payload.ref.typeId, "readOwn") &&
      payload.assignments?.before.includes(policy.actor.id);
    if (
      owner ? !(await policy.canRead(owner)) : !policy.allowed(payload.ref.typeId, "readAll") && !removedAssignedRecord
    )
      return null;
    const refs = new Map<string, RecordRef>();
    for (const field of payload.fields) {
      for (const value of [field.before, field.after])
        for (const source of value?.sources ?? []) refs.set(recordKey(source), source);
    }
    for (const link of payload.links) for (const ref of [link.source, link.target]) refs.set(recordKey(ref), ref);
    const accessible = new Set<string>();
    const pending = [...refs.values()];
    for (let index = 0; index < pending.length; index += 100) {
      const rows = await this.records.getRecordsCompanyWide(pending.slice(index, index + 100));
      for (const row of rows)
        if (await policy.canRead(row)) accessible.add(recordKey({ typeId: row.typeId, recordId: row.id }));
    }
    const publicationValid = (fieldId: string, dependencyHash: string) => {
      const definition = model.fields.find((field) => field.id === fieldId);
      return Boolean(definition?.publishedSummary && calculationDependencyHash(definition, model) === dependencyHash);
    };
    const read = (value: RecordHistoryValue | null) => {
      if (!value) return null;
      const readable =
        policy.isAdmin ||
        (value.publishedSummary && publicationValid(value.fieldId, value.dependencyHash)) ||
        (value.sources.every((ref) => accessible.has(recordKey(ref))) &&
          value.publications.every((publication) => publicationValid(publication.fieldId, publication.dependencyHash)));
      return {
        fieldId: value.fieldId,
        label: value.label,
        valueType: value.valueType,
        format: value.format,
        options: value.options,
        value: readable ? value.value : { state: "restricted" as const },
      };
    };
    return {
      ref: payload.ref,
      schemaRevision: payload.schemaRevision,
      beforeVersion: payload.beforeVersion,
      afterVersion: payload.afterVersion,
      fields: payload.fields.map((field) => ({
        fieldId: field.fieldId,
        before: read(field.before),
        after: read(field.after),
      })),
      assignments: payload.assignments,
      identities: payload.identities,
      links: payload.links.filter((link) => [link.source, link.target].every((ref) => accessible.has(recordKey(ref)))),
      related: [],
    };
  }
}

export type RecordHistoryChanges = z.infer<typeof RecordHistoryChangesSchema> | null;
