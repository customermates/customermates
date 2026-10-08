"use client";

import { AtSign, Calculator, Link2, ListTree, TextCursorInput } from "lucide-react";
import { useTranslations } from "next-intl";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export type ConfigureListAddKind = "field" | "calculation" | "relationship" | "channels" | "sublist";

export function ConfigureListAddItems({
  onAdd,
  channels,
  sublist,
}: {
  onAdd: (kind: ConfigureListAddKind) => void;
  channels: boolean;
  sublist: boolean;
}) {
  const t = useTranslations();
  return (
    <>
      <DropdownMenuItem onSelect={() => onAdd("field")}>
        <TextCursorInput aria-hidden="true" />

        {t("RecordModel.addMenu.field")}
      </DropdownMenuItem>

      <DropdownMenuItem onSelect={() => onAdd("calculation")}>
        <Calculator aria-hidden="true" />

        {t("RecordModel.addMenu.calculation")}
      </DropdownMenuItem>

      <DropdownMenuItem onSelect={() => onAdd("relationship")}>
        <Link2 aria-hidden="true" />

        {t("RecordModel.addMenu.relationship")}
      </DropdownMenuItem>

      {channels && (
        <DropdownMenuItem onSelect={() => onAdd("channels")}>
          <AtSign aria-hidden="true" />

          {t("RecordModel.addMenu.channels")}
        </DropdownMenuItem>
      )}

      {sublist && (
        <DropdownMenuItem onSelect={() => onAdd("sublist")}>
          <ListTree aria-hidden="true" />

          {t("RecordModel.addMenu.sublist")}
        </DropdownMenuItem>
      )}
    </>
  );
}
