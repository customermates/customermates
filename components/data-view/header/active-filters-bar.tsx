"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { BookmarkIcon, XIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ClickableChip } from "@/components/chip/clickable-chip";
import { useRootStore } from "@/core/stores/root-store.provider";
import { FilterChipValue, getFilterLabel } from "@/components/data-view/filter-modal/filter-chip-display";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
};

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
            onClick={() => editFiltersModalStore.openFor(store, filter.field)}
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
