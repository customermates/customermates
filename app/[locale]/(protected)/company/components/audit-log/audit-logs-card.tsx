"use client";

import type { AuditLogDto } from "@/features/audit-log/audit-log.dto";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { ColumnDef } from "@tanstack/react-table";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { getEntityName } from "@/features/event/entity-name.utils";
import { DataViewContainer, useDataViewSync } from "@/components/data-view";
import { useRootStore } from "@/core/stores/root-store.provider";
import { AppChip } from "@/components/chip/app-chip";
import { CopyableChip } from "@/components/chip/copyable-chip";
import { AvatarStack } from "@/components/shared/avatar-stack";

type Props = {
  initialAuditLogs: GetResult<AuditLogDto>;
};

export const AuditLogsCard = observer(({ initialAuditLogs }: Props) => {
  const t = useTranslations();
  const { auditLogModalStore, auditLogsStore, intlStore, userModalStore } = useRootStore();

  useDataViewSync(auditLogsStore, initialAuditLogs);

  const columns = useMemo<ColumnDef<AuditLogDto>[]>(() => {
    return [
      {
        id: "name",
        header: t("Common.table.columns.name"),
        cell: ({ row }) => {
          const entityName = getEntityName(row.original.event, row.original.eventData, t);
          return <span className="text-sm">{entityName ?? "-"}</span>;
        },
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
        id: "entityId",
        header: t("Common.table.columns.entityId"),
        cell: ({ row }) => (
          <CopyableChip size="sm" value={row.original.entityId} variant="secondary">
            {row.original.entityId}
          </CopyableChip>
        ),
      },
      {
        id: "user",
        header: t("Common.table.columns.user"),
        cell: ({ row }) => (
          <AvatarStack
            items={row.original.user ? [row.original.user] : []}
            onAvatarClick={(user) => void userModalStore.loadById(user.id)}
          />
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
    ];
  }, [t, intlStore, userModalStore]);

  return (
    <DataViewContainer
      anchorScope="company-audit-logs"
      columns={columns}
      emptyState={{ title: t("AuditLogsCard.emptyTitle"), body: t("AuditLogsCard.emptyBody") }}
      searchPlaceholder={t("AuditLogsCard.searchTooltip")}
      store={auditLogsStore}
      onRowClick={(item) => {
        auditLogModalStore.onInitOrRefresh(item);
        auditLogModalStore.open();
      }}
    />
  );
});
