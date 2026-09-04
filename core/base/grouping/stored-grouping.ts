import type { Grouping } from "./grouping.schema";

import { ViewMode } from "@/core/base/base-query-builder";
import { isCustomField } from "@/core/utils/custom-field";
import { GroupingSchema } from "./grouping.schema";

export const CLEARED_GROUPING = {};

const LEGACY_CLEARED_COLUMN_ID = "";

function isClearedGrouping(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;
}

export function readStoredGrouping(
  stored: unknown,
  legacyColumnId: string | null,
  viewMode: string | null,
): Grouping | null | undefined {
  const parsed = GroupingSchema.safeParse(stored);
  if (parsed.success) return parsed.data;
  if (isClearedGrouping(stored)) return null;
  if (legacyColumnId === LEGACY_CLEARED_COLUMN_ID) return null;
  if (!legacyColumnId || viewMode !== ViewMode.card) return undefined;

  return { field: legacyColumnId };
}

export function groupingShadowColumnId(grouping: Grouping | null | undefined): string | null {
  return grouping && isCustomField(grouping.field) ? grouping.field : null;
}
