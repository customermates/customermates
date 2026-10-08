"use client";

import type { FilterTarget } from "./filter-target";
import type { ComponentProps, ReactNode } from "react";

import { Filter } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useFilterPalette } from "./use-filter-palette";

import { Button } from "@/components/ui/button";
import { FilterPalette } from "@/components/data-view/filter-palette/filter-palette";
import { MAX_APPLIED_FILTERS } from "@/components/data-view/filter-palette/filter-palette.store";
import { ResponsiveOverlay } from "@/components/modal";
import { cn } from "@/core/utils/cn";
import { runUserAction } from "@/core/errors/report-application-error";
import { useFilterFieldLabel } from "@/components/data-view/use-filter-field-label";

type Props = {
  store: FilterTarget;
  headerAction?: (close: () => void) => ReactNode;
  onCloseAutoFocus?: ComponentProps<typeof ResponsiveOverlay>["onCloseAutoFocus"];
  compact?: boolean;
  id?: string;
};

export const FilterTargetPopover = observer(function FilterTargetPopover({
  store,
  compact,
  id,
  headerAction,
  onCloseAutoFocus,
}: Props) {
  const t = useTranslations();
  const palette = useFilterPalette(store);
  const filterFieldLabel = useFilterFieldLabel();

  if (store.filterableFields.length === 0 && !store.filters?.length && !store.groups?.length) return null;

  const activeFilterCount = (store.filters?.length ?? 0) + (store.groups?.length ?? 0);
  const isOpen = palette.isOpen && palette.target === store;
  const page = palette.page;
  const title =
    isOpen && page.kind !== "root"
      ? filterFieldLabel(page.field, palette.activeTarget?.filterColumns)
      : (palette.activeGroup?.label ?? t("Common.filters.palette.title"));

  function handleOpenChange(open: boolean) {
    if (open) palette.openFor(store);
    else palette.close();
  }

  function handleEscapeKeyDown(event: KeyboardEvent) {
    if (palette.pages.length === 1) return;

    event.preventDefault();
    palette.pop();
  }

  function handleClear() {
    runUserAction(() => palette.clearFilters());
  }

  const trigger = (
    <Button
      aria-label={t("Common.ariaLabels.tooltipFilters")}
      className={cn(
        "relative",
        compact ? "text-muted-foreground hover:text-foreground size-3 rounded-sm hover:bg-transparent" : "h-8",
      )}
      disabled={store.isDisabled}
      id={id}
      size={compact ? "icon-xs" : "sm"}
      type="button"
      variant={compact ? "ghost" : "secondary"}
    >
      <Filter className={compact ? "size-3" : "size-3.5"} />

      {activeFilterCount > 0 && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute rounded-full bg-primary",
            compact ? "-right-1 -top-1 size-1.5" : "-right-0.5 -top-0.5 size-2",
          )}
        />
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
        disabled={palette.isDisabled || (palette.appliedFilters.length === 0 && !palette.activeTarget?.groups?.length)}
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
      headerAction={headerAction?.(palette.close)}
      open={isOpen}
      popoverClassName="w-[min(22rem,var(--radix-popover-content-available-width))]"
      title={title}
      trigger={trigger}
      onCloseAutoFocus={onCloseAutoFocus}
      onEscapeKeyDown={handleEscapeKeyDown}
      onOpenChange={handleOpenChange}
    >
      <FilterPalette palette={palette} store={store} />
    </ResponsiveOverlay>
  );

  return overlay;
});
