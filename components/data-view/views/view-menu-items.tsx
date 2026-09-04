"use client";

import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";
import type { ViewCommands } from "./use-view-commands";
import type { ViewMenuItem, ViewMenuItemId } from "./view-rail-model";

import { useTranslations } from "next-intl";

import { DropdownMenuCheckboxItem, DropdownMenuItem } from "@/components/ui/dropdown-menu";

type Props = {
  commands: ViewCommands;
  items: ViewMenuItem[];
  view: DataViewChipDto;
};

export function ViewMenuItems({ commands, items, view }: Props) {
  const t = useTranslations();

  function label(id: ViewMenuItemId): string {
    switch (id) {
      case "copyLink":
        return t("DataView.views.copyLink");
      case "delete":
        return t("DataView.views.delete");
      case "duplicate":
        return t("DataView.views.duplicate");
      case "edit":
        return t("DataView.views.editTitle");
      case "moveLeft":
        return t("DataView.views.moveLeft");
      case "moveRight":
        return t("DataView.views.moveRight");
      case "saveAsNew":
        return t("DataView.views.saveAsNew");
      case "saveChanges":
        return t("DataView.views.saveChanges");
      case "share":
        return t("DataView.views.shared");
    }
  }

  function invoke(id: ViewMenuItemId) {
    switch (id) {
      case "copyLink":
        return commands.copyLink(view);
      case "delete":
        return commands.remove(view);
      case "duplicate":
        return commands.duplicate(view);
      case "edit":
        return commands.edit(view);
      case "moveLeft":
        return commands.move(view, -1);
      case "moveRight":
        return commands.move(view, 1);
      case "saveAsNew":
        return commands.create();
      case "saveChanges":
        return commands.saveChanges(view);
      case "share":
        return commands.toggleShare(view);
    }
  }

  return (
    <>
      {items.map((item) =>
        item.kind === "checkbox" ? (
          <DropdownMenuCheckboxItem
            key={item.id}
            checked={item.isChecked}
            disabled={item.isDisabled}
            onSelect={() => invoke(item.id)}
          >
            {label(item.id)}
          </DropdownMenuCheckboxItem>
        ) : (
          <DropdownMenuItem
            key={item.id}
            disabled={item.isDisabled}
            variant={item.isDestructive ? "destructive" : "default"}
            onSelect={() => invoke(item.id)}
          >
            {label(item.id)}
          </DropdownMenuItem>
        ),
      )}
    </>
  );
}
