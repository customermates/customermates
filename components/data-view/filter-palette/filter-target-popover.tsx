"use client";

import type { FilterPaletteSearch, FilterTarget } from "./filter-target";
import type { ComponentProps, ReactNode } from "react";

import { useEffect, useRef } from "react";
import { Filter } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useFilterPalette } from "./use-filter-palette";

import { Button } from "@/components/ui/button";
import { FilterPalette } from "@/components/data-view/filter-palette/filter-palette";
import { MAX_APPLIED_FILTERS } from "@/components/data-view/filter-palette/filter-palette.store";
import { ResponsiveOverlay } from "@/components/modal";
import { runUserAction } from "@/core/errors/report-application-error";
import { useFilterFieldLabel } from "@/components/data-view/use-filter-field-label";

type Props = {
  store: FilterTarget;
  search?: FilterPaletteSearch;
  registerOpener?: (open: () => void) => () => void;
  headerAction?: (close: () => void) => ReactNode;
  onCloseAutoFocus?: ComponentProps<typeof ResponsiveOverlay>["onCloseAutoFocus"];
  compact?: boolean;
  id?: string;
};

export const FilterTargetPopover = observer(function FilterTargetPopover({
  store,
  search,
  registerOpener,
  compact,
  id,
  headerAction,
  onCloseAutoFocus,
}: Props) {
  const t = useTranslations();
  const palette = useFilterPalette(store);

  useEffect(() => registerOpener?.(() => palette.openFor(store)), [registerOpener, palette, store]);
  const contentRef = useRef<HTMLDivElement>(null);
  const filterFieldLabel = useFilterFieldLabel();

  if (store.filterableFields.length === 0 && !store.filters?.length && !store.groups?.length && !search) return null;

  const activeFilterCount = (store.filters?.length ?? 0) + (store.groups?.length ?? 0) + (search?.term ? 1 : 0);
  const isOpen = palette.isOpen && palette.target === store;
  const page = palette.page;
  const title =
    isOpen && page.kind !== "root"
      ? filterFieldLabel(page.field, palette.activeTarget?.filterColumns)
      : (palette.activeGroup?.label ?? t("Common.filters.palette.title"));

  function commitFocusedInput() {
    contentRef.current?.querySelector<HTMLElement>(":focus")?.blur();
  }

  function handleClose() {
    commitFocusedInput();
    palette.close();
  }

  function handleOpenChange(open: boolean) {
    if (open) palette.openFor(store);
    else handleClose();
  }

  function handleEscapeKeyDown(event: KeyboardEvent) {
    if (palette.pages.length === 1) return;

    event.preventDefault();
    commitFocusedInput();
    palette.pop();
  }

  function handleClear() {
    search?.apply(undefined);
    runUserAction(() => palette.clearFilters());
  }

  const trigger = compact ? (
    <Button
      aria-label={t("Common.ariaLabels.tooltipFilters")}
      className="relative text-muted-foreground"
      disabled={store.isDisabled}
      id={id}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <Filter className="size-3.5" />

      {activeFilterCount > 0 && (
        <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" />
      )}
    </Button>
  ) : (
    <Button
      aria-label={t("Common.ariaLabels.tooltipFilters")}
      className="h-8"
      disabled={store.isDisabled}
      id={id}
      size="sm"
      type="button"
      variant="secondary"
    >
      <Filter className="size-3.5" />

      <span className="hidden sm:inline">{t("Common.filters.palette.trigger")}</span>

      {activeFilterCount > 0 && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-primary/15 px-1.5 text-[11px] font-medium text-primary-soft-foreground tabular-nums">
          {activeFilterCount}
        </span>
      )}
    </Button>
  );

  const footer = (
    <>
      {palette.isAtFilterLimit && (
        <p aria-live="polite" className="mr-auto text-xs text-muted-foreground" role="status">
          {t("Common.filters.palette.limitReached", {
            count: palette.activeTarget?.maxFilters ?? MAX_APPLIED_FILTERS,
          })}
        </p>
      )}

      <Button
        className="h-8"
        disabled={
          palette.isDisabled ||
          (palette.appliedFilters.length === 0 && !palette.activeTarget?.groups?.length && !search?.term)
        }
        size="sm"
        type="button"
        variant="secondary"
        onClick={handleClear}
      >
        {t("Common.actions.clear")}
      </Button>
    </>
  );

  const overlay = (
    <ResponsiveOverlay
      align="end"
      footer={footer}
      headerAction={headerAction?.(handleClose)}
      open={isOpen}
      popoverClassName="w-[min(22rem,var(--radix-popover-content-available-width))]"
      title={title}
      trigger={trigger}
      onCloseAutoFocus={onCloseAutoFocus}
      onEscapeKeyDown={handleEscapeKeyDown}
      onOpenChange={handleOpenChange}
    >
      <div ref={contentRef}>
        <FilterPalette palette={palette} search={search} store={store} />
      </div>
    </ResponsiveOverlay>
  );

  return overlay;
});
