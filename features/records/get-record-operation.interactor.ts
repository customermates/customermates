import type { z } from "zod";
import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { Validated } from "@/core/validation/validation.utils";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { Schema, RecordOperationStatusSchema } from "./record-operation.interactor";

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
