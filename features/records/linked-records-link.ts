import type { Filter } from "@/core/base/base-get.schema";
import type { RecordRef } from "./record-model.schema";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { relationshipColumnKey, relationshipPathColumnKey } from "./record-column.schema";

export type LinkedRecordsLink = { relationId: string; direction: "outgoing" | "incoming" } | { pathId: string };

export function linkedRecordsKey(link: LinkedRecordsLink) {
  return "pathId" in link ? link.pathId : `${link.relationId}:${link.direction}`;
}

export function linkedRecordsFilter(source: RecordRef, link: LinkedRecordsLink): Filter {
  return {
    field:
      "pathId" in link
        ? relationshipPathColumnKey(link.pathId)
        : relationshipColumnKey(link.relationId, link.direction === "outgoing" ? "incoming" : "outgoing"),
    operator: FilterOperatorKey.in,
    value: [source.recordId],
  };
}
