import type { Grouping } from "./grouping.schema";

import { isCustomField } from "@/core/utils/custom-field";
import { GroupingSchema } from "./grouping.schema";

export function readStoredGrouping(stored: unknown): Grouping | undefined {
  const parsed = GroupingSchema.safeParse(stored);

  return parsed.success ? parsed.data : undefined;
}

export function groupingShadowColumnId(grouping: Grouping | null | undefined): string | null {
  return grouping && isCustomField(grouping.field) ? grouping.field : null;
}
