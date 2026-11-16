import * as ErrorReporter from "@/core/observability/server";

import type { TrashItem, TrashRepo } from "./trash.repo";
import type { TrashKindHandler } from "./trash-kind-handler";
import type { TrashDeletionResult } from "./trash.schema";

import { Prisma } from "@/generated/prisma";
import { runInSavepoint, runInTransaction } from "@/core/decorators/transaction-runner";
import { itemsByHandler } from "./trash-handlers";

const TRASH_ITEM_PURGE_TIMEOUT_MS = 15000;

type TrashPurgeOutcome = Pick<TrashDeletionResult, "deletedItemIds" | "pendingItemIds" | "failedItemIds">;
type TrashPurgeScope = { companyId: string; actorId: string | null };

/**
 * Deletes each item permanently in its own transaction. An item can depend on another item of the same batch that is
 * still in Trash (a field read by a calculated field deleted in the same change expires at the same moment, in any
 * order), so an item that fails is tried again after the others as long as a round still deletes something. Only the
 * items that still fail are reported.
 */
export async function purgeTrashItems(
  trash: Pick<TrashRepo, "find">,
  handlers: TrashKindHandler[],
  items: TrashItem[],
  scope: TrashPurgeScope,
): Promise<TrashPurgeOutcome> {
  const purged: string[] = [];
  const purgedAlong = new Set<string>();
  const failures = new Map<string, { item: TrashItem; error: unknown }>();
  let groups = itemsByHandler(handlers, items).reverse();
  for (let progressed = true; groups.length && progressed; ) {
    progressed = false;
    const retry = new Set<string>();
    for (const group of groups) {
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
        if (result.ok && result.value) {
          purged.push(item.id);
          failures.delete(item.id);
          progressed = true;
          continue;
        }
        retry.add(item.id);
        failures.set(item.id, { item, error: result.ok ? null : result.error });
      }
    }
    groups = groups
      .map((group) => ({ ...group, items: group.items.filter((item) => retry.has(item.id)) }))
      .filter((group) => group.items.length);
  }
  for (const { item, error } of failures.values()) {
    if (error === null) continue;
    ErrorReporter.captureException(error, {
      tags: { kind: "trash-purge", companyId: scope.companyId, itemKind: item.kind },
      extra: { itemId: item.id, system: scope.actorId === null },
    });
  }
  const remaining = purged.length
    ? new Set((await trash.find({ ids: purged }, Prisma.sql`TRUE`)).map((item) => item.id))
    : new Set<string>();
  return {
    deletedItemIds: purged.filter((id) => !remaining.has(id)),
    pendingItemIds: purged.filter((id) => remaining.has(id)),
    failedItemIds: [...failures.keys()],
  };
}
