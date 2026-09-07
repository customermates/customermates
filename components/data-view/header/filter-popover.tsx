"use client";

import type { BaseDataViewStore } from "@/core/base/base-data-view.store";

import { Filter } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { FilterPalette } from "@/components/data-view/filter-palette/filter-palette";
import { MAX_APPLIED_FILTERS } from "@/components/data-view/filter-palette/filter-palette.store";
import { ResponsiveOverlay } from "@/components/modal";
import { cn } from "@/core/utils/cn";
import { runUserAction } from "@/core/errors/report-application-error";
import { useFilterFieldLabel } from "@/components/entity-terminology/use-filter-field-label";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  store: BaseDataViewStore<any>;
  compact?: boolean;
  id?: string;
};

export const FilterPopover = observer(function FilterPopover({ store, compact, id }: Props) {
  const t = useTranslations();
  const { filterPaletteStore: palette } = useRootStore();
  const filterFieldLabel = useFilterFieldLabel();

  useEffect(() => () => palette.flushPendingChanges(), [palette]);

  if (store.filterableFields.length === 0) return null;

  const activeFilterCount = store.filters?.length ?? 0;
  const isOpen = palette.isOpen && palette.tableStore === store;
  const page = palette.page;
  const title =
    isOpen && page.kind !== "root"
      ? filterFieldLabel(page.field, store.customColumns)
      : t("Common.filters.palette.title");

  function handleOpenChange(open: boolean) {
    if (open) palette.openFor(store);
    else palette.close();
  }

  function handleEscapeKeyDown(event: KeyboardEvent) {
    if (palette.page.kind === "root") return;

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
      {activeFilterCount >= MAX_APPLIED_FILTERS && (
        <p aria-live="polite" className="mr-auto text-xs text-muted-foreground" role="status">
          {t("Common.filters.palette.limitReached", { count: MAX_APPLIED_FILTERS })}
        </p>
      )}

      <Button
        className="h-8"
        disabled={activeFilterCount === 0}
        size="sm"
        type="button"
        variant="secondary"
        onClick={handleClear}
      >
        {t("Common.actions.clear")}
      </Button>
    </>
  );

  return (
    <ResponsiveOverlay
      align="end"
      footer={footer}
      open={isOpen}
      popoverClassName="w-[min(22rem,var(--radix-popover-content-available-width))]"
      title={title}
      trigger={trigger}
      onEscapeKeyDown={handleEscapeKeyDown}
      onOpenChange={handleOpenChange}
    >
      <FilterPalette store={store} />
    </ResponsiveOverlay>
  );
});
