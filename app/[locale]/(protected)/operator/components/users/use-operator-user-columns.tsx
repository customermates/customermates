"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import type { OperatorUserRowDto } from "@/ee/operator/operator-lists.schema";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { OperatorChipSelect } from "../operator-chip-select";
import { PLATFORM_ACCESS_GRANTED, useOperatorChipOptions } from "../use-operator-chip-options";
import { OperatorUserCreditsPopover } from "./operator-user-credits-popover";

function displayName(user: OperatorUserRowDto): string {
  return `${user.firstName} ${user.lastName}`.trim() || user.email;
}

export function useOperatorUserColumns(): ColumnDef<OperatorUserRowDto>[] {
  const { operatorUsersStore } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const t = useTranslations();
  const options = useOperatorChipOptions();
  const confirmTitle = t("OperatorConsole.confirm.title");

  return useMemo<ColumnDef<OperatorUserRowDto>[]>(
    () => [
      {
        id: "name",
        header: t("Common.table.columns.name"),
        cell: ({ row }) => <span className="text-sm font-medium">{displayName(row.original)}</span>,
      },
      {
        id: "email",
        header: t("Common.table.columns.email"),
        cell: ({ row }) => <span className="text-sm">{row.original.email}</span>,
      },
      {
        id: "workspace",
        header: t("Common.table.columns.workspace"),
        cell: ({ row }) => <span className="text-sm">{row.original.workspaceLabel}</span>,
      },
      {
        id: "status",
        header: t("Common.table.columns.status"),
        cell: ({ row }) => (
          <OperatorChipSelect
            confirmMessage={(option) =>
              t("OperatorUsers.confirm.status", { name: displayName(row.original), value: option.label })
            }
            confirmTitle={confirmTitle}
            emptyLabel="-"
            options={options.accountStatus}
            value={row.original.status}
            onCommit={(value, operationId) =>
              operatorUsersStore.updateStatus({
                userId: row.original.id,
                expectedUpdatedAt: row.original.updatedAt.toISOString(),
                status: value as Status,
                operationId,
              })
            }
          />
        ),
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
            readOnly={!row.original.subscriptionUpdatedAt}
            value={row.original.plan}
            onCommit={(value, operationId) =>
              operatorUsersStore.correctSubscription({
                userId: row.original.id,
                expectedUpdatedAt: (row.original.subscriptionUpdatedAt ?? new Date(0)).toISOString(),
                plan: value as SubscriptionPlan,
                status: row.original.subscriptionStatus as SubscriptionStatus,
                quantity: row.original.subscriptionQuantity,
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
            readOnly={!row.original.subscriptionUpdatedAt}
            value={row.original.subscriptionStatus}
            onCommit={(value, operationId) =>
              operatorUsersStore.correctSubscription({
                userId: row.original.id,
                expectedUpdatedAt: (row.original.subscriptionUpdatedAt ?? new Date(0)).toISOString(),
                plan: row.original.plan as SubscriptionPlan,
                status: value as SubscriptionStatus,
                quantity: row.original.subscriptionQuantity,
                operationId,
              })
            }
          />
        ),
      },
      {
        id: "operator",
        header: t("Common.table.columns.operator"),
        cell: ({ row }) => (
          <OperatorChipSelect
            confirmMessage={(option) =>
              t("OperatorUsers.confirm.operator", { name: displayName(row.original), value: option.label })
            }
            confirmTitle={confirmTitle}
            emptyLabel="-"
            options={options.platformAccess}
            value={String(row.original.isPlatformOperator)}
            onCommit={(value, operationId) =>
              operatorUsersStore.updatePlatformAccess({
                userId: row.original.id,
                expectedUpdatedAt: row.original.updatedAt.toISOString(),
                isPlatformOperator: value === PLATFORM_ACCESS_GRANTED,
                operationId,
              })
            }
          />
        ),
      },
      {
        accessorKey: "lastActiveAt",
        id: "lastActiveAt",
        header: t("Common.table.columns.lastActiveAt"),
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.lastActiveAt
              ? intlStore.formatNumericalShortDateTime(row.original.lastActiveAt)
              : t("Common.never")}
          </span>
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
      {
        id: "credits",
        header: t("Common.table.columns.credits"),
        cell: ({ row }) => <OperatorUserCreditsPopover user={row.original} />,
      },
    ],
    [confirmTitle, intlStore, operatorUsersStore, options, t],
  );
}
