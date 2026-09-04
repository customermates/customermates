"use client";

import type { ReactElement } from "react";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { XIcon } from "lucide-react";

import { hasValidFilterConfiguration } from "@/components/data-view/table-view.utils";
import {
  resolveFilterDateGranularity,
  resolveFilterValueClass,
  shouldPreserveFilterValue,
} from "@/components/data-view/filter-modal/filter-value-class";
import { FilterInputSelect } from "@/components/data-view/filter-modal/inputs/filter-input-select";
import { FilterInputNumber } from "@/components/data-view/filter-modal/inputs/filter-input-number";
import { FilterInputText } from "@/components/data-view/filter-modal/inputs/filter-input-text";
import { FilterInputIsoDate } from "@/components/data-view/filter-modal/inputs/filter-input-iso-date";
import { FilterInputIsoDateRange } from "@/components/data-view/filter-modal/inputs/filter-input-iso-date-range";
import { FilterInputDaysCount } from "@/components/data-view/filter-modal/inputs/filter-input-days-count";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppForm } from "@/components/forms/form-context";
import type { FilterOperatorKey } from "@/core/base/base-query-builder";

import { isStandaloneOperator } from "@/core/base/base-query-builder";
import { cn } from "@/core/utils/cn";

type Props = {
  customColumns?: CustomColumnDto[];
  filter: Filter;
  filterableFields: FilterableField[];
  baseId: string;
  onFilterChange?: (field: string) => void;
};

export const FilterField = observer(({ customColumns, filter, filterableFields, baseId, onFilterChange }: Props) => {
  const t = useTranslations();

  const form = useAppForm();
  const isDisabled = form?.isDisabled ?? false;
  const operator = filter.operator as FilterOperatorKey | undefined;
  const isValidFilter = hasValidFilterConfiguration(filter);
  const isStandalone = isStandaloneOperator(operator);
  const operatorIsEmpty = !operator;
  const fieldAvailable = filterableFields.some((field) => field.field === filter.field);

  const operators = filterableFields?.find((f) => f.field === filter.field)?.operators.map((op) => ({ key: op })) ?? [];

  const renderFilterFieldBody = useCallback((): ReactElement => {
    if (!fieldAvailable) {
      return (
        <div
          data-filter-value-unavailable
          aria-disabled="true"
          className="flex h-8 items-center rounded-md border border-input px-3 text-sm text-muted-foreground"
        >
          {t("Common.filters.unavailableValue")}
        </div>
      );
    }

    const id = `${baseId}.value`;
    const valueClass = resolveFilterValueClass(filter.field, operator, customColumns);
    const granularity = resolveFilterDateGranularity(filter.field, customColumns);

    switch (valueClass) {
      case "unavailable":
        return (
          <div
            data-filter-value-unavailable
            aria-disabled="true"
            className="flex h-8 items-center rounded-md border border-input px-3 text-sm text-muted-foreground"
          >
            {t("Common.filters.unavailableValue")}
          </div>
        );
      case "stringArray":
        return (
          <FilterInputSelect
            customColumns={customColumns}
            filter={filter}
            id={id}
            isValidFilter={isValidFilter}
            onValueChange={() => onFilterChange?.(filter.field)}
          />
        );
      case "numericString":
        return <FilterInputNumber id={id} isValidFilter={isValidFilter} />;
      case "daysCount":
        return <FilterInputDaysCount id={id} isValidFilter={isValidFilter} />;
      case "isoRange":
        return <FilterInputIsoDateRange granularity={granularity} id={id} isValidFilter={isValidFilter} />;
      case "isoDate":
        return <FilterInputIsoDate granularity={granularity} id={id} isValidFilter={isValidFilter} />;
      default:
        return <FilterInputText id={id} isValidFilter={isValidFilter} />;
    }
  }, [baseId, customColumns, fieldAvailable, filter, isValidFilter, onFilterChange, operator, t]);

  const operatorId = `${baseId}.operator`;
  const bodyShown = !isStandalone && !operatorIsEmpty;

  function handleOperatorChange(next: string | undefined) {
    if (isDisabled) return;

    const keepValue = shouldPreserveFilterValue(filter, next as FilterOperatorKey | undefined, customColumns);

    form?.onChange(operatorId, next);
    if (!keepValue) form?.onChange(`${baseId}.value`, undefined);
    form?.flushPendingChanges?.();
    onFilterChange?.(filter.field);
  }

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="relative">
        <Select disabled={isDisabled} value={operator ?? ""} onValueChange={(v) => handleOperatorChange(v)}>
          <SelectTrigger
            className={cn(
              "w-full",
              isValidFilter && "border-primary bg-primary/10",
              operator && "pr-8 [&>svg:last-child]:hidden",
            )}
            id={operatorId}
            size="sm"
          >
            <SelectValue placeholder={t("Common.filters.selectOperator")} />
          </SelectTrigger>

          <SelectContent>
            {operators.map(({ key }) => (
              <SelectItem key={key} value={key}>
                {t(`Common.filters.operators.${key}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {operator && (
          <button
            aria-label={t("Common.actions.clear")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-[color,opacity,transform] hover:text-foreground opacity-50 hover:opacity-100 active:scale-[0.97] motion-reduce:transition-none"
            disabled={isDisabled}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleOperatorChange(undefined);
            }}
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>

      {bodyShown && <div className="min-w-0">{renderFilterFieldBody()}</div>}
    </div>
  );
});
