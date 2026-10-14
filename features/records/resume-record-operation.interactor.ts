import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { Validated } from "@/core/validation/validation.utils";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { OwnedRecordOperationInteractor } from "./owned-record-operation";
import { RecordOperationInputSchema, type RecordOperationInput } from "./record-operation.schema";

@TenantInteractor()
export class ResumeRecordOperationInteractor extends OwnedRecordOperationInteractor<{ resumed: boolean }> {
  constructor(
    records: RecordRepo,
    policy: RecordAccessPolicy,
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {
    super(records, policy);
  }

  @Write({ input: RecordOperationInputSchema })
  async invoke(input: RecordOperationInput): Validated<{ resumed: boolean }> {
    const operation = await this.ownedOperation(input.operationId, (owned) => owned.kind === "provider-avatar");
    if (!operation) return failNotFound(CustomErrorCode.recordOperationNotFound, ["operationId"]);
    if (!["pending", "staging"].includes(operation.state))
      return failConflict(CustomErrorCode.recordOperationSettled, ["operationId"]);
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
