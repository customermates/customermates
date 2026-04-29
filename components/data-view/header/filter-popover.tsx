"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { BookmarkPlus, Check, ChevronDown, Filter, Trash2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { FilterAccordion } from "@/components/data-view/filter-modal/filter-accordion";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRootStore } from "@/core/stores/root-store.provider";

import { PopoverSection } from "./popover-section";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
};

export const FilterPopover = observer(function FilterPopover<E extends HasId>({ store }: Props<E>) {
  const t = useTranslations("Common");
  const { editFiltersModalStore: modalStore } = useRootStore();
  const { showDeleteConfirmation } = useDeleteConfirmation();

  if (store.filterableFields.length === 0) return null;

  const activeFilterCount = store.filters?.length ?? 0;
  const savedPresets = modalStore.savedPresets;
  const isEditingPreset = modalStore.isEditingPreset;
  const isCreatingPreset = modalStore.isCreatingPreset;
  const activePresetId = isEditingPreset ? (modalStore.form.presetId as string) : undefined;
  const activePreset = activePresetId ? savedPresets.find((p) => p.id === activePresetId) : undefined;

  function handleOpenChange(open: boolean) {
    if (open) modalStore.openFor(store);
    else modalStore.close();
  }

  function handleApply() {
    void modalStore.onSubmit();
  }

  function handleClear() {
    store.setQueryOptions({ filters: [], forceRefresh: true });
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
    showDeleteConfirmation(() => void modalStore.deletePreset(), modalStore.form.name);
  }

  const customColumns = store.customColumns;

  return (
    <Popover open={modalStore.isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button aria-label={t("ariaLabels.tooltipFilters")} className="relative h-8" size="sm" variant="outline">
          <Filter className="size-3.5" />

          {activeFilterCount > 0 && (
            <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="flex max-h-[calc(100vh-5rem)] w-96 flex-col p-0">
        <AppForm store={modalStore}>
          <PopoverSection label={t("filters.presets.label")}>
            {isCreatingPreset ? (
              <FormInput
                autoFocus
                className="h-8"
                id="name"
                label={null}
                placeholder={t("filters.presets.namePlaceholder")}
              />
            ) : (
              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="h-8 flex-1 justify-between font-normal"
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <span className="truncate">{activePreset ? activePreset.name : t("filters.presets.none")}</span>

                      <ChevronDown className="size-3.5 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuItem onSelect={() => handleSelectPreset(undefined)}>
                      <span className="flex-1">{t("filters.presets.none")}</span>

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

                      {t("filters.presets.add")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {isEditingPreset && (
                  <Button
                    aria-label={t("actions.delete")}
                    className="size-8 text-destructive"
                    size="icon-sm"
                    type="button"
                    variant="outline"
                    onClick={handleDeletePreset}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            )}
          </PopoverSection>

          <Separator />

          <div className="min-h-0 flex-1 overflow-y-auto">
            <FilterAccordion
              baseId="filters"
              customColumns={customColumns}
              filterableFields={store.filterableFields}
              filters={modalStore.form.filters}
            />
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border p-2 sm:flex-row sm:justify-end">
            {isCreatingPreset && (
              <Button className="h-8" size="sm" type="button" variant="outline" onClick={handleCancelCreatePreset}>
                {t("actions.cancel")}
              </Button>
            )}

            {!isCreatingPreset && (
              <Button
                className="h-8"
                disabled={activeFilterCount === 0}
                size="sm"
                type="button"
                variant="outline"
                onClick={handleClear}
              >
                {t("actions.clear")}
              </Button>
            )}

            <Button className="h-8" size="sm" type="button" onClick={handleApply}>
              {isCreatingPreset || isEditingPreset ? t("actions.save") : t("filters.apply")}
            </Button>
          </div>
        </AppForm>
      </PopoverContent>
    </Popover>
  );
});
