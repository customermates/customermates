"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import type { OperatorUserRowDto } from "@/ee/operator/operator-lists.schema";

import { useFormatter, useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";

import { OperatorChipSelect } from "../operator-chip-select";
import { PLATFORM_ACCESS_GRANTED, useOperatorChipOptions } from "../use-operator-chip-options";
import { OperatorUserCreditsPopover } from "./operator-user-credits-popover";
import {
  correctOperatorSubscriptionSnapshotAction,
  updateOperatorUserPlatformAccessAction,
  updateOperatorUserStatusAction,
} from "./actions";

function displayName(user: OperatorUserRowDto): string {
  return `${user.firstName} ${user.lastName}`.trim() || user.email;
}

export function useOperatorUserColumns(): ColumnDef<OperatorUserRowDto>[] {
  const format = useFormatter();
  const t = useTranslations();
  const options = useOperatorChipOptions();
  const router = useRouter();

  const dateTime = (value: Date) =>
    format.dateTime(new Date(value), { dateStyle: "short", timeStyle: "short", timeZone: "UTC" });
  const refresh = () => router.refresh();
  const confirmTitle = t("OperatorConsole.confirm.title");

  return [
    {
      id: "name",
      header: t("Common.table.columns.name"),
      cell: ({ row }) => <span className="text-sm font-medium">{displayName(row.original)}</span>,
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
            updateOperatorUserStatusAction({
              userId: row.original.id,
              expectedUpdatedAt: new Date(row.original.updatedAt).toISOString(),
              status: value as Status,
              operationId,
            })
          }
          onCommitted={refresh}
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
            correctOperatorSubscriptionSnapshotAction({
              userId: row.original.id,
              expectedUpdatedAt: new Date(row.original.subscriptionUpdatedAt ?? 0).toISOString(),
              plan: value as SubscriptionPlan,
              status: row.original.subscriptionStatus as SubscriptionStatus,
              quantity: row.original.subscriptionQuantity,
              operationId,
            })
          }
          onCommitted={refresh}
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
            correctOperatorSubscriptionSnapshotAction({
              userId: row.original.id,
              expectedUpdatedAt: new Date(row.original.subscriptionUpdatedAt ?? 0).toISOString(),
              plan: row.original.plan as SubscriptionPlan,
              status: value as SubscriptionStatus,
              quantity: row.original.subscriptionQuantity,
              operationId,
            })
          }
          onCommitted={refresh}
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
            updateOperatorUserPlatformAccessAction({
              userId: row.original.id,
              expectedUpdatedAt: new Date(row.original.updatedAt).toISOString(),
              isPlatformOperator: value === PLATFORM_ACCESS_GRANTED,
              operationId,
            })
          }
          onCommitted={refresh}
        />
      ),
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
      id: "createdAt",
      header: t("Common.table.columns.createdAt"),
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{dateTime(row.original.createdAt)}</span>,
    },
    {
      id: "credits",
      header: t("Common.table.columns.credits"),
      cell: ({ row }) => <OperatorUserCreditsPopover user={row.original} onCommitted={refresh} />,
    },
  ];
}
