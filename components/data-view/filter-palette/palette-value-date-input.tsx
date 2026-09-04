"use client";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { FilterOperatorKey } from "@/core/base/base-query-builder";

import { observer } from "mobx-react-lite";

import { FilterInputDaysCount } from "@/components/data-view/filter-modal/inputs/filter-input-days-count";
import { FilterInputIsoDate } from "@/components/data-view/filter-modal/inputs/filter-input-iso-date";
import { FilterInputIsoDateRange } from "@/components/data-view/filter-modal/inputs/filter-input-iso-date-range";
import {
  resolveFilterDateGranularity,
  resolveFilterValueClass,
} from "@/components/data-view/filter-modal/filter-value-class";

type Props = {
  field: string;
  operator: FilterOperatorKey | undefined;
  customColumns: CustomColumnDto[] | undefined;
  isValidFilter: boolean;
};

export const PaletteValueDateInput = observer(function PaletteValueDateInput({
  field,
  operator,
  customColumns,
  isValidFilter,
}: Props) {
  const valueClass = resolveFilterValueClass(field, operator, customColumns);
  const granularity = resolveFilterDateGranularity(field, customColumns);

  return (
    <div className="p-2">
      {valueClass === "daysCount" && <FilterInputDaysCount id="draft.value" isValidFilter={isValidFilter} />}

      {valueClass === "isoRange" && (
        <FilterInputIsoDateRange granularity={granularity} id="draft.value" isValidFilter={isValidFilter} />
      )}

      {valueClass === "isoDate" && (
        <FilterInputIsoDate granularity={granularity} id="draft.value" isValidFilter={isValidFilter} />
      )}
    </div>
  );
});
