import { createHash, randomUUID } from "node:crypto";

import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { MutateRecordInput, RecordOperationResult } from "./record-query.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { fail, failAuthorization, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { MutateRecordSchema, RecordOperationResultSchema } from "./record-query.schema";
import type { RecordWriteService } from "./record-write.service";
import { RecordWriteError } from "./record-write.service";
import { RecordJournal } from "./record-journal";
import { CalculationBudgetExceeded } from "./calculation-budget-exceeded";
import { currentRoutineContext } from "@/core/decorators/routine-context";
import { canonicalRecordJson } from "./record-json";

export const recordRequestHash = (request: unknown) =>
  createHash("sha256").update(canonicalRecordJson(request)).digest("hex");
export function recordWriteFailure(error: unknown) {
  if (error instanceof CalculationBudgetExceeded) return failConflict(CustomErrorCode.recordCalculationBudget);
  if (!(error instanceof RecordWriteError)) throw error;
  const respond =
    error.kind === "authorization"
      ? failAuthorization
      : error.kind === "conflict"
        ? failConflict
        : error.kind === "not_found"
          ? failNotFound
          : fail;
  return respond(error.code, error.path);
}

@TenantInteractor()
export class MutateRecordInteractor extends AuthenticatedInteractor<MutateRecordInput, RecordOperationResult> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private writer: RecordWriteService,
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {
    super();
  }

  @Validate(MutateRecordSchema)
  async invoke(input: MutateRecordInput): Validated<RecordOperationResult> {
    const hash = recordRequestHash(input);
    const result = await runInTransaction(
      async (): Validated<RecordOperationResult> => {
        const policy = await this.policy.load();
        if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
        const receipt = await this.records.receipt(input.idempotencyKey, this.userId);
        if (receipt) {
          return receipt.requestHash === hash
            ? {
                ok: true,
                data: RecordOperationResultSchema.parse(receipt.result),
              }
            : failConflict(CustomErrorCode.recordIdempotencyConflict);
        }
        const state = await this.records.getState();
        if (state?.activeOperationId) return failConflict(CustomErrorCode.recordWritePaused);
        const model = await this.records.getModel();
        if (model.revision !== input.expectedRevision) return failConflict(CustomErrorCode.recordSchemaChanged);
        try {
          const journal = new RecordJournal(this.records, model);
          const cause = {
            kind: "mutation" as const,
            routineDepth: currentRoutineContext()?.causationDepth,
          };
          const changed = await this.writer
            .withRepository(journal.repository)
            .apply(input.mutation, model, policy, undefined, {
              beforeDeletion: (refs) => journal.prepareDeletion(refs, model, this.userId, input.idempotencyKey, cause),
            });
          await journal.flush(model, this.userId, input.idempotencyKey, cause);
          const refs = [];
          for (const ref of changed.refs) {
            const row = await this.records.getRecordCompanyWide(ref);
            if (row && (await policy.canRead(row))) refs.push(ref);
          }
          const data: RecordOperationResult = {
            status: "completed",
            refs,
            schemaRevision: model.revision,
          };
          await this.records.saveReceipt(input.idempotencyKey, this.userId, hash, data);
          return { ok: true, data };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { timeout: 20000 },
    );
    if (
      result.ok ||
      (input.mutation.action === "update" && input.mutation.placement) ||
      !result.error.issues.some(
        (issue) => issue.code === "custom" && issue.params?.error === CustomErrorCode.recordCalculationBudget,
      )
    )
      return result;
    return runInTransaction(async (): Validated<RecordOperationResult> => {
      const policy = await this.policy.load();
      if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
      const receipt = await this.records.receipt(input.idempotencyKey, this.userId);
      if (receipt) {
        return receipt.requestHash === hash
          ? {
              ok: true,
              data: RecordOperationResultSchema.parse(receipt.result),
            }
          : failConflict(CustomErrorCode.recordIdempotencyConflict);
      }
      const state = await this.records.getState();
      if (state?.revision !== input.expectedRevision) return failConflict(CustomErrorCode.recordSchemaChanged);
      if (state.activeOperationId) return failConflict(CustomErrorCode.recordWritePaused);
      try {
        await this.writer.validateAccess(input.mutation, policy);
      } catch (error) {
        return recordWriteFailure(error);
      }
      const operationId = randomUUID();
      await this.records.createOperation({
        id: operationId,
        userId: this.userId,
        kind: "mutation",
        expectedRevision: input.expectedRevision,
        request: input,
      });
      await this.records.stageRow(operationId, "context", "cause", {
        kind: "mutation",
        operationId,
        routineDepth: currentRoutineContext()?.causationDepth,
      });
      const data: RecordOperationResult = {
        status: "pending",
        operationId,
        schemaRevision: input.expectedRevision,
      };
      await this.records.saveReceipt(input.idempotencyKey, this.userId, hash, data);
      await this.background.dispatch("record-operation", {
        operationId,
        ownerUserId: this.userId,
      });
      return { ok: true, data };
    });
  }
}
