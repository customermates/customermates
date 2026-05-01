"use client";

import type { Filter } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { z } from "zod";

import { isCustomField, isStandaloneOperator } from "@/components/data-view/table-view.utils";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { useRootStore } from "@/core/stores/root-store.provider";
import {
  type FilterSelectItem,
  useFilterSelectItems,
} from "@/components/data-view/filter-modal/inputs/use-filter-select-items";

export function getFilterLabel(
  filter: Filter,
  customColumns: CustomColumnDto[] | undefined,
  t: (key: string) => string,
) {
  if (isCustomField(filter.field)) return customColumns?.find((col) => col.id === filter.field)?.label ?? filter.field;

  return t(`filters.fields.${filter.field.replace(/\./g, "_")}`);
}

function normalizeValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value == null) return [];
  return [String(value)];
}

function findLabelForValue(value: string, items: FilterSelectItem[]) {
  return items.find((it) => it.value === value || it.key === value)?.textValue ?? value;
}

export const FilterChipValue = observer(function FilterChipValue({
  filter,
  customColumns,
}: {
  filter: Filter;
  customColumns: CustomColumnDto[] | undefined;
}) {
  const t = useTranslations("Common.filters");
  const { items, isLoading } = useFilterSelectItems(filter, customColumns);
  const { intlStore } = useRootStore();

  if (isStandaloneOperator(filter.operator)) return null;
  if (isLoading) return <span className="opacity-70">…</span>;

  if (filter.operator === FilterOperatorKey.inLastDays) {
    const count = Number("value" in filter ? filter.value : 0) || 0;
    return <>{t("daysPreset", { count })}</>;
  }

  const values = normalizeValues("value" in filter ? filter.value : undefined);
  const labels = values.map((value) => {
    const dateParse = z.iso.datetime().safeParse(value);
    if (dateParse.success) {
      const normalized = dateParse.data.endsWith("Z") ? dateParse.data.slice(0, -1) : dateParse.data;
      return intlStore.formatNumericalShortDate(new Date(normalized));
    }
    return findLabelForValue(value, items);
  });

  return <>{labels.join(", ")}</>;
});
