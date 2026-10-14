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
import { PreviewTrashDeletionSchema, type PreviewTrashDeletionData, type TrashDeletionPreview } from "./trash.schema";
import { trashDeletionPreview, trashVisibility } from "./trash-handlers";

@AllowInDemoMode
@TenantInteractor()
export class PreviewTrashDeletionInteractor extends AuthenticatedInteractor<
  PreviewTrashDeletionData,
  TrashDeletionPreview
> {
  constructor(
    private trash: TrashRepo,
    private handlers: TrashKindHandler[],
  ) {
    super();
  }

  @Validate(PreviewTrashDeletionSchema)
  async invoke(input: PreviewTrashDeletionData): Validated<TrashDeletionPreview> {
    return runInTransaction(
      async (): Validated<TrashDeletionPreview> => {
        const items = await this.trash.find(
          "all" in input ? { all: true } : { ids: input.itemIds },
          await trashVisibility(this.handlers),
        );
        if ("itemIds" in input && items.length !== new Set(input.itemIds).size)
          return failNotFound(CustomErrorCode.trashItemNotFound);
        return { ok: true as const, data: await trashDeletionPreview(this.handlers, items) };
      },
      { readOnly: true, timeout: 20000 },
    );
  }
}
