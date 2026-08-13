"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { WebhookDeliveryDto } from "@/features/webhook/get-webhook-deliveries.interactor";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { useRootStore } from "@/core/stores/root-store.provider";
import { getEntityName } from "@/features/event/entity-name.utils";
import { WEBHOOK_DELIVERY_QUEUE_STATUS_CHIP_COLOR } from "@/features/webhook/webhook-delivery-chip-colors";

export function useWebhookDeliveryColumns(): ColumnDef<WebhookDeliveryDto>[] {
  const { intlStore } = useRootStore();
  const t = useTranslations();
  return useMemo<ColumnDef<WebhookDeliveryDto>[]>(
    () => [
      {
        id: "name",
        header: t("Common.table.columns.url"),
        cell: ({ row }) => <span className="truncate text-sm">{row.original.url}</span>,
      },
      {
        id: "event",
        header: t("Common.table.columns.event"),
        cell: ({ row }) => (
          <AppChip size="sm" variant="secondary">
            {t(`Common.events.${row.original.event}`)}
          </AppChip>
        ),
      },
      {
        id: "entity",
        header: t("Common.table.columns.entity"),
        cell: ({ row }) => (
          <span className="text-sm">{getEntityName(row.original.event, row.original.requestBody?.data, t) ?? "-"}</span>
        ),
      },
      {
        id: "status",
        header: t("Common.table.columns.status"),
        cell: ({ row }) => (
          <AppChip size="sm" variant={WEBHOOK_DELIVERY_QUEUE_STATUS_CHIP_COLOR[row.original.status]}>
            {t(`WebhookDeliveryModal.deliveryStatus.${row.original.status}`)}
          </AppChip>
        ),
      },
      {
        id: "statusCode",
        header: t("Common.table.columns.statusCode"),
        cell: ({ row }) =>
          row.original.statusCode ? <span className="text-sm">{row.original.statusCode}</span> : null,
      },
      {
        accessorKey: "createdAt",
        id: "createdAt",
        header: t("Common.table.columns.createdAt"),
        cell: ({ row }) => (
          <span className="text-sm">{intlStore.formatNumericalShortDateTime(row.original.createdAt)}</span>
        ),
      },
    ],
    [intlStore, t],
  );
}
