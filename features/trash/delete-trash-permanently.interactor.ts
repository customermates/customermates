import type { Validated } from "@/core/validation/validation.utils";
import type { TrashItem, TrashRepo } from "./trash.repo";
import type { TrashKindHandler } from "./trash-kind-handler";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import {
  DeleteTrashPermanentlySchema,
  type DeleteTrashPermanentlyData,
  type TrashDeletionResult,
} from "./trash.schema";
import { trashDeletionPreview, trashVisibility } from "./trash-handlers";
import { purgeTrashItems } from "./purge-trash-items";

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
    const admitted = await runInTransaction(
      async (): Validated<TrashItem[]> => {
        const items = await this.trash.find({ ids: input.itemIds }, await trashVisibility(this.handlers));
        if (items.length !== new Set(input.itemIds).size) return failNotFound(CustomErrorCode.trashItemNotFound);
        if ((await trashDeletionPreview(this.handlers, items)).impactHash !== input.expectedImpactHash)
          return failConflict(CustomErrorCode.trashChanged);
        return { ok: true as const, data: items };
      },
      { readOnly: true, timeout: 60000 },
    );
    if (!admitted.ok) return admitted;
    return {
      ok: true as const,
      data: await purgeTrashItems(this.trash, this.handlers, admitted.data, {
        companyId: this.companyId,
        actorId: this.userId,
      }),
    };
  }
}
