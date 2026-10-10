import * as Sentry from "@sentry/nextjs";

import type { Validated } from "@/core/validation/validation.utils";
import type { TrashItem, TrashRepo } from "./trash.repo";
import type { TrashKindHandler } from "./trash-kind-handler";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { Prisma } from "@/generated/prisma";
import { runInSavepoint, runInTransaction } from "@/core/decorators/transaction-runner";
import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import {
  DeleteTrashPermanentlySchema,
  type DeleteTrashPermanentlyData,
  type TrashDeletionResult,
} from "./trash.schema";
import { itemsByHandler, trashDeletionPreview, trashVisibility } from "./trash-handlers";

export type TrashPurgeOutcome = Pick<TrashDeletionResult, "deletedItemIds" | "pendingItemIds" | "failedItemIds">;

/**
 * Purges item by item, each in its own savepoint: a failing item is skipped and reported, never rolling back the rest.
 * An item still in Trash after its handler succeeded continues in the background (a large list) and is pending.
 */
export async function purgeTrashItems(
  trash: Pick<TrashRepo, "find">,
  handlers: TrashKindHandler[],
  items: TrashItem[],
  actorId: string | null,
): Promise<TrashPurgeOutcome> {
  const purged: string[] = [];
  const failedItemIds: string[] = [];
  for (const group of itemsByHandler(handlers, items).reverse()) {
    for (const item of group.items) {
      const result = await runInSavepoint(() => group.handler.purge([item], actorId));
      if (result.ok) purged.push(item.id);
      else {
        failedItemIds.push(item.id);
        Sentry.captureException(result.error, { tags: { kind: "trash-purge" }, extra: { itemKind: item.kind } });
      }
    }
  }
  const remaining = purged.length
    ? new Set((await trash.find({ ids: purged }, Prisma.sql`TRUE`)).map((item) => item.id))
    : new Set<string>();
  return {
    deletedItemIds: purged.filter((id) => !remaining.has(id)),
    pendingItemIds: purged.filter((id) => remaining.has(id)),
    failedItemIds,
  };
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
        return { ok: true as const, data: await purgeTrashItems(this.trash, this.handlers, items, this.userId) };
      },
      { timeout: 60000 },
    );
  }
}
