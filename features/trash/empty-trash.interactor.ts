import type { Validated } from "@/core/validation/validation.utils";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { TrashItem, TrashRepo } from "./trash.repo";
import type { TrashKindHandler } from "./trash-kind-handler";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failAuthorization, failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { EmptyTrashSchema, type EmptyTrashData, type TrashDeletionResult } from "./trash.schema";
import { trashDeletionPreview, trashVisibility } from "./trash-handlers";
import { purgeTrashItems } from "./purge-trash-items";

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
    const admitted = await runInTransaction(
      async (): Validated<TrashItem[]> => {
        const policy = await this.policy.load();
        if (!policy.actor || !policy.isAdmin) return failAuthorization(CustomErrorCode.permissionDenied);
        const items = await this.trash.find({ all: true }, await trashVisibility(this.handlers));
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
