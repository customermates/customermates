import type { EntityType } from "@/generated/prisma";

export interface RegisteredActivityTimeline {
  coversEntity(entityType: EntityType, entityId: string): boolean;
  refreshFor(entityType: EntityType, entityId: string): void;
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

    for (const store of this.mounted) {
      const matchingId = ids.find((entityId) => store.coversEntity(entityType, entityId));
      if (matchingId) store.refreshFor(entityType, matchingId);
    }
  };
}
