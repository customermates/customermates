"use client";

import { FunnelIcon } from "@heroicons/react/24/outline";
import { Popover, PopoverTrigger } from "@heroui/popover";
import { Button } from "@heroui/button";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useState, useRef } from "react";
import { Divider } from "@heroui/divider";

import { XIcon } from "../../x-icon";
import { XBadge } from "../../x-badge";
import { XPopoverContent } from "../../x-popover/x-popover-content";
import { useXDataView } from "../x-data-view-container";

import { useRootStore } from "@/core/stores/root-store.provider";

export const XDataViewFiltersButton = observer(() => {
  const store = useXDataView();
  const { xTableFilterModalStore } = useRootStore();
  const t = useTranslations("Common");
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const hasSavedFilterPresets = store.savedFilterPresets && store.savedFilterPresets?.length > 0;
  const hasActiveFilters = store.filters && store.filters.length > 0;

  function handleOpenModal() {
    setIsOpen(false);
    xTableFilterModalStore.openFor(store);
  }

  function handlePresetSelect(presetId: string | null) {
    setIsOpen(false);
    store.changeFilterPreset(presetId ?? undefined);
  }

  return (
    <Popover
      ref={popoverRef}
      isOpen={isOpen}
      placement="bottom-end"
      onOpenChange={(open) => {
        if (!hasSavedFilterPresets && open) handleOpenModal();
        else setIsOpen(open);
      }}
    >
      <XBadge borderColor="content1" content={store.filters?.length} isInvisible={!hasActiveFilters}>
        <PopoverTrigger>
          <Button isIconOnly size="sm" variant="flat">
            <XIcon icon={FunnelIcon} />
          </Button>
        </PopoverTrigger>
      </XBadge>

      <XPopoverContent isDraggable={false} isOpen={isOpen} popoverRef={popoverRef} onClose={() => setIsOpen(false)}>
        <Button fullWidth className="justify-start" size="sm" variant="light" onPress={handleOpenModal}>
          {t("filters.editCurrent")}
        </Button>

        <Divider />

        {hasSavedFilterPresets &&
          store.savedFilterPresets?.map((preset) => (
            <Button
              key={preset.id}
              fullWidth
              className="justify-start"
              color={store.activePresetId === preset.id ? "primary" : "default"}
              size="sm"
              variant={store.activePresetId === preset.id ? "flat" : "light"}
              onPress={() => handlePresetSelect(preset.id)}
            >
              {preset.name}
            </Button>
          ))}
      </XPopoverContent>
    </Popover>
  );
});
