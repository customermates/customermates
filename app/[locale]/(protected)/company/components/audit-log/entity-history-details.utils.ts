import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { AuditLogDto } from "@/ee/audit-log/get/get-audit-logs-by-entity-id.interactor";
import type { DomainEvent, DomainEventMap } from "@/features/event/domain-events";

import deepEqual from "fast-deep-equal/es6";

export const RELATION_FIELD_KEYS = ["users", "contacts", "organizations", "deals", "services", "tasks"] as const;

export type RelationFieldKey = (typeof RELATION_FIELD_KEYS)[number];

export function isRelationFieldKey(key: string): key is RelationFieldKey {
  return (RELATION_FIELD_KEYS as readonly string[]).includes(key);
}

export function partitionRelationIds(previous: unknown, current: unknown) {
  const prevArr = Array.isArray(previous) ? previous : [];
  const currArr = Array.isArray(current) ? current : [];
  const prevIds = new Set(prevArr.map((x: { id: string }) => x.id));
  const currIds = new Set(currArr.map((x: { id: string }) => x.id));
  const added = currArr.filter((x: { id: string }) => !prevIds.has(x.id));
  const removed = prevArr.filter((x: { id: string }) => !currIds.has(x.id));
  return { added, removed };
}

export type ProcessedChange = {
  key: string;
  field: string;
  previous: unknown;
  current: unknown;
  customColumn?: CustomColumnDto;
};

type Changes = DomainEventMap[DomainEvent.DEAL_UPDATED]["payload"]["changes"];

export function isEmpty(value: unknown): boolean {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

export function getChanges(item: AuditLogDto): Changes {
  const payload = item.eventData.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};

  let changes: Changes;
  if ("changes" in payload) changes = (payload as Record<string, unknown>).changes as Changes;
  else if (item.event.endsWith(".created")) {
    changes = {};
    for (const [key, value] of Object.entries(payload))
      if (!isEmpty(value)) changes[key] = { previous: undefined, current: value };
  } else return {};

  return changes;
}

export function processChanges(
  item: AuditLogDto,
  customColumnsById: Map<string, CustomColumnDto>,
  translate: (key: string) => string,
): ProcessedChange[] {
  const entries: ProcessedChange[] = [];
  const changes = getChanges(item);

  for (const [field, value] of Object.entries(changes)) {
    if (field === "updatedAt" || field === "createdAt") continue;
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
        const customColumn = customColumnsById.get(columnId);
        entries.push({
          key: "customFieldValues",
          field: customColumn?.label ?? translate("AuditLogModal.deletedField"),
          previous: previousMap.get(columnId),
          current: currentMap.get(columnId),
          customColumn,
        });
      }
      continue;
    }

    entries.push({
      key: field,
      field: translate(`Common.table.columns.${field}`),
      previous: value.previous,
      current: value.current,
    });
  }

  return entries;
}
