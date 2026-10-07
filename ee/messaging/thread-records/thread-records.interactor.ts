import type { z } from "zod";
import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { Validated } from "@/core/validation/validation.utils";
import type { ThreadRecordsRepo } from "./thread-records.repo";
import type { MutateThreadRecordsInput } from "./thread-records.schema";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failAuthorization, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { recordRequestHash } from "@/features/records/mutate-record.interactor";
import { MutateThreadRecordsSchema, ThreadRecordMutationResultSchema } from "./thread-records.schema";

export function canReadInbox(policy: Awaited<ReturnType<RecordAccessPolicy["load"]>>) {
  return policy.canReadSystem("inboxMessages");
}

@TenantInteractor()
export class MutateThreadRecordsInteractor extends AuthenticatedInteractor<
  MutateThreadRecordsInput,
  z.infer<typeof ThreadRecordMutationResultSchema>
> {
  constructor(
    private links: ThreadRecordsRepo,
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(MutateThreadRecordsSchema)
  @ValidateOutput(ThreadRecordMutationResultSchema)
  async invoke(input: MutateThreadRecordsInput): Validated<z.infer<typeof ThreadRecordMutationResultSchema>> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;
    return runInTransaction(async () => {
      const policy = await this.policy.load();
      if (
        !policy.actor ||
        !canReadInbox(policy) ||
        !policy.allowedSystem("inboxMessages", "update") ||
        !policy.allowed(input.ref.typeId, "update")
      )
        return failAuthorization(CustomErrorCode.permissionDenied);
      if (!(await this.links.canAccessThread(input.threadId)))
        return failNotFound(CustomErrorCode.threadNotFound, ["threadId"]);
      const row = await this.records.getRecordCompanyWide(input.ref);
      if (!row || !(await policy.canRead(row))) return failNotFound(CustomErrorCode.recordNotFound, ["ref"]);
      if (row.protectedKind) return failAuthorization(CustomErrorCode.recordProtected, ["ref"]);
      const hash = recordRequestHash({ kind: "thread-record", input });
      const receipt = await this.records.receipt(input.idempotencyKey, this.userId);
      if (receipt) {
        return receipt.requestHash === hash
          ? { ok: true as const, data: ThreadRecordMutationResultSchema.parse(receipt.result) }
          : failConflict(CustomErrorCode.recordIdempotencyConflict);
      }
      const state = await this.records.getState();
      if (state?.activeOperationId) return failConflict(CustomErrorCode.recordWritePaused);
      const model = await this.records.getModel();
      if (model.revision !== input.expectedRevision) return failConflict(CustomErrorCode.recordSchemaChanged);
      if (!model.types.some((type) => type.id === input.ref.typeId && !type.archived))
        return failNotFound(CustomErrorCode.recordNotFound, ["ref"]);
      const existed = await this.links.has(input.threadId, input.ref);
      if (input.action === "link" && !existed && (await this.links.listLinks(input.threadId, 100)).length >= 100)
        return failConflict(CustomErrorCode.recordCalculationBudget);
      if (existed !== (input.action === "link")) {
        if (input.action === "link") await this.links.link(input.threadId, input.ref);
        else await this.links.unlink(input.threadId, input.ref);
        await this.links.audit(input.threadId, input.ref, input.action);
      }
      const data = { ref: input.ref, linked: input.action === "link", schemaRevision: model.revision };
      await this.records.saveReceipt(input.idempotencyKey, this.userId, hash, data);
      return { ok: true as const, data };
    });
  }
}
