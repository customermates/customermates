"use client";

import type { ReactNode } from "react";
import type { Filter } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { CustomColumnType } from "@/generated/prisma";

import { FilterOperatorKey, isStandaloneOperator } from "@/core/base/base-query-builder";
import { SelectionValueSkeleton } from "@/components/forms/selection-loading";
import { filterValueKind } from "@/core/types/filter-field-value-kind";
import { isCustomField } from "@/core/utils/custom-field";
import { useRootStore } from "@/core/stores/root-store.provider";
import {
  type FilterSelectItem,
  useFilterSelectItems,
} from "@/components/data-view/filter-modal/inputs/use-filter-select-items";

function normalizeValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value == null) return [];
  return [String(value)];
}

function findLabelForValue(value: string, items: FilterSelectItem[]): string | undefined {
  return items.find((it) => it.value === value || it.key === value)?.textValue;
}

export const FilterChipValue = observer(
  ({
    filter,
    customColumns,
    label,
    operator,
  }: {
    filter: Filter;
    customColumns: CustomColumnDto[] | undefined;
    label?: ReactNode;
    operator?: ReactNode;
  }) => {
    const t = useTranslations();
    const { items, getItems, isLoading } = useFilterSelectItems(filter, customColumns);
    const { intlStore } = useRootStore();

    const prefix = (
      <>
        <span className="font-medium">{label}</span>

        <span className="mx-1 font-normal">{operator}</span>
      </>
    );

    if (isStandaloneOperator(filter.operator)) return prefix;
    if (isLoading) {
      return (
        <>
          {prefix}

          <span data-filter-value-loading aria-label={t("Loading.text")} role="status">
            <SelectionValueSkeleton barClassName="h-2.5 w-14 rounded-full" className="h-3" tone="current" />
          </span>
        </>
      );
    }

    if (filter.operator === FilterOperatorKey.inLastDays) {
      const count = Number("value" in filter ? filter.value : 0) || 0;
      return (
        <>
          {prefix}

          {t("Common.filters.daysPreset", { count })}
        </>
      );
    }

    const customColumn = isCustomField(filter.field)
      ? customColumns?.find((column) => column.id === filter.field)
      : undefined;
    const valueKind = filterValueKind(filter.field);
    const requiresResolvedLabel =
      Boolean(getItems) ||
      items.length > 0 ||
      valueKind?.kind === "entityId" ||
      valueKind?.kind === "enum" ||
      valueKind?.kind === "event" ||
      (isCustomField(filter.field) &&
        (customColumn === undefined || customColumn.type === CustomColumnType.singleSelect));
    const values = normalizeValues("value" in filter ? filter.value : undefined);
    const unavailable = t("Common.filters.unavailableValue");
    const labels = values.map((value) => {
      const dateParse = z.iso.datetime().safeParse(value);
      if (dateParse.success) {
        const normalized = dateParse.data.endsWith("Z") ? dateParse.data.slice(0, -1) : dateParse.data;
        return intlStore.formatNumericalShortDate(new Date(normalized));
      }
      const resolved = findLabelForValue(value, items);
      if (resolved !== undefined) return resolved;
      return requiresResolvedLabel ? unavailable : value;
    });

    if (values.length > 0 && labels.every((value) => value === unavailable)) return <>{unavailable}</>;

    return (
      <>
        {prefix}

        {labels.join(", ")}
      </>
    );
  },
);
