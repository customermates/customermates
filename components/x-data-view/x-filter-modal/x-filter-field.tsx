import type { ReactElement } from "react";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { cn } from "@heroui/theme";

import { isStandaloneOperator, hasValidFilterConfiguration, isCustomField } from "../x-table-view/x-table-view.utils";

import { XFilterInputSelect } from "./inputs/x-filter-input-select";
import { XFilterInputNumber } from "./inputs/x-filter-input-number";
import { XFilterInputText } from "./inputs/x-filter-input-text";
import { XFilterInputIsoDate } from "./inputs/x-filter-input-iso-date";
import { XFilterInputIsoDateRange } from "./inputs/x-filter-input-iso-date-range";

import { XSelect } from "@/components/x-inputs/x-select";
import { XSelectItem } from "@/components/x-inputs/x-select-item";
import { useXForm } from "@/components/x-inputs/x-form";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";

type Props = {
  customColumns?: CustomColumnDto[];
  filter: Filter;
  filterableFields: FilterableField[];
  baseId: string;
};

export const XFilterField = observer(({ customColumns, filter, filterableFields, baseId }: Props) => {
  const t = useTranslations("Common");

  const form = useXForm();
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
    const isCustom = isCustomField(filter.field);

    if (isCustom) {
      const customColumn = customColumns?.find((col) => col.id === filter.field);

      if (!customColumn) throw new Error(`Custom column not found for filter: ${filter.field}`);

      switch (customColumn?.type) {
        case "singleSelect":
          return (
            <XFilterInputSelect customColumns={customColumns} filter={filter} id={id} isValidFilter={isValidFilter} />
          );
        case "currency":
          return <XFilterInputNumber id={id} isValidFilter={isValidFilter} />;
        case "date":
          return isBetween ? (
            <XFilterInputIsoDateRange granularity="day" id={id} isValidFilter={isValidFilter} />
          ) : (
            <XFilterInputIsoDate granularity="day" id={id} isValidFilter={isValidFilter} />
          );
        case "dateTime":
          return isBetween ? (
            <XFilterInputIsoDateRange granularity="minute" id={id} isValidFilter={isValidFilter} />
          ) : (
            <XFilterInputIsoDate granularity="minute" id={id} isValidFilter={isValidFilter} />
          );
        case "link":
        case "plain":
        case "email":
        case "phone":
          return <XFilterInputText id={id} isValidFilter={isValidFilter} />;
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
      return <XFilterInputSelect customColumns={customColumns} filter={filter} id={id} isValidFilter={isValidFilter} />;

    const dateFields = [FilterFieldKey.updatedAt, FilterFieldKey.createdAt];
    if (dateFields.includes(filter.field as FilterFieldKey)) {
      return isBetween ? (
        <XFilterInputIsoDateRange granularity="minute" id={id} isValidFilter={isValidFilter} />
      ) : (
        <XFilterInputIsoDate granularity="minute" id={id} isValidFilter={isValidFilter} />
      );
    }

    return <XFilterInputText id={id} isValidFilter={isValidFilter} />;
  }, [customColumns, filter, baseId, isValidFilter, isStandalone, operatorIsEmpty, form, operator]);

  return (
    <div className={cn("grid *:min-w-0", { "grid-cols-[9rem_1fr]": !isStandalone && !operatorIsEmpty })}>
      <XSelect
        isClearable
        classNames={{
          mainWrapper: "h-full",
          base: "h-full",
          trigger: cn("h-full", isValidFilter ? "border-primary bg-primary-50/40" : "border-default", {
            "rounded-r-none": !isStandalone && !operatorIsEmpty,
          }),
        }}
        color={isValidFilter ? "primary" : "default"}
        id={`${baseId}.operator`}
        items={operators}
        label={label}
        onSelectionChange={(keys) => {
          const key = new Set(keys).values().next().value as string | undefined;
          form?.onChange(`${baseId}.operator`, key);
          form?.onChange(`${baseId}.value`, undefined);
        }}
      >
        {({ key }) =>
          XSelectItem({
            key,
            children: t(`filters.operators.${key}`),
          })
        }
      </XSelect>

      {!isStandalone && !operatorIsEmpty && renderFilterFieldBody()}
    </div>
  );
});
