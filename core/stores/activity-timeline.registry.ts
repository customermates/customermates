import type { EntityType } from "@/generated/prisma";

export interface RegisteredActivityTimeline {
  refreshIfCovers(entityType: EntityType, entityIds: readonly string[]): void;
}

export class ActivityTimelineRegistry {
  private mounted = new Set<RegisteredActivityTimeline>();

  register = (store: RegisteredActivityTimeline): void => {
    this.mounted.add(store);
  };

  unregister = (store: RegisteredActivityTimeline): void => {
    this.mounted.delete(store);
  };

  refreshForMany = (entityType: EntityType, entityIds: Iterable<string>): void => {
    const ids = [...new Set(entityIds)];
    if (!ids.length) return;

    for (const store of this.mounted) store.refreshIfCovers(entityType, ids);
  };
}
