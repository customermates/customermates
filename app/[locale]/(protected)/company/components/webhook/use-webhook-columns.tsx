"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { WebhookDto } from "@/features/webhook/webhook.schema";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { useRootStore } from "@/core/stores/root-store.provider";

export function useWebhookColumns(): ColumnDef<WebhookDto>[] {
  const { intlStore } = useRootStore();
  const t = useTranslations();
  return useMemo<ColumnDef<WebhookDto>[]>(
    () => [
      {
        id: "name",
        header: t("Common.table.columns.url"),
        cell: ({ row }) => <span className="truncate text-sm">{row.original.url}</span>,
      },
      {
        id: "description",
        header: t("Common.table.columns.description"),
        cell: ({ row }) => <span className="truncate text-sm">{row.original.description ?? ""}</span>,
      },
      {
        id: "events",
        header: t("Common.table.columns.events"),
        cell: ({ row }) => (
          <AppChipStack
            items={row.original.events.map((event) => ({ id: event, label: t(`Common.events.${event}`) }))}
            size="sm"
          />
        ),
      },
      {
        id: "status",
        header: t("Common.table.columns.status"),
        cell: ({ row }) =>
          row.original.enabled ? (
            <AppChip size="sm" variant="success">
              {t("WebhookModal.enabled")}
            </AppChip>
          ) : (
            <AppChip size="sm" variant="destructive">
              {t("WebhookModal.disabled")}
            </AppChip>
          ),
      },
      {
        accessorKey: "createdAt",
        id: "createdAt",
        header: t("Common.table.columns.createdAt"),
        cell: ({ row }) => (
          <span className="text-sm">{intlStore.formatNumericalShortDateTime(row.original.createdAt)}</span>
        ),
      },
      {
        accessorKey: "updatedAt",
        id: "updatedAt",
        header: t("Common.table.columns.updatedAt"),
        cell: ({ row }) => (
          <span className="text-sm">{intlStore.formatNumericalShortDateTime(row.original.updatedAt)}</span>
        ),
      },
    ],
    [intlStore, t],
  );
}
