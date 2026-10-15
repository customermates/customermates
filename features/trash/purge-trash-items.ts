import * as Sentry from "@sentry/nextjs";

import type { TrashItem, TrashRepo } from "./trash.repo";
import type { TrashKindHandler } from "./trash-kind-handler";
import type { TrashDeletionResult } from "./trash.schema";

import { Prisma } from "@/generated/prisma";
import { runInSavepoint, runInTransaction } from "@/core/decorators/transaction-runner";
import { itemsByHandler } from "./trash-handlers";

const TRASH_ITEM_PURGE_TIMEOUT_MS = 15000;

type TrashPurgeOutcome = Pick<TrashDeletionResult, "deletedItemIds" | "pendingItemIds" | "failedItemIds">;
type TrashPurgeScope = { companyId: string; actorId: string | null };

export async function purgeTrashItems(
  trash: Pick<TrashRepo, "find">,
  handlers: TrashKindHandler[],
  items: TrashItem[],
  scope: TrashPurgeScope,
): Promise<TrashPurgeOutcome> {
  const purged: string[] = [];
  const failedItemIds: string[] = [];
  const purgedAlong = new Set<string>();
  for (const group of itemsByHandler(handlers, items).reverse()) {
    for (const item of group.items) {
      const result = await runInTransaction(
        () =>
          runInSavepoint(async () => {
            if (!(await trash.find({ ids: [item.id] }, Prisma.sql`TRUE`)).length) return purgedAlong.has(item.id);
            const dependents = (await group.handler.dependents?.([item])) ?? [];
            await group.handler.purge([item], scope.actorId, scope.companyId);
            for (const id of dependents) purgedAlong.add(id);
            return true;
          }),
        { companyId: scope.companyId, timeout: TRASH_ITEM_PURGE_TIMEOUT_MS },
      );
      if (result.ok && result.value) purged.push(item.id);
      else {
        failedItemIds.push(item.id);
        if (!result.ok) {
          Sentry.captureException(result.error, {
            tags: { kind: "trash-purge", companyId: scope.companyId, itemKind: item.kind },
            extra: { itemId: item.id, system: scope.actorId === null },
          });
        }
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
