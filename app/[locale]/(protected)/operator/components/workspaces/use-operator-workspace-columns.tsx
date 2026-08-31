"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import type { OperatorWorkspaceRowDto } from "@/ee/operator/operator-lists.schema";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { OperatorChipSelect } from "../operator-chip-select";
import { useOperatorChipOptions } from "../use-operator-chip-options";
import { OperatorWorkspaceAllowancePopover } from "./operator-workspace-allowance-popover";

export function useOperatorWorkspaceColumns(): ColumnDef<OperatorWorkspaceRowDto>[] {
  const { operatorWorkspacesStore } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const t = useTranslations();
  const options = useOperatorChipOptions();
  const confirmTitle = t("OperatorConsole.confirm.title");

  return useMemo<ColumnDef<OperatorWorkspaceRowDto>[]>(
    () => [
      {
        id: "workspace",
        header: t("Common.table.columns.workspace"),
        cell: ({ row }) => <span className="text-sm font-medium">{row.original.workspaceLabel}</span>,
      },
      {
        id: "owner",
        header: t("Common.table.columns.owner"),
        cell: ({ row }) => <span className="text-sm">{row.original.ownerEmail ?? "-"}</span>,
      },
      {
        id: "plan",
        header: t("Common.table.columns.plan"),
        cell: ({ row }) => (
          <OperatorChipSelect
            confirmMessage={(option) =>
              t("OperatorConsole.confirm.plan", { name: row.original.workspaceLabel, value: option.label })
            }
            confirmTitle={confirmTitle}
            emptyLabel={t("OperatorUsers.values.noSubscription")}
            options={options.plan}
            readOnly={!row.original.ownerUserId || !row.original.subscriptionUpdatedAt}
            value={row.original.plan}
            onCommit={(value, operationId) =>
              operatorWorkspacesStore.correctSubscription({
                userId: row.original.ownerUserId ?? "",
                expectedUpdatedAt: (row.original.subscriptionUpdatedAt ?? new Date(0)).toISOString(),
                plan: value as SubscriptionPlan,
                status: row.original.subscriptionStatus as SubscriptionStatus,
                quantity: row.original.seats,
                operationId,
              })
            }
          />
        ),
      },
      {
        id: "subscription",
        header: t("Common.table.columns.subscription"),
        cell: ({ row }) => (
          <OperatorChipSelect
            confirmMessage={(option) =>
              t("OperatorConsole.confirm.subscription", { name: row.original.workspaceLabel, value: option.label })
            }
            confirmTitle={confirmTitle}
            emptyLabel={t("OperatorUsers.values.noSubscription")}
            options={options.subscription}
            readOnly={!row.original.ownerUserId || !row.original.subscriptionUpdatedAt}
            value={row.original.subscriptionStatus}
            onCommit={(value, operationId) =>
              operatorWorkspacesStore.correctSubscription({
                userId: row.original.ownerUserId ?? "",
                expectedUpdatedAt: (row.original.subscriptionUpdatedAt ?? new Date(0)).toISOString(),
                plan: row.original.plan as SubscriptionPlan,
                status: value as SubscriptionStatus,
                quantity: row.original.seats,
                operationId,
              })
            }
          />
        ),
      },
      {
        id: "members",
        header: t("Common.table.columns.members"),
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
        header: t("Common.table.columns.allowance"),
        cell: ({ row }) => <OperatorWorkspaceAllowancePopover workspace={row.original} />,
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
    [confirmTitle, intlStore, operatorWorkspacesStore, options, t],
  );
}
