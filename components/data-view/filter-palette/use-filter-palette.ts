"use client";

import { reaction, comparer } from "mobx";
import { useEffect, useMemo } from "react";
import { useRootStore } from "@/core/stores/root-store.provider";
import { FilterPaletteStore } from "./filter-palette.store";
import type { FilterTarget } from "./filter-target";

export function useFilterPalette(target: FilterTarget, { inline = false }: { inline?: boolean } = {}) {
  const root = useRootStore();
  const palette = useMemo(() => new FilterPaletteStore(root, { register: false }), [root, target]);
  useEffect(() => {
    if (inline) palette.setWithUnsavedChangesGuard(false);
    else root.registerModalStore(palette);
    const disposeReaction = reaction(
      () => [target.identity, target.scopeKey, target.isDisabled],
      () => (inline ? palette.openFor(target) : palette.dispose()),
      { equals: comparer.shallow, fireImmediately: inline },
    );
    return () => {
      disposeReaction();
      if (!target.discardPendingOnDispose) palette.flushPendingChanges();
      palette.dispose();
      if (!inline) root.unregisterModalStore(palette);
    };
  }, [root, palette, target, inline]);
  return palette;
}
