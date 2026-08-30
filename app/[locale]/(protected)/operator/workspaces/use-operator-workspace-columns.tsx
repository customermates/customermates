"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { OperatorWorkspaceRowDto } from "@/ee/operator/operator-lists.schema";

import { useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { PlanChip, SubscriptionChip } from "../operator-value-labels";

export function useOperatorWorkspaceColumns(): ColumnDef<OperatorWorkspaceRowDto>[] {
  const format = useFormatter();
  const t = useTranslations();

  const dateTime = (value: Date) =>
    format.dateTime(new Date(value), { dateStyle: "short", timeStyle: "short", timeZone: "UTC" });

  return useMemo<ColumnDef<OperatorWorkspaceRowDto>[]>(
    () => [
      {
        id: "workspace",
        header: t("OperatorWorkspaces.columns.workspace"),
        cell: ({ row }) => <span className="text-sm font-medium">{row.original.workspaceLabel}</span>,
      },
      {
        id: "owner",
        header: t("OperatorWorkspaces.columns.owner"),
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.ownerEmail ?? "-"}</span>,
      },
      {
        id: "plan",
        header: t("OperatorWorkspaces.columns.plan"),
        cell: ({ row }) => <PlanChip plan={row.original.plan} />,
      },
      {
        id: "subscription",
        header: t("OperatorWorkspaces.columns.subscription"),
        cell: ({ row }) => <SubscriptionChip status={row.original.subscriptionStatus} />,
      },
      {
        id: "members",
        header: t("OperatorWorkspaces.columns.members"),
        cell: ({ row }) => (
          <span className="text-sm">
            {t("OperatorWorkspaces.values.members", {
              active: row.original.activeUserCount,
              total: row.original.userCount,
            })}
          </span>
        ),
      },
      {
        id: "allowance",
        header: t("OperatorWorkspaces.columns.allowance"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.enterpriseCreditsPerUser ?? "-"}</span>
        ),
      },
      {
        accessorKey: "createdAt",
        id: "createdAt",
        header: t("OperatorWorkspaces.columns.createdAt"),
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{dateTime(row.original.createdAt)}</span>,
      },
    ],
    [dateTime, t],
  );
}
