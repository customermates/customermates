import type { TrashRepo } from "./trash.repo";
import type { TrashKindHandler } from "./trash-kind-handler";

import { runInTransaction } from "@/core/decorators/transaction-runner";
import { purgeTrashItems } from "./delete-trash-permanently.interactor";

export const TRASH_PURGE_BATCH_SIZE = 100;

export function purgeExpiredCompanyTrash(
  trash: TrashRepo,
  handlers: TrashKindHandler[],
  now: Date,
): Promise<{ hasMore: boolean }> {
  return runInTransaction(
    async () => {
      const items = await trash.findExpired(now, TRASH_PURGE_BATCH_SIZE);
      await purgeTrashItems(handlers, items, null);
      return { hasMore: items.length === TRASH_PURGE_BATCH_SIZE };
    },
    { timeout: 60000 },
  );
}
