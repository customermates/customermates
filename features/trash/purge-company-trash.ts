import type { TrashExpiryCursor, TrashRepo } from "./trash.repo";
import type { TrashKindHandler } from "./trash-kind-handler";

import { runInTransaction } from "@/core/decorators/transaction-runner";
import { purgeTrashItems } from "./delete-trash-permanently.interactor";

export const TRASH_PURGE_BATCH_SIZE = 100;

export type CompanyTrashPurgeBatch = {
  next: TrashExpiryCursor | null;
  deleted: number;
  pending: number;
  failed: number;
};

export function purgeExpiredCompanyTrash(
  trash: TrashRepo,
  handlers: TrashKindHandler[],
  now: Date,
  after?: TrashExpiryCursor,
): Promise<CompanyTrashPurgeBatch> {
  return runInTransaction(
    async () => {
      const items = await trash.findExpired(now, TRASH_PURGE_BATCH_SIZE, after);
      const outcome = await purgeTrashItems(trash, handlers, items, null);
      const last = items.at(-1);
      return {
        next:
          items.length === TRASH_PURGE_BATCH_SIZE && last
            ? { expiresAt: last.expiresAt.toISOString(), id: last.id }
            : null,
        deleted: outcome.deletedItemIds.length,
        pending: outcome.pendingItemIds.length,
        failed: outcome.failedItemIds.length,
      };
    },
    { timeout: 60000 },
  );
}
