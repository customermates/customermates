import type { z } from "zod";
import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { Validated } from "@/core/validation/validation.utils";
import type { ThreadRecordsRepo } from "./thread-records.repo";
import type { ThreadRecordsResult } from "./thread-records.schema";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failAuthorization, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { recordSearchHit } from "@/features/records/search-records.interactor";
import { recordWriteFailure } from "@/features/records/mutate-record.interactor";
import { ReadThreadRecordsSchema, ThreadRecordsResultSchema } from "./thread-records.schema";
import { canReadInbox } from "./thread-records.interactor";

@AllowInDemoMode
@TenantInteractor()
export class ReadThreadRecordsInteractor extends AuthenticatedInteractor<
  z.infer<typeof ReadThreadRecordsSchema>,
  ThreadRecordsResult
> {
  constructor(
    private links: ThreadRecordsRepo,
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(ReadThreadRecordsSchema)
  @ValidateOutput(ThreadRecordsResultSchema)
  async invoke(input: z.infer<typeof ReadThreadRecordsSchema>): Validated<ThreadRecordsResult> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;
    return runInTransaction(
      async () => {
        const policy = await this.policy.load();
        if (!policy.actor || !canReadInbox(policy)) return failAuthorization(CustomErrorCode.permissionDenied);
        if (!(await this.links.canAccessThread(input.threadId)))
          return failNotFound(CustomErrorCode.threadNotFound, ["threadId"]);
        try {
          const model = await this.records.getModel();
          const refs = await this.links.listLinks(input.threadId, 101);
          if (refs.length > 100) return failConflict(CustomErrorCode.recordCalculationBudget);
          const protectedRefs = new Set(
            refs.filter((ref) => ref.protected).map((ref) => `${ref.typeId}:${ref.recordId}`),
          );
          const rows = refs.length
            ? await this.records.searchRecords(
                { refs },
                model,
                policy.access(model.types.filter((type) => !type.archived).map((type) => type.id)),
              )
            : [];
          const canEditThread = policy.allowedSystem("inboxMessages", "update");
          const canManage =
            canEditThread &&
            model.types.some(
              (type) =>
                !type.archived &&
                policy.allowed(type.id, "update") &&
                (policy.allowed(type.id, "readOwn") || policy.allowed(type.id, "readAll")),
            );
          return {
            ok: true as const,
            data: {
              records: rows.map((row) => ({
                ...recordSearchHit(row, model),
                canUnlink:
                  canEditThread &&
                  policy.allowed(row.typeId, "update") &&
                  !protectedRefs.has(`${row.typeId}:${row.recordId}`),
              })),
              schemaRevision: model.revision,
              canManage,
            },
          };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { readOnly: true },
    );
  }
}
