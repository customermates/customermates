"use client";

import { Check, Layers } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Icon } from "@/components/shared/icon";
import { useRootStore } from "@/core/stores/root-store.provider";

export const ViewPicker = observer(() => {
  const t = useTranslations();
  const { viewPickerStore: store } = useRootStore();
  const surface = store.surface;
  const open = store.isOpen && surface !== null;
  const activeViewKey = surface?.activeViewKey();

  return (
    <CommandDialog
      description={t("DataView.views.pickerPlaceholder")}
      focusReturnFallback={store.focusReturnFallback}
      focusReturnTarget={store.focusReturnTarget}
      open={open}
      title={t("DataView.views.pickerTitle")}
      onOpenChange={(next) => {
        if (!next) store.close();
      }}
    >
      <CommandInput placeholder={t("DataView.views.pickerPlaceholder")} />

      <CommandList>
        <CommandEmpty>{t("DataView.views.pickerEmpty")}</CommandEmpty>

        <CommandGroup heading={t("DataView.views.pickerTitle")}>
          {surface?.options().map((option) => (
            <CommandItem
              key={option.id}
              value={`${option.name} ${option.id}`}
              onSelect={() => {
                store.close();
                surface.select(option.id);
              }}
            >
              <Icon className="size-4 text-muted-foreground" icon={Layers} />

              <span className="min-w-0 flex-1 truncate">{option.name}</span>

              {option.id === activeViewKey && <Icon className="size-4 text-muted-foreground" icon={Check} />}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
});
