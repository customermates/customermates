"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { OperatorAuditRowDto } from "@/ee/operator/operator-lists.schema";

import { useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { CopyableChip } from "@/components/chip/copyable-chip";

import { AuditActionLabel, AuditSourceChip } from "../operator-value-labels";

export function useOperatorAuditColumns(): ColumnDef<OperatorAuditRowDto>[] {
  const format = useFormatter();
  const t = useTranslations();

  const dateTime = (value: Date) =>
    format.dateTime(new Date(value), { dateStyle: "short", timeStyle: "short", timeZone: "UTC" });

  return useMemo<ColumnDef<OperatorAuditRowDto>[]>(
    () => [
      {
        accessorKey: "createdAt",
        id: "createdAt",
        header: t("Common.table.columns.createdAt"),
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{dateTime(row.original.createdAt)}</span>,
      },
      {
        id: "source",
        header: t("Common.table.columns.source"),
        cell: ({ row }) => <AuditSourceChip source={row.original.source} />,
      },
      {
        id: "action",
        header: t("Common.table.columns.action"),
        cell: ({ row }) => (
          <span className="text-sm">
            <AuditActionLabel action={row.original.action} source={row.original.source} />
          </span>
        ),
      },
      {
        id: "actor",
        header: t("Common.table.columns.actor"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.actorLabel ?? row.original.actorUserId ?? "-"}
          </span>
        ),
      },
      {
        id: "workspace",
        header: t("Common.table.columns.workspace"),
        cell: ({ row }) => <span className="text-sm">{row.original.workspaceLabel ?? "-"}</span>,
      },
      {
        id: "target",
        header: t("Common.table.columns.target"),
        cell: ({ row }) =>
          row.original.targetId ? (
            <CopyableChip size="sm" value={row.original.targetId} variant="secondary">
              {row.original.targetId}
            </CopyableChip>
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          ),
      },
      {
        id: "reason",
        header: t("Common.table.columns.reason"),
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.reason ?? "-"}</span>,
      },
    ],
    [dateTime, t],
  );
}
