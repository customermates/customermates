import type { Validated } from "@/core/validation/validation.utils";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { OwnedRecordOperationInteractor } from "./owned-record-operation";
import {
  RecordOperationInputSchema,
  RecordOperationStatusSchema,
  type RecordOperationInput,
  type RecordOperationStatus,
} from "./record-operation.schema";

@AllowInDemoMode
@TenantInteractor()
export class GetRecordOperationInteractor extends OwnedRecordOperationInteractor<RecordOperationStatus> {
  @Validate(RecordOperationInputSchema)
  async invoke(input: RecordOperationInput): Validated<RecordOperationStatus> {
    return runInTransaction(
      async () => {
        const operation = await this.ownedOperation(input.operationId, () => true);
        if (!operation) return failNotFound(CustomErrorCode.recordOperationNotFound, ["operationId"]);
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
