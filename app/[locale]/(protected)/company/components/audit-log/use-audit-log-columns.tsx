"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { AuditLogDto } from "@/features/audit-log/audit-log.dto";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { CopyableChip } from "@/components/chip/copyable-chip";
import { AvatarStack } from "@/components/shared/avatar-stack";
import { useRootStore } from "@/core/stores/root-store.provider";
import { getEntityName } from "@/features/event/entity-name.utils";
import { runUserAction } from "@/core/errors/report-application-error";

export function useAuditLogColumns(): ColumnDef<AuditLogDto>[] {
  const { intlStore, userModalStore } = useRootStore();
  const t = useTranslations();
  return useMemo<ColumnDef<AuditLogDto>[]>(
    () => [
      {
        id: "name",
        header: t("Common.table.columns.name"),
        cell: ({ row }) => (
          <span className="text-sm">{getEntityName(row.original.event, row.original.eventData, t) ?? "-"}</span>
        ),
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
            onAvatarClick={(user) => runUserAction(() => userModalStore.loadById(user.id))}
          />
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
    ],
    [intlStore, t, userModalStore],
  );
}
