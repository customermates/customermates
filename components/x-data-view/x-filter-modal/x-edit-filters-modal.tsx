"use client";
import { Button } from "@heroui/button";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { TrashIcon } from "@heroicons/react/24/outline";
import { Popover, PopoverTrigger } from "@heroui/popover";
import { useState, useRef } from "react";
import { Divider } from "@heroui/divider";

import { XCard } from "../../x-card/x-card";
import { XCardBody } from "../../x-card/x-card-body";
import { XCardHeader } from "../../x-card/x-card-header";

import { XFilterField } from "./x-filter-field";

import { XCardModalDefaultFooter } from "@/components/x-card/x-card-modal-default-footer";
import { XIcon } from "@/components/x-icon";
import { XInput } from "@/components/x-inputs/x-input";
import { XForm } from "@/components/x-inputs/x-form";
import { XModal } from "@/components/x-modal/x-modal";
import { useDeleteConfirmation } from "@/components/x-modal/hooks/x-use-delete-confirmation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XPopoverContent } from "@/components/x-popover/x-popover-content";

export const XEditFiltersModal = observer(() => {
  const { xTableFilterModalStore: store } = useRootStore();

  const t = useTranslations("Common");
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const hasSavedPresets = store.savedPresets.length > 0;
  const isEditingOrCreating = store.isEditingPreset || store.isCreatingPreset;

  function handlePresetButtonClick() {
    if (isEditingOrCreating) {
      store.onChange("presetId", undefined);
      setIsPopoverOpen(false);
    } else if (!hasSavedPresets) handlePresetSelect("new");
    else setIsPopoverOpen(!isPopoverOpen);
  }

  function handlePresetSelect(presetId: string) {
    store.onChange("presetId", presetId);
    setIsPopoverOpen(false);
  }

  return (
    <XModal store={store}>
      <XForm store={store}>
        <XCard>
          <XCardHeader>
            <h2 className="text-x-lg mr-auto">
              {isEditingOrCreating ? t("filters.title") : t("filters.activeFilters")}
            </h2>

            <div className="flex gap-2 items-start justify-start">
              {hasSavedPresets && !isEditingOrCreating ? (
                <Popover ref={popoverRef} isOpen={isPopoverOpen} placement="bottom-end" onOpenChange={setIsPopoverOpen}>
                  <PopoverTrigger>
                    <Button color="primary" size="sm" variant="flat">
                      {t("filters.presets.createOrUpdate")}
                    </Button>
                  </PopoverTrigger>

                  <XPopoverContent
                    isDraggable={false}
                    isOpen={isPopoverOpen}
                    popoverRef={popoverRef}
                    onClose={() => setIsPopoverOpen(false)}
                  >
                    <Button
                      fullWidth
                      className="justify-start"
                      size="sm"
                      variant="light"
                      onPress={() => handlePresetSelect("new")}
                    >
                      {t("filters.presets.add")}
                    </Button>

                    <Divider />

                    {store.savedPresets.map((preset) => (
                      <Button
                        key={preset.id}
                        fullWidth
                        className="justify-start"
                        size="sm"
                        variant="light"
                        onPress={() => handlePresetSelect(preset.id)}
                      >
                        {preset.name}
                      </Button>
                    ))}
                  </XPopoverContent>
                </Popover>
              ) : (
                <Button
                  color={isEditingOrCreating ? "default" : "primary"}
                  size="sm"
                  variant="flat"
                  onPress={handlePresetButtonClick}
                >
                  {isEditingOrCreating ? t("filters.presets.cancelEditing") : t("filters.presets.createOrUpdate")}
                </Button>
              )}

              {store.isEditingPreset && (
                <Button
                  isIconOnly
                  color="danger"
                  size="sm"
                  variant="flat"
                  onPress={() => showDeleteConfirmation(() => store.deletePreset(), store.form.name)}
                >
                  <XIcon icon={TrashIcon} />
                </Button>
              )}
            </div>
          </XCardHeader>

          <XCardBody>
            {isEditingOrCreating && <XInput isRequired id="name" />}

            {store.form.filters.map((filter, index) => (
              <XFilterField
                key={filter.field}
                baseId={`filters[${index}]`}
                customColumns={store.tableStore?.customColumns}
                filter={filter}
                filterableFields={store.tableStore?.filterableFields ?? []}
              />
            ))}
          </XCardBody>

          <XCardModalDefaultFooter
            primaryButtonLabel={
              store.isEditingPreset || store.isCreatingPreset ? "Common.actions.save" : "Common.actions.update"
            }
            store={store}
          />
        </XCard>
      </XForm>
    </XModal>
  );
});
