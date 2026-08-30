"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { OperatorAuditRowDto } from "@/ee/operator/operator-lists.schema";

import { useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { AuditSourceChip } from "../operator-value-labels";

function shortId(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`;
}

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
        header: t("OperatorAudit.columns.createdAt"),
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{dateTime(row.original.createdAt)}</span>,
      },
      {
        id: "source",
        header: t("OperatorAudit.columns.source"),
        cell: ({ row }) => <AuditSourceChip source={row.original.source} />,
      },
      {
        id: "action",
        header: t("OperatorAudit.columns.action"),
        cell: ({ row }) => <span className="text-sm">{row.original.action}</span>,
      },
      {
        id: "actor",
        header: t("OperatorAudit.columns.actor"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.actorLabel ?? (row.original.actorUserId ? shortId(row.original.actorUserId) : "-")}
          </span>
        ),
      },
      {
        id: "workspace",
        header: t("OperatorAudit.columns.workspace"),
        cell: ({ row }) => <span className="text-sm">{row.original.workspaceLabel ?? "-"}</span>,
      },
      {
        id: "target",
        header: t("OperatorAudit.columns.target"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.targetId ? shortId(row.original.targetId) : "-"}
          </span>
        ),
      },
      {
        id: "reason",
        header: t("OperatorAudit.columns.reason"),
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.reason ?? "-"}</span>,
      },
    ],
    [dateTime, t],
  );
}
