"use client";

import type { ReactElement } from "react";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { XIcon } from "lucide-react";

import { hasValidFilterConfiguration, isCustomField } from "@/components/data-view/table-view.utils";
import { FilterInputSelect } from "@/components/data-view/filter-modal/inputs/filter-input-select";
import { FilterInputNumber } from "@/components/data-view/filter-modal/inputs/filter-input-number";
import { FilterInputText } from "@/components/data-view/filter-modal/inputs/filter-input-text";
import { FilterInputIsoDate } from "@/components/data-view/filter-modal/inputs/filter-input-iso-date";
import { FilterInputIsoDateRange } from "@/components/data-view/filter-modal/inputs/filter-input-iso-date-range";
import { FilterInputDaysCount } from "@/components/data-view/filter-modal/inputs/filter-input-days-count";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppForm } from "@/components/forms/form-context";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey, isStandaloneOperator } from "@/core/base/base-query-builder";
import { cn } from "@/core/utils/cn";

type Props = {
  customColumns?: CustomColumnDto[];
  filter: Filter;
  filterableFields: FilterableField[];
  baseId: string;
};

export const FilterField = observer(({ customColumns, filter, filterableFields, baseId }: Props) => {
  const t = useTranslations();

  const form = useAppForm();
  const isStandalone = isStandaloneOperator(filter.operator);
  const isValidFilter = hasValidFilterConfiguration(filter);
  const operator = form?.getValue(`${baseId}.operator`) as FilterOperatorKey | undefined;
  const operatorIsEmpty = !operator;

  const operators = filterableFields?.find((f) => f.field === filter.field)?.operators.map((op) => ({ key: op })) ?? [];

  const renderFilterFieldBody = useCallback((): ReactElement => {
    const id = `${baseId}.value`;
    const isBetween = operator === FilterOperatorKey.between;
    const isInLastDays = operator === FilterOperatorKey.inLastDays;
    const isCustomField_ = isCustomField(filter.field);

    if (isCustomField_) {
      const customColumn = customColumns?.find((col) => col.id === filter.field);

      if (!customColumn) {
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

      switch (customColumn?.type) {
        case "singleSelect":
          return (
            <FilterInputSelect customColumns={customColumns} filter={filter} id={id} isValidFilter={isValidFilter} />
          );
        case "currency":
          return <FilterInputNumber id={id} isValidFilter={isValidFilter} />;
        case "date":
        case "dateRange":
          if (isInLastDays) return <FilterInputDaysCount id={id} isValidFilter={isValidFilter} />;
          return isBetween ? (
            <FilterInputIsoDateRange granularity="day" id={id} isValidFilter={isValidFilter} />
          ) : (
            <FilterInputIsoDate granularity="day" id={id} isValidFilter={isValidFilter} />
          );
        case "dateTime":
        case "dateTimeRange":
          if (isInLastDays) return <FilterInputDaysCount id={id} isValidFilter={isValidFilter} />;
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
      FilterFieldKey.participantContactId,
      FilterFieldKey.serviceIds,
      FilterFieldKey.dealIds,
      FilterFieldKey.organizationIds,
      FilterFieldKey.taskIds,
      FilterFieldKey.event,
      FilterFieldKey.status,
      FilterFieldKey.provider,
      FilterFieldKey.state,
      FilterFieldKey.timelineKind,
      FilterFieldKey.timelineThreadId,
      FilterFieldKey.connectedAccountId,
      FilterFieldKey.participants,
    ];

    if (relationFields.includes(filter.field as FilterFieldKey))
      return <FilterInputSelect customColumns={customColumns} filter={filter} id={id} isValidFilter={isValidFilter} />;

    const dateFields = [FilterFieldKey.updatedAt, FilterFieldKey.createdAt];
    if (dateFields.includes(filter.field as FilterFieldKey)) {
      if (isInLastDays) return <FilterInputDaysCount id={id} isValidFilter={isValidFilter} />;
      return isBetween ? (
        <FilterInputIsoDateRange granularity="minute" id={id} isValidFilter={isValidFilter} />
      ) : (
        <FilterInputIsoDate granularity="minute" id={id} isValidFilter={isValidFilter} />
      );
    }

    return <FilterInputText id={id} isValidFilter={isValidFilter} />;
  }, [customColumns, filter, baseId, isValidFilter, operator, filterableFields, t]);

  const operatorId = `${baseId}.operator`;
  const bodyShown = !isStandalone && !operatorIsEmpty;

  function handleOperatorChange(next: string | undefined) {
    form?.onChange(operatorId, next);
    form?.onChange(`${baseId}.value`, undefined);
  }

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
});
