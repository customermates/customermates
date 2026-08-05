"use client";

import type { ReactNode } from "react";
import type { Filter } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { z } from "zod";

import { FilterOperatorKey, isStandaloneOperator } from "@/core/base/base-query-builder";
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

          <span className="opacity-70">…</span>
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

    const resolvesLabels = Boolean(getItems) || items.length > 0;
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
      return resolvesLabels ? unavailable : value;
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
