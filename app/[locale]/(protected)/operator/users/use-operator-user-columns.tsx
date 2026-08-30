"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { OperatorUserRowDto } from "@/ee/operator/operator-lists.schema";

import { useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { AccountStatusChip, OperatorChip, PlanChip, SubscriptionChip } from "../operator-value-labels";

export function useOperatorUserColumns(): ColumnDef<OperatorUserRowDto>[] {
  const format = useFormatter();
  const t = useTranslations();

  const dateTime = (value: Date) =>
    format.dateTime(new Date(value), { dateStyle: "short", timeStyle: "short", timeZone: "UTC" });

  return useMemo<ColumnDef<OperatorUserRowDto>[]>(
    () => [
      {
        id: "name",
        header: t("Common.table.columns.name"),
        cell: ({ row }) => (
          <span className="text-sm font-medium">
            {`${row.original.firstName} ${row.original.lastName}`.trim() || row.original.email}
          </span>
        ),
      },
      {
        id: "email",
        header: t("Common.table.columns.email"),
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.email}</span>,
      },
      {
        id: "workspace",
        header: t("Common.table.columns.workspace"),
        cell: ({ row }) => <span className="text-sm">{row.original.workspaceLabel}</span>,
      },
      {
        id: "status",
        header: t("Common.table.columns.status"),
        cell: ({ row }) => <AccountStatusChip status={row.original.status} />,
      },
      {
        id: "plan",
        header: t("Common.table.columns.plan"),
        cell: ({ row }) => <PlanChip plan={row.original.plan} />,
      },
      {
        id: "subscription",
        header: t("Common.table.columns.subscription"),
        cell: ({ row }) => <SubscriptionChip status={row.original.subscriptionStatus} />,
      },
      {
        id: "operator",
        header: t("Common.table.columns.operator"),
        cell: ({ row }) => <OperatorChip isPlatformOperator={row.original.isPlatformOperator} />,
      },
      {
        id: "lastActiveAt",
        header: t("Common.table.columns.lastActiveAt"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.lastActiveAt ? dateTime(row.original.lastActiveAt) : t("OperatorUsers.values.never")}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        id: "createdAt",
        header: t("Common.table.columns.createdAt"),
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{dateTime(row.original.createdAt)}</span>,
      },
    ],
    [dateTime, t],
  );
}
