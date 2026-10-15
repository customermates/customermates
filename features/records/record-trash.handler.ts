import { unwindFailure } from "@/core/validation/failure-unwind";
import { randomUUID } from "node:crypto";

import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { TrashItem } from "@/features/trash/trash.repo";
import type { TrashKindHandler, TrashKindImpact, TrashKindRestore } from "@/features/trash/trash-kind-handler";

import { Prisma } from "@/generated/prisma";
import { UserAccessor } from "@/core/base/user-accessor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordJournal } from "./record-journal";
import type { RecordTrashService } from "./record-trash.service";
import { recordInvariant } from "./record-invariant";

export class RecordTrashHandler extends UserAccessor implements TrashKindHandler {
  readonly kinds = ["record"] as const;
  readonly restoreOrder = 1;

  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private background: Pick<BackgroundTaskService, "dispatch">,
    private recordTrash: RecordTrashService,
  ) {
    super();
  }

  async visibility(alias: Prisma.Sql): Promise<Prisma.Sql> {
    const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
    if (!policy.actor) return Prisma.sql`FALSE`;
    const deletable = model.types.filter((type) => !type.archived && policy.allowed(type.id, "delete"));
    const fullyReadable = (typeId: string, depth = 0): boolean => {
      if (policy.isAdmin) return true;
      const type = model.types.find((candidate) => candidate.id === typeId);
      const parent = model.relationships.find((relation) => relation.id === type?.parentRelationshipId);
      if (parent) return depth < 12 && fullyReadable(parent.targetTypeId, depth + 1);
      return policy.readScope(typeId) === "all";
    };
    const all = deletable.filter((type) => fullyReadable(type.id)).map((type) => type.id);
    const own = deletable
      .filter((type) => !type.parentRelationshipId && !all.includes(type.id) && policy.readScope(type.id) === "own")
      .map((type) => type.id);
    const ownParent = deletable.filter(
      (type) => type.parentRelationshipId && !all.includes(type.id) && policy.readScope(type.id) === "own",
    );
    const actorId = policy.actor.id;
    const assigned = (typeId: string, recordId: Prisma.Sql, depth = 0): Prisma.Sql => {
      const type = model.types.find((candidate) => candidate.id === typeId);
      const parent = model.relationships.find((relation) => relation.id === type?.parentRelationshipId);
      if (!parent) {
        return Prisma.sql`EXISTS (SELECT 1 FROM "RecordAssignment" assignment
          WHERE assignment."companyId" = ${alias}."companyId" AND assignment."typeId" = ${typeId}
            AND assignment."recordId" = ${recordId} AND assignment."userId" = ${actorId})`;
      }
      if (depth >= 12) return Prisma.sql`FALSE`;
      const link = Prisma.raw(`"parent_link_${depth}"`);
      return Prisma.sql`EXISTS (SELECT 1 FROM "RecordLink" ${link}
        WHERE ${link}."companyId" = ${alias}."companyId" AND ${link}."relationId" = ${parent.id}
          AND ${link}."sourceTypeId" = ${typeId} AND ${link}."sourceId" = ${recordId}
          AND ${assigned(parent.targetTypeId, Prisma.sql`${link}."targetId"`, depth + 1)})`;
    };
    const branches = [
      ...(all.length ? [Prisma.sql`${alias}."typeId" IN (${Prisma.join(all)})`] : []),
      ...(own.length
        ? [
            Prisma.sql`(${alias}."typeId" IN (${Prisma.join(own)}) AND EXISTS (SELECT 1 FROM "RecordAssignment" assignment
              WHERE assignment."companyId" = ${alias}."companyId" AND assignment."typeId" = ${alias}."typeId"
                AND assignment."recordId" = ${alias}."targetId" AND assignment."userId" = ${policy.actor.id}))`,
          ]
        : []),
      ...ownParent.map(
        (type) =>
          Prisma.sql`(${alias}."typeId" = ${type.id} AND ${assigned(type.id, Prisma.sql`${alias}."targetId"`)})`,
      ),
    ];
    if (!branches.length) return Prisma.sql`FALSE`;
    const cascaded = Prisma.sql`NOT EXISTS (SELECT 1 FROM "CrmRecord" member
      WHERE member."companyId" = ${alias}."companyId" AND member."trashItemId" = ${alias}.id
        AND member."typeId" NOT IN (${Prisma.join(deletable.map((type) => type.id))}))`;
    return Prisma.sql`(${alias}.kind = 'record' AND (${Prisma.join(branches, " OR ")}) AND ${cascaded})`;
  }

  async restore(items: TrashItem[]): Promise<TrashKindRestore> {
    const state = await this.records.getState();
    if (state?.activeOperationId) throw unwindFailure(CustomErrorCode.recordWritePaused, "conflict");
    const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
    if (!policy.actor) throw unwindFailure(CustomErrorCode.permissionDenied, "authorization");
    const journal = new RecordJournal(this.records, model);
    const stored = await this.records.getRecordTrashItemsCompanyWide({ ids: items.map((item) => item.id) });
    const result = await this.recordTrash.restore(stored, model, policy, journal);
    await journal.flush(model, this.userId, randomUUID(), { kind: "mutation" });
    return result;
  }

  async restoreInBackground(items: TrashItem[]): Promise<string> {
    const state = await this.records.getState();
    if (!state || state.activeOperationId) throw unwindFailure(CustomErrorCode.recordWritePaused, "conflict");
    const operationId = randomUUID();
    await this.records.createOperation({
      id: operationId,
      userId: this.userId,
      kind: "restore",
      expectedRevision: state.revision,
      request: { itemIds: items.map((item) => item.id), idempotencyKey: operationId },
    });
    await this.background.dispatch("record-operation", { operationId, ownerUserId: this.userId });
    return operationId;
  }

  async impact(items: TrashItem[]): Promise<TrashKindImpact> {
    const model = await this.records.getModel();
    const itemIds = items.map((item) => item.id);
    const along = await this.recordTrash.purgedAlong(itemIds, model);
    const counted = await this.records.countTrashedRecordsCompanyWide([...itemIds, ...along.itemIds], along.refs);
    return {
      removedRecords: counted.records.map((entry) => ({
        ...entry,
        label: recordInvariant(model.types.find((type) => type.id === entry.typeId)).pluralLabel,
      })),
      removedLinks: counted.links,
    };
  }

  async dependents(items: TrashItem[]): Promise<string[]> {
    const itemIds = items.map((item) => item.id);
    return (await this.recordTrash.purgedAlong(itemIds, await this.records.getModel())).itemIds;
  }

  async purge(items: TrashItem[], actorId: string | null): Promise<void> {
    const model = await this.records.getModel();
    await this.recordTrash.purge(
      items.map((item) => item.id),
      model,
      actorId,
      randomUUID(),
      { kind: actorId ? "mutation" : "system" },
    );
  }
}
