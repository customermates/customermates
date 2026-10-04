import type { z } from "zod";
import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { Validated } from "@/core/validation/validation.utils";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { Schema } from "./record-operation.interactor";

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
