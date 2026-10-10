import { z } from "zod";

import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { RecordModel } from "./record-model.schema";
import type { RecordMutation } from "./record-query.schema";
import type { RecordJournal } from "./record-journal";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordRefSchema } from "./record-model.schema";
import { RecordWriteError } from "./record-write.service";
import { recordKey } from "./record-calculation.service";
import { recordInvariant } from "./record-invariant";
import { recordTrashLabel } from "./record-trash-label";
import { deterministicId } from "./crm-preset";

export const DeletionCursorSchema = z.object({
  phase: z.enum(["deletePlan", "deleteLinks", "deleteRecords", "deleteTouches"]),
  index: z.number().int().nonnegative(),
  afterId: z.string().optional(),
  ref: RecordRefSchema.optional(),
  root: z.string().optional(),
});
const PlannedRecordSchema = z.object({
  ref: RecordRefSchema,
  version: z.number().int().positive(),
  root: z.string(),
  label: z.string(),
});
const LinkSchema = z.object({ relationId: z.uuid(), source: RecordRefSchema, target: RecordRefSchema });
type DeletionCursor = z.infer<typeof DeletionCursorSchema>;
type Cursor = DeletionCursor | { phase: "calculations"; index: number };
type Policy = Awaited<ReturnType<RecordAccessPolicy["load"]>>;

export class RecordDeletionStaging {
  constructor(
    private records: RecordRepo,
    private journal: RecordJournal,
    private operationId: string,
    private batchSize: number,
    private limit: number,
    private trash: { companyId: string; actorId: string },
  ) {}

  private trashItemId(root: string): string {
    return deterministicId(this.trash.companyId, `trash:${this.operationId}:${root}`);
  }

  async advance(
    cursor: DeletionCursor,
    mutation: Extract<RecordMutation, { action: "delete" | "deleteMany" }>,
    model: RecordModel,
    policy: Policy,
  ): Promise<{ cursor: Cursor; processed: number; affectedTypeIds?: string[] }> {
    if (cursor.phase === "deletePlan") {
      let ref = cursor.ref;
      let root = cursor.root;
      let afterId = cursor.afterId;
      let processed = 0;
      let edgesRead = 0;
      while (processed < this.batchSize && edgesRead < this.batchSize) {
        if (!ref) {
          const pending = await this.records.getPendingDeletionRef(this.operationId);
          ref = pending?.ref;
          root = pending?.root;
        }
        if (!ref) {
          const status = await this.records.getStagedDeletionStatus(this.operationId, model.revision);
          if (status.affectedCount > this.limit || status.linkCount > this.limit * 4)
            throw new RecordWriteError(CustomErrorCode.recordCalculationBudget, "conflict");
          if (status.restricted) throw new RecordWriteError(CustomErrorCode.recordDependencies, "conflict");
          if (mutation.expectedImpactHash && mutation.expectedImpactHash !== status.impactHash)
            throw new RecordWriteError(CustomErrorCode.recordVersionChanged, "conflict");
          return {
            cursor: { phase: "deleteLinks", index: 0 },
            processed,
            affectedTypeIds: status.affectedTypeIds,
          };
        }
        const key = recordKey(ref);
        if (!afterId) {
          if (!model.types.some((type) => type.id === ref?.typeId && !type.archived))
            throw new RecordWriteError(CustomErrorCode.recordTypeNotFound, "not_found");
          const row = await this.records.getRecordCompanyWide(ref);
          if (!row || !(await policy.canRead(row)))
            throw new RecordWriteError(CustomErrorCode.recordNotFound, "not_found");
          if (!policy.allowed(ref.typeId, "delete"))
            throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
          if (row.protectedKind) throw new RecordWriteError(CustomErrorCode.recordProtected, "authorization");
          await this.records.stageRow(this.operationId, "delete-plan", key, {
            ref,
            version: row.version,
            root,
            label: recordTrashLabel(row, model),
          });
          await this.records.stageRow(this.operationId, "delete-affected", key, ref);
        }
        const take = this.batchSize - edgesRead;
        const edges = await this.records.getLinksCompanyWidePage(ref, afterId, take);
        for (const edge of edges) {
          const relation = recordInvariant(model.relationships.find((relation) => relation.id === edge.relationId));
          const outgoing = recordKey(edge.source) === key;
          const opposite = outgoing ? edge.target : edge.source;
          const behavior = outgoing ? relation.onSourceDelete : relation.onTargetDelete;
          await this.records.stageRow(
            this.operationId,
            "delete-link",
            `${edge.relationId}:${recordKey(edge.source)}:${recordKey(edge.target)}`,
            edge,
          );
          await this.records.stageRow(this.operationId, "delete-affected", recordKey(opposite), opposite);
          if (behavior === "cascade")
            await this.records.queueDeletionRef(this.operationId, opposite, recordInvariant(root));
          else if (behavior === "restrict")
            await this.records.stageRow(this.operationId, "delete-restrict", recordKey(opposite), opposite);
        }
        edgesRead += edges.length;
        if (edges.length === take) afterId = recordInvariant(edges.at(-1)).id;
        else {
          await this.records.completeDeletionRef(this.operationId, ref);
          processed++;
          ref = undefined;
          root = undefined;
          afterId = undefined;
        }
      }
      return { cursor: { phase: "deletePlan", index: cursor.index + 1, ref, root, afterId }, processed };
    }

    const kind =
      cursor.phase === "deleteLinks"
        ? "delete-link"
        : cursor.phase === "deleteRecords"
          ? "delete-plan"
          : "delete-affected";
    const rows = await this.records.getStageRowsPage(this.operationId, kind, cursor.afterId, this.batchSize);
    for (const row of rows) {
      if (cursor.phase === "deleteLinks") await this.journal.stageDeletedLink(LinkSchema.parse(row.payload));
      else if (cursor.phase === "deleteRecords") {
        const planned = PlannedRecordSchema.parse(row.payload);
        if (planned.root === row.key) {
          await this.journal.repository.addTrashItems([
            {
              id: this.trashItemId(planned.root),
              typeId: planned.ref.typeId,
              targetId: planned.ref.recordId,
              label: planned.label,
              batchId: this.operationId,
              deletedById: this.trash.actorId,
            },
          ]);
        }
        await this.journal.stageDeletion(planned.ref, this.trashItemId(planned.root));
      } else if (!(await this.records.getStageRow(this.operationId, "delete-plan", row.key)))
        await this.journal.repository.touch(RecordRefSchema.parse(row.payload));
    }
    const next: Cursor =
      rows.length === this.batchSize
        ? { ...cursor, afterId: recordInvariant(rows.at(-1)).key }
        : {
            phase:
              cursor.phase === "deleteLinks"
                ? "deleteRecords"
                : cursor.phase === "deleteRecords"
                  ? "deleteTouches"
                  : "calculations",
            index: 0,
          };
    return { cursor: next, processed: rows.length };
  }
}
