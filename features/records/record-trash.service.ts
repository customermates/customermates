import type { RecordAccessPolicy } from "./record-access";
import type { RecordRepo, RecordTrashItem } from "./record.repo";
import type { RecordModel, RecordRef } from "./record-model.schema";
import type { RecordJournal } from "./record-journal";
import type { RecordEventPayload } from "./record-event.schema";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordCalculationService, recordKey, SYNCHRONOUS_RECORD_LIMIT } from "./record-calculation.service";
import { RecordWriteError } from "./record-write-error";
import { recordInvariant } from "./record-invariant";

type Policy = Awaited<ReturnType<RecordAccessPolicy["load"]>>;

export type RecordRestoreBlocker = {
  itemId: string;
  reason: "listDeleted" | "parentDeleted" | "notFound";
  typeId: string;
  parent?: RecordRef;
};
export type RecordRestoreResult = {
  restoredItemIds: string[];
  blocked: RecordRestoreBlocker[];
  restoredRecords: number;
  droppedLinks: number;
};

export function deletedPermanentlyPayload(
  ref: RecordRef,
  model: RecordModel,
  cause: RecordEventPayload["cause"],
): RecordEventPayload {
  return {
    ref,
    schemaRevision: model.revision,
    cause,
    beforeVersion: null,
    afterVersion: null,
    changedFieldIds: [],
    fields: [],
    assignments: null,
    identities: null,
    links: [],
  };
}

export class RecordTrashService {
  constructor(private records: RecordRepo) {}

  async accessible(item: RecordTrashItem, model: RecordModel, policy: Policy): Promise<RecordRestoreBlocker | null> {
    const type = model.types.find((candidate) => candidate.id === item.typeId);
    if (!type || type.archived) return { itemId: item.id, reason: "listDeleted", typeId: item.typeId };
    const ref = { typeId: item.typeId, recordId: item.targetId };
    const row = await this.records.getRecordCompanyWide(ref, { includeTrash: true });
    if (!row || !policy.allowed(item.typeId, "delete"))
      return { itemId: item.id, reason: "notFound", typeId: item.typeId };
    if (!type.parentRelationshipId) {
      if (!(await policy.canRead(row))) return { itemId: item.id, reason: "notFound", typeId: item.typeId };
      return null;
    }
    const parentLink = (await this.records.getTrashedLinksCompanyWide([ref], SYNCHRONOUS_RECORD_LIMIT * 4)).find(
      (link) => link.relationId === type.parentRelationshipId && recordKey(link.source) === recordKey(ref),
    );
    const parent = parentLink ? await this.records.getRecordCompanyWide(parentLink.target) : null;
    if (!parentLink || !parent)
      return { itemId: item.id, reason: "parentDeleted", typeId: item.typeId, parent: parentLink?.target };
    if (!(await policy.canRead(parent))) return { itemId: item.id, reason: "notFound", typeId: item.typeId };
    return null;
  }

  async restore(
    items: RecordTrashItem[],
    model: RecordModel,
    policy: Policy,
    journal: RecordJournal,
    limit = SYNCHRONOUS_RECORD_LIMIT,
  ): Promise<RecordRestoreResult> {
    const records = journal.repository;
    const blocked: RecordRestoreBlocker[] = [];
    const restorable: RecordTrashItem[] = [];
    for (const item of items) {
      const blocker = await this.accessible(item, model, policy);
      if (blocker) blocked.push(blocker);
      else restorable.push(item);
    }
    const refs = await records.getTrashedRecordRefsCompanyWide(
      restorable.map((item) => item.id),
      limit + 1,
    );
    if (refs.length > limit) throw new RecordWriteError(CustomErrorCode.recordCalculationBudget, "conflict");
    await journal.prepareRestore(refs);
    await records.restoreRecords(refs);
    const restored = new Set(refs.map(recordKey));
    const seeds = new Map(refs.map((ref) => [recordKey(ref), ref]));
    const live = new Map<string, boolean>();
    const isLive = async (ref: RecordRef) => {
      const key = recordKey(ref);
      if (restored.has(key)) return true;
      if (!live.has(key)) live.set(key, (await records.getRecordCompanyWide(ref)) !== null);
      return recordInvariant(live.get(key));
    };
    const links = await records.getTrashedLinksCompanyWide(refs, limit * 4 + 1);
    if (links.length > limit * 4) throw new RecordWriteError(CustomErrorCode.recordCalculationBudget, "conflict");
    let droppedLinks = 0;
    for (const link of links) {
      if (!(await isLive(link.source)) || !(await isLive(link.target))) continue;
      const relation = model.relationships.find((candidate) => candidate.id === link.relationId);
      const conflicting =
        relation &&
        !relation.archived &&
        ((relation.sourceCardinality === "one" &&
          (await records.linkedRecordsCompanyWide(link.source, link.relationId, "outgoing", 1)).length > 0) ||
          (relation.targetCardinality === "one" &&
            (await records.linkedRecordsCompanyWide(link.target, link.relationId, "incoming", 1)).length > 0));
      if (conflicting) {
        await records.dropTrashedLink(link.id);
        droppedLinks++;
        continue;
      }
      await records.restoreLink(link.id);
      await journal.restoreLink(link);
      seeds.set(recordKey(link.source), link.source);
      seeds.set(recordKey(link.target), link.target);
      if (seeds.size > limit) throw new RecordWriteError(CustomErrorCode.recordCalculationBudget, "conflict");
    }
    const recalculated = await new RecordCalculationService(records).recalculate(
      model,
      [...seeds.values()],
      new Map(),
      limit,
    );
    if (!recalculated.complete) throw new RecordWriteError(CustomErrorCode.recordCalculationBudget, "conflict");
    for (const ref of recalculated.changed) seeds.set(recordKey(ref), ref);
    for (const [key, ref] of seeds) if (!restored.has(key)) await records.touch(ref);
    await records.removeTrashItems(restorable.map((item) => item.id));
    return {
      restoredItemIds: restorable.map((item) => item.id),
      blocked,
      restoredRecords: refs.length,
      droppedLinks,
    };
  }

  async purge(
    itemIds: string[],
    model: RecordModel,
    actorId: string | null,
    causeId: string,
    cause: RecordEventPayload["cause"],
  ): Promise<RecordRef[]> {
    const refs = await this.records.purgeTrashItems(itemIds);
    for (const ref of refs) {
      await this.records.appendEvent(
        ref,
        actorId,
        causeId,
        "record.deletedPermanently",
        deletedPermanentlyPayload(ref, model, cause),
      );
    }
    return refs;
  }
}
