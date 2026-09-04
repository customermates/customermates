"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { SearchIcon, XIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { Button } from "@/components/ui/button";
import { FilterChipOperatorMenu } from "@/components/data-view/header/filter-chip-operator-menu";
import { FilterChipValue } from "@/components/data-view/filter-modal/filter-chip-display";
import { isStandaloneOperator } from "@/core/base/base-query-builder";
import { useFilterFieldLabel } from "@/components/entity-terminology/use-filter-field-label";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  noBorder?: boolean;
  onEditFilters?: () => void;
};

export const DataViewActiveFiltersBar = observer(function DataViewActiveFiltersBar<E extends HasId>({
  store,
  noBorder,
  onEditFilters,
}: Props<E>) {
  const t = useTranslations();
  const filterFieldLabel = useFilterFieldLabel();
  const { filterPaletteStore: palette } = useRootStore();

  const filters = store.filters ?? [];
  const searchTerm = store.searchTerm?.trim() ? store.searchTerm : undefined;
  const hasFilters = filters.length > 0;
  const hasSearch = Boolean(searchTerm);

  if (!hasFilters && !hasSearch) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5 items-center px-4 py-2", !noBorder && "border-b border-border")}>
      {hasSearch && (
        <AppChip
          className="max-w-md"
          endContent={
            <button
              aria-label={t("Common.filters.clearSearch")}
              className="ml-0.5 opacity-50 transition-[opacity,transform] hover:opacity-100 active:scale-[0.97] motion-reduce:transition-none"
              tabIndex={-1}
              type="button"
              onClick={() => store.setQueryOptions({ searchTerm: "" })}
            >
              <XIcon className="size-3" />
            </button>
          }
          startContent={<SearchIcon className="size-2.5! opacity-70" />}
          variant="default"
        >
          <span className="truncate text-[11px]">
            <span className="sr-only">{t("Common.filters.searchLabel")}: </span>

            {searchTerm}
          </span>
        </AppChip>
      )}

      {filters.map((filter, index) => {
        const label = filterFieldLabel(filter.field, store.customColumns);

        return (
          <AppChip
            key={`${filter.field}-${index}`}
            className="max-w-md"
            data-filter-index={index}
            endContent={
              <button
                aria-label={t("Common.filters.palette.removeFilter")}
                className="ml-0.5 opacity-50 transition-[opacity,transform] hover:opacity-100 active:scale-[0.97] motion-reduce:transition-none"
                type="button"
                onClick={() => store.removeFilterAt(index)}
              >
                <XIcon className="size-3" />
              </button>
            }
            variant="default"
          >
            <span className="flex min-w-0 items-center text-[11px]">
              <span className="truncate font-medium">{label}</span>

              <FilterChipOperatorMenu filter={filter} index={index} store={store} />

              {!isStandaloneOperator(filter.operator) && (
                <button
                  aria-label={t("Common.filters.palette.editValue")}
                  className="min-w-0 truncate transition-opacity hover:opacity-70 motion-reduce:transition-none"
                  type="button"
                  onClick={() => {
                    onEditFilters?.();
                    palette.openAt(store, { kind: "value", field: filter.field, editIndex: index });
                  }}
                >
                  <FilterChipValue customColumns={store.customColumns} filter={filter} />
                </button>
              )}
            </span>
          </AppChip>
        );
      })}

      {(hasFilters || hasSearch) && (
        <Button
          className="h-[22px] py-0.5 px-2 text-[11px]"
          size="xs"
          type="button"
          variant="secondary"
          onClick={() => store.setQueryOptions({ filters: [], searchTerm: "" })}
        >
          {t("Common.filters.clearAll")}
        </Button>
      )}
    </div>
  );
});
