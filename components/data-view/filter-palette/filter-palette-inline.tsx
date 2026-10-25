"use client";

import type { FilterTarget } from "./filter-target";

import { observer } from "mobx-react-lite";

import { FilterPalette } from "./filter-palette";
import { useFilterPalette } from "./use-filter-palette";

export const FilterPaletteInline = observer(function FilterPaletteInline({
  store,
  id,
}: {
  store: FilterTarget;
  id?: string;
}) {
  const palette = useFilterPalette(store, { inline: true });
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
