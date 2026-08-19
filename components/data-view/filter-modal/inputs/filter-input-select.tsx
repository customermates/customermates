"use client";

import type { Filter } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ChevronsUpDownIcon, XIcon } from "lucide-react";

import { useFilterSelectItems } from "./use-filter-select-items";
import { nextFilterSelection } from "./filter-selection";

import { AppChip } from "@/components/chip/app-chip";
import { useAppForm } from "@/components/forms/form-context";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebouncedValue } from "@/core/utils/use-debounced-value";
import { cn } from "@/core/utils/cn";
import { SelectionOptionsSkeleton, SelectionValueSkeleton } from "@/components/forms/selection-loading";

type Props = {
  customColumns?: CustomColumnDto[];
  filter: Filter;
  id: string;
  isValidFilter: boolean;
  onValueChange?: (value: string[] | undefined) => void;
};

export const FilterInputSelect = observer(({ customColumns, filter, id, isValidFilter, onValueChange }: Props) => {
  const t = useTranslations();
  const store = useAppForm();
  const { items, getItems, isLoading, maxSelectedValues, retrySelection, scopeKey, selectionError } =
    useFilterSelectItems(filter, customColumns);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [optionResult, setOptionResult] = useState<{
    key: string;
    resolver: typeof getItems;
    status: "success" | "error";
    items: typeof items;
  } | null>(null);
  const [optionAttempt, setOptionAttempt] = useState(0);
  const debouncedInput = useDebouncedValue(input);

  const raw = store?.getValue(id);
  const selectedKeys: string[] = Array.isArray(raw) ? (raw as string[]) : [];
  const isDisabled = store?.isDisabled ?? false;
  const selectionLimitReached = maxSelectedValues !== undefined && selectedKeys.length >= maxSelectedValues;

  const optionRequestKey = open && getItems ? JSON.stringify([scopeKey, debouncedInput, optionAttempt]) : null;
  const asyncLoading =
    optionRequestKey !== null &&
    (input !== debouncedInput || optionResult?.key !== optionRequestKey || optionResult.resolver !== getItems);
  const matchingOptionResult =
    optionResult?.key === optionRequestKey && optionResult.resolver === getItems ? optionResult : null;
  const optionError = matchingOptionResult?.status === "error";
  const fetchedItems = getItems ? (matchingOptionResult?.items ?? []) : items;

  useEffect(() => {
    if (!getItems || optionRequestKey === null) return;

    let active = true;

    const [, searchTerm] = JSON.parse(optionRequestKey) as [string, string, number];
    void getItems({ searchTerm: searchTerm || undefined })
      .then((res) => {
        if (active) {
          setOptionResult({
            key: optionRequestKey,
            resolver: getItems,
            status: "success",
            items: res.items || [],
          });
        }
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

  const itemsByKey = useMemo(() => {
    const map = new Map<string, (typeof items)[number]>();
    for (const it of items) map.set(it.key, it);
    for (const it of fetchedItems) if (!map.has(it.key)) map.set(it.key, it);
    return map;
  }, [items, fetchedItems]);

  const filteredItems = useMemo(() => {
    if (getItems) return fetchedItems;
    const q = input.trim().toLowerCase();
    if (!q) return fetchedItems;
    return fetchedItems.filter((it) => it.textValue.toLowerCase().includes(q));
  }, [fetchedItems, input, getItems]);

  function commit(next: string[] | undefined) {
    const value = next && next.length === 0 ? undefined : next;
    store?.onChange(id, value);
    store?.flushPendingChanges?.();
    onValueChange?.(value);
    setInput("");
  }

  function toggle(key: string) {
    const next = nextFilterSelection(selectedKeys, key, maxSelectedValues);
    if (next === selectedKeys) return;
    commit(next);
  }

  function removeKey(key: string) {
    commit(selectedKeys.filter((k) => k !== key));
  }

  const loading = isLoading || asyncLoading;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && selectionError) retrySelection();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          aria-busy={loading || undefined}
          aria-expanded={open}
          className={cn(
            "h-auto min-h-9 w-full justify-between py-1.5 font-normal",
            !selectedKeys.length && "text-muted-foreground",
            isValidFilter ? "border-primary bg-primary/10" : "border-input",
          )}
          disabled={isDisabled}
          id={id}
          role="combobox"
          type="button"
          variant="field"
        >
          <span className="flex flex-wrap items-center gap-1 text-left">
            {selectedKeys.length > 0 ? (
              selectedKeys.map((k) => {
                const item = itemsByKey.get(k);
                const itemPending = item === undefined && loading;
                return (
                  <AppChip
                    key={k}
                    data-selection-state={item ? "resolved" : itemPending ? "loading" : "unavailable"}
                    endContent={
                      <span
                        aria-label={`${t("Common.actions.remove")} ${item?.textValue ?? t("Common.inputs.unavailableSelection")}`}
                        className="ml-0.5 opacity-50 transition-[opacity,transform] hover:opacity-100 active:scale-[0.97] motion-reduce:transition-none"
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeKey(k);
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          e.stopPropagation();
                          removeKey(k);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <XIcon className="size-3" />
                      </span>
                    }
                    startContent={item?.startContent}
                    variant={item?.color ?? "secondary"}
                  >
                    {item ? (
                      item.textValue
                    ) : itemPending ? (
                      <SelectionValueSkeleton />
                    ) : (
                      t("Common.inputs.unavailableSelection")
                    )}
                  </AppChip>
                );
              })
            ) : (
              <span className="text-muted-foreground">{t("Common.ariaLabels.selectOption")}</span>
            )}
          </span>

          <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder={t("Common.table.search")} value={input} onValueChange={setInput} />

          <CommandList aria-busy={asyncLoading || undefined}>
            {asyncLoading && <SelectionOptionsSkeleton label={t("Loading.text")} />}

            {!asyncLoading && optionError && (
              <div className="flex flex-col items-center gap-2 px-3 py-4 text-center text-sm" role="alert">
                <span className="text-muted-foreground">{t("Common.notifications.unexpectedError")}</span>

                <Button
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => setOptionAttempt((value) => value + 1)}
                >
                  {t("ErrorCard.retry")}
                </Button>
              </div>
            )}

            {!asyncLoading && !optionError && filteredItems.length === 0 && (
              <CommandEmpty>{t("Common.inputs.emptyContent")}</CommandEmpty>
            )}

            {!asyncLoading && !optionError && filteredItems.length > 0 && (
              <CommandGroup>
                {filteredItems.map((item) => {
                  const selected = selectedKeys.includes(item.key);
                  const optionDisabledByLimit = !selected && selectionLimitReached;
                  return (
                    <CommandItem
                      key={item.key}
                      className={cn(selected && "bg-accent")}
                      data-selected={selected}
                      disabled={isDisabled || optionDisabledByLimit}
                      value={item.key}
                      onSelect={() => toggle(item.key)}
                    >
                      {item.startContent}

                      {item.color ? (
                        <AppChip variant={item.color}>{item.textValue}</AppChip>
                      ) : (
                        <span>{item.textValue}</span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>

        {selectionLimitReached && maxSelectedValues !== undefined && (
          <p aria-live="polite" className="border-t px-3 py-2 text-xs text-muted-foreground" role="status">
            {t("Common.filters.selectionLimit", { count: maxSelectedValues })}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
});
