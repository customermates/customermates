"use client";

import type { FilterTarget } from "./filter-target";

import { useEffect, useMemo } from "react";
import { comparer, reaction } from "mobx";
import { observer } from "mobx-react-lite";

import { useRootStore } from "@/core/stores/root-store.provider";
import { FilterPalette } from "./filter-palette";
import { FilterPaletteStore } from "./filter-palette.store";

export const FilterPaletteInline = observer(function FilterPaletteInline({
  store,
  id,
}: {
  store: FilterTarget;
  id?: string;
}) {
  const root = useRootStore();
  const palette = useMemo(() => new FilterPaletteStore(root, { register: false }), [root, store]);
  useEffect(() => {
    palette.setWithUnsavedChangesGuard(false);
    const dispose = reaction(
      () => [store.identity, store.scopeKey, store.isDisabled],
      () => palette.openFor(store),
      { equals: comparer.shallow, fireImmediately: true },
    );
    return () => {
      dispose();
      if (!store.discardPendingOnDispose) palette.flushPendingChanges();
      palette.dispose();
    };
  }, [palette, store]);
  return (
    <div
      className="min-w-0"
      data-filter-inline=""
      id={id}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) palette.flushPendingChanges();
      }}
      onKeyDownCapture={(event) => {
        if (event.key !== "Escape" || palette.pages.length <= 1 || !event.currentTarget.contains(event.target as Node))
          return;
        event.preventDefault();
        event.stopPropagation();
        palette.pop();
      }}
    >
      <FilterPalette inline palette={palette} store={store} />
    </div>
  );
});
