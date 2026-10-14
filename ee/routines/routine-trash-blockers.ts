import type { TrashItem } from "@/features/trash/trash.repo";
import type { TrashRestoreBlocker } from "@/features/trash/trash.schema";
import type { TrashRestoreBlockerSource } from "@/features/trash/trash-restore-blocker-source";
import type { UpsertRoutineSubscriptionRepo } from "./upsert-routine-subscription.repo";

import { getEntitlements } from "@/ee/subscription/entitlements";

type RoutineAllowanceReader = {
  trashedRoutineOwners(ids: string[]): Promise<Array<{ id: string; ownerUserId: string }>>;
  countActiveRoutinesByOwner(ownerUserIds: string[]): Promise<Map<string, number>>;
};

export class RoutineTrashBlockers implements TrashRestoreBlockerSource {
  constructor(
    private routines: RoutineAllowanceReader,
    private subscriptions: UpsertRoutineSubscriptionRepo,
  ) {}

  async blockers(items: TrashItem[]): Promise<TrashRestoreBlocker[]> {
    const owners = new Map(
      (await this.routines.trashedRoutineOwners(items.map((item) => item.targetId))).map((routine) => [
        routine.id,
        routine.ownerUserId,
      ]),
    );
    if (!owners.size) return [];
    const limit = getEntitlements((await this.subscriptions.getSubscriptionOrThrow()).plan).includedRoutinesPerUser;
    if (limit === "unlimited") return [];
    const active = await this.routines.countActiveRoutinesByOwner([...new Set(owners.values())]);
    const blocked: TrashRestoreBlocker[] = [];
    for (const item of items) {
      const owner = owners.get(item.targetId);
      if (!owner) continue;
      const count = active.get(owner) ?? 0;
      if (count >= limit) blocked.push({ itemId: item.id, reason: "routineLimitReached", typeId: null, limit });
      else active.set(owner, count + 1);
    }
    return blocked;
  }
}
