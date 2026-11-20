"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { IncomingWebhookDto } from "@/features/incoming-webhook/incoming-webhook.schema";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

export function useIncomingWebhookColumns(lists: ReadonlyArray<{ id: string; label: string }>) {
  const intlStore = useHydratedIntlStore();
  const t = useTranslations();
  return useMemo<ColumnDef<IncomingWebhookDto>[]>(
    () => [
      {
        id: "name",
        header: t("Common.table.columns.name"),
        cell: ({ row }) => <span className="truncate text-sm">{row.original.name}</span>,
      },
      {
        id: "list",
        header: t("IncomingWebhooks.list"),
        cell: ({ row }) => (
          <span className="truncate text-sm">{lists.find((list) => list.id === row.original.typeId)?.label ?? ""}</span>
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
        id: "lastRequest",
        header: t("Common.table.columns.lastRequest"),
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.lastReceivedAt
              ? intlStore.formatNumericalShortDateTime(new Date(row.original.lastReceivedAt))
              : t("IncomingWebhooks.neverReceived")}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        id: "createdAt",
        header: t("Common.table.columns.createdAt"),
        cell: ({ row }) => (
          <span className="text-sm">{intlStore.formatNumericalShortDateTime(new Date(row.original.createdAt))}</span>
        ),
      },
      {
        accessorKey: "updatedAt",
        id: "updatedAt",
        header: t("Common.table.columns.updatedAt"),
        cell: ({ row }) => (
          <span className="text-sm">{intlStore.formatNumericalShortDateTime(new Date(row.original.updatedAt))}</span>
        ),
      },
    ],
    [intlStore, lists, t],
  );
}
