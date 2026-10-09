import type { Validated } from "@/core/validation/validation.utils";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { TrashRepo } from "./trash.repo";
import type { TrashKindHandler } from "./trash-kind-handler";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failAuthorization, failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { EmptyTrashSchema, type EmptyTrashData, type TrashDeletionResult } from "./trash.schema";
import { trashDeletionPreview, trashVisibility } from "./trash-handlers";
import { purgeTrashItems } from "./delete-trash-permanently.interactor";

@AllowInDemoMode
@TenantInteractor()
export class EmptyTrashInteractor extends AuthenticatedInteractor<EmptyTrashData, TrashDeletionResult> {
  constructor(
    private trash: TrashRepo,
    private policy: RecordAccessPolicy,
    private handlers: TrashKindHandler[],
  ) {
    super();
  }

  @Validate(EmptyTrashSchema)
  async invoke(input: EmptyTrashData): Validated<TrashDeletionResult> {
    return runInTransaction(
      async (): Validated<TrashDeletionResult> => {
        const policy = await this.policy.load();
        if (!policy.actor || !policy.isAdmin) return failAuthorization(CustomErrorCode.permissionDenied);
        const items = await this.trash.find({ all: true }, await trashVisibility(this.handlers));
        if ((await trashDeletionPreview(this.handlers, items)).impactHash !== input.expectedImpactHash)
          return failConflict(CustomErrorCode.trashChanged);
        await purgeTrashItems(this.handlers, items, this.userId);
        return { ok: true as const, data: { deletedItemIds: items.map((item) => item.id) } };
      },
      { timeout: 60000 },
    );
  }
}
