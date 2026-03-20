import type { GetResult } from "@/core/base/base-get.interactor";
import type { ReactElement } from "react";

import { useEffect, useMemo, useState } from "react";

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

interface UseAutocompleteItemsParams<T extends Identifiable> {
  items?: Iterable<T>;
  getItems?: (params: { searchTerm?: string }) => Promise<GetResult<T>>;
  input: string;
  filterFunction?: (item: T) => boolean;
  selectedKeys: string[];
  renderItem: (item: T) => ReactElement;
}

export function useAutocompleteItems<T extends Identifiable>({
  items,
  getItems,
  input,
  filterFunction,
  selectedKeys,
  renderItem,
}: UseAutocompleteItemsParams<T>) {
  const [fetchedItems, setFetchedItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedItemsData, setSelectedItemsData] = useState<Map<string, T>>(new Map());

  const itemsArray: T[] = useMemo(() => Array.from(items ?? []), [items]);

  function keyOf(item: T) {
    return "key" in item ? item.key : "value" in item ? item.value : item.id;
  }

  function textValueOfRenderedItem(item: T) {
    const rendered = renderItem(item);
    if (typeof rendered === "string") return rendered;
    const textFromProp = (rendered?.props as { textValue?: string })?.textValue;
    const textFromChildren = (rendered?.props?.children as string) ?? "";
    return textFromProp ?? textFromChildren;
  }

  const allItems = useMemo(() => {
    const selectedKeySet = new Set(selectedKeys);
    const itemsByKey = new Map<string, T>();

    function add(item: T) {
      const key = keyOf(item);
      if (!itemsByKey.has(key)) itemsByKey.set(key, item);
    }

    [...itemsArray, ...fetchedItems].forEach(add);

    selectedKeys.forEach((key) => {
      if (!itemsByKey.has(key)) {
        const selectedData = selectedItemsData.get(key);
        if (selectedData) itemsByKey.set(key, selectedData);
      }
    });

    return [...itemsByKey.values()].sort(
      (a, b) => Number(selectedKeySet.has(keyOf(b))) - Number(selectedKeySet.has(keyOf(a))),
    );
  }, [itemsArray, fetchedItems, selectedKeys, selectedItemsData]);

  const filteredItems = useMemo(() => {
    if (!filterFunction && !input) return allItems;
    const q = input?.toLowerCase();

    return allItems
      .filter((i) => !filterFunction || filterFunction(i))
      .map((i) => ({ i, t: textValueOfRenderedItem(i).toLowerCase() }))
      .filter(({ t }) => !q || t.includes(q))
      .sort(q ? (a, b) => Number(b.t.startsWith(q)) - Number(a.t.startsWith(q)) || a.t.localeCompare(b.t) : undefined)
      .map(({ i }) => i);
  }, [allItems, filterFunction, input, isLoading, renderItem]);

  useEffect(() => {
    if (!getItems) return;

    const timeoutId = setTimeout(() => {
      setIsLoading(true);
      void getItems({ searchTerm: input || undefined })
        .then((res) => setFetchedItems(res.items || []))
        .finally(() => setIsLoading(false));
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [input, getItems]);

  return {
    itemsArray,
    allItems,
    filteredItems,
    fetchedItems,
    isLoading,
    setIsLoading,
    setFetchedItems,
    selectedItemsData,
    setSelectedItemsData,
    keyOf,
  };
}
