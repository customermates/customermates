"use client";

import type { Filter } from "@/core/base/base-get.schema";
import type { ColumnPresentation } from "@/core/data-view/column-presentation.schema";

import { observer } from "mobx-react-lite";
import { useEffect } from "react";

import { useFilterValueText } from "@/components/data-view/filter-modal/filter-chip-display";
import { useFilterOperatorLabel } from "@/components/data-view/filter-modal/use-filter-operator-label";
import { useFilterFieldLabel } from "@/components/data-view/use-filter-field-label";
import { FilterOperatorKey } from "@/core/base/base-query-builder";

const LABELLED_OPERATORS = new Set<string>([
  FilterOperatorKey.equals,
  FilterOperatorKey.in,
  FilterOperatorKey.hasAnyOf,
]);

type PartProps = {
  customColumns: ColumnPresentation[] | undefined;
  filter: Filter;
  onText: (text: string | null) => void;
};

const FilterSummaryPart = observer(function FilterSummaryPart({ customColumns, filter, onText }: PartProps) {
  const fieldLabel = useFilterFieldLabel();
  const operatorLabel = useFilterOperatorLabel();
  const value = useFilterValueText(filter, customColumns);
  const field = fieldLabel(filter.field, customColumns);
  const operator = operatorLabel(filter.operator as FilterOperatorKey);
  const text =
    value.kind === "unavailable"
      ? null
      : value.kind === "loading"
        ? field
        : value.kind === "standalone"
          ? `${field} ${operator}`
          : LABELLED_OPERATORS.has(filter.operator)
            ? `${field}: ${value.text}`
            : `${field} ${operator} ${value.text}`;

  useEffect(() => onText(text), [onText, text]);

  return null;
});

type Props = {
  customColumns: ColumnPresentation[] | undefined;
  filters: readonly Filter[];
  onText: (index: number, text: string | null) => void;
};

export function FilterSummary({ customColumns, filters, onText }: Props) {
  return (
    <>
      {filters.map((filter, index) => (
        <FilterSummaryPart
          key={`${filter.field}-${index}`}
          customColumns={customColumns}
          filter={filter}
          onText={(text) => onText(index, text)}
        />
      ))}
    </>
  );
}
