"use client";

import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { Filter } from "@/core/base/base-get.schema";
import type { FilterOperatorKey } from "@/core/base/base-query-builder";

import { XIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { ClickableChip } from "@/components/chip/clickable-chip";
import { CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { FilterChipValue } from "@/components/data-view/filter-modal/filter-chip-display";
import { useFilterFieldLabel } from "@/components/entity-terminology/use-filter-field-label";
import { useFilterOperatorLabel } from "@/components/data-view/filter-modal/use-filter-operator-label";

const ZONE_LABEL_CLASS = "px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

const PALETTE_GROUP_CLASS =
  "**:[[cmdk-group-heading]]:text-[11px] **:[[cmdk-group-heading]]:tracking-wide **:[[cmdk-group-heading]]:uppercase";

type Props = {
  store: BaseDataViewStore<any>;
  filters: Filter[];
  isAtLimit: boolean;
  onPickField: (field: string) => void;
  onPickFilter: (index: number) => void;
};

export const PaletteRootList = observer(function PaletteRootList({
  store,
  filters,
  isAtLimit,
  onPickField,
  onPickFilter,
}: Props) {
  const t = useTranslations();
  const fieldLabel = useFilterFieldLabel();
  const operatorLabel = useFilterOperatorLabel();

  const appliedPerField = new Map<string, number>();
  for (const filter of filters) appliedPerField.set(filter.field, (appliedPerField.get(filter.field) ?? 0) + 1);

  return (
    <>
      {filters.length > 0 && (
        <div className="shrink-0" data-palette-active-filters="">
          <div className={ZONE_LABEL_CLASS}>{t("Common.filters.palette.activeGroup")}</div>

          <div className="flex flex-wrap gap-1.5 px-2 pb-2">
            {filters.map((filter, index) => {
              const label = fieldLabel(filter.field, store.customColumns);
              const operator = operatorLabel(filter.operator as FilterOperatorKey);

              return (
                <ClickableChip
                  key={`${filter.field}-${index}`}
                  className="max-w-full text-primary-soft-foreground"
                  data-filter-index={index}
                  endContent={
                    <button
                      aria-label={t("Common.filters.palette.removeFilter")}
                      className="ml-0.5 opacity-50 transition-[opacity,transform] hover:opacity-100 active:scale-[0.97] motion-reduce:transition-none"
                      data-palette-remove-filter={index}
                      tabIndex={-1}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        store.removeFilterAt(index);
                      }}
                    >
                      <XIcon className="size-3" />
                    </button>
                  }
                  variant="default"
                  onClick={() => onPickFilter(index)}
                >
                  <span className="truncate text-[11px]">
                    <FilterChipValue
                      customColumns={store.customColumns}
                      filter={filter}
                      label={label}
                      operator={operator}
                    />
                  </span>
                </ClickableChip>
              );
            })}
          </div>
        </div>
      )}

      <CommandList className="max-h-none! overflow-visible">
        <CommandEmpty>{t("Common.inputs.emptyContent")}</CommandEmpty>

        <CommandGroup className={PALETTE_GROUP_CLASS} heading={t("Common.filters.palette.fieldsGroup")}>
          {store.filterableFields.map((field, index) => {
            const label = fieldLabel(field.field, store.customColumns);
            const applied = appliedPerField.get(field.field) ?? 0;

            return (
              <CommandItem
                key={field.field}
                className="data-[selected=true]:bg-selected"
                data-palette-field={field.field}
                disabled={isAtLimit}
                keywords={[label]}
                value={`${label} ${index}`}
                onSelect={() => onPickField(field.field)}
              >
                <span className="truncate">{label}</span>

                {applied > 0 && (
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />

                    {t("Common.filters.palette.appliedCount", { count: applied })}
                  </span>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </>
  );
});
