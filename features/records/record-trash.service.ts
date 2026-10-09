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
    const members = await this.records.countTrashedRecordsCompanyWide([item.id]);
    if (!row || !members.records.every((entry) => policy.allowed(entry.typeId, "delete")))
      return { itemId: item.id, reason: "notFound", typeId: item.typeId };
    if (type.parentRelationshipId) {
      const parentRef = await this.records.getTrashedParentCompanyWide(ref, type.parentRelationshipId);
      if (!parentRef || !(await this.records.getRecordCompanyWide(parentRef))) {
        return {
          itemId: item.id,
          reason: "parentDeleted",
          typeId: item.typeId,
          ...(parentRef ? { parent: parentRef } : {}),
        };
      }
    }
    return (await policy.canRead(row)) ? null : { itemId: item.id, reason: "notFound", typeId: item.typeId };
  }

  async restore(
    items: RecordTrashItem[],
    model: RecordModel,
    policy: Policy,
    journal: RecordJournal,
    limit = SYNCHRONOUS_RECORD_LIMIT,
  ): Promise<RecordRestoreResult> {
    const result: RecordRestoreResult = { restoredItemIds: [], blocked: [], restoredRecords: 0, droppedLinks: 0 };
    let pending = items;
    let progressed = true;
    while (pending.length && progressed) {
      progressed = false;
      const waiting: RecordTrashItem[] = [];
      result.blocked = [];
      for (const item of pending) {
        const blocker = await this.accessible(item, model, policy);
        if (blocker?.reason === "parentDeleted") {
          waiting.push(item);
          result.blocked.push(blocker);
          continue;
        }
        if (blocker) {
          result.blocked.push(blocker);
          continue;
        }
        const refs = await journal.repository.getTrashedRecordRefsCompanyWide(
          [item.id],
          limit - result.restoredRecords + 1,
        );
        if (result.restoredRecords + refs.length > limit)
          throw new RecordWriteError(CustomErrorCode.recordCalculationBudget, "conflict");
        result.droppedLinks += await this.restoreRecords(refs, model, journal, limit);
        await journal.repository.removeTrashItems([item.id]);
        result.restoredItemIds.push(item.id);
        result.restoredRecords += refs.length;
        progressed = true;
      }
      pending = waiting;
    }
    result.blocked = [
      ...result.blocked.filter((blocker) => blocker.reason !== "parentDeleted"),
      ...result.blocked.filter(
        (blocker) => blocker.reason === "parentDeleted" && pending.some((item) => item.id === blocker.itemId),
      ),
    ];
    return result;
  }

  async restoreRecords(refs: RecordRef[], model: RecordModel, journal: RecordJournal, limit: number) {
    const records = journal.repository;
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
    return droppedLinks;
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
