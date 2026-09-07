"use client";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter } from "@/core/base/base-get.schema";
import type { FilterSelectItem } from "@/components/data-view/filter-modal/inputs/use-filter-select-items";

import { CheckIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { Button } from "@/components/ui/button";
import { CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { SelectionOptionsSkeleton } from "@/components/forms/selection-loading";
import { useDebouncedValue } from "@/core/utils/use-debounced-value";
import { useFilterSelectItems } from "@/components/data-view/filter-modal/inputs/use-filter-select-items";
import { cn } from "@/core/utils/cn";

type OptionResult = {
  key: string;
  resolver: unknown;
  status: "success" | "error";
  items: FilterSelectItem[];
};

type Props = {
  filter: Filter;
  customColumns: CustomColumnDto[] | undefined;
  selected: string[];
  query: string;
  onToggle: (key: string, maxSelectedValues: number | undefined) => void;
};

export const PaletteValueSelect = observer(function PaletteValueSelect({
  filter,
  customColumns,
  selected,
  query,
  onToggle,
}: Props) {
  const t = useTranslations();
  const { items, getItems, isLoading, maxSelectedValues, retrySelection, scopeKey } = useFilterSelectItems(
    filter,
    customColumns,
  );

  const [optionResult, setOptionResult] = useState<OptionResult | null>(null);
  const [optionAttempt, setOptionAttempt] = useState(0);
  const debouncedQuery = useDebouncedValue(query);

  const optionRequestKey = getItems ? JSON.stringify([scopeKey, debouncedQuery, optionAttempt]) : null;
  const matchingResult =
    optionResult?.key === optionRequestKey && optionResult.resolver === getItems ? optionResult : null;
  const asyncLoading = optionRequestKey !== null && (query !== debouncedQuery || matchingResult === null);
  const optionError = matchingResult?.status === "error";
  const fetchedItems = getItems ? (matchingResult?.items ?? []) : items;

  useEffect(() => {
    if (!getItems || optionRequestKey === null) return;

    let active = true;
    const [, searchTerm] = JSON.parse(optionRequestKey) as [string, string, number];

    void getItems({ searchTerm: searchTerm || undefined })
      .then((result) => {
        if (active)
          setOptionResult({ key: optionRequestKey, resolver: getItems, status: "success", items: result.items || [] });
      })
      .catch(() => {
        if (active) {
          setOptionResult((previous) => ({
            key: optionRequestKey,
            resolver: getItems,
            status: "error",
            items: previous?.resolver === getItems ? previous.items : [],
          }));
        }
      });

    return () => {
      active = false;
    };
  }, [getItems, optionRequestKey]);

  const filteredItems = useMemo(() => {
    if (getItems) return fetchedItems;

    const needle = query.trim().toLowerCase();
    if (!needle) return fetchedItems;

    return fetchedItems.filter((item) => item.textValue.toLowerCase().includes(needle));
  }, [fetchedItems, getItems, query]);

  const loading = isLoading || asyncLoading;
  const selectionLimitReached = maxSelectedValues !== undefined && selected.length >= maxSelectedValues;

  return (
    <>
      <CommandList aria-busy={loading || undefined} className="max-h-none! overflow-visible">
        {loading && <SelectionOptionsSkeleton label={t("Loading.text")} />}

        {!loading && optionError && (
          <div className="flex flex-col items-center gap-2 px-3 py-4 text-center text-sm" role="alert">
            <span className="text-muted-foreground">{t("Common.notifications.unexpectedError")}</span>

            <Button
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => {
                setOptionAttempt((attempt) => attempt + 1);
                retrySelection();
              }}
            >
              {t("ErrorCard.retry")}
            </Button>
          </div>
        )}

        {!loading && !optionError && filteredItems.length === 0 && (
          <CommandEmpty>{t("Common.inputs.emptyContent")}</CommandEmpty>
        )}

        {!loading && !optionError && filteredItems.length > 0 && (
          <CommandGroup>
            {filteredItems.map((item) => {
              const isSelected = selected.includes(item.key);

              return (
                <CommandItem
                  key={item.key}
                  className={cn(isSelected && "bg-accent")}
                  data-palette-selected={isSelected}
                  data-palette-value={item.key}
                  disabled={!isSelected && selectionLimitReached}
                  keywords={[item.textValue]}
                  value={item.key}
                  onSelect={() => onToggle(item.key, maxSelectedValues)}
                >
                  {item.startContent}

                  {item.color ? (
                    <AppChip variant={item.color}>{item.textValue}</AppChip>
                  ) : (
                    <span className="truncate">{item.textValue}</span>
                  )}

                  {isSelected && <CheckIcon className="ml-auto size-3.5" />}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>

      {selectionLimitReached && maxSelectedValues !== undefined && (
        <p aria-live="polite" className="shrink-0 px-3 py-2 text-xs text-muted-foreground" role="status">
          {t("Common.filters.selectionLimit", { count: maxSelectedValues })}
        </p>
      )}
    </>
  );
});
