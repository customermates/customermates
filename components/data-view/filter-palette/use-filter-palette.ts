"use client";

import { reaction, comparer } from "mobx";
import { useEffect, useMemo } from "react";
import { useRootStore } from "@/core/stores/root-store.provider";
import { FilterPaletteStore } from "./filter-palette.store";
import type { FilterTarget } from "./filter-target";

export function useFilterPalette(target: FilterTarget) {
  const root = useRootStore();
  const palette = useMemo(() => new FilterPaletteStore(root, { register: false }), [root, target]);
  useEffect(() => {
    root.registerModalStore(palette);
    const disposeReaction = reaction(
      () => [target.identity, target.scopeKey, target.isDisabled],
      () => palette.dispose(),
      { equals: comparer.shallow },
    );
    return () => {
      disposeReaction();
      if (!target.discardPendingOnDispose) palette.flushPendingChanges();
      palette.dispose();
      root.unregisterModalStore(palette);
    };
  }, [root, palette, target]);
  return palette;
}
