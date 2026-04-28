"use client";

import type { ReactElement } from "react";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { XIcon } from "lucide-react";

import {
  isStandaloneOperator,
  hasValidFilterConfiguration,
  isCustomField,
} from "@/components/data-view/table-view.utils";
import { FilterInputSelect } from "@/components/data-view/filter-modal/inputs/filter-input-select";
import { FilterInputNumber } from "@/components/data-view/filter-modal/inputs/filter-input-number";
import { FilterInputText } from "@/components/data-view/filter-modal/inputs/filter-input-text";
import { FilterInputIsoDate } from "@/components/data-view/filter-modal/inputs/filter-input-iso-date";
import { FilterInputIsoDateRange } from "@/components/data-view/filter-modal/inputs/filter-input-iso-date-range";
import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/forms/form-label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppForm } from "@/components/forms/form-context";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { cn } from "@/lib/utils";

type Props = {
  customColumns?: CustomColumnDto[];
  filter: Filter;
  filterableFields: FilterableField[];
  baseId: string;
  /** When true, hide the field label and stack operator + value vertically — useful for narrow popovers. */
  inline?: boolean;
};

export const FilterField = observer(({ customColumns, filter, filterableFields, baseId, inline }: Props) => {
  const t = useTranslations("Common");

  const form = useAppForm();
  const isStandalone = isStandaloneOperator(filter.operator);
  const isValidFilter = hasValidFilterConfiguration(filter);
  const operator = form?.getValue(`${baseId}.operator`) as FilterOperatorKey | undefined;
  const operatorIsEmpty = !operator;

  const isCustom = isCustomField(filter.field);
  const customColumn = isCustom ? customColumns?.find((col) => col.id === filter.field) : null;
  const label = isCustom ? customColumn?.label : t(`filters.fields.${filter.field}`);

  const operators = filterableFields?.find((f) => f.field === filter.field)?.operators.map((op) => ({ key: op })) ?? [];

  const renderFilterFieldBody = useCallback((): ReactElement => {
    const id = `${baseId}.value`;
    const isBetween = operator === FilterOperatorKey.between;
    const isCustomField_ = isCustomField(filter.field);

    if (isCustomField_) {
      const customColumn = customColumns?.find((col) => col.id === filter.field);

      if (!customColumn) throw new Error(`Custom column not found for filter: ${filter.field}`);

      switch (customColumn?.type) {
        case "singleSelect":
          return (
            <FilterInputSelect customColumns={customColumns} filter={filter} id={id} isValidFilter={isValidFilter} />
          );
        case "currency":
          return <FilterInputNumber id={id} isValidFilter={isValidFilter} />;
        case "date":
        case "dateRange":
          return isBetween ? (
            <FilterInputIsoDateRange granularity="day" id={id} isValidFilter={isValidFilter} />
          ) : (
            <FilterInputIsoDate granularity="day" id={id} isValidFilter={isValidFilter} />
          );
        case "dateTime":
        case "dateTimeRange":
          return isBetween ? (
            <FilterInputIsoDateRange granularity="minute" id={id} isValidFilter={isValidFilter} />
          ) : (
            <FilterInputIsoDate granularity="minute" id={id} isValidFilter={isValidFilter} />
          );
        case "link":
        case "plain":
        case "email":
        case "phone":
          return <FilterInputText id={id} isValidFilter={isValidFilter} />;
      }
    }

    const relationFields = [
      FilterFieldKey.userIds,
      FilterFieldKey.contactIds,
      FilterFieldKey.serviceIds,
      FilterFieldKey.dealIds,
      FilterFieldKey.organizationIds,
      FilterFieldKey.event,
      FilterFieldKey.status,
    ];

    if (relationFields.includes(filter.field as FilterFieldKey))
      return <FilterInputSelect customColumns={customColumns} filter={filter} id={id} isValidFilter={isValidFilter} />;

    const dateFields = [FilterFieldKey.updatedAt, FilterFieldKey.createdAt];
    if (dateFields.includes(filter.field as FilterFieldKey)) {
      return isBetween ? (
        <FilterInputIsoDateRange granularity="minute" id={id} isValidFilter={isValidFilter} />
      ) : (
        <FilterInputIsoDate granularity="minute" id={id} isValidFilter={isValidFilter} />
      );
    }

    return <FilterInputText id={id} isValidFilter={isValidFilter} />;
  }, [customColumns, filter, baseId, isValidFilter, operator]);

  const operatorId = `${baseId}.operator`;
  const bodyShown = !isStandalone && !operatorIsEmpty;

  function handleOperatorChange(next: string | undefined) {
    form?.onChange(operatorId, next);
    form?.onChange(`${baseId}.value`, undefined);
  }

  if (inline) {
    return (
      <div className="flex flex-col gap-2 min-w-0">
        <div className="relative">
          <Select value={operator ?? ""} onValueChange={(v) => handleOperatorChange(v)}>
            <SelectTrigger
              className={cn(
                "w-full",
                isValidFilter && "border-primary bg-primary/10",
                operator && "pr-8 [&>svg:last-child]:hidden",
              )}
              id={operatorId}
              size="sm"
            >
              <SelectValue placeholder={t("filters.selectOperator")} />
            </SelectTrigger>

            <SelectContent>
              {operators.map(({ key }) => (
                <SelectItem key={key} value={key}>
                  {t(`filters.operators.${key}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {operator && (
            <button
              aria-label={t("actions.clear")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors opacity-50 hover:opacity-100"
              tabIndex={-1}
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
  }

  return (
    <div className={cn("grid *:min-w-0", { "grid-cols-[9rem_1fr]": bodyShown })}>
      <div className="space-y-1.5">
        {label && <FormLabel htmlFor={operatorId}>{label}</FormLabel>}

        <div className="relative">
          <Select value={operator ?? ""} onValueChange={(v) => handleOperatorChange(v)}>
            <SelectTrigger
              className={cn("w-full", isValidFilter && "border-primary bg-primary/10", operator && "pr-8")}
              id={operatorId}
            >
              <SelectValue placeholder=" " />
            </SelectTrigger>

            <SelectContent>
              {operators.map(({ key }) => (
                <SelectItem key={key} value={key}>
                  {t(`filters.operators.${key}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {operator && (
            <Button
              aria-label={t("actions.clear")}
              className="absolute right-7 top-1/2 -translate-y-1/2"
              size="icon-xs"
              tabIndex={-1}
              type="button"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                handleOperatorChange(undefined);
              }}
            >
              <XIcon />
            </Button>
          )}
        </div>
      </div>

      {bodyShown && renderFilterFieldBody()}
    </div>
  );
});
