import type { DomainEvent, DomainEventMap } from "@/features/event/domain-events";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import deepEqual from "fast-deep-equal/es6";

export function partitionRelationIds(previous: unknown, current: unknown) {
  const prevArr = Array.isArray(previous) ? previous : [];
  const currArr = Array.isArray(current) ? current : [];
  const prevIds = new Set(prevArr.map((x: { id: string }) => x.id));
  const currIds = new Set(currArr.map((x: { id: string }) => x.id));
  const added = currArr.filter((x: { id: string }) => !prevIds.has(x.id));
  const removed = prevArr.filter((x: { id: string }) => !currIds.has(x.id));
  return { added, removed };
}

export function isEmpty(value: unknown): boolean {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

export const AuditChangeSchema = z.object({
  field: z.string(),
  columnId: z.string().optional(),
  snapshot: z.boolean().optional(),
  previous: z.unknown(),
  current: z.unknown(),
});

export type AuditChange = Data<typeof AuditChangeSchema>;

type Changes = DomainEventMap[DomainEvent.DEAL_UPDATED]["payload"]["changes"];

const IGNORED_FIELDS = new Set(["id", "createdAt", "updatedAt", "avatarUrl", "roleId"]);

const REDACTED_FIELDS = new Set(["secret"]);

export function extractAuditChanges(eventData: unknown): AuditChange[] {
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) return [];
  const payload = (eventData as { payload?: unknown }).payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];

  let changes: Changes;
  let isSnapshot = false;
  if ("changes" in payload) changes = (payload as Record<string, unknown>).changes as Changes;
  else {
    isSnapshot = true;
    changes = {};
    for (const [key, value] of Object.entries(payload))
      if (!isEmpty(value)) changes[key] = { previous: undefined, current: value };
  }

  const result: AuditChange[] = [];

  for (const [field, value] of Object.entries(changes)) {
    if (IGNORED_FIELDS.has(field) || REDACTED_FIELDS.has(field)) continue;

    if (field === "customFieldValues") {
      const previousItems = Array.isArray(value.previous)
        ? (value.previous as { columnId: string; value: unknown }[])
        : [];
      const currentItems = Array.isArray(value.current)
        ? (value.current as { columnId: string; value: unknown }[])
        : [];

      const previousMap = new Map(previousItems.map((entry) => [entry.columnId, entry.value]));
      const currentMap = new Map(currentItems.map((entry) => [entry.columnId, entry.value]));

      for (const columnId of new Set([...previousMap.keys(), ...currentMap.keys()])) {
        if (deepEqual(previousMap.get(columnId), currentMap.get(columnId))) continue;
        result.push({
          field: "customFieldValues",
          columnId,
          ...(isSnapshot && { snapshot: true }),
          previous: previousMap.get(columnId),
          current: currentMap.get(columnId),
        });
      }
      continue;
    }

    result.push({ field, ...(isSnapshot && { snapshot: true }), previous: value.previous, current: value.current });
  }

  return result;
}
