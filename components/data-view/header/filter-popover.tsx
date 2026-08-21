"use client";

import type { BaseDataViewStore } from "@/core/base/base-data-view.store";

import { BookmarkPlus, Check, ChevronDown, Filter, Trash2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { FilterAccordion } from "@/components/data-view/filter-modal/filter-accordion";
import { cn } from "@/core/utils/cn";
import { hasValidFilterConfiguration } from "@/components/data-view/table-view.utils";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResponsiveOverlay } from "@/components/modal";
import { Separator } from "@/components/ui/separator";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

import { PopoverSection } from "./popover-section";

type Props = {
  store: BaseDataViewStore<any>;
  compact?: boolean;
  id?: string;
};

export const FilterPopover = observer(function FilterPopover({ store, compact, id }: Props) {
  const t = useTranslations();
  const { editFiltersModalStore: modalStore } = useRootStore();
  const { showDeleteConfirmation } = useDeleteConfirmation();

  useEffect(() => () => modalStore.flushPendingChanges(), [modalStore]);

  if (store.filterableFields.length === 0) return null;

  const activeFilterCount = store.filters?.length ?? 0;
  const savedPresets = modalStore.savedPresets;
  const isEditingPreset = modalStore.isEditingPreset;
  const isCreatingPreset = modalStore.isCreatingPreset;
  const validFormFilters = (modalStore.form.filters ?? []).filter(hasValidFilterConfiguration);
  const cannotSavePreset = (isCreatingPreset || isEditingPreset) && validFormFilters.length === 0;
  const activePresetId = isEditingPreset ? (modalStore.form.presetId as string) : undefined;
  const activePreset = activePresetId ? savedPresets.find((p) => p.id === activePresetId) : undefined;

  function handleOpenChange(open: boolean) {
    if (open) modalStore.openFor(store);
    else modalStore.close();
  }

  function handleSavePreset() {
    runUserAction(() => modalStore.onSubmit());
  }

  function handleClear() {
    modalStore.cancelPendingAutoApply();
    store.setQueryOptions({
      filters: [],
      forceRefresh: true,
      refreshMode: "background",
    });
    modalStore.openFor(store);
  }

  function handleSelectPreset(presetId: string | undefined) {
    modalStore.onChange("presetId", presetId);
  }

  function handleStartCreatePreset() {
    modalStore.onChange("presetId", "new");
  }

  function handleCancelCreatePreset() {
    modalStore.onChange("presetId", undefined);
  }

  function handleDeletePreset() {
    showDeleteConfirmation(() => modalStore.deletePreset(), modalStore.form.name);
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
      {isCreatingPreset && (
        <Button className="h-8" size="sm" type="button" variant="secondary" onClick={handleCancelCreatePreset}>
          {t("Common.actions.cancel")}
        </Button>
      )}

      {!isCreatingPreset && (
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
      )}

      {(isCreatingPreset || isEditingPreset) && (
        <Button className="h-8" disabled={cannotSavePreset} size="sm" type="button" onClick={handleSavePreset}>
          {t("Common.actions.save")}
        </Button>
      )}
    </>
  );

  return (
    <ResponsiveOverlay
      align="end"
      footer={footer}
      open={modalStore.isOpen && modalStore.tableStore === store}
      popoverClassName="w-96"
      title={t("Common.ariaLabels.tooltipFilters")}
      trigger={trigger}
      onOpenChange={handleOpenChange}
    >
      <AppForm store={modalStore}>
        <PopoverSection label={t("Common.filters.presets.label")}>
          {isCreatingPreset ? (
            <FormInput
              autoFocus
              className="h-8"
              id="name"
              label={null}
              placeholder={t("Common.filters.presets.namePlaceholder")}
            />
          ) : (
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="h-8 flex-1 justify-between font-normal"
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <span className="truncate">
                      {activePreset ? activePreset.name : t("Common.filters.presets.none")}
                    </span>

                    <ChevronDown className="size-3.5 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem onSelect={() => handleSelectPreset(undefined)}>
                    <span className="flex-1">{t("Common.filters.presets.none")}</span>

                    {!activePresetId && <Check className="size-3.5" />}
                  </DropdownMenuItem>

                  {savedPresets.length > 0 && <DropdownMenuSeparator />}

                  {savedPresets.map((preset) => (
                    <DropdownMenuItem key={preset.id} onSelect={() => handleSelectPreset(preset.id)}>
                      <span className="flex-1">{preset.name}</span>

                      {activePresetId === preset.id && <Check className="size-3.5" />}
                    </DropdownMenuItem>
                  ))}

                  <DropdownMenuSeparator />

                  <DropdownMenuItem onSelect={handleStartCreatePreset}>
                    <BookmarkPlus className="size-3.5" />

                    {t("Common.filters.presets.add")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {isEditingPreset && (
                <Button
                  aria-label={t("Common.actions.delete")}
                  className="size-8 text-destructive"
                  size="icon-sm"
                  type="button"
                  variant="secondary"
                  onClick={handleDeletePreset}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          )}
        </PopoverSection>

        <Separator />

        <FilterAccordion
          baseId="filters"
          customColumns={store.customColumns}
          filterableFields={store.filterableFields}
          filters={modalStore.form.filters}
          value={modalStore.expandedField ?? ""}
          onValueChange={modalStore.setExpandedField}
        />
      </AppForm>
    </ResponsiveOverlay>
  );
});
