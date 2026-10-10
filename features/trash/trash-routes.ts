import { encodeGetParams } from "@/core/utils/get-params";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";

export const TRASH_HREF = "/trash";

export const CONFIGURATION_TRASH_HREF = `${TRASH_HREF}?${encodeGetParams({
  filters: [
    {
      field: FilterFieldKey.kind,
      operator: FilterOperatorKey.in,
      value: ["list", "field", "relationship", "channels"],
    },
  ],
})}`;
