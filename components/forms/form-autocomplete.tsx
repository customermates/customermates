"use client";

import type { ReactElement, ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";

import React, { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ChevronsUpDownIcon, XIcon } from "lucide-react";

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { AppChip } from "@/components/chip/app-chip";
import { useNavigateToHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { useDebouncedValue } from "@/core/utils/use-debounced-value";
import { FormLabel } from "./form-label";
import { cn } from "@/core/utils/cn";

import { useAppForm } from "./form-context";
import { useFormFieldErrors, useResolvedFieldLabel } from "./use-form-field";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { SelectionOptionsSkeleton, SelectionValueSkeleton } from "./selection-loading";

type Identifiable = { id: string } | { key: string } | { value: string };

type Props<T extends Identifiable> = {
  id: string;
  label?: string | null;
  labelEndAddon?: ReactNode;
  placeholder?: string;
  required?: boolean;
  selectionMode?: "single" | "multiple";
  value?: string | string[];
  items?: Iterable<T>;
  getItems?: (params: { searchTerm?: string }) => Promise<GetResult<T>>;
  filterFunction?: (item: T) => boolean;
  children: (item: T) => ReactElement;
  renderValue: (items: Array<{ key: string; data?: T }>) => ReactNode;
  onCreate?: (name: string) => Promise<{ ok: true; data: T } | { ok: false; error: unknown }>;
  onChipClick?: (key: string) => void;
  emptyContent?: ReactNode;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  containerClassName?: string;
  popoverFitContent?: boolean;
  chipHref?: (key: string) => string | undefined;
};

function keyOf<T extends Identifiable>(item: T): string {
  if ("key" in item) return item.key;
  if ("value" in item) return item.value;
  return item.id;
}

function textOf(rendered: ReactElement<{ textValue?: string; children?: ReactNode }>): string {
  const textFromProp = rendered?.props?.textValue;
  if (textFromProp) return textFromProp;
  const children = rendered?.props?.children;
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  return "";
}

export const FormAutocomplete = observer(
  <T extends Identifiable>({
    id,
    label,
    labelEndAddon,
    placeholder,
    required,
    selectionMode = "single",
    value: controlledValue,
    items,
    getItems,
    filterFunction,
    children,
    renderValue,
    onCreate,
    onChipClick,
    emptyContent,
    disabled,
    readOnly,
    className,
    containerClassName,
    popoverFitContent = false,
    chipHref,
  }: Props<T>) => {
    const store = useAppForm();
    const navigateToHref = useNavigateToHref();
    const t = useTranslations();
    const resolvedPlaceholder = placeholder ?? t("Common.ariaLabels.selectOption");
    const resolvedEmptyContent = emptyContent ?? t("Common.inputs.emptyContent");
    const resolvedLabel = useResolvedFieldLabel(id, label);
    const [open, setOpen] = useState(false);
    const [input, setInput] = useState("");
    const [optionResult, setOptionResult] = useState<{
      key: string;
      resolver: Props<T>["getItems"];
      status: "success" | "error";
      items: T[];
    } | null>(null);
    const [optionAttempt, setOptionAttempt] = useState(0);
    const [isCreating, setIsCreating] = useState(false);
    const [selectedData, setSelectedData] = useState<Map<string, T>>(new Map());
    const debouncedInput = useDebouncedValue(input);

    const raw = controlledValue ?? (store?.getValue(id) as string | string[] | undefined);
    const selectedKeys = (raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]).filter(Boolean);

    const { hasError } = useFormFieldErrors(id);
    const isReadOnly = readOnly ?? store?.isReadOnly ?? false;
    const isDisabled = (disabled ?? store?.isLoading) || false;

    const itemsArray: T[] = useMemo(() => Array.from(items ?? []), [items]);
    const optionRequestKey = open && getItems ? JSON.stringify([debouncedInput, optionAttempt]) : null;
    const isOptionsLoading =
      optionRequestKey !== null &&
      (input !== debouncedInput || optionResult?.key !== optionRequestKey || optionResult.resolver !== getItems);
    const matchingOptionResult =
      optionResult?.key === optionRequestKey && optionResult.resolver === getItems ? optionResult : null;
    const optionError = matchingOptionResult?.status === "error";
    const fetchedItems = matchingOptionResult?.items ?? [];

    useEffect(() => {
      if (!getItems || optionRequestKey === null) return;
      let active = true;

      const [searchTerm] = JSON.parse(optionRequestKey) as [string, number];
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

    const allItems = useMemo(() => {
      const byKey = new Map<string, T>();
      for (const it of itemsArray) byKey.set(keyOf(it), it);
      for (const it of fetchedItems) if (!byKey.has(keyOf(it))) byKey.set(keyOf(it), it);
      for (const k of selectedKeys) {
        if (!byKey.has(k)) {
          const d = selectedData.get(k);
          if (d) byKey.set(k, d);
        }
      }
      return Array.from(byKey.values());
    }, [itemsArray, fetchedItems, selectedKeys, selectedData]);

    const filteredItems = useMemo(() => {
      const q = input.trim().toLowerCase();
      return allItems
        .filter((it) => (filterFunction ? filterFunction(it) : true))
        .filter((it) => {
          if (!q) return true;
          return textOf(children(it)).toLowerCase().includes(q);
        });
    }, [allItems, filterFunction, input, children]);

    function commit(next: string[] | string | undefined) {
      if (store) store.onChange(id, next);
      setInput("");
    }

    function toggleKey(nextKey: string) {
      const all = [...itemsArray, ...fetchedItems];
      const found = all.find((it) => keyOf(it) === nextKey);
      if (found) setSelectedData((prev) => new Map(prev).set(nextKey, found));

      if (selectionMode === "multiple") {
        const exists = selectedKeys.includes(nextKey);
        commit(exists ? selectedKeys.filter((k) => k !== nextKey) : [...selectedKeys, nextKey]);
      } else {
        commit(nextKey);
        setOpen(false);
      }
    }

    function handleRemove(k: string) {
      if (selectionMode === "multiple") commit(selectedKeys.filter((x) => x !== k));
      else commit(undefined);
    }

    async function handleCreate() {
      if (!onCreate || isCreating || isOptionsLoading || optionError) return;
      const name = input.trim();
      if (!name) return;
      setIsCreating(true);
      try {
        const res = await onCreate(name);
        if (!res.ok) {
          toastZodErrorTree(res.error);
          return;
        }

        const created = res.data;
        const k = keyOf(created);
        setOptionResult((prev) => ({
          key: prev?.key ?? input,
          resolver: getItems,
          status: "success",
          items: [...(prev?.items ?? []), created],
        }));
        setSelectedData((prev) => new Map(prev).set(k, created));
        toggleKey(k);
      } finally {
        setIsCreating(false);
      }
    }

    const renderedSelection = useMemo(() => {
      if (selectedKeys.length === 0) return null;
      const index = new Map(allItems.map((it) => [keyOf(it), it]));
      const list = selectedKeys.map((k) => ({ key: k, data: index.get(k) }));
      const toRender = selectionMode === "multiple" ? list : list.slice(0, 1);
      const rendered = renderValue(toRender);
      const isMulti = selectionMode === "multiple";
      const renderedItems = Array.isArray(rendered) ? rendered : [rendered];
      return toRender.map((entry, index) => {
        const el = entry.data ? (
          renderedItems[index]
        ) : (
          <AppChip data-selection-state={isOptionsLoading ? "loading" : "unavailable"}>
            {isOptionsLoading ? <SelectionValueSkeleton /> : t("Common.inputs.unavailableSelection")}
          </AppChip>
        );
        if (!React.isValidElement(el)) return el;

        const itemKey = entry.key;

        const withClose =
          isMulti && !isReadOnly
            ? React.cloneElement(el as React.ReactElement<{ endContent?: React.ReactNode }>, {
                endContent: (
                  <span
                    data-remove-selection
                    aria-label={t("Common.actions.remove")}
                    className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground transition-[color,transform] hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer active:scale-[0.97] motion-reduce:transition-none"
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleRemove(itemKey);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRemove(itemKey);
                      }
                    }}
                  >
                    <XIcon className="size-3" />
                  </span>
                ),
              })
            : el;

        const href = chipHref?.(itemKey);

        if (!onChipClick && !href) {
          return (
            <span key={itemKey} className="inline-flex min-w-0 max-w-full">
              {withClose}
            </span>
          );
        }

        if (href) {
          return (
            <a
              key={itemKey}
              className="relative inline-flex min-w-0 max-w-full cursor-pointer"
              href={href}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("[data-remove-selection]")) {
                  e.preventDefault();
                  return;
                }
                e.stopPropagation();
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                e.preventDefault();
                if (onChipClick) onChipClick(itemKey);
                else navigateToHref(href);
              }}
            >
              {withClose}
            </a>
          );
        }

        return (
          <span
            key={itemKey}
            className="relative inline-flex min-w-0 max-w-full cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("[data-remove-selection]")) return;
              e.stopPropagation();
              onChipClick?.(itemKey);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") onChipClick?.(itemKey);
            }}
          >
            {withClose}
          </span>
        );
      });
    }, [selectedKeys, allItems, selectionMode, renderValue, onChipClick, isReadOnly, isOptionsLoading, t]);

    const showCreate =
      Boolean(onCreate) &&
      Boolean(input.trim()) &&
      filteredItems.length === 0 &&
      !isOptionsLoading &&
      !isCreating &&
      !optionError;

    return (
      <div className={cn("space-y-1.5", containerClassName)}>
        {resolvedLabel && (
          <div className="flex items-center gap-1.5">
            <FormLabel htmlFor={id}>
              {resolvedLabel}

              {required ? <span className="text-destructive"> *</span> : null}
            </FormLabel>

            {labelEndAddon}
          </div>
        )}

        <Popover modal open={isReadOnly ? false : open} onOpenChange={isReadOnly ? undefined : setOpen}>
          <PopoverTrigger asChild>
            <Button
              aria-busy={isOptionsLoading || undefined}
              aria-expanded={open}
              aria-invalid={hasError}
              aria-readonly={isReadOnly || undefined}
              className={cn(
                "w-full justify-between font-normal h-auto min-h-9 px-3 py-1.5",
                !selectedKeys.length && "text-muted-foreground",
                isReadOnly && "cursor-default hover:bg-input-background hover:text-foreground",
                className,
              )}
              disabled={isDisabled}
              id={id}
              role="combobox"
              type="button"
              variant="outline"
            >
              <span className="flex flex-wrap items-center gap-1 text-left flex-1 min-w-0">
                {selectedKeys.length ? renderedSelection : resolvedPlaceholder}
              </span>

              {!isReadOnly && <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />}
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            className={cn(
              "p-0",
              popoverFitContent
                ? "min-w-(--radix-popover-trigger-width) max-w-(--radix-popover-content-available-width) w-max"
                : "w-(--radix-popover-trigger-width)",
            )}
          >
            <Command shouldFilter={false}>
              <CommandInput
                autoFocus
                disabled={isCreating}
                placeholder={t("Common.table.search")}
                value={input}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && showCreate) {
                    e.preventDefault();
                    void handleCreate();
                  }
                }}
                onValueChange={setInput}
              />

              <CommandList aria-busy={isOptionsLoading || isCreating || undefined}>
                {(isOptionsLoading || isCreating) && <SelectionOptionsSkeleton label={t("Loading.text")} />}

                {!isOptionsLoading && !isCreating && optionError && (
                  <div className="flex flex-col items-center gap-2 px-3 py-4 text-center text-sm" role="alert">
                    <span className="text-muted-foreground">{t("Common.notifications.unexpectedError")}</span>

                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => setOptionAttempt((value) => value + 1)}
                    >
                      {t("ErrorCard.retry")}
                    </Button>
                  </div>
                )}

                {!isOptionsLoading && !isCreating && !optionError && filteredItems.length === 0 && !showCreate && (
                  <CommandEmpty>{resolvedEmptyContent}</CommandEmpty>
                )}

                {showCreate && (
                  <CommandGroup>
                    <CommandItem value={`__create__${input}`} onSelect={() => void handleCreate()}>
                      {t("Common.inputs.addOption", { value: input.trim() })}
                    </CommandItem>
                  </CommandGroup>
                )}

                {!isOptionsLoading && !optionError && filteredItems.length > 0 && (
                  <CommandGroup>
                    {filteredItems.map((item) => {
                      const k = keyOf(item);
                      const rendered = children(item);
                      const selected = selectedKeys.includes(k);
                      return (
                        <CommandItem
                          key={k}
                          className={cn(selected && "bg-accent")}
                          data-selected={selected}
                          value={k}
                          onSelect={() => toggleKey(k)}
                        >
                          {rendered}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    );
  },
);
