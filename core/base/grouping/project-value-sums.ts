import type { GroupValueSums } from "@/core/base/base-get.schema";

import { DEAL_GROUP_SUM_FIELDS } from "@/features/deals/deal-weighting";

export function projectValueSumsForGroup(item: unknown, weight: number | undefined): GroupValueSums | undefined {
  const total = (item as { totalValue?: unknown } | null)?.totalValue;
  if (typeof total !== "number") return undefined;

  return weight === undefined
    ? { [DEAL_GROUP_SUM_FIELDS.total]: total }
    : {
        [DEAL_GROUP_SUM_FIELDS.total]: total,
        [DEAL_GROUP_SUM_FIELDS.weighted]: (total * weight) / 100,
      };
}
