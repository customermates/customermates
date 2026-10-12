import type { Validated } from "@/core/validation/validation.utils";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { OwnedRecordOperationInteractor } from "./owned-record-operation";
import { RecordOperationInputSchema, type RecordOperationInput } from "./record-operation.schema";

@TenantInteractor()
export class CancelRecordOperationInteractor extends OwnedRecordOperationInteractor<{ cancelled: boolean }> {
  @Write({ input: RecordOperationInputSchema })
  async invoke(input: RecordOperationInput): Validated<{ cancelled: boolean }> {
    const operation = await this.ownedOperation(input.operationId, () => true);
    if (!operation) return failNotFound(CustomErrorCode.recordNotFound);
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
