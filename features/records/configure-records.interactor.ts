import type { RecordConfigurationWriter } from "./record-configuration-writer";
import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { ConfigurationChange } from "./configuration.schema";
import type { RecordOperationResult } from "./record-query.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { fail, failAuthorization, failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { ConfigurationChangeSchema } from "./configuration.schema";
import { canConfigureRecords, type RecordConfigurationService } from "./configuration.service";
import { RecordOperationResultSchema } from "./record-query.schema";
import { recordRequestHash, recordWriteFailure } from "./mutate-record.interactor";
import { RecordJournal } from "./record-journal";
import { currentRoutineContext } from "@/core/decorators/routine-context";

@TenantInteractor()
export class ApplyRecordConfigurationInteractor extends AuthenticatedInteractor<
  ConfigurationChange,
  RecordOperationResult
> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private configurations: RecordConfigurationService,
    private writer: RecordConfigurationWriter,
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {
    super();
  }
  @Validate(ConfigurationChangeSchema)
  async invoke(input: ConfigurationChange): Validated<RecordOperationResult> {
    return runInTransaction(
      async (): Validated<RecordOperationResult> => {
        const policy = await this.policy.load();
        if (!canConfigureRecords(input, policy)) return failAuthorization(CustomErrorCode.permissionDenied);
        const hash = recordRequestHash(input);
        const receipt = await this.records.receipt(input.idempotencyKey, this.userId);
        if (receipt) {
          return receipt.requestHash === hash
            ? {
                ok: true,
                data: RecordOperationResultSchema.parse(receipt.result),
              }
            : failConflict(CustomErrorCode.recordIdempotencyConflict);
        }
        if ((await this.records.getState())?.activeOperationId) return failConflict(CustomErrorCode.recordWritePaused);
        try {
          const current = await this.records.getModel();
          const prepared = await this.configurations.prepare(input, current, policy);
          if (!prepared.preview.valid) return fail(CustomErrorCode.recordConfigurationInvalid);
          let data: RecordOperationResult;
          if (prepared.preview.execution === "background") {
            const operationId = randomUUID();
            await this.records.createOperation({
              id: operationId,
              userId: this.userId,
              kind: "configuration",
              expectedRevision: current.revision,
              request: input,
              stagedSchema: prepared.model,
            });
            await this.records.stageRow(operationId, "context", "cause", {
              kind: "configuration",
              operationId,
              routineDepth: currentRoutineContext()?.causationDepth,
            });
            await this.background.dispatch("record-operation", {
              operationId,
              ownerUserId: this.userId,
            });
            data = {
              status: "pending",
              operationId,
              schemaRevision: current.revision,
            };
          } else {
            const journal = new RecordJournal(this.records, current);
            await this.writer.withRepository(journal.repository).apply(prepared, current, this.userId);
            await journal.flush(prepared.model, this.userId, input.idempotencyKey, {
              kind: "configuration",
              routineDepth: currentRoutineContext()?.causationDepth,
            });
            data = {
              status: "completed",
              refs: [],
              schemaRevision: prepared.model.revision,
            };
          }
          await this.records.saveReceipt(input.idempotencyKey, this.userId, hash, data);
          return { ok: true, data };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { timeout: 30000 },
    );
  }
}

export const GetModelSchema = z.object({ typeIds: z.array(z.uuid()).max(100).optional() }).strict();
