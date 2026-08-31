"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import type { OperatorWorkspaceRowDto } from "@/ee/operator/operator-lists.schema";

import { useFormatter, useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";

import { correctOperatorSubscriptionSnapshotAction } from "../users/actions";
import { OperatorChipSelect } from "../operator-chip-select";
import { useOperatorChipOptions } from "../use-operator-chip-options";
import { OperatorWorkspaceAllowancePopover } from "./operator-workspace-allowance-popover";

export function useOperatorWorkspaceColumns(): ColumnDef<OperatorWorkspaceRowDto>[] {
  const format = useFormatter();
  const t = useTranslations();
  const options = useOperatorChipOptions();
  const router = useRouter();

  const dateTime = (value: Date) =>
    format.dateTime(new Date(value), { dateStyle: "short", timeStyle: "short", timeZone: "UTC" });
  const refresh = () => router.refresh();
  const confirmTitle = t("OperatorConsole.confirm.title");
  const correctable = (workspace: OperatorWorkspaceRowDto) =>
    Boolean(workspace.ownerUserId && workspace.subscriptionUpdatedAt);

  return [
    {
      id: "workspace",
      header: t("Common.table.columns.workspace"),
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.workspaceLabel}</span>,
    },
    {
      id: "owner",
      header: t("Common.table.columns.owner"),
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.ownerEmail ?? "-"}</span>,
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
          readOnly={!correctable(row.original)}
          value={row.original.plan}
          onCommit={(value, operationId) =>
            correctOperatorSubscriptionSnapshotAction({
              userId: row.original.ownerUserId ?? "",
              expectedUpdatedAt: new Date(row.original.subscriptionUpdatedAt ?? 0).toISOString(),
              plan: value as SubscriptionPlan,
              status: row.original.subscriptionStatus as SubscriptionStatus,
              quantity: row.original.seats,
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
          readOnly={!correctable(row.original)}
          value={row.original.subscriptionStatus}
          onCommit={(value, operationId) =>
            correctOperatorSubscriptionSnapshotAction({
              userId: row.original.ownerUserId ?? "",
              expectedUpdatedAt: new Date(row.original.subscriptionUpdatedAt ?? 0).toISOString(),
              plan: row.original.plan as SubscriptionPlan,
              status: value as SubscriptionStatus,
              quantity: row.original.seats,
              operationId,
            })
          }
          onCommitted={refresh}
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
      cell: ({ row }) => <OperatorWorkspaceAllowancePopover workspace={row.original} onCommitted={refresh} />,
    },
    {
      id: "createdAt",
      header: t("Common.table.columns.createdAt"),
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{dateTime(row.original.createdAt)}</span>,
    },
  ];
}
