import type { ChangeRecord } from "@/core/utils/calculate-changes";

import { EntityType } from "@/generated/prisma";

const ENTITY_TYPE_BY_EVENT_PREFIX: Record<string, EntityType> = {
  contact: EntityType.contact,
  organization: EntityType.organization,
  deal: EntityType.deal,
  service: EntityType.service,
  task: EntityType.task,
};

export function entityTypeForEvent(event: string): EntityType | null {
  return ENTITY_TYPE_BY_EVENT_PREFIX[event.split(".")[0]] ?? null;
}

export function entityTypeForEvents(events: readonly string[]): EntityType | null {
  const types = new Set(events.map(entityTypeForEvent).filter((type): type is EntityType => type !== null));

  return types.size === 1 ? [...types][0] : null;
}

export function changedFieldsOf(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || !("changes" in payload)) return [];

  const { changes } = payload as { changes?: ChangeRecord };
  if (!changes || typeof changes !== "object") return [];

  return Object.keys(changes);
}

export function matchesChangedFields(required: readonly string[], changed: readonly string[]): boolean {
  if (required.length === 0) return true;
  if (changed.length === 0) return false;

  const changedSet = new Set(changed);

  return required.some((field) => changedSet.has(field));
}
