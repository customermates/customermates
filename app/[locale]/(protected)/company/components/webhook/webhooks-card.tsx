"use client";

import type { WebhookDto } from "@/features/webhook/webhook.schema";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { ColumnDef } from "@tanstack/react-table";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { DataViewContainer, useDataViewSync } from "@/components/data-view";
import { useRootStore } from "@/core/stores/root-store.provider";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { AppChip } from "@/components/chip/app-chip";

type Props = {
  initialWebhooks: GetResult<WebhookDto>;
};

export const WebhooksCard = observer(({ initialWebhooks }: Props) => {
  const t = useTranslations();
  const { webhookModalStore, webhooksStore, intlStore } = useRootStore();

  useDataViewSync(webhooksStore, initialWebhooks);

  const columns = useMemo<ColumnDef<WebhookDto>[]>(() => {
    return [
      {
        id: "name",
        header: t("Common.table.columns.url"),
        cell: ({ row }) => <span className="text-sm truncate">{row.original.url}</span>,
      },
      {
        id: "description",
        header: t("Common.table.columns.description"),
        cell: ({ row }) => <span className="text-sm truncate">{row.original.description ?? ""}</span>,
      },
      {
        id: "events",
        header: t("Common.table.columns.events"),
        cell: ({ row }) => (
          <AppChipStack
            items={row.original.events.map((event) => ({
              id: event,
              label: t(`Common.events.${event}`),
            }))}
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
        id: "createdAt",
        accessorKey: "createdAt",
        header: t("Common.table.columns.createdAt"),
        cell: ({ row }) => (
          <span className="text-sm">{intlStore.formatNumericalShortDateTime(row.original.createdAt)}</span>
        ),
      },
      {
        id: "updatedAt",
        accessorKey: "updatedAt",
        header: t("Common.table.columns.updatedAt"),
        cell: ({ row }) => (
          <span className="text-sm">{intlStore.formatNumericalShortDateTime(row.original.updatedAt)}</span>
        ),
      },
    ];
  }, [t, intlStore]);

  return (
    <DataViewContainer
      anchorScope="company-webhooks"
      columns={columns}
      emptyState={{ title: t("WebhooksCard.emptyTitle"), body: t("WebhooksCard.emptyBody") }}
      store={webhooksStore}
      onAdd={() =>
        webhookModalStore.openWith({
          url: "",
          description: undefined,
          events: [],
          secret: undefined,
          enabled: true,
        })
      }
      onRowClick={(item) =>
        webhookModalStore.openWith({
          id: item.id,
          url: item.url,
          description: item.description ?? undefined,
          events: item.events,
          secret: item.secret ?? undefined,
          enabled: item.enabled,
        })
      }
    />
  );
});
