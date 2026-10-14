import type { Validated } from "@/core/validation/validation.utils";
import type { TrashRepo } from "./trash.repo";
import type { TrashKindHandler } from "./trash-kind-handler";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { INTERACTIVE_COMPANY_LOCK_WAIT_MS, runInTransaction } from "@/core/decorators/transaction-runner";
import { failNotFound, unwoundFailure } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RestoreTrashSchema, type RestoreTrashData, type TrashRestoreResult } from "./trash.schema";
import { itemsByHandler, trashVisibility } from "./trash-handlers";

const RESTORE_TIMEOUT_MS = 60000;

@TenantInteractor()
export class RestoreTrashInteractor extends AuthenticatedInteractor<RestoreTrashData, TrashRestoreResult> {
  constructor(
    private trash: TrashRepo,
    private handlers: TrashKindHandler[],
  ) {
    super();
  }

  @Validate(RestoreTrashSchema)
  async invoke(input: RestoreTrashData): Validated<TrashRestoreResult> {
    const result = await this.restore(input);
    if (
      result.ok ||
      !result.error.issues.some(
        (issue) => issue.code === "custom" && issue.params?.error === CustomErrorCode.recordCalculationBudget,
      )
    )
      return result;
    return runInTransaction(
      async (): Validated<TrashRestoreResult> => {
        const items = await this.trash.find(
          "itemIds" in input ? { ids: input.itemIds } : input,
          await trashVisibility(this.handlers),
        );
        let operationId: string | null = null;
        const droppedViewReferences: NonNullable<TrashRestoreResult["droppedViewReferences"]> = [];
        for (const group of itemsByHandler(this.handlers, items)) {
          if (group.handler.restoreInBackground) operationId = await group.handler.restoreInBackground(group.items);
          else {
            const restored = await group.handler.restore(group.items);
            operationId = restored.operationId ?? operationId;
            droppedViewReferences.push(...(restored.droppedViewReferences ?? []));
          }
        }
        if (!operationId) return result;
        return {
          ok: true as const,
          data: {
            status: "pending" as const,
            operationId,
            ...(droppedViewReferences.length ? { droppedViewReferences } : {}),
          },
        };
      },
      {
        timeout: RESTORE_TIMEOUT_MS,
        companyLockWait: INTERACTIVE_COMPANY_LOCK_WAIT_MS,
      },
    ).catch(unwoundFailure);
  }

  private restore(input: RestoreTrashData): Validated<TrashRestoreResult> {
    return runInTransaction(
      async (): Validated<TrashRestoreResult> => {
        const items = await this.trash.find(
          "itemIds" in input ? { ids: input.itemIds } : input,
          await trashVisibility(this.handlers),
        );
        if (!items.length || ("itemIds" in input && items.length !== new Set(input.itemIds).size))
          return failNotFound(CustomErrorCode.trashItemNotFound);
        const result: TrashRestoreResult = {
          status: "completed",
          restoredItemIds: [],
          blocked: [],
          restoredRecords: 0,
          droppedLinks: 0,
        };
        for (const group of itemsByHandler(this.handlers, items)) {
          const restored = await group.handler.restore(group.items);
          if (restored.operationId) {
            return {
              ok: true as const,
              data: {
                status: "pending" as const,
                operationId: restored.operationId,
                ...(restored.droppedViewReferences?.length
                  ? { droppedViewReferences: restored.droppedViewReferences }
                  : {}),
              },
            };
          }
          result.restoredItemIds.push(...restored.restoredItemIds);
          result.blocked.push(...restored.blocked);
          result.restoredRecords += restored.restoredRecords;
          result.droppedLinks += restored.droppedLinks;
          if (restored.droppedViewReferences?.length)
            result.droppedViewReferences = [...(result.droppedViewReferences ?? []), ...restored.droppedViewReferences];
        }
        return { ok: true as const, data: result };
      },
      {
        timeout: RESTORE_TIMEOUT_MS,
        companyLockWait: INTERACTIVE_COMPANY_LOCK_WAIT_MS,
      },
    ).catch(unwoundFailure);
  }
}
