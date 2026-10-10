import type { Validated } from "@/core/validation/validation.utils";
import type { TrashItem, TrashRepo } from "./trash.repo";
import type { TrashKindHandler } from "./trash-kind-handler";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import {
  DeleteTrashPermanentlySchema,
  type DeleteTrashPermanentlyData,
  type TrashDeletionResult,
} from "./trash.schema";
import { itemsByHandler, trashDeletionPreview, trashVisibility } from "./trash-handlers";

export async function purgeTrashItems(handlers: TrashKindHandler[], items: TrashItem[], actorId: string | null) {
  for (const group of itemsByHandler(handlers, items).reverse()) await group.handler.purge(group.items, actorId);
}

@AllowInDemoMode
@TenantInteractor()
export class DeleteTrashPermanentlyInteractor extends AuthenticatedInteractor<
  DeleteTrashPermanentlyData,
  TrashDeletionResult
> {
  constructor(
    private trash: TrashRepo,
    private handlers: TrashKindHandler[],
  ) {
    super();
  }

  @Validate(DeleteTrashPermanentlySchema)
  async invoke(input: DeleteTrashPermanentlyData): Validated<TrashDeletionResult> {
    return runInTransaction(
      async (): Validated<TrashDeletionResult> => {
        const items = await this.trash.find({ ids: input.itemIds }, await trashVisibility(this.handlers));
        if (items.length !== new Set(input.itemIds).size) return failNotFound(CustomErrorCode.trashItemNotFound);
        if ((await trashDeletionPreview(this.handlers, items)).impactHash !== input.expectedImpactHash)
          return failConflict(CustomErrorCode.trashChanged);
        await purgeTrashItems(this.handlers, items, this.userId);
        return { ok: true as const, data: { deletedItemIds: items.map((item) => item.id) } };
      },
      { timeout: 60000 },
    );
  }
}
