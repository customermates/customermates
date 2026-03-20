import type { AutocompleteProps } from "@heroui/autocomplete";
import type { Key } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";

import { Autocomplete } from "@heroui/autocomplete";
import { cn } from "@heroui/theme";
import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@heroui/button";

import { useXForm } from "../x-form";

import { useAutocompleteItems } from "./use-autocomplete-items";

import { XIcon } from "@/components/x-icon";

type Identifiable =
  | {
      id: string;
    }
  | {
      key: string;
    }
  | {
      value: string;
    };

export interface XAutocompleteProps<T extends Identifiable> extends AutocompleteProps<T> {
  id: string;
  value?: string | string[];
  selectionMode?: "single" | "multiple";
  children: (item: T) => React.ReactElement;
  items?: Iterable<T>;
  renderValue: (items: Array<{ key: string; data?: T }>) => React.ReactNode;
  getItems?: (params: { searchTerm?: string }) => Promise<GetResult<T>>;
  filterFunction?: (item: T) => boolean;
  showClearButtons?: boolean;
  onCreate?: (name: string) => Promise<T | null>;
}

export const XAutocomplete = observer(
  <T extends Identifiable>({
    id,
    label,
    selectionMode = "single",
    items,
    getItems,
    filterFunction,
    showClearButtons = true,
    onCreate,
    ...props
  }: XAutocompleteProps<T>) => {
    const t = useTranslations("Common.inputs");

    const [input, setInput] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const [, forceUpdate] = useState(0);

    const store = useXForm();
    const errorMessage = store?.getError(id);
    const value = props.value ?? (store?.getValue(id) as string | string[] | undefined);
    const selectedKeys = value === undefined ? [] : Array.isArray(value) ? value : [value];

    const {
      itemsArray,
      allItems,
      filteredItems,
      fetchedItems,
      isLoading,
      setIsLoading,
      setSelectedItemsData,
      setFetchedItems,
      selectedItemsData,
      keyOf,
    } = useAutocompleteItems({
      items,
      getItems,
      input,
      filterFunction,
      selectedKeys,
      renderItem: props.children,
    });

    const startContent = useMemo(() => {
      if (selectedKeys.length === 0) return undefined;

      const index = new Map(allItems.map((it) => [keyOf(it), it]));
      const list = selectedKeys.map((k) => ({ key: k, data: index.get(k) }));
      const itemsToRender = selectionMode === "multiple" ? list : list.slice(0, 1);

      const rendered = props.renderValue(itemsToRender);

      if (!showClearButtons || selectionMode !== "multiple") return rendered;

      if (!React.isValidElement(rendered) && !Array.isArray(rendered)) return rendered;

      const itemsArray = Array.isArray(rendered) ? rendered : [rendered];

      return itemsArray.map((item, index) => {
        if (!React.isValidElement(item)) return item;

        const itemKey = itemsToRender[index]?.key;
        if (!itemKey) return item;

        return React.cloneElement(item as React.ReactElement<{ endContent?: React.ReactNode }>, {
          endContent: (
            <Button
              isIconOnly
              className="ml-0.5 min-w-4 w-4 h-4"
              size="sm"
              variant="light"
              onPress={() => handleRemoveItem(itemKey)}
            >
              <XIcon icon={XMarkIcon} size="sm" />
            </Button>
          ),
        });
      });
    }, [selectedKeys, allItems, selectionMode, showClearButtons, props.renderValue]);

    const emptyContent = useMemo(() => {
      if (!input.trim()) return t("emptyContent");

      return (
        <button
          className="text-small font-normal w-full h-full flex"
          type="button"
          onClick={(e) => {
            e.preventDefault();
            addItem();
          }}
        >
          {`"${input.trim()}" ${t("add").toLowerCase()}`}
        </button>
      );
    }, [input, t, onCreate]);

    const defaultProps: AutocompleteProps<T> = {
      label: label === null ? undefined : (label ?? t(id)),
      variant: "bordered",
      placeholder: " ",
      isDisabled: store?.isDisabled,
      isInvalid: Boolean(errorMessage),
      listboxProps: {
        emptyContent: onCreate ? emptyContent : t("emptyContent"),
        classNames: {
          emptyContent: onCreate
            ? "text-small font-normal truncate border-default border-medium rounded-small"
            : undefined,
        },
        ...props.listboxProps,
      },
      errorMessage: (
        <ul>
          {[errorMessage].flat().map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      ),
      ...props,
    };

    useEffect(() => {
      const timer = setTimeout(
        () =>
          document.querySelectorAll<HTMLElement>('[role="listbox"] li[role="option"]').forEach((li) => {
            const key = li.getAttribute("data-key") || "";
            const svg = li.querySelector('span[aria-hidden="true"] svg');
            const polyline = svg?.querySelector("polyline");
            if (polyline) {
              polyline.style.strokeDashoffset = selectedKeys.includes(key) ? "44" : "66";
              forceUpdate((v) => v + 1);
            }
          }),
        200,
      );

      return () => clearTimeout(timer);
    }, [selectedKeys.length, isOpen, isLoading]);

    function onChange(next: string[] | string | undefined) {
      store?.onChange(id, next);
      setInput("");
    }

    function handleRemoveItem(itemKey: string) {
      if (selectionMode === "multiple") onChange(selectedKeys.filter((key) => key !== itemKey));
      else onChange(undefined);
    }

    function addItem() {
      if (!onCreate) return;

      setIsLoading(true);
      void onCreate(input.trim())
        .then((created) => {
          if (created) {
            const key = keyOf(created);
            setFetchedItems((prev) => [...prev, created]);
            setSelectedItemsData((prev) => new Map(prev).set(key, created));
            onSelectionChange(key);
          }
        })
        .finally(() => setIsLoading(false));
    }

    function onSelectionChange(key: Key | null) {
      if (key == null) return;

      const keyStr = String(key);
      const allAvailableItems = [...itemsArray, ...fetchedItems];
      let selectedItem = allAvailableItems.find((item) => keyOf(item) === keyStr);

      if (!selectedItem) selectedItem = selectedItemsData.get(keyStr) || undefined;

      if (selectedItem) setSelectedItemsData((prev) => new Map(prev).set(keyStr, selectedItem));

      if (selectionMode === "multiple") {
        const exists = selectedKeys.includes(keyStr);
        onChange(exists ? selectedKeys.filter((x) => x !== keyStr) : [...selectedKeys, keyStr]);
        return;
      }

      onChange(keyStr);
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
      if (onCreate && event.key === "Enter" && input && !filteredItems.length) {
        event.preventDefault();
        addItem();
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && !input && selectedKeys.length > 0) {
        const allowEmpty = props.allowsEmptyCollection ?? true;
        const wouldBecomeEmpty = selectionMode === "multiple" ? selectedKeys.length <= 1 : true;

        if (!allowEmpty && wouldBecomeEmpty) {
          event.preventDefault();
          return;
        }
        onChange(selectionMode === "multiple" ? selectedKeys.slice(0, -1) : undefined);
        event.preventDefault();
      }
    }

    return (
      <Autocomplete
        {...defaultProps}
        classNames={{
          ...defaultProps.classNames,
          endContentWrapper: cn("absolute top-[0.4px] right-3", defaultProps.classNames?.endContentWrapper),
        }}
        inputProps={{
          classNames: {
            ...defaultProps.inputProps?.classNames,
            label: cn(
              "mt-2.5 group-data-[filled-within=true]:translate-y-0 group-data-[filled-within=true]:mt-0",
              defaultProps.inputProps?.classNames?.label,
            ),
            inputWrapper: cn(
              "block",
              { "min-h-8": !selectedKeys.length, "h-auto": Boolean(selectedKeys.length) },
              defaultProps.inputProps?.classNames?.inputWrapper,
            ),
            innerWrapper: cn(
              "flex flex-wrap align-center h-auto max-w-[calc(100%-4rem)] text-small",
              {
                "mt-5": defaultProps.label != undefined,
                "my-2": defaultProps.label == undefined,
                "gap-2": selectionMode === "multiple",
              },
              defaultProps.inputProps?.classNames?.innerWrapper,
            ),
            input: cn(
              "h-6 px-0!",
              {
                "sr-only": !isOpen && !input,
              },
              defaultProps.inputProps?.classNames?.input,
            ),
          },
        }}
        inputValue={input}
        isLoading={isLoading}
        isVirtualized={false}
        items={filteredItems}
        selectedKey={null}
        startContent={startContent}
        onInputChange={setInput}
        onKeyDown={handleKeyDown}
        onOpenChange={setIsOpen}
        onSelectionChange={onSelectionChange}
      >
        {(item: T) => props.children(item)}
      </Autocomplete>
    );
  },
);
