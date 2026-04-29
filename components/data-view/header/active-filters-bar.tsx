"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { Filter } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { BookmarkIcon, XIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { ClickableChip } from "@/components/chip/clickable-chip";
import { isCustomField, isStandaloneOperator } from "@/components/data-view/table-view.utils";
import { useRootStore } from "@/core/stores/root-store.provider";
import {
  type FilterSelectItem,
  useFilterSelectItems,
} from "@/components/data-view/filter-modal/inputs/use-filter-select-items";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
};

function normalizeValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value == null) return [];
  return [String(value)];
}

function getFilterLabel(filter: Filter, customColumns: CustomColumnDto[] | undefined, t: (key: string) => string) {
  if (isCustomField(filter.field)) return customColumns?.find((col) => col.id === filter.field)?.label ?? filter.field;

  return t(`filters.fields.${filter.field.replace(/\./g, "_")}`);
}

function findLabelForValue(value: string, items: FilterSelectItem[]) {
  return items.find((it) => it.value === value || it.key === value)?.textValue ?? value;
}

const FilterChipValue = observer(function FilterChipValue({
  filter,
  customColumns,
}: {
  filter: Filter;
  customColumns: CustomColumnDto[] | undefined;
}) {
  const { items, isLoading } = useFilterSelectItems(filter, customColumns);
  const { intlStore } = useRootStore();

  if (isStandaloneOperator(filter.operator)) return null;
  if (isLoading) return <span className="opacity-70">…</span>;

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

export const DataViewActiveFiltersBar = observer(function DataViewActiveFiltersBar<E extends HasId>({
  store,
}: Props<E>) {
  const t = useTranslations("Common");
  const { editFiltersModalStore } = useRootStore();

  const filters = store.filters ?? [];
  const presets = store.savedFilterPresets ?? [];

  if (filters.length === 0) {
    if (presets.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1.5 items-center px-4 py-2 border-b border-border">
        {presets.map((preset) => (
          <ClickableChip
            key={preset.id}
            className="max-w-md"
            startContent={<BookmarkIcon className="size-3 opacity-70" />}
            variant="outline"
            onClick={() => store.changeFilterPreset(preset.id)}
          >
            <span className="truncate text-[11px]">{preset.name}</span>
          </ClickableChip>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center px-4 py-2 border-b border-border">
      {filters.map((filter, index) => {
        const label = getFilterLabel(filter, store.customColumns, t);
        const operator = t(`filters.operators.${filter.operator}`);

        return (
          <ClickableChip
            key={`${filter.field}-${index}`}
            className="max-w-md"
            endContent={
              <button
                aria-label={t("actions.delete")}
                className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
                tabIndex={-1}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  store.removeFilter(filter);
                }}
              >
                <XIcon className="size-3" />
              </button>
            }
            variant="default"
            onClick={() => editFiltersModalStore.openFor(store)}
          >
            <span className="truncate text-[11px]">
              <span className="font-medium">{label}</span>

              <span className="mx-1 font-normal">{operator}</span>

              <FilterChipValue customColumns={store.customColumns} filter={filter} />
            </span>
          </ClickableChip>
        );
      })}

      <Button
        className="h-auto py-0.5 px-2 text-[11px]"
        size="xs"
        type="button"
        variant="outline"
        onClick={() => store.changeFilterPreset(undefined)}
      >
        {t("filters.clearAll")}
      </Button>
    </div>
  );
});
