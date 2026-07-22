"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { BookmarkIcon, SearchIcon, XIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { AppChip } from "@/components/chip/app-chip";
import { ClickableChip } from "@/components/chip/clickable-chip";
import { useRootStore } from "@/core/stores/root-store.provider";
import { FilterChipValue, getFilterLabel } from "@/components/data-view/filter-modal/filter-chip-display";
import { cn } from "@/lib/utils";

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
  const { editFiltersModalStore } = useRootStore();

  const filters = store.filters ?? [];
  const presets = store.savedFilterPresets ?? [];
  const searchTerm = store.searchTerm?.trim() ? store.searchTerm : undefined;
  const hasFilters = filters.length > 0;
  const hasSearch = Boolean(searchTerm);

  if (!hasFilters && !hasSearch) {
    if (presets.length === 0) return null;

    return (
      <div className={cn("flex flex-wrap gap-1.5 items-center px-4 py-2", !noBorder && "border-b border-border")}>
        {presets.map((preset) => (
          <ClickableChip
            key={preset.id}
            className="max-w-md"
            startContent={<BookmarkIcon className="size-3 opacity-70" />}
            variant="secondary"
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
        const label = getFilterLabel(filter, store.customColumns, t);
        const operator = t(`Common.filters.operators.${filter.operator}`);

        return (
          <ClickableChip
            key={`${filter.field}-${index}`}
            className="max-w-md"
            endContent={
              <button
                aria-label={t("Common.actions.delete")}
                className="ml-0.5 opacity-50 transition-[opacity,transform] hover:opacity-100 active:scale-[0.97] motion-reduce:transition-none"
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
            onClick={() => {
              onEditFilters?.();
              editFiltersModalStore.openFor(store, filter.field);
            }}
          >
            <span className="truncate text-[11px]">
              <FilterChipValue customColumns={store.customColumns} filter={filter} label={label} operator={operator} />
            </span>
          </ClickableChip>
        );
      })}

      {(hasFilters || hasSearch) && (
        <Button
          className="h-auto py-0.5 px-2 text-[11px]"
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
