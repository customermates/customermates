import { randomUUID } from "node:crypto";

import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { TrashItem } from "@/features/trash/trash.repo";
import type { TrashKindHandler, TrashKindImpact, TrashKindRestore } from "@/features/trash/trash-kind-handler";

import { Prisma } from "@/generated/prisma";
import { UserAccessor } from "@/core/base/user-accessor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordJournal } from "./record-journal";
import { RecordTrashService } from "./record-trash.service";
import { RecordWriteError } from "./record-write-error";
import { recordInvariant } from "./record-invariant";

export class RecordTrashHandler extends UserAccessor implements TrashKindHandler {
  readonly kinds = ["record"] as const;
  readonly restoreOrder = 1;

  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
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
    const branches = [
      ...(all.length ? [Prisma.sql`${alias}."typeId" IN (${Prisma.join(all)})`] : []),
      ...(own.length
        ? [
            Prisma.sql`(${alias}."typeId" IN (${Prisma.join(own)}) AND EXISTS (SELECT 1 FROM "RecordAssignment" assignment
              WHERE assignment."companyId" = ${alias}."companyId" AND assignment."typeId" = ${alias}."typeId"
                AND assignment."recordId" = ${alias}."targetId" AND assignment."userId" = ${policy.actor.id}))`,
          ]
        : []),
    ];
    return branches.length
      ? Prisma.sql`(${alias}.kind = 'record' AND (${Prisma.join(branches, " OR ")}))`
      : Prisma.sql`FALSE`;
  }

  async restore(items: TrashItem[]): Promise<TrashKindRestore> {
    const state = await this.records.getState();
    if (state?.activeOperationId) throw new RecordWriteError(CustomErrorCode.recordWritePaused, "conflict");
    const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
    if (!policy.actor) throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
    const journal = new RecordJournal(this.records, model);
    const stored = await this.records.getRecordTrashItemsCompanyWide({ ids: items.map((item) => item.id) });
    const result = await new RecordTrashService(this.records).restore(stored, model, policy, journal);
    await journal.flush(model, this.userId, randomUUID(), { kind: "mutation" });
    return result;
  }

  async impact(items: TrashItem[]): Promise<TrashKindImpact> {
    const model = await this.records.getModel();
    const counted = await this.records.countTrashedRecordsCompanyWide(items.map((item) => item.id));
    return {
      removedRecords: counted.records.map((entry) => ({
        ...entry,
        label: recordInvariant(model.types.find((type) => type.id === entry.typeId)).pluralLabel,
      })),
      removedLinks: counted.links,
    };
  }

  async purge(items: TrashItem[], actorId: string | null): Promise<void> {
    const model = await this.records.getModel();
    await new RecordTrashService(this.records).purge(
      items.map((item) => item.id),
      model,
      actorId,
      randomUUID(),
      { kind: actorId ? "mutation" : "system" },
    );
  }
}
