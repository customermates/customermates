"use client";

import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { Filter } from "@/core/base/base-get.schema";
import type { FilterOperatorKey } from "@/core/base/base-query-builder";

import { XIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { FilterChipValue } from "@/components/data-view/filter-modal/filter-chip-display";
import { useFilterFieldLabel } from "@/components/entity-terminology/use-filter-field-label";
import { useFilterOperatorLabel } from "@/components/data-view/filter-modal/use-filter-operator-label";

const APPLIED_FILTER_CLASS =
  "mb-1 rounded-md border border-input py-2 data-[selected=true]:border-border-strong data-[selected=true]:bg-selected";

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
    <CommandList className="max-h-none! overflow-visible">
      <CommandEmpty>{t("Common.inputs.emptyContent")}</CommandEmpty>

      {filters.length > 0 && (
        <CommandGroup className={PALETTE_GROUP_CLASS} heading={t("Common.filters.palette.activeGroup")}>
          {filters.map((filter, index) => {
            const label = fieldLabel(filter.field, store.customColumns);
            const operator = operatorLabel(filter.operator as FilterOperatorKey);

            return (
              <CommandItem
                key={`${filter.field}-${index}`}
                className={APPLIED_FILTER_CLASS}
                data-filter-index={index}
                keywords={[label]}
                value={`${label} ${operator} ${index}`}
                onSelect={() => onPickFilter(index)}
              >
                <span className="min-w-0 flex-1 truncate">
                  <FilterChipValue
                    customColumns={store.customColumns}
                    filter={filter}
                    label={label}
                    operator={operator}
                  />
                </span>

                <Button
                  aria-label={t("Common.filters.palette.removeFilter")}
                  className="ml-auto size-5 shrink-0 text-muted-foreground hover:text-foreground"
                  data-palette-remove-filter={index}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                  onClick={(event) => {
                    event.stopPropagation();
                    store.removeFilterAt(index);
                  }}
                >
                  <XIcon aria-hidden className="size-3.5 text-current" />
                </Button>
              </CommandItem>
            );
          })}
        </CommandGroup>
      )}

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
  );
});
