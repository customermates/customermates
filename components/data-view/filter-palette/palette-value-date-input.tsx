"use client";

import type { FilterOperatorKey } from "@/core/base/base-query-builder";
import type { ColumnPresentation } from "@/core/data-view/column-presentation.schema";

import { observer } from "mobx-react-lite";

import {
  resolveFilterDateGranularity,
  resolveFilterValueClass,
} from "@/components/data-view/filter-modal/filter-value-class";
import { FilterInputDaysCount } from "@/components/data-view/filter-modal/inputs/filter-input-days-count";
import { FilterInputIsoDate } from "@/components/data-view/filter-modal/inputs/filter-input-iso-date";
import { FilterInputIsoDateRange } from "@/components/data-view/filter-modal/inputs/filter-input-iso-date-range";

type Props = {
  field: string;
  operator: FilterOperatorKey | undefined;
  customColumns: ColumnPresentation[] | undefined;
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
