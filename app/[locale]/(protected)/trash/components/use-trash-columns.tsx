"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { LucideIcon } from "lucide-react";
import type { TrashItemDto, TrashKind } from "@/features/trash/trash.schema";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { BookOpen, LayoutDashboard, Repeat, Rows3, SquareChartGantt } from "lucide-react";

import { AppChip } from "@/components/chip/app-chip";
import { MemberChip } from "@/components/chip/member-chip";
import { recordTypeIcon } from "@/components/records/record-type-icon";
import { EmptyValue } from "@/components/shared/empty-value";
import { toChipColor } from "@/constants/chip-colors";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { trashKindLabelKey } from "./trash-page-model";

const KIND_ICONS: Partial<Record<TrashKind, LucideIcon>> = {
  view: Rows3,
  widget: SquareChartGantt,
  routine: Repeat,
  wikiPage: BookOpen,
};

function itemIcon(item: TrashItemDto): LucideIcon {
  if (item.kind === "view" && item.surfaceKey === "dashboard") return LayoutDashboard;
  return item.icon ? recordTypeIcon(item.icon) : (KIND_ICONS[item.kind] ?? Rows3);
}

export function TrashItemChip({ item }: { item: TrashItemDto }) {
  const Icon = itemIcon(item);
  return (
    <AppChip startContent={<Icon aria-hidden className="size-3 shrink-0" />} variant={toChipColor(item.color)}>
      {item.label}
    </AppChip>
  );
}

export function useTrashKindLabel() {
  const t = useTranslations();
  return useCallback(
    (item: TrashItemDto) => {
      const kind = t(`Trash.kinds.${trashKindLabelKey(item)}`);
      return item.listLabel && item.kind !== "list" ? t("Trash.kindInList", { kind, list: item.listLabel }) : kind;
    },
    [t],
  );
}

export function useTrashColumns(): ColumnDef<TrashItemDto>[] {
  const intlStore = useHydratedIntlStore();
  const t = useTranslations();
  const kindLabel = useTrashKindLabel();

  return useMemo<ColumnDef<TrashItemDto>[]>(
    () => [
      {
        id: "name",
        header: t("Common.table.columns.name"),
        cell: ({ row }) => <TrashItemChip item={row.original} />,
      },
      {
        id: "kind",
        header: t("Trash.columns.kind"),
        cell: ({ row }) => <span className="truncate text-sm">{kindLabel(row.original)}</span>,
      },
      {
        id: "deletedBy",
        header: t("Trash.columns.deletedBy"),
        cell: ({ row }) =>
          row.original.deletedBy ? <MemberChip member={row.original.deletedBy} /> : <EmptyValue />,
      },
      {
        id: "deletedAt",
        header: t("Trash.columns.deletedAt"),
        cell: ({ row }) => (
          <span className="text-sm">{intlStore.formatNumericalShortDateTime(row.original.deletedAt)}</span>
        ),
      },
      {
        id: "expiresAt",
        header: t("Trash.columns.expiresAt"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {t("Trash.daysLeft", { count: row.original.daysLeft })}
          </span>
        ),
      },
    ],
    [intlStore, kindLabel, t],
  );
}
