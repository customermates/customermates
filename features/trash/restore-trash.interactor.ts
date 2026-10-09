import type { Validated } from "@/core/validation/validation.utils";
import type { TrashRepo } from "./trash.repo";
import type { TrashKindHandler } from "./trash-kind-handler";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { recordWriteFailure } from "@/features/records/mutate-record.interactor";
import { RestoreTrashSchema, type RestoreTrashData, type TrashRestoreResult } from "./trash.schema";
import { itemsByHandler, trashVisibility } from "./trash-handlers";

@AllowInDemoMode
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
    return runInTransaction(
      async (): Validated<TrashRestoreResult> => {
        const items = await this.trash.find(
          "itemIds" in input ? { ids: input.itemIds } : input,
          await trashVisibility(this.handlers),
        );
        if (!items.length || ("itemIds" in input && items.length !== new Set(input.itemIds).size))
          return failNotFound(CustomErrorCode.trashItemNotFound);
        try {
          const result: TrashRestoreResult = {
            status: "completed",
            restoredItemIds: [],
            blocked: [],
            restoredRecords: 0,
            droppedLinks: 0,
          };
          for (const group of itemsByHandler(this.handlers, items)) {
            const restored = await group.handler.restore(group.items);
            result.restoredItemIds.push(...restored.restoredItemIds);
            result.blocked.push(...restored.blocked);
            result.restoredRecords += restored.restoredRecords;
            result.droppedLinks += restored.droppedLinks;
          }
          return { ok: true as const, data: result };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { timeout: 20000 },
    );
  }
}
