import { z } from "zod";

import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { Validated } from "@/core/validation/validation.utils";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordOperationResultSchema } from "./record-query.schema";

export const RecordOperationInputSchema = z.object({ operationId: z.uuid() }).strict();
const Schema = RecordOperationInputSchema;
export const RecordOperationStatusSchema = z
  .object({
    id: z.uuid(),
    state: z.enum(["pending", "staging", "completed", "cancelled", "failed"]),
    processed: z.number().int(),
    total: z.number().int(),
    errorCode: z.string().nullable(),
    result: RecordOperationResultSchema.nullable(),
  })
  .strict();

@AllowInDemoMode
@TenantInteractor()
export class GetRecordOperationInteractor extends AuthenticatedInteractor<
  z.infer<typeof Schema>,
  z.infer<typeof RecordOperationStatusSchema>
> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }
  @Validate(Schema)
  async invoke(input: z.infer<typeof Schema>): Validated<z.infer<typeof RecordOperationStatusSchema>> {
    return runInTransaction(
      async () => {
        const [operation, policy] = await Promise.all([
          this.records.getOperation(input.operationId),
          this.policy.load(),
        ]);
        if (!operation || !policy.actor || (!policy.isAdmin && operation.userId !== this.userId))
          return failNotFound(CustomErrorCode.recordNotFound);
        return {
          ok: true as const,
          data: RecordOperationStatusSchema.parse({
            id: operation.id,
            state: operation.state,
            processed: operation.processed,
            total: operation.total,
            errorCode: operation.errorCode,
            result: operation.result,
          }),
        };
      },
      { readOnly: true },
    );
  }
}

@TenantInteractor()
export class CancelRecordOperationInteractor extends AuthenticatedInteractor<
  z.infer<typeof Schema>,
  { cancelled: boolean }
> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }
  @Write({ input: Schema })
  async invoke(input: z.infer<typeof Schema>): Validated<{ cancelled: boolean }> {
    const [operation, policy] = await Promise.all([this.records.getOperation(input.operationId), this.policy.load()]);
    if (!operation || !policy.actor || (!policy.isAdmin && operation.userId !== this.userId))
      return failNotFound(CustomErrorCode.recordNotFound);
    if (operation.state === "completed" || operation.state === "failed")
      return failConflict(CustomErrorCode.recordVersionChanged);
    if (operation.state !== "cancelled") {
      await this.records.updateOperation(operation.id, {
        state: "cancelled",
        leaseUntil: null,
      });
      await this.records.clearOperationLock(operation.id);
    }
    return { ok: true, data: { cancelled: true } };
  }
}

@TenantInteractor()
export class ResumeRecordOperationInteractor extends AuthenticatedInteractor<
  z.infer<typeof Schema>,
  { resumed: boolean }
> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {
    super();
  }
  @Write({ input: Schema })
  async invoke(input: z.infer<typeof Schema>): Validated<{ resumed: boolean }> {
    const [operation, policy] = await Promise.all([this.records.getOperation(input.operationId), this.policy.load()]);
    if (
      !operation ||
      !policy.actor ||
      (operation.userId !== this.userId && !(policy.isAdmin && operation.kind === "provider-avatar"))
    )
      return failNotFound(CustomErrorCode.recordNotFound);
    if (!["pending", "staging"].includes(operation.state)) return failConflict(CustomErrorCode.recordVersionChanged);
    if (operation.leaseUntil && operation.leaseUntil > new Date()) return { ok: true, data: { resumed: false } };
    if (operation.kind === "provider-avatar") {
      await this.background.dispatch("provider-avatar-operation", {
        companyId: this.companyId,
        operationId: operation.id,
      });
      return { ok: true, data: { resumed: true } };
    }
    await this.background.dispatch("record-operation", {
      operationId: operation.id,
      ownerUserId: this.userId,
    });
    return { ok: true, data: { resumed: true } };
  }
}
