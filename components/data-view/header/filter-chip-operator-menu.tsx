"use client";

import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { Filter } from "@/core/base/base-get.schema";
import type { FilterOperatorKey } from "@/core/base/base-query-builder";

import { CheckIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isStandaloneOperator } from "@/core/base/base-query-builder";
import { shouldPreserveFilterValue } from "@/components/data-view/filter-modal/filter-value-class";
import { toAppliedFilter } from "@/components/data-view/filter-palette/palette-field-plan";
import { useFilterOperatorLabel } from "@/components/data-view/filter-modal/use-filter-operator-label";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";

type MenuProps = {
  operators: FilterOperatorKey[];
  current: FilterOperatorKey | undefined;
  compact?: boolean;
  onSelect: (operator: FilterOperatorKey) => void;
};

export function FilterOperatorMenu({ operators, current, compact, onSelect }: MenuProps) {
  const t = useTranslations();
  const operatorLabel = useFilterOperatorLabel();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          data-palette-operator-trigger
          aria-label={t("Common.filters.palette.editOperator")}
          className={cn("min-w-0 font-normal", compact ? "h-[18px] px-1 text-[11px]" : "h-6 px-1.5 text-xs")}
          disabled={operators.length === 0}
          size="xs"
          type="button"
          variant="ghost"
        >
          <span className="truncate">{current ? operatorLabel(current) : t("Common.filters.selectOperator")}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start">
        {operators.map((operator) => (
          <DropdownMenuItem key={operator} onSelect={() => onSelect(operator)}>
            <span className="flex-1">{operatorLabel(operator)}</span>

            {operator === current && <CheckIcon className="size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type ChipProps = {
  store: BaseDataViewStore<any>;
  filter: Filter;
  index: number;
};

export const FilterChipOperatorMenu = observer(function FilterChipOperatorMenu({ store, filter, index }: ChipProps) {
  const { filterPaletteStore: palette } = useRootStore();
  const operators = store.filterableFields.find((candidate) => candidate.field === filter.field)?.operators ?? [];

  function handleSelect(next: FilterOperatorKey) {
    if (next === filter.operator) return;

    if (shouldPreserveFilterValue(filter, next, store.customColumns)) {
      store.replaceFilterAt(index, { ...filter, operator: next } as Filter);
      return;
    }

    if (isStandaloneOperator(next)) {
      store.replaceFilterAt(index, toAppliedFilter({ field: filter.field, operator: next } as Filter));
      return;
    }

    palette.openAt(store, { kind: "value", field: filter.field, editIndex: index });
    palette.setDraftOperator(next);
  }

  return (
    <FilterOperatorMenu
      compact
      current={filter.operator as FilterOperatorKey}
      operators={operators}
      onSelect={handleSelect}
    />
  );
});
