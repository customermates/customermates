"use client";

import type { WebhookDeliveryDto } from "@/features/webhook/get-webhook-deliveries.interactor";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { ColumnDef } from "@tanstack/react-table";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";

import { WEBHOOK_DELIVERY_QUEUE_STATUS_CHIP_COLOR } from "@/features/webhook/webhook-delivery-chip-colors";
import { getEntityName } from "@/features/event/entity-name.utils";
import { DataViewContainer } from "@/components/data-view";
import { useRootStore } from "@/core/stores/root-store.provider";
import { AppChip } from "@/components/chip/app-chip";
type Props = {
  initialDeliveries: GetResult<WebhookDeliveryDto>;
};

export const WebhookDeliveriesCard = observer(({ initialDeliveries }: Props) => {
  const t = useTranslations();
  const { webhookDeliveryModalStore, webhookDeliveriesStore, intlStore } = useRootStore();

  useEffect(() => webhookDeliveriesStore.setItems(initialDeliveries), [initialDeliveries]);

  const columns = useMemo<ColumnDef<WebhookDeliveryDto>[]>(() => {
    return [
      {
        id: "name",
        header: t("Common.table.columns.url"),
        cell: ({ row }) => <span className="text-sm truncate">{row.original.url}</span>,
      },
      {
        id: "event",
        header: t("Common.table.columns.event"),
        cell: ({ row }) => {
          const [entity, action] = row.original.event.split(".");
          return (
            <AppChip size="sm" variant="secondary">
              {t(`Common.events.${entity}.${action}`)}
            </AppChip>
          );
        },
      },
      {
        id: "entity",
        header: t("Common.table.columns.entity"),
        cell: ({ row }) => {
          const entityName = getEntityName(row.original.event, row.original.requestBody?.data, t);
          return <span className="text-sm">{entityName ?? "-"}</span>;
        },
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
          row.original.statusCode ? <span className="text-sm">{row.original.statusCode}</span> : <></>,
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: t("Common.table.columns.createdAt"),
        cell: ({ row }) => (
          <span className="text-sm">{intlStore.formatNumericalShortDateTime(row.original.createdAt)}</span>
        ),
      },
    ];
  }, [t, intlStore]);

  return (
    <DataViewContainer
      columns={columns}
      store={webhookDeliveriesStore}
      onRowClick={(item) => {
        webhookDeliveryModalStore.onInitOrRefresh(item);
        webhookDeliveryModalStore.open();
      }}
    />
  );
});
