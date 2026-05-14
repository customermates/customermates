"use client";

import type { Filter } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ChevronsUpDownIcon, XIcon } from "lucide-react";

import { useFilterSelectItems } from "./use-filter-select-items";

import { AppChip } from "@/components/chip/app-chip";
import { useAppForm } from "@/components/forms/form-context";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  customColumns?: CustomColumnDto[];
  filter: Filter;
  id: string;
  isValidFilter: boolean;
};

export const FilterInputSelect = observer(({ customColumns, filter, id, isValidFilter }: Props) => {
  const store = useAppForm();
  const tAuto = useTranslations("Common.inputs.autocomplete");
  const tTable = useTranslations("Common.table");
  const { items, getItems, isLoading } = useFilterSelectItems(filter, customColumns);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [fetchedItems, setFetchedItems] = useState(items);
  const [asyncLoading, setAsyncLoading] = useState(false);

  const raw = store?.getValue(id);
  const selectedKeys: string[] = Array.isArray(raw) ? (raw as string[]) : [];

  // Debounced async fetch when getItems is provided.
  useEffect(() => {
    if (!getItems) {
      setFetchedItems(items);
      return;
    }

    const timer = setTimeout(() => {
      setAsyncLoading(true);
      void getItems({ searchTerm: input || undefined })
        .then((res) => setFetchedItems(res.items || []))
        .finally(() => setAsyncLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [input, getItems, items]);

  // Index selected items so chips render even when not present in current page.
  const itemsByKey = useMemo(() => {
    const map = new Map<string, (typeof items)[number]>();
    for (const it of items) map.set(it.key, it);
    for (const it of fetchedItems) if (!map.has(it.key)) map.set(it.key, it);
    return map;
  }, [items, fetchedItems]);

  const filteredItems = useMemo(() => {
    if (getItems) return fetchedItems; // server-side search already applied
    const q = input.trim().toLowerCase();
    if (!q) return fetchedItems;
    return fetchedItems.filter((it) => it.textValue.toLowerCase().includes(q));
  }, [fetchedItems, input, getItems]);

  function commit(next: string[] | undefined) {
    store?.onChange(id, next && next.length === 0 ? undefined : next);
    setInput("");
  }

  function toggle(key: string) {
    const exists = selectedKeys.includes(key);
    commit(exists ? selectedKeys.filter((k) => k !== key) : [...selectedKeys, key]);
  }

  function removeKey(key: string) {
    commit(selectedKeys.filter((k) => k !== key));
  }

  const loading = isLoading || asyncLoading;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className={cn(
            "h-auto min-h-9 w-full justify-between py-1.5 font-normal",
            !selectedKeys.length && "text-muted-foreground",
            isValidFilter ? "border-primary bg-primary/10" : "border-input",
          )}
          disabled={store?.isDisabled}
          id={id}
          role="combobox"
          type="button"
          variant="outline"
        >
          <span className="flex flex-wrap items-center gap-1 text-left">
            {selectedKeys.length > 0 ? (
              selectedKeys.map((k) => {
                const item = itemsByKey.get(k);
                return (
                  <AppChip
                    key={k}
                    endContent={
                      <span
                        aria-label="Remove"
                        className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
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
                    {item?.textValue ?? k}
                  </AppChip>
                );
              })
            ) : (
              <span className="text-muted-foreground">{tAuto("placeholder")}</span>
            )}
          </span>

          <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder={tTable("search")} value={input} onValueChange={setInput} />

          <CommandList>
            {loading && <div className="py-3 text-center text-sm text-muted-foreground">{tAuto("loading")}</div>}

            {!loading && filteredItems.length === 0 && <CommandEmpty>{tAuto("noResults")}</CommandEmpty>}

            {filteredItems.length > 0 && (
              <CommandGroup>
                {filteredItems.map((item) => {
                  const selected = selectedKeys.includes(item.key);
                  return (
                    <CommandItem
                      key={item.key}
                      className={cn(selected && "bg-accent")}
                      data-selected={selected}
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
      </PopoverContent>
    </Popover>
  );
});
